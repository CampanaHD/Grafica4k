import React,{createContext,useContext,useEffect,useState} from 'react';
import {LogOut,Users,ArrowRight,LockKeyhole} from 'lucide-react';
import type {TeamProfile} from '../types/team';
import {teamRequest,setActiveProfile,csrfHeader,rememberCsrf} from '../services/teamApi';
import {SecurityLogin,SecurityLink,useSecurityLink} from './SecurityLogin';
import {ProfileAvatar} from './ProfileAvatar';

export const profileRoleNames:Record<string,string>={ADMIN:'Administrador',SALES:'Vendas e balcão',DESIGN:'Arte-finalista',PRODUCTION:'Produção',FINISHING:'Acabamento',FINANCE:'Financeiro',READONLY:'Consulta',STOCK:'Estoque',ATTENDANCE:'Atendimento'};
const AccessContext=createContext<{profile:TeamProfile;switchProfile:()=>void;logout:()=>void}|null>(null);
export const useAccess=()=>{const value=useContext(AccessContext);if(!value)throw new Error('Selecione um perfil para entrar.');return value;};
export function AccessBoundary({children}:{children:React.ReactNode}){
  const securityLink=useSecurityLink(),[linkOpen,setLinkOpen]=useState(true);
  const [ready,setReady]=useState(false),[authenticated,setAuthenticated]=useState(false),[profiles,setProfiles]=useState<TeamProfile[]>([]),[profile,setProfile]=useState<TeamProfile|null>(null),[choosing,setChoosing]=useState(false);
  const [email,setEmail]=useState(''),[password,setPassword]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  const [pinProfile,setPinProfile]=useState<TeamProfile|null>(null),[pin,setPin]=useState('');
  const load=async()=>{try{const result=await teamRequest('/api/auth/session');setAuthenticated(result.authenticated);setProfiles(result.profiles);setProfile(result.profile);setActiveProfile(result.profile);}catch(error){setError((error as Error).message);}finally{setReady(true);}};
  useEffect(()=>{void load();const expired=()=>{setAuthenticated(false);setProfile(null);setActiveProfile(null);};window.addEventListener('nagano-session-expired',expired);return()=>window.removeEventListener('nagano-session-expired',expired);},[]);
  useEffect(()=>{const changed=()=>void load();window.addEventListener('nagano-profile-updated',changed);return()=>window.removeEventListener('nagano-profile-updated',changed);},[]);
  useEffect(()=>{if(!authenticated)return;const timer=setInterval(()=>void load(),15000);const refresh=()=>void load();window.addEventListener('focus',refresh);return()=>{clearInterval(timer);window.removeEventListener('focus',refresh);};},[authenticated]);
  useEffect(()=>{
    const original=window.fetch.bind(window);
    window.fetch=async(input,options)=>{
      const url=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url,location.href);
      const protectedApi=url.origin===location.origin&&url.pathname.startsWith('/api/')&&!url.pathname.startsWith('/api/auth/');
      const headers=new Headers(options?.headers || (input instanceof Request?input.headers:undefined));
      if(protectedApi)Object.entries(csrfHeader()).forEach(([key,value])=>headers.set(key,value));
      if(protectedApi&&profile)headers.set('X-Nagano-Profile',profile.id);
      const response=await original(input,{...options,headers});rememberCsrf(response);
      if(protectedApi&&response.status===401)window.dispatchEvent(new Event('nagano-session-expired'));
      if(protectedApi&&response.status===409&&response.headers.get('X-Nagano-Profile-Changed'))void load();
      if(protectedApi&&response.status===403&&response.headers.get('X-Nagano-Access-Changed'))void load();
      return response;
    };
    return()=>{window.fetch=original;};
  },[profile?.id]);
  useEffect(()=>{const channel=new BroadcastChannel('nagano-access');channel.onmessage=()=>{setChoosing(false);setPinProfile(null);setPin('');void load();};return()=>channel.close();},[]);
  const announce=()=>{const channel=new BroadcastChannel('nagano-access');channel.postMessage('changed');channel.close();};
  const logout=async()=>{await teamRequest('/api/auth/logout',{});setAuthenticated(false);setProfile(null);setActiveProfile(null);announce();};
  const select=async(selected:TeamProfile,pinValue?:string)=>{if(busy)return;if(selected.hasPin&&pinValue===undefined){setPinProfile(selected);setPin('');setError('');return;}setBusy(true);setError('');try{const result=await teamRequest('/api/auth/profile',{profileId:selected.id,pin:pinValue});setProfile(result.profile);setActiveProfile(result.profile);setChoosing(false);setPinProfile(null);setPin('');announce();}catch(error){setPin('');setError((error as Error).message);}finally{setBusy(false);}};
  if(securityLink&&linkOpen)return <SecurityLink value={securityLink} onClose={()=>{setLinkOpen(false);void load();}}/>;
  if(!ready)return <div className="min-h-screen bg-[#111522] grid place-items-center text-white">Abrindo a Nagano…</div>;
  if(authenticated&&profile&&!choosing)return <AccessContext.Provider value={{profile,switchProfile:()=>{setChoosing(true);setError('');void load();},logout:()=>void logout()}}><React.Fragment key={profile.id+profile.role+JSON.stringify(profile.modules)+JSON.stringify(profile.permissions)}>{children}</React.Fragment></AccessContext.Provider>;
  return <main className="min-h-screen bg-[#111522] text-white relative overflow-hidden p-6 grid place-items-center"><div className="profile-ambient" data-reduced={profile?.preferences?.reduceMotion||undefined} aria-hidden="true"><span/><span/><span/></div><div className="w-full max-w-5xl relative profile-picker-content">
    <img src="/brand/nagano-logo-white.png" alt="Nagano Comunicação Visual" className="w-56 mb-10 mx-auto"/>
    {authenticated?<section className="text-center"><p className="text-indigo-300 text-xs tracking-[.2em] uppercase mb-3">Sua equipe, no mesmo fluxo</p><h1 className="text-3xl font-bold">Quem vai trabalhar agora?</h1><p className="text-slate-400 text-sm mt-3">Escolha seu perfil. As atividades serão registradas com esse nome.</p><div className="flex flex-wrap justify-center gap-6 my-10">{profiles.filter(p=>p.active).map(p=><button disabled={busy} key={p.id} onClick={()=>void select(p)} className="group w-36 text-center disabled:opacity-50"><ProfileAvatar profile={p} className="mx-auto rounded-3xl h-28 w-28 text-3xl border-2 border-transparent group-hover:border-white transition"/><strong className="block mt-4 text-sm">{p.name}</strong><span className="text-xs text-slate-400">{profileRoleNames[p.role]}{p.hasPin&&<LockKeyhole size={12} className="inline ml-1.5" aria-label="Protegido por PIN"/>}</span></button>)}</div><button className="text-sm text-slate-300 inline-flex gap-2 items-center border border-slate-600 rounded-xl px-5 py-3" onClick={()=>void logout()}><LogOut size={16}/>Sair da conta</button></section>:<section className="grid md:grid-cols-2 gap-10 items-center"><div className="hidden md:block"><p className="text-indigo-300 text-xs tracking-[.2em] uppercase mb-4">Gestão & comunicação visual</p><h1 className="text-4xl font-bold leading-tight">Nagano<br/>Comunicação Visual</h1><p className="text-slate-400 mt-5 leading-relaxed max-w-sm">Orçamentos, equipe e produção conectados em um só lugar.</p><div className="h-1 w-44 mt-8 bg-gradient-to-r from-blue-500 via-fuchsia-500 to-amber-400 rounded-full"/></div><SecurityLogin onAuthenticated={result=>{setAuthenticated(true);setProfiles(result.profiles);setProfile(null);setActiveProfile(null);}}/></section>}
    {authenticated&&pinProfile&&<div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm grid place-items-center p-5"><form role="dialog" aria-modal="true" aria-label="Entrar com PIN" className="w-full max-w-sm bg-white text-slate-900 p-7 rounded-3xl shadow-2xl" onSubmit={e=>{e.preventDefault();void select(pinProfile,pin);}}><LockKeyhole className="text-indigo-600" size={28}/><h2 className="text-xl font-bold mt-4">Olá, {pinProfile.name}</h2><p className="text-sm text-slate-500 mt-2 mb-5">Digite seu PIN para entrar no perfil.</p><label className="text-sm font-semibold">PIN<input autoFocus required type="password" inputMode="numeric" autoComplete="off" aria-label="PIN de entrada" pattern="[0-9]{4,12}" maxLength={12} value={pin} onChange={e=>setPin(e.target.value.replace(/\D/g,''))} className="w-full border border-slate-200 rounded-xl p-3 mt-2 text-center tracking-[.3em] text-xl"/></label>{error&&<p role="alert" className="text-sm text-rose-700 mt-3">{error}</p>}<div className="flex gap-2 mt-6"><button type="button" disabled={busy} className="nagano-button secondary flex-1" onClick={()=>{setPinProfile(null);setPin('');setError('');}}>Voltar</button><button disabled={busy} className="nagano-button primary flex-1">{busy?'Entrando…':'Entrar no perfil'}</button></div></form></div>}
    {error&&!pinProfile&&<p role="alert" className="mt-5 mx-auto max-w-lg rounded-xl border border-rose-400/30 bg-rose-500/10 p-4 text-sm text-rose-200">{error}</p>}<p className="text-center text-slate-500 text-xs mt-12">Nagano Comunicação Visual · Gestão da gráfica</p>
  </div></main>;
}
