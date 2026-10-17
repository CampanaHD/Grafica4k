import { SpecificationDetails } from './SpecificationDetails';
import { Service } from '../types';
import {Plus} from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { GraphicProduct, GraphicPricingMethod, graphicMethodLabels } from '../types/graphicProduct';
import { graphicProductsApi } from '../services/graphicProductsApi';
import { formatCurrency } from '../utils/formatters';
import { storage } from '../services/storage';

const inputClass = 'block w-full border border-slate-300 rounded-lg p-2 mt-1 font-normal';
export function GraphicProductsSettings({ legacyServices = [], refreshVersion = 0, actions }: { legacyServices?: Service[]; refreshVersion?: number;actions?:React.ReactNode }) {
  const [products, setProducts] = useState<GraphicProduct[]>([]);
  const [editing, setEditing] = useState<GraphicProduct | null>(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [derivedUnit, setDerivedUnit] = useState<{ key: string; value: number } | null>(null);
  const configKey = JSON.stringify(editing);
  useEffect(() => {
    if (!editing || editing.pricingMethod === 'QUANTITY_PRICE_TABLE') return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      fetch('/api/graphic-products/validate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: configKey, signal: controller.signal }).then(r => r.json()).then(r => {
        if (!controller.signal.aborted && r.success) setDerivedUnit({ key: configKey, value: r.data.baseUnitPrice });
      }).catch(() => {});
    }, 150);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [configKey]);
  const [notice, setNotice] = useState('');
  const refresh = () => graphicProductsApi.list().then(p => { setProducts(p); setLoaded(true); setError(''); }).catch(e => setError(e.message));
  useEffect(() => { void refresh(); }, [refreshVersion]);
  const update = (patch: Partial<GraphicProduct>) => setEditing(p => p ? { ...p, ...patch } : p);
  const create = () => { setError(''); setNotice(''); setEditing({ id: crypto.randomUUID(), serviceGroup: 'GRAPHIC_PRODUCTS', name: '', code: '', category: '', description: '', specification: '', active: true, pricingMethod: 'UNIT_PRICE', baseQuantity: 1000, baseBatchPrice: 0, discountsEnabled: true, quantityDiscounts: [], priceTable: [] }); };
  const save = async (event: React.FormEvent) => {
    event.preventDefault(); if (!editing || saving) return;
    setSaving(true); setError('');
    try {
      const saved = await graphicProductsApi.save(editing);
      setProducts(p => [...p.filter(x => x.id !== saved.id), saved]);
      storage.addAuditLog('SALVAR', 'GRAPHIC_PRODUCT', saved.id, `Configuração de ${saved.name} salva, revisão ${saved.revision}.`);
      setEditing(null); setNotice('Produto gráfico salvo.');
    } catch (e) { setError((e as Error).message); } finally { setSaving(false); }
  };
  const remove=async(product:GraphicProduct)=>{
    if(saving)return;setSaving(true);setError('');
    try{await graphicProductsApi.remove(product);setProducts(p=>p.filter(row=>row.id!==product.id));setNotice('Produto excluído do catálogo. Orçamentos e histórico foram preservados.');if(editing?.id===product.id)setEditing(null);}
    catch(e){setError((e as Error).message);}finally{setSaving(false);}
  };
  return <section className="space-y-4">
    <div className="flex flex-wrap gap-3 justify-between items-center"><div><h3 className="font-bold text-lg">Produtos Gráficos</h3><p className="text-sm text-slate-500">Preços por unidade, lote base ou tabela de quantidades.</p></div><div className="flex flex-wrap gap-2"><button className="nagano-button primary disabled:opacity-40" disabled={!loaded} onClick={create}><Plus size={16}/>Novo Serviço</button>{actions}</div></div>
    {legacyServices.some(s => s.serviceGroup === 'GRAPHIC_PRODUCTS' && !products.some(p => p.id === s.id)) && <label className="block text-sm">Aproveitar cadastro de serviço gráfico existente (revisar antes de salvar)
      <select className={inputClass} value="" onChange={e => {
        const s = legacyServices.find(s => s.id === e.target.value); if (!s) return;
        setError(''); setNotice('Confira os valores de referência legados antes de salvar. Os orçamentos anteriores não serão alterados.');
        setEditing({ id: s.id, serviceGroup: 'GRAPHIC_PRODUCTS', name: s.name, code: '', category: s.category, description: s.description ?? '', specification: '', active: s.active,
          pricingMethod: s.quantityDiscountTiers?.length ? 'BASE_BATCH_WITH_QUANTITY_DISCOUNT' : 'UNIT_PRICE', baseQuantity: s.referenceQuantity, baseBatchPrice: s.referencePrice,
          discountsEnabled: true, quantityDiscounts: (s.quantityDiscountTiers ?? []).filter(t => t.active !== false).map(t => ({ minimumQuantity: t.minimumQuantity, percentage: t.discountPercentage })), priceTable: [] });
      }}><option value="">Selecione para revisar</option>{legacyServices.filter(s => s.serviceGroup === 'GRAPHIC_PRODUCTS' && !products.some(p => p.id === s.id)).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
    </label>}
    {error && <p role="alert" className="text-red-700">{error} {!editing && <button className="underline" onClick={refresh}>Recarregar</button>}</p>}
    {notice && <p role="status" className="text-emerald-700">{notice}</p>}
    {!loaded && !error && <p>Carregando produtos…</p>}
    <table className="w-full text-sm text-left"><thead className="bg-slate-100"><tr><th className="p-3">Produto / categoria</th><th>Método</th><th>Status</th><th /></tr></thead><tbody>{products.map(p => <tr key={p.id} className="border-b"><td className="p-3"><strong>{p.name}</strong><p>{p.code} · {p.category}</p>{p.specification&&<SpecificationDetails value={p.specification}/>}</td><td>{graphicMethodLabels[p.pricingMethod]}</td><td>{p.active ? 'Ativo' : 'Inativo'}</td><td><button className="text-indigo-700 underline" onClick={() => { setEditing(structuredClone(p)); setError(''); setNotice(''); }}>Editar</button><button disabled={saving} className="ml-3 text-rose-700 underline" onClick={()=>void remove(p)}>Excluir</button></td></tr>)}</tbody></table>
    {loaded && !products.length && <p className="text-slate-500">Nenhum produto gráfico cadastrado.</p>}
    {editing && <form onSubmit={save} className="border border-slate-200 rounded-xl p-5 bg-slate-50 space-y-4">
      <h4 className="font-bold">{editing.revision ? 'Editar produto gráfico' : 'Novo produto gráfico'}</h4>
      <label className="block text-sm font-semibold">Grupo de serviço<input readOnly value="Gráfica" className={inputClass} /></label>
      <div className="grid sm:grid-cols-2 gap-4">{(['name', 'code', 'category', 'description', 'specification'] as const).map((key, i) => <label key={key} className="text-sm font-semibold">{['Nome do produto', 'Código interno', 'Categoria', 'Descrição', 'Especificação'][i]}<textarea required={key === 'name'} rows={key === 'specification'?4:1} className={inputClass} value={key === 'specification'?editing[key].replace(/;\s*/g,'\n'):editing[key]} onChange={e => update({ [key]: e.target.value })} /></label>)}
      <label className="text-sm font-semibold">Status<select className={inputClass} value={String(editing.active)} onChange={e => update({ active: e.target.value === 'true' })}><option value="true">Ativo</option><option value="false">Inativo</option></select></label></div>
      <label className="block text-sm font-semibold">Método de preço<select className={inputClass} value={editing.pricingMethod} onChange={e => update({ pricingMethod: e.target.value as GraphicPricingMethod, baseQuantity: editing.baseQuantity ?? 1000, baseBatchPrice: editing.baseBatchPrice ?? 0, discountsEnabled: editing.discountsEnabled ?? true, quantityDiscounts: editing.quantityDiscounts ?? [], priceTable: editing.priceTable ?? [] })}>{Object.entries(graphicMethodLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      {editing.pricingMethod !== 'QUANTITY_PRICE_TABLE' && <div className="grid sm:grid-cols-2 gap-4">
        <label className="text-sm font-semibold">Quantidade base<input required type="number" min="1" step="1" className={inputClass} value={editing.baseQuantity ?? ''} onChange={e => update({ baseQuantity: Number(e.target.value), baseUnitPrice: undefined })} /></label>
        <label className="text-sm font-semibold">Preço do lote base (R$)<input required type="number" min="0" step="0.01" className={inputClass} value={editing.baseBatchPrice ?? ''} onChange={e => update({ baseBatchPrice: Number(e.target.value), baseUnitPrice: undefined })} /></label>
        <p className="sm:col-span-2 text-sm">{derivedUnit?.key === configKey ? `Preço unitário base: R$ ${derivedUnit.value.toFixed(6).replace('.', ',')}` : 'Preencha uma configuração válida para calcular o preço unitário.'}</p>
      </div>}
      {editing.pricingMethod === 'BASE_BATCH_WITH_QUANTITY_DISCOUNT' && <div className="space-y-3">
        <label className="flex gap-2"><input type="checkbox" checked={editing.discountsEnabled ?? false} onChange={e => update({ discountsEnabled: e.target.checked })} />Habilitar desconto por quantidade</label>
        {(editing.quantityDiscounts ?? []).map((tier, i) => <div key={i} className="flex gap-3 items-end"><label className="flex-1 text-sm">Quantidade mínima<input aria-label={`Quantidade mínima ${i + 1}`} required type="number" min="1" step="1" className={inputClass} value={tier.minimumQuantity} onChange={e => update({ quantityDiscounts: editing.quantityDiscounts!.map((t, j) => j === i ? { ...t, minimumQuantity: Number(e.target.value) } : t) })} /></label><label className="flex-1 text-sm">Desconto (%)<input aria-label={`Percentual ${i + 1}`} required type="number" min="0" max="100" step="0.01" className={inputClass} value={tier.percentage} onChange={e => update({ quantityDiscounts: editing.quantityDiscounts!.map((t, j) => j === i ? { ...t, percentage: Number(e.target.value) } : t) })} /></label><button type="button" onClick={() => update({ quantityDiscounts: editing.quantityDiscounts!.filter((_, j) => j !== i) })}>Remover faixa</button></div>)}
        <button type="button" className="text-indigo-700 underline mr-4" onClick={() => update({ quantityDiscounts: [...(editing.quantityDiscounts ?? []), { minimumQuantity: 1, percentage: 0 }] })}>Adicionar faixa</button><button type="button" className="underline" onClick={() => update({ quantityDiscounts: [...(editing.quantityDiscounts ?? [])].sort((a,b) => a.minimumQuantity - b.minimumQuantity) })}>Ordenar faixas</button>
      </div>}
      {editing.pricingMethod === 'QUANTITY_PRICE_TABLE' && <div className="space-y-3">
        {(editing.priceTable ?? []).map((row, i) => <div key={i} className="flex gap-3 items-end"><label className="flex-1 text-sm">Quantidade do lote<input aria-label={`Quantidade do lote ${i + 1}`} required type="number" min="1" step="1" className={inputClass} value={row.quantity} onChange={e => update({ priceTable: editing.priceTable!.map((t, j) => j === i ? { ...t, quantity: Number(e.target.value) } : t) })} /></label><label className="flex-1 text-sm">Preço do lote (R$)<input aria-label={`Preço do lote ${i + 1}`} required type="number" min="0" step="0.01" className={inputClass} value={row.batchPrice} onChange={e => update({ priceTable: editing.priceTable!.map((t, j) => j === i ? { ...t, batchPrice: Number(e.target.value) } : t) })} /></label><button type="button" onClick={() => update({ priceTable: editing.priceTable!.filter((_, j) => j !== i) })}>Remover preço</button></div>)}
        <button type="button" className="text-indigo-700 underline mr-4" onClick={() => update({ priceTable: [...(editing.priceTable ?? []), { quantity: 1, batchPrice: 0 }] })}>Adicionar preço</button><button type="button" className="underline" onClick={() => update({ priceTable: [...(editing.priceTable ?? [])].sort((a,b) => a.quantity - b.quantity) })}>Ordenar tabela</button>
        <p className="text-sm text-slate-500">Somente quantidades cadastradas terão preço. Não há interpolação nem desconto adicional.</p>
      </div>}
      <div className="flex gap-4"><button disabled={saving} className="bg-indigo-600 text-white rounded-lg px-4 py-2 disabled:opacity-40">{saving ? 'Salvando…' : 'Salvar produto gráfico'}</button><button type="button" disabled={saving} onClick={() => setEditing(null)}>Cancelar</button></div>
    </form>}
  </section>;
}

