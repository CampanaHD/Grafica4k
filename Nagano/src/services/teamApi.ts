import type { TeamProfile, ThirdParty, ThirdPartyHistory, Activity } from '../types/team';
import type { WorkOrder } from '../types';
export let activeProfile:TeamProfile|null=null;
let csrf='';
export const rememberCsrf=(response:Response)=>{const value=response.headers.get('X-Nagano-CSRF');if(value)csrf=value;};
export const csrfHeader=()=>csrf?{'X-Nagano-CSRF':csrf}:{};
export const setActiveProfile=(profile:TeamProfile|null)=>{activeProfile=profile;};
export async function teamRequest(url:string,body?:unknown,method=body===undefined?'GET':'POST') {
  const response=await fetch(url,{method,credentials:'same-origin',headers:{...csrfHeader(),...(body===undefined?{}:{'Content-Type':'application/json'})},body:body===undefined?undefined:JSON.stringify(body)});
  rememberCsrf(response);
  const result=await response.json();
  if(!response.ok||result.success===false)throw Object.assign(new Error(result.error||'Não foi possível concluir a operação.'),{code:result.code,status:response.status});
  return result;
}
export const teamApi={
  profiles:async():Promise<TeamProfile[]>=>(await teamRequest('/api/team/profiles')).data,
  saveProfile:async(profile:TeamProfile&{pin?:string;removePin?:boolean;captchaToken?:string}):Promise<TeamProfile>=>(await teamRequest(`/api/team/profiles/${encodeURIComponent(profile.id)}`,profile,'PUT')).data,
  activity:(after?:number):Promise<{data:Activity[];cursor:number}>=>teamRequest(`/api/team/activity${after?`?after=${after}`:''}`),
  orders:async():Promise<WorkOrder[]>=>(await teamRequest('/api/work-orders')).data,
  bootstrapOrders:async(orders:WorkOrder[]):Promise<WorkOrder[]>=>(await teamRequest('/api/work-orders/bootstrap',{orders})).data,
  saveOrder:async(order:WorkOrder,movementNote=''):Promise<WorkOrder>=>(await teamRequest(`/api/work-orders/${encodeURIComponent(order.id)}`,{...order,movementNote},'PUT')).data,
  thirdParties:async():Promise<ThirdParty[]>=>(await teamRequest('/api/third-parties')).data,
  saveThirdParty:async(partner:ThirdParty):Promise<ThirdParty>=>(await teamRequest(`/api/third-parties/${encodeURIComponent(partner.id)}`,partner,'PUT')).data,
  archiveThirdParty:(id:string)=>teamRequest(`/api/third-parties/${encodeURIComponent(id)}`,undefined,'DELETE'),
  setThirdPartyActive:(partner:ThirdParty,active:boolean)=>teamApi.saveThirdParty({...partner,active}),
  updateThirdPartyService:(partnerId:string,row:ThirdPartyHistory,changes:{paid?:boolean;status?:string;note?:string})=>teamRequest(`/api/third-parties/${encodeURIComponent(partnerId)}/service-status`,{quotationId:row.quotationId,quotationVersion:row.quotationVersion,id:row.id,statusRevision:row.statusRevision,...changes},'PUT'),
  saveMyProfile:(data:Partial<TeamProfile>&{pin?:string;currentPin?:string})=>teamRequest('/api/team/me',data,'PUT'),
  thirdPartyHistory:async(id:string):Promise<ThirdPartyHistory[]>=>(await teamRequest(`/api/third-parties/${encodeURIComponent(id)}/history`)).data,
};
