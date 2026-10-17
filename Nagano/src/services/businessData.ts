import {teamRequest,activeProfile} from './teamApi';
export const businessKeys:Record<string,string>={printshop_customers_v2:'customers',printshop_company_v2:'company',printshop_finishes_v2:'finishes',printshop_budget_settings_v2:'budget',printshop_payments_v2:'payments',printshop_receipts_v2:'receipts',printshop_customer_observations_v2:'customerObservations',printshop_customer_addresses_v2:'customerAddresses',printshop_customer_audit_logs_v2:'customerAudit',printshop_notion_v2:'notion',printshop_whatsapp_v2:'whatsapp'};
export let runtimeReset=false;
export let currentDataEpoch='initial';
let values:Record<string,any>={},revisions:Record<string,string>={},initialized:Record<string,boolean>={},enabled=false;
const pending=new Map<string,number>(),queues=new Map<string,Promise<void>>();
export const businessRead=(key:string,fallback:any)=>({handled:enabled&&!!businessKeys[key],value:values[businessKeys[key]]??(['company','budget','notion','whatsapp'].includes(businessKeys[key])?fallback:[])});
export function businessWrite(key:string,value:any){
  const name=businessKeys[key];if(!enabled||!name)return false;
  if(['receipts','payments'].includes(name))return true;
  values[name]=value;pending.set(name,(pending.get(name)||0)+1);
  const task=(queues.get(name)||Promise.resolve()).catch(()=>{}).then(async()=>{
    try{const result=await teamRequest('/api/erp/business/'+name,{value,revision:revisions[name]},'PUT');revisions[name]=result.revision;}
    catch(e){window.dispatchEvent(new CustomEvent('nagano-business-error',{detail:(e as Error).message}));throw e;}
    finally{pending.set(name,(pending.get(name)||1)-1);}
  });queues.set(name,task);void task.catch(()=>{});return true;
}
export async function flushBusiness(){await Promise.all([...queues.values()]);}
export async function refreshBusiness(){const result=await teamRequest('/api/erp/business');initialized=result.initialized||{};for(const name of Object.keys(result.data))if(!pending.get(name)){values[name]=result.data[name];revisions[name]=result.revisions[name];}window.dispatchEvent(new Event('nagano-business-refreshed'));return result;}
export async function initializeBusiness(){
  enabled=false;values={};revisions={};pending.clear();queues.clear();
  const runtime=await teamRequest('/api/runtime');runtimeReset=runtime.legacyImportDisabled===true;currentDataEpoch=runtime.dataEpoch||'initial';
  if(activeProfile?.role==='ADMIN'&&!runtimeReset){
    const records:Record<string,string>={};for(const [key,name] of Object.entries({...businessKeys,printshop_work_orders_v2:'workOrders'})){const raw=localStorage.getItem(key);if(raw!==null&&(name!=='workOrders'||!localStorage.getItem('printshop_erp_work_orders_migrated_v1')))records[name]=raw;}
    if(Object.keys(records).length){const result=await teamRequest('/api/erp/business/bootstrap',{records});
      for(const [key,name] of Object.entries(businessKeys)){const raw=records[name];if(raw&&result.migratedHashes?.[name]){const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(raw)),hash=[...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('');if(hash===result.migratedHashes[name]&&localStorage.getItem(key)===raw)localStorage.removeItem(key);}}
      if(result.migratedHashes?.workOrders)localStorage.setItem('printshop_erp_work_orders_migrated_v1',result.migratedHashes.workOrders);
    }
  }
  await refreshBusiness();
  // A reset blocks operational imports, but essential preferences from the original
  // browser may still be preserved once, only when the server has no configuration.
  if(activeProfile?.role==='ADMIN'&&runtimeReset){
    for(const [key,name] of Object.entries(businessKeys)){
      if(!['company','budget','notion','whatsapp'].includes(name)||initialized[name])continue;
      const raw=localStorage.getItem(key);if(!raw)continue;let value:any;try{value=JSON.parse(raw);}catch{continue;}
      if(!value||typeof value!=='object'||Array.isArray(value))continue;
      await teamRequest('/api/erp/business/'+name,{value,revision:revisions[name]},'PUT');
      if(localStorage.getItem(key)===raw)localStorage.removeItem(key);
    }
    await refreshBusiness();
  }
  enabled=true;
}
