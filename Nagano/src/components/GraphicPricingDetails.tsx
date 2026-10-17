import React from 'react';
import { GraphicPricingSnapshot, graphicMethodLabels } from '../types/graphicProduct';
import { formatCurrency } from '../utils/formatters';
export function GraphicPricingDetails({ snapshot: s }: { snapshot: GraphicPricingSnapshot }) {
  const unit = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 4, maximumFractionDigits: 6 });
  return <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4 space-y-2 text-sm">
    <p><strong>Método:</strong> {graphicMethodLabels[s.pricingMethod]}</p>
    <p><strong>Especificação:</strong> {s.specification || '—'}</p>
    <p>Quantidade: {s.requestedQuantity.toLocaleString('pt-BR')} un.</p>
    {s.baseQuantity !== undefined && <p>Lote base: {s.baseQuantity} un. por {formatCurrency(s.baseBatchPrice!)}</p>}
    {s.baseUnitPrice !== undefined && <p>Preço unitário base: {unit(s.baseUnitPrice)}</p>}
    {s.selectedPriceTableEntry && <p>Lote selecionado: {s.selectedPriceTableEntry.quantity} un. por {formatCurrency(s.selectedPriceTableEntry.batchPrice)}</p>}
    {s.discountTier && <p>Faixa aplicada: a partir de {s.discountTier.minimumQuantity} un.</p>}
    <p>Valor bruto: {formatCurrency(s.grossTotal)}</p>
    <p>Desconto: {s.discountPercentage}% — {formatCurrency(s.discountValue)}</p>
    <p>Preço unitário final: {unit(s.finalUnitPrice)}</p>
    <p className="text-lg font-bold">Total: {formatCurrency(s.finalTotal)}</p>
  </div>;
}
