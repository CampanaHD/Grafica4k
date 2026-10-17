import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {mkdtempSync,mkdirSync} from 'node:fs';
import path from 'node:path';
import {createAuthSystem,hashPassword} from '../server/auth';
import {createTeamOperations} from '../server/teamOperations';
import {createQuotationsRouter} from '../server/quotationsApi';
import {isQuotationDueForDeletion} from '../src/utils/quotationRetention';

async function fixture(){
  const root=path.resolve('work/test-data');mkdirSync(root,{recursive:true});const dir=mkdtempSync(path.join(root,'final-adjustments-'));
  const initial={email:'teste@local.invalid',...hashPassword('Senha-apenas-teste!')};
  const app=express();app.use(express.json({limit:'10mb'}));const auth=createAuthSystem(dir,initial);app.use(auth.router);app.use('/api',(req,res,next)=>auth.requireLogin(req,res,()=>auth.requireProfile(req,res,next)));
  let ops:ReturnType<typeof createTeamOperations>;
  const quotes=createQuotationsRouter(()=>undefined,dir,()=>undefined,undefined,{getThirdParty:id=>ops.getThirdParty(id),onSaved:(q,a)=>ops.quotationSaved(q,a)});
  ops=createTeamOperations(auth.activity,quotes.get,dir,quotes.getApproved);app.use(ops.router);app.use(quotes.router);
  const server=app.listen(0,'127.0.0.1');await new Promise<void>(resolve=>server.once('listening',resolve));let cookie='';const url=`http://127.0.0.1:${(server.address() as any).port}`;
  const call=async(route:string,method='GET',body?:any)=>{const res=await fetch(url+route,{method,headers:{cookie,...(body===undefined?{}:{'content-type':'application/json'})},body:body===undefined?undefined:JSON.stringify(body)});if(res.headers.get('set-cookie'))cookie=res.headers.get('set-cookie')!.split(';')[0];return {status:res.status,...await res.json()};};
  await call('/api/auth/login','POST',{email:initial.email,password:'Senha-apenas-teste!'});await call('/api/auth/profile','POST',{profileId:'administrator'});
  return {call,auth,ops,quotes,dir,close:async()=>{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));ops.close();quotes.close();auth.close();}};
}
test('third-party lifecycle follows quotation and production, records paid state once, and retains revision history across restart',async()=>{
  const f=await fixture(),{call}=f;try{
    await call('/api/third-parties/a','PUT',{id:'a',name:'Prestador',services:['Adesivação'],active:true});
    let q=(await call('/api/quotations/q','PUT',{id:'q',customerId:'c',customerName:'Cliente',status:'ORCAMENTO',items:[],outsourcedServices:[{id:'s',thirdPartyId:'a',services:['Adesivação'],value:150}]})).data;
    const history=async()=>(await call('/api/third-parties/a/history')).data;
    let row=(await history())[0];assert.equal(row.status,'ORCAMENTO_REALIZADO');
    const update=(r:any,changes:any)=>call('/api/third-parties/a/service-status','PUT',{quotationId:r.quotationId,quotationVersion:r.quotationVersion,id:r.id,statusRevision:r.statusRevision,...changes});
    assert.equal((await update(row,{paid:true})).status,409);
    assert.equal((await update(row,{status:'AGUARDANDO_INFORMACAO_CLIENTE',note:'Falta o arquivo.'})).status,200);row=(await history())[0];assert.equal(row.status,'AGUARDANDO_INFORMACAO_CLIENTE');
    q=(await call('/api/quotations/q/approve','POST',{revision:q.revision,workOrderId:'os'})).data;
    row=(await history())[0];assert.equal(row.status,'ORCAMENTO_APROVADO');
    let order=(await call('/api/work-orders/os','PUT',{quotationId:'q',productionStatus:'PRODUCAO_ARTES',amountPaid:0})).data;
    const move=async(status:string,note='Registro de teste')=>{const res=await call('/api/work-orders/os','PUT',{...order,productionStatus:status,movementNote:note});assert.equal(res.status,200,res.error);order=res.data;row=(await history())[0];};
    await move('PRODUCAO');assert.equal(row.status,'EM_ANDAMENTO');
    await move('AGUARDANDO_INFORMACAO_CLIENTE','Cliente precisa enviar a logo.');assert.equal(row.status,'AGUARDANDO_INFORMACAO_CLIENTE');
    await move('PAUSADO','Máquina em manutenção.');assert.equal(row.status,'PAUSADO');
    await move('AGUARDANDO_RETIRADA');assert.equal(row.status,'FINALIZADO');
    const prePayment=row;assert.equal((await update(row,{paid:true})).status,200);row=(await history())[0];assert.equal(row.status,'PAGO');assert.equal(row.paidBy.profileId,'administrator');assert.ok(row.paidAt);
    assert.deepEqual(row.statusHistory.map((e:any)=>e.status),['ORCAMENTO_REALIZADO','AGUARDANDO_INFORMACAO_CLIENTE','ORCAMENTO_APROVADO','EM_ANDAMENTO','AGUARDANDO_INFORMACAO_CLIENTE','PAUSADO','FINALIZADO','PAGO']);
    assert.equal((await update(prePayment,{paid:true})).status,409);const count=row.statusHistory.length;assert.equal((await update(row,{paid:true})).status,200);row=(await history())[0];assert.equal(row.statusHistory.length,count);
    assert.equal((await update(row,{paid:false})).status,200);row=(await history())[0];assert.equal(row.status,'FINALIZADO');assert.equal(row.statusHistory.at(-1).note,'Marcação de pagamento desfeita.');
    await update(row,{paid:true});q=(await call('/api/quotations/q/reopen','POST',{revision:q.revision,reason:'Alterar valor'})).data;
    q=(await call('/api/quotations/q','PUT',{...q,outsourcedServices:[{id:'s',thirdPartyId:'a',services:['Adesivação'],value:200}]})).data;
    let rows=await history();assert.equal(rows.length,2);assert.equal(rows.find((r:any)=>r.quotationVersion===1).status,'PAGO');assert.equal(rows.find((r:any)=>r.quotationVersion===2).paid,false);
    q=(await call('/api/quotations/q/approve','POST',{revision:q.revision})).data;
    const reload=createTeamOperations(f.auth.activity,f.quotes.get,f.dir,f.quotes.getApproved);reload.close();rows=await history();assert.equal(rows.find((r:any)=>r.quotationVersion===1).paid,true);
    const partner=(await call('/api/third-parties')).data[0];assert.equal(partner.totalProvided,200);
  }finally{await f.close();}
});
test('unapproved quotations keep source prices and third-party outcome; permissions prevent payment and status tampering',async()=>{
  const f=await fixture(),{call}=f;try{
    await call('/api/third-parties/a','PUT',{id:'a',name:'Prestador',services:['Remoção'],active:true});
    const draft=(id:string)=>({id,status:'ORCAMENTO',items:[],outsourcedServices:[{id:'s',thirdPartyId:'a',services:['Remoção'],value:120}]});
    let q=(await call('/api/quotations/rejected','PUT',draft('rejected'))).data;
    const closed=await call('/api/quotations/rejected/reject','POST',{revision:q.revision,reason:'Cliente não retornou'});assert.equal(closed.status,200);assert.equal(closed.data.totalAmount,q.totalAmount);assert.equal(closed.data.rejectionReason,'Cliente não retornou');
    assert.equal((await call('/api/third-parties/a/history')).data[0].status,'ORCAMENTO_NAO_APROVADO');assert.equal((await call('/api/third-parties')).data[0].totalProvided,0);
    assert.equal(isQuotationDueForDeletion({...closed.data,createdAt:'2020-01-01'}),false);assert.equal(isQuotationDueForDeletion({...q,createdAt:'2020-01-01',status:'ENVIADO'}),false);
    q=(await call('/api/quotations/active','PUT',draft('active'))).data;q=(await call('/api/quotations/active/approve','POST',{revision:q.revision})).data;
    const profile={id:'designer',name:'Arte',role:'DESIGN',active:true,color:'#3158ed',modules:['third_parties','work_orders']};await call('/api/team/profiles/designer','PUT',profile);await call('/api/auth/profile','POST',{profileId:'designer'});
    let row=(await call('/api/third-parties/a/history')).data.find((r:any)=>r.quotationId==='active');assert.equal(row.canPay,false);
    const body={id:row.id,quotationId:row.quotationId,quotationVersion:row.quotationVersion,statusRevision:row.statusRevision};
    assert.equal((await call('/api/third-parties/a/service-status','PUT',{...body,paid:true})).status,403);
    assert.equal((await call('/api/third-parties/a/service-status','PUT',{...body,status:'PAGO'})).status,400);
    assert.equal((await call('/api/third-parties/a/service-status','PUT',{...body,status:'PAUSADO',note:'Aguardando ferramenta.'})).status,200);
    row=(await call('/api/third-parties/a/history')).data.find((r:any)=>r.quotationId==='active');assert.equal(row.status,'PAUSADO');assert.equal(row.statusHistory.at(-1).note,'Aguardando ferramenta.');
    assert.equal((await call('/api/third-parties/b/service-status','PUT',{...body,paid:true})).status,404);
  }finally{await f.close();}
});
test('own profile updates personal data and optional PIN without changing permissions, identity or shared account',async()=>{
  const f=await fixture(),{call}=f;try{
    const profile={id:'reader',name:'Consulta',role:'READONLY',color:'#3158ed',active:true,modules:['dashboard']};await call('/api/team/profiles/reader','PUT',profile);await call('/api/auth/profile','POST',{profileId:'reader'});
    let res=await call('/api/team/me','PUT',{name:'Pessoa',phone:'11911111111',email:'pessoa@local.invalid',jobTitle:'Assistente',username:'pessoa',pin:'4321',preferences:{reduceMotion:true},id:'administrator',role:'ADMIN',modules:['finance']});
    assert.equal(res.status,200,res.error);assert.equal(res.data.id,'reader');assert.equal(res.data.role,'READONLY');assert.deepEqual(res.data.modules,['dashboard']);assert.equal(res.data.hasPin,true);assert.equal(res.data.phone,'11911111111');assert.equal(res.data.email,'pessoa@local.invalid');assert.equal(res.data.preferences.reduceMotion,true);
    assert.equal((await call('/api/team/me','PUT',{email:'inválido'})).status,400);
    assert.equal((await call('/api/team/me','PUT',{pin:'5678',currentPin:'0000'})).status,403);
    assert.equal((await call('/api/team/me','PUT',{pin:'5678',currentPin:'4321'})).status,200);
    await call('/api/auth/profile','POST',{profileId:'administrator'});assert.equal((await call('/api/auth/profile','POST',{profileId:'reader',pin:'4321'})).status,403);assert.equal((await call('/api/auth/profile','POST',{profileId:'reader',pin:'5678'})).status,200);
    assert.equal((await call('/api/team/profiles')).status,403);assert.equal((await call('/api/auth/session')).profile.name,'Pessoa');
  }finally{await f.close();}
});
test('changing a draft supplier and returning to the first keeps one record per supplier without losing proposals',async()=>{
  const f=await fixture(),{call}=f;try{
    for(const id of ['a','b'])await call('/api/third-parties/'+id,'PUT',{id,name:'Prestador '+id,services:['Adesivação'],active:true});
    let q=(await call('/api/quotations/switch','PUT',{id:'switch',status:'ORCAMENTO',items:[],outsourcedServices:[{id:'s',thirdPartyId:'a',services:['Adesivação'],value:100}]})).data;
    for(const id of ['b','a','b','a']){const res=await call('/api/quotations/switch','PUT',{...q,outsourcedServices:[{id:'s',thirdPartyId:id,services:['Adesivação'],value:id==='a'?100:200}]});assert.equal(res.status,200);q=res.data;}
    const a=(await call('/api/third-parties/a/history')).data,b=(await call('/api/third-parties/b/history')).data;
    assert.equal(a.length,1);assert.equal(b.length,1);assert.equal(a[0].previousVersion,false);assert.equal(b[0].previousVersion,true);
    q=(await call('/api/quotations/switch/approve','POST',{revision:q.revision})).data;
    assert.equal((await call('/api/third-parties/a/history')).data[0].status,'ORCAMENTO_APROVADO');assert.equal((await call('/api/third-parties/b/history')).data[0].canManage,false);
  }finally{await f.close();}
});
