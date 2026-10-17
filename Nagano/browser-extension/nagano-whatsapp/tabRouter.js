import {waitForCondition,flowError} from './flowWait.js';
import {protocol,flowStates,errorMessages} from './flowProtocol.js';
export function isAllowedSender(sender) {
  try {const url=new URL(sender.url);return sender.tab?.id!=null&&!sender.tab.incognito&&sender.frameId===0&&url.protocol==='http:'&&['localhost','127.0.0.1'].includes(url.hostname);}catch{return false;}
}
export function validateChatRequest(phone,text) {
  if(typeof phone!=='string'||!/^55\d{10,11}$/.test(phone))throw flowError('INVALID_REQUEST','Confira o telefone e o DDD do cliente.');
  if(typeof text!=='string'||text.length>60000)throw flowError('INVALID_REQUEST','A mensagem é muito longa. Reduza o texto antes de abrir a conversa.');
}
const isWhatsAppUrl=value=>{try{return new URL(value).origin==='https://web.whatsapp.com';}catch{return false;}};
const isWhatsAppTab=tab=>!tab.incognito&&(!tab.pendingUrl||isWhatsAppUrl(tab.pendingUrl))&&[tab.url,tab.pendingUrl].some(isWhatsAppUrl);
export function createTabRouter(browser,options={}) {
  const now=options.now||(()=>Date.now()),pause=options.pause;
  let preferredTabId,running=false;
  const pendingMutations=new Set();
  return async(phone,text,context={})=>{
    if(running)return {ok:false,code:'FLOW_BUSY',error:errorMessages.FLOW_BUSY};
    running=true;
    const signal=context.signal,flowId=context.requestId||crypto.randomUUID(),globalDeadline=now()+130000,startupDeadline=now()+65000,openDeadline=now()+30000;
    let tab,documentId,pageStarted=false,lastState,readyConfirmed=false;
    const emit=state=>{if(state===lastState||!flowStates.includes(state))return;if(state==='SEARCHING_CONTACT'&&!readyConfirmed)throw flowError('WHATSAPP_UI_NOT_READY',errorMessages.WHATSAPP_UI_NOT_READY);lastState=state;context.onState?.(state);options.log?.(`[WhatsAppFlow] state=${state}`);};
    const wait=(find,timeout,code,deadline=globalDeadline)=>waitForCondition(find,{timeout,interval:300,signal,now,pause,deadline,code,message:errorMessages[code]});
    const once=async(fn,code='WHATSAPP_UI_NOT_READY',deadline=globalDeadline)=>{const result=await wait(async()=>({value:await fn()}),options.apiTimeout||30000,code,deadline);return result.value;};
    const mutate=async(fn)=>{const task=Promise.resolve().then(()=>{if(signal?.aborted)throw flowError('CANCELLED',errorMessages.CANCELLED);return fn();});pendingMutations.add(task);task.then(()=>pendingMutations.delete(task),()=>pendingMutations.delete(task));return once(()=>task,'WHATSAPP_OPEN_TIMEOUT',openDeadline);};
    const currentTab=async(allowBlank=false)=>{
      let current;try{current=await once(()=>browser.tabs.get(tab.id));}catch(error){if(error.code)throw error;throw flowError('WHATSAPP_UI_NOT_READY','A aba do WhatsApp foi fechada durante a preparação. Clique novamente no sistema.');}
      if(!isWhatsAppTab(current)&&!(allowBlank&&!current.incognito&&(!current.url||current.url==='about:blank')&&!current.pendingUrl))throw flowError('WHATSAPP_UI_NOT_READY','A aba saiu do WhatsApp. A mensagem foi mantida no sistema.');
      return current;
    };
    const send=async(action,extra={})=>{await currentTab();return browser.tabs.sendMessage(tab.id,{protocol,action,flowId,...extra},{...(documentId?{documentId}:{frameId:0})});};
    try {
      validateChatRequest(phone,text);
      if(signal?.aborted)throw flowError('CANCELLED',errorMessages.CANCELLED);
      if(preferredTabId!=null){try{const existing=await once(()=>browser.tabs.get(preferredTabId),'WHATSAPP_OPEN_TIMEOUT',openDeadline);if(isWhatsAppTab(existing))tab=existing;}catch(error){if(error.code)throw error;}}
      if(!tab){const candidates=(await once(()=>browser.tabs.query({url:'https://web.whatsapp.com/*'}),'WHATSAPP_OPEN_TIMEOUT',openDeadline)).filter(isWhatsAppTab);tab=candidates.sort((a,b)=>(b.lastAccessed||0)-(a.lastAccessed||0))[0];}
      const reused=!!tab;
      if(tab)tab=await mutate(()=>browser.tabs.update(tab.id,{active:true}));
      else {emit('CLOSED');emit('OPENING');tab=await mutate(()=>browser.tabs.create({url:'https://web.whatsapp.com/',active:true}).then(created=>{preferredTabId=created.id;return created;}));}
      preferredTabId=tab.id;
      try{void browser.windows.update(tab.windowId,{focused:true}).catch(()=>{});}catch{}
      await wait(async()=>{const current=await currentTab(!reused);return isWhatsAppTab(current)&&current.status==='complete'&&current;},30000,'WHATSAPP_OPEN_TIMEOUT',openDeadline);
      emit('WAITING_FOR_UI');
      let handshake;
      for(let attempt=0;attempt<3&&!handshake;attempt++){
        if(attempt){const retryAt=now()+500;await wait(()=>now()>=retryAt,1000,'WHATSAPP_UI_NOT_READY',startupDeadline);}
        await currentTab();
        try {
          const injected=await wait(()=>browser.scripting.executeScript({target:{tabId:tab.id},world:'ISOLATED',files:['whatsappContent.js'],injectImmediately:true}),10000,'WHATSAPP_UI_NOT_READY',startupDeadline);
          documentId=injected.find(frame=>frame.frameId===0)?.documentId;
          if(!documentId)throw flowError('WHATSAPP_UI_NOT_READY','Atualize o Brave para permitir a identificação segura da página do WhatsApp.');
          handshake=await wait(async()=>{try{const ack=await send('STATUS');return ack?.protocol===protocol&&ack.handshake==='CONTENT_SCRIPT_READY'&&ack;}catch(error){if(error.code)throw error;return null;}},10000,'WHATSAPP_UI_NOT_READY',startupDeadline);
        }catch(error){if(signal?.aborted||error.code==='CANCELLED')throw error;if(attempt===2)throw flowError('WHATSAPP_UI_NOT_READY','Não consegui confirmar o script do WhatsApp. Confira a permissão da extensão para web.whatsapp.com e tente novamente.');}
      }
      if(!handshake)throw flowError('WHATSAPP_UI_NOT_READY',errorMessages.WHATSAPP_UI_NOT_READY);
      options.log?.('[WhatsAppFlow] content script ready');
      const inspect=ack=>{if(ack?.ui==='login_required')throw flowError('AUTH_REQUIRED',errorMessages.AUTH_REQUIRED);return ack?.handshake==='CONTENT_SCRIPT_READY'&&ack.protocol===protocol&&ack.ui==='ready'&&ack;};
      if(!inspect(handshake))await wait(async()=>{try{return inspect(await send('STATUS'));}catch(error){if(error.code)throw error;throw flowError('WHATSAPP_UI_NOT_READY','A página do WhatsApp mudou durante o carregamento. Aguarde e tente novamente.');}},65000,'WHATSAPP_UI_NOT_READY',startupDeadline);
      readyConfirmed=true;emit('READY');
      let starts=0;
      pageStarted=true;
      await wait(async()=>{
        try {const ack=await send('START_AUTOMATION',{phone,text,timeout:Math.min(60000,globalDeadline-now())});if(!ack?.ok)throw flowError(ack?.code||'WHATSAPP_UI_NOT_READY',ack?.error||errorMessages.WHATSAPP_UI_NOT_READY);return ack.started;}
        catch(error){if(error.code)throw error;if(++starts>=3)throw flowError('WHATSAPP_UI_NOT_READY','O script não confirmou o início da preparação. A mensagem está preservada.');return false;}
      },5000,'WHATSAPP_UI_NOT_READY');
      let delivered=0;
      const result=await wait(async()=>{
        let ack;try{ack=await send('STATUS');}catch(error){if(error.code)throw error;throw flowError('CHAT_NOT_READY','A página do WhatsApp mudou durante a preparação. Aguarde carregar e clique novamente no sistema.');}
        const events=ack?.result?.events||ack?.events||[];
        for(const state of events.slice(delivered))emit(state);delivered=events.length;
        return ack?.result;
      },63000,'CHAT_NOT_READY');
      if(!result.ok)throw flowError(result.code||'MESSAGE_INSERT_FAILED',result.error||errorMessages.MESSAGE_INSERT_FAILED);
      pageStarted=false;emit('COMPLETED');return {ok:true,reused};
    }catch(error){const code=signal?.aborted?'CANCELLED':error.code||'WHATSAPP_UI_NOT_READY';emit(code==='CANCELLED'?'CANCELLED':'ERROR');return {ok:false,code,error:code==='CANCELLED'?errorMessages.CANCELLED:error.message||errorMessages[code]};}
    finally {
      if(pageStarted&&tab&&documentId){try{await waitForCondition(async()=>({ack:await browser.tabs.sendMessage(tab.id,{protocol,action:'CANCEL',flowId},{documentId})}),{timeout:2000,interval:100,now,pause});}catch{}}
      if(pendingMutations.size)void Promise.allSettled([...pendingMutations]).then(()=>{running=false;});else running=false;
    }
  };
}
