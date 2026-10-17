import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {requestWhatsAppBridge,supportsReliableWhatsAppFlow} from '../src/services/whatsappWeb';

test('app bridge keeps waiting through progress, ignores forged events and sends explicit cancellation',async()=>{
  const previous=globalThis.window,win=new EventTarget() as any,posts:any[]=[],states:string[]=[];
  win.location={origin:'http://localhost:3000'};win.setTimeout=setTimeout;win.clearTimeout=clearTimeout;win.postMessage=(data:any,origin:string)=>posts.push({data,origin});
  Object.defineProperty(globalThis,'window',{value:win,configurable:true});
  const emit=(data:any,origin=win.location.origin)=>win.dispatchEvent(Object.assign(new Event('message'),{source:win,origin,data}));
  try{
    let resolved=false;const task=requestWhatsAppBridge('OPEN_CHAT','5511999999999','Mensagem original',{onProgress:state=>states.push(state)}).then(result=>{resolved=true;return result;});
    const request=posts[0].data,progress={...request,direction:'extension',kind:'PROGRESS',state:'WAITING_FOR_UI'};
    emit(progress,'https://example.com');emit({...progress,requestId:'different'});assert.deepEqual(states,[]);
    emit(progress);await Promise.resolve();assert.equal(resolved,false);assert.deepEqual(states,['WAITING_FOR_UI']);
    emit({...request,direction:'extension',ok:false,code:'AUTH_REQUIRED',error:'Conecte o WhatsApp.'});assert.equal((await task).code,'AUTH_REQUIRED');
    const controller=new AbortController(),cancel=requestWhatsAppBridge('OPEN_CHAT','5511999999999','Rascunho',{signal:controller.signal});const open=posts.at(-1).data;controller.abort();assert.equal((await cancel).code,'CANCELLED');assert.equal(posts.at(-1).data.action,'CANCEL');assert.equal(posts.at(-1).data.targetRequestId,open.requestId);assert.equal(posts.at(-1).data.text,undefined);
    for(const version of ['1.1.5','1.1.4',undefined,'1.2.0-malformed'])assert.equal(supportsReliableWhatsAppFlow(version),false);for(const version of ['1.2.0','1.3.1','2.0.0'])assert.equal(supportsReliableWhatsAppFlow(version),true);
  }finally{Object.defineProperty(globalThis,'window',{value:previous,configurable:true});}
});
test('local content bridge deduplicates requests and only forwards correlated extension progress',()=>{
  let pageListener:any,extensionListener:any;const outbound:any[]=[],posted:any[]=[],callbacks:any[]=[];
  const window:any={addEventListener:(_type:string,fn:any)=>pageListener=fn,postMessage:(data:any,origin:string)=>posted.push({data,origin})};
  const chrome={runtime:{id:'nagano-test',onMessage:{addListener:(fn:any)=>extensionListener=fn},sendMessage:(message:any,callback:any)=>{outbound.push(message);callbacks.push(callback);},lastError:null}};
  const origin='http://localhost:3000';vm.runInNewContext(readFileSync(new URL('../browser-extension/nagano-whatsapp/bridge.js',import.meta.url),'utf8'),{window,location:{origin},chrome});
  const data={channel:'nagano-whatsapp-v1',direction:'app',requestId:'one',action:'OPEN_CHAT',phone:'5511999999999',text:'Teste'};
  pageListener({source:window,origin:'https://example.com',data});assert.equal(outbound.length,0);
  pageListener({source:window,origin,data});pageListener({source:window,origin,data});assert.equal(outbound.length,1);
  extensionListener({action:'WHATSAPP_FLOW_PROGRESS',requestId:'one',state:'READY'},{id:'other-extension'});assert.equal(posted.length,0);
  extensionListener({action:'WHATSAPP_FLOW_PROGRESS',requestId:'other',state:'READY'},{id:'nagano-test'});assert.equal(posted.length,0);
  extensionListener({action:'WHATSAPP_FLOW_PROGRESS',requestId:'one',state:'READY'},{id:'nagano-test'});assert.equal(posted[0].data.kind,'PROGRESS');assert.equal(posted[0].data.phone,undefined);assert.equal(posted[0].data.text,undefined);
  callbacks[0]({ok:true});assert.equal(posted.at(-1).data.ok,true);
});
