import {Download} from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { futuraApi, ImportedFutura } from '../services/futuraApi';
import { FuturaCategory, FuturaCatalogEntry, FuturaProduct, FuturaPreview } from '../types/futura';
import { ServiceGroup } from '../types/graphicProduct';
import { UserRole } from '../types';
import { formatCurrency } from '../utils/formatters';
import { storage } from '../services/storage';
import { futuraConfigurationFields } from '../utils/futuraConfiguration';
import { SpecificationDetails } from './SpecificationDetails';

const money = (cents: number) => formatCurrency(cents / 100);
const when = (iso: string) => new Date(iso).toLocaleString('pt-BR');
const field = 'block w-full border border-slate-300 rounded-lg p-2 mt-1';
export function FuturaImportPanel({ onChanged, currentRole, defaultGroup }: { onChanged: () => Promise<void>; currentRole: UserRole; defaultGroup?: ServiceGroup }) {
  const [open, setOpen] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false), [query, setQuery] = useState(''), [category, setCategory] = useState(''), [url, setUrl] = useState('');
  const [categories, setCategories] = useState<FuturaCategory[]>([]), [results, setResults] = useState<FuturaCatalogEntry[]>([]);
  const [product, setProduct] = useState<FuturaProduct | null>(null), [group, setGroup] = useState<ServiceGroup | ''>('');
  const [preview, setPreview] = useState<FuturaPreview | null>(null), [imports, setImports] = useState<ImportedFutura[]>([]);
  const [includeShipping, setIncludeShipping] = useState(true);
  const [config, setConfig] = useState<Awaited<ReturnType<typeof futuraApi.config>> | null>(null);
  const [audit, setAudit] = useState<Awaited<ReturnType<typeof futuraApi.audit>> | null>(null);
  const canManage = currentRole === 'ADMIN' || currentRole === 'SALES';
  const run = async (action: () => Promise<void>) => {
    if (busy) return; setBusy(true); setError(''); setNotice('');
    try { await action(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  useEffect(() => { let active = true; Promise.all([futuraApi.config(), futuraApi.list()]).then(([c, i]) => { if (active) { setConfig(c); setImports(i); } }).catch(e => { if (active) setError(e.message); }); return () => { active = false; }; }, []);
  const choose = async (sourceUrl: string) => { setPreview(null); setProduct(null); const p = await futuraApi.product(sourceUrl); setProduct(p); };
  return <>
    <div className="inline-flex">
      <button disabled={busy || !canManage} className="nagano-button secondary disabled:opacity-40" onClick={() => { setOpen(true); setProduct(null); setPreview(null); setGroup(defaultGroup??''); setIncludeShipping(true); void run(async () => setCategories(await futuraApi.categories())); }}><Download size={16}/>Importar da Futura</button>
    </div>
    <span className="sr-only" role="status">{notice}</span>
    {open && <div className="nagano-overlay fixed inset-0 bg-slate-900/60 z-50 overflow-auto p-4"><div role="dialog" aria-modal="true" aria-label="Importar da Futura" className="bg-white rounded-xl max-w-4xl mx-auto p-6 space-y-5">
      <div className="flex justify-between items-center"><h2 className="font-bold text-xl">Selecionar produto da Futura</h2><button disabled={busy} onClick={() => { setOpen(false); setPreview(null); }}>Fechar</button></div>
      {error && <p role="alert" className="text-red-700">{error}</p>}{busy && <p role="status">Consultando / salvando…</p>}
    <details><summary className="cursor-pointer font-semibold">Produtos importados ({imports.length}) e atualizações</summary>
      <p className="text-sm my-2">Alterações automáticas valem para novos cálculos. Orçamentos salvos mantêm seus valores. Preços alterados manualmente ficam fora da atualização automática.</p>
      <button disabled={busy} className="underline mr-4" onClick={() => void run(async () => setImports(await futuraApi.list()))}>Recarregar lista</button>
      <button disabled={busy} className="underline" onClick={() => void run(async () => setAudit(await futuraApi.audit()))}>Ver histórico</button>
      <div className="space-y-2 mt-3">{imports.map(item => <div key={item.id} className="bg-white rounded-lg p-3 border">
        <strong>{item.product.name}</strong><p className="text-sm">{item.serviceGroup === 'GRAPHIC_PRODUCTS' ? 'Gráfica' : 'Comunicação Visual'} · Lote: {item.product.quantity.toLocaleString('pt-BR')} · Último preço Futura: {money(item.product.sourcePriceCents)} · Venda importada: {money(item.salePriceCents)}</p>
        {item.shipping && <p className="text-sm">Frete incluído por lote: {money(item.shipping.priceCents)} · {item.shipping.method} · CEP {item.shipping.postalCode.replace(/(\d{5})(\d{3})/, '$1-$2')}</p>}
        <p className="text-xs text-slate-600">Consultado em {when(item.product.fetchedAt)} · {item.priceSource === 'MANUAL' ? 'Alteração manual / cadastro indisponível: automático suspenso' : item.active ? 'Atualização automática ativa' : 'Cadastro inativo'}</p>
        {item.syncError && <p role="alert" className="text-sm text-red-700">Última tentativa: {item.lastAttemptAt && when(item.lastAttemptAt)}. {item.syncError} O preço anterior foi mantido.</p>}
        <a className="text-indigo-700 underline text-sm mr-4" href={item.product.url} target="_blank" rel="noreferrer">Produto na Futura</a>
        <button className="text-indigo-700 underline text-sm disabled:opacity-40" disabled={busy || !canManage} onClick={() => void run(async () => { const p = await futuraApi.preview({ importId: item.id }); setPreview(p); setOpen(true); })}>Atualizar preço agora</button>
        {!item.shipping && <button className="text-indigo-700 underline text-sm ml-4 disabled:opacity-40" disabled={busy || !canManage} onClick={() => void run(async () => { const p = await futuraApi.preview({ importId: item.id, includeShipping: true }); setPreview(p); setOpen(true); })}>Incluir frete no preço</button>}
      </div>)}</div>
      {audit && <div className="mt-3 max-h-60 overflow-auto text-xs space-y-2">{audit.map(entry => <p key={entry.id}>{when(entry.timestamp)} · {entry.action === 'FUTURA_SYNC_FAILED' ? 'Falha de atualização' : entry.action === 'FUTURA_PRODUCT_IMPORTED' ? 'Produto importado' : 'Preço atualizado'} · {entry.user}<br />{entry.details}</p>)}</div>}
    </details>
      {!preview && <>
        <form className="grid sm:grid-cols-3 gap-3 items-end" onSubmit={e => { e.preventDefault(); void run(async () => { setResults(await futuraApi.search(query, category)); setProduct(null); }); }}>
          <label>Buscar produto<input className={field} value={query} onChange={e => setQuery(e.target.value)} placeholder="Cartão de visita" maxLength={100} /></label>
          <label>Categoria<select className={field} value={category} onChange={e => setCategory(e.target.value)}><option value="">Vitrine / categoria sugerida</option>{categories.map(c => <option key={c.path} value={c.path}>{c.name}</option>)}</select></label>
          <button disabled={busy} className="bg-indigo-600 text-white p-2 rounded-lg disabled:opacity-40">Buscar</button>
        </form>
        <p className="text-xs text-slate-500">A busca filtra a vitrine da categoria permitida pela Futura. Para uma configuração específica, informe o link que contém “?id=”.</p>
        <form className="flex gap-2" onSubmit={e => { e.preventDefault(); void run(() => choose(url)); }}><input aria-label="Link do produto Futura" className={field} value={url} onChange={e => setUrl(e.target.value)} placeholder="https://www.futuraim.com.br/produto/…?id=…" /><button disabled={busy || !url} className="whitespace-nowrap underline">Consultar link</button></form>
        {!product && <div className="grid sm:grid-cols-2 gap-3 max-h-80 overflow-auto">{results.map(p => <div key={p.url} className="border rounded-lg p-3"><strong>{p.name}</strong><p>{p.sourcePriceCents ? `Vitrine: ${money(p.sourcePriceCents)}` : 'Consulte a configuração para ver o preço'}</p><p className="text-xs">Consultado em {when(p.fetchedAt)}</p><button disabled={busy} className="text-indigo-700 underline" onClick={() => void run(() => choose(p.url))}>Selecionar</button></div>)}</div>}
        {product && <div className="border rounded-lg p-4 space-y-3"><h3 className="font-bold">{product.name}</h3>
          <p>Código Futura: {product.sourceProductId} · Quantidade: {product.quantity.toLocaleString('pt-BR')} unidades</p>
          <div className="grid sm:grid-cols-2 gap-4">{futuraConfigurationFields(product).map(attribute => <label className="block text-sm font-semibold" key={attribute.field}>
            {attribute.field === 'Quantidade' ? 'Escolha a quantidade' : attribute.field}
            <select aria-label={attribute.field === 'Quantidade' ? 'Escolha a quantidade' : attribute.field} className={field} disabled={busy || attribute.options.length < 2} value={product.url} onChange={e => void run(() => choose(e.target.value))}>
              {attribute.options.map(option => <option key={`${option.url}:${option.label}`} value={option.url}>{attribute.field === 'Quantidade' ? `${Number(option.label).toLocaleString('pt-BR')} unidades` : option.label}</option>)}
            </select>
            {attribute.options.length < 2 && <small className="font-normal text-slate-500">Opção fixa neste produto.</small>}
          </label>)}</div>
          <p className="text-xs text-slate-600">Cada escolha consulta a combinação disponível na Futura e atualiza os demais campos e o preço. Confira todos os detalhes antes de importar.</p>
          <p>Preço atual Futura: <strong>{money(product.sourcePriceCents)}</strong><br /><small>Consultado em {when(product.fetchedAt)}</small></p>
          <a className="text-indigo-700 underline" href={product.url} target="_blank" rel="noreferrer">Conferir na Futura</a>
          <label className="block">Tipo / grupo do item<select className={field} value={group} onChange={e => setGroup(e.target.value as ServiceGroup)}><option value="">Selecione o grupo</option><option value="GRAPHIC_PRODUCTS">Gráfica</option><option value="VISUAL_COMMUNICATION">Comunicação Visual</option></select></label>
          {group === 'VISUAL_COMMUNICATION' && <p className="text-sm">Será cadastrado como produto pronto vendido por lote, com esta configuração. O cálculo de materiais em bobina permanece separado.</p>}
          <div className="rounded-lg bg-indigo-50 p-3 space-y-2 text-sm">
            <label className="flex gap-2 items-center font-semibold"><input type="checkbox" checked={includeShipping} disabled={busy} onChange={e => setIncludeShipping(e.target.checked)} />Incluir frete da Futura no preço de venda</label>
            <p>{config?.shippingDestination.address}</p>
            <p>Produto × {config?.multiplier.replace('.', ',')} + frete, sem multiplicar o frete. Será consultada a entrega no endereço de menor valor para um lote. Retirada em balcão não será selecionada.</p>
          </div>
          <button disabled={busy || !group} className="bg-indigo-700 text-white p-2 rounded-lg disabled:opacity-40" onClick={() => void run(async () => setPreview(await futuraApi.preview({ url: product.url, serviceGroup: group as ServiceGroup, includeShipping })))}>Conferir preço de venda</button>
        </div>}
      </>}
      {preview && <div className="border rounded-lg p-4 space-y-3">
        <h3 className="font-bold">{preview.product.name}</h3><p>{preview.product.quantity.toLocaleString('pt-BR')} unidades · {preview.serviceGroup === 'GRAPHIC_PRODUCTS' ? 'Gráfica' : 'Comunicação Visual'}</p>
        <SpecificationDetails entries={preview.product.configuration} />
        <p>Preço atual Futura: {money(preview.product.sourcePriceCents)}<br />Multiplicador Nagano: {preview.markupMultiplier.replace('.', ',')}x</p>
        {preview.shipping && <div className="rounded-lg bg-indigo-50 p-3 space-y-1 text-sm">
          <p>Produto com margem: <strong>{money(preview.productSalePriceCents!)}</strong></p>
          <p>Frete Futura incluído: <strong>{money(preview.shipping.priceCents)}</strong> (sem multiplicador)</p>
          <p>{preview.shipping.address}</p><p>Entrega: {preview.shipping.method} · Transporte estimado: {preview.shipping.deadline}</p>
          <p className="text-xs">Menor valor de entrega retornado para um lote. Estimativa consultada em {when(preview.shipping.fetchedAt)}; confira no fechamento do pedido. O prazo de transporte não inclui a produção.</p>
        </div>}
        {preview.previous && <p>Preço de venda anterior: {money(preview.previous.salePriceCents)}</p>}
        <p className="font-bold text-lg">Preço de venda Nagano: {money(preview.salePriceCents)}</p>
        <p className="text-xs">Consultado em {when(preview.product.fetchedAt)}. Preço do lote {preview.shipping ? 'com o frete acima incluído; não some esse mesmo frete novamente no orçamento' : 'sem frete'}. Serviços extras não incluídos. Atualização automática {preview.shipping ? 'do produto e frete' : 'do produto'} após o cadastro.</p>
        <div className="flex gap-4"><button disabled={busy || !canManage} className="bg-indigo-700 text-white px-4 py-2 rounded-lg" onClick={() => void run(async () => {
          const saved = await futuraApi.confirm(preview.token, currentRole);
          storage.addAuditLog(preview.previous ? 'FUTURA_PRICE_REFRESHED' : 'FUTURA_PRODUCT_IMPORTED', 'FUTURA_PRODUCT', saved.id, `${saved.product.name}: ${money(saved.salePriceCents)}.`, currentRole);
          setPreview(null); setOpen(false); setImports(await futuraApi.list()); await onChanged(); setNotice('Cadastro atualizado. A atualização automática está ativa.');
        })}>{preview.previous ? 'Confirmar novo preço' : 'Importar produto'}</button><button disabled={busy} onClick={() => setPreview(null)}>Voltar</button></div>
      </div>}
    </div></div>}
  </>;
}
