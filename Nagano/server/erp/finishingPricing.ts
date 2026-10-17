import type {QuotationItem} from '../../src/types';
import {convertQuantity,normalizeUnit,quantityRound} from '../../src/utils/erpMath';
import {fail,numeric,text} from './store';
const money=(n:number)=>Math.round((n+Number.EPSILON)*100)/100;
export function stockFinishingRows(source:any,lookup:(id:string)=>any){
  if(source.stockFinishings===undefined)return [];
  if(!Array.isArray(source.stockFinishings)||source.stockFinishings.length>100)fail('Acabamentos de estoque inválidos.');
  const ids=new Set<string>();return source.stockFinishings.map((row:any)=>{
    const id=text(row.id,'identificação do acabamento',150,true);if(ids.has(id))fail('Acabamento duplicado.');ids.add(id);
    const stock=lookup(text(row.itemId,'material do acabamento',150,true));if(!stock?.active)fail('Selecione um material de estoque ativo para o acabamento.');
    let unit:any;try{unit=normalizeUnit(row.unit||stock.unit);}catch{fail('Selecione uma unidade válida para o acabamento.');}
    const quantity=numeric(row.quantity,'quantidade do acabamento',.000001,1e7),perUnit=row.perUnit!==false;
    let consumed=0;try{consumed=convertQuantity(quantity*(perUnit?source.quantity:1),unit,stock.unit);}catch{fail(`A unidade ${unit} não é compatível com ${stock.name} (${stock.unit}).`);}
    return {id,itemId:stock.id,name:stock.name,sku:stock.sku,quantity,unit,perUnit,quantitySnapshot:quantityRound(consumed),stockUnit:stock.unit,saleUnitPriceSnapshot:stock.salePrice||0,saleTotal:money(consumed*(stock.salePrice||0))};
  });
}
export function addStockFinishings(result:any,source:any,lookup?:((id:string)=>any)){
  const internalCosts=Object.fromEntries(['labor','installation','transport','other','thirdParties'].map(k=>[k,numeric(source.internalCosts?.[k]||0,'custo interno')]));result={...result,item:{...result.item,internalCosts}};
  if(source.stockFinishings!==undefined&&!Array.isArray(source.stockFinishings))fail('Acabamentos de estoque inválidos.');
  if(!source.stockFinishings?.length)return {...result,item:{...result.item,stockFinishings:[] ,stockFinishingTotal:0}};
  if(!lookup)fail('O catálogo de estoque não está disponível para precificar os acabamentos.');
  const rows=stockFinishingRows({...source,quantity:result.item.quantity},lookup!),total=money(rows.reduce((s:number,r:any)=>s+r.saleTotal,0));
  const item:QuotationItem={...result.item,stockFinishings:rows,stockFinishingTotal:total,finishingTotal:money((result.item.finishingTotal||0)+total),subtotalBeforeDiscount:money((result.item.subtotalBeforeDiscount??result.item.subtotal)+total)};
  // Explicit finishing sale is additional; the service's existing roll price remains unchanged.
  item.subtotal=money(result.item.subtotal+total);return {...result,item};
}
