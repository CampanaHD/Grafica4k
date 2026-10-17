import {isDeepStrictEqual} from 'node:util';
import {canPerform,type PermissionResource,type PermissionAction} from '../src/utils/permissions';
/** Applies in addition to the existing module, field, revision and ownership guards. */
export function actionPermission(req:any):{resource:PermissionResource;action:PermissionAction}|undefined{
 const url=req.originalUrl.split('?')[0].replace(/\/$/,''),method=req.method,read=['GET','HEAD','OPTIONS'].includes(method),body=req.body||{};
 if(url.startsWith('/api/auth/')||url.startsWith('/api/security/')||url.startsWith('/api/team/')||url==='/api/runtime'||url==='/api/health')return;
 const catalogResource:PermissionResource=['settings','quotations','inventory','reports'].find(r=>canPerform(req.naganoProfile,r as PermissionResource,'view')) as PermissionResource||'settings';
 let resource:PermissionResource|undefined;
 if(url.startsWith('/api/admin/'))resource='backups';
 else if(url.startsWith('/api/quotations'))resource='quotations';
 else if(url.startsWith('/api/quotation-retention'))resource='settings';
 else if(url.startsWith('/api/work-orders'))resource='work_orders';
 else if(url.startsWith('/api/third-parties'))resource=read&&!url.endsWith('/history')&&!req.naganoProfile.modules?.includes('third_parties')?'quotations':'third_parties';
 else if(url.includes('/erp/business/'))resource=url.endsWith('/customers')||/customerObservations|customerAddresses|customerAudit/.test(url)?'customers':url.endsWith('/bootstrap')?'settings':'settings';
 else if(url.includes('/erp/counts'))resource='inventory_counts';
 else if(url.includes('/erp/suppliers'))resource='suppliers';
 else if(url.includes('/erp/payables'))resource='payables';
 else if(url.includes('/erp/payments')||url.includes('/erp/receipts'))resource='finance';
 else if(url.includes('/erp/attachments'))resource='payables';
 else if(url.includes('/erp/reports'))resource='reports';
 else if(/\/erp\/(items|rolls|movements|purchases|compositions)/.test(url))resource='inventory';
 else if(url.startsWith('/api/futura'))resource='settings';
 else if(url.startsWith('/api/materials'))resource=read?catalogResource:'inventory';
 else if(/\/api\/(visual-services|graphic-products)/.test(url))resource=read?catalogResource:'settings';
 else if(url.startsWith('/api/notion')||url.startsWith('/api/whatsapp'))resource='integrations';
 if(!resource)return;
 let action:PermissionAction=read||/calculate|simulate|preview|validate|\/search$|\/detail$/.test(url)?'view':method==='DELETE'?'delete':method==='PUT'?(body.revision?'edit':'create'):'create';
 if(url.includes('/erp/business/'))action=read||url.endsWith('/customers')?'view':'edit';
 if(method==='PUT'&&['/api/visual-services','/api/materials','/api/erp/business/finishes'].includes(url))action='view';
 if(/^\/api\/materials\/[^/]+(?:\/status)?$/.test(url)&&!read&&method!=='DELETE')action='edit';
 if(url.endsWith('/service-status'))action='edit';
 if(/\/quotations\/[^/]+\/(reject|reopen)$/.test(url))action='edit';
 if(/\/purchases\/[^/]+\/receive$/.test(url))action='edit';
 if(/\/purchases\/[^/]+\/cancel$/.test(url))action='delete';
 if(/approve|\/payment|\/payables\/.*\/action|\/counts\/.*\/approve/.test(url)||resource==='quotations'&&body.status==='APROVADO')action='approve';
 if(/\/movements$/.test(url))action='edit';
 if(/\/counts\/.*\/(submit|cancel)$/.test(url))action='edit';
 if(url.startsWith('/api/work-orders')&&!read){resource=body.productionStatus&&['PRODUCTION','DESIGN','FINISHING'].includes(req.naganoProfile.role)?'kanban':'work_orders';action=body.revision?'edit':'create';}
 return {resource,action};
}
export function checkActionPermission(req:any){
 const needed=actionPermission(req);if(!needed)return;
 if(req.originalUrl.split('?')[0].endsWith('/bootstrap')&&req.naganoProfile.role!=='ADMIN')throw Object.assign(new Error('Somente administrador pode importar dados antigos.'),{status:403});
 if(!canPerform(req.naganoProfile,needed.resource,needed.action))throw Object.assign(new Error('Seu perfil não tem permissão para esta ação.'),{status:403});
}

export function requireCollectionActions(profile:any,resource:PermissionResource,before:any[],after:any[]){
 if(!profile)return;
 const previous=new Map(before.map(row=>[row.id,row])),next=new Map(after.map(row=>[row.id,row]));
 const check=(action:PermissionAction)=>{if(!canPerform(profile,resource,action))throw Object.assign(new Error('Sem permissão para '+({create:'criar',edit:'editar',delete:'excluir'} as any)[action]+' registros desta lista.'),{status:403});};
 for(const row of after){const old=previous.get(row.id);if(!old)check('create');else if(!isDeepStrictEqual(old,row))check('edit');}
 for(const old of before)if(!next.has(old.id))check('delete');
}
