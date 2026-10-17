import test from 'node:test';
import assert from 'node:assert/strict';
import { validateChatRequest, createTabRouter, isAllowedSender } from '../browser-extension/nagano-whatsapp/tabRouter.js';
import {protocol} from '../browser-extension/nagano-whatsapp/flowProtocol.js';
import {waitForCondition} from '../browser-extension/nagano-whatsapp/flowWait.js';
import { defaultMessageTemplates, pickupBalance, prepareMessage, renderMessageTemplate, validateMessageTemplates } from '../src/utils/messageTemplates';
import { normalizeBrazilianPhone } from '../src/utils/whatsappUtils';
import { getMessageTemplates, saveMessageTemplates } from '../src/services/messageTemplates';
import type { Customer, WorkOrder, Quotation } from '../src/types';
import { openWhatsAppConversation, supportsLiveWhatsAppDraft, supportsWhatsAppStartup, whatsappBridgeNotice } from '../src/services/whatsappWeb';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { WhatsAppMessagePreview } from '../src/components/WhatsAppMessagePreview';

function browserFixture(initial:any[]=[]){
  const f:any={now:0,tabs:new Map(initial.map(t=>[t.id,{windowId:2,incognito:false,status:'complete',documentId:'doc-'+t.id,...t}])),created:[],updated:[],injected:[],started:[],cancelled:[],pauses:[],states:[],handshakeAt:0,uiAt:0,chatDelay:0,documentAt:0};
  f.browser={tabs:{
    query:async()=>[...f.tabs.values()],
    get:async(id:number)=>{if(!f.tabs.has(id))throw new Error('closed');const tab=f.tabs.get(id);return {...tab,status:f.now<f.documentAt?'loading':tab.status};},
    update:async(id:number,changes:any)=>{const tab={...f.tabs.get(id),...changes};f.updated.push({id,...changes});f.tabs.set(id,tab);return tab;},
    create:async(changes:any)=>{const tab={id:100+f.created.length,windowId:2,incognito:false,status:'complete',documentId:'doc-new',...changes};f.created.push(tab);f.tabs.set(tab.id,tab);return tab;},
    sendMessage:async(id:number,message:any,target:any)=>{
      const tab=f.tabs.get(id);if(!tab||target.documentId!==tab.documentId)throw new Error('Document changed');
      if(message.action==='CANCEL'){f.cancelled.push(message);return {ok:true};}
      if(!f.installed||f.now<f.handshakeAt)throw new Error('Receiving end does not exist');
      if(message.action==='START_AUTOMATION'){assert.ok(f.now>=f.uiAt);f.started.push({id,message,target});f.completedAt=f.now+f.chatDelay;return {ok:true,started:true};}
      f.onStatus?.(message);
      return {protocol,handshake:'CONTENT_SCRIPT_READY',ui:f.login?'login_required':f.now>=f.uiAt?'ready':'loading',...(f.started.length&&message.flowId===f.started.at(-1).message.flowId?{events:['READY','SEARCHING_CONTACT',...(f.now>=f.completedAt?['OPENING_CHAT','INSERTING_MESSAGE','COMPLETED']:[])],result:f.now>=f.completedAt?(f.result||{ok:true}):undefined}:{})};
    }
  },windows:{update:async()=>{}},scripting:{executeScript:async(options:any)=>{f.injected.push(options);if(f.injectionFailure)throw new Error('Permission denied');f.installed=true;const tab=f.tabs.get(options.target.tabId);return [{frameId:0,documentId:tab.documentId}];}}};
  f.open=createTabRouter(f.browser,{now:()=>f.now,pause:async(ms:number)=>{f.now+=ms;f.pauses.push(ms);f.onPause?.();}});
  f.run=(phone='5511999999999',text='Mensagem',extra:any={})=>f.open(phone,text,{onState:(state:string)=>f.states.push(state),...extra});
  return f;
}
test('A: ready existing tab is reused without URL navigation, with recipient and message unchanged',async()=>{
  const f=browserFixture([{id:7,url:'https://web.whatsapp.com/'}]),text='Olá, *Cliente*! 😊\n\n*Saldo:* R$ 50,00';
  assert.deepEqual(await f.run('5511999999999',text),{ok:true,reused:true});assert.equal(f.created.length,0);assert.equal(f.updated[0].url,undefined);
  assert.deepEqual(f.injected[0].files,['whatsappContent.js']);assert.equal(f.injected[0].world,'ISOLATED');assert.equal(f.started[0].message.text,text);assert.equal(f.started[0].target.documentId,'doc-7');
  assert.ok(f.states.indexOf('SEARCHING_CONTACT')>f.states.indexOf('READY'));
});
test('B and C: closed tab opens once, waits document and slow UI, and preserves the formatted draft',async()=>{
  const f=browserFixture();f.documentAt=9000;f.uiAt=42000;
  assert.deepEqual(await f.run('5511888888888','Olá!\n\nTexto *original*.'),{ok:true,reused:false});assert.equal(f.created.length,1);assert.equal(f.started.length,1);assert.ok(f.now>=42000);
  assert.deepEqual(f.states.slice(0,4),['CLOSED','OPENING','WAITING_FOR_UI','READY']);assert.equal(f.started[0].message.text,'Olá!\n\nTexto *original*.');
  f.tabs.delete(100);await f.run();assert.equal(f.created.length,2);
});
test('D: QR login returns AUTH_REQUIRED without searching or inserting',async()=>{
  const f=browserFixture();f.login=true;const result=await f.run();assert.equal(result.code,'AUTH_REQUIRED');assert.equal(f.started.length,0);assert.ok(!f.states.includes('SEARCHING_CONTACT'));
});
test('E and F: contact and chat failures retain their precise code after READY',async()=>{
  for(const code of ['CONTACT_NOT_FOUND','CHAT_NOT_READY','MESSAGE_FIELD_NOT_FOUND','MESSAGE_INSERT_FAILED']){
    const f=browserFixture();f.result={ok:false,code,error:'Erro da etapa'};const result=await f.run();assert.equal(result.code,code);assert.ok(f.states.includes('READY'));assert.equal(f.cancelled.length,1);
  }
});
test('G: content script handshake can arrive late and START is never sent before acknowledgement',async()=>{
  const f=browserFixture();f.handshakeAt=7200;assert.equal((await f.run()).ok,true);assert.ok(f.now>=7200);assert.equal(f.injected.length,1);assert.equal(f.started.length,1);
});
test('H: double click is rejected by a single-flight lock; no queued duplicate starts',async()=>{
  const f=browserFixture();const first=f.run();const duplicate=await f.run();assert.equal(duplicate.code,'FLOW_BUSY');assert.equal((await first).ok,true);assert.equal(f.created.length,1);assert.equal(f.started.length,1);
});
test('loading and open timeouts never become CONTACT_NOT_FOUND and reuse the same tab on retry',async()=>{
  const f=browserFixture();f.uiAt=1000000;let result=await f.run();assert.equal(result.code,'WHATSAPP_UI_NOT_READY');assert.equal(f.now,65000);assert.equal(f.started.length,0);
  f.uiAt=0;assert.deepEqual(await f.run(),{ok:true,reused:true});assert.equal(f.created.length,1);
  const opening=browserFixture();opening.documentAt=1000000;result=await opening.run();assert.equal(result.code,'WHATSAPP_OPEN_TIMEOUT');assert.equal(opening.injected.length,0);assert.equal(opening.now,30000);
});
test('bounded handshake retries report extension permission error without reloading',async()=>{
  const f=browserFixture([{id:7,url:'https://web.whatsapp.com/'}]);f.injectionFailure=true;const result=await f.run();assert.equal(result.code,'WHATSAPP_UI_NOT_READY');assert.match(result.error,/permissão/);assert.equal(f.injected.length,3);assert.equal(f.created.length,0);assert.ok(f.updated.every((t:any)=>!t.url));
});
test('closing, navigating or replacing the owned document aborts safely without fallback navigation',async()=>{
  for(const action of ['close','navigate','document']){const f=browserFixture();f.uiAt=600;f.onStatus=()=>{if(action==='close')f.tabs.delete(100);else if(action==='navigate')f.tabs.set(100,{...f.tabs.get(100),url:'https://example.com/'});else f.tabs.set(100,{...f.tabs.get(100),documentId:'replacement'});};const result=await f.run();assert.equal(result.ok,false);assert.equal(f.started.length,0);assert.equal(f.created.length,1);}
});
test('private and unrelated tabs are untouched; sender and request validation remain restricted',async()=>{
  const f=browserFixture([{id:3,url:'https://web.whatsapp.com.evil.invalid/'},{id:4,url:'https://web.whatsapp.com/',incognito:true}]);await f.run();assert.equal(f.created.length,1);assert.equal(f.updated.length,0);
  const sender={url:'http://localhost:3000/',frameId:0,tab:{id:5,incognito:false}};assert.equal(isAllowedSender(sender),true);assert.equal(isAllowedSender({...sender,url:'http://127.0.0.1:3117/'}),true);
  for(const change of [{url:'https://example.com/'},{url:'http://localhost.evil.invalid/'},{frameId:1},{tab:{id:5,incognito:true}},{tab:undefined}])assert.equal(isAllowedSender({...sender,...change}),false);
  assert.throws(()=>validateChatRequest('123&phone=x','texto'));assert.throws(()=>validateChatRequest('5511999999999','x'.repeat(60001)));
});
test('generic wait supports cancellation, exact result, finite timeout and a late async probe',async()=>{
  let time=0,attempt=0;const element={id:'ready'};
  assert.equal(await waitForCondition(()=>++attempt===3?element:null,{timeout:1000,interval:100,now:()=>time,pause:async(ms:number)=>{time+=ms;}}),element);
  await assert.rejects(waitForCondition(()=>null,{timeout:200,interval:100,now:()=>time,pause:async(ms:number)=>{time+=ms;},code:'SEARCH_FIELD_NOT_FOUND'}),{code:'SEARCH_FIELD_NOT_FOUND'});
  const controller=new AbortController();controller.abort();await assert.rejects(waitForCondition(()=>element,{signal:controller.signal}),{code:'CANCELLED'});
  let resolveProbe:any;await assert.rejects(waitForCondition(()=>new Promise(resolve=>{resolveProbe=resolve;}),{timeout:10,code:'WHATSAPP_UI_NOT_READY'}),{code:'WHATSAPP_UI_NOT_READY'});resolveProbe(element);
  let invoked=0;await assert.rejects(waitForCondition(()=>{invoked++;return element;},{deadline:0,now:()=>1}),{code:'WHATSAPP_UI_NOT_READY'});assert.equal(invoked,0);
  await assert.rejects(waitForCondition(()=>element,{interval:0}),TypeError);
});
test('cancelling during initial UI wait prevents any later contact search',async()=>{
  const f=browserFixture(),controller=new AbortController();f.uiAt=60000;f.onPause=()=>{if(f.now>=900)controller.abort();};const result=await f.run(undefined,undefined,{signal:controller.signal});assert.equal(result.code,'CANCELLED');assert.equal(f.started.length,0);assert.ok(!f.states.includes('SEARCHING_CONTACT'));
});
test('a delayed browser tab-creation acknowledgement times out without permitting a second tab creation',async()=>{
  const f=browserFixture(),original=f.browser.tabs.create;let release:any;
  f.browser.tabs.create=(changes:any)=>new Promise(resolve=>{release=async()=>resolve(await original(changes));});
  const open=createTabRouter(f.browser,{apiTimeout:15});
  const result=await open('5511999999999','Original');assert.equal(result.code,'WHATSAPP_OPEN_TIMEOUT');assert.equal((await open('5511999999999','Original')).code,'FLOW_BUSY');
  await release();await new Promise(resolve=>setTimeout(resolve,0));
  assert.deepEqual(await open('5511999999999','Original'),{ok:true,reused:true});assert.equal(f.created.length,1);
});

