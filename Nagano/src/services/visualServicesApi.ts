import type { Service } from '../types';
async function request(method:string,body?:unknown) {
  const response=await fetch('/api/visual-services'+(method==='POST'?'/bootstrap':''),{method,...(body?{headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{})});
  const result=await response.json();if(!response.ok||!result.success)throw new Error(result.error||'Não foi possível carregar os serviços.');
  return result as {data:Service[];revision:string};
}
export const visualServicesApi={list:()=>request('GET'),bootstrap:(services:Service[])=>request('POST',{services}),save:(services:Service[],revision:string)=>request('PUT',{services,revision})};
