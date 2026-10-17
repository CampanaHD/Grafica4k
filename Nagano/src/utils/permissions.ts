import type {TeamProfile,AppModule} from '../types/team';
export const permissionActions=['view','create','edit','delete','approve'] as const;
export type PermissionAction=typeof permissionActions[number];
export const permissionResources=['dashboard','customers','quotations','work_orders','kanban','pickup','inventory','suppliers','inventory_counts','finance','payables','receipts','reports','third_parties','settings','integrations','activity','costs','backups'] as const;
export type PermissionResource=typeof permissionResources[number];
export type PermissionMatrix=Partial<Record<PermissionResource,Partial<Record<PermissionAction,boolean>>>>;
export const permissionLabels:Record<PermissionResource,string>={dashboard:'Visão geral',customers:'Clientes',quotations:'Orçamentos',work_orders:'Pedidos / ordens',kanban:'Produção',pickup:'Retiradas',inventory:'Estoque',suppliers:'Fornecedores',inventory_counts:'Inventário físico',finance:'Contas a receber',payables:'Contas a pagar',receipts:'Recibos',reports:'Relatórios',third_parties:'Terceiros',settings:'Configurações',integrations:'Integrações',activity:'Atividades',costs:'Custos e margens',backups:'Backup / restauração / reset'};
export const permissionModule=(resource:string):AppModule=>(resource==='suppliers'||resource==='inventory_counts'?'inventory':resource==='costs'?'reports':resource==='backups'?'settings':resource) as AppModule;
export function defaultPermissions(role:string,modules:string[]=[]):PermissionMatrix{
 const result:PermissionMatrix={};for(const resource of permissionResources){const visible=resource!=='backups'&&(modules.includes(permissionModule(resource))||resource==='costs'&&role==='FINANCE');result[resource]={view:visible,create:false,edit:false,delete:false,approve:false};}
 const allow=(resources:PermissionResource[],actions:PermissionAction[])=>{for(const r of resources)for(const a of actions)result[r]![a]=a==='view'||result[r]!.view===true;};
 if(role==='ADMIN'){for(const r of permissionResources)result[r]=Object.fromEntries(permissionActions.map(a=>[a,true]));return result;}
 if(role==='READONLY')return result;
 if(role==='FINANCE')allow(['finance','payables','receipts'],['create','edit','approve']);
 if(role==='STOCK')allow(['inventory','suppliers','inventory_counts'],['create','edit']);
 if(['SALES','ATTENDANCE'].includes(role))allow(['customers','quotations','work_orders','third_parties'],['create','edit']);
 if(role==='SALES')allow(['quotations','pickup'],['approve','edit']);
 if(['DESIGN','PRODUCTION','FINISHING'].includes(role))allow(['kanban','work_orders'],['edit']);
 return result;
}
export function validatePermissions(value:unknown):PermissionMatrix{
 if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Matriz de permissões inválida.');
 const result:PermissionMatrix={};for(const [r,actions] of Object.entries(value)){if(!permissionResources.includes(r as PermissionResource)||!actions||typeof actions!=='object'||Array.isArray(actions))throw new Error('Recurso de permissão inválido.');const target:any={};for(const [a,v] of Object.entries(actions)){if(!permissionActions.includes(a as PermissionAction)||typeof v!=='boolean')throw new Error('Ação de permissão inválida.');target[a]=v;}result[r as PermissionResource]=target;}return result;
}
export function canPerform(profile:TeamProfile|null|undefined,resource:PermissionResource,action:PermissionAction){
 if(!profile)return false;if(profile.role==='ADMIN')return true;if(resource==='backups')return false;if(profile.role==='READONLY'&&action!=='view')return false;
 const module=permissionModule(resource);if(resource!=='costs'&&profile.modules&&!profile.modules.includes(module))return false;
 if(profile.permissions)return profile.permissions[resource]?.view===true&&(action==='view'||profile.permissions[resource]?.[action]===true);
 return action==='view'||profile.role!=='READONLY';
}