test('pickup notice includes actual outstanding balance, vanishes when paid, and preserves financial data', () => {
  const settings = defaultMessageTemplates();
  const order = { number: 'OS-10', customerName: 'Cliente', serviceName: 'Banner', totalAmount: 1000, amountPaid: 500, remainingBalance: 500 } as WorkOrder;
  const before = structuredClone(order);
  const text = prepareMessage('PICKUP_READY', settings, { order });
  assert.match(text, /\*Pedido:\* OS-10\n\*Serviço:\* Banner/); assert.match(text, /saldo pendente de \*R\$\s500,00\* para pagamento na retirada/);
  assert.deepEqual(order, before);
  const paid = prepareMessage('PICKUP_READY', settings, { order: { ...order, amountPaid: 1000, remainingBalance: 0 } });
  assert.doesNotMatch(paid, /pendente|500,00|Atenção/); assert.doesNotMatch(paid, /\{[^}]+\}|\n\n\n/);
  assert.equal(pickupBalance({ ...order, remainingBalance: NaN, amountPaid: 750 }), 250);
  assert.equal(pickupBalance({ ...order, remainingBalance: -5 }), 0);
});
test('editable templates retain full quotation and conditional payment notice', () => {
  const s = defaultMessageTemplates();
  s.templates.find(t => t.purpose === 'QUOTATION')!.body = 'Personalizado para {cliente}\n{detalhes_orcamento}';
  const quotation = { id: 'q', number: 'ORC-11', customerName: 'Loja', totalAmount: 220, items: [{ id: 'i1', serviceName: 'Adesivo', quantity: 20, subtotal: 100 }, { id: 'i2', serviceName: 'Banner', quantity: 2, subtotal: 120 }] } as Quotation;
  const text = prepareMessage('QUOTATION', s, { quotation, paymentOptions: ['Pix', 'Cartão'] });
  assert.match(text, /Personalizado para Loja/); for (const word of ['Adesivo', 'Banner', 'Quantidade: 20', 'Quantidade: 2', '220,00', 'Pix', 'Cartão']) assert.ok(text.includes(word));
  s.templates.find(t => t.purpose === 'PICKUP_READY')!.body = 'Pedido pronto';
  assert.throws(() => validateMessageTemplates(s), /aviso_pagamento/);
  assert.match(prepareMessage('PICKUP_READY', s, { order: { number: 'x', totalAmount: 100, amountPaid: 50, remainingBalance: 50 } as WorkOrder }), /50,00/);
});
test('manual message preparation keeps recorded preferences and customer-entered braces intact', () => {
  const customer = { name: 'Cliente', allowWhatsapp: false, allowMarketing: false } as Customer;
  const before = structuredClone(customer);
  assert.match(prepareMessage('REACTIVATION', defaultMessageTemplates(), { customer }), /Olá, \*Cliente\*/);
  assert.deepEqual(customer, before);
  assert.equal(renderMessageTemplate('Olá, {cliente}! {empresa}', { cliente: '{empresa}', empresa: 'Nagano' }), 'Olá, {empresa}! Nagano');
  assert.equal(normalizeBrazilianPhone('(55) 99999-8888').normalizedPhone, '5555999998888');
  assert.equal(normalizeBrazilianPhone('5511999998888').normalizedPhone, '5511999998888');
});
test('custom templates and bindings persist; invalid edits do not overwrite saved messages', () => {
  const previous = globalThis.localStorage; const data = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', { value: { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => data.set(k, v) }, configurable: true });
  try {
    const s = getMessageTemplates(); s.templates.push({ id: 'new', purpose: 'GREETING', name: 'Meu atendimento', body: 'Olá {cliente}, bem-vindo à {empresa}!' }); s.bindings.GREETING = 'new';
    saveMessageTemplates(s); assert.deepEqual(getMessageTemplates(), s);
    s.templates.find(t => t.id === 'new')!.body = '{campo_inexistente}';
    assert.throws(() => saveMessageTemplates(s), /Campo desconhecido/);
    assert.equal(getMessageTemplates().templates.find(t => t.id === 'new')!.body, 'Olá {cliente}, bem-vindo à {empresa}!');
  } finally { Object.defineProperty(globalThis, 'localStorage', { value: previous, configurable: true }); }
});

