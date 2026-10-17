import type {Quotation,WorkOrder} from '../types';
import type {ThirdPartyServiceStatus} from '../types/team';
export const thirdPartyStatusLabels:Record<ThirdPartyServiceStatus,string>={ORCAMENTO_REALIZADO:'Orçamento realizado',ORCAMENTO_APROVADO:'Orçamento aprovado',AGUARDANDO_INFORMACAO_CLIENTE:'Aguardando Informação do Cliente',EM_ANDAMENTO:'Em andamento',PAUSADO:'Pausado',FINALIZADO:'Finalizado',PAGO:'Pago',ORCAMENTO_NAO_APROVADO:'Orçamento não aprovado'};
export const thirdPartyStatusTone=(status?:ThirdPartyServiceStatus)=>status==='PAGO'?'bg-emerald-50 text-emerald-800':status==='AGUARDANDO_INFORMACAO_CLIENTE'?'bg-sky-50 text-sky-800':status==='ORCAMENTO_NAO_APROVADO'?'bg-rose-50 text-rose-700':'bg-slate-100 text-slate-700';
export function thirdPartySourceStatus(quote?:Quotation,order?:WorkOrder):ThirdPartyServiceStatus {
  if(quote&&['REJEITADO','CANCELADO','EXPIRADO'].includes(quote.status)||order?.productionStatus==='CANCELADO')return 'ORCAMENTO_NAO_APROVADO';
  if(quote?.status==='EM_REVISAO')return 'PAUSADO';
  if(order?.productionStatus==='AGUARDANDO_INFORMACAO_CLIENTE')return 'AGUARDANDO_INFORMACAO_CLIENTE';
  if(order&&['PAUSADO','AGUARDANDO_MATERIAL'].includes(order.productionStatus))return 'PAUSADO';
  if(order&&['FINALIZADO','AGUARDANDO_RETIRADA','ENTREGUE'].includes(order.productionStatus))return 'FINALIZADO';
  if(order&&['PRODUCAO','ACABAMENTO'].includes(order.productionStatus))return 'EM_ANDAMENTO';
  return quote?.status==='APROVADO'||order?'ORCAMENTO_APROVADO':'ORCAMENTO_REALIZADO';
}
