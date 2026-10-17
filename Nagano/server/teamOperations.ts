import {canPerform} from '../src/utils/permissions';
import {legacyImportDisabled} from './maintenance/runtime';
import { Router } from 'express';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { Quotation, WorkOrder, ProductionStatus } from '../src/types';
import type { Activity, ActorStamp, ThirdParty } from '../src/types/team';
import { actorOf } from './auth';
import { productionStatusLabels } from '../src/utils/productionFlow';
import {canAccess,canReadOrderAmounts,canRecordPayments,orderForProfile} from '../src/utils/profileAccess';
import {validateImageData} from './imageData';
import {createThirdPartyTracking} from './thirdPartyTracking';
import {outsourcedChargedValue} from '../src/utils/outsourcing';

export function createTeamOperations(publish: (actor:ActorStamp,action:string,entity:string,id:string,title:string,fields?:Partial<Activity>)=>Activity, getQuote:(id:string)=>Quotation|undefined, dataDir=process.env.PRINTSHOP_DATA_DIR||path.resolve('data'), getApprovedQuote?:(id:string)=>Quotation|undefined,erp?:{database:DatabaseSync;transaction:<T>(fn:()=>T)=>T;beforeOrderSave:(previous:WorkOrder|undefined,next:WorkOrder,actor:ActorStamp)=>void}) {
  fs.mkdirSync(dataDir,{recursive:true});
  const db=erp?.database||new DatabaseSync(path.join(dataDir,'operations.sqlite'));
  db.exec(`PRAGMA journal_mode=WAL;
    CREATE TABLE IF NOT EXISTS work_orders(id TEXT PRIMARY KEY,payload TEXT NOT NULL,revision INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS third_parties(id TEXT PRIMARY KEY,payload TEXT NOT NULL,revision INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS third_party_history(id TEXT PRIMARY KEY,third_party_id TEXT NOT NULL,payload TEXT NOT NULL);`);
  const router=Router();
  const read=(table:string,id:string)=>{const row=db.prepare(`SELECT payload,revision FROM ${table} WHERE id=?`).get(id);return row?{...JSON.parse(String(row.payload)),revision:Number(row.revision)}:undefined;};
  const list=(table:string)=>db.prepare(`SELECT payload,revision FROM ${table} ORDER BY rowid DESC`).all().map(row=>({...JSON.parse(String(row.payload)),revision:Number(row.revision)}));
  const put=(table:string,data:any)=>{const saved={...data,revision:(read(table,data.id)?.revision||0)+1};db.prepare(`INSERT INTO ${table} VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload,revision=excluded.revision`).run(data.id,JSON.stringify(saved),saved.revision);return saved;};
  const getThirdParty=(id:string):ThirdParty|undefined=>read('third_parties',id);
  const getOrder=(id:string):WorkOrder|undefined=>read('work_orders',id);
  const tracking=createThirdPartyTracking(db,getQuote,getApprovedQuote||getQuote,getOrder,()=>list('work_orders'));
  const approvedQuote=(id:string)=>{
    const current=getQuote(id),approved=getApprovedQuote?getApprovedQuote(id):current?.status==='APROVADO'?current:undefined;
    if(!approved)return undefined;
    const order=(approved.workOrderId?getOrder(approved.workOrderId):undefined)||list('work_orders').find(order=>order.quotationId===id);
    return order?.productionStatus==='CANCELADO'?undefined:approved;
  };
  const withTotals=()=>{
    const totals=new Map<string,{cents:number;quotes:Set<string>}>();
    const ids=new Set(db.prepare('SELECT payload FROM third_party_history').all().map(row=>JSON.parse(String(row.payload)).quotationId as string));
    for(const id of ids){const approved=approvedQuote(id);for(const row of approved?.outsourcedServices||[]){const total=totals.get(row.thirdPartyId)||{cents:0,quotes:new Set<string>()};total.cents+=Math.round(outsourcedChargedValue(row)*100);total.quotes.add(id);totals.set(row.thirdPartyId,total);}}
    return list('third_parties').map(p=>({...p,totalProvided:(totals.get(p.id)?.cents||0)/100,approvedQuotationCount:totals.get(p.id)?.quotes.size||0}));
  };
  const endpoint=(fn:(req:any,res:any)=>void)=>(req:any,res:any)=>{try{if(erp&&req.method!=='GET'&&!req.path.endsWith('/bootstrap'))erp.transaction(()=>fn(req,res));else fn(req,res);}catch(error){res.status((error as any).status||400).json({success:false,error:error instanceof Error?error.message:'Não foi possível salvar.'});}};
  const fail=(message:string,status=400)=>{throw Object.assign(new Error(message),{status});};
  const amount=(value:any)=>{if(typeof value!=='number'||!Number.isFinite(value)||value<0||value>100000000)fail('Informe valores financeiros válidos.');return Math.round(value*100)/100;};
  const normalizeStatus=(value:ProductionStatus)=>value==='FINALIZADO'?'AGUARDANDO_RETIRADA':value==='AGUARDANDO_APROVACAO_ARTE'?'PRODUCAO_ARTES':value;
  router.get('/api/work-orders',(req:any,res)=>res.json({success:true,data:list('work_orders').map(order=>req.naganoProfile?orderForProfile(order,req.naganoProfile):order)}));
  router.post('/api/work-orders/bootstrap',endpoint((req,res)=>{
    if(legacyImportDisabled(dataDir)){res.json({success:true,data:list('work_orders')});return;}
    if(!Array.isArray(req.body.orders)||req.body.orders.length>5000)fail('Lista de ordens inválida.');
    db.exec('BEGIN IMMEDIATE');
    try {
      for(const source of req.body.orders){
        if(typeof source.id!=='string'||!source.id||typeof source.number!=='string'||!source.number)fail('Ordem de serviço inválida.');
        const pending=getQuote(source.quotationId)?.status==='EM_REVISAO';
        if(!getOrder(source.id))put('work_orders',{...source,createdBy:undefined,updatedBy:undefined,statusHistory:Array.isArray(source.statusHistory)?source.statusHistory.map((entry:any)=>({...entry,changedByProfileId:undefined})):[],productionStatus:pending?'PAUSADO':normalizeStatus(source.productionStatus),quotationRevisionPending:pending||source.quotationRevisionPending,totalAmount:amount(source.totalAmount),amountPaid:amount(source.amountPaid),remainingBalance:amount(source.remainingBalance)});
      }
      db.exec('COMMIT');
    }catch(error){db.exec('ROLLBACK');throw error;}
    res.json({success:true,data:list('work_orders')});
  }));
  router.put('/api/work-orders/:id',endpoint((req,res)=>{
    const previous=getOrder(req.params.id);if(req.naganoProfile&&!canPerform(req.naganoProfile,previous&&['DESIGN','PRODUCTION','FINISHING'].includes(req.naganoProfile.role)?'kanban':'work_orders',previous?'edit':'create'))fail('Sem permissão para alterar esse pedido.',403);
    const quote=getQuote(previous?.quotationId||req.body.quotationId);
    if(previous&&previous.revision!==req.body.revision)fail('Esta OS foi alterada por outro perfil. Atualize a lista antes de salvar.',409);
    if(!previous&&(!quote||quote.status!=='APROVADO'||quote.workOrderId!==req.params.id))fail('A OS deve estar vinculada a um orçamento aprovado.',409);
    const target=normalizeStatus(req.body.productionStatus);
    if(!Object.hasOwn(productionStatusLabels,target))fail('Situação de produção inválida.');
    const pending=quote?.status==='EM_REVISAO'||(previous?.quotationRevisionPending&&quote?.status!=='APROVADO');
    if(pending&&target!==previous?.productionStatus&&target!=='PAUSADO')fail('Aguarde a nova aprovação do orçamento antes de movimentar a OS.',409);
    const actor=actorOf(req)!;
    const notes=typeof req.body.productionNotes==='string'?req.body.productionNotes.slice(0,10000):previous?.productionNotes||'';
    const total=quote?.totalAmount??previous?.totalAmount??0;
    const paymentAllowed=!req.naganoProfile||canRecordPayments(req.naganoProfile);
    const paid=amount(req.body.amountPaid??previous?.amountPaid??0);
    if(paid>total+0.001&&paid>(previous?.amountPaid||0))fail('O pagamento informado supera o total da OS.');
    if(!paymentAllowed&&paid!==(previous?.amountPaid||0))fail('Este perfil não tem permissão para alterar pagamentos.',403);
    const changed=!previous||previous.productionStatus!==target;
    const observed=notes!==(previous?.productionNotes||'');
    const observation=typeof req.body.movementNote==='string'?req.body.movementNote.trim().slice(0,2000):'';
    const history=[...(previous?.statusHistory||[])];
    if(changed||observed||observation)history.push({id:randomUUID(),previousStatus:previous?.productionStatus||target,newStatus:target,changedAt:actor.at,changedBy:actor.name,changedByProfileId:actor.profileId,observation:observation||(observed?notes:'Situação atualizada.')});
    const data=put('work_orders',{...previous,...req.body,...(!paymentAllowed?{paymentMethod:previous?.paymentMethod,paymentTerms:(previous as any)?.paymentTerms,paymentStatus:(previous as any)?.paymentStatus}:{}),id:req.params.id,quotationId:previous?.quotationId??quote?.id??'',quotationNumber:previous?.quotationNumber??quote?.number??'',
      number:previous?.number||`OS-${new Date().getFullYear()}-${String(Number(db.prepare('SELECT COUNT(*) AS count FROM work_orders').get()!.count)+1).padStart(4,'0')}`,createdAt:previous?.createdAt||actor.at,createdBy:previous?previous.createdBy:actor,updatedBy:actor,
      productionStatus:target,productionNotes:notes,quotationRevisionPending:!!pending,statusHistory:history,
      totalAmount:total,amountPaid:paid,remainingBalance:Math.max(0,Math.round((total-paid)*100)/100),paymentStatus:paid>=total?'Pago':paid>0?'Pagamento parcial':'Pendente',
      outsourcedServices:quote?.outsourcedServices||previous?.outsourcedServices||[],
      items:quote?.items||previous?.items||[],
      productionCompletedAt:target==='AGUARDANDO_RETIRADA'?(previous?.productionStatus===target?previous.productionCompletedAt:actor.at):target==='ENTREGUE'?previous?.productionCompletedAt:undefined,
    });
    erp?.beforeOrderSave(previous,data,actor);
    tracking.sync(data.quotationId,actor);
    publish(actor,changed?'MOVIMENTAR':'EDITAR','WORK_ORDER',data.id,`${actor.name} ${changed?'movimentou':'atualizou'} ${data.number}${changed?`: ${productionStatusLabels[target]}`:''}.`,{previousStatus:previous?.productionStatus,newStatus:target});
    res.json({success:true,data:req.naganoProfile?orderForProfile(data,req.naganoProfile):data});
  }));
  router.get('/api/third-parties',(req:any,res)=>res.json({success:true,data:(!req.naganoProfile||canAccess(req.naganoProfile,'third_parties')?withTotals():list('third_parties').map(p=>({id:p.id,name:p.name,services:p.services,active:p.active})))}));
  router.get('/api/third-parties/:id/history',endpoint((req,res)=>{
    res.json({success:true,data:tracking.history(req.params.id).map(entry=>{const approved=approvedQuote(entry.quotationId);return {...entry,canPay:!req.naganoProfile||canRecordPayments(req.naganoProfile),includedInTotal:!!approved&&(approved.commercialVersion||1)===entry.quotationVersion&&approved.outsourcedServices?.some(service=>service.id===entry.id&&service.thirdPartyId===req.params.id)};})});
  }));
  router.put('/api/third-parties/:id/service-status',endpoint((req,res)=>{
    tracking.update(req.params.id,req.body,actorOf(req)!,!req.naganoProfile||canRecordPayments(req.naganoProfile));
    publish(actorOf(req)!,req.body.paid===undefined?'SITUACAO':'PAGAMENTO','THIRD_PARTY',req.params.id,`Serviço do terceiro: ${req.body.quotationId}. ${req.body.paid===true?'Pago':req.body.paid===false?'Pagamento desmarcado':'Situação atualizada'}.`);
    res.json({success:true});
  }));
  router.put('/api/third-parties/:id',endpoint((req,res)=>{
    const previous=getThirdParty(req.params.id),source=req.body;if(req.naganoProfile&&!canPerform(req.naganoProfile,'third_parties',previous?'edit':'create'))fail('Sem permissão para alterar o terceiro.',403);if(req.naganoProfile&&previous?.active&&source.active===false&&!canPerform(req.naganoProfile,'third_parties','delete'))fail('Sem permissão para desativar terceiros.',403);
    if(previous&&previous.revision!==source.revision)fail('O cadastro foi alterado. Atualize antes de salvar.',409);
    if(typeof source.name!=='string'||!source.name.trim()||source.name.length>150||!Array.isArray(source.services)||!source.services.length||source.services.length>100||source.services.some((v:any)=>typeof v!=='string'||!v.trim()||v.length>300))fail('Informe o nome do terceiro e pelo menos um serviço.');
    for(const key of ['phone','pixKey','pixHolder','notes'])if(source[key]!==undefined&&(typeof source[key]!=='string'||source[key].length>10000))fail('Dados de contato inválidos.');
    const pixQrCode=source.pixQrCode===undefined?previous?.pixQrCode:validateImageData(source.pixQrCode,'pix');
    const data=put('third_parties',{id:req.params.id,name:source.name.trim(),services:[...new Set(source.services.map((v:string)=>v.trim()))],phone:source.phone||'',pixKey:source.pixKey||'',pixHolder:source.pixHolder||'',pixQrCode,notes:source.notes||'',active:source.active!==false});
    const changedActive=previous&&previous.active!==data.active;
    publish(actorOf(req)!,changedActive?(data.active?'REATIVAR':'DESATIVAR'):previous?'EDITAR':'CRIAR','THIRD_PARTY',data.id,changedActive?`Terceiro ${data.name} ${data.active?'reativado':'desativado'}.`:`Cadastro de terceiro: ${data.name}.`);
    res.json({success:true,data});
  }));
  router.delete('/api/third-parties/:id',endpoint((req,res)=>{
    const previous=getThirdParty(req.params.id);if(!previous)fail('Terceiro não encontrado.',404);
    const data=put('third_parties',{...previous,active:false});
    publish(actorOf(req)!,'DESATIVAR','THIRD_PARTY',data.id,`Terceiro ${data.name} desativado. Histórico mantido.`);
    res.json({success:true,data});
  }));
  const quotationSaved=(quote:Quotation,actor:ActorStamp)=>{
    const linked=quote.workOrderId?getOrder(quote.workOrderId):undefined;
    if(quote.status==='EM_REVISAO'&&linked&&!linked.quotationRevisionPending){
      put('work_orders',{...linked,productionStatus:'PAUSADO',quotationRevisionPending:true,updatedBy:actor,statusHistory:[...linked.statusHistory,{id:randomUUID(),previousStatus:linked.productionStatus,newStatus:'PAUSADO',changedAt:actor.at,changedBy:actor.name,observation:`Orçamento em revisão: ${quote.revisionReason||''}`}]});
      publish(actor,'MOVIMENTAR','WORK_ORDER',linked.id,`${actor.name} pausou ${linked.number} para revisão do orçamento.`,{previousStatus:linked.productionStatus,newStatus:'PAUSADO'});
    }
    for(const row of quote.outsourcedServices||[]){
      const existing=db.prepare('SELECT id,payload FROM third_party_history WHERE third_party_id=?').all(row.thirdPartyId).find(stored=>{const entry=JSON.parse(String(stored.payload));return entry.quotationId===quote.id&&entry.quotationVersion===(quote.commercialVersion||1)&&entry.id===row.id;});
      const id=existing?String(existing.id):JSON.stringify([quote.id,quote.commercialVersion||1,row.id,row.thirdPartyId]);
      const entry={...row,quotationId:quote.id,quotationNumber:quote.number,quotationVersion:quote.commercialVersion||1,actor};
      db.prepare('INSERT INTO third_party_history VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload').run(id,row.thirdPartyId,JSON.stringify(entry));
    }
    tracking.sync(quote.id,actor);
    publish(actor,'SALVAR','QUOTATION',quote.id,`${actor.name} salvou o orçamento ${quote.number}.`);
  };
  return {router,getThirdParty,getOrder,quotationSaved,close:()=>{if(!erp)db.close();}};
}
