import { Material, QuotationItem } from '../../src/types';
import { PricingError } from '../pricingValidation';

/** A finished outsourced configuration sold by lot. Does not enter ROLL/SHEET pricing. */
export function priceFuturaVisualItem(material: Material, source: Partial<QuotationItem>) {
  if (!material.active || material.controlType !== 'UNIT' || !material.futuraImportId) throw new PricingError('Produto Futura de comunicação visual indisponível.');
  if (source.serviceGroup && source.serviceGroup !== 'VISUAL_COMMUNICATION') throw new PricingError('Grupo incompatível com o produto Futura.');
  const quantity = source.quantity;
  if (!Number.isSafeInteger(quantity) || quantity <= 0 || quantity > 1000000) throw new PricingError('Informe uma quantidade inteira de lotes.');
  const cents = Math.round(material.salePrice * 100);
  if (!Number.isSafeInteger(cents) || cents < 0 || Math.abs(material.salePrice * 100 - cents) > 0.00001) throw new PricingError('Preço cadastrado inválido.');
  const total = BigInt(cents) * BigInt(quantity);
  if (total > 999999999999n) throw new PricingError('Valor do item excede o limite permitido.');
  return { item: { id: source.id ?? '', position: source.position ?? 1, serviceId: material.id, materialId: material.id,
    futuraImportId: material.futuraImportId, serviceName: material.name, materialName: material.name, description: material.description,
    serviceGroup: 'VISUAL_COMMUNICATION', quantity, widthCm: 0, heightCm: 0, allowances: {}, orientation: 'AUTO',
    finishings: [], isGraphic: false, isGraphicSnapshot: false, calculationType: 'UNIT',
    servicePriceSnapshot: material.salePrice, unitPriceSnapshot: material.salePrice, baseValue: Number(total) / 100,
    finishingTotal: 0, subtotal: Number(total) / 100, discountType: 'NONE', discountInputValue: 0, discountEffectiveAmount: 0,
  } as QuotationItem };
}
