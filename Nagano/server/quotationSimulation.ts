import type { FinishOption, Material, QuotationItem, Service } from '../src/types';
import type { SimulationConfig, SimulationResult } from '../src/types/quotationSimulation';
import { calculateSimulationLayout } from '../src/utils/simulationLayout';
import { calculateItemFinishing } from '../src/utils/calculationEngine';
import { materialCalculationRules } from '../src/utils/materialCalculation';
import { numberInput, PricingError } from './pricingValidation';

const money = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;
export function priceSimulationItem(material: Material, source: Partial<QuotationItem>, service?:Service) {
  if (!material.active || material.futuraImportId) throw new PricingError('Selecione um material ativo de produção própria.');
  const mode = material.controlType ?? (material.availableRolls?.length ? 'ROLL' : 'SHEET');
  if (mode !== 'ROLL' && mode !== 'SHEET') throw new PricingError('Selecione uma folha/chapa ou bobina.');
  const raw = source.simulationSnapshot?.config;
  if (!raw || typeof raw.allowRotation !== 'boolean') throw new PricingError('Configuração da simulação inválida.');
  const rules = materialCalculationRules(material);
  const config: SimulationConfig = {
    areaWidthCm: numberInput(raw.areaWidthCm, 'Largura da área'), areaHeightCm: numberInput(raw.areaHeightCm, 'Altura da área'),
    marginCm: numberInput(raw.marginCm, 'Margem', 0), gapCm: numberInput(raw.gapCm, 'Espaçamento', 0),
    bleedCm: numberInput(raw.bleedCm, 'Sangria', 0), allowRotation: raw.allowRotation && (material.allowRotation ?? material.rollConfiguration?.allowRotation ?? true),
  };
  if (mode === 'ROLL' && !rules.availableRolls.some(r => r.active && Math.abs(r.widthCm - config.areaWidthCm) < 1e-6)) {
    throw new PricingError('Escolha uma largura de bobina cadastrada e ativa para este material.');
  }
  const widthCm = numberInput(source.widthCm, 'Largura da arte');
  const heightCm = numberInput(source.heightCm, 'Altura da arte');
  const quantity = numberInput(source.quantity, 'Quantidade');
  if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 10000000) throw new PricingError('Quantidade deve ser inteira, entre 1 e 10.000.000.');
  let layout;
  try { layout = calculateSimulationLayout(widthCm, heightCm, config); }
  catch (error) { throw new PricingError(error instanceof Error ? error.message : 'Não foi possível calcular o encaixe.'); }
  const blocks = Math.ceil(quantity / layout.capacity);
  const fullBlocks = Math.floor(quantity / layout.capacity);
  const remaining = quantity % layout.capacity;
  const partialRows = Math.ceil(remaining / layout.columns);
  const usedLengthM = mode === 'ROLL' ? (fullBlocks * (layout.occupiedHeightCm + 2 * config.marginCm)
    + (partialRows ? partialRows * (layout.pieceHeightCm + config.gapCm) - config.gapCm + 2 * config.marginCm : 0)) / 100 : 0;
  const consumedAreaM2 = mode === 'SHEET' ? blocks * config.areaWidthCm * config.areaHeightCm / 10000 : config.areaWidthCm / 100 * usedLengthM;
  const unit = material.calculationUnit;
  const pricingUnit = mode === 'SHEET' && (unit === 'SHEET' || unit === 'UNIT') ? 'SHEET'
    : mode === 'ROLL' && (unit === 'LINEAR_METER' || (!unit && ['POR_METRO_LINEAR', 'PER_LINM'].includes(material.pricingMethod ?? ''))) ? 'LINEAR_METER' : 'M2';
  if (mode === 'SHEET' && unit === 'LINEAR_METER') throw new PricingError('Configure o preço deste material por folha/chapa ou por m².');
  const rate = numberInput(material.salePrice ?? (pricingUnit === 'LINEAR_METER' ? material.sellingPriceLinm : material.sellingPriceSqm), 'Preço de venda do material');
  if (rate <= 0) throw new PricingError('Cadastre um preço de venda maior que zero para este material.');
  const consumption = pricingUnit === 'SHEET' ? blocks : pricingUnit === 'LINEAR_METER' ? usedLengthM : consumedAreaM2;
  const gross = money(consumption * rate);
  const tier = rules.volumeDiscountTiers.filter(t => t.active !== false && Number.isFinite(t.minimumArea) && t.minimumArea >= 0 && t.minimumArea <= consumedAreaM2 + 1e-9)
    .sort((a, b) => b.minimumArea - a.minimumArea)[0];
  const volumeDiscountPercentage = tier ? Math.max(0, Math.min(100, Number(tier.percentage) || 0)) : 0;
  const minimumCharge = numberInput(material.minimumCharge, 'Valor mínimo do material', 0);
  const setup = numberInput(service?.setupFee,'Preparação do serviço',0);
  const baseValue = money(Math.max(minimumCharge, gross * (1 - volumeDiscountPercentage / 100) + setup));
  const minimumChargeApplied = baseValue > money(gross * (1 - volumeDiscountPercentage / 100) + setup);
  const finishings = (source.finishings ?? []).map(fin => {
    if (!['FIXED', 'PER_UNIT', 'PER_METER', 'PER_SQM', 'PER_SIDE', 'PERCENTAGE'].includes(fin.costType)) throw new PricingError('Tipo de acabamento inválido.');
    const rate = numberInput(fin.unitPriceSnapshot, 'Preço do acabamento');
    const definition = { id: fin.finishingId, name: fin.finishingName, costType: fin.costType,
      minimumCharge: numberInput(fin.minimumChargeSnapshot, 'Mínimo do acabamento', 0) } as FinishOption;
    return { ...calculateItemFinishing(definition, widthCm, heightCm, quantity, baseValue, rate), id: fin.id, notes: fin.notes };
  });
  const finishingTotal = money(finishings.reduce((sum, fin) => sum + fin.subtotal, 0));
  const subtotal = money(baseValue + finishingTotal);
  if (![baseValue, subtotal, consumedAreaM2, usedLengthM].every(Number.isFinite) || subtotal > 1e12) throw new PricingError('O valor excede o limite de cálculo.');
  const item: QuotationItem = {
    ...source, id: source.id ?? 'simulation', serviceId: source.serviceId || 'simulation', serviceName: source.serviceName?.trim() || 'Adesivos / peças',
    serviceGroup: 'VISUAL_COMMUNICATION', materialId: material.id, materialName: material.name,
    widthCm, heightCm, quantity, orientation: layout.rotated ? 'VERTICAL' : 'HORIZONTAL', position: source.position ?? 1,
    allowances: { reinforcementCm: 0, hemCm: 0, rodPocketCm: 0, bleedCm: config.bleedCm, edgeSafetyCm: config.marginCm },
    isGraphic: false, isGraphicSnapshot: false, calculationType: mode === 'ROLL' ? 'ROLL' : 'UNIT',
    servicePriceSnapshot: rate, unitPriceSnapshot: rate, baseValue, finishingTotal, finishings,
    subtotalBeforeDiscount: money(Math.max(minimumCharge, gross + setup) + finishingTotal),
    discountType: 'NONE', discountInputValue: 0, discountEffectiveAmount: money(Math.max(0, Math.max(minimumCharge, gross + setup) - baseValue)), subtotal,
    simulationSnapshot: { config, layout, mode, blocks, consumedAreaM2, usedLengthM, pricingUnit, rate, volumeDiscountPercentage, minimumChargeApplied },
  };
  // These snapshots belong to the previous calculators and must not describe a simulation.
  delete item.calculationSnapshot; delete item.recommendedSnapshot; delete item.graphicSnapshot; delete item.graphicProductId;
  delete item.selectedRollWidthCm; delete item.selectedOrientation; delete item.recommendedRollWidthCm; delete item.recommendedOrientation;
  return { item };
}

