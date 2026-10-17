import {canPerform} from './permissions';
import type {AppModule, TeamProfile} from '../types/team';
import type {UserRole, WorkOrder} from '../types';

export const moduleNames:Record<AppModule,string>={dashboard:'Visão geral',quotations:'Orçamentos',customers:'Clientes',work_orders:'Ordens de serviço',kanban:'Produção',pickup:'Retiradas',finance:'Contas a receber',receipts:'Recibos',integrations:'Integrações',third_parties:'Terceiros',activity:'Atividades da equipe',settings:'Configurações',inventory:'Estoque',payables:'Contas a pagar',reports:'Relatórios'};
export const canViewCosts=(p:TeamProfile|null|undefined)=>!!p&&(p.role==='ADMIN'||(p.role==='FINANCE'||p.canViewCosts===true)&&canPerform(p,'costs','view'));
export const allModules=Object.keys(moduleNames) as AppModule[];
export const canAccess=(profile:TeamProfile|null|undefined,module:string)=>!!profile&&(profile.role==='ADMIN'||(profile.modules??allModules).includes(module as AppModule)&&canPerform(profile,module as any,'view'));
export const defaultModules=(role:UserRole):AppModule[]=>role==='ADMIN'?[...allModules]:role==='STOCK'?['dashboard','inventory','activity']:role==='ATTENDANCE'?['dashboard','customers','quotations','work_orders','pickup','activity']:role==='DESIGN'||role==='PRODUCTION'||role==='FINISHING'?['dashboard','work_orders','kanban','activity']:role==='FINANCE'?['dashboard','customers','work_orders','pickup','finance','receipts','payables','reports','activity']:['dashboard','quotations','customers','work_orders','kanban','pickup','third_parties','activity','inventory'];
export const canReadOrders=(p:TeamProfile)=>['dashboard','customers','work_orders','kanban','pickup','finance','quotations','reports'].some(key=>canAccess(p,key));
export const canReadOrderAmounts=(p:TeamProfile)=>['quotations','pickup','finance','receipts','reports'].some(key=>canAccess(p,key));
export const canRecordPayments=(p:TeamProfile)=>p.role!=='READONLY'&&canPerform(p,'finance','approve')&&canReadOrderAmounts(p)&&(p.modules!==undefined||['ADMIN','SALES','FINANCE'].includes(p.role));
/** Technical profiles receive production data only, even when requesting the API directly. */
export function orderForProfile(order:WorkOrder,p:TeamProfile):WorkOrder {
  if(canReadOrderAmounts(p))return order;
  const hidden=new Set(['totalAmount','amountPaid','remainingBalance','paymentStatus','paymentMethod','paymentTerms','outsourcedServices','items','calculationSnapshot','recommendedSnapshot','pricingSnapshot','movementNote']);
  const result=Object.fromEntries(Object.entries(order).filter(([key])=>!hidden.has(key))) as unknown as WorkOrder;
  result.items=order.items?.map(item=>({id:item.id,serviceName:item.serviceName,description:item.description,quantity:item.quantity,widthCm:item.widthCm,heightCm:item.heightCm,materialName:item.materialName,finishings:item.finishings?.map(f=>({finishingName:f.finishingName}))} as any));
  result.outsourcedServices=order.outsourcedServices?.map(row=>({id:row.id,thirdPartyId:row.thirdPartyId,thirdPartyName:row.thirdPartyName,services:row.services,service:row.service}));
  return result;
}
