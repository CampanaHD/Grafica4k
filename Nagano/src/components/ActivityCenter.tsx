import React,{useEffect,useRef,useState} from 'react';
import {Bell,CheckCircle2} from 'lucide-react';
import {teamApi} from '../services/teamApi';
import type {Activity} from '../types/team';

export function useActivities(onUpdate?:()=>void){
  const [events,setEvents]=useState<Activity[]>([]),[notice,setNotice]=useState<Activity|null>(null),[error,setError]=useState('');
  const cursor=useRef<number|null>(null),update=useRef(onUpdate);update.current=onUpdate;
  useEffect(()=>{let active=true,running=false;
    const load=async()=>{if(running)return;running=true;try{const result=await teamApi.activity(cursor.current??undefined);if(!active)return;const initial=cursor.current===null;cursor.current=result.cursor;setError('');if(result.data.length){setEvents(old=>[...old,...result.data].filter((v,i,a)=>a.findIndex(other=>other.id===v.id)===i).slice(-200));if(!initial){const latest=result.data[result.data.length-1];setNotice(latest);update.current?.();if(typeof Notification!=='undefined'&&Notification.permission==='granted'&&localStorage.getItem('nagano-desktop-notifications')==='true'){for(const entry of result.data.filter(e=>e.entity==='WORK_ORDER'&&e.action==='MOVIMENTAR'))new Notification('Nagano · Produção',{body:entry.title,tag:`nagano-activity-${entry.id}`,icon:'/brand/nagano-logo-white.png'});}}}}catch(e){if(active)setError((e as Error).message);}finally{running=false;}};
    void load();const timer=setInterval(()=>void load(),4000);return()=>{active=false;clearInterval(timer);};
  },[]);
  useEffect(()=>{if(!notice)return;const timer=setTimeout(()=>setNotice(null),6500);return()=>clearTimeout(timer);},[notice]);
  return {events,notice,error};
}
export function ActivityCenter({events,error}:{events:Activity[];error?:string}){
  const [permission,setPermission]=useState(typeof Notification==='undefined'?'unsupported':Notification.permission);
  const [enabled,setEnabled]=useState(localStorage.getItem('nagano-desktop-notifications')==='true');
  return <div className="space-y-5"><div className="module-heading"><h1 className="text-xl font-bold">Atividades da equipe</h1><p className="text-sm text-slate-500 mt-2">Quem criou, editou ou movimentou cada serviço, com data e horário.</p></div><section className="bg-white border border-slate-200 p-5 rounded-2xl flex flex-wrap justify-between items-center gap-4"><div className="flex gap-3 items-center"><Bell className="text-indigo-600"/><div><h2 className="font-bold text-sm">Notificações no Windows</h2><p className="text-xs text-slate-500 mt-1">Receba os movimentos de produção enquanto o sistema estiver aberto neste navegador.</p></div></div><button className="nagano-button secondary" disabled={permission==='unsupported'} onClick={async()=>{if(enabled){localStorage.setItem('nagano-desktop-notifications','false');setEnabled(false);return;}const allowed=await Notification.requestPermission();setPermission(allowed);if(allowed==='granted'){localStorage.setItem('nagano-desktop-notifications','true');setEnabled(true);}}}>{enabled&&permission==='granted'?'Desativar notificações':'Ativar notificações'}</button>{permission==='denied'&&<p className="w-full text-xs text-amber-800">As notificações estão bloqueadas nas permissões deste navegador.</p>}</section>{error&&<p role="alert" className="text-sm text-rose-700">{error}</p>}
    <section className="bg-white border border-slate-200 rounded-2xl divide-y divide-slate-100">{[...events].reverse().map(event=><article key={event.id} className="p-4 flex gap-3"><CheckCircle2 size={18} className="text-indigo-500 mt-1 shrink-0"/><div><p className="text-sm text-slate-800">{event.title}</p><p className="text-xs text-slate-500 mt-1">{event.actor.name} · {new Date(event.actor.at).toLocaleString('pt-BR')}</p></div></article>)}{!events.length&&<p className="text-sm text-slate-500 p-6">As novas atividades da equipe aparecerão aqui.</p>}</section>
  </div>;
}
