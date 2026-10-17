import {addComposedFinishings} from './erp/finishingComposition';
import {addStockFinishings} from './erp/finishingPricing';
import { GraphicProduct } from '../src/types/graphicProduct';
import { priceGraphicItem } from './graphicPricing';
import { priceFuturaVisualItem } from './futura/visualPricing';
import { Material, Quotation, QuotationItem, AllowancesConfig, FinishOption, Service } from '../src/types';
import { visualServiceMaterial, priceVisualSheetOrUnit } from './visualPricing';
import { runCalculationEngine, calculateProductionDimensions, calculateItemDiscount, calculateItemFinishing, calculateQuotationTotals } from '../src/utils/calculationEngine';
import { materialCalculationRules } from '../src/utils/materialCalculation';

import { PricingError, numberInput } from './pricingValidation';
import { priceSimulationItem } from './quotationSimulation';
import type { ThirdParty, OutsourcedService } from '../src/types/team';
import { outsourcedCustomerItems } from '../src/utils/outsourcing';
export { PricingError, numberInput } from './pricingValidation';

/** The persisted material, never a browser price or service flag, owns roll pricing. */
export function priceRollItem(material: Material, source: Partial<QuotationItem>, service?: Service) {
  if (material.controlType !== 'ROLL') throw new PricingError('O material selecionado não é do tipo bobina.');
  if (!material.active) throw new PricingError('O material está inativo.');
  const rules = materialCalculationRules(material);
  rules.pricePerSqm = numberInput(material.salePrice ?? material.sellingPriceSqm, 'Preço de venda do material');
  if (source.selectedRollWidthCm !== undefined && !rules.allowManualRollOverride) throw new PricingError('A troca manual está bloqueada para este material.');
  if (source.selectedRollWidthCm !== undefined && (!source.manualSelectionReason || source.manualSelectionReason.trim().length < 3)) throw new PricingError('Informe a justificativa da troca manual.');
  const widthCm = numberInput(source.widthCm, 'Largura');
  const heightCm = numberInput(source.heightCm, 'Altura');
  const quantity = numberInput(source.quantity, 'Quantidade');
  const allowances: AllowancesConfig = { reinforcementCm: 0, hemCm: 0, rodPocketCm: 0, bleedCm: 0, edgeSafetyCm: 0 };
  for (const key of ['reinforcementCm', 'hemCm', 'rodPocketCm', 'bleedCm', 'edgeSafetyCm', 'overflowValueCm', 'leftCm', 'rightCm', 'topCm', 'bottomCm'] as const) {
    if (source.allowances?.[key] !== undefined) allowances[key] = numberInput(source.allowances[key], 'Estouro / folga');
  }
  for (const key of ['overflowLeft', 'overflowRight', 'overflowTop', 'overflowBottom'] as const) {
    if (source.allowances?.[key] !== undefined) {
      if (typeof source.allowances[key] !== 'boolean') throw new PricingError('Seleção de lados inválida.');
      allowances[key] = source.allowances[key];
    }
  }
  const orientation = source.orientation ?? 'AUTO';
  if (!['AUTO', 'HORIZONTAL', 'VERTICAL'].includes(orientation)) throw new PricingError('Orientação inválida.');
  if (source.selectedOrientation !== undefined && !['HORIZONTAL', 'VERTICAL'].includes(source.selectedOrientation)) throw new PricingError('Orientação manual inválida.');
  const calculation = runCalculationEngine({
    ...rules, finishedWidthCm: widthCm, finishedHeightCm: heightCm, quantity,
    requestedOrientation: orientation, allowances, costPerSqm: material.referenceCost ?? material.costPerSqm ?? 0,
    finishingCost: 0, installationCost: 0, designCost: 0, deliveryCost: 0, markupPercentage: 0,
    discountAmount: 0, minimumCharge: service?.minimumCharge ?? 0, setupCharge: service?.setupFee ?? 0, pricingMethod: service?.pricingMethod === 'PER_LINM' ? 'POR_METRO_LINEAR' : 'POR_AREA_CONSUMIDA_BOBINA',
    selectedRollWidthCm: source.selectedRollWidthCm === undefined ? undefined : numberInput(source.selectedRollWidthCm, 'Bobina'),
    selectedOrientation: source.selectedOrientation, manualSelectionReason: source.manualSelectionReason,
  });
  if (!calculation.success || !calculation.recommended) throw new PricingError(calculation.error || 'Não foi possível calcular a bobina.');
  const snap = calculation.recommended;
  // Finishing price snapshots are the existing editable add-ons; totals are recomputed.
  const finishings = (source.finishings ?? []).map(fin => {
    if (!['FIXED', 'PER_UNIT', 'PER_METER', 'PER_SQM', 'PER_SIDE', 'PERCENTAGE'].includes(fin.costType)) throw new PricingError('Tipo de acabamento inválido.');
    const definition = { id: fin.finishingId, name: fin.finishingName, costType: fin.costType, minimumCharge: numberInput(fin.minimumChargeSnapshot, 'Mínimo de acabamento', 0) } as FinishOption;
    return { ...calculateItemFinishing(definition, widthCm, heightCm, quantity, snap.subtotalPrice, numberInput(fin.unitPriceSnapshot, 'Preço do acabamento')), id: fin.id, notes: fin.notes };
  });
  const finishingTotal = Math.round(finishings.reduce((sum, fin) => sum + fin.subtotal, 0) * 100) / 100;
  const discountType = source.discountType ?? 'NONE';
  if (!['NONE', 'PERCENTAGE', 'FIXED_AMOUNT'].includes(discountType)) throw new PricingError('Tipo de desconto inválido.');
  const discountInputValue = numberInput(source.discountInputValue, 'Desconto', 0);
  const manualDiscount = calculateItemDiscount(snap.finalPrice + finishingTotal, discountType, discountInputValue);
  if (!manualDiscount.isValid) throw new PricingError(manualDiscount.errorMessage!);
  const dims = calculateProductionDimensions(widthCm, heightCm, allowances);
  const item = {
    ...source, serviceGroup: 'VISUAL_COMMUNICATION', materialId: material.id, materialName: material.name, widthCm, heightCm, quantity, orientation, allowances,
    ...dims, isGraphic: false, isGraphicSnapshot: false, calculationType: 'ROLL',
    servicePriceSnapshot: rules.pricePerSqm, unitPriceSnapshot: rules.pricePerSqm,
    recommendedRollWidthCm: calculation.recommendedSnapshot!.recommendedRollWidthCm,
    recommendedOrientation: calculation.recommendedSnapshot!.orientation,
    selectedRollWidthCm: snap.selectedRollWidthCm, selectedOrientation: snap.isManualSelection ? snap.orientation : undefined,
    isRollSelectionManual: calculation.isManualSelection,
    calculationSnapshot: snap, recommendedSnapshot: calculation.recommendedSnapshot,
    baseValue: snap.subtotalPrice, finishings, finishingTotal,
    subtotalBeforeDiscount: Math.round((snap.subtotalPrice + finishingTotal) * 100) / 100,
    discountType, discountInputValue,
    discountEffectiveAmount: Math.round(((snap.discountValue ?? 0) + manualDiscount.discountEffectiveAmount) * 100) / 100,
    subtotal: manualDiscount.subtotalAfterDiscount,
  } as QuotationItem;
  return { item, calculation };
}

