import React, { useEffect, useState } from 'react';
import { Download, RefreshCw, MessageSquare } from 'lucide-react';
import { requestWhatsAppBridge, supportsReliableWhatsAppFlow } from '../services/whatsappWeb';
export function WhatsAppWebConnection() {
  const [status, setStatus] = useState('Verificando extensão…');
  const [connected, setConnected] = useState(false);
  async function check() {
    setStatus('Verificando extensão…');
    const result = await requestWhatsAppBridge('PING');
    const ready = result.ok && supportsReliableWhatsAppFlow(result.version);
    setConnected(ready);
    setStatus(ready ? `Extensão ${result.version} conectada neste navegador` : result.ok ? 'Atualize a extensão para a versão 1.2.0 ou superior' : 'Instale ou ative a extensão e recarregue o sistema');
  }
  useEffect(() => { void check(); }, []);
  return <section className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4 shadow-xs">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex gap-3 items-center"><span className="rounded-xl bg-emerald-50 text-emerald-700 p-3"><MessageSquare size={22}/></span><div>
        <h2 className="font-bold text-slate-900">WhatsApp na mesma aba</h2><p className="text-xs text-slate-500 mt-1">A extensão espera o WhatsApp ficar pronto e prepara a conversa. Você confere a mensagem e envia.</p>
      </div></div>
      <span role="status" className={`text-xs px-3 py-2 rounded-full ${connected ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-900'}`}>{status}</span>
    </div>
    <div className="rounded-xl bg-slate-50 border border-slate-100 p-4 text-sm text-slate-600 space-y-2">
      <p>Instale uma vez no mesmo perfil do Brave em que usa o sistema e o WhatsApp Web:</p>
      <ol className="list-decimal pl-5 space-y-1">
        <li>Baixe e extraia o arquivo da extensão para uma pasta fixa.</li>
        <li>Abra <strong>brave://extensions</strong> e ative o <strong>Modo do desenvolvedor</strong>.</li>
        <li>Clique em <strong>Carregar sem compactação</strong> e escolha a pasta que contém o arquivo manifest.json.</li>
        <li>Recarregue o sistema e mantenha o WhatsApp Web conectado.</li>
      </ol>
      <p className="text-xs">Use o sistema por http://localhost:3000 ou http://127.0.0.1:3000. Se não houver uma aba do WhatsApp, a extensão abre uma e aguarda carregar. A extensão 1.2.0 aguarda os controles do WhatsApp, confere o número, limpa o campo e cola a mensagem nova. Você revisa e confirma o envio no WhatsApp.</p>
    </div>
    <div className="flex flex-wrap gap-2 text-xs font-bold">
      <a href="/extensions/nagano-whatsapp.zip" download className="inline-flex items-center gap-2 bg-indigo-600 text-white rounded-lg px-4 py-2.5 hover:bg-indigo-700"><Download size={16}/>Baixar extensão para Brave</a>
      <button type="button" onClick={check} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-4 py-2.5 text-slate-700 hover:bg-slate-50"><RefreshCw size={16}/>Verificar conexão</button>
    </div>
  </section>;
}

