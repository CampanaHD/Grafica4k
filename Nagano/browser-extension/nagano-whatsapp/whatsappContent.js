(() => {
  // browser-extension/nagano-whatsapp/flowWait.js
  var flowError = (code, message) => Object.assign(new Error(message), { code });
  async function waitForCondition(find, options = {}) {
    const { timeout = 3e4, interval = 300, signal, deadline = Infinity, code = "WHATSAPP_UI_NOT_READY", message = "A interface ainda n\xE3o est\xE1 pronta.", now = () => Date.now(), pause } = options;
    if (!Number.isFinite(timeout) || timeout < 0 || !Number.isFinite(interval) || interval <= 0) throw new TypeError("Informe prazo e intervalo finitos para a espera.");
    const until = Math.min(deadline, now() + timeout);
    let stopped = false, timer, sleepTimer, wake;
    const cancelled = () => flowError("CANCELLED", "Prepara\xE7\xE3o cancelada. Nenhuma mensagem foi enviada.");
    const check = () => {
      if (signal?.aborted || stopped) throw cancelled();
    };
    let abort;
    const end = new Promise((_, reject) => {
      timer = setTimeout(() => {
        stopped = true;
        reject(flowError(code, message));
        wake?.();
      }, Math.max(0, until - now()));
      abort = () => {
        stopped = true;
        reject(cancelled());
        wake?.();
      };
      signal?.addEventListener("abort", abort, { once: true });
    });
    const run = async () => {
      do {
        check();
        if (now() >= until) throw flowError(code, message);
        const value = await find();
        check();
        if (value) return value;
        if (now() >= until) break;
        const delay = Math.min(interval, until - now());
        if (pause) await pause(delay);
        else await new Promise((resolve) => {
          wake = resolve;
          sleepTimer = setTimeout(resolve, delay);
        });
      } while (now() < until);
      throw flowError(code, message);
    };
    try {
      return await Promise.race([run(), end]);
    } finally {
      stopped = true;
      clearTimeout(timer);
      clearTimeout(sleepTimer);
      signal?.removeEventListener("abort", abort);
      wake?.();
    }
  }

  // browser-extension/nagano-whatsapp/pageReadiness.js
  function readWhatsAppReadiness() {
    if (location.origin !== "https://web.whatsapp.com") return { state: "loading" };
    const normalize = (value) => (value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
    const visible = (element) => {
      if (!element?.isConnected || !element.getClientRects().length) return false;
      const style = getComputedStyle(element), rect = element.getBoundingClientRect();
      return style.visibility !== "hidden" && style.display !== "none" && rect.right > 0 && rect.bottom > 0 && rect.left < innerWidth && rect.top < innerHeight;
    };
    const all = (selector) => [...document.querySelectorAll(selector)];
    const qr = all('[data-testid="qrcode"], [data-ref] canvas, canvas[aria-label]').some((element) => visible(element) && (element.matches('[data-testid="qrcode"], [data-ref] canvas') || /qr/.test(normalize(element.getAttribute("aria-label")))));
    const login = all('button, a, [role="button"], h1, h2, [role="heading"]').some((element) => visible(element) && /^(link with phone number|conectar com (o )?numero de telefone|entrar com (o )?numero de telefone|log (in to|into) whatsapp|entrar no whatsapp)/.test(normalize(element.innerText || element.textContent)));
    if (qr || login) return { state: "login_required" };
    const usable = (element) => visible(element) && !element.closest('button:disabled, [aria-disabled="true"]');
    const readyButton = all('button, [role="button"], [title], [aria-label]').some((element) => usable(element) && [element.getAttribute("aria-label"), element.getAttribute("title")].some((label) => /^(nova conversa|new chat|nuevo chat)(\s*\(.*\))?$/.test(normalize(label))));
    const readyIcon = all('[data-icon="new-chat-outline"], [data-icon="new-chat"], [data-icon="chat-new"]').some(usable);
    const drawer = all('[data-testid="drawer-left"], [data-testid="new-chat-drawer"], header, [role="heading"], h1, h2').some((element) => visible(element) && /^(nova conversa|new chat|nuevo chat)$/.test(normalize(element.innerText || element.textContent)));
    if (readyButton || readyIcon || drawer) return { state: "ready" };
    return { state: "loading" };
  }

  // browser-extension/nagano-whatsapp/chatComposer.js
  async function prepareChatInPage(phone, text, options = {}) {
    const deadline = Math.min(options.deadline || Infinity, Date.now() + 6e4);
    let phase = "WAITING_FOR_UI", recipientCheck = () => {
    };
    const state = (value) => {
      phase = value;
      options.onState?.(value);
    };
    const guard = () => {
      if (options.signal?.aborted) throw flowError("CANCELLED", "Prepara\xE7\xE3o cancelada. Nenhuma mensagem foi enviada.");
      if (Date.now() >= deadline) throw flowError(phase === "INSERTING_MESSAGE" ? "MESSAGE_INSERT_FAILED" : "CHAT_NOT_READY", "O prazo da prepara\xE7\xE3o terminou. A mensagem est\xE1 preservada no sistema.");
    };
    const normalize = (value) => (value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
    const all = (selector, root = document) => [...root.querySelectorAll(selector)];
    const visible = (element) => {
      if (!element?.isConnected || !element.getClientRects().length || getComputedStyle(element).visibility === "hidden" || getComputedStyle(element).display === "none") return false;
      const rect = element.getBoundingClientRect();
      return rect.right > 0 && rect.bottom > 0 && rect.left < innerWidth && rect.top < innerHeight;
    };
    const cleanText = (value) => (value || "").replace(/\r\n?/g, "\n").replace(/\u00a0/g, " ").replace(/\n$/, "");
    const plainText = (element) => cleanText(element?.innerText ?? element?.textContent ?? "");
    const normalizedPhone = (value) => {
      const digits = (value || "").replace(/\D/g, "");
      return digits.length === 10 || digits.length === 11 ? "55" + digits : digits;
    };
    const hasPhone = (value) => (String(value || "").match(/\+?\d[\d ()-]{8,}\d/g) || []).some((part) => normalizedPhone(part) === phone);
    const pause = async (ms) => {
      guard();
      await new Promise((resolve) => setTimeout(resolve, ms));
      guard();
    };
    const waitFor = (find, timeout, message, code = phase === "INSERTING_MESSAGE" ? "MESSAGE_INSERT_FAILED" : "CHAT_NOT_READY") => waitForCondition(find, { timeout, interval: 150, signal: options.signal, deadline, code, message });
    const button = (root, names, icons = []) => {
      const named = all('button, [role="button"], [title], [aria-label]', root).find((el) => visible(el) && names.some((name) => [el.getAttribute("aria-label"), el.getAttribute("title")].some((label) => name.test(normalize(label)))));
      if (named) return named.closest('button, [role="button"]') || named;
      for (const icon of icons) {
        const el = all(`[data-icon="${icon}"]`, root).find(visible);
        if (el) return el.closest('button, [role="button"]') || el.parentElement;
      }
      return null;
    };
    const editableSelector = '[contenteditable="true"], [contenteditable="plaintext-only"]';
    const composer = () => all('#main footer [role="textbox"], #main footer [data-tab]').find((el) => visible(el) && el.matches(editableSelector));
    const contactSearchSurface = (field) => {
      const explicit = field.closest('[data-testid="drawer-left"], [data-testid="new-chat-drawer"], [role="dialog"]');
      if (explicit && !explicit.querySelector("#main")) return explicit;
      let root = field.parentElement;
      while (root && root !== document.body && !root.matches("#main") && !root.querySelector("#main")) {
        if (all('header, [role="heading"], h1, h2, span, div', root).some((el) => visible(el) && !el.closest(editableSelector) && (el.matches('header, [role="heading"], h1, h2') || !el.children.length) && /^(nova conversa|new chat|nuevo chat)$/.test(normalize(plainText(el))))) return root;
        root = root.parentElement;
      }
      return null;
    };
    const contactSearch = () => {
      const fields = all('input:not([type]), input[type="text"], input[type="search"], [contenteditable="true"], [contenteditable="plaintext-only"]').filter((el) => visible(el) && !el.closest("#main, footer") && !el.parentElement?.closest(editableSelector));
      const scoped = fields.filter((el) => contactSearchSurface(el));
      const labeled = scoped.filter((el) => /pesquisar|search|buscar/.test(normalize(el.getAttribute("aria-label") || el.getAttribute("placeholder") || el.getAttribute("title"))));
      return labeled.length === 1 ? labeled[0] : scoped.length === 1 ? scoped[0] : null;
    };
    const setText = (element, value) => {
      guard();
      element.focus();
      if (element instanceof HTMLInputElement) {
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
        setter.call(element, value);
        element.dispatchEvent(new Event("input", { bubbles: true }));
      } else {
        const selection = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(element);
        selection.removeAllRanges();
        selection.addRange(range);
        if (value === "") {
          document.execCommand("delete", false);
          return;
        }
        const lines = value.replace(/\r\n?/g, "\n").split("\n");
        for (let i = 0; i < lines.length; i++) {
          if (i && !document.execCommand("insertLineBreak", false)) throw new Error("N\xE3o foi poss\xEDvel preservar as linhas da mensagem. Confira o rascunho e copie o texto do sistema.");
          if (lines[i] && !document.execCommand("insertText", false, lines[i])) throw new Error("N\xE3o foi poss\xEDvel preencher o texto. A mensagem foi mantida no sistema para copiar.");
        }
      }
    };
    const pasteMessage = async (element, value) => {
      guard();
      recipientCheck();
      const empty = (el) => el && !plainText(el).replace(/[\u200b\ufeff]/g, "").length;
      element.focus();
      if (!empty(element)) {
        element.dispatchEvent(new KeyboardEvent("keydown", { key: "a", code: "KeyA", keyCode: 65, which: 65, ctrlKey: true, bubbles: true, cancelable: true }));
        element.dispatchEvent(new KeyboardEvent("keyup", { key: "a", code: "KeyA", keyCode: 65, which: 65, ctrlKey: true, bubbles: true }));
        const selection2 = window.getSelection();
        const range2 = document.createRange();
        range2.selectNodeContents(element);
        selection2.removeAllRanges();
        selection2.addRange(range2);
        document.dispatchEvent(new Event("selectionchange"));
        await pause(90);
        recipientCheck();
        if (composer() !== element) throw new Error("A conversa mudou durante a prepara\xE7\xE3o. Clique novamente para preparar a mensagem.");
        const deletion = new InputEvent("beforeinput", { inputType: "deleteContentBackward", bubbles: true, cancelable: true, composed: true });
        element.dispatchEvent(deletion);
        if (!deletion.defaultPrevented) document.execCommand("delete", false);
        element = await waitFor(
          () => {
            const current = composer();
            return empty(current) && current;
          },
          5e3,
          "N\xE3o consegui limpar o campo da mensagem. O novo texto n\xE3o foi colado."
        );
        await pause(90);
        if (!empty(composer())) throw new Error("O campo ainda cont\xE9m texto. O novo texto n\xE3o foi colado.");
        element = composer();
      }
      guard();
      recipientCheck();
      const previous = plainText(element);
      element.focus();
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(element);
      selection.removeAllRanges();
      selection.addRange(range);
      const data = new DataTransfer();
      data.setData("text/plain", value.replace(/\r\n?/g, "\n"));
      const event = new ClipboardEvent("paste", { bubbles: true, cancelable: true, composed: true, clipboardData: data });
      element.dispatchEvent(event);
      if (event.defaultPrevented) {
        await waitFor(
          () => plainText(composer()) === cleanText(value),
          5e3,
          "O WhatsApp n\xE3o confirmou a formata\xE7\xE3o completa. Confira o rascunho; a mensagem original est\xE1 preservada no sistema."
        );
      } else if (plainText(element) === previous) {
        setText(element, value);
      }
    };
    let searchField;
    const rowSelector = '[role="listitem"], [role="row"], [role="option"], [role="button"], button, [data-testid="cell-frame-container"], [data-testid="contact-list-item"]';
    const listCandidates = (root) => {
      if (!root) return [];
      const candidates = all(`${rowSelector}, span[title], span[dir="auto"]`, root).map((el) => {
        const row = el.closest(rowSelector);
        return row && root.contains(row) && !row.contains(searchField) ? row : el;
      }).filter((el) => visible(el) && !el.closest(`#main, header, ${editableSelector}, [data-nagano-notice]`) && !el.contains(searchField)).filter((el) => {
        const label = normalize(plainText(el));
        return label.length > 1 && label.length < 2e3 && !/^(nenhum (contato|resultado)|nenhuma (conversa|pessoa)|no (contacts|results|chats)|convidar|invite)/.test(label) && !/^(novo grupo|new group|novo contato|new contact|nova comunidade|new community|contatos no whatsapp|contacts on whatsapp|outros contatos|other contacts|contatos|contacts|frequentes|frequently contacted|nenhum contato encontrado\.?|no contacts found\.?)$/.test(label);
      });
      const unique = [...new Set(candidates)];
      return unique.filter((el) => !unique.some((child) => child !== el && el.contains(child)));
    };
    const searchSurface = () => {
      const explicit = searchField && contactSearchSurface(searchField);
      if (explicit) return explicit;
      let root = searchField?.parentElement;
      while (root && root !== document.body && !root.querySelector("#main")) {
        if (listCandidates(root).length) return root;
        root = root.parentElement;
      }
      return searchField?.parentElement;
    };
    const candidateRows = () => listCandidates(searchSurface());
    const resultTarget = (row) => {
      const labels = all('span[title], span[dir="auto"], [data-testid="cell-frame-title"]', row).filter((el) => visible(el) && plainText(el).trim() && !el.closest('a[href], [contenteditable="true"]'));
      return labels.find((el) => hasPhone(el.getAttribute("title") || plainText(el))) || labels[0] || row;
    };
    const activateResult = (row) => {
      const target = resultTarget(row);
      target.scrollIntoView({ block: "nearest", inline: "nearest" });
      const rect = target.getBoundingClientRect();
      const options2 = { bubbles: true, cancelable: true, view: window, button: 0, clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2 };
      if (typeof PointerEvent === "function") target.dispatchEvent(new PointerEvent("pointerdown", { ...options2, pointerId: 1, pointerType: "mouse", isPrimary: true, buttons: 1 }));
      if (target.isConnected) target.dispatchEvent(new MouseEvent("mousedown", { ...options2, buttons: 1 }));
      if (target.isConnected && typeof PointerEvent === "function") target.dispatchEvent(new PointerEvent("pointerup", { ...options2, pointerId: 1, pointerType: "mouse", isPrimary: true }));
      if (target.isConnected) target.dispatchEvent(new MouseEvent("mouseup", options2));
      if (target.isConnected) target.click();
      return target;
    };
    const closeInfo = (root) => {
      const close = button(root, [/^(fechar|close|cerrar)( dados do contato| contact info)?$/], ["x", "x-alt", "back"]);
      if (close) close.click();
    };
    const infoPanel = () => {
      const explicit = all('[data-testid="drawer-right"], [data-testid="contact-info-drawer"]').find(visible);
      if (explicit) return explicit;
      const header = all('header, [role="heading"], h1, h2').find((el) => visible(el) && /^(dados do contato|contact info|informacoes do contato|info\. del contacto)$/.test(normalize(plainText(el))));
      if (!header) return null;
      let root = header.parentElement;
      for (let i = 0; root && i < 3; i++, root = root.parentElement) {
        if (root.querySelector("#main, #side")) return null;
        if (all('a[href^="tel:"], [data-testid="contact-info-phone"], [data-testid="contact-info-subtitle"], span, p, div', root).some((el) => el.children.length === 0 && /^\+?[\d\s()-]{10,}$/.test(plainText(el).trim()))) return root;
      }
      return null;
    };
    const verifyRecipient = async () => {
      const header = await waitFor(() => {
        const el = document.querySelector("#main header");
        return visible(el) && el;
      }, 1e4, "A conversa ainda est\xE1 abrindo. Aguarde e tente novamente.");
      if (button(header, [/^(dados do grupo|group info|informacoes do grupo|info\. del grupo)$/])) throw new Error("A conversa selecionada \xE9 um grupo. Nenhum texto foi preenchido. Confira o n\xFAmero do cliente.");
      if (all("[title], [aria-label], span", header).some((el) => visible(el) && hasPhone(el.getAttribute("title") || el.getAttribute("aria-label") || plainText(el)))) return;
      const opener = await waitFor(() => {
        const info = button(header, [/^(dados do contato|contact info|informacoes do contato|info\. del contacto)$/], []);
        const title = all('[data-testid="conversation-info-header-chat-title"], span[title]', header).find((el) => visible(el) && !/^(online|visto por ultimo|last seen)/.test(normalize(el.getAttribute("title"))));
        return info || title?.closest('[role="button"]');
      }, 5e3, "N\xE3o consegui conferir o n\xFAmero desta conversa. Nenhum texto foi preenchido.", "CHAT_NOT_READY");
      guard();
      opener.click();
      const panel = await waitFor(infoPanel, 5e3, "N\xE3o consegui abrir os dados do contato para conferir o n\xFAmero. Nenhum texto foi preenchido.");
      try {
        await waitFor(() => all('a[href^="tel:"], [data-testid="contact-info-phone"], [data-testid="contact-info-subtitle"], span, p, div', panel).filter((el) => el.isConnected && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== "hidden" && el.children.length === 0).some((el) => {
          const value = el.getAttribute("href")?.replace(/^tel:/, "") || plainText(el).trim();
          return /^\+?[\d\s()-]{10,}$/.test(value) && normalizedPhone(value) === phone;
        }), 5e3, "O n\xFAmero da conversa n\xE3o corresponde ao cliente escolhido ou ainda n\xE3o ficou dispon\xEDvel. Nenhum texto foi preenchido.", "CHAT_NOT_READY");
      } finally {
        closeInfo(panel);
      }
    };
    let resultsObserver;
    try {
      if (location.origin !== "https://web.whatsapp.com") throw flowError("WHATSAPP_UI_NOT_READY", "P\xE1gina do WhatsApp n\xE3o encontrada.");
      if (!/^55\d{10,11}$/.test(phone) || typeof text !== "string" || text.length > 6e4) throw flowError("MESSAGE_INSERT_FAILED", "Confira o telefone e o tamanho da mensagem.");
      if (readWhatsAppReadiness().state !== "ready") state("WAITING_FOR_UI");
      await waitFor(() => {
        const ui = readWhatsAppReadiness();
        if (ui.state === "login_required") throw flowError("AUTH_REQUIRED", "Conecte o WhatsApp e clique novamente no sistema.");
        return ui.state === "ready";
      }, 15e3, "A interface do WhatsApp ainda est\xE1 carregando.", "WHATSAPP_UI_NOT_READY");
      state("READY");
      guard();
      const existingSearch = contactSearch();
      const newChat = existingSearch ? null : await waitFor(
        () => button(document, [/^(nova conversa|new chat|nuevo chat)(\s*\(.*\))?$/], ["new-chat-outline", "new-chat", "chat-new"]),
        1e4,
        "Os controles do WhatsApp ainda n\xE3o est\xE3o dispon\xEDveis.",
        "WHATSAPP_UI_NOT_READY"
      );
      guard();
      newChat?.click();
      let search = existingSearch || await waitFor(contactSearch, 1e4, "N\xE3o consegui localizar a busca de contatos do WhatsApp. Nenhuma p\xE1gina foi recarregada.", "SEARCH_FIELD_NOT_FOUND");
      searchField = search;
      const fieldValue = () => search instanceof HTMLInputElement ? search.value : plainText(search);
      const sameQuery = fieldValue().replace(/\D/g, "") === phone;
      const beforeRows = candidateRows().map((el) => plainText(el)).join("\n");
      let resultsChanged = false;
      const surface = searchSurface();
      if (surface) {
        resultsObserver = new MutationObserver((records) => {
          if (records.some((record) => !search.contains(record.target) && record.target !== search && !(record.target instanceof Element && record.target.closest(editableSelector)))) resultsChanged = true;
        });
        resultsObserver.observe(surface, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ["aria-busy"] });
      }
      state("SEARCHING_CONTACT");
      if (fieldValue()) {
        if (!(search instanceof HTMLInputElement)) {
          search.focus();
          search.dispatchEvent(new KeyboardEvent("keydown", { key: "a", code: "KeyA", ctrlKey: true, bubbles: true, cancelable: true }));
          const range = document.createRange();
          range.selectNodeContents(search);
          const selection = window.getSelection();
          selection.removeAllRanges();
          selection.addRange(range);
          document.dispatchEvent(new Event("selectionchange"));
          await pause(90);
        }
        guard();
        setText(search, "");
      }
      const acknowledgeQuery = (expected) => {
        const latest = contactSearch();
        if (!latest) return null;
        search = latest;
        searchField = latest;
        return fieldValue() === expected && latest;
      };
      await waitFor(() => acknowledgeQuery(""), 3e3, "N\xE3o consegui limpar a busca de contatos.", "SEARCH_FIELD_NOT_FOUND");
      setText(search, phone);
      await waitFor(() => acknowledgeQuery(phone), 3e3, "O WhatsApp n\xE3o confirmou o n\xFAmero na busca.", "SEARCH_FIELD_NOT_FOUND");
      const row = await waitFor(() => {
        const ui = readWhatsAppReadiness();
        if (ui.state === "login_required") throw flowError("AUTH_REQUIRED", "Conecte o WhatsApp e tente novamente.");
        if (ui.state !== "ready" || !visible(search)) return null;
        if (surface?.getAttribute("aria-busy") === "true" || all('[role="progressbar"], [aria-busy="true"]', surface || document).some(visible)) return null;
        const rows = candidateRows();
        const exact = rows.filter((el) => hasPhone(plainText(el)) || hasPhone(el.getAttribute("data-id")));
        if (exact.length === 1) return exact[0];
        const fresh = sameQuery || resultsChanged || rows.map((el) => plainText(el)).join("\n") !== beforeRows;
        return fresh && rows.length === 1 ? rows[0] : null;
      }, 1e4, "N\xE3o encontrei uma conversa \xFAnica para esse n\xFAmero ap\xF3s a pesquisa. Confira o DDD e se o n\xFAmero est\xE1 no WhatsApp.", "CONTACT_NOT_FOUND").catch((error) => {
        if (error.code === "CONTACT_NOT_FOUND" && readWhatsAppReadiness().state !== "ready") throw flowError("WHATSAPP_UI_NOT_READY", "O WhatsApp voltou a carregar durante a busca. Aguarde e tente novamente.");
        throw error;
      });
      resultsObserver?.disconnect();
      const beforeHeader = plainText(document.querySelector("#main header"));
      const beforeEditor = composer();
      const targetName = normalize(resultTarget(row).getAttribute("title") || plainText(resultTarget(row)));
      const changedConversation = () => {
        const header2 = document.querySelector("#main header"), headerText = plainText(header2);
        const changed = !visible(search) || headerText !== beforeHeader || composer() !== beforeEditor;
        const target = hasPhone(headerText) || all("[title]", header2 || document.createElement("div")).some((el) => hasPhone(el.getAttribute("title"))) || targetName && normalize(headerText).includes(targetName);
        return changed && visible(header2) && target && header2;
      };
      state("OPENING_CHAT");
      guard();
      activateResult(row);
      try {
        await waitFor(changedConversation, 4e3, "A sele\xE7\xE3o do contato ainda n\xE3o terminou.", "CHAT_NOT_READY");
      } catch (error) {
        if (error.code === "CANCELLED") throw error;
        const keyTarget = row.closest("[tabindex]") || row;
        guard();
        if (keyTarget.isConnected && !keyTarget.closest("#main") && !keyTarget.isContentEditable) {
          keyTarget.focus();
          keyTarget.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", bubbles: true, cancelable: true }));
          keyTarget.dispatchEvent(new KeyboardEvent("keyup", { key: "Enter", code: "Enter", bubbles: true, cancelable: true }));
        }
        await waitFor(changedConversation, 6e3, "O contato apareceu, mas a conversa n\xE3o terminou de abrir.", "CHAT_NOT_READY");
      }
      await verifyRecipient();
      guard();
      const header = document.querySelector("#main header");
      const headerKey = () => all('[data-testid="conversation-info-header-chat-title"], span[title]', document.querySelector("#main header") || document.createElement("div")).map((el) => el.getAttribute("title") || plainText(el)).filter((value) => !/^(online|visto por ultimo|last seen)/.test(normalize(value))).join("|") || plainText(document.querySelector("#main header"));
      const verifiedKey = headerKey();
      recipientCheck = () => {
        guard();
        if (document.querySelector("#main header") !== header || headerKey() !== verifiedKey) throw flowError("CHAT_NOT_READY", "A conversa mudou durante a prepara\xE7\xE3o. Nenhuma nova colagem foi realizada.");
      };
      let editor = await waitFor(composer, 1e4, "A conversa abriu, mas o campo da mensagem ainda n\xE3o est\xE1 dispon\xEDvel.", "MESSAGE_FIELD_NOT_FOUND");
      recipientCheck();
      state("INSERTING_MESSAGE");
      if (text && plainText(editor) !== cleanText(text)) {
        await pasteMessage(editor, text);
        await waitFor(() => {
          recipientCheck();
          return plainText(composer()) === cleanText(text);
        }, 5e3, "N\xE3o foi poss\xEDvel confirmar o texto completo no WhatsApp.", "MESSAGE_INSERT_FAILED");
      }
      recipientCheck();
      editor = composer();
      if (!editor) throw flowError("MESSAGE_FIELD_NOT_FOUND", "O campo da mensagem mudou. Confira o rascunho antes de tentar novamente.");
      editor.focus();
      state("COMPLETED");
      return { ok: true, state: "COMPLETED" };
    } catch (error) {
      const code = error?.code || (phase === "INSERTING_MESSAGE" ? "MESSAGE_INSERT_FAILED" : "CHAT_NOT_READY");
      state(code === "CANCELLED" ? "CANCELLED" : "ERROR");
      return { ok: false, state: code === "CANCELLED" ? "CANCELLED" : "ERROR", code, error: error instanceof Error ? error.message : "N\xE3o foi poss\xEDvel preparar a conversa. A mensagem continua no sistema." };
    } finally {
      resultsObserver?.disconnect();
    }
  }

  // browser-extension/nagano-whatsapp/flowProtocol.js
  var protocol = "nagano-whatsapp-flow-v2";
  var errorMessages = {
    WHATSAPP_OPEN_TIMEOUT: "O WhatsApp n\xE3o terminou de abrir no prazo. Aguarde a aba carregar e tente novamente.",
    WHATSAPP_UI_NOT_READY: "O WhatsApp ainda n\xE3o est\xE1 pronto para uso. Aguarde a lista de conversas aparecer e tente novamente.",
    AUTH_REQUIRED: "Conecte seu WhatsApp pelo QR Code ou pela tela de login e clique novamente no bot\xE3o do sistema.",
    SEARCH_FIELD_NOT_FOUND: "A busca de contatos ainda n\xE3o est\xE1 dispon\xEDvel. Nenhuma p\xE1gina foi recarregada.",
    CONTACT_NOT_FOUND: "N\xE3o encontrei uma conversa \xFAnica para esse n\xFAmero ap\xF3s a pesquisa. Confira o DDD e se o n\xFAmero est\xE1 no WhatsApp.",
    CHAT_NOT_READY: "A conversa ainda n\xE3o est\xE1 pronta ou o n\xFAmero n\xE3o p\xF4de ser confirmado. Nenhum texto foi preenchido em outra conversa.",
    MESSAGE_FIELD_NOT_FOUND: "A conversa abriu, mas o campo da mensagem ainda n\xE3o ficou dispon\xEDvel.",
    MESSAGE_INSERT_FAILED: "N\xE3o foi poss\xEDvel confirmar a mensagem completa. Confira o rascunho; o texto original est\xE1 preservado no sistema.",
    FLOW_BUSY: "Uma prepara\xE7\xE3o j\xE1 est\xE1 em andamento. Aguarde sua conclus\xE3o.",
    CANCELLED: "Prepara\xE7\xE3o cancelada. Nenhuma mensagem foi enviada."
  };

  // browser-extension/nagano-whatsapp/whatsappContentSource.js
  function registerWhatsAppContent(browser, scope = globalThis) {
    if (scope.__naganoWhatsAppFlow?.protocol === protocol) return scope.__naganoWhatsAppFlow;
    let active;
    const finished = /* @__PURE__ */ new Map();
    const runtime = { protocol };
    const listener = (message, sender, sendResponse) => {
      if (sender.id !== browser.runtime.id || message?.protocol !== protocol) return false;
      if (message.action === "STATUS") {
        const flow2 = message.flowId === active?.id ? active : void 0;
        sendResponse({ handshake: "CONTENT_SCRIPT_READY", protocol, ui: readWhatsAppReadiness().state, ...flow2 ? { flowId: flow2.id, events: flow2.events, state: flow2.state } : {}, result: finished.get(message.flowId) });
        return false;
      }
      if (message.action === "CANCEL") {
        if (active?.id === message.flowId) active.controller.abort();
        sendResponse({ ok: true });
        return false;
      }
      if (message.action !== "START_AUTOMATION") return false;
      if (typeof message.flowId !== "string" || message.flowId.length > 80) {
        sendResponse({ ok: false, code: "WHATSAPP_UI_NOT_READY" });
        return false;
      }
      if (finished.has(message.flowId) || active?.id === message.flowId) {
        sendResponse({ ok: true, started: true });
        return false;
      }
      if (active) {
        sendResponse({ ok: false, code: "FLOW_BUSY", error: errorMessages.FLOW_BUSY });
        return false;
      }
      const ui = readWhatsAppReadiness().state;
      if (ui !== "ready") {
        const code = ui === "login_required" ? "AUTH_REQUIRED" : "WHATSAPP_UI_NOT_READY";
        sendResponse({ ok: false, code, error: errorMessages[code] });
        return false;
      }
      const flow = { id: message.flowId, controller: new AbortController(), events: [], state: "READY" };
      active = flow;
      const onState = (state) => {
        if (flow.state !== state || !flow.events.length) {
          flow.state = state;
          flow.events.push(state);
          console.debug(`[WhatsAppFlow] state=${state}`);
        }
      };
      const timeout = Number.isFinite(message.timeout) ? Math.max(1, Math.min(6e4, message.timeout)) : 6e4;
      sendResponse({ ok: true, started: true });
      void prepareChatInPage(message.phone, message.text, { signal: flow.controller.signal, deadline: Date.now() + timeout, onState }).then((result) => {
        finished.set(flow.id, { ...result, events: flow.events });
        while (finished.size > 32) finished.delete(finished.keys().next().value);
      }).catch(() => finished.set(flow.id, { ok: false, state: "ERROR", code: "MESSAGE_INSERT_FAILED", error: errorMessages.MESSAGE_INSERT_FAILED, events: flow.events })).finally(() => {
        if (active === flow) active = void 0;
      });
      return false;
    };
    browser.runtime.onMessage.addListener(listener);
    scope.addEventListener?.("pagehide", () => active?.controller.abort(), { once: true });
    scope.__naganoWhatsAppFlow = runtime;
    return runtime;
  }
  if (typeof chrome !== "undefined" && chrome.runtime?.id && location.origin === "https://web.whatsapp.com") registerWhatsAppContent(chrome);
})();
