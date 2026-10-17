import { GraphicProduct, GraphicPricingSnapshot } from '../src/types/graphicProduct';
import { QuotationItem } from '../src/types';
import { PricingError, numberInput } from './pricingValidation';

function integer(value: unknown, label: string) {
  const n = numberInput(value, label);
  if (!Number.isSafeInteger(n) || n <= 0) throw new PricingError(`${label} deve ser um inteiro maior que zero.`);
  return n;
}
function cents(value: unknown, label: string) {
  const n = numberInput(value, label);
  const c = Math.round(n * 100);
  if (!Number.isSafeInteger(c) || Math.abs(n * 100 - c) > 0.00001) throw new PricingError(`${label} deve ter no máximo duas casas decimais e estar dentro do limite monetário.`);
  return c;
}
function unique(values: number[], label: string) {
  if (new Set(values).size !== values.length) throw new PricingError(`${label}: quantidades duplicadas.`);
}
export function validateGraphicProduct(source: GraphicProduct): GraphicProduct {
  if (!source || source.serviceGroup !== 'GRAPHIC_PRODUCTS') throw new PricingError('Grupo do produto inválido.');
  if (typeof source.name !== 'string' || !source.name.trim()) throw new PricingError('Informe o nome do produto.');
  if (typeof source.active !== 'boolean') throw new PricingError('Status inválido.');
  const p: GraphicProduct = { id: source.id, revision: source.revision, serviceGroup: 'GRAPHIC_PRODUCTS', name: source.name.trim(), active: source.active, pricingMethod: source.pricingMethod, code: '', category: '', description: '', specification: '' };
  for (const key of ['code', 'category', 'description', 'specification'] as const) {
    if (source[key] !== undefined && typeof source[key] !== 'string') throw new PricingError(`${key} inválido.`);
    p[key] = source[key]?.trim() ?? '';
  }
  if (p.pricingMethod === 'UNIT_PRICE' || p.pricingMethod === 'BASE_BATCH_WITH_QUANTITY_DISCOUNT') {
    p.baseQuantity = integer(source.baseQuantity, 'Quantidade base');
    p.baseBatchPrice = cents(source.baseBatchPrice, 'Preço do lote base') / 100;
    p.baseUnitPrice = p.baseBatchPrice / p.baseQuantity;
    if (p.pricingMethod === 'BASE_BATCH_WITH_QUANTITY_DISCOUNT') {
      if (typeof source.discountsEnabled !== 'boolean') throw new PricingError('Informe se o desconto está habilitado.');
      if (!Array.isArray(source.quantityDiscounts)) throw new PricingError('Faixas de desconto inválidas.');
      p.discountsEnabled = source.discountsEnabled;
      p.quantityDiscounts = source.quantityDiscounts.map(t => {
        if (!t) throw new PricingError('Faixa inválida.');
        const percentage = cents(t.percentage, 'Percentual') / 100;
        if (percentage > 100) throw new PricingError('Desconto deve estar entre 0 e 100%.');
        return { minimumQuantity: integer(t.minimumQuantity, 'Quantidade da faixa'), percentage };
      }).sort((a, b) => a.minimumQuantity - b.minimumQuantity);
      unique(p.quantityDiscounts.map(t => t.minimumQuantity), 'Faixas');
    }
  } else if (p.pricingMethod === 'QUANTITY_PRICE_TABLE') {
    if (!Array.isArray(source.priceTable) || !source.priceTable.length) throw new PricingError('Adicione pelo menos um preço à tabela.');
    p.priceTable = source.priceTable.map(t => {
      if (!t) throw new PricingError('Linha da tabela inválida.');
      return { quantity: integer(t.quantity, 'Quantidade da tabela'), batchPrice: cents(t.batchPrice, 'Preço do lote') / 100 };
    }).sort((a, b) => a.quantity - b.quantity);
    unique(p.priceTable.map(t => t.quantity), 'Tabela');
  } else throw new PricingError('Método de preço inválido.');
  return p;
}

// Integer rational arithmetic: round only monetary totals, never the derived unit price.
function rounded(n: bigint, d: bigint) { return (n + d / 2n) / d; }
function money(n: bigint) {
  if (n > BigInt(Number.MAX_SAFE_INTEGER)) throw new PricingError('Valor calculado excede o limite monetário.');
  return Number(n) / 100;
}
export function priceGraphicItem(stored: GraphicProduct, source: Partial<QuotationItem>) {
  const p = validateGraphicProduct(stored);
  if (!p.active) throw new PricingError('Produto gráfico inativo.');
  const q = integer(source.quantity, 'Quantidade solicitada');
  let gross: bigint;
  let discount = 0n;
  const snapshot: GraphicPricingSnapshot = { serviceGroup: 'GRAPHIC_PRODUCTS', productId: p.id, productRevision: p.revision, specification: p.specification, pricingMethod: p.pricingMethod, requestedQuantity: q, grossTotal: 0, discountPercentage: 0, discountValue: 0, finalUnitPrice: 0, finalTotal: 0 };
  if (p.pricingMethod === 'QUANTITY_PRICE_TABLE') {
    const row = p.priceTable!.find(t => t.quantity === q);
    if (!row) throw new PricingError(`Não há preço configurado para ${q.toLocaleString('pt-BR')} unidades.`);
    gross = BigInt(cents(row.batchPrice, 'Preço'));
    snapshot.selectedPriceTableEntry = row;
  } else {
    snapshot.baseQuantity = p.baseQuantity;
    snapshot.baseBatchPrice = p.baseBatchPrice;
    snapshot.baseUnitPrice = p.baseUnitPrice;
    gross = rounded(BigInt(cents(p.baseBatchPrice, 'Preço')) * BigInt(q), BigInt(p.baseQuantity!));
    if (p.pricingMethod === 'BASE_BATCH_WITH_QUANTITY_DISCOUNT' && p.discountsEnabled) {
      const tier = p.quantityDiscounts!.filter(t => t.minimumQuantity <= q).at(-1);
      if (tier) {
        snapshot.discountTier = tier;
        snapshot.discountPercentage = tier.percentage;
        discount = rounded(gross * BigInt(Math.round(tier.percentage * 100)), 10000n);
      }
    }
  }
  snapshot.grossTotal = money(gross);
  snapshot.discountValue = money(discount);
  snapshot.finalTotal = money(gross - discount);
  snapshot.finalUnitPrice = snapshot.finalTotal / q;
  // Whitelist: roll state, browser prices and manual discounts never enter this strategy.
  const item: QuotationItem = {
    id: source.id ?? '', quotationId: source.quotationId, position: source.position ?? 1,
    description: source.description ?? p.description, notes: source.notes,
    serviceGroup: 'GRAPHIC_PRODUCTS', graphicProductId: p.id, graphicSnapshot: snapshot,
    serviceId: p.id, serviceName: p.name, quantity: q, widthCm: 0, heightCm: 0,
    allowances: {}, orientation: 'AUTO', finishings: [], isGraphic: true, isGraphicSnapshot: true, calculationType: 'UNIT',
    servicePriceSnapshot: snapshot.baseUnitPrice ?? snapshot.finalUnitPrice, unitPriceSnapshot: snapshot.finalUnitPrice,
    baseValue: snapshot.grossTotal, finishingTotal: 0, subtotalBeforeDiscount: snapshot.grossTotal,
    discountType: 'NONE', discountInputValue: 0, discountEffectiveAmount: snapshot.discountValue, subtotal: snapshot.finalTotal,
  };
  return { item, graphicCalculation: snapshot };
}
