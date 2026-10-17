import type {DatabaseSync} from 'node:sqlite';
import type {Quotation,WorkOrder} from '../src/types';
import type {ActorStamp,ThirdPartyHistory,ThirdPartyServiceStatus,ThirdPartyServiceEvent} from '../src/types/team';
import {thirdPartySourceStatus} from '../src/utils/thirdPartyStatus';
import {outsourcedChargedValue,outsourcedServicesList} from '../src/utils/outsourcing';

interface State {status:ThirdPartyServiceStatus;sourceStatus:ThirdPartyServiceStatus;paid:boolean;paidAt?:string;paidBy?:ActorStamp;revision:number;events:ThirdPartyServiceEvent[]}
export function createThirdPartyTracking(db:DatabaseSync,getQuote:(id:string)=>Quotation|undefined,getApproved:(id:string)=>Quotation|undefined,getOrder:(id:string)=>WorkOrder|undefined,listOrders:()=>WorkOrder[]) {
  db.exec('CREATE TABLE IF NOT EXISTS third_party_service_state(id TEXT PRIMARY KEY,payload TEXT NOT NULL)');
  const key=(row:ThirdPartyHistory)=>JSON.stringify([row.quotationId,row.quotationVersion,row.id,row.thirdPartyId]);
  const write=(row:ThirdPartyHistory,state:State)=>db.prepare('INSERT OR REPLACE INTO third_party_service_state VALUES(?,?)').run(key(row),JSON.stringify(state));
  const context=(row:ThirdPartyHistory)=>{
    const current=getQuote(row.quotationId),approved=getApproved(row.quotationId);
    const quote=[current,approved].find(q=>q&&(q.commercialVersion||1)===row.quotationVersion);
    const service=quote?.outsourcedServices?.find(s=>s.id===row.id&&s.thirdPartyId===row.thirdPartyId);
    const matches=!!service&&outsourcedChargedValue(service)===outsourcedChargedValue(row)&&JSON.stringify(outsourcedServicesList(service))===JSON.stringify(outsourcedServicesList(row));
    const order=(quote?.workOrderId?getOrder(quote.workOrderId):undefined)||listOrders().find(o=>o.quotationId===row.quotationId);
    return {quote,order,matches,current:!!current&&(current.commercialVersion||1)===row.quotationVersion};
  };
  const ensure=(row:ThirdPartyHistory,actor?:ActorStamp)=>{
    const stored=db.prepare('SELECT payload FROM third_party_service_state WHERE id=?').get(key(row));
    let state:State=stored?JSON.parse(String(stored.payload)):{status:'ORCAMENTO_REALIZADO',sourceStatus:'ORCAMENTO_REALIZADO',paid:false,revision:0,events:[{status:'ORCAMENTO_REALIZADO',actor:row.actor,note:'Serviço registrado no orçamento.'}]};
    const ctx=context(row);
    // Previous versions are immutable records. Never carry a payment into another version.
    if(ctx.matches&&(ctx.current||state.revision===0)){
      const source=thirdPartySourceStatus(ctx.quote,ctx.current?ctx.order:undefined);
      if(source!==state.sourceStatus){const movement=[...(ctx.order?.statusHistory||[])].reverse().find(event=>event.newStatus===ctx.order?.productionStatus);state={...state,sourceStatus:source,status:source,revision:state.revision+1,events:[...state.events,{status:source,actor:actor||ctx.order?.updatedBy||ctx.quote?.updatedBy||row.actor,note:source==='PAUSADO'&&ctx.quote?.status==='EM_REVISAO'?'Orçamento em revisão.':ctx.quote?.status==='REJEITADO'?ctx.quote.rejectionReason:movement?.observation}]};}
    }
    if(!stored||JSON.parse(String(stored.payload)).revision!==state.revision)write(row,state);
    return {state,...ctx};
  };
  const rows=(partnerId?:string):ThirdPartyHistory[]=>(partnerId?db.prepare('SELECT payload FROM third_party_history WHERE third_party_id=? ORDER BY rowid DESC').all(partnerId):db.prepare('SELECT payload FROM third_party_history ORDER BY rowid DESC').all()).map(row=>JSON.parse(String(row.payload)));
  const history=(partnerId:string)=>rows(partnerId).map(row=>{const {state,quote,order,matches,current}=ensure(row);return {...row,status:state.paid?'PAGO':state.status,paid:state.paid,paidAt:state.paidAt,paidBy:state.paidBy,statusRevision:state.revision,statusHistory:state.events,canManage:matches&&current&&!!quote&&!['REJEITADO','CANCELADO','EXPIRADO'].includes(quote.status)&&order?.productionStatus!=='CANCELADO',canExecute:matches&&current&&quote?.status==='APROVADO'&&order?.productionStatus!=='CANCELADO',previousVersion:!matches||!current};});
  const sync=(quotationId:string,actor:ActorStamp)=>{for(const row of rows().filter(r=>r.quotationId===quotationId))ensure(row,actor);};
  const update=(partnerId:string,body:any,actor:ActorStamp,paymentAllowed:boolean)=>{
    const row=rows(partnerId).find(r=>r.quotationId===body.quotationId&&r.quotationVersion===body.quotationVersion&&r.id===body.id);
    const fail=(message:string,status=400)=>{throw Object.assign(new Error(message),{status});};
    if(!row)fail('Serviço não encontrado no histórico deste terceiro.',404);
    const {state,quote,order,matches,current}=ensure(row!);
    if(body.statusRevision!==state.revision)fail('A situação foi alterada. Atualize a ficha antes de salvar.',409);
    const manual=['EM_ANDAMENTO','AGUARDANDO_INFORMACAO_CLIENTE','PAUSADO','FINALIZADO'];
    if(body.paid!==undefined&&typeof body.paid!=='boolean')fail('Informe uma situação de pagamento válida.');
    if(body.paid!==undefined&&!paymentAllowed)fail('Este perfil não pode registrar pagamentos de terceiros.',403);
    // Undoing a mistaken payment keeps the original record, even after a later revision/refusal.
    const undo=body.paid===false&&state.paid;
    if(!undo&&(!matches||!current||!quote||['REJEITADO','CANCELADO','EXPIRADO'].includes(quote.status)||order?.productionStatus==='CANCELADO'))fail('Este serviço não pertence à versão aprovada atual. O histórico permanece disponível.',409);
    if(!undo&&(body.paid===true||['EM_ANDAMENTO','FINALIZADO'].includes(body.status))&&quote?.status!=='APROVADO')fail('Aguarde a aprovação do orçamento antes de executar ou registrar o pagamento.',409);
    if(body.status!==undefined&&!manual.includes(body.status))fail('Situação de serviço inválida.');
    if(state.paid&&body.status!==undefined&&!undo)fail('Desmarque o pagamento antes de alterar a situação.',409);
    const status=body.status||state.status,paid=body.paid??state.paid;
    if(status===state.status&&paid===state.paid)return history(partnerId);
    if(['PAUSADO','AGUARDANDO_INFORMACAO_CLIENTE'].includes(body.status)&&!(typeof body.note==='string'&&body.note.trim()))fail('Informe o motivo para registrar esta situação.');
    const note=typeof body.note==='string'?body.note.trim().slice(0,2000):'';
    const next:State={...state,status,paid,revision:state.revision+1,paidAt:paid?(state.paidAt||actor.at):undefined,paidBy:paid?(state.paidBy||actor):undefined,events:[...state.events,{status:paid?'PAGO':status,actor,note:note||(undo?'Marcação de pagamento desfeita.':undefined)}]};
    write(row!,next);return history(partnerId);
  };
  return {history,sync,update};
}