function calculateBaseQuotationItem(source: Partial<QuotationItem>, getMaterial: (id: string) => Material | undefined, getProduct: (id: string) => GraphicProduct | undefined = () => undefined, getService?: (id:string)=>Service|undefined) {
  const physicalMaterial=getService && source.serviceGroup!=='GRAPHIC_PRODUCTS' && !source.graphicProductId && !getProduct(source.serviceId??'') ? getMaterial(source.materialId??'') : undefined;
  if(getService && source.serviceGroup!=='GRAPHIC_PRODUCTS' && !source.graphicProductId && !physicalMaterial?.futuraImportId && !getProduct(source.serviceId??'')) {
    if(!physicalMaterial)throw new PricingError('Material não encontrado.');
    const service=getService(source.serviceId??'');
    const material=visualServiceMaterial(service,physicalMaterial);
    const item={...source,serviceId:service!.id,serviceName:source.simulationSnapshot&&typeof source.serviceName==='string'?source.serviceName.trim()||service!.name:service!.name};
    if(source.simulationSnapshot){
      if(!['PER_SQM','PER_LINM','POR_AREA_CONSUMIDA_BOBINA'].includes(service!.pricingMethod))throw new PricingError('Escolha um serviço por m² ou metro linear para simular.');
      return priceSimulationItem(material,item,service);
    }
    if(material.controlType==='ROLL' && ['PER_SQM','PER_LINM','POR_AREA_CONSUMIDA_BOBINA'].includes(service!.pricingMethod))return priceRollItem(material,item,service);
    return priceVisualSheetOrUnit(material,item,service!);
  }
  if (source.simulationSnapshot) {
    const material = getMaterial(source.materialId ?? '');
    if (!material) throw new PricingError('Material do item não encontrado.');
    return priceSimulationItem(material, source);
  }
  if (source.serviceGroup && !['GRAPHIC_PRODUCTS', 'VISUAL_COMMUNICATION'].includes(source.serviceGroup)) throw new PricingError('Grupo de serviço inválido.');
  const product = getProduct(source.graphicProductId ?? source.serviceId ?? '');
  if (product || source.graphicProductId || source.serviceGroup === 'GRAPHIC_PRODUCTS') {
    if (!product) throw new PricingError('Produto gráfico não encontrado.');
    if (source.serviceGroup && source.serviceGroup !== product.serviceGroup) throw new PricingError('Grupo incompatível com o produto cadastrado.');
    return priceGraphicItem(product, source);
  }
  const material = getMaterial(source.materialId ?? '');
  if (!material) throw new PricingError('Material do item não encontrado.');
  if (material.futuraImportId) return priceFuturaVisualItem(material, source);
  if (material.controlType === 'ROLL') return priceRollItem(material, source);
  // Compatibility strategy for existing UNIT/SHEET workflows.
  numberInput(source.subtotal, 'Subtotal do item');
  const previousFinishing=numberInput(source.stockFinishingTotal,'Acabamentos anteriores',0)+numberInput(source.composedFinishingTotal,'Composição anterior',0);
  return {item:{...source,subtotal:Math.max(0,Number(source.subtotal)-previousFinishing),finishingTotal:Math.max(0,(source.finishingTotal||0)-previousFinishing),...(source.subtotalBeforeDiscount!==undefined?{subtotalBeforeDiscount:Math.max(0,source.subtotalBeforeDiscount-previousFinishing)}:{})} as QuotationItem};
}

