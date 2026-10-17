import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import express from 'express';
import {createErpSystem} from '../server/erp/api';
import {createAuthSystem,hashPassword} from '../server/auth';
import {createTeamOperations} from '../server/teamOperations';
import {createQuotationsRouter} from '../server/quotationsApi';
import {arithmetic,componentQuantity,convertQuantity,payableState} from '../src/utils/erpMath';
const actor={profileId:'admin',name:'Administrador',at:new Date().toISOString()};
const material:any={id:'lona',name:'Lona',code:'LONA',active:true,controlType:'ROLL',category:'LONA',referenceCost:12};
function fixture(materials:any[]=[]){const dir=mkdtempSync(path.join(tmpdir(),'nagano-erp-')),erp=createErpSystem(()=>materials,dir);return {...erp,dir,close(){erp.close();assert.ok(path.resolve(dir).startsWith(path.resolve(tmpdir())+path.sep));rmSync(dir,{recursive:true,force:true});}};}
const stock=(f:any,id='wood',extra:any={})=>f.inventory.saveItem({id,name:'Madeira',sku:id,unit:'un',stock:100,averageCost:1,...extra},actor);
const comp=(f:any,components:any[],extra:any={})=>f.inventory.saveComposition({id:'bom',serviceId:'banner',name:'Personalizado',components:components.map((c,n)=>({id:'c'+n,itemId:'wood',quantity:2,unit:'un',formula:'UNIT',lossPct:0,salePrice:2.5,...c})),...extra},actor);
const quote=(quantity=10,extra:any={}):any=>({id:'q',workOrderId:'os',status:'APROVADO',commercialVersion:1,items:[{id:'row',serviceId:'banner',widthCm:80,heightCm:120,quantity,subtotal:800,serviceGroup:'VISUAL_COMMUNICATION'}],...extra});
const order=(extra:any={}):any=>({id:'os',number:'OS-1',quotationId:'q',customerId:'c',customerName:'Cliente',totalAmount:1000,amountPaid:0,remainingBalance:1000,productionStatus:'PRODUCAO_ARTES',createdAt:new Date().toISOString(),approvalDate:'2026-10-10',...extra});
test('unit conversion, decimal calculator, percentages and formulas reject execution',()=>{
 assert.equal(convertQuantity(80,'cm','metro'),.8);assert.equal(convertQuantity(1,'m²','cm²'),10000);assert.equal(convertQuantity(1500,'ml','litro'),1.5);assert.throws(()=>convertQuantity(1,'kg','metro'));
 assert.equal(arithmetic('200 + 10%',{},true),220);assert.equal(arithmetic('200 × 10%',{},true),20);assert.equal(arithmetic('1,5 + 2,5',{},true),4);assert.throws(()=>arithmetic('1/0'));for(const source of ['process.exit()','constructor','globalThis','width.__proto__','2**100','Math.random()'])assert.throws(()=>arithmetic(source,{width:1}));
 assert.equal(componentQuantity({quantity:1,formula:'AREA',unit:'m²',lossPct:10} as any,{width:1,height:1,quantity:1,rollArea:0,rollLength:0}),1.1);
 assert.equal(componentQuantity({quantity:1,formula:'AREA',unit:'cm²',lossPct:0} as any,{width:1,height:1,quantity:1,rollArea:0,rollLength:0}),10000);
 assert.equal(componentQuantity({quantity:1,formula:'WIDTH',unit:'cm',lossPct:0} as any,{width:.8,height:1,quantity:10,rollArea:0,rollLength:0}),800);
 assert.equal(componentQuantity({quantity:80,formula:'UNIT',lossPct:0} as any,{width:1,height:1,quantity:10,rollArea:0,rollLength:0}),800);
 assert.equal(payableState({status:'PENDING',dueDate:'2026-10-14'},'2026-10-15'),'OVERDUE');
});
test('approval reserves duplicate components correctly; production consumes exactly once; audit is immutable',()=>{
 const f=fixture();try{stock(f);comp(f,[{},{}]);f.quotationSaved(quote(),actor);assert.equal(f.inventory.item('wood').reserved,40);assert.equal(f.inventory.item('wood').stock,100);
 f.quotationSaved(quote(),actor);assert.equal(f.inventory.item('wood').reserved,40);
 f.transaction(()=>f.inventory.onOrder(order(),order({productionStatus:'PRODUCAO'}),actor));assert.equal(f.inventory.item('wood').stock,60);assert.equal(f.inventory.item('wood').reserved,0);
 f.transaction(()=>f.inventory.onOrder(order({productionStatus:'PRODUCAO'}),order({productionStatus:'ACABAMENTO'}),actor));assert.equal(f.inventory.item('wood').stock,60);
 const rows=f.store.db.prepare('SELECT payload FROM erp_movements').all().map(r=>JSON.parse(String(r.payload)));assert.equal(rows.filter(r=>r.type==='PRODUCAO').length,1);assert.equal(rows.at(-1).actor.name,'Administrador');
 }finally{f.close();}
});
test('revision releases reservations, keeps consumed cost and cancellation frees only reserved stock',()=>{
 const f=fixture();try{stock(f);comp(f,[{}]);f.quotationSaved(quote(),actor);f.quotationSaved(quote(10,{status:'EM_REVISAO'}),actor);assert.equal(f.inventory.item('wood').reserved,0);
 f.quotationSaved(quote(5,{commercialVersion:2}),actor);assert.equal(f.inventory.item('wood').reserved,10);f.transaction(()=>f.inventory.onOrder(order(),order({productionStatus:'CANCELADO'}),actor));assert.equal(f.inventory.item('wood').reserved,0);assert.equal(f.inventory.item('wood').stock,100);
 }finally{f.close();}
});
test('shortage blocks production atomically and succeeds after documented entry',()=>{
 const f=fixture();try{stock(f,'wood',{stock:10});comp(f,[{}]);f.quotationSaved(quote(),actor);assert.equal(f.store.get('job_plans','os').shortages[0].quantity,10);
 assert.throws(()=>f.transaction(()=>f.inventory.onOrder(order(),order({productionStatus:'PRODUCAO'}),actor)),/insuficiente/);assert.equal(f.inventory.item('wood').stock,10);assert.equal(f.inventory.item('wood').reserved,10);
 f.inventory.adjustment({itemId:'wood',revision:f.inventory.item('wood').revision,type:'ENTRADA',quantity:10,unit:'un',reason:'Compra recebida'},actor);f.transaction(()=>f.inventory.onOrder(order(),order({productionStatus:'PRODUCAO'}),actor));assert.equal(f.inventory.item('wood').stock,0);
 }finally{f.close();}
});
test('physical roll consumes 3.20m from 50m and count adjusts only the selected roll',()=>{
 const f=fixture([material]);try{const lot=f.inventory.addRoll({id:'r',itemId:'stock:lona',widthM:1.2,initialLengthM:50},actor);comp(f,[{itemId:'stock:lona',unit:'m²',quantity:1,formula:'ROLL_AREA'}]);
 const q=quote(1,{items:[{serviceId:'banner',materialId:'lona',quantity:1,widthCm:100,heightCm:320,selectedRollWidthCm:120,calculationSnapshot:{totalSqmUsed:3.84,linearMetersNeeded:3.2}}]});f.quotationSaved(q,actor);f.transaction(()=>f.inventory.onOrder(order(),order({productionStatus:'PRODUCAO'}),actor));assert.equal(f.store.get('roll_lots',lot.id).remainingLengthM,46.8);assert.equal(f.inventory.item('stock:lona').stock,56.16);
 f.inventory.addRoll({itemId:'stock:lona',widthM:1.2,initialLengthM:50},actor);f.inventory.adjustment({itemId:'stock:lona',revision:f.inventory.item('stock:lona').revision,type:'INVENTARIO',lotId:'r',quantity:55.2,unit:'m²',reason:'Contagem física: 46m'},actor);assert.equal(f.store.get('roll_lots','r').remainingLengthM,46);assert.equal(f.inventory.item('stock:lona').stock,115.2);
 }finally{f.close();}
});
test('weighted average purchases create exact installments and one stock entry only',()=>{
 const f=fixture();try{stock(f,'wood',{stock:10});f.finance.supplier({id:'s',name:'Fornecedor',active:true},actor);const p=f.finance.purchase({id:'p',supplierId:'s',description:'Madeiras',lines:[{itemId:'wood',quantity:10,unit:'un',unitCost:2}],freight:0,installments:3,dueDate:'2026-01-31'},actor);assert.equal(f.finance.bills().length,3);assert.equal(f.finance.bills().reduce((s,b)=>s+Math.round(b.amount*100),0),2000);assert.ok(f.finance.bills().some(b=>b.dueDate==='2026-02-28'));assert.equal(f.inventory.item('wood').stock,10);
 f.finance.receivePurchase(p.id,{revision:p.revision},actor);assert.equal(f.inventory.item('wood').stock,20);assert.equal(f.inventory.item('wood').averageCost,1.5);assert.throws(()=>f.finance.receivePurchase(p.id,{revision:p.revision},actor));assert.equal(f.inventory.item('wood').stock,20);assert.equal(f.finance.bills().length,3);
 }finally{f.close();}
});
test('partial payments keep ledger; final receipt is total1000, single and idempotent',()=>{
 const f=fixture();try{const os=order({revision:1});f.store.db.prepare('INSERT INTO work_orders VALUES(?,?,1)').run(os.id,JSON.stringify(os));let result=f.finance.payment('os',{revision:1,amount:500,method:'PIX',idempotencyKey:'one'},actor);assert.equal(result.order.remainingBalance,500);assert.equal(result.receipt,null);assert.equal(f.store.list('receipts').length,0);
 result=f.finance.payment('os',{revision:result.order.revision,amount:500,method:'PIX',idempotencyKey:'two'},actor);assert.equal(result.receipt.amount,1000);assert.equal(f.store.list('payments').length,2);assert.equal(f.store.list('receipts').length,1);f.finance.payment('os',{amount:500,idempotencyKey:'two'},actor);assert.equal(f.store.list('payments').length,2);assert.throws(()=>f.finance.payment('os',{revision:result.order.revision,amount:1,method:'PIX',idempotencyKey:'three'},actor));
 }finally{f.close();}
});
test('report keeps purchases outside expenses and separates operating expenses from direct costs',()=>{
 const f=fixture();try{stock(f);comp(f,[{}]);const q=quote();f.quotationSaved(q,actor);const os=order({items:q.items});f.store.db.prepare('INSERT INTO work_orders VALUES(?,?,1)').run(os.id,JSON.stringify(os));f.transaction(()=>f.inventory.onOrder(os,{...os,productionStatus:'PRODUCAO'},actor));f.finance.payable({id:'rent',description:'Aluguel',amount:100,dueDate:'2026-10-12',segment:'COMPANY'},actor);
 f.finance.supplier({id:'s',name:'F'},actor);f.finance.purchase({id:'purchase',supplierId:'s',description:'Reposição',lines:[{itemId:'wood',quantity:10,unit:'un',unitCost:1}],installments:1,dueDate:'2026-10-12'},actor);
 const report=f.report({start:'2026-10-01',end:'2026-10-31'});assert.equal(report.totals.revenue,1000);assert.equal(report.totals.materials,20);assert.equal(report.totals.operatingExpenses,100);assert.equal(report.totals.netResult,880);assert.equal(f.report({segment:'GRAPHIC_PRODUCTS'}).totals.revenue,0);
 }finally{f.close();}
});
test('existing roll file migrates once without changing original and preserves remaining length',()=>{
 const dir=mkdtempSync(path.join(tmpdir(),'nagano-erp-migration-'));const raw=JSON.stringify([{id:'old',materialId:'lona',rollCode:'ANTIGA',widthM:1.2,initialLengthM:50,currentLengthM:46.8}]);writeFileSync(path.join(dir,'physical_rolls.json'),raw);let f=createErpSystem(()=>[material],dir);assert.equal(f.store.list('roll_lots')[0].remainingLengthM,46.8);assert.equal(f.store.list('stock_items')[0].stock,56.16);assert.equal(f.store.get('legacy_records','physical-rolls-v1').raw,raw);f.close();f=createErpSystem(()=>[material],dir);assert.equal(f.store.list('roll_lots').length,1);assert.equal(f.store.list('stock_items')[0].stock,56.16);f.close();assert.ok(path.resolve(dir).startsWith(path.resolve(tmpdir())+path.sep));rmSync(dir,{recursive:true,force:true});
});
test('ERP APIs enforce backend permissions, migration keeps raw and stale updates reject',async()=>{
 const f=fixture(),password='Apenas uma frase de teste 872!',auth=createAuthSystem(f.dir,{email:'erp@example.invalid',...hashPassword(password)},{config:{enabled:false} as any});const app=express();app.use(express.json());app.use(auth.router);app.use('/api',(req,res,next)=>auth.requireLogin(req,res,()=>auth.requireProfile(req,res,next)));app.use(f.router);const server=app.listen(0);await new Promise<void>(r=>server.once('listening',r));const base='http://127.0.0.1:'+(server.address() as any).port;let cookie='',profile='administrator';
 const call=async(url:string,method='GET',body?:any)=>{const response=await fetch(base+url,{method,headers:{Cookie:cookie,...(!url.startsWith('/api/auth')?{'X-Nagano-Profile':profile}:{}),...(body===undefined?{}:{'Content-Type':'application/json'})},body:body===undefined?undefined:JSON.stringify(body)});if(response.headers.get('set-cookie'))cookie=response.headers.get('set-cookie')!.split(';')[0];return {status:response.status,body:await response.json()};};
 try{assert.equal((await call('/api/erp/state')).status,401);await call('/api/auth/login','POST',{email:'erp@example.invalid',password});await call('/api/auth/profile','POST',{profileId:'administrator'});
 const raw=JSON.stringify([{id:'client',name:'Preservado',totalPurchased:100}]);let r=await call('/api/erp/business/bootstrap','POST',{records:{customers:raw}});assert.equal(r.status,200);assert.equal(f.store.list('legacy_records')[0].raw,raw);assert.equal((await call('/api/erp/business/bootstrap','POST',{records:{customers:raw}})).status,200);assert.equal(f.store.list('clients').length,1);
 assert.equal((await call('/api/erp/business/bootstrap','POST',{records:{workOrders:JSON.stringify([order({amountPaid:500,remainingBalance:500})])}})).status,200);assert.equal(f.store.get('payments','legacy-opening:os').amount,500);
 const oldPayment=JSON.stringify([{id:'original-payment',workOrderId:'os',amount:100,customerId:'c',date:'2026-10-10',method:'PIX'}]);assert.equal((await call('/api/erp/business/bootstrap','POST',{records:{payments:oldPayment}})).status,200);assert.equal(f.store.get('payments','legacy-opening:os').amount,400);assert.equal(f.store.list('payments').reduce((s,p)=>s+p.amount,0),500);await call('/api/erp/business/bootstrap','POST',{records:{payments:oldPayment}});assert.equal(f.store.list('payments').reduce((s,p)=>s+p.amount,0),500);
 assert.equal((await call('/api/erp/business/customers','PUT',{revision:'stale',value:[]})).status,409);assert.equal((await call('/api/erp/business/receipts','PUT',{value:[]})).status,400);
 await call('/api/team/profiles/artist','PUT',{id:'artist',name:'Arte',role:'DESIGN',active:true,color:'#123456',modules:['dashboard','work_orders']});await call('/api/auth/profile','POST',{profileId:'artist'});profile='artist';assert.equal((await call('/api/erp/state')).status,403);assert.equal((await call('/api/erp/items/x','PUT',{id:'x'})).status,403);assert.equal((await call('/api/erp/reports')).status,403);assert.equal((await call('/api/erp/business')).body.data.payments,undefined);
 }finally{await new Promise<void>(r=>server.close(()=>r()));auth.close();f.close();}
});
test('work order, payment ledger and stock rollback share one database transaction',async()=>{
 const f=fixture();stock(f,'wood',{stock:10});comp(f,[{}]);const q={...quote(),totalAmount:1000,number:'ORC-1'};f.quotationSaved(q,actor);
 const app=express();app.use(express.json());app.use((req:any,_res,next)=>{req.naganoActor=actor;req.naganoProfile={id:'admin',name:actor.name,role:'ADMIN'};next();});
 const operations=createTeamOperations(()=>({} as any),()=>q,f.dir,()=>q,{database:f.store.db,transaction:f.transaction,beforeOrderSave:f.beforeOrderSave});app.use(operations.router);app.use(f.router);
 const server=app.listen(0);await new Promise<void>(r=>server.once('listening',r));const base='http://127.0.0.1:'+(server.address() as any).port;
 const call=async(url:string,body:any)=>{const r=await fetch(base+url,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});return {status:r.status,body:await r.json()};};
 try{const created=await call('/api/work-orders/os',order({amountPaid:500,totalAmount:1}));assert.equal(created.status,200,JSON.stringify(created.body));const os=created.body.data;assert.equal(os.totalAmount,1000);assert.equal(f.store.list('receipts').length,0);assert.equal(f.store.list('payments').length,1);
 const refused=await call('/api/work-orders/os',{...os,productionStatus:'PRODUCAO',amountPaid:1000});assert.equal(refused.status,409);assert.equal(f.finance.getOrder('os').productionStatus,'PRODUCAO_ARTES');assert.equal(f.finance.getOrder('os').amountPaid,500);assert.equal(f.store.list('payments').length,1);assert.equal(f.store.list('receipts').length,0);
 f.inventory.adjustment({itemId:'wood',revision:f.inventory.item('wood').revision,type:'ENTRADA',quantity:10,unit:'un',reason:'Reposição para produzir'},actor);
 const produced=await call('/api/work-orders/os',{...os,productionStatus:'PRODUCAO',amountPaid:1000});assert.equal(produced.status,200);assert.equal(f.inventory.item('wood').stock,0);assert.equal(f.store.list('payments').length,2);assert.equal(f.store.list('receipts')[0].amount,1000);
 }finally{await new Promise<void>(r=>server.close(()=>r()));operations.close();f.close();}
});
test('quotation outbox retries failed synchronization without losing the stored quotation',async()=>{
 const f=fixture();let failing=true,count=0;const quotes=createQuotationsRouter(()=>undefined,f.dir,()=>undefined,undefined,{getThirdParty:()=>({id:'p',name:'Prestador',services:['Serviço'],active:true} as any),onSaved:()=>{count++;if(failing)throw new Error('Simulated synchronization interruption');}});
 const app=express();app.use(express.json());app.use((req:any,_res,next)=>{req.naganoActor=actor;next();});app.use(quotes.router);const server=app.listen(0);await new Promise<void>(r=>server.once('listening',r));
 try{const response=await fetch('http://127.0.0.1:'+(server.address() as any).port+'/api/quotations/q',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:'q',customerId:'c',customerName:'Cliente',items:[],status:'ORCAMENTO',outsourcedServices:[{id:'external',thirdPartyId:'p',services:['Serviço'],value:100}]})});assert.equal(response.status,500);assert.equal(quotes.get('q')?.totalAmount,100);failing=false;quotes.flushPending();assert.equal(count,2);quotes.flushPending();assert.equal(count,2);assert.equal(quotes.get('q')?.totalAmount,100);
 }finally{await new Promise<void>(r=>server.close(()=>r()));quotes.close();f.close();}
});

