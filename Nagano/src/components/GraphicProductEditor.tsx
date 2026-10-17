import { DialogHeader } from './DialogHeader';
import { SpecificationDetails } from './SpecificationDetails';
import React, { useEffect, useState } from 'react';
import { GraphicProduct } from '../types/graphicProduct';
import { QuotationItem } from '../types';
import { graphicProductsApi } from '../services/graphicProductsApi';
import { useItemPricing } from '../services/useRollPricing';
import { GraphicPricingDetails } from './GraphicPricingDetails';

export function GraphicProductEditor({ item, onSave, onClose, onVisual }: { item?: QuotationItem; onSave: (item: QuotationItem) => void; onClose: () => void; onVisual: () => void }) {
  const [products, setProducts] = useState<GraphicProduct[]>([]);
  const [productId, setProductId] = useState(item?.graphicProductId ?? '');
  const [quantity, setQuantity] = useState(item?.quantity ?? 1000);
  const [description, setDescription] = useState(item?.description ?? '');
  const [error, setError] = useState('');
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    let cancelled = false;
    graphicProductsApi.list().then(p => { if (!cancelled) { setProducts(p); setLoaded(true); } }).catch(e => { if (!cancelled) setError(e.message); });
    return () => { cancelled = true; };
  }, []);
  const product = products.find(p => p.id === productId);
  const pricing = useItemPricing({ finishings:item?.finishings,stockFinishings:item?.stockFinishings,internalCosts:item?.internalCosts,serviceGroup: 'GRAPHIC_PRODUCTS', graphicProductId: productId, quantity, description }, !!productId && loaded, JSON.stringify(product));
  return <div className="nagano-overlay fixed inset-0 bg-slate-900/60 z-50 flex items-center justify-center p-4"><div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-xl">
    <DialogHeader title="Produto gráfico no orçamento" subtitle="Escolha o produto, a tiragem e as especificações do serviço." closeLabel="Fechar produto gráfico" onClose={onClose} />
    <div className="p-5 space-y-4">
      <label className="block text-sm font-semibold">Classificação do serviço<select className="block w-full border rounded-lg p-2 mt-1" value="GRAPHIC_PRODUCTS" onChange={onVisual}><option value="GRAPHIC_PRODUCTS">Gráfica</option><option value="VISUAL_COMMUNICATION">Comunicação Visual</option></select></label>
      <label className="block text-sm font-semibold">Produto gráfico<select className="block w-full border rounded-lg p-2 mt-1" value={productId} onChange={e => { setProductId(e.target.value); const chosen = products.find(p => p.id === e.target.value); setDescription(chosen?.description ?? ''); if (chosen?.pricingMethod === 'QUANTITY_PRICE_TABLE') setQuantity(chosen.priceTable?.[0]?.quantity ?? 1); }}><option value="">Selecione um produto</option>{products.filter(p => p.active || p.id === productId).map(p => <option key={p.id} value={p.id} disabled={!p.active}>{p.name}{!p.active && ' (inativo)'}</option>)}</select></label>
      {product && <SpecificationDetails value={product.specification} />}
      {loaded && !products.some(p => p.active) && <p>Cadastre um produto ativo em Configurações → Gráfica.</p>}
      <label className="block text-sm font-semibold">Quantidade{product?.pricingMethod === 'QUANTITY_PRICE_TABLE' ? <select className="block w-full border rounded-lg p-2 mt-1" value={quantity} onChange={e => setQuantity(Number(e.target.value))}><option value="" disabled>Selecione a tiragem</option>{product.priceTable?.map(row => <option key={row.quantity} value={row.quantity}>{row.quantity.toLocaleString('pt-BR')} unidades</option>)}</select> : <input className="block w-full border rounded-lg p-2 mt-1" type="number" min="1" step="1" value={quantity} onChange={e => setQuantity(Number(e.target.value))} />}</label>
      <label className="block text-sm font-semibold">Descrição do item<textarea className="block w-full border rounded-lg p-2 mt-1" value={description} onChange={e => setDescription(e.target.value)} /></label>
      {pricing.pending && <p role="status">Calculando…</p>}
      {(error || pricing.error) && <p role="alert" className="text-red-700">{error || pricing.error}</p>}
      {pricing.data?.item.graphicSnapshot && <GraphicPricingDetails snapshot={pricing.data.item.graphicSnapshot} />}
    </div>
    <footer className="border-t p-5 flex justify-end gap-3"><button onClick={onClose}>Cancelar</button><button className="bg-indigo-600 text-white px-4 py-2 rounded-lg disabled:opacity-40" disabled={!pricing.data || !product?.active} onClick={() => onSave({ ...pricing.data!.item, id: item?.id ?? crypto.randomUUID(), position: item?.position ?? 1 })}>Confirmar produto gráfico</button></footer>
  </div></div>;
}