export function calculateQuotationItem(source:Partial<QuotationItem>,getMaterial:(id:string)=>Material|undefined,getProduct:(id:string)=>GraphicProduct|undefined=()=>undefined,getService?:(id:string)=>Service|undefined,getStockItem?:(id:string)=>any,getFinish?:(id:string,version?:string)=>FinishOption|undefined){
  if(source.finishings!==undefined&&(!Array.isArray(source.finishings)||source.finishings.length>100))throw new PricingError('Lista de acabamentos inválida.');
  const base={...source,finishings:(source.finishings||[]).filter(f=>!f.compositionVersion)};
  return addComposedFinishings(addStockFinishings(calculateBaseQuotationItem(base,getMaterial,getProduct,getService),source,getStockItem),source,getFinish);
}
export function priceQuotation(source: Quotation, getMaterial: (id: string) => Material | undefined, getProduct: (id: string) => GraphicProduct | undefined = () => undefined, getService?: (id:string)=>Service|undefined, getThirdParty?: (id:string)=>ThirdParty|undefined,getStockItem?:(id:string)=>any,getFinish?:(id:string,version?:string)=>FinishOption|undefined): Quotation {
  if (!Array.isArray(source.items) || (!source.items.length && !source.outsourcedServices?.length)) throw new PricingError('Adicione pelo menos um item.');
  if(source.outsourcedServices!==undefined&&(!Array.isArray(source.outsourcedServices)||source.outsourcedServices.length>100))throw new PricingError('Serviços de terceiros inválidos.');
  const ids=new Set<string>();
  const outsourcedServices:OutsourcedService[]=(source.outsourcedServices||[]).map(row=>{
    const partner=getThirdParty?.(row.thirdPartyId);
    if(!getThirdParty||!partner||!partner.active)throw new PricingError('Escolha um terceiro ativo cadastrado.');
    if(typeof row.id!=='string'||!row.id||ids.has(row.id))throw new PricingError('Serviço de terceiro inválido.');
    ids.add(row.id);
    if(row.value!==undefined){
      if(!Array.isArray(row.services)||!row.services.length||row.services.length>100||row.services.some(s=>typeof s!=='string'||!partner.services.includes(s)))throw new PricingError('Marque pelo menos um serviço cadastrado para o terceiro.');
      const value=numberInput(row.value,'Valor combinado com o terceiro');
      if(value>10000000)throw new PricingError('Valor do terceiro fora do limite permitido.');
      return {id:row.id,thirdPartyId:partner.id,thirdPartyName:partner.name,services:[...new Set(row.services)],value};
    }
    // Existing quotations keep their original totals until explicitly edited.
    if(typeof row.service!=='string'||!partner.services.includes(row.service)||row.service.length>300)throw new PricingError('Escolha um serviço cadastrado para o terceiro.');
    const quantity=numberInput(row.quantity,'Quantidade do serviço terceirizado');
    if(!Number.isInteger(quantity)||quantity<1||quantity>1000000)throw new PricingError('Informe uma quantidade inteira maior que zero.');
    const cost=numberInput(row.cost,'Custo do terceiro'),salePrice=numberInput(row.salePrice,'Valor de venda do serviço terceirizado');
    if(cost>10000000||salePrice>10000000)throw new PricingError('Valor do terceiro fora do limite permitido.');
    return {id:row.id,thirdPartyId:partner.id,thirdPartyName:partner.name,service:row.service,quantity,cost,salePrice};
  });
  const items = source.items.map(item => calculateQuotationItem(item, getMaterial, getProduct, getService,getStockItem,getFinish).item);
  const charges = Object.fromEntries(['deliveryCost', 'designCost', 'installationCost', 'extraCharges', 'discountAmount'].map(key => [key, numberInput(source[key], key, 0)]));
  const totals = calculateQuotationTotals([...items,...outsourcedCustomerItems(outsourcedServices)], charges.deliveryCost, charges.designCost, charges.installationCost, charges.extraCharges, charges.discountAmount);
  return { ...source, ...charges, items, outsourcedServices, subtotal: totals.subtotal, totalAmount: totals.totalAmount, calculationSnapshot: items[0]?.calculationSnapshot, recommendedSnapshot: items[0]?.recommendedSnapshot };
}