test('older untouched defaults gain formatting without changing customized messages or saved data', () => {
  const previous = globalThis.localStorage;
  const settings = defaultMessageTemplates();
  settings.templates.find(t => t.purpose === 'QUOTATION')!.body = '{detalhes_orcamento}\n\n{empresa}';
  const customized = settings.templates.find(t => t.purpose === 'PICKUP_READY')!;
  customized.body = 'Meu aviso especial para {cliente}\n\n{aviso_pagamento}';
  const raw = JSON.stringify(settings);
  Object.defineProperty(globalThis, 'localStorage', { value: { getItem: () => raw }, configurable: true });
  try {
    const upgraded = getMessageTemplates();
    assert.equal(upgraded.templates.find(t => t.purpose === 'QUOTATION')!.body, '{detalhes_orcamento}\n\n*{empresa}*');
    assert.equal(upgraded.templates.find(t => t.purpose === 'PICKUP_READY')!.body, customized.body);
    assert.deepEqual(upgraded.bindings, settings.bindings);
    assert.equal(JSON.stringify(settings), raw);
  } finally { Object.defineProperty(globalThis, 'localStorage', { value: previous, configurable: true }); }
});

test('formatted preview escapes customer HTML and keeps paragraphs, emphasis and emoji', () => {
  const text = 'Olá, *Cliente*! 😊\n\n*Saldo:* R$ 150,00\n<img src=x onerror=alert(1)>';
  const html = renderToStaticMarkup(React.createElement(WhatsAppMessagePreview, { text }));
  assert.match(html, /<strong[^>]*>Cliente<\/strong>/);
  assert.match(html, /😊\n\n/);
  assert.match(html, /&lt;img/);
  assert.doesNotMatch(html, /<img/);
});

