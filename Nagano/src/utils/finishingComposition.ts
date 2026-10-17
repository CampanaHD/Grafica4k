import type {FinishOption,QuotationItem} from '../types';
import {convertQuantity,quantityRound} from './erpMath';
export function finishingApplicationCount(type:FinishOption['costType'],item:Pick<QuotationItem,'widthCm'|'heightCm'|'quantity'>){
  if(type==='FIXED')return 1;
  if(type==='PER_METER')return quantityRound(2*(item.widthCm+item.heightCm)/100*item.quantity);
  if(type==='PER_SQM')return quantityRound(item.widthCm*item.heightCm/10000*item.quantity);
  if(type==='PER_UNIT'||type==='PER_SIDE')return item.quantity;
  throw new Error('Composição de materiais não utiliza cobrança percentual.');
}
export function finishingComponentCost(components:NonNullable<FinishOption['components']>,lookup:(id:string)=>any){return components.reduce((sum,c)=>{const stock=lookup(c.itemId);return sum+(stock?convertQuantity(c.quantity,c.unit,stock.unit)*(stock.averageCost||0):0);},0);}
