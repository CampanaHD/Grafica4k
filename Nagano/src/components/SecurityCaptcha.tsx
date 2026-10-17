import React,{useEffect,useRef,useState} from 'react';
import {teamRequest} from '../services/teamApi';
export function useSecurityConfig(){const [config,setConfig]=useState<any>(null);useEffect(()=>{let active=true;teamRequest('/api/auth/security-config').then(c=>{if(active)setConfig(c);}).catch(()=>{});return()=>{active=false;};},[]);return config;}
let loading:Promise<void>|undefined;
const load=()=>loading??=(new Promise<void>((resolve,reject)=>{if((window as any).turnstile){resolve();return;}const script=document.createElement('script');script.src='https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';script.async=true;script.onload=()=>resolve();script.onerror=()=>{loading=undefined;reject(new Error());};document.head.appendChild(script);}));
export function SecurityCaptcha({siteKey,action,onToken,revision=0}:{siteKey:string;action:string;onToken:(value:string)=>void;revision?:number}){
  const ref=useRef<HTMLDivElement>(null),callback=useRef(onToken),[state,setState]=useState('Verificando…');callback.current=onToken;
  useEffect(()=>{let disposed=false,id:string|undefined;callback.current('');setState('Verificando…');void load().then(()=>{if(disposed||!ref.current)return;id=(window as any).turnstile.render(ref.current,{sitekey:siteKey,action,language:'pt-br',theme:'light',size:'flexible',callback:(value:string)=>{callback.current(value);setState('Verificação concluída');},'expired-callback':()=>{callback.current('');setState('A verificação expirou. Tente novamente.');},'error-callback':()=>{callback.current('');setState('Não foi possível verificar. Tente novamente.');}});}).catch(()=>setState('Não foi possível carregar a verificação. Atualize a página.'));return()=>{disposed=true;if(id)(window as any).turnstile?.remove(id);};},[siteKey,action,revision]);
  return <div className="mt-4 max-w-full"><div ref={ref}/><p role="status" className="text-xs text-slate-500 mt-1">{state}</p></div>;
}
