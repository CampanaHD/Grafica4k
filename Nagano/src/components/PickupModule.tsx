import React, { useState } from 'react';
import {activeProfile} from '../services/teamApi';
import { WorkOrder, CompanySettings, Receipt, Customer } from '../types';
import { formatCurrency, formatDate } from '../utils/formatters';
import { numberToWordsPt } from '../utils/numberToWordsPt';
import { PackageCheck, Send, CheckCircle2, DollarSign, Clock, Phone, FileCheck, X } from 'lucide-react';

interface PickupModuleProps {
  customers: Customer[];
  workOrders: WorkOrder[];
  company: CompanySettings;
  onDeliverOrder: (workOrder: WorkOrder, receipt: Receipt | null) => Promise<void>; 
  onSendWhatsAppReminder: (workOrder: WorkOrder) => void;
}

export const PickupModule: React.FC<PickupModuleProps> = ({
  customers,
  workOrders,
  company,
  onDeliverOrder,
  onSendWhatsAppReminder
}) => {
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  const [selectedDeliverOrder, setSelectedDeliverOrder] = useState<WorkOrder | null>(null);
  const [finalPaymentMethod, setFinalPaymentMethod] = useState('PIX');
  const [issueReceipt, setIssueReceipt] = useState(true);

  const pickupOrders = workOrders.filter((os) => os.productionStatus === 'AGUARDANDO_RETIRADA');

  const handleConfirmDeliverySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDeliverOrder||busy) return;setBusy(true);setError('');

    let receipt: Receipt | null = null;
    if (selectedDeliverOrder.remainingBalance > 0) {
      receipt = {
        id: `rec_${Date.now()}`,
        number: `REC-2026-${String(Math.floor(Math.random() * 9000) + 1000)}`,
        workOrderId: selectedDeliverOrder.id,
        workOrderNumber: selectedDeliverOrder.number,
        customerId: selectedDeliverOrder.customerId,
        customerName: selectedDeliverOrder.customerName,
        cpfCnpj: customers.find(c=>c.id===selectedDeliverOrder.customerId)?.cpfCnpj ?? '',
        amount: selectedDeliverOrder.totalAmount,
        amountInWords: numberToWordsPt(selectedDeliverOrder.totalAmount),
        paymentMethod: finalPaymentMethod as any,
        paymentDate: new Date().toISOString().split('T')[0],
        referringTo: `Quitação final da Ordem de Serviço ${selectedDeliverOrder.number} (${selectedDeliverOrder.serviceName})`,
        issuerName: activeProfile?.name || 'Atendimento',
        createdAt: new Date().toISOString()
      };
    }

    try{await onDeliverOrder(selectedDeliverOrder, receipt);setSelectedDeliverOrder(null);}catch(e){setError((e as Error).message);}finally{setBusy(false);}
  };

  return (
    <div className="space-y-6">
      {/* HEADER */}
      <div className="module-heading flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight flex items-center space-x-2">
            <PackageCheck className="w-5 h-5 text-teal-600" />
            <span>Retiradas</span>
          </h1>
          <p className="text-xs text-slate-500">
            Trabalhos prontos aguardando coleta pelo cliente, quitação de saldos e emissão de recibo final
          </p>
        </div>
      </div>

      {/* PICKUP ORDERS GRID */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {pickupOrders.map((os) => (
          <div
            key={os.id}
            className="bg-white border-2 border-teal-200 p-4 rounded-xl shadow-xs hover:shadow-md transition space-y-3"
          >
            <div className="flex items-center justify-between">
              <span className="font-mono font-black text-sm text-indigo-900">{os.number}</span>
              <span className="px-2 py-0.5 rounded text-xxs font-bold bg-teal-100 text-teal-900">
                Pronto para Retirada
              </span>
            </div>

            <div>
              <h3 className="font-bold text-slate-900 text-sm">{os.customerName}</h3>
              <p className="text-xs text-slate-600 flex items-center space-x-1 mt-0.5">
                <Phone className="w-3.5 h-3.5 text-slate-400" />
                <span>{os.customerPhone}</span>
              </p>
            </div>

            <div className="p-3 bg-slate-50 rounded-lg border text-xs space-y-1">
              <span className="font-bold text-slate-800 block">{os.serviceName}</span>
              <p className="text-slate-600 text-xxs">{os.description} ({os.dimensionsText})</p>
            </div>

            <div className="p-3 bg-teal-50/60 rounded-lg border border-teal-200 flex items-center justify-between text-xs">
              <div>
                <span className="text-xxs text-teal-800 uppercase block font-semibold">Saldo Pendente</span>
                <span className="font-mono font-bold text-sm text-slate-900">
                  {os.remainingBalance > 0 ? (
                    <span className="text-rose-600">{formatCurrency(os.remainingBalance)}</span>
                  ) : (
                    <span className="text-emerald-700">100% Quitado</span>
                  )}
                </span>
              </div>
            </div>

            <div className="pt-2 flex items-center space-x-2">
              <button
                onClick={() => onSendWhatsAppReminder(os)}
                className="flex-1 py-2 px-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold flex items-center justify-center space-x-1 shadow-2xs"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Avisar retirada</span>
              </button>

              <button
                onClick={() => setSelectedDeliverOrder(os)}
                className="flex-1 py-2 px-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold flex items-center justify-center space-x-1 shadow-2xs"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Entregar Pedido</span>
              </button>
            </div>
          </div>
        ))}

        {pickupOrders.length === 0 && (
          <div className="col-span-full p-12 text-center text-slate-400 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
            Nenhum trabalho aguardando retirada no balcão no momento.
          </div>
        )}
      </div>

      {/* FINAL PAYMENT & DELIVERY MODAL */}
      {selectedDeliverOrder && (
        <div className="nagano-overlay fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 space-y-4 border border-slate-200">
            <div className="nagano-dialog-heading flex items-center justify-between border-b pb-3">
              <h3 className="font-bold text-slate-900 text-sm">Registrar Entrega & Quitação Final</h3>
              <button onClick={() => setSelectedDeliverOrder(null)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleConfirmDeliverySubmit} className="space-y-4 text-xs">{error&&<p role="alert" className="text-rose-700">{error}</p>}
              <div className="p-3 bg-slate-50 rounded-lg border">
                <p className="font-bold text-slate-900">{selectedDeliverOrder.number} - {selectedDeliverOrder.customerName}</p>
                <p className="text-slate-600">{selectedDeliverOrder.serviceName}</p>
                <p className="font-mono font-bold text-rose-600 mt-1 text-sm">
                  Saldo a Receber: {formatCurrency(selectedDeliverOrder.remainingBalance)}
                </p>
              </div>

              {selectedDeliverOrder.remainingBalance > 0 && (
                <>
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Forma do Pagamento Final</label>
                    <select
                      value={finalPaymentMethod}
                      onChange={(e) => setFinalPaymentMethod(e.target.value)}
                      className="w-full border border-slate-300 rounded-lg p-2 font-bold"
                    >
                      <option value="PIX">PIX</option>
                      <option value="DINHEIRO">Dinheiro Espécie</option>
                      <option value="DEBITO">Cartão de Débito</option>
                      <option value="CREDITO">Cartão de Crédito</option>
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
                    <span>Gerar Recibo de Pagamento Automático</span>
                  </label>
                </>
              )}

              <div className="flex justify-end space-x-3 pt-3 border-t">
                <button
                  type="button"
                  onClick={() => setSelectedDeliverOrder(null)}
                  className="px-4 py-2 border border-slate-300 rounded-lg font-semibold text-slate-700"
                >
                  Cancelar
                </button>
                <button
                  type="submit" disabled={busy}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold shadow-sm"
                >
                  Confirmar Entrega & Quitar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};


