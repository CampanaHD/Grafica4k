import React,{useEffect,useRef,useState} from 'react';
import {UserRound,Users,LogOut,ChevronDown} from 'lucide-react';
import {useAccess} from './AccessBoundary';
import {ProfileAvatar} from './ProfileAvatar';
import {MyProfile} from './MyProfile';
export function ProfileMenu(){
  const access=useAccess(),[show,setShow]=useState(false),ref=useRef<HTMLDetailsElement>(null);
  useEffect(()=>{const outside=(event:PointerEvent)=>{if(!ref.current?.contains(event.target as Node)&&ref.current)ref.current.open=false;};const escape=(event:KeyboardEvent)=>{if(event.key==='Escape'&&ref.current?.open){ref.current.open=false;ref.current.querySelector('summary')?.focus();}};document.addEventListener('pointerdown',outside);document.addEventListener('keydown',escape);return()=>{document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',escape);};},[]);
  const close=()=>{if(ref.current)ref.current.open=false;};
  return <><details ref={ref} className="profile-menu relative"><summary aria-label="Abrir menu do perfil" className="flex items-center gap-2 text-left cursor-pointer list-none"><ProfileAvatar profile={access.profile} className="profile-avatar"/><span className="profile-menu-name"><span className="profile-caption block">PERFIL ATUAL</span><strong className="text-xs text-slate-700">{access.profile.name}</strong></span><ChevronDown size={14} className="text-slate-400"/></summary><div aria-label="Opções do perfil" className="absolute right-0 top-full mt-3 w-56 max-w-[calc(100vw-2rem)] bg-white rounded-xl border border-slate-200 shadow-lg p-2 z-50"><p className="px-3 py-2 text-xs text-slate-500 truncate border-b border-slate-100 mb-1">{access.profile.name}</p>{[{label:'Meu Perfil',icon:UserRound,action:()=>setShow(true)},{label:'Trocar Usuário',icon:Users,action:access.switchProfile},{label:'Sair',icon:LogOut,action:access.logout}].map(item=><button key={item.label} type="button" className="flex items-center gap-3 w-full px-3 py-2.5 text-sm text-slate-700 hover:bg-slate-50 rounded-lg" onClick={()=>{close();item.action();}}><item.icon size={17}/>{item.label}</button>)}</div></details>{show&&<MyProfile onClose={()=>setShow(false)}/>}</>;
}
