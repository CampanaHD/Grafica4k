/** A short, read-only probe. Loading the document does not mean the chat UI is ready. */
export function readWhatsAppReadiness() {
  if (location.origin !== 'https://web.whatsapp.com') return { state: 'loading' };
  const normalize = value => (value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  const visible = element => {
    if (!element?.isConnected || !element.getClientRects().length) return false;
    const style = getComputedStyle(element), rect = element.getBoundingClientRect();
    return style.visibility !== 'hidden' && style.display !== 'none' && rect.right > 0 && rect.bottom > 0 && rect.left < innerWidth && rect.top < innerHeight;
  };
  const all = selector => [...document.querySelectorAll(selector)];
  const qr = all('[data-testid="qrcode"], [data-ref] canvas, canvas[aria-label]').some(element => visible(element) &&
    (element.matches('[data-testid="qrcode"], [data-ref] canvas') || /qr/.test(normalize(element.getAttribute('aria-label')))));
  const login=all('button, a, [role="button"], h1, h2, [role="heading"]').some(element=>visible(element)&&/^(link with phone number|conectar com (o )?numero de telefone|entrar com (o )?numero de telefone|log (in to|into) whatsapp|entrar no whatsapp)/.test(normalize(element.innerText||element.textContent)));
  if(qr||login)return {state:'login_required'};
  const usable=element=>visible(element)&&!element.closest('button:disabled, [aria-disabled="true"]');
  const readyButton = all('button, [role="button"], [title], [aria-label]').some(element => usable(element) &&
    [element.getAttribute('aria-label'), element.getAttribute('title')].some(label => /^(nova conversa|new chat|nuevo chat)(\s*\(.*\))?$/.test(normalize(label))));
  const readyIcon = all('[data-icon="new-chat-outline"], [data-icon="new-chat"], [data-icon="chat-new"]').some(usable);
  const drawer = all('[data-testid="drawer-left"], [data-testid="new-chat-drawer"], header, [role="heading"], h1, h2')
    .some(element => visible(element) && /^(nova conversa|new chat|nuevo chat)$/.test(normalize(element.innerText || element.textContent)));
  if (readyButton || readyIcon || drawer) return { state: 'ready' };
  // Do not interact with account login or a QR code. The user signs in and retries.
  return {state:'loading'};
}

