import React, { useState } from 'react';
import { CompanySettings, WorkOrder, ProductionStatus } from '../types';
import { formatDate } from '../utils/formatters';
import { nextProductionStep, productionColumns,productionStatusLabels } from '../utils/productionFlow';
import { ProductionSheetPreview } from './PrintableWorkOrder';
import { LayeredDialog } from './LayeredDialog';
import { DialogHeader } from './DialogHeader';
import { Kanban, ArrowRight, Pause, Printer, Search } from 'lucide-react';

interface ProductionKanbanProps {
  workOrders: WorkOrder[];
  company?: CompanySettings;
  onUpdateStatus: (id: string, status: ProductionStatus, notes?: string) => Promise<void>|void;
}
export const ProductionKanban: React.FC<ProductionKanbanProps> = ({ workOrders, company, onUpdateStatus }) => {
  const [selected, setSelected] = useState<WorkOrder | null>(null), [target, setTarget] = useState<ProductionStatus>('PRODUCAO_ARTES');
  const [note, setNote] = useState(''), [search, setSearch] = useState(''), [dragged, setDragged] = useState<string | null>(null);
  const [showPaused,setShowPaused]=useState(false);
  const [printOrder, setPrintOrder] = useState<WorkOrder | null>(null);
  const [error,setError]=useState(''),[saving,setSaving]=useState(false);
  const update=async(id:string,status:ProductionStatus,notes?:string)=>{if(saving)return false;setSaving(true);setError('');try{await onUpdateStatus(id,status,notes);return true;}catch(e){setError((e as Error).message);return false;}finally{setSaving(false);}};
  const matches = (os: WorkOrder) => [os.number, os.customerName, os.serviceName, ...(os.items ?? []).map(item => item.serviceName)].join(' ').toLocaleLowerCase('pt-BR').includes(search.toLocaleLowerCase('pt-BR'));
  const active = workOrders.filter(matches);
  const paused = active.filter(os => ['PAUSADO', 'AGUARDANDO_MATERIAL','AGUARDANDO_INFORMACAO_CLIENTE'].includes(os.productionStatus));
  const openMove = (os: WorkOrder) => { setShowPaused(false); setSelected(os); setTarget(os.productionStatus); setNote(''); };
  const card = (os: WorkOrder) => {
    const next = nextProductionStep(os.productionStatus);
    const hold=['PAUSADO','AGUARDANDO_MATERIAL','AGUARDANDO_INFORMACAO_CLIENTE'].includes(os.productionStatus);
    const event=[...(os.statusHistory||[])].reverse().find(entry=>entry.newStatus===os.productionStatus);
    const reason=event?.observation||os.productionNotes||'Motivo não registrado. Edite a OS para acrescentar a informação.';
    const today = new Date();
    const localDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
    const overdue = os.deadlineDate && os.deadlineDate.slice(0, 10) < localDate;
    return <article key={os.id} draggable={!os.quotationRevisionPending} onDragStart={e => { e.dataTransfer.setData('text/plain', os.id); setDragged(os.id); }} onDragEnd={() => setDragged(null)} className="production-card bg-white border border-slate-200 p-4 rounded-xl space-y-3 shadow-xs">
      <div className="flex justify-between gap-2 items-start"><strong className="text-xs text-indigo-700">{os.number}</strong>{overdue && <span className="text-xxs text-rose-700 bg-rose-50 rounded px-2 py-1">Prazo vencido</span>}</div>
      {os.quotationRevisionPending && <p className="text-xs font-bold text-amber-800">Orçamento em revisão — aguardando nova aprovação</p>}
      <div><h3 className="font-semibold text-sm text-slate-900">{os.customerName}</h3><div className="text-xs text-slate-600 mt-2 space-y-1">{os.items?.length ? os.items.map((item, index) => <p key={item.id || index}>{item.quantity.toLocaleString('pt-BR')} {item.futuraImportId && item.serviceGroup === 'VISUAL_COMMUNICATION' ? 'lote(s)' : 'un.'} · {item.serviceName}</p>) : <p>{os.quantity} un. · {os.serviceName}</p>}</div></div>
      {os.productionNotes&&(!hold||os.productionNotes.trim()!==reason.trim())&&<p className="text-xs text-slate-600 bg-slate-50 rounded-lg p-2 whitespace-pre-wrap">{os.productionNotes}</p>}
      {hold&&<section className="text-xs border border-slate-200 rounded-xl p-3 space-y-2"><span className={`inline-block rounded-md px-2 py-1 ${os.productionStatus==='AGUARDANDO_INFORMACAO_CLIENTE'?'bg-sky-50 text-sky-800':'bg-slate-100 text-slate-700'}`}>{productionStatusLabels[os.productionStatus]}</span><p className="text-slate-700 whitespace-pre-wrap"><strong>Motivo:</strong> {reason}</p><p className="text-slate-500">{event?.changedBy||os.updatedBy?.name||'Responsável não registrado'} · {event?.changedAt?new Date(event.changedAt).toLocaleString('pt-BR'):formatDate(os.createdAt)}</p></section>}
      <p className="text-xs text-slate-500">Prazo final: <strong>{formatDate(os.deadlineDate)}</strong></p>
      {os.updatedBy&&!hold&&<p className="text-xxs text-slate-500">Última alteração: {os.updatedBy.name} · {new Date(os.updatedBy.at).toLocaleString('pt-BR')}</p>}
      <div className="flex gap-2 border-t border-slate-100 pt-3"><button disabled={os.quotationRevisionPending} className="nagano-button secondary flex-1 disabled:opacity-40" onClick={() => openMove(os)}>Mudar etapa</button><button className="nagano-button secondary" aria-label={`Ficha A5 ${os.number}`} onClick={() => setPrintOrder(os)}><Printer size={15} /></button></div>
      {next && <button disabled={os.quotationRevisionPending||saving} className="nagano-button primary w-full disabled:opacity-40" onClick={() => void update(os.id, next.status, next.status === 'AGUARDANDO_RETIRADA' ? 'Acabamento concluído. Pedido pronto para retirada.' : undefined)}>{next.label}<ArrowRight size={14} /></button>}
    </article>;
  };
  return <div className="space-y-5">
    <div className="module-heading flex flex-col sm:flex-row justify-between gap-4"><div><h1 className="text-xl font-bold text-slate-900 flex items-center gap-2"><Kanban size={22} />Produção</h1><p className="text-sm text-slate-500 mt-2">Arte → aprovação → impressão → acabamento. Ao finalizar, o pedido segue para Retiradas.</p></div><label className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl p-3 self-start"><Search size={16} className="text-slate-400" /><input aria-label="Buscar no quadro de produção" value={search} onChange={e => setSearch(e.target.value)} placeholder="OS, cliente ou serviço" className="text-sm outline-none w-48" /></label></div>
    <p className="text-xs text-slate-500">Arraste os cartões entre as etapas ou use os botões de avanço. Use Ficha A5 para imprimir os detalhes da produção.</p>
    {error&&<p role="alert" className="text-sm text-rose-700 bg-rose-50 p-3 rounded-xl">{error}</p>}
    <button type="button" className="nagano-button secondary" onClick={()=>setShowPaused(true)}><Pause size={16}/>Serviços pausados <span className="bg-slate-100 text-slate-600 rounded-md px-2 py-0.5">{paused.length}</span></button>
    {showPaused&&<LayeredDialog title="Serviços pausados e pendências" subtitle="Pedidos que precisam de uma ação para continuar a produção." icon={Pause} onClose={()=>setShowPaused(false)}><div className="p-5 sm:p-6 grid md:grid-cols-2 gap-4">{paused.map(card)}{!paused.length&&<p className="text-sm text-slate-500 p-6">Nenhum serviço pausado ou aguardando informação com estes filtros.</p>}</div></LayeredDialog>}
    <div className="overflow-x-auto pb-4"><div className="production-board">
      {productionColumns.map((col, index) => {
        const orders = active.filter(os => col.statuses.includes(os.productionStatus));
        return <section key={col.id} aria-label={col.title} className={`production-column ${dragged ? 'can-drop' : ''}`} onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); const os = workOrders.find(order => order.id === dragged && order.id === e.dataTransfer.getData('text/plain')); setDragged(null); if (os && !os.quotationRevisionPending && !col.statuses.includes(os.productionStatus)) void update(os.id, col.id, `Movido no quadro para ${col.title}.`); }}>
          <header className="flex items-center justify-between mb-4"><h2 className="text-sm font-bold text-slate-800"><span className="text-indigo-500 mr-2">0{index + 1}</span>{col.title}</h2><span className="text-xs font-bold text-indigo-700 bg-white border border-indigo-100 rounded-lg px-2 py-1">{orders.length}</span></header>
          <div className="space-y-3">{orders.map(card)}{orders.length === 0 && <p className="text-xs text-slate-400 border border-dashed border-slate-300 rounded-xl p-6 text-center">Nenhum pedido nesta etapa.</p>}</div>
        </section>;
      })}
    </div></div>
    {selected && <div className="nagano-overlay fixed inset-0 flex items-center justify-center p-4 z-50"><div role="dialog" aria-modal="true" aria-label="Mudar etapa de produção" className="bg-white rounded-2xl max-w-md w-full overflow-hidden">
      <DialogHeader title="Mudar etapa de produção" subtitle={`${selected.number} · ${selected.customerName}`} icon={Kanban} onClose={() => setSelected(null)} />
      <form className="p-5 space-y-4" onSubmit={async e => { e.preventDefault(); if(await update(selected.id,target,note))setSelected(null); }}>
        <label className="block text-sm">Etapa<select className="w-full mt-1 p-3 border rounded-lg" value={target} onChange={e => setTarget(e.target.value as ProductionStatus)}>{productionColumns.map(col => <option key={col.id} value={col.id}>{col.title}</option>)}<option value="PAUSADO">Pausado</option><option value="AGUARDANDO_INFORMACAO_CLIENTE">Aguardando Informação do Cliente</option><option value="AGUARDANDO_MATERIAL">Aguardando matéria-prima</option><option value="CANCELADO">Cancelado</option></select></label>
        <label className="block text-sm">Observação<textarea required={['PAUSADO','AGUARDANDO_MATERIAL','AGUARDANDO_INFORMACAO_CLIENTE'].includes(target)} value={note} onChange={e => setNote(e.target.value)} className="w-full mt-1 p-3 border rounded-lg" placeholder="Registre o motivo da alteração, se necessário." /></label>
        <div className="flex justify-end gap-2"><button type="button" className="nagano-button secondary" onClick={() => setSelected(null)}>Cancelar</button><button disabled={saving} className="nagano-button primary">{saving?'Salvando…':'Confirmar etapa'}</button></div>
      </form>
    </div></div>}
    {printOrder && <ProductionSheetPreview workOrder={printOrder} company={company ?? {} as CompanySettings} onClose={() => setPrintOrder(null)} />}
  </div>;
};
