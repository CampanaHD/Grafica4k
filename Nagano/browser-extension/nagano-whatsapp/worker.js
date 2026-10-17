import {createTabRouter,isAllowedSender} from './tabRouter.js';
import {flowStates,errorMessages} from './flowProtocol.js';
let active;
const openChat=createTabRouter(chrome,{log:message=>console.debug(message)});
chrome.runtime.onMessage.addListener((message,sender,sendResponse)=>{
  if(!isAllowedSender(sender)){sendResponse({ok:false,error:'Abra a Nagano em um endereço local no mesmo perfil do Brave.'});return false;}
  if(message?.action==='PING'){sendResponse({ok:true,version:chrome.runtime.getManifest().version});return false;}
  if(message?.action==='CANCEL'){
    if(active?.id===message.targetRequestId&&active.appTabId===sender.tab.id)active.controller.abort();
    sendResponse({ok:true});return false;
  }
  if(message?.action!=='OPEN_CHAT')return false;
  if(typeof message.requestId!=='string'||message.requestId.length>80){sendResponse({ok:false,code:'INVALID_REQUEST',error:'Solicitação inválida.'});return false;}
  if(active){sendResponse({ok:false,code:'FLOW_BUSY',error:errorMessages.FLOW_BUSY});return false;}
  const task={id:message.requestId,appTabId:sender.tab.id,controller:new AbortController()};active=task;
  const onState=state=>{if(flowStates.includes(state))void chrome.tabs.sendMessage(task.appTabId,{action:'WHATSAPP_FLOW_PROGRESS',requestId:task.id,state},{frameId:0}).catch(()=>{});};
  openChat(message.phone,message.text,{requestId:task.id,signal:task.controller.signal,onState}).then(sendResponse).catch(()=>sendResponse({ok:false,code:'WHATSAPP_UI_NOT_READY',error:errorMessages.WHATSAPP_UI_NOT_READY})).finally(()=>{if(active===task)active=undefined;});
  return true;
});
