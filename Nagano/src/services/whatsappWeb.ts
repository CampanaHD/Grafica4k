import {normalizeBrazilianPhone} from '../utils/whatsappUtils';
export interface WhatsAppWebResult {ok:boolean;error?:string;reused?:boolean;version?:string;code?:string;state?:string;pending?:boolean;progressText?:string}
export function supportsLiveWhatsAppDraft(version?:string):boolean {const p=version?.match(/^(\d+)\.(\d+)\./);return !!p&&(Number(p[1])>1||(Number(p[1])===1&&Number(p[2])>=1));}
export function supportsWhatsAppStartup(version?:string):boolean {const p=version?.match(/^(\d+)\.(\d+)\.(\d+)/);return !!p&&(Number(p[1])>1||(Number(p[1])===1&&(Number(p[2])>1||(Number(p[2])===1&&Number(p[3])>=5))));}
export function supportsReliableWhatsAppFlow(version?:string):boolean {const p=version?.match(/^(\d+)\.(\d+)\.(\d+)$/);return !!p&&(Number(p[1])>1||(Number(p[1])===1&&Number(p[2])>=2));}
export const whatsappBridgeNotice='nagano-whatsapp-notice';
const channel='nagano-whatsapp-v1';
const progressStates=['CLOSED','OPENING','WAITING_FOR_UI','READY','SEARCHING_CONTACT','OPENING_CHAT','INSERTING_MESSAGE','COMPLETED','ERROR','CANCELLED'];
const notify=(detail:WhatsAppWebResult)=>window.dispatchEvent(new CustomEvent(whatsappBridgeNotice,{detail}));
export function requestWhatsAppBridge(action:'PING'|'OPEN_CHAT',phone='',text='',options:{signal?:AbortSignal;onProgress?:(state:string)=>void}={}):Promise<WhatsAppWebResult>{
  const requestId=crypto.randomUUID();
  return new Promise(resolve=>{
    let settled=false;
    const finish=(result:WhatsAppWebResult)=>{if(settled)return;settled=true;window.clearTimeout(timer);window.removeEventListener('message',listener);options.signal?.removeEventListener('abort',cancel);resolve(result);};
    const cancel=()=>{if(action==='OPEN_CHAT')window.postMessage({channel,direction:'app',requestId:crypto.randomUUID(),action:'CANCEL',targetRequestId:requestId},window.location.origin);finish({ok:false,code:'CANCELLED',state:'CANCELLED',error:'Preparação cancelada. Nenhuma mensagem foi enviada.'});};
    const listener=(event:MessageEvent)=>{
      const data=event.data;
      if(event.source!==window||event.origin!==window.location.origin||data?.channel!==channel||data.direction!=='extension'||data.requestId!==requestId)return;
      if(data.kind==='PROGRESS'){if(progressStates.includes(data.state))options.onProgress?.(data.state);return;}
      finish({ok:data.ok===true,error:data.error,reused:data.reused,...(typeof data.version==='string'?{version:data.version}:{}),...(typeof data.code==='string'?{code:data.code}:{}),...(typeof data.state==='string'?{state:data.state}:{})});
    };
    const timer=window.setTimeout(()=>{if(action==='OPEN_CHAT')window.postMessage({channel,direction:'app',requestId:crypto.randomUUID(),action:'CANCEL',targetRequestId:requestId},window.location.origin);finish({ok:false,code:action==='PING'?'EXTENSION_UNAVAILABLE':'WHATSAPP_UI_NOT_READY',error:action==='PING'?'Extensão não encontrada. Instale ou ative a extensão Nagano no Brave e recarregue esta página.':'O WhatsApp demorou para preparar a conversa. A preparação foi interrompida; confira a aba e tente novamente.'});},action==='PING'?1200:145000);
    window.addEventListener('message',listener);options.signal?.addEventListener('abort',cancel,{once:true});
    if(options.signal?.aborted){cancel();return;}
    window.postMessage({channel,direction:'app',requestId,action,phone,text},window.location.origin);
  });
}
let opening=false,activeController:AbortController|null=null;
export const cancelWhatsAppPreparation=()=>activeController?.abort();
export async function openWhatsAppConversation(phone:string,text:string):Promise<WhatsAppWebResult>{
  const normalized=normalizeBrazilianPhone(phone);
  if(!normalized.valid){const result={ok:false,error:normalized.error||'Confira o telefone e o DDD do cliente.'};notify({...result,...{phone,text}} as WhatsAppWebResult);return result;}
  if(opening)return {ok:false,code:'FLOW_BUSY',error:'Aguarde a abertura da conversa anterior.'};
  opening=true;const controller=new AbortController();activeController=controller;
  notify({ok:false,pending:true,state:'WAITING_FOR_UI',progressText:'Conectando à extensão do WhatsApp…'});
  try{
    const connection=await requestWhatsAppBridge('PING','','',{signal:controller.signal});
    const result=!connection.ok?connection:!supportsReliableWhatsAppFlow(connection.version)
      ?{ok:false,code:'EXTENSION_UPDATE_REQUIRED',error:'Atualize a extensão Nagano para a versão 1.2.0 ou superior no Brave. Ela confirma o carregamento antes de procurar o contato.'}
      :await requestWhatsAppBridge('OPEN_CHAT',normalized.normalizedPhone,text,{signal:controller.signal,onProgress:state=>notify({ok:false,pending:true,state})});
    notify({...result,...{phone:normalized.normalizedPhone,text}} as WhatsAppWebResult);return result;
  }finally{opening=false;if(activeController===controller)activeController=null;}
}
