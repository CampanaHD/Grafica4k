import {finishingApplicationCount} from '../../src/utils/finishingComposition';
import {calculateRollCost,supportsLinearCost,stockQuantityPerLinearMeter} from '../../src/utils/rollCost';
import {stockFinishingRows} from './finishingPricing';
import {baseUnit,normalizeUnit,stockAvailability} from '../../src/utils/erpMath';
import type {Material,Quotation,WorkOrder} from '../../src/types';
import fs from 'node:fs';
import path from 'node:path';
import type {StockItem,Composition,RollLot,StockUnit,JobCosts} from '../../src/types/erp';
import {componentQuantity,convertQuantity,quantityRound as round,stockUnits} from '../../src/utils/erpMath';
import {fail,numeric,text,type ErpStore} from './store';
export function createInventory(store:ErpStore,getMaterials:()=>Material[]){
  const cash=(n:number)=>Math.round((n+Number.EPSILON)*100)/100;
  const {db,get,list,put,transaction,audit,id}=store;
  const item=(itemId:string):any=>{const row=get('stock_items',itemId)||fail('Material não encontrado.',404);const a=stockAvailability(row);return {...row,unit:normalizeUnit(row.unit),stockBase:a.physical,reservedBase:a.reserved,availableBase:a.available,baseUnit:a.baseUnit};};
  const move=(itemId:string,delta:number,reservedDelta:number,type:string,actor:any,reason:string,orderId?:string,lotId?:string,cost=0)=>{
    const before=item(itemId),stock=round(before.stock+delta),reserved=round(before.reserved+reservedDelta);
    if(Math.round(stock*1e6)<0||Math.round(reserved*1e6)<0||Math.round(reserved*1e6)>Math.round(stock*1e6))fail(`Saldo insuficiente de ${before.name}. Físico: ${before.stock}; reservado: ${before.reserved}.`,409);
    put('stock_items',{...before,stock:Math.max(0,stock),reserved:Math.max(0,reserved),stockBase:convertQuantity(stock,before.unit,baseUnit(before.unit)),reservedBase:convertQuantity(reserved,before.unit,baseUnit(before.unit)),baseUnit:baseUnit(before.unit)});
    const entry={id:id(),itemId,lotId,type,quantity:delta,unit:before.unit,reservedChange:reservedDelta,before:before.stock,after:stock,cost,orderId,reason,actor,createdAt:new Date().toISOString()};
    db.prepare('INSERT INTO erp_movements VALUES(?,?,?,?,?)').run(entry.id,itemId,orderId||null,entry.createdAt,JSON.stringify(entry));return entry;
  };
  const lotFactor=(stock:StockItem,lot:RollLot)=>{try{return convertQuantity(lot.widthM,'m²',stock.unit);}catch{return convertQuantity(1,'metro',stock.unit);}};
  const saveItem=(body:any,actor:any)=>transaction(()=>{
    const previous=store.revision('stock_items',body),unit=normalizeUnit(body.unit) as StockUnit;if(!stockUnits.includes(unit))fail('Unidade de estoque inválida.');
    if(previous&&previous.unit!==unit&&(previous.stock||previous.reserved))fail('Não altere a unidade de um material com saldo ou reservas.');
    if(previous&&previous.unit!==unit&&(db.prepare('SELECT id FROM erp_movements WHERE item_id=? LIMIT 1').get(previous.id)||list('compositions').some(c=>c.components.some((row:any)=>row.itemId===previous.id))))fail('A unidade já faz parte do histórico ou de uma ficha técnica. Cadastre outro SKU para utilizar uma unidade diferente.');
    const sku=text(body.sku,'SKU',80,true);if(list('stock_items').some(row=>row.id!==body.id&&row.sku.toLowerCase()===sku.toLowerCase()))fail('Já existe um material com esse SKU.');
    if(body.materialId&&!getMaterials().some(m=>m.id===body.materialId))fail('Material de impressão não encontrado.');
    const linked=getMaterials().find(m=>m.id===body.materialId);if(linked){if(linked.controlType==='ROLL'&&!['m²','cm²','metro','cm'].includes(unit))fail('Bobinas usam uma unidade de área ou comprimento.');if(linked.controlType==='SHEET'&&unit!=='chapa')fail('Materiais de chapa usam a unidade chapa.');}
    const costEntryMode=body.costEntryMode??previous?.costEntryMode??'UNIT';if(!['UNIT','ROLL_LINEAR'].includes(costEntryMode))fail('Forma de calcular o custo inválida.');
    const costReferenceWidthM=body.costReferenceWidthM==null?previous?.costReferenceWidthM:numeric(body.costReferenceWidthM,'boca da bobina',0.000001,100);
    let cost=numeric(body.averageCost??previous?.averageCost??0,'custo'),rollCostReference=previous?.rollCostReference,reason=text(body.costReason,'motivo da mudança de custo',1000);
    if(costEntryMode==='ROLL_LINEAR'){
      if(!supportsLinearCost(unit))fail('Custo por metro linear requer estoque em metro, cm, m² ou cm².');
      stockQuantityPerLinearMeter(unit,costReferenceWidthM);
      if(body.rollCostInput){const calculated=calculateRollCost(body.rollCostInput,unit,costReferenceWidthM);cost=calculated.stockUnitCost;rollCostReference={totalPaid:body.rollCostInput.totalPaid,lengthM:body.rollCostInput.lengthM,widthM:costReferenceWidthM,...calculated,calculatedAt:new Date().toISOString()};reason=reason||`Cálculo da bobina: R$ ${body.rollCostInput.totalPaid} ÷ ${body.rollCostInput.lengthM} m = R$ ${calculated.linearCost}/m${costReferenceWidthM?`; boca ${costReferenceWidthM} m`:''}.`;}
      else if(previous)cost=previous.averageCost;
      else fail('Informe o valor total pago e o comprimento da bobina para calcular o custo.');
    }
    const minimum=numeric(body.minimum??0,'estoque mínimo');
    if(previous&&cost!==previous.averageCost&&!reason)fail('Informe o motivo da alteração de custo.');
    const saved=put('stock_items',{id:text(body.id,'identificação',150,true),name:text(body.name,'nome',150,true),sku,category:text(body.category,'categoria'),supplierId:text(body.supplierId,'fornecedor',150),materialId:text(body.materialId,'material vinculado',150),unit,stock:previous?.stock||0,reserved:previous?.reserved||0,minimum,averageCost:cost,costEntryMode,costReferenceWidthM,rollCostReference,lastPurchase:body.rollCostInput&&costEntryMode==='ROLL_LINEAR'?{source:'DECLARED_ROLL',at:rollCostReference.calculatedAt,quantity:rollCostReference.stockQuantity,unit,unitCost:cost,totalCost:rollCostReference.totalPaid,supplierId:body.supplierId||'',supplierName:get('suppliers',body.supplierId||'')?.name||''}:previous?.lastPurchase,salePrice:numeric(body.salePrice??0,'preço de venda'),location:text(body.location,'localização'),notes:text(body.notes,'observações',5000),lossPct:numeric(body.lossPct??previous?.lossPct??0,'perda',0,1000),mainConsumptionBasis:costEntryMode==='ROLL_LINEAR'&&linked?.controlType==='ROLL'||body.mainConsumptionBasis==='ROLL'?'ROLL':'NET',active:body.active!==false});
    if(!previous&&body.stock)move(saved.id,numeric(body.stock,'saldo inicial'),0,'ENTRADA',actor,'Saldo inicial cadastrado.');
    if(!previous||cost!==previous.averageCost||body.rollCostInput||(previous.costEntryMode||'UNIT')!==costEntryMode||previous.costReferenceWidthM!==costReferenceWidthM)db.prepare('INSERT INTO erp_cost_history VALUES(?,?,?,?)').run(id(),saved.id,new Date().toISOString(),JSON.stringify({previous:previous?.averageCost||0,current:cost,reason:reason||(!previous?'Cadastro inicial':'Forma de calcular o custo atualizada'),unit,costEntryMode,...(body.rollCostInput?{rollCostReference,quantity:rollCostReference.stockQuantity,unitCost:cost,totalCost:rollCostReference.totalPaid,supplierId:body.supplierId||'',supplierName:get('suppliers',body.supplierId||'')?.name||'',source:'DECLARED_ROLL'}:{}),actor}));
    audit(actor,previous?'EDITAR':'CRIAR','MATERIAL',saved.id,saved.name);return item(saved.id);
  });
  const saveComposition=(body:any,actor:any)=>transaction(()=>{
    store.revision('compositions',body);if(!Array.isArray(body.components)||!body.components.length||body.components.length>100)fail('Adicione de 1 a 100 componentes.');
    const width=body.widthCm?numeric(body.widthCm,'largura'):0,height=body.heightCm?numeric(body.heightCm,'altura'):0;if(Boolean(width)!==Boolean(height))fail('Preencha largura e altura juntas, ou deixe ambas em zero para medidas personalizadas.');
    if(list('compositions').some(c=>c.id!==body.id&&c.serviceId===body.serviceId&&(c.widthCm||0)===width&&(c.heightCm||0)===height))fail('Já existe uma ficha técnica para este serviço e estas medidas. Edite a ficha existente.');
    const components=body.components.map((c:any)=>{const stock=item(c.itemId);convertQuantity(1,c.unit,stock.unit);if(!['UNIT','AREA','PERIMETER','WIDTH','HEIGHT','ROLL_AREA','ROLL_LENGTH','EXPRESSION'].includes(c.formula))fail('Fórmula inválida.');const result={id:text(c.id||id(),'componente',150,true),itemId:stock.id,quantity:numeric(c.quantity,'quantidade'),unit:c.unit,formula:c.formula,expression:text(c.expression,'fórmula',250),lossPct:numeric(c.lossPct??0,'perda',0,1000),salePrice:numeric(c.salePrice??0,'venda')};componentQuantity(result as any,{width:1,height:1,quantity:1,rollArea:1,rollLength:1});return result;});
    const saved=put('compositions',{id:text(body.id,'identificação',150,true),serviceId:text(body.serviceId,'serviço',150,true),name:text(body.name,'variação',150,true),widthCm:body.widthCm?numeric(body.widthCm,'largura'):0,heightCm:body.heightCm?numeric(body.heightCm,'altura'):0,components});audit(actor,'FICHA_TECNICA','SERVICO',saved.serviceId,saved.name);return saved;
  });
  const requirements=(quote:Quotation)=>{
    const needs:any[]=[],itemCosts:any[]=[];let incomplete=false;
    for(const row of quote.items||[]){
      const variants=list('compositions').filter(c=>c.serviceId===row.serviceId),composition=variants.find(c=>c.widthCm&&Math.abs(c.widthCm-row.widthCm)<.001&&Math.abs(c.heightCm-row.heightCm)<.001)||variants.find(c=>!c.widthCm&&!c.heightCm);
      const snapshot=row.calculationSnapshot,netArea=round((row.widthCm||0)*(row.heightCm||0)*(row.quantity||0)/10000),preparedArea=round((row.productionWidthCm||row.widthCm||0)*(row.productionHeightCm||row.heightCm||0)*(row.quantity||0)/10000);
      const dimensions={width:(row.widthCm||0)/100,height:(row.heightCm||0)/100,quantity:row.quantity,rollArea:snapshot?.totalSqmUsed||snapshot?.billableAreaM2||row.simulationSnapshot?.consumedAreaM2||preparedArea,rollLength:snapshot?.linearMetersNeeded||row.simulationSnapshot?.usedLengthM||0};
      const primary=list('stock_items').find(i=>i.materialId===row.materialId&&i.active),explicit=stockFinishingRows(row,id=>get('stock_items',id)),explicitIds=new Set([...explicit.map((f:any)=>f.itemId),...(row.finishings||[]).filter(f=>f.compositionVersion).flatMap(f=>(f.componentsSnapshot||[]).map(c=>c.itemId))]),start=needs.length;
      const add=(stock:any,quantity:number,role:string,extra:any={})=>{const q=round(quantity);if(!Number.isFinite(q)||q<0)fail('Consumo inválido.');needs.push({quotationItemId:row.id,serviceId:row.serviceId,serviceName:row.serviceName,itemId:stock.id,sku:stock.sku,name:stock.name,category:stock.category,quantity:q,unit:stock.unit,baseQuantity:convertQuantity(q,stock.unit,baseUnit(stock.unit)),baseUnit:baseUnit(stock.unit),unitCost:stock.averageCost,cost:round(q*stock.averageCost),sale:0,widthM:0,role,serviceGroup:row.serviceGroup||'VISUAL_COMMUNICATION',...extra});};
      const primaryInComposition=!!primary&&composition?.components.some((c:any)=>c.itemId===primary.id);
      if(primary&&!primaryInComposition){
        const material=getMaterials().find(m=>m.id===row.materialId),lossPct=numeric(primary.lossPct||0,'perda',0,1000);let q=0,net=0,widthM=0;
        if(material?.controlType==='ROLL'||['m²','cm²'].includes(primary.unit)){
          const area=row.simulationSnapshot?.consumedAreaM2||(primary.mainConsumptionBasis==='ROLL'?dimensions.rollArea:preparedArea||netArea);
          if(['metro','cm'].includes(primary.unit)){q=convertQuantity(dimensions.rollLength||area/((row.selectedRollWidthCm||snapshot?.selectedRollWidthCm||100)/100),'metro',primary.unit);net=q;}
          else{q=convertQuantity(area,'m²',primary.unit);net=convertQuantity(netArea,'m²',primary.unit);}
          widthM=(row.selectedRollWidthCm||snapshot?.selectedRollWidthCm||snapshot?.recommendedRollWidthCm||0)/100;
        }else if(material?.controlType==='SHEET'){q=convertQuantity(row.sheetSnapshot?.sheetsNeeded||row.quantity,'chapa',primary.unit);net=q;}
        else{q=convertQuantity(row.quantity,'un',primary.unit);net=q;}
        add(primary,q*(1+lossPct/100),'MAIN',{widthM,netQuantity:net,preparationQuantity:round(Math.max(0,q-net)),lossQuantity:round(q*lossPct/100),lossPct});
      }
      if(composition){for(const c of composition.components){if(explicitIds.has(c.itemId)&&c.itemId!==primary?.id)continue;const stock=item(c.itemId),q=convertQuantity(componentQuantity(c,dimensions),c.unit,stock.unit),raw=q/(1+c.lossPct/100);add(stock,q,c.itemId===primary?.id?'MAIN':'FINISHING',{compositionId:composition.id,netQuantity:raw,lossQuantity:round(q-raw),lossPct:c.lossPct,sale:componentQuantity(c,dimensions)*c.salePrice,widthM:['ROLL_AREA','ROLL_LENGTH'].includes(c.formula)?(row.selectedRollWidthCm||snapshot?.selectedRollWidthCm||snapshot?.recommendedRollWidthCm||0)/100:0});}}
      if(!primary&&!composition)incomplete=true;
      for(const f of explicit){if(primary?.id===f.itemId)fail('O material principal já está incluído; selecione um insumo diferente para o acabamento.');const stock=item(f.itemId);add(stock,f.quantitySnapshot,'FINISHING',{finishingId:f.id,netQuantity:f.quantitySnapshot,lossQuantity:0,sale:f.saleTotal});}
      for(const finishing of row.finishings||[]){if(!finishing.compositionVersion)continue;const count=finishingApplicationCount(finishing.costType,row);for(const c of finishing.componentsSnapshot||[]){const stock=item(c.itemId);if(primary?.id===stock.id)fail('O material principal já está incluído. Revise os materiais do acabamento.');const q=convertQuantity(c.quantity*count,c.unit,stock.unit);add(stock,q,'FINISHING',{finishingId:finishing.finishingId,finishingName:finishing.finishingName,componentId:c.id,netQuantity:q,lossQuantity:0});}}
      const lines=needs.slice(start),internalCosts=Object.fromEntries(['labor','installation','transport','other','thirdParties'].map(k=>[k,numeric(row.internalCosts?.[k]||0,'custo interno')]));
      const materialCost=cash(lines.filter(n=>n.role==='MAIN').reduce((s,n)=>s+n.cost,0)),finishingCost=cash(lines.filter(n=>n.role==='FINISHING').reduce((s,n)=>s+n.cost,0)),otherCost=Object.values(internalCosts).reduce((s:number,n:number)=>s+n,0),totalCost=cash(materialCost+finishingCost+otherCost);
      itemCosts.push({id:row.id,serviceId:row.serviceId,name:row.serviceName,quantity:row.quantity,revenue:row.subtotal||0,netAreaM2:netArea,preparedAreaM2:preparedArea,materialCost,finishingCost,internalCosts,totalCost,margin:cash((row.subtotal||0)-totalCost),marginPct:row.subtotal?cash(100*((row.subtotal||0)-totalCost)/row.subtotal):0,needs:lines});
    }
    return {needs,incomplete,itemCosts};
  };
  const release=(orderId:string,actor:any)=>{
    for(const a of db.prepare("SELECT * FROM erp_allocations WHERE order_id=? AND state='RESERVED'").all(orderId)){
      move(String(a.item_id),0,-Number(a.quantity),'CANCELAMENTO',actor,'Reserva liberada.',orderId,String(a.lot_id||'')||undefined);
      if(a.lot_id){const lot=get('roll_lots',String(a.lot_id));put('roll_lots',{...lot,reservedLengthM:Math.max(0,round(lot.reservedLengthM-Number(a.quantity)/lotFactor(item(String(a.item_id)),lot)))});}
      db.prepare("UPDATE erp_allocations SET state='RELEASED' WHERE id=?").run(a.id);
    }
  };
  const reserve=(plan:any,actor:any)=>{
    const shortages:any[]=[];
    const grouped=new Map<string,any>();
    for(const need of plan.needs){const key=need.itemId+':'+(need.widthM||0),old=grouped.get(key);grouped.set(key,old?{...old,quantity:round(old.quantity+need.quantity)}:{...need});}
    const credits:any[]=db.prepare("SELECT * FROM erp_allocations WHERE order_id=? AND state IN ('CONSUMED','RESERVED')").all(plan.id).map(a=>({...a,remaining:Number(a.quantity)}));
    for(const need of [...grouped.values()].sort((a,b)=>(b.widthM||0)-(a.widthM||0))){
      const matches=(a:any)=>{const lot=a.lot_id?get('roll_lots',String(a.lot_id)):null;return !need.widthM||!lot||Math.abs(lot.widthM-need.widthM)<.0001;};
      let used=0,reservedCredit=0;for(const a of credits.filter(a=>a.item_id===need.itemId&&matches(a))){const take=Math.min(a.remaining,need.quantity-used);a.remaining=round(a.remaining-take);if(a.state==='RESERVED')reservedCredit=round(reservedCredit+take);used=round(used+take);if(used>=need.quantity)break;}
      let required=round(Math.max(0,need.quantity-used));
      if(!required)continue;const stock=item(need.itemId);
      const lots=list('roll_lots').filter(l=>l.itemId===stock.id&&(need.widthM?Math.abs(l.widthM-need.widthM)<.0001:true)).sort((a,b)=>a.remainingLengthM-b.remainingLengthM);
      const allLots=list('roll_lots').filter(l=>l.itemId===stock.id);
      const choices=[...lots,null];
      const availability=stockAvailability(stock,required,need.unit);
      if(process.env.NAGANO_STOCK_DEBUG==='true')console.debug('[StockValidation]',JSON.stringify({material:stock.id,unit:stock.unit,physical:stock.stock,reserved:stock.reserved,available:round(stock.stock-stock.reserved),required,converted:availability.required,baseUnit:availability.baseUnit,result:availability.ok?'OK':'INSUFFICIENT'}));
      for(const candidate of choices){const lot=candidate?get('roll_lots',candidate.id):null;const fresh=item(stock.id),factor=lot?lotFactor(fresh,lot):1,available=lot?Math.min(round((lot.remainingLengthM-lot.reservedLengthM)*factor),fresh.stock-fresh.reserved):Math.max(0,round(fresh.stock-fresh.reserved-allLots.reduce((s,l)=>s+(get('roll_lots',l.id).remainingLengthM-get('roll_lots',l.id).reservedLengthM)*lotFactor(fresh,l),0))),take=round(Math.min(required,Math.max(0,available)));if(take<=0)continue;
        move(stock.id,0,take,'RESERVA',actor,'Reserva do orçamento aprovado.',plan.id,lot?.id);if(lot)put('roll_lots',{...lot,reservedLengthM:round(lot.reservedLengthM+take/factor)});
        db.prepare('INSERT INTO erp_allocations VALUES(?,?,?,?,?,?,?,?)').run(id(),plan.id,stock.id,lot?.id||null,take,fresh.averageCost,'RESERVED',plan.version);required=round(required-take);if(!required)break;
      }
      if(required>.000001)shortages.push({available:round(stock.stock-stock.reserved+reservedCredit),required:need.quantity,itemId:stock.id,name:stock.name,quantity:required,unit:stock.unit,widthM:need.widthM});
    }
    return shortages;
  };
  const syncQuote=(quote:Quotation,actor:any)=>transaction(()=>{
    if(!quote.workOrderId)return;const previous=get('job_plans',quote.workOrderId);
    if(quote.status==='EM_REVISAO'||['CANCELADO','REJEITADO'].includes(quote.status)){if(previous){release(previous.id,actor);put('job_plans',{...previous,state:quote.status==='EM_REVISAO'?'REVISION':'CANCELLED'});}return;}
    if(quote.status!=='APROVADO')return;
    if(previous?.version===(quote.commercialVersion||1)&&previous.state!=='REVISION')return;
    release(quote.workOrderId,actor);const calculated=requirements(quote);const plan={id:quote.workOrderId,quoteId:quote.id,version:quote.commercialVersion||1,needs:calculated.needs,itemCosts:calculated.itemCosts,incomplete:calculated.incomplete,state:'RESERVED',costs:previous?.costs||{finishing:0,installation:0,transport:0,labor:0,other:0},thirdPartyCost:(quote.outsourcedServices||[]).reduce((sum,row)=>sum+Number(row.value??(row.cost||0)*(row.quantity||1)),0),createdAt:new Date().toISOString()};
    return put('job_plans',{...plan,shortages:reserve(plan,actor)});
  });
  const onOrder=(previous:WorkOrder|undefined,next:WorkOrder,actor:any)=>{
    const plan=get('job_plans',next.id);if(!plan)return;
    if(next.productionStatus==='CANCELADO'){release(next.id,actor);put('job_plans',{...plan,state:'CANCELLED'});return;}
    const entering=['PRODUCAO','ACABAMENTO','AGUARDANDO_RETIRADA','ENTREGUE'].includes(next.productionStatus)&&!['PRODUCAO','ACABAMENTO','AGUARDANDO_RETIRADA','ENTREGUE'].includes(previous?.productionStatus||'');
    if(entering&&plan.state!=='CONSUMED'){
      const shortages=reserve(plan,actor);if(shortages.length)fail(`Estoque insuficiente: ${shortages.map(s=>`${s.name} (disponível ${s.available} ${s.unit}; necessário ${s.required} ${s.unit}; falta ${s.quantity} ${s.unit})`).join(', ')}. Registre a entrada ou utilize Aguardando matéria-prima.`,409);
      const pendingNeeds=plan.needs.map((n:any)=>({...n,remaining:n.quantity})),priorDetails=list('consumption_details').filter(d=>d.orderId===next.id);
      // Carry item attribution across revisions; a later consumption must not be assigned to an item already produced.
      for(const d of priorDetails){let credit=d.quantity;for(const n of pendingNeeds){if(n.itemId!==d.itemId||n.quotationItemId!==d.quotationItemId)continue;const take=Math.min(n.remaining,credit);n.remaining=round(n.remaining-take);credit=round(credit-take);if(!credit)break;}}
      for(const a of db.prepare("SELECT * FROM erp_allocations WHERE order_id=? AND state='CONSUMED'").all(next.id)){if(priorDetails.some(d=>d.allocationId===a.id))continue;let credit=Number(a.quantity);for(const n of pendingNeeds){if(n.itemId!==a.item_id)continue;const take=Math.min(n.remaining,credit);n.remaining=round(n.remaining-take);credit=round(credit-take);if(!credit)break;}}
      for(const a of db.prepare("SELECT * FROM erp_allocations WHERE order_id=? AND state='RESERVED'").all(next.id)){
        const cost=Math.round(Number(a.quantity)*Number(a.unit_cost)*100)/100;
        move(String(a.item_id),-Number(a.quantity),-Number(a.quantity),'PRODUCAO',actor,'Consumo ao iniciar produção.',next.id,String(a.lot_id||'')||undefined,cost);
        if(a.lot_id){const lot=get('roll_lots',String(a.lot_id)),length=Number(a.quantity)/lotFactor(item(String(a.item_id)),lot);put('roll_lots',{...lot,remainingLengthM:Math.max(0,round(lot.remainingLengthM-length)),reservedLengthM:Math.max(0,round(lot.reservedLengthM-length))});}
        let remaining=Number(a.quantity),costRemaining=cost;
        for(let n=0;n<pendingNeeds.length&&remaining>.000001;n++){const need=pendingNeeds[n];if(need.itemId!==a.item_id)continue;const lot=a.lot_id?get('roll_lots',String(a.lot_id)):null;if(lot&&need.widthM&&Math.abs(lot.widthM-need.widthM)>.0001)continue;
          const key=need.quotationItemId+':'+n,take=round(Math.min(remaining,Math.max(0,need.remaining)));if(!take)continue;need.remaining=round(need.remaining-take);
          const allocatedCost=take>=remaining-.000001?costRemaining:Math.round(cost*take/Number(a.quantity)*100)/100;costRemaining=Math.round((costRemaining-allocatedCost)*100)/100;
          put('consumption_details',{id:String(a.id)+':'+n,allocationId:a.id,orderId:next.id,needKey:key,planVersion:plan.version,quotationItemId:need.quotationItemId,serviceId:need.serviceId,serviceName:need.serviceName,serviceGroup:need.serviceGroup,itemId:need.itemId,name:need.name,sku:need.sku,category:need.category,role:need.role||'MATERIAL',widthM:need.widthM||lot?.widthM||0,quantity:take,unit:need.unit,baseQuantity:convertQuantity(take,need.unit,baseUnit(need.unit)),baseUnit:baseUnit(need.unit),unitCost:Number(a.unit_cost),cost:allocatedCost,createdAt:new Date().toISOString(),actor});remaining=round(remaining-take);
        }
        db.prepare("UPDATE erp_allocations SET state='CONSUMED' WHERE id=?").run(a.id);
      }
      put('job_plans',{...plan,state:'CONSUMED',shortages:[],consumedAt:new Date().toISOString()});
    }
  };
  const adjustment=(body:any,actor:any)=>transaction(()=>{
    const stock=item(body.itemId);if(body.revision!==stock.revision)fail('O saldo mudou. Atualize antes de movimentar.',409);
    const reason=text(body.reason,'motivo',1500,true),allowed=['ENTRADA','AJUSTE','PERDA','DESCARTE','DEVOLUCAO','INVENTARIO'];if(!allowed.includes(body.type))fail('Movimentação manual inválida.');
    const quantity=numeric(body.quantity,'quantidade'),base=convertQuantity(quantity,body.unit||stock.unit,stock.unit);
    if(list('roll_lots').some(l=>l.itemId===stock.id)&&!body.lotId)fail('Selecione a bobina física para ajustar esse material.');
    const lot=body.lotId?get('roll_lots',body.lotId):undefined;if(body.lotId&&(!lot||lot.itemId!==stock.id))fail('Bobina inválida.');
    let delta=['PERDA','DESCARTE'].includes(body.type)?-base:body.type==='INVENTARIO'?round(base-(lot?lot.remainingLengthM*lotFactor(stock,lot):stock.stock)):base;
    if(body.type==='AJUSTE')delta=body.direction==='OUT'?-base:base;
    if(lot){const factor=lotFactor(stock,lot),lengthDelta=delta/factor;if(lot.remainingLengthM+lengthDelta<lot.reservedLengthM-.000001)fail('O ajuste não pode retirar material reservado.');put('roll_lots',{...lot,remainingLengthM:round(lot.remainingLengthM+lengthDelta),initialLengthM:Math.max(lot.initialLengthM,lot.remainingLengthM+lengthDelta)});}
    const entry=move(stock.id,delta,0,body.type,actor,reason,undefined,lot?.id,Math.round(Math.abs(delta)*stock.averageCost*100)/100);audit(actor,body.type,'ESTOQUE',stock.id,reason);return entry;
  });
  const addRoll=(body:any,actor:any,addStock=true)=>transaction(()=>{
    if(body.id&&get('roll_lots',body.id))fail('Esta bobina já foi cadastrada.',409);
    const stock=item(body.itemId),widthM=numeric(body.widthM,'largura',.001,100),initialLengthM=numeric(body.initialLengthM,'comprimento',.001,1e6);const lot={id:body.id?text(body.id,'identificação',150,true):id(),itemId:stock.id,code:text(body.code||`BOB-${Date.now()}`,'código',100),widthM,initialLengthM,remainingLengthM:initialLengthM,reservedLengthM:0,purchaseId:body.purchaseId,unitCost:stock.averageCost,createdAt:new Date().toISOString()};
    const factor=lotFactor(stock,lot),amount=round(initialLengthM*factor);if(!addStock){const allocated=list('roll_lots').filter(l=>l.itemId===stock.id).reduce((s,l)=>s+l.remainingLengthM*lotFactor(stock,l),0);if(allocated+amount>stock.stock+.000001)fail('O saldo físico não comporta esta bobina. Registre uma entrada.');}
    put('roll_lots',lot);if(addStock)move(stock.id,amount,0,'ENTRADA',actor,'Cadastro de bobina física.',undefined,lot.id);audit(actor,'BOBINA','ESTOQUE',stock.id,lot.code);return lot;
  });
  const receive=(itemId:string,amount:number,totalCost:number,actor:any,purchaseId:string,purchaseDetails:any={})=>{
    const previous=item(itemId),average=round((previous.stock*previous.averageCost+totalCost)/(previous.stock+amount));const purchase=get('purchases',purchaseId),supplierId=purchase?.supplierId||purchaseDetails.supplierId||'',lastPurchase={source:'RECEIVED_PURCHASE',at:new Date().toISOString(),purchaseId,quantity:amount,unit:previous.unit,unitCost:round(totalCost/amount),totalCost,supplierId,supplierName:get('suppliers',supplierId)?.name||'',...purchaseDetails};put('stock_items',{...previous,averageCost:average,lastPurchase});move(itemId,amount,0,'ENTRADA',actor,'Recebimento da compra '+purchaseId,undefined,undefined,totalCost);db.prepare('INSERT INTO erp_cost_history VALUES(?,?,?,?)').run(id(),itemId,new Date().toISOString(),JSON.stringify({previous:previous.averageCost,current:average,purchaseId,quantity:amount,totalCost,unit:previous.unit,unitCost:lastPurchase.unitCost,supplierId,supplierName:lastPurchase.supplierName,freight:lastPurchase.freight||0,actor}));
  };
  const seed=()=>transaction(()=>{for(const material of getMaterials()){const unit:StockUnit=material.controlType==='ROLL'?'m²':material.controlType==='SHEET'?'chapa':'un';if(!list('stock_items').some(i=>i.materialId===material.id))put('stock_items',{id:'stock:'+material.id,name:material.name,sku:material.code||material.id,category:material.category,supplierId:'',materialId:material.id,unit,stock:0,reserved:0,minimum:0,averageCost:material.referenceCost||material.costPerSqm||0,salePrice:0,location:'',notes:'Vinculado ao cadastro de impressão existente.',active:material.active});}db.prepare('INSERT OR IGNORE INTO erp_migrations VALUES(?,?)').run('stock-catalog-v1',new Date().toISOString());});
  seed();
  const legacyFile=path.join(store.dataDir,'physical_rolls.json');
  if(fs.existsSync(legacyFile)&&!db.prepare("SELECT id FROM erp_migrations WHERE id='physical-rolls-v1'").get())transaction(()=>{
    const raw=fs.readFileSync(legacyFile,'utf8').replace(/^\uFEFF/,'');put('legacy_records',{id:'physical-rolls-v1',collection:'physicalRolls',raw,createdAt:new Date().toISOString()});
    const rows=JSON.parse(raw);if(!Array.isArray(rows))fail('O cadastro anterior de bobinas precisa ser revisado. O arquivo foi preservado.');
    for(const row of rows){const stock=list('stock_items').find(i=>i.materialId===row.materialId);if(!stock)continue;
      const widthM=numeric(row.widthM,'largura da bobina anterior',.001),remainingLengthM=numeric(row.currentLengthM,'saldo da bobina anterior'),initialLengthM=Math.max(numeric(row.initialLengthM,'comprimento inicial'),remainingLengthM);
      const lot={id:'legacy:'+text(row.id,'código',150,true),itemId:stock.id,code:row.rollCode||row.id,widthM,initialLengthM,remainingLengthM,reservedLengthM:0,createdAt:row.receivedAt||new Date().toISOString()};
      if(get('roll_lots',lot.id))continue;put('roll_lots',lot);move(stock.id,round(remainingLengthM*lotFactor(stock,lot)),0,'ENTRADA',{name:'Migração',profileId:'system'},'Saldo da bobina anterior preservado.',undefined,lot.id);
    }
    db.prepare('INSERT INTO erp_migrations VALUES(?,?)').run('physical-rolls-v1',new Date().toISOString());
  });
  const materialForPricing=(material:Material|undefined)=>{
    if(!material)return undefined;const stock=list('stock_items').find(i=>i.materialId===material.id&&i.active);if(!stock)return {...material,stockByWidth:undefined};
    const widths=material.allowedRollWidths||material.rollConfiguration?.allowedWidths||material.availableRolls?.map(r=>r.widthCm)||[],stockByWidth:Record<string,number>={};
    const lots=list('roll_lots').filter(l=>l.itemId===stock.id),lotFree=lots.reduce((sum,l)=>sum+(l.remainingLengthM-l.reservedLengthM)*lotFactor(stock,l),0),aggregate=Math.max(0,stock.stock-stock.reserved-lotFree);
    for(const raw of widths){const cm=raw<=10?raw*100:raw,width=cm/100,amount=aggregate+lots.filter(l=>Math.abs(l.widthM-width)<.0001).reduce((sum,l)=>sum+(l.remainingLengthM-l.reservedLengthM)*lotFactor(stock,l),0);try{stockByWidth[String(cm)]=['m²','cm²'].includes(normalizeUnit(stock.unit))?convertQuantity(amount,stock.unit,'m²')/width:convertQuantity(amount,stock.unit,'metro');}catch{}}
    return {...material,stockByWidth};
  };
  return {item,move,saveItem,saveComposition,requirements,syncQuote,onOrder,release,adjustment,addRoll,receive,lotFactor,seedCatalog:seed,materialForPricing};
}