export function simulateQuotation(material: Material, source: Partial<QuotationItem>, quantities?: unknown, service?:Service): SimulationResult {
  const initial = priceSimulationItem(material, { ...source, quantity: 1 }, service);
  const layout = initial.item.simulationSnapshot!.layout;
  if (quantities !== undefined && (!Array.isArray(quantities) || quantities.length < 1 || quantities.length > 12)) throw new PricingError('Informe de 1 a 12 quantidades.');
  const requested = quantities === undefined ? [1, 2, 4, 8, 15, 30].map(m => layout.capacity * m) : (quantities as unknown[]).map(q => numberInput(q, 'Quantidade'));
  const items = [...new Set(requested)].sort((a, b) => a - b).map(quantity => priceSimulationItem(material, { ...source, quantity }, service).item);
  const baseline = items[0].subtotal / items[0].quantity;
  const options = items.map(item => {
    const saving = money(Math.max(0, baseline * item.quantity - item.subtotal));
    return { item, quantity: item.quantity, unitPrice: item.subtotal / item.quantity, total: item.subtotal, saving,
      savingPercentage: baseline > 0 ? money(saving / (baseline * item.quantity) * 100) : 0 };
  });
  const cheapest = options.reduce((best, opt) => opt.unitPrice < best.unitPrice - 1e-9 ? opt : best);
  return { success: true, layout, options, lowestUnitPriceQuantity: options.length > 1 && cheapest.unitPrice < baseline - 1e-9 ? cheapest.quantity : undefined };
}
