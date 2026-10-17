import {OrderCostDialog} from './OrderCostDialog';
import {canViewCosts} from '../utils/profileAccess';
import React, { useState } from 'react';
import { WorkOrder, CompanySettings, ProductionStatus } from '../types';
import { ProductionSheetPreview } from './PrintableWorkOrder';
import { formatCurrency, formatDate } from '../utils/formatters';
import { FileText, Search, Printer, Clock, CheckCircle2, AlertCircle, Eye, X } from 'lucide-react';
import { productionStatusLabels } from '../utils/productionFlow';
import { DialogHeader } from './DialogHeader';
import {useAccess} from './AccessBoundary';
import {canAccess} from '../utils/profileAccess';

interface WorkOrderModuleProps {
  workOrders: WorkOrder[];
  company: CompanySettings;
  onUpdateStatus: (workOrderId: string, newStatus: ProductionStatus, notes?: string, productionNotes?:string,expectedRevision?:number) => Promise<void>|void;
}

export const WorkOrderModule: React.FC<WorkOrderModuleProps> = ({
  workOrders,
  company,
  onUpdateStatus
}) => {
  const {profile}=useAccess(),financial=canAccess(profile,'finance');
  const [costOrder,setCostOrder]=useState<string|null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [selectedPrintOS, setSelectedPrintOS] = useState<WorkOrder | null>(null);
  const [editing,setEditing]=useState<WorkOrder|null>(null);

  const filteredOrders = workOrders.filter((os) => {
    const matchesSearch =
      os.number.toLowerCase().includes(searchTerm.toLowerCase()) ||
      os.customerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      os.serviceName.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'ALL' || os.productionStatus === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="space-y-6">
      {costOrder&&<OrderCostDialog orderId={costOrder} onClose={()=>setCostOrder(null)}/>}
      {/* HEADER */}
      <div className="module-heading flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">Ordens de Serviço (OS)</h1>
          <p className="text-xs text-slate-500">
            Acompanhamento técnico, impressão de fichas de produção e controle de prazos
          </p>
        </div>
      </div>

      {/* SEARCH & FILTERS */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-slate-50 p-3 rounded-lg border border-slate-200">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar por Nº da OS, cliente ou serviço..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 bg-white border border-slate-300 rounded-md text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>

        <div className="flex items-center space-x-2 w-full sm:w-auto">
          <span className="text-xs text-slate-500 font-medium">Status:</span>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-white border border-slate-300 rounded-md text-xs text-slate-800 px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
          >
            <option value="ALL">Todos os Status</option>
            <option value="PAUSADO">Pausado / Em revisão</option>
            <option value="PRODUCAO_ARTES">Produção de Artes</option>
            <option value="AGUARDANDO_INFORMACAO_CLIENTE">Aguardando Informação do Cliente</option><option value="AGUARDANDO_MATERIAL">Aguardando matéria-prima</option>
            <option value="CANCELADO">Cancelado</option>
            <option value="ARTE_APROVADA">Arte Aprovada</option>
            <option value="PRODUCAO">Em Produção / Impressão</option>
            <option value="ACABAMENTO">Acabamento</option>
            <option value="AGUARDANDO_RETIRADA">Aguardando Retirada</option>
            <option value="ENTREGUE">Entregue / Concluído</option>
          </select>
        </div>
      </div>

      {/* OS TABLE */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-700">
            <thead className="bg-slate-50 border-b border-slate-200 uppercase text-xxs font-bold text-slate-500">
              <tr>
                <th className="p-3">Nº da OS</th>
                <th className="p-3">Cliente / Contato</th>
                <th className="p-3">Especificações</th>
                <th className="p-3 text-center">Prazo Entrega</th>
                <th className="p-3 text-center">Status Produção</th>
                {financial&&<th className="p-3 text-right">Valor Total / Saldo</th>}
                <th className="p-3 text-center">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredOrders.map((os) => (
                <tr key={os.id} className="hover:bg-slate-50 transition">
                  <td className="p-3 font-mono font-bold text-indigo-900">
                    {os.number}
                    <span className="block text-xxs text-slate-400 font-sans font-normal">Ref: {os.quotationNumber}</span>
                  </td>
                  <td className="p-3">
                    <span className="font-bold text-slate-900 block">{os.customerName}</span>
                    <span className="text-xxs text-slate-500">{os.customerPhone}</span>
                  </td>
                  <td className="p-3">
                    <span className="font-bold text-slate-800 block">{os.serviceName}</span>
                    <span className="text-xxs text-slate-500">{os.materialName} ({os.dimensionsText} - {os.quantity} un)</span>
                  </td>
                  <td className="p-3 text-center font-mono font-bold text-slate-800">
                    {formatDate(os.deadlineDate)}
                  </td>
                  <td className="p-3 text-center">
                    <span className={`inline-block px-2.5 py-1 rounded-lg text-xxs font-bold ${os.productionStatus==='AGUARDANDO_INFORMACAO_CLIENTE'?'bg-sky-50 text-sky-800':'bg-slate-100 text-slate-700'}`}>
                      {productionStatusLabels[os.productionStatus]||'Produção de arte'}
                    </span>
                    {os.quotationRevisionPending && <p className="text-xs text-amber-800 mt-1">Orçamento em revisão</p>}
                  </td>
                  {financial&&<td className="p-3 text-right font-mono">
                    <span className="font-bold text-slate-900 block">{formatCurrency(os.totalAmount)}</span>
                    {os.remainingBalance > 0 ? (
                      <span className="text-xxs text-rose-600 font-bold">Saldo: {formatCurrency(os.remainingBalance)}</span>
                    ) : (
                      <span className="text-xxs text-emerald-600 font-bold">Quitado</span>
                    )}
                  </td>}
                  <td className="p-3 text-center space-x-1">
                    {canViewCosts(profile)&&<button className="nagano-button secondary" onClick={()=>setCostOrder(os.id)}>Custos internos</button>}
                    <button className="nagano-button secondary" aria-label={`Editar ${os.number}`} onClick={()=>setEditing(os)}>Editar OS</button>
                    <button
                      onClick={() => setSelectedPrintOS(os)}
                      className="p-1.5 text-indigo-600 hover:bg-indigo-50 rounded"
                      title="Ficha de produção A5"
                    >
                      <Printer className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
              {filteredOrders.length === 0 && (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-slate-400">
                    Nenhuma ordem de serviço cadastrada.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {selectedPrintOS && <ProductionSheetPreview workOrder={selectedPrintOS} company={company} onClose={() => setSelectedPrintOS(null)} />}
      {editing&&<WorkOrderEditor order={editing} onClose={()=>setEditing(null)} onSave={onUpdateStatus}/>}
    </div>
  );
};

function WorkOrderEditor({order,onClose,onSave}:{order:WorkOrder;onClose:()=>void;onSave:WorkOrderModuleProps['onUpdateStatus']}){
  const [status,setStatus]=useState<ProductionStatus>(order.productionStatus==='AGUARDANDO_APROVACAO_ARTE'?'PRODUCAO_ARTES':order.productionStatus),[notes,setNotes]=useState(order.productionNotes||''),[reason,setReason]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  return <div className="nagano-overlay fixed inset-0 bg-slate-900/60 z-50 p-4 grid place-items-center"><div role="dialog" aria-modal="true" aria-label="Editar ordem de serviço" className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-auto"><DialogHeader title="Editar ordem de serviço" subtitle={`${order.number} · ${order.customerName}`} icon={FileText} onClose={onClose}/><form className="p-5 space-y-4" onSubmit={async e=>{e.preventDefault();setBusy(true);setError('');try{await onSave(order.id,status,reason,notes,order.revision);onClose();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}}>
    <label className="block text-sm font-semibold">Situação<select disabled={order.quotationRevisionPending} aria-label="Situação da OS" value={status} onChange={e=>setStatus(e.target.value as ProductionStatus)} className="w-full p-3 border rounded-xl mt-1">{Object.entries(productionStatusLabels).map(([value,label])=><option value={value} key={value}>{label}</option>)}</select></label>{order.quotationRevisionPending&&<p className="text-xs text-amber-800">O orçamento está em revisão. As observações podem ser editadas; a produção aguarda a nova aprovação.</p>}
    <label className="block text-sm font-semibold">Observações para produção<textarea aria-label="Observações para produção" rows={4} value={notes} onChange={e=>setNotes(e.target.value)} className="w-full p-3 border rounded-xl mt-1"/></label><label className="block text-sm font-semibold">Motivo / registro da alteração<input aria-label="Motivo da alteração da OS" value={reason} onChange={e=>setReason(e.target.value)} className="w-full p-3 border rounded-xl mt-1"/></label>{error&&<p role="alert" className="text-sm text-rose-700">{error}</p>}<div className="flex justify-end gap-2"><button type="button" className="nagano-button secondary" onClick={onClose}>Cancelar</button><button disabled={busy} className="nagano-button primary">{busy?'Salvando…':'Salvar alterações'}</button></div>
    <section className="border-t pt-4"><h3 className="font-bold text-sm mb-3">Histórico da OS</h3><div className="space-y-3">{[...(order.statusHistory||[])].reverse().map(entry=><article className="border-l-2 border-indigo-100 pl-3" key={entry.id}><p className="text-sm font-semibold">{productionStatusLabels[entry.newStatus]||entry.newStatus}</p><p className="text-xs text-slate-500">{entry.changedBy} · {new Date(entry.changedAt).toLocaleString('pt-BR')}</p>{entry.observation&&<p className="text-sm mt-1 whitespace-pre-wrap text-slate-600">{entry.observation}</p>}</article>)}</div></section>
  </form></div></div>;
}
