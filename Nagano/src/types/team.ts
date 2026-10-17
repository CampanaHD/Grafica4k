import type { UserRole } from './index';
import type {PermissionMatrix} from '../utils/permissions';
export type AppModule = 'dashboard'|'quotations'|'customers'|'work_orders'|'kanban'|'pickup'|'finance'|'receipts'|'integrations'|'third_parties'|'activity'|'settings'|'inventory'|'payables'|'reports';
export interface TeamProfile { permissions?:PermissionMatrix; canViewCosts?:boolean; id: string; name: string; role: UserRole; color: string; active: boolean; modules?: AppModule[]; hasPin?: boolean; avatar?: string; phone?:string; email?:string; jobTitle?:string; username?:string; preferences?:{reduceMotion?:boolean} }
export interface ActorStamp { profileId: string; name: string; at: string }
export interface Activity { id: number; actor: ActorStamp; action: string; entity: string; entityId: string; title: string; previousStatus?: string; newStatus?: string }
export interface ThirdParty { id: string; name: string; services: string[]; phone: string; pixKey: string; pixHolder: string; pixQrCode?: string; notes: string; active: boolean; revision?: number; totalProvided?: number; approvedQuotationCount?: number }
export interface OutsourcedService { id: string; thirdPartyId: string; thirdPartyName: string; services?: string[]; value?: number; service?: string; quantity?: number; cost?: number; salePrice?: number }
export type ThirdPartyServiceStatus='ORCAMENTO_REALIZADO'|'ORCAMENTO_APROVADO'|'AGUARDANDO_INFORMACAO_CLIENTE'|'EM_ANDAMENTO'|'PAUSADO'|'FINALIZADO'|'PAGO'|'ORCAMENTO_NAO_APROVADO';
export interface ThirdPartyServiceEvent {status:ThirdPartyServiceStatus;actor:ActorStamp;note?:string}
export interface ThirdPartyHistory extends OutsourcedService { quotationId: string; quotationNumber: string; quotationVersion: number; actor: ActorStamp; includedInTotal?: boolean; status?:ThirdPartyServiceStatus; paid?:boolean; paidAt?:string; paidBy?:ActorStamp; statusRevision?:number; statusHistory?:ThirdPartyServiceEvent[]; canManage?:boolean; canExecute?:boolean; canPay?:boolean; previousVersion?:boolean }
