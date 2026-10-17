import React, { useState } from 'react';
import { Receipt, CompanySettings } from '../types';
import { ReceiptPreview } from './PrintableReceipt';
import { formatCurrency, formatDate } from '../utils/formatters';
import { Receipt as ReceiptIcon, Printer, Search, Eye, X } from 'lucide-react';

interface ReceiptsModuleProps {
  receipts: Receipt[];
  company: CompanySettings;
}

export const ReceiptsModule: React.FC<ReceiptsModuleProps> = ({ receipts, company }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedReceipt, setSelectedReceipt] = useState<Receipt | null>(null);

  const filteredReceipts = receipts.filter((r) => {
    return (
      r.number.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.customerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.referringTo.toLowerCase().includes(searchTerm.toLowerCase())
    );
  });

  return (
    <div className="space-y-6">
      {/* HEADER */}
      <div className="module-heading flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight flex items-center space-x-2">
            <ReceiptIcon className="w-5 h-5 text-indigo-600" />
            <span>Recibos emitidos</span>
          </h1>
          <p className="text-xs text-slate-500">
            Histórico auditável de comprovantes de pagamento e quitação comercial
          </p>
        </div>
      </div>

      {/* SEARCH */}
      <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar por Nº do recibo, cliente ou motivo..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 bg-white border border-slate-300 rounded-md text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>
      </div>

      {/* TABLE */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-700">
            <thead className="bg-slate-50 border-b border-slate-200 uppercase text-xxs font-bold text-slate-500">
              <tr>
                <th className="p-3">Nº Recibo</th>
                <th className="p-3">Data Emissão</th>
                <th className="p-3">Cliente / Pagador</th>
                <th className="p-3">Referente a</th>
                <th className="p-3 text-right">Valor Pago</th>
                <th className="p-3 text-center">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredReceipts.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50 transition">
                  <td className="p-3 font-mono font-bold text-indigo-900">{r.number}<small className="block font-sans font-normal text-slate-500">{r.kind==='FINAL_SETTLEMENT'?'Quitação integral':'Histórico anterior'}</small></td>
                  <td className="p-3 text-slate-600">{formatDate(r.paymentDate)}</td>
                  <td className="p-3 font-medium text-slate-900">{r.customerName}</td>
                  <td className="p-3 text-slate-600 max-w-xs truncate">{r.referringTo}</td>
                  <td className="p-3 text-right font-mono font-bold text-emerald-800">{formatCurrency(r.amount)}</td>
                  <td className="p-3 text-center">
                    <button
                      onClick={() => setSelectedReceipt(r)}
                      className="p-1.5 text-indigo-600 hover:bg-indigo-50 rounded"
                      title="Visualizar / imprimir recibo"
                    >
                      <Printer className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
              {filteredReceipts.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-slate-400">
                    Nenhum recibo emitido encontrado.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {selectedReceipt && <ReceiptPreview receipt={selectedReceipt} company={company} onClose={() => setSelectedReceipt(null)}/>} 
    </div>
  );
};

