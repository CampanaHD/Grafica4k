import test from 'node:test';
import assert from 'node:assert/strict';
import {setActiveProfile} from '../src/services/teamApi';
import {initializeBusiness,businessRead} from '../src/services/businessData';
import {storage} from '../src/services/storage';
test('after reset, original browser preserves essential settings once without importing operational records',async()=>{
 const previousFetch=globalThis.fetch,previousWindow=globalThis.window,previousStorage=globalThis.localStorage;
 const local=new Map([['printshop_company_v2',JSON.stringify({companyName:'Nagano existente'})],['printshop_budget_settings_v2',JSON.stringify({defaultValidityDays:7})],['printshop_notion_v2',JSON.stringify({enabled:false})],['printshop_customers_v2',JSON.stringify([{id:'old-client',name:'Não reimportar'}])],['printshop_materials_v2',JSON.stringify([{id:'old-material'}])]]);
 const saved:any={whatsapp:{enabled:true}},calls:string[]=[];
 Object.assign(globalThis,{window:new EventTarget(),localStorage:{getItem:(k:string)=>local.get(k)??null,setItem:(k:string,v:string)=>local.set(k,v),removeItem:(k:string)=>local.delete(k)}});
 globalThis.fetch=async(input:any,options:any={})=>{const url=String(input);calls.push((options.method||'GET')+' '+url);let body:any;
 if(url==='/api/runtime')body={success:true,dataEpoch:'reset-test',legacyImportDisabled:true};
 else if(url==='/api/erp/business')body={success:true,data:{...saved,customers:[],finishes:[]},revisions:{company:'r-company',budget:'r-budget',notion:'r-notion',whatsapp:'r-whatsapp'},initialized:{company:!!saved.company,budget:!!saved.budget,notion:!!saved.notion,whatsapp:true}};
 else{assert.equal(options.method,'PUT');const name=url.split('/').pop()!;assert.ok(['company','budget','notion','whatsapp'].includes(name));saved[name]=JSON.parse(options.body).value;body={success:true,data:saved[name],revision:'next'};}
 return new Response(JSON.stringify(body),{status:200,headers:{'content-type':'application/json'}});
 };
 setActiveProfile({id:'administrator',role:'ADMIN'} as any);
 try{await initializeBusiness();assert.equal(saved.company.companyName,'Nagano existente');assert.equal(saved.budget.defaultValidityDays,7);assert.equal(saved.whatsapp.enabled,true);assert.deepEqual(businessRead('printshop_customers_v2',[]).value,[]);assert.deepEqual(storage.getMaterials(),[]);assert.ok(local.has('printshop_customers_v2'));assert.equal(calls.some(c=>c.includes('bootstrap')),false);assert.equal(calls.filter(c=>c.startsWith('PUT')).length,3);await initializeBusiness();assert.equal(calls.filter(c=>c.startsWith('PUT')).length,3);}
 finally{globalThis.fetch=previousFetch;Object.assign(globalThis,{window:previousWindow,localStorage:previousStorage});setActiveProfile(null);}
});
