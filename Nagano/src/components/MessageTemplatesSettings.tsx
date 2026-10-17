import React, { useState } from 'react';
import { MessageSquare, Plus, Save, Trash2 } from 'lucide-react';
import type { CompanySettings, Customer, WorkOrder } from '../types';
import { defaultMessageTemplates, messagePurposes, messageVariables, prepareMessage, type MessagePurpose } from '../utils/messageTemplates';
import { getMessageTemplates, saveMessageTemplates } from '../services/messageTemplates';
import { WhatsAppWebConnection } from './WhatsAppWebConnection';
import { WhatsAppMessagePreview } from './WhatsAppMessagePreview';

export function MessageTemplatesSettings({ company }: { company: CompanySettings }) {
  const [settings, setSettings] = useState(getMessageTemplates);
  const [selectedId, setSelectedId] = useState(settings.templates[0].id);
  const [notice, setNotice] = useState('');
  const selected = settings.templates.find(t => t.id === selectedId)!;
  const update = (values: Partial<typeof selected>) => {
    setNotice(''); setSettings(s => ({ ...s, templates: s.templates.map(t => t.id === selectedId ? { ...t, ...values } : t) }));
  };
  const preview = prepareMessage(selected.purpose, settings, {
    company, customer: { name: 'Cliente de exemplo' } as Customer, daysWithoutService: 90, pendingBalance: 150,
    order: { number: 'OS-EXEMPLO', serviceName: 'Banner com acabamento', totalAmount: 300, amountPaid: 150, remainingBalance: 150 } as WorkOrder,
    quotation: { id: 'exemplo', number: 'ORC-EXEMPLO', customerName: 'Cliente de exemplo', serviceName: 'Banner', quantity: 1, totalAmount: 300, maxDeadlineDays: 3 } as any,
  }, selectedId);
  return <div className="space-y-5">
    <WhatsAppWebConnection/>
    <section className="rounded-2xl bg-white border border-slate-200 overflow-hidden shadow-xs">
      <div className="p-5 border-b border-slate-100 flex flex-wrap gap-3 items-center justify-between">
        <div><h2 className="font-bold text-slate-900 flex items-center gap-2"><MessageSquare size={19} className="text-indigo-600"/>Mensagens prontas</h2>
          <p className="text-xs text-slate-500 mt-1">Edite os textos ou crie novas opções. Os campos entre chaves são preenchidos com os dados do cliente e do pedido.</p></div>
        <button type="button" className="px-4 py-2.5 rounded-lg bg-indigo-50 text-indigo-700 font-bold text-xs inline-flex gap-2 items-center" onClick={() => {
          const id = crypto.randomUUID(); const template = defaultMessageTemplates().templates.find(t => t.purpose === selected.purpose)!;
          setSettings(s => ({ ...s, templates: [...s.templates, { ...template, id, name: 'Nova mensagem' }] })); setSelectedId(id); setNotice('');
        }}><Plus size={15}/>Nova mensagem</button>
      </div>
      <div className="grid lg:grid-cols-[240px_1fr]">
        <div className="bg-slate-50/70 border-b lg:border-b-0 lg:border-r border-slate-100 p-3 space-y-1">
          {settings.templates.map(t => <button type="button" key={t.id} onClick={() => { setSelectedId(t.id); setNotice(''); }} className={`text-left w-full p-3 rounded-xl border ${t.id === selectedId ? 'bg-white border-indigo-200 shadow-xs' : 'border-transparent hover:bg-white'}`}>
            <span className="block text-sm font-semibold text-slate-900">{t.name}</span>
            <span className="block text-xs text-slate-500 mt-1">{messagePurposes[t.purpose]}{settings.bindings[t.purpose] === t.id ? ' · Padrão' : ''}</span>
          </button>)}
        </div>
        <div className="p-5 space-y-4">
          <div className="grid md:grid-cols-2 gap-3">
            <label className="text-xs font-bold text-slate-700">Nome da mensagem<input aria-label="Nome da mensagem" className="block mt-1 w-full rounded-lg border border-slate-200 p-2.5 font-normal" value={selected.name} onChange={e => update({ name: e.target.value })}/></label>
            <label className="text-xs font-bold text-slate-700">Usar para<select aria-label="Usar para" className="block mt-1 w-full rounded-lg border border-slate-200 p-2.5 font-normal bg-white" value={selected.purpose} onChange={e => {
              if (settings.bindings[selected.purpose] === selected.id) { setNotice('Antes de mudar a finalidade, escolha outra mensagem padrão para esta finalidade.'); return; }
              const purpose = e.target.value as MessagePurpose;
              update({ purpose, body: defaultMessageTemplates().templates.find(t => t.purpose === purpose)!.body });
            }}>{Object.entries(messagePurposes).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
          </div>
          <label className="block text-xs font-bold text-slate-700">Texto da mensagem<textarea aria-label="Texto da mensagem" rows={7} className="block mt-1 w-full rounded-xl border border-slate-200 p-3 text-sm font-normal leading-relaxed" value={selected.body} onChange={e => update({ body: e.target.value })}/></label>
          <div className="flex flex-wrap gap-1.5">{Object.entries(messageVariables).map(([key, label]) => <button type="button" key={key} title={label} onClick={() => update({ body: selected.body + `{${key}}` })} className="rounded-md bg-slate-100 text-slate-600 text-xs px-2 py-1 hover:bg-indigo-50 hover:text-indigo-700">{`{${key}}`}</button>)}</div>
          <p className="text-xs text-slate-500">Na retirada, mantenha {'{aviso_pagamento}'}: a ressalva aparece somente se houver saldo. No orçamento, mantenha {'{detalhes_orcamento}'} para incluir todos os serviços, valores e formas de pagamento.</p>
          <div className="flex flex-wrap items-center gap-3 text-xs">
            <button type="button" onClick={() => setSettings(s => ({ ...s, bindings: { ...s.bindings, [selected.purpose]: selected.id } }))} className="font-bold text-indigo-700 underline">{settings.bindings[selected.purpose] === selected.id ? 'Mensagem padrão desta finalidade' : 'Definir como padrão desta finalidade'}</button>
            <button type="button" className="inline-flex gap-1 items-center text-rose-700 ml-auto" onClick={() => {
              const replacement = settings.templates.find(t => t.purpose === selected.purpose && t.id !== selectedId);
              if (!replacement) { setNotice('Mantenha pelo menos uma mensagem para cada finalidade. Você pode editar o texto.'); return; }
              setSettings(s => ({ templates: s.templates.filter(t => t.id !== selectedId), bindings: { ...s.bindings, [selected.purpose]: s.bindings[selected.purpose] === selectedId ? replacement.id : s.bindings[selected.purpose] } })); setSelectedId(replacement.id); setNotice('');
            }}><Trash2 size={14}/>Excluir mensagem</button>
          </div>
          <p className="text-xs text-slate-500">Use *texto* para destacar em negrito e deixe uma linha em branco para separar os blocos da mensagem.</p>
          <div className="rounded-xl border border-emerald-100 bg-emerald-50/50 p-4"><h3 className="text-xs font-bold text-emerald-900 mb-2">Prévia com dados de exemplo</h3><WhatsAppMessagePreview text={preview}/></div>
          {notice && <p role="status" className="rounded-lg bg-slate-50 border border-slate-200 p-3 text-sm text-slate-700">{notice}</p>}
          <div className="flex items-center justify-end gap-3 border-t border-slate-100 pt-4"><span className="text-xs text-slate-500">Salvo neste perfil do navegador.</span><button type="button" onClick={() => { try { saveMessageTemplates(settings); setNotice('Mensagens salvas. Os próximos avisos usarão estes textos.'); } catch (error) { setNotice((error as Error).message); } }} className="rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 font-bold text-xs inline-flex gap-2 items-center"><Save size={16}/>Salvar mensagens</button></div>
        </div>
      </div>
    </section>
  </div>;
}
