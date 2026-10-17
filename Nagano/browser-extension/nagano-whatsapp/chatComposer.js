import {waitForCondition,flowError} from './flowWait.js';
import {readWhatsAppReadiness} from './pageReadiness.js';
/** Runs in the extension's isolated world. Uses the visible UI, never WhatsApp private APIs. */
export async function prepareChatInPage(phone, text, options = {}) {
  const deadline = Math.min(options.deadline || Infinity, Date.now() + 60000);
  let phase='WAITING_FOR_UI', recipientCheck=()=>{};
  const state = value => { phase=value; options.onState?.(value); };
  const guard=()=>{if(options.signal?.aborted)throw flowError('CANCELLED','Preparação cancelada. Nenhuma mensagem foi enviada.');if(Date.now()>=deadline)throw flowError(phase==='INSERTING_MESSAGE'?'MESSAGE_INSERT_FAILED':'CHAT_NOT_READY','O prazo da preparação terminou. A mensagem está preservada no sistema.');};
  const normalize = value => (value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  const all = (selector, root = document) => [...root.querySelectorAll(selector)];
  const visible = element => {
    if (!element?.isConnected || !element.getClientRects().length || getComputedStyle(element).visibility === 'hidden' || getComputedStyle(element).display === 'none') return false;
    const rect = element.getBoundingClientRect();
    return rect.right > 0 && rect.bottom > 0 && rect.left < innerWidth && rect.top < innerHeight;
  };
  const cleanText = value => (value || '').replace(/\r\n?/g, '\n').replace(/\u00a0/g, ' ').replace(/\n$/, '');
  const plainText = element => cleanText(element?.innerText ?? element?.textContent ?? '');
  const normalizedPhone = value => {
    const digits = (value || '').replace(/\D/g, '');
    return digits.length === 10 || digits.length === 11 ? '55' + digits : digits;
  };
  const hasPhone = value => (String(value || '').match(/\+?\d[\d ()-]{8,}\d/g) || []).some(part => normalizedPhone(part) === phone);
  const pause = async ms => {guard();await new Promise(resolve=>setTimeout(resolve,ms));guard();};
  const waitFor = (find, timeout, message, code = phase==='INSERTING_MESSAGE'?'MESSAGE_INSERT_FAILED':'CHAT_NOT_READY') => waitForCondition(find,{timeout,interval:150,signal:options.signal,deadline,code,message});
  const button = (root, names, icons = []) => {
    const named = all('button, [role="button"], [title], [aria-label]', root).find(el => visible(el) &&
      names.some(name => [el.getAttribute('aria-label'), el.getAttribute('title')].some(label => name.test(normalize(label)))));
    if (named) return named.closest('button, [role="button"]') || named;
    for (const icon of icons) {
      const el = all(`[data-icon="${icon}"]`, root).find(visible);
      if (el) return el.closest('button, [role="button"]') || el.parentElement;
    }
    return null;
  };
  const editableSelector = '[contenteditable="true"], [contenteditable="plaintext-only"]';
  const composer = () => all('#main footer [role="textbox"], #main footer [data-tab]')
    .find(el => visible(el) && el.matches(editableSelector));
  const contactSearchSurface = field => {
    const explicit = field.closest('[data-testid="drawer-left"], [data-testid="new-chat-drawer"], [role="dialog"]');
    if (explicit && !explicit.querySelector('#main')) return explicit;
    // WhatsApp can reuse an unnamed search editor in an unmarked "New chat" pane.
    // Scope by that pane's visible heading, never by the conversation or the whole app.
    let root = field.parentElement;
    while (root && root !== document.body && !root.matches('#main') && !root.querySelector('#main')) {
      if (all('header, [role="heading"], h1, h2, span, div', root).some(el => visible(el)
        && !el.closest(editableSelector) && (el.matches('header, [role="heading"], h1, h2') || !el.children.length)
        && /^(nova conversa|new chat|nuevo chat)$/.test(normalize(plainText(el))))) return root;
      root = root.parentElement;
    }
    return null;
  };
  const contactSearch = () => {
    const fields = all('input:not([type]), input[type="text"], input[type="search"], [contenteditable="true"], [contenteditable="plaintext-only"]')
      .filter(el => visible(el) && !el.closest('#main, footer') && !el.parentElement?.closest(editableSelector));
    const scoped = fields.filter(el => contactSearchSurface(el));
    const labeled = scoped.filter(el => /pesquisar|search|buscar/.test(normalize(el.getAttribute('aria-label') || el.getAttribute('placeholder') || el.getAttribute('title'))));
    return labeled.length === 1 ? labeled[0] : scoped.length === 1 ? scoped[0] : null;
  };
  const setText = (element, value) => {
    guard(); element.focus();
    if (element instanceof HTMLInputElement) {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      setter.call(element, value);
      element.dispatchEvent(new Event('input', { bubbles: true }));
    } else {
      const selection = window.getSelection();
      const range = document.createRange(); range.selectNodeContents(element);
      selection.removeAllRanges(); selection.addRange(range);
      if(value==='') {document.execCommand('delete',false);return;}
      const lines = value.replace(/\r\n?/g, '\n').split('\n');
      for (let i = 0; i < lines.length; i++) {
        if (i && !document.execCommand('insertLineBreak', false)) throw new Error('Não foi possível preservar as linhas da mensagem. Confira o rascunho e copie o texto do sistema.');
        if (lines[i] && !document.execCommand('insertText', false, lines[i])) throw new Error('Não foi possível preencher o texto. A mensagem foi mantida no sistema para copiar.');
      }
    }
  };
  const pasteMessage = async (element, value) => {
    guard(); recipientCheck();
    const empty = el => el && !plainText(el).replace(/[\u200b\ufeff]/g, '').length;
    // Managed editors maintain their own selection. A DOM range alone may leave
    // their caret at the end and cause paste to append to the previous draft.
    // Clear through editing events, then confirm the empty field before pasting.
    element.focus();
    if (!empty(element)) {
      element.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', code: 'KeyA', keyCode: 65, which: 65, ctrlKey: true, bubbles: true, cancelable: true }));
      element.dispatchEvent(new KeyboardEvent('keyup', { key: 'a', code: 'KeyA', keyCode: 65, which: 65, ctrlKey: true, bubbles: true }));
      const selection = window.getSelection();
      const range = document.createRange(); range.selectNodeContents(element);
      selection.removeAllRanges(); selection.addRange(range);
      document.dispatchEvent(new Event('selectionchange'));
      await pause(90);
      recipientCheck();
      if (composer() !== element) throw new Error('A conversa mudou durante a preparação. Clique novamente para preparar a mensagem.');
      const deletion = new InputEvent('beforeinput', { inputType: 'deleteContentBackward', bubbles: true, cancelable: true, composed: true });
      element.dispatchEvent(deletion);
      if (!deletion.defaultPrevented) document.execCommand('delete', false);
      element = await waitFor(() => { const current = composer(); return empty(current) && current; }, 5000,
        'Não consegui limpar o campo da mensagem. O novo texto não foi colado.');
      await pause(90);
      if (!empty(composer())) throw new Error('O campo ainda contém texto. O novo texto não foi colado.');
      element = composer();
    }
    guard(); recipientCheck();
    // Let the chat editor handle the entire message in one paste transaction.
    // Inserting each line separately can lose breaks when a managed editor rerenders.
    const previous = plainText(element);
    element.focus();
    const selection = window.getSelection();
    const range = document.createRange(); range.selectNodeContents(element);
    selection.removeAllRanges(); selection.addRange(range);
    const data = new DataTransfer();
    data.setData('text/plain', value.replace(/\r\n?/g, '\n'));
    const event = new ClipboardEvent('paste', { bubbles: true, cancelable: true, composed: true, clipboardData: data });
    element.dispatchEvent(event);
    if (event.defaultPrevented) {
      // A managed editor owns this paste, even if it commits asynchronously.
      // Never append a second copy while waiting for its update.
      await waitFor(() => plainText(composer()) === cleanText(value), 5000,
        'O WhatsApp não confirmou a formatação completa. Confira o rascunho; a mensagem original está preservada no sistema.');
    } else if (plainText(element) === previous) {
      // Synthetic paste has no browser default action in a plain contenteditable.
      setText(element, value);
    }
  };
  let searchField;
  const rowSelector = '[role="listitem"], [role="row"], [role="option"], [role="button"], button, [data-testid="cell-frame-container"], [data-testid="contact-list-item"]';
  const listCandidates = root => {
    if (!root) return [];
    const candidates = all(`${rowSelector}, span[title], span[dir="auto"]`, root).map(el => {
      const row = el.closest(rowSelector);
      return row && root.contains(row) && !row.contains(searchField) ? row : el;
    }).filter(el => visible(el) && !el.closest(`#main, header, ${editableSelector}, [data-nagano-notice]`) && !el.contains(searchField))
      .filter(el => {
        const label = normalize(plainText(el));
        return label.length > 1 && label.length < 2000 && !/^(nenhum (contato|resultado)|nenhuma (conversa|pessoa)|no (contacts|results|chats)|convidar|invite)/.test(label) && !/^(novo grupo|new group|novo contato|new contact|nova comunidade|new community|contatos no whatsapp|contacts on whatsapp|outros contatos|other contacts|contatos|contacts|frequentes|frequently contacted|nenhum contato encontrado\.?|no contacts found\.?)$/.test(label);
      });
    const unique = [...new Set(candidates)];
    // Prefer the actual inner contact button; clicking an outer list wrapper can miss its handler.
    return unique.filter(el => !unique.some(child => child !== el && el.contains(child)));
  };
  const searchSurface = () => {
    const explicit = searchField && contactSearchSurface(searchField);
    if (explicit) return explicit;
    let root = searchField?.parentElement;
    while (root && root !== document.body && !root.querySelector('#main')) {
      if (listCandidates(root).length) return root;
      root = root.parentElement;
    }
    return searchField?.parentElement;
  };
  const candidateRows = () => listCandidates(searchSurface());
  const resultTarget = row => {
    const labels = all('span[title], span[dir="auto"], [data-testid="cell-frame-title"]', row)
      .filter(el => visible(el) && plainText(el).trim() && !el.closest('a[href], [contenteditable="true"]'));
    return labels.find(el => hasPhone(el.getAttribute('title') || plainText(el))) || labels[0] || row;
  };
  const activateResult = row => {
    const target = resultTarget(row);
    target.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    const rect = target.getBoundingClientRect();
    const options = { bubbles: true, cancelable: true, view: window, button: 0, clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2 };
    // Contact results may use pointer/mouse-down instead of a click on the outer row.
    if (typeof PointerEvent === 'function') target.dispatchEvent(new PointerEvent('pointerdown', { ...options, pointerId: 1, pointerType: 'mouse', isPrimary: true, buttons: 1 }));
    if (target.isConnected) target.dispatchEvent(new MouseEvent('mousedown', { ...options, buttons: 1 }));
    if (target.isConnected && typeof PointerEvent === 'function') target.dispatchEvent(new PointerEvent('pointerup', { ...options, pointerId: 1, pointerType: 'mouse', isPrimary: true }));
    if (target.isConnected) target.dispatchEvent(new MouseEvent('mouseup', options));
    if (target.isConnected) target.click();
    return target;
  };
  const closeInfo = root => {
    const close = button(root, [/^(fechar|close|cerrar)( dados do contato| contact info)?$/], ['x', 'x-alt', 'back']);
    if (close) close.click();
  };
  const infoPanel = () => {
    const explicit = all('[data-testid="drawer-right"], [data-testid="contact-info-drawer"]').find(visible);
    if (explicit) return explicit;
    const header = all('header, [role="heading"], h1, h2').find(el => visible(el) && /^(dados do contato|contact info|informacoes do contato|info\. del contacto)$/.test(normalize(plainText(el))));
    if (!header) return null;
    let root = header.parentElement;
    for (let i = 0; root && i < 3; i++, root = root.parentElement) {
      if (root.querySelector('#main, #side')) return null;
      if (all('a[href^="tel:"], [data-testid="contact-info-phone"], [data-testid="contact-info-subtitle"], span, p, div', root)
        .some(el => el.children.length === 0 && /^\+?[\d\s()-]{10,}$/.test(plainText(el).trim()))) return root;
    }
    return null;
  };
  const verifyRecipient = async () => {
    const header = await waitFor(() => { const el = document.querySelector('#main header'); return visible(el) && el; }, 10000, 'A conversa ainda está abrindo. Aguarde e tente novamente.');
    if (button(header, [/^(dados do grupo|group info|informacoes do grupo|info\. del grupo)$/])) throw new Error('A conversa selecionada é um grupo. Nenhum texto foi preenchido. Confira o número do cliente.');
    if (all('[title], [aria-label], span', header).some(el => visible(el) && hasPhone(el.getAttribute('title') || el.getAttribute('aria-label') || plainText(el)))) return;
    const opener=await waitFor(()=>{
      const info=button(header,[/^(dados do contato|contact info|informacoes do contato|info\. del contacto)$/],[]);
      const title=all('[data-testid="conversation-info-header-chat-title"], span[title]',header).find(el=>visible(el)&&!/^(online|visto por ultimo|last seen)/.test(normalize(el.getAttribute('title'))));
      return info||title?.closest('[role="button"]');
    },5000,'Não consegui conferir o número desta conversa. Nenhum texto foi preenchido.','CHAT_NOT_READY');
    guard(); opener.click();
    const panel = await waitFor(infoPanel, 5000, 'Não consegui abrir os dados do contato para conferir o número. Nenhum texto foi preenchido.');
    try {await waitFor(()=>all('a[href^="tel:"], [data-testid="contact-info-phone"], [data-testid="contact-info-subtitle"], span, p, div', panel)
      .filter(el => el.isConnected && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden' && el.children.length === 0)
      .some(el => {
        const value = el.getAttribute('href')?.replace(/^tel:/, '') || plainText(el).trim();
        return /^\+?[\d\s()-]{10,}$/.test(value) && normalizedPhone(value) === phone;
      }),5000,'O número da conversa não corresponde ao cliente escolhido ou ainda não ficou disponível. Nenhum texto foi preenchido.','CHAT_NOT_READY');}
    finally {closeInfo(panel);} 
  };
  let resultsObserver;
  try {
    if (location.origin !== 'https://web.whatsapp.com') throw flowError('WHATSAPP_UI_NOT_READY','Página do WhatsApp não encontrada.');
    if (!/^55\d{10,11}$/.test(phone) || typeof text !== 'string' || text.length > 60000) throw flowError('MESSAGE_INSERT_FAILED','Confira o telefone e o tamanho da mensagem.');
    if(readWhatsAppReadiness().state!=='ready')state('WAITING_FOR_UI');
    await waitFor(()=>{const ui=readWhatsAppReadiness();if(ui.state==='login_required')throw flowError('AUTH_REQUIRED','Conecte o WhatsApp e clique novamente no sistema.');return ui.state==='ready';},15000,'A interface do WhatsApp ainda está carregando.','WHATSAPP_UI_NOT_READY');
    state('READY'); guard();
    const existingSearch = contactSearch();
    const newChat = existingSearch ? null : await waitFor(() => button(document, [/^(nova conversa|new chat|nuevo chat)(\s*\(.*\))?$/], ['new-chat-outline', 'new-chat', 'chat-new']), 10000,
      'Os controles do WhatsApp ainda não estão disponíveis.','WHATSAPP_UI_NOT_READY');
    guard(); newChat?.click();
    let search = existingSearch || await waitFor(contactSearch, 10000, 'Não consegui localizar a busca de contatos do WhatsApp. Nenhuma página foi recarregada.','SEARCH_FIELD_NOT_FOUND');
    searchField = search;
    const fieldValue=()=>search instanceof HTMLInputElement?search.value:plainText(search);
    const sameQuery=fieldValue().replace(/\D/g,'')===phone;
    const beforeRows=candidateRows().map(el=>plainText(el)).join('\n');
    let resultsChanged=false;
    const surface=searchSurface();
    if(surface){resultsObserver=new MutationObserver(records=>{if(records.some(record=>!search.contains(record.target)&&record.target!==search&&!(record.target instanceof Element&&record.target.closest(editableSelector))))resultsChanged=true;});resultsObserver.observe(surface,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:['aria-busy']});}
    state('SEARCHING_CONTACT');
    if(fieldValue()){
      if(!(search instanceof HTMLInputElement)){
        search.focus();search.dispatchEvent(new KeyboardEvent('keydown',{key:'a',code:'KeyA',ctrlKey:true,bubbles:true,cancelable:true}));
        const range=document.createRange();range.selectNodeContents(search);const selection=window.getSelection();selection.removeAllRanges();selection.addRange(range);document.dispatchEvent(new Event('selectionchange'));await pause(90);
      }
      guard();setText(search,'');
    }
    const acknowledgeQuery=expected=>{const latest=contactSearch();if(!latest)return null;search=latest;searchField=latest;return fieldValue()===expected&&latest;};
    await waitFor(()=>acknowledgeQuery(''),3000,'Não consegui limpar a busca de contatos.','SEARCH_FIELD_NOT_FOUND');
    setText(search,phone);
    await waitFor(()=>acknowledgeQuery(phone),3000,'O WhatsApp não confirmou o número na busca.','SEARCH_FIELD_NOT_FOUND');
    const row = await waitFor(() => {
      const ui=readWhatsAppReadiness();
      if(ui.state==='login_required')throw flowError('AUTH_REQUIRED','Conecte o WhatsApp e tente novamente.');
      if(ui.state!=='ready'||!visible(search))return null;
      if(surface?.getAttribute('aria-busy')==='true'||all('[role="progressbar"], [aria-busy="true"]',surface||document).some(visible))return null;
      const rows = candidateRows();
      const exact = rows.filter(el => hasPhone(plainText(el)) || hasPhone(el.getAttribute('data-id')));
      if (exact.length === 1) return exact[0];
      const fresh=sameQuery||resultsChanged||rows.map(el=>plainText(el)).join('\n')!==beforeRows;
      return fresh&&rows.length===1?rows[0]:null;
    }, 10000, 'Não encontrei uma conversa única para esse número após a pesquisa. Confira o DDD e se o número está no WhatsApp.', 'CONTACT_NOT_FOUND').catch(error=>{
      if(error.code==='CONTACT_NOT_FOUND'&&readWhatsAppReadiness().state!=='ready')throw flowError('WHATSAPP_UI_NOT_READY','O WhatsApp voltou a carregar durante a busca. Aguarde e tente novamente.');
      throw error;
    });
    resultsObserver?.disconnect();
    const beforeHeader = plainText(document.querySelector('#main header'));
    const beforeEditor = composer();
    const targetName = normalize(resultTarget(row).getAttribute('title') || plainText(resultTarget(row)));
    const changedConversation = () => {
      const header=document.querySelector('#main header'),headerText=plainText(header);
      const changed=!visible(search)||headerText!==beforeHeader||composer()!==beforeEditor;
      const target=hasPhone(headerText)||all('[title]',header||document.createElement('div')).some(el=>hasPhone(el.getAttribute('title'))) || (targetName&&normalize(headerText).includes(targetName));
      return changed&&visible(header)&&target&&header;
    };
    state('OPENING_CHAT'); guard(); activateResult(row);
    try {await waitFor(changedConversation,4000,'A seleção do contato ainda não terminou.','CHAT_NOT_READY');}
    catch(error){
      if(error.code==='CANCELLED')throw error;
      // A single bounded keyboard fallback targets only the contact result.
      const keyTarget=row.closest('[tabindex]')||row;
      guard();
      if(keyTarget.isConnected&&!keyTarget.closest('#main')&&!keyTarget.isContentEditable){keyTarget.focus();keyTarget.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',code:'Enter',bubbles:true,cancelable:true}));keyTarget.dispatchEvent(new KeyboardEvent('keyup',{key:'Enter',code:'Enter',bubbles:true,cancelable:true}));}
      await waitFor(changedConversation,6000,'O contato apareceu, mas a conversa não terminou de abrir.','CHAT_NOT_READY');
    }
    await verifyRecipient(); guard();
    const header=document.querySelector('#main header');
    const headerKey=()=>all('[data-testid="conversation-info-header-chat-title"], span[title]',document.querySelector('#main header')||document.createElement('div')).map(el=>el.getAttribute('title')||plainText(el)).filter(value=>! /^(online|visto por ultimo|last seen)/.test(normalize(value))).join('|')||plainText(document.querySelector('#main header'));
    const verifiedKey=headerKey();
    recipientCheck=()=>{guard();if(document.querySelector('#main header')!==header||headerKey()!==verifiedKey)throw flowError('CHAT_NOT_READY','A conversa mudou durante a preparação. Nenhuma nova colagem foi realizada.');};
    let editor=await waitFor(composer,10000,'A conversa abriu, mas o campo da mensagem ainda não está disponível.','MESSAGE_FIELD_NOT_FOUND');
    recipientCheck(); state('INSERTING_MESSAGE');
    // Existing clearing and single-paste behavior stays intact, including contact-only requests.
    if(text&&plainText(editor)!==cleanText(text)){
      await pasteMessage(editor,text);
      await waitFor(()=>{recipientCheck();return plainText(composer())===cleanText(text);},5000,'Não foi possível confirmar o texto completo no WhatsApp.','MESSAGE_INSERT_FAILED');
    }
    recipientCheck(); editor=composer();
    if(!editor)throw flowError('MESSAGE_FIELD_NOT_FOUND','O campo da mensagem mudou. Confira o rascunho antes de tentar novamente.');
    editor.focus(); state('COMPLETED'); return {ok:true,state:'COMPLETED'};
  } catch(error) {
    const code=error?.code|| (phase==='INSERTING_MESSAGE'?'MESSAGE_INSERT_FAILED':'CHAT_NOT_READY');
    state(code==='CANCELLED'?'CANCELLED':'ERROR');
    return {ok:false,state:code==='CANCELLED'?'CANCELLED':'ERROR',code,error:error instanceof Error?error.message:'Não foi possível preparar a conversa. A mensagem continua no sistema.'};
  } finally {resultsObserver?.disconnect();}
}
