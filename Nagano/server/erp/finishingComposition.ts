import {createHash} from 'node:crypto';
import type {FinishOption,QuotationItem} from '../../src/types';
import {convertQuantity,normalizeUnit} from '../../src/utils/erpMath';
import {finishingApplicationCount,finishingComponentCost} from '../../src/utils/finishingComposition';
import {fail,numeric,text,type ErpStore} from './store';
const money=(value:number)=>Math.round((value+Number.EPSILON)*100)/100;
export function createFinishingCatalog(store:ErpStore){
 const list=():FinishOption[]=>store.get('settings','finishes')?.value||[];
 const find=(id:string,version?:string):FinishOption|undefined=>{const current=list().find(f=>f.id===id);if(!version||current?.compositionVersion===version)return current;return store.get('settings','finishing-versions')?.value?.[id+':'+version];};
 const validate=(rows:any,canManageCosts=true)=>{
  if(!Array.isArray(rows)||rows.length>10000)fail('Lista de acabamentos inválida.');const ids=new Set<string>();
  if(!canManageCosts&&list().some(f=>f.components?.length&&!rows.some(r=>r?.id===f.id)))fail('Sem permissão para excluir composições de custo.',403);
  const saved=rows.map((row:any)=>{if(!row||typeof row!=='object')fail('Acabamento inválido.');const id=text(row.id,'identificação do acabamento',150,true),name=text(row.name,'nome do acabamento',200,true);if(ids.has(id))fail('Acabamento duplicado.');ids.add(id);const previous=list().find(f=>f.id===id);
   if(!row.components){if(!canManageCosts&&previous?.components)fail('Sem permissão para remover a composição de materiais.',403);return {...row,id,name,...(!canManageCosts?{unitCost:previous?.unitCost||0}:{})};}
   if(!canManageCosts){if(!previous?.components||JSON.stringify(previous.components)!==JSON.stringify(row.components)||name!==previous.name||row.unitPrice!==previous.unitPrice||row.costType!==previous.costType)fail('Sem permissão para alterar composições de custo.',403);return {...previous,active:row.active!==false};}
   if(!Array.isArray(row.components)||!row.components.length||row.components.length>100)fail('Adicione de 1 a 100 materiais ao acabamento.');
   if(!['FIXED','PER_UNIT','PER_METER','PER_SQM','PER_SIDE'].includes(row.costType))fail('Selecione uma forma de cobrança compatível com a composição.');
   const componentIds=new Set<string>(),components=row.components.map((c:any)=>{const componentId=text(c.id,'identificação do material',150,true);if(componentIds.has(componentId))fail('Identificação repetida na composição.');componentIds.add(componentId);const stock=store.get('stock_items',text(c.itemId,'material',150,true));if(!stock?.active)fail('Selecione um material de estoque ativo.');const quantity=numeric(c.quantity,'quantidade do material',.000001,1e7);let unit:string;try{unit=normalizeUnit(c.unit||stock.unit);convertQuantity(quantity,unit,stock.unit);}catch{fail(`Unidade incompatível com ${stock.name} (${stock.unit}).`);}return {id:componentId,itemId:stock.id,name:stock.name,sku:stock.sku,quantity,unit:unit!};});
   const unitPrice=numeric(row.unitPrice,'preço de venda do acabamento'),costType=row.costType,compositionVersion=createHash('sha256').update(JSON.stringify({id,name,costType,unitPrice,components})).digest('hex');
   return {...row,id,name,costType,components,unitPrice,minimumCharge:numeric(row.minimumCharge||0,'cobrança mínima'),unitCost:money(finishingComponentCost(components,id=>store.get('stock_items',id))),compositionVersion};
  });
  const versions={...store.get('settings','finishing-versions')?.value};for(const f of [...list(),...saved])if(f.compositionVersion&&f.components?.length)versions[f.id+':'+f.compositionVersion]=f;
  store.put('settings',{id:'finishing-versions',value:versions});return saved;
 };return {list,find,validate};
}
export function addComposedFinishings(result:any,source:Partial<QuotationItem>,lookup?:((id:string,version?:string)=>FinishOption|undefined)){
 const inputs=(source.finishings||[]).filter(f=>f.compositionVersion);if(!inputs.length)return {...result,item:{...result.item,composedFinishingTotal:0}};
 if(!lookup)fail('O catálogo de acabamentos não está disponível.');const ids=new Set<string>();
 const rows=inputs.map(input=>{if(ids.has(input.finishingId))fail('Acabamento composto duplicado.');ids.add(input.finishingId);const definition=lookup!(input.finishingId,input.compositionVersion);if(!definition?.components?.length||definition.compositionVersion!==input.compositionVersion)fail('Composição não encontrada. Selecione novamente o acabamento cadastrado.');const count=finishingApplicationCount(definition.costType,result.item),price=definition.unitPrice??0;
  return {id:input.id,finishingId:definition.id,finishingName:definition.name,costType:definition.costType,quantity:count,unitPriceSnapshot:price,minimumChargeSnapshot:definition.minimumCharge||0,subtotal:money(Math.max(count*price,definition.minimumCharge||0)),compositionVersion:definition.compositionVersion,componentsSnapshot:definition.components.map(c=>({...c})),notes:input.notes};
 });
 const total=money(rows.reduce((s,r)=>s+r.subtotal,0));return {...result,item:{...result.item,finishings:[...(result.item.finishings||[]),...rows],composedFinishingTotal:total,finishingTotal:money((result.item.finishingTotal||0)+total),subtotalBeforeDiscount:money((result.item.subtotalBeforeDiscount??result.item.subtotal)+total),subtotal:money(result.item.subtotal+total)}};
}
