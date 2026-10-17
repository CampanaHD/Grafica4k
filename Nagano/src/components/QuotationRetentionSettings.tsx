import React, { useEffect, useState } from 'react';
import { quotationApi } from '../services/quotationApi';
import type { UserRole } from '../types';

export function QuotationRetentionSettings({ currentRole, onChanged }: { currentRole: UserRole; onChanged: () => Promise<void> }) {
  const [enabled, setEnabled] = useState(false), [ready, setReady] = useState(false), [busy, setBusy] = useState(false);
  const [error, setError] = useState(''), [notice, setNotice] = useState('');
  useEffect(() => { let active = true; quotationApi.retention().then(value => { if (active) { setEnabled(value.enabled); setReady(true); } }).catch(e => { if (active) setError(e.message); }); return () => { active = false; }; }, []);
  return <section className="bg-white p-5 rounded-2xl border border-slate-200 space-y-3 max-w-3xl">
    <h2 className="font-bold text-slate-900">Limpeza automática de orçamentos</h2>
    <p className="text-sm text-slate-600">Excluir orçamentos não aprovados após 30 dias da criação. Orçamentos aprovados, encerrados, em revisão, vinculados a terceiros ou a ordens de serviço ficam preservados com seu histórico.</p>
    <label className="flex gap-3 items-start text-sm text-slate-700"><input type="checkbox" checked={enabled} disabled={!ready || busy || currentRole !== 'ADMIN'} onChange={async e => {
      const next = e.target.checked; setBusy(true); setError(''); setNotice('');
      try { const value = await quotationApi.saveRetention(next); setEnabled(value.enabled); await onChanged(); setNotice(next ? 'Exclusão automática ativada. A limpeza é permanente e já considera os orçamentos com 30 dias ou mais.' : 'Exclusão automática desativada.'); }
      catch (err) { setError((err as Error).message); } finally { setBusy(false); }
    }} /><span>Ativar exclusão automática após 30 dias</span></label>
    <p className="text-xs text-slate-500">Ao ativar, os orçamentos elegíveis já antigos são excluídos. A rotina é executada com o servidor ligado e também ao carregar os orçamentos.</p>
    {error && <p className="text-sm text-rose-700" role="alert">{error}</p>}{notice && <p className="text-sm text-indigo-700" role="status">{notice}</p>}
  </section>;
}
