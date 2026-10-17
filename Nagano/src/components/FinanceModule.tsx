import React, { useState } from 'react';
import {activeProfile} from '../services/teamApi';
import { WorkOrder, PaymentRecord, Receipt, CompanySettings, Customer } from '../types';
import { formatCurrency, formatDate } from '../utils/formatters';
import { numberToWordsPt } from '../utils/numberToWordsPt';
import { DollarSign, Search, Calendar, CheckCircle2, AlertCircle, Receipt as ReceiptIcon, X } from 'lucide-react';

interface FinanceModuleProps {
  customers: Customer[];
  workOrders: WorkOrder[];
  payments: PaymentRecord[];
  receipts: Receipt[];
  company: CompanySettings;
  onRegisterPayment: (workOrderId: string, amount: number, method: string, receipt: Receipt | null) => Promise<void>; 
}

export const FinanceModule: React.FC<FinanceModuleProps> = ({
  customers,
  workOrders,
  payments,
  receipts,
  company,
  onRegisterPayment
}) => {
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<'ALL' | 'UNPAID' | 'PARTIAL'>('ALL');
  const [selectedOSForPayment, setSelectedOSForPayment] = useState<WorkOrder | null>(null);
  const [paymentAmount, setPaymentAmount] = useState<number>(0);
  const [paymentMethod, setPaymentMethod] = useState<string>('PIX');
  const [issueReceipt, setIssueReceipt] = useState<boolean>(true);

  const pendingOrders = workOrders.filter((os) => os.remainingBalance > 0);

  const filteredOrders = pendingOrders.filter((os) => {
    const matchesSearch =
      os.number.toLowerCase().includes(searchTerm.toLowerCase()) ||
      os.customerName.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesSearch;
  });

  const totalReceivable = pendingOrders.reduce((sum, os) => sum + os.remainingBalance, 0);

  const handleConfirmPaymentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOSForPayment||busy) return;setBusy(true);setError('');

    let receipt: Receipt | null = null;
    if (paymentAmount===selectedOSForPayment.remainingBalance) {
      receipt = {
        id: `rec_${Date.now()}`,
        number: `REC-2026-${String(Math.floor(Math.random() * 9000) + 1000)}`,
        workOrderId: selectedOSForPayment.id,
        workOrderNumber: selectedOSForPayment.number,
        customerId: selectedOSForPayment.customerId,
        customerName: selectedOSForPayment.customerName,
        cpfCnpj: customers.find(c=>c.id===selectedOSForPayment.customerId)?.cpfCnpj ?? '',
        amount: selectedOSForPayment.totalAmount,
        amountInWords: numberToWordsPt(selectedOSForPayment.totalAmount),
        paymentMethod: paymentMethod as any,
        paymentDate: new Date().toISOString().split('T')[0],
        referringTo: `Pagamento parcial/total da OS ${selectedOSForPayment.number} (${selectedOSForPayment.serviceName})`,
        issuerName: activeProfile?.name || 'Financeiro',
        createdAt: new Date().toISOString()
      };
    }

    try{await onRegisterPayment(selectedOSForPayment.id, paymentAmount, paymentMethod, receipt);setSelectedOSForPayment(null);}catch(e){setError((e as Error).message);}finally{setBusy(false);}
  };

  return (
    <div className="space-y-6">
      {/* HEADER */}
      <div className="module-heading flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight flex items-center space-x-2">
            <DollarSign className="w-5 h-5 text-emerald-600" />
            <span>Contas a receber</span>
          </h1>
          <p className="text-xs text-slate-500">
            Acompanhe saldos, pagamentos e parcelas das ordens de serviço.
          </p>
        </div>
        <div className="bg-emerald-50 border border-emerald-200 px-4 py-2 rounded-xl text-emerald-950 font-mono font-black text-lg">
          Total a Receber: {formatCurrency(totalReceivable)}
        </div>
      </div>

      {/* SEARCH BAR */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-slate-50 p-3 rounded-lg border border-slate-200">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar por cliente ou OS..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 bg-white border border-slate-300 rounded-md text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>
      </div>

      {/* PENDING PAYMENTS TABLE */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-700">
            <thead className="bg-slate-50 border-b border-slate-200 uppercase text-xxs font-bold text-slate-500">
              <tr>
                <th className="p-3">Nº OS / Data</th>
                <th className="p-3">Cliente</th>
                <th className="p-3">Serviço</th>
                <th className="p-3 text-right">Valor Total</th>
                <th className="p-3 text-right">Valor Pago</th>
                <th className="p-3 text-right">Saldo Devedor</th>
                <th className="p-3 text-center">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredOrders.map((os) => (
                <tr key={os.id} className="hover:bg-slate-50 transition">
                  <td className="p-3 font-mono font-bold text-indigo-900">
                    {os.number}
                    <span className="block text-xxs text-slate-400 font-sans font-normal">{formatDate(os.createdAt)}</span>
                  </td>
                  <td className="p-3 font-medium text-slate-900">{os.customerName}</td>
                  <td className="p-3 text-slate-700">{os.serviceName}</td>
                  <td className="p-3 text-right font-mono font-bold text-slate-900">{formatCurrency(os.totalAmount)}</td>
                  <td className="p-3 text-right font-mono text-emerald-700 font-bold">{formatCurrency(os.amountPaid)}</td>
                  <td className="p-3 text-right font-mono text-rose-600 font-black">{formatCurrency(os.remainingBalance)}</td>
                  <td className="p-3 text-center">
                    <button
                      onClick={() => {
                        setSelectedOSForPayment(os);
                        setPaymentAmount(os.remainingBalance);
                      }}
                      className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded font-bold text-xxs"
                    >
                      Registrar Pagamento
                    </button>
                  </td>
                </tr>
              ))}
              {filteredOrders.length === 0 && (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-slate-400">
                    Nenhum valor pendente a receber encontrado.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <section className="erp-card space-y-4"><h2 className="font-semibold text-slate-900">Histórico de recebimentos</h2><div className="overflow-x-auto"><table className="w-full text-xs text-left"><thead className="text-slate-500"><tr>{['Data','Cliente','Pedido','Forma','Valor','Recebido por'].map(h=><th key={h} className="p-3">{h}</th>)}</tr></thead><tbody>{payments.slice(0,100).map(p=><tr className="border-t border-slate-100" key={p.id}><td className="p-3">{formatDate(p.date)}</td><td className="p-3">{p.customerName}</td><td className="p-3">{workOrders.find(o=>o.id===p.workOrderId)?.number||p.workOrderId}</td><td className="p-3">{p.method}</td><td className="p-3 font-semibold">{formatCurrency(p.amount)}</td><td className="p-3">{p.receivedBy}</td></tr>)}</tbody></table>{!payments.length&&<p className="text-sm text-slate-500 p-3">Nenhum recebimento registrado.</p>}</div></section>
      {/* REGISTER PAYMENT MODAL */}
      {selectedOSForPayment && (
        <div className="nagano-overlay fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 space-y-4 border border-slate-200">
            <div className="nagano-dialog-heading flex items-center justify-between border-b pb-3">
              <h3 className="font-bold text-slate-900 text-sm">Registrar Recebimento de Valor</h3>
              <button onClick={() => setSelectedOSForPayment(null)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleConfirmPaymentSubmit} className="space-y-4 text-xs">{error&&<p role="alert" className="text-rose-700">{error}</p>}
              <div className="p-3 bg-slate-50 rounded-lg border">
                <p className="font-bold text-slate-900">{selectedOSForPayment.number} - {selectedOSForPayment.customerName}</p>
                <p className="font-mono text-rose-600 font-bold mt-1">Saldo Atual: {formatCurrency(selectedOSForPayment.remainingBalance)}</p>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Valor do Pagamento (R$)</label>
                <input
                  type="number"
                  step="0.01"
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(Number(e.target.value))}
                  className="w-full border border-slate-300 rounded p-2 font-mono font-bold text-slate-900 text-sm"
                  max={selectedOSForPayment.remainingBalance}
                  min={0.01}
                  required
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Forma de Pagamento</label>
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                  className="w-full border border-slate-300 rounded p-2 font-bold"
                >
                  <option value="PIX">PIX</option>
                  <option value="DINHEIRO">Dinheiro Espécie</option>
                  <option value="DEBITO">Cartão de Débito</option>
                  <option value="CREDITO">Cartão de Crédito</option>
                  <option value="TRANSFERENCIA">Transferência Bancária</option>
                </select>
              </div>

              <label className="flex items-center space-x-2 cursor-pointer font-bold text-slate-800">
                <input
                  type="checkbox"
                  checked={true}
                  disabled={true}
                  onChange={(e) => setIssueReceipt(e.target.checked)}
                  className="rounded text-indigo-600 focus:ring-indigo-500"
                />
                <span>Recibo final automático somente na quitação</span>
              </label>

              <div className="flex justify-end space-x-3 pt-3 border-t">
                <button
                  type="button"
                  onClick={() => setSelectedOSForPayment(null)}
                  className="px-4 py-2 border border-slate-300 rounded-lg font-semibold text-slate-700"
                >
                  Cancelar
                </button>
                <button
                  type="submit" disabled={busy}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold shadow-sm"
                >
                  Confirmar Recebimento
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};


