import React,{useEffect,useState} from 'react';
import {DatabaseBackup,AlertTriangle} from 'lucide-react';
import {teamRequest} from '../services/teamApi';
import {useAccess} from './AccessBoundary';
export function AdminBackupNotice({onSettings}:{onSettings:()=>void}){
 const {profile}=useAccess(),[state,setState]=useState<any>(null);useEffect(()=>{if(profile.role!=='ADMIN')return;const load=()=>void teamRequest('/api/admin/backup-summary').then(setState).catch(()=>{});load();const timer=setInterval(load,60000);return()=>clearInterval(timer);},[profile.role]);if(profile.role!=='ADMIN'||!state)return null;
 const failure=state.records?.[0]?.status==='INVALID'||state.lastBackup?.externalStatus==='FAILED',last=state.lastBackup;
 return <div className={`rounded-xl border p-4 flex flex-wrap items-center justify-between gap-3 ${failure?'border-rose-200 bg-rose-50':'border-slate-200 bg-white'}`}><div className="flex items-start gap-3">{failure?<AlertTriangle size={19} className="text-rose-700"/>:<DatabaseBackup size={19} className="text-indigo-600"/>}<div><p className="text-sm font-semibold text-slate-800">{failure?'Backup precisa de atenção':last?'Backup validado':'Backup ainda não realizado'}</p><p className="text-xs text-slate-500 mt-1">{last?new Date(last.createdAt).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'}):'Abra a área de segurança para criar a primeira cópia.'}{state.externalConfigured?'':' · Cópia externa aguardando configuração'}</p><p className="text-xs text-slate-500 mt-1">Próximo: {state.config?.enabled?new Date(state.nextBackup).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'}):'Agenda desativada'}</p></div></div><button className="nagano-button secondary" onClick={onSettings}>Segurança e backups</button></div>;
}
