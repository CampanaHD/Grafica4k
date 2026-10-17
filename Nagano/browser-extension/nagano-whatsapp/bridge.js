(() => {
  const channel='nagano-whatsapp-v1',pending=new Set();
  chrome.runtime.onMessage.addListener((data,sender)=>{
    if(sender.id!==chrome.runtime.id||data?.action!=='WHATSAPP_FLOW_PROGRESS'||!pending.has(data.requestId))return false;
    window.postMessage({channel,direction:'extension',requestId:data.requestId,kind:'PROGRESS',state:data.state},location.origin);return false;
  });
  window.addEventListener('message',event=>{
    const data=event.data;
    if(event.source!==window||event.origin!==location.origin||data?.channel!==channel||data.direction!=='app'||typeof data.requestId!=='string'||data.requestId.length>80)return;
    if(!['PING','OPEN_CHAT','CANCEL'].includes(data.action)||pending.has(data.requestId))return;
    pending.add(data.requestId);
    chrome.runtime.sendMessage({action:data.action,requestId:data.requestId,targetRequestId:data.targetRequestId,phone:data.phone,text:data.text},response=>{
      pending.delete(data.requestId);
      const error=chrome.runtime.lastError;
      window.postMessage({channel,direction:'extension',requestId:data.requestId,...(error?{ok:false,code:'WHATSAPP_UI_NOT_READY',error:'Reative a extensão Nagano e recarregue a página do sistema.'}:response||{ok:false,error:'Não foi possível abrir a conversa.'})},location.origin);
    });
  });
})();
