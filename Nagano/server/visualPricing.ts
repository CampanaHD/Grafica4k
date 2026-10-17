import type { Material, QuotationItem, Service, FinishOption } from '../src/types';
import { calculateProductionDimensions, calculateItemFinishing, calculateItemDiscount } from '../src/utils/calculationEngine';
import { PricingError, numberInput } from './pricingValidation';

export function visualServiceMaterial(service:Service|undefined,material:Material) {
  if (!service || !service.active || service.serviceGroup==='GRAPHIC_PRODUCTS') throw new PricingError('Selecione um serviço ativo de Comunicação Visual.');
  if (!material.active || material.futuraImportId) throw new PricingError('Selecione um material ativo de produção própria.');
  if (service.allowedMaterialIds?.length && !service.allowedMaterialIds.includes(material.id)) throw new PricingError('Este material não está habilitado para o serviço escolhido.');
  const configuredRate=service.pricingMethod==='HOURLY'?service.hourlyRate:service.basePrice;
  if(configuredRate===undefined||configuredRate===null)throw new PricingError('Cadastre o preço do serviço em Configurações → Comunicação Visual.');
  const rate=numberInput(configuredRate,'Preço do serviço');
  return {...material,salePrice:rate,sellingPriceSqm:rate,sellingPriceLinm:rate,
    calculationUnit:service.pricingMethod==='PER_LINM'?'LINEAR_METER' as const:'M2' as const,
    minimumCharge:service.minimumCharge ?? 0, volumeDiscountEnabled:service.volumeDiscountEnabled??false,discountTiers:service.areaDiscountTiers??[],
  };
}
const money=(v:number)=>Math.round((v+Number.EPSILON)*100)/100;
export function priceVisualSheetOrUnit(material:Material,source:Partial<QuotationItem>,service:Service) {
  const quantity=numberInput(source.quantity,'Quantidade');
  if (!Number.isSafeInteger(quantity)||quantity<1||quantity>10000000)throw new PricingError('Informe uma quantidade inteira positiva.');
  const widthCm=numberInput(source.widthCm,'Largura',0),heightCm=numberInput(source.heightCm,'Altura',0);
  const allowances:QuotationItem['allowances']={};
  for(const key of ['reinforcementCm','hemCm','rodPocketCm','bleedCm','edgeSafetyCm'] as const)allowances[key]=numberInput(source.allowances?.[key],key,0);
  const dims=calculateProductionDimensions(widthCm,heightCm,allowances);
  const rate=numberInput(material.salePrice,'Preço do serviço');
  let area=widthCm*heightCm*quantity/10000, sheetSnapshot:QuotationItem['sheetSnapshot'];
  if(material.controlType==='SHEET') {
    if(widthCm<=0||heightCm<=0)throw new PricingError('Informe a largura e a altura da peça.');
    const margin=allowances.edgeSafetyCm??0;
    const candidates=(material.availableSheets??[]).filter(sheet=>sheet.active).flatMap(sheet=>{
      const sheetWidth=numberInput(sheet.widthCm,'Largura da chapa'),sheetHeight=numberInput(sheet.heightCm,'Altura da chapa');
      return [false,true].filter(rotated=>!rotated||(material.allowRotation??true)).map(rotated=>{
        const w=rotated?dims.productionHeightCm:dims.productionWidthCm,h=rotated?dims.productionWidthCm:dims.productionHeightCm;
        const columns=Math.floor((sheetWidth-2*margin+1e-8)/w),rows=Math.floor((sheetHeight-2*margin+1e-8)/h),capacity=Math.max(0,columns)*Math.max(0,rows);
        const sheetsNeeded=capacity?Math.ceil(quantity/capacity):Infinity;
        return {sheetId:sheet.id,sheetName:sheet.name||`${sheetWidth} x ${sheetHeight} cm`,widthCm:sheetWidth,heightCm:sheetHeight,columns,rows,capacity,sheetsNeeded,rotated,consumedAreaM2:sheetsNeeded*sheetWidth*sheetHeight/10000};
      });
    }).filter(option=>option.capacity>0).sort((a,b)=>a.consumedAreaM2-b.consumedAreaM2||a.sheetsNeeded-b.sheetsNeeded);
    if(!candidates.length)throw new PricingError('A peça não cabe nas chapas ativas deste material. Confira as medidas em Bobinas e chapas.');
    sheetSnapshot=candidates[0]; area=sheetSnapshot.consumedAreaM2;
  }
  if(service.pricingMethod==='PER_LINM')throw new PricingError('Cobrança por metro linear requer material em bobina.');
  const gross=service.pricingMethod==='PER_SQM'||service.pricingMethod==='POR_AREA_CONSUMIDA_BOBINA'?area*rate:service.pricingMethod==='FIXED'?rate:quantity*rate;
  const tier=service.volumeDiscountEnabled?(service.areaDiscountTiers??[]).filter(t=>t.active!==false&&t.minimumArea<=area+1e-8).sort((a,b)=>b.minimumArea-a.minimumArea)[0]:undefined;
  const baseValue=money(Math.max(service.minimumCharge??0,gross*(1-(tier?.percentage??0)/100)+(service.setupFee??0)));
  const finishings=(source.finishings??[]).map(fin=>{
    if(!['FIXED','PER_UNIT','PER_METER','PER_SQM','PER_SIDE','PERCENTAGE'].includes(fin.costType))throw new PricingError('Tipo de acabamento inválido.');
    const definition={id:fin.finishingId,name:fin.finishingName,costType:fin.costType,minimumCharge:fin.minimumChargeSnapshot??0} as FinishOption;
    const result=calculateItemFinishing(definition,widthCm,heightCm,quantity,baseValue,numberInput(fin.unitPriceSnapshot,'Preço do acabamento'));
    if(!Number.isFinite(result.subtotal)||result.subtotal<0)throw new PricingError('Acabamento inválido.');
    return {...result,id:fin.id,notes:fin.notes};
  });
  const finishingTotal=money(finishings.reduce((sum,fin)=>sum+fin.subtotal,0));
  if(source.discountType&&!['NONE','PERCENTAGE','FIXED_AMOUNT'].includes(source.discountType))throw new PricingError('Tipo de desconto inválido.');
  const discount=calculateItemDiscount(baseValue+finishingTotal,source.discountType??'NONE',numberInput(source.discountInputValue,'Desconto',0));
  if(!discount.isValid)throw new PricingError(discount.errorMessage!);
  if(!Number.isFinite(discount.subtotalAfterDiscount)||discount.subtotalAfterDiscount>1e12)throw new PricingError('Valor excede o limite de cálculo.');
  const item={...source,serviceId:service.id,serviceName:service.name,serviceGroup:'VISUAL_COMMUNICATION',materialId:material.id,materialName:material.name,quantity,widthCm,heightCm,
    allowances,...dims,finishings,finishingTotal,baseValue,subtotalBeforeDiscount:baseValue+finishingTotal,subtotal:discount.subtotalAfterDiscount,
    discountEffectiveAmount:discount.discountEffectiveAmount,servicePriceSnapshot:rate,unitPriceSnapshot:rate,calculationType:'UNIT',isGraphic:false,isGraphicSnapshot:false,sheetSnapshot} as QuotationItem;
  delete item.calculationSnapshot;delete item.recommendedSnapshot;delete item.graphicSnapshot;delete item.graphicProductId;
  return {item};
}
