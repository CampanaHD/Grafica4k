import React, { useEffect, useState } from 'react';
import { SpecificationDetails } from './SpecificationDetails';
import { QuotationItem } from '../types';
import { futuraApi, ImportedFutura } from '../services/futuraApi';
import { useItemPricing } from '../services/useRollPricing';
import { formatCurrency } from '../utils/formatters';
export function FuturaVisualItemEditor({ item, onSave, onClose }: { item?: QuotationItem; onSave: (item: QuotationItem) => void; onClose: () => void }) {
  const [imports, setImports] = useState<ImportedFutura[]>([]), [id, setId] = useState(item?.futuraImportId ?? '');
  const [quantity, setQuantity] = useState(item?.quantity ?? 1), [error, setError] = useState('');
  useEffect(() => { let active = true; futuraApi.list().then(list => { if (active) setImports(list.filter(p => p.serviceGroup === 'VISUAL_COMMUNICATION' && p.active)); }).catch(e => { if (active) setError(e.message); }); return () => { active = false; }; }, []);
  const selected = imports.find(p => p.id === id);
  const pricing = useItemPricing({ finishings:item?.finishings,stockFinishings:item?.stockFinishings,internalCosts:item?.internalCosts,serviceGroup: 'VISUAL_COMMUNICATION', materialId: selected?.targetId, futuraImportId: id, quantity }, !!selected, JSON.stringify(selected));
  return <div className="nagano-overlay fixed inset-0 bg-slate-900/60 z-50 p-4 flex items-center justify-center"><div role="dialog" aria-modal="true" aria-label="Produto pronto Futura" className="bg-white rounded-xl p-6 max-w-xl w-full space-y-4">
    <h3 className="text-lg font-bold">Comunicação Visual — produto pronto Futura</h3>
    <p className="text-sm">Cada unidade abaixo corresponde ao lote e à configuração importados.</p>
    <label className="block">Produto<select className="border rounded-lg p-2 w-full" value={id} onChange={e => setId(e.target.value)}><option value="">Selecione</option>{imports.map(p => <option key={p.id} value={p.id}>{p.product.name} · lote {p.product.quantity}</option>)}</select></label>
    {selected && <SpecificationDetails entries={selected.product.configuration} />}
    <label className="block">Quantidade de lotes<input type="number" min="1" step="1" className="border rounded-lg p-2 w-full" value={quantity} onChange={e => setQuantity(Number(e.target.value))} /></label>
    {(error || pricing.error) && <p role="alert" className="text-red-700">{error || pricing.error}</p>}
    {pricing.pending && <p>Calculando…</p>}{pricing.data && <p className="font-bold">Valor: {formatCurrency(pricing.data.item.subtotal)}</p>}
    <div className="flex justify-end gap-4"><button onClick={onClose}>Cancelar</button><button className="bg-indigo-700 text-white px-4 py-2 rounded-lg disabled:opacity-40" disabled={!pricing.data} onClick={() => onSave({ ...pricing.data!.item, id: item?.id ?? crypto.randomUUID(), position: item?.position ?? 1 })}>Adicionar ao orçamento</button></div>
  </div></div>;
}