test('browser bridge normalizes recipient, checks acknowledgement origin, and never opens a popup', async () => {
  const previous = globalThis.window;
  const win = new EventTarget() as any;
  const requests: any[] = [], notices: any[] = [],timeouts:number[]=[];
  win.location = { origin: 'http://localhost:3000' };
  win.setTimeout = (callback:()=>void,delay:number)=>{timeouts.push(delay);return setTimeout(callback,delay);}; win.clearTimeout = clearTimeout;
  win.postMessage = (data: any, origin: string) => {
    requests.push({ data, origin });
    const ack = { ...data, direction: 'extension', ok: true, reused: true, ...(data.action === 'PING' ? { version: '1.2.0' } : {}) };
    queueMicrotask(() => {
      // A different website cannot acknowledge the operation.
      win.dispatchEvent(Object.assign(new Event('message'), { source: win, origin: 'https://example.com', data: { ...ack, ok: false } }));
      win.dispatchEvent(Object.assign(new Event('message'), { source: win, origin, data: ack }));
    });
  };
  win.addEventListener(whatsappBridgeNotice, (e: any) => notices.push(e.detail));
  Object.defineProperty(globalThis, 'window', { value: win, configurable: true });
  try {
    assert.deepEqual(await openWhatsAppConversation('(11) 99999-8888', 'Orçamento\nR$ 50,00'), { ok: true, error: undefined, reused: true });
    assert.equal(requests.length, 2); assert.equal(requests[0].data.action, 'PING'); assert.equal(requests[1].data.action, 'OPEN_CHAT'); assert.equal(requests[1].data.phone, '5511999998888'); assert.equal(requests[1].data.text, 'Orçamento\nR$ 50,00');
    assert.equal(notices.at(-1).ok, true);
    assert.ok(timeouts.includes(145000),'app must keep the request while WhatsApp initializes');
    assert.equal((await openWhatsAppConversation('123', 'Texto')).ok, false); assert.equal(requests.length, 2);
  } finally { Object.defineProperty(globalThis, 'window', { value: previous, configurable: true }); }
});

