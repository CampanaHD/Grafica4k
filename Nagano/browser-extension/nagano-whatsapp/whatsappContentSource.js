import {prepareChatInPage} from './chatComposer.js';
import {readWhatsAppReadiness} from './pageReadiness.js';
import {protocol,errorMessages} from './flowProtocol.js';

/** Bundled locally as whatsappContent.js, injected once in the isolated main frame. */
export function registerWhatsAppContent(browser, scope = globalThis) {
  if(scope.__naganoWhatsAppFlow?.protocol===protocol)return scope.__naganoWhatsAppFlow;
  let active;
  const finished=new Map();
  const runtime={protocol};
  const listener=(message,sender,sendResponse)=>{
    if(sender.id!==browser.runtime.id||message?.protocol!==protocol)return false;
    if(message.action==='STATUS'){
      const flow=message.flowId===active?.id?active:undefined;
      sendResponse({handshake:'CONTENT_SCRIPT_READY',protocol,ui:readWhatsAppReadiness().state,...(flow?{flowId:flow.id,events:flow.events,state:flow.state}:{}),result:finished.get(message.flowId)});return false;
    }
    if(message.action==='CANCEL'){
      if(active?.id===message.flowId)active.controller.abort();
      sendResponse({ok:true});return false;
    }
    if(message.action!=='START_AUTOMATION')return false;
    if(typeof message.flowId!=='string'||message.flowId.length>80){sendResponse({ok:false,code:'WHATSAPP_UI_NOT_READY'});return false;}
    if(finished.has(message.flowId)||active?.id===message.flowId){sendResponse({ok:true,started:true});return false;}
    if(active){sendResponse({ok:false,code:'FLOW_BUSY',error:errorMessages.FLOW_BUSY});return false;}
    const ui=readWhatsAppReadiness().state;
    if(ui!=='ready'){const code=ui==='login_required'?'AUTH_REQUIRED':'WHATSAPP_UI_NOT_READY';sendResponse({ok:false,code,error:errorMessages[code]});return false;}
    const flow={id:message.flowId,controller:new AbortController(),events:[],state:'READY'};
    active=flow;
    const onState=state=>{if(flow.state!==state||!flow.events.length){flow.state=state;flow.events.push(state);console.debug(`[WhatsAppFlow] state=${state}`);}};
    const timeout=Number.isFinite(message.timeout)?Math.max(1,Math.min(60000,message.timeout)):60000;
    sendResponse({ok:true,started:true});
    void prepareChatInPage(message.phone,message.text,{signal:flow.controller.signal,deadline:Date.now()+timeout,onState}).then(result=>{
      finished.set(flow.id,{...result,events:flow.events});
      while(finished.size>32)finished.delete(finished.keys().next().value);
    }).catch(()=>finished.set(flow.id,{ok:false,state:'ERROR',code:'MESSAGE_INSERT_FAILED',error:errorMessages.MESSAGE_INSERT_FAILED,events:flow.events})).finally(()=>{if(active===flow)active=undefined;});
    return false;
  };
  browser.runtime.onMessage.addListener(listener);
  scope.addEventListener?.('pagehide',()=>active?.controller.abort(),{once:true});
  scope.__naganoWhatsAppFlow=runtime;
  return runtime;
}
if(typeof chrome!=='undefined'&&chrome.runtime?.id&&location.origin==='https://web.whatsapp.com')registerWhatsAppContent(chrome);
