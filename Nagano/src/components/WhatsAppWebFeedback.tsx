import React,{useEffect,useState} from 'react';
import {LoaderCircle} from 'lucide-react';
import {whatsappBridgeNotice,cancelWhatsAppPreparation,type WhatsAppWebResult} from '../services/whatsappWeb';
const labels:Record<string,string>={CLOSED:'Abrindo WhatsApp…',OPENING:'Abrindo WhatsApp…',WAITING_FOR_UI:'Aguardando WhatsApp carregar…',READY:'WhatsApp pronto.',SEARCHING_CONTACT:'Procurando contato…',OPENING_CHAT:'Abrindo conversa…',INSERTING_MESSAGE:'Inserindo mensagem…',COMPLETED:'Mensagem preparada.',ERROR:'Preparação interrompida.',CANCELLED:'Preparação cancelada.'};
export function WhatsAppWebFeedback(){
  const [notice,setNotice]=useState<WhatsAppWebResult|null>(null);
  useEffect(()=>{const listener=(event:Event)=>setNotice((event as CustomEvent<WhatsAppWebResult>).detail);window.addEventListener(whatsappBridgeNotice,listener);return()=>window.removeEventListener(whatsappBridgeNotice,listener);},[]);
  useEffect(()=>{if(!notice||notice.pending)return;const timer=setTimeout(()=>setNotice(null),notice.ok?5500:10000);return()=>clearTimeout(timer);},[notice]);
  if(!notice)return null;
  return <div role={notice.pending||notice.ok||notice.code==='CANCELLED'?'status':'alert'} aria-live="polite" className={`fixed bottom-5 right-5 left-5 sm:left-auto z-[100] sm:max-w-md rounded-xl border p-4 pr-10 text-sm shadow-lg ${notice.pending?'border-indigo-200 bg-white text-slate-800':notice.ok?'border-emerald-200 bg-emerald-50 text-emerald-950':'border-amber-200 bg-amber-50 text-amber-950'}`}>
    <button type="button" aria-label="Fechar aviso do WhatsApp" onClick={()=>setNotice(null)} className="absolute top-2 right-3 text-lg leading-none">×</button>
    <div className="flex gap-3 items-center">{notice.pending&&<LoaderCircle size={18} className="animate-spin motion-reduce:animate-none shrink-0"/>}<span>{notice.pending?notice.progressText||labels[notice.state||'WAITING_FOR_UI']:notice.ok?'Mensagem preparada. Confira e clique em Enviar no WhatsApp.':notice.error||'Não foi possível preparar a mensagem. Confira o WhatsApp e tente novamente.'}</span></div>
    {notice.pending&&<button type="button" className="text-xs font-semibold text-slate-500 hover:text-indigo-700 mt-3" onClick={cancelWhatsAppPreparation}>Cancelar preparação</button>}
  </div>;
}