test('an older extension must be updated before attempting a fresh WhatsApp launch',async()=>{
  const previous=globalThis.window,win=new EventTarget() as any,actions:string[]=[];
  win.location={origin:'http://localhost:3000'};win.setTimeout=setTimeout;win.clearTimeout=clearTimeout;
  win.postMessage=(data:any,origin:string)=>{actions.push(data.action);queueMicrotask(()=>win.dispatchEvent(Object.assign(new Event('message'),{source:win,origin,data:{...data,direction:'extension',ok:true,version:'1.1.4'}})));};
  Object.defineProperty(globalThis,'window',{value:win,configurable:true});
  try{const result=await openWhatsAppConversation('11999999999','Rascunho');assert.equal(result.ok,false);assert.match(result.error!,/1\.2\.0/);assert.deepEqual(actions,['PING']);assert.equal(supportsWhatsAppStartup('1.1.4'),false);for(const version of ['1.1.5','1.2.0','2.0.0'])assert.equal(supportsWhatsAppStartup(version),true);assert.equal(supportsWhatsAppStartup(undefined),false);}
  finally{Object.defineProperty(globalThis,'window',{value:previous,configurable:true});}
});
test('missing extension preserves prepared message and creates no browser tab', async () => {
  const previous = globalThis.window;
  const win = new EventTarget() as any; let notice: any;
  win.location = { origin: 'http://localhost:3000' }; win.clearTimeout = () => {};
  win.setTimeout = (fn: () => void) => { queueMicrotask(fn); return 1; };
  win.postMessage = () => {};
  win.addEventListener(whatsappBridgeNotice, (e: any) => { notice = e.detail; });
  Object.defineProperty(globalThis, 'window', { value: win, configurable: true });
  try {
    const result = await openWhatsAppConversation('(11) 99999-8888', 'Pedido pronto. Saldo R$ 50,00.');
    assert.equal(result.ok, false); assert.match(result.error!, /Extensão não encontrada/);
    assert.equal(notice.text, 'Pedido pronto. Saldo R$ 50,00.'); assert.equal(notice.phone, '5511999998888');
  } finally { Object.defineProperty(globalThis, 'window', { value: previous, configurable: true }); }
});
test('legacy extension is detected and never asked to open a chat by URL', async () => {
  const previous = globalThis.window;
  const win = new EventTarget() as any; const actions: string[] = [];
  win.location = { origin: 'http://localhost:3000' }; win.setTimeout = setTimeout; win.clearTimeout = clearTimeout;
  win.postMessage = (data: any, origin: string) => {
    actions.push(data.action);
    queueMicrotask(() => win.dispatchEvent(Object.assign(new Event('message'), { source: win, origin, data: { ...data, direction: 'extension', ok: true } })));
  };
  Object.defineProperty(globalThis, 'window', { value: win, configurable: true });
  try {
    const result = await openWhatsAppConversation('(11) 99999-8888', 'Mensagem');
    assert.equal(result.ok, false); assert.match(result.error!, /Atualize a extensão/); assert.deepEqual(actions, ['PING']);
    assert.equal(supportsLiveWhatsAppDraft('1.0.0'), false); assert.equal(supportsLiveWhatsAppDraft('1.1.0'), true); assert.equal(supportsLiveWhatsAppDraft('1.2.0'), true);
  } finally { Object.defineProperty(globalThis, 'window', { value: previous, configurable: true }); }
});
