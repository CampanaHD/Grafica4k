import {CompositionPreview} from './CompositionPreview';
import React, { useState } from 'react';
import { Package, CheckCircle2 } from 'lucide-react';
import type { Material, Service, FinishOption, QuotationItem, AllowancesConfig } from '../types';
import { DialogHeader } from './DialogHeader';
import { useItemPricing } from '../services/useRollPricing';
import { calculateItemFinishing } from '../utils/calculationEngine';
import { formatCurrency } from '../utils/formatters';

interface Props {
  services: Service[]; materials: Material[]; finishes: FinishOption[]; item?: QuotationItem;
  onSave: (item: QuotationItem) => void; onClose: () => void;
  onRoll: (item: Partial<QuotationItem>) => void; onGraphic: () => void; onImported: () => void;
}
const fieldClass = 'w-full border border-slate-300 rounded-lg p-2.5 mt-1 bg-white text-slate-800';
export function VisualQuotationItemEditor({ services, materials, finishes, item, onSave, onClose, onGraphic, onImported, onRoll }: Props) {
  const catalog = services.filter(s => s.active && s.serviceGroup !== 'GRAPHIC_PRODUCTS');
  const initialService = catalog.find(s => s.id === item?.serviceId) ?? catalog[0];
  const choices = (s?: Service) => materials.filter(m => m.active && !m.futuraImportId && (!s?.allowedMaterialIds?.length || s.allowedMaterialIds.includes(m.id)));
  const initialMaterial = choices(initialService).find(m => m.id === item?.materialId) ?? choices(initialService).find(m => m.id === initialService?.defaultMaterialId) ?? choices(initialService)[0];
  const defaults = (m?: Material): AllowancesConfig => ({ reinforcementCm: m?.defaultReinforcementCm ?? 0, hemCm: m?.defaultHemCm ?? 0, rodPocketCm: m?.defaultRodPocketCm ?? 0, bleedCm: m?.defaultBleedCm ?? 0, edgeSafetyCm: m?.defaultEdgeSafetyCm ?? 0 });
  const [serviceId, setServiceId] = useState(initialService?.id ?? '');
  const [materialId, setMaterialId] = useState(initialMaterial?.id ?? '');
  const [width, setWidth] = useState(item?.widthCm ?? 90), [height, setHeight] = useState(item?.heightCm ?? 60), [quantity, setQuantity] = useState(item?.quantity ?? 1);
  const [description, setDescription] = useState(item?.description ?? ''), [notes, setNotes] = useState(item?.notes ?? '');
  const [allowances, setAllowances] = useState<AllowancesConfig>(item?.allowances ?? defaults(initialMaterial));
  const [finishIds, setFinishIds] = useState(item?.finishings?.map(f => f.finishingId) ?? []);
  const [discountType, setDiscountType] = useState(item?.discountType ?? 'NONE'), [discount, setDiscount] = useState(item?.discountInputValue ?? 0);
  const service = catalog.find(s => s.id === serviceId), material = choices(service).find(m => m.id === materialId);
  const compatibleFinishes = finishes.filter(f => f.active && (!f.compatibleMaterialIds?.length || f.compatibleMaterialIds.includes(materialId)) && (!f.compatibleServiceIds?.length || f.compatibleServiceIds.includes(serviceId)) && (!service?.allowedFinishIds?.length || service.allowedFinishIds.includes(f.id)) && (!material?.compatibleFinishIds?.length || material.compatibleFinishIds.includes(f.id)));
  const priced = useItemPricing({ id: item?.id, serviceId, serviceGroup: 'VISUAL_COMMUNICATION', materialId, widthCm: width, heightCm: height, quantity, orientation: 'AUTO', allowances, description, notes, discountType, discountInputValue: discount,
    stockFinishings:item?.stockFinishings,internalCosts:item?.internalCosts,
    finishings: compatibleFinishes.filter(f => finishIds.includes(f.id)).map(f => {
      const previous = item?.finishings?.find(fin => fin.finishingId === f.id);
      return previous?.compositionVersion?previous:{ ...calculateItemFinishing(f, width, height, quantity, 0), notes: previous?.notes };
    }),
  }, !!service && !!material, JSON.stringify({ service, material, compatibleFinishes }));
  const result = priced.data?.item, roll = result?.calculationSnapshot, sheet = result?.sheetSnapshot;
  function changeMaterial(m?: Material, s=service) { if(m?.controlType==='ROLL'&&s&&['PER_SQM','PER_LINM','POR_AREA_CONSUMIDA_BOBINA'].includes(s.pricingMethod)){onRoll({id:item?.id,serviceId:s.id,materialId:m.id,widthCm:width,heightCm:height,quantity,description,notes,discountType,discountInputValue:discount});return;} setMaterialId(m?.id ?? ''); setAllowances(defaults(m)); setFinishIds([]); }
  function numeric(label: string, value: number, setter: (v: number) => void, integer = false, min = 0.01) {
    return <label className="text-sm font-semibold text-slate-600">{label}<input aria-label={label} required type="number" min={min} step={integer ? 1 : 0.01} className={fieldClass} value={Number.isFinite(value) ? value : ''} onChange={e => setter(e.target.value === '' ? NaN : Number(e.target.value))} /></label>;
  }
  return <div className="nagano-overlay fixed inset-0 z-[80] p-3 sm:p-5 flex items-center justify-center"><div role="dialog" aria-modal="true" aria-label="Item de Comunicação Visual" className="w-full max-w-3xl max-h-[94vh] bg-slate-50 rounded-2xl shadow-2xl flex flex-col overflow-hidden">
    <DialogHeader title={item ? 'Editar serviço' : 'Adicionar serviço'} subtitle="Selecione o serviço e o material. O sistema encontra a medida de produção." icon={Package} onClose={onClose} />
    <form className="flex flex-col min-h-0" onSubmit={e => { e.preventDefault(); if (result) onSave({ ...result, id: item?.id ?? crypto.randomUUID(), position: item?.position ?? 1 }); }}>
      <div className="overflow-y-auto p-5 space-y-5">
        <label className="block text-sm font-semibold text-slate-600">Classificação do serviço<select className={fieldClass} value="VISUAL_COMMUNICATION" onChange={e => { if (e.target.value === 'GRAPHIC_PRODUCTS') onGraphic(); }}><option value="VISUAL_COMMUNICATION">Comunicação Visual</option><option value="GRAPHIC_PRODUCTS">Gráfica</option></select></label>
        <section className="bg-white rounded-xl border border-slate-200 p-4 space-y-4">
          <div className="grid sm:grid-cols-2 gap-4"><label className="text-sm font-semibold text-slate-600">Serviço<select aria-label="Serviço de Comunicação Visual" required className={fieldClass} value={serviceId} onChange={e => { const s = catalog.find(s => s.id === e.target.value); setServiceId(e.target.value); changeMaterial(choices(s).find(m => m.id === s?.defaultMaterialId) ?? choices(s)[0],s); }}><option value="">Selecione o serviço</option>{catalog.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
          <label className="text-sm font-semibold text-slate-600">Material<select aria-label="Material do serviço" required className={fieldClass} value={materialId} onChange={e => changeMaterial(choices(service).find(m => m.id === e.target.value))}><option value="">Selecione o material</option>{choices(service).map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</select></label></div>
          {!catalog.length && <p className="text-sm text-amber-700">Cadastre os serviços e preços em Configurações → Comunicação Visual.</p>}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">{numeric('Largura final (cm)', width, setWidth, false, material?.controlType === 'UNIT' ? 0 : 0.01)}{numeric('Altura final (cm)', height, setHeight, false, material?.controlType === 'UNIT' ? 0 : 0.01)}{numeric(service?.pricingMethod === 'HOURLY' ? 'Horas' : 'Quantidade', quantity, setQuantity, true, 1)}</div>
          <label className="block text-sm font-semibold text-slate-600">Descrição do serviço<textarea className={fieldClass} rows={2} value={description} onChange={e => setDescription(e.target.value)} placeholder="Ex.: banner para fachada, impressão colorida…" /></label>
          <button type="button" className="text-sm font-semibold text-indigo-700 underline" onClick={onImported}>Selecionar produto pronto importado da Futura</button>
        </section>
        <details className="bg-white rounded-xl border border-slate-200 p-4"><summary className="text-sm font-bold text-slate-700 cursor-pointer">Preparação e margens de produção</summary><p className="text-xs text-slate-500 mt-2">Valores iniciais do material. São acrescentados às medidas finais para conferir o encaixe.</p><div className="grid sm:grid-cols-3 gap-3 mt-3">{([['reinforcementCm', 'Reforço (cm)'], ['hemCm', 'Bainha (cm)'], ['rodPocketCm', 'Bolsa (cm)'], ['bleedCm', 'Sangria (cm)'], ['edgeSafetyCm', 'Margem da mídia (cm)']] as const).map(([key, label]) => <React.Fragment key={key}>{numeric(label, allowances[key] ?? 0, v => setAllowances(a => ({ ...a, [key]: v })), false, 0)}</React.Fragment>)}</div></details>
        {!!compatibleFinishes.length && <section className="bg-white rounded-xl border border-slate-200 p-4"><h3 className="text-sm font-bold mb-3">Acabamentos</h3><div className="grid sm:grid-cols-2 gap-3">{compatibleFinishes.map(f => <label key={f.id} className="flex gap-2 items-center text-sm"><input type="checkbox" checked={finishIds.includes(f.id)} onChange={e => setFinishIds(ids => e.target.checked ? [...ids, f.id] : ids.filter(id => id !== f.id))} />{f.name}</label>)}</div></section>}
        <div className="grid sm:grid-cols-2 gap-4"><label className="text-sm font-semibold text-slate-600">Observações<textarea className={fieldClass} value={notes} onChange={e => setNotes(e.target.value)} /></label><div className="grid grid-cols-2 gap-2"><label className="text-sm font-semibold text-slate-600">Desconto<select className={fieldClass} value={discountType} onChange={e => setDiscountType(e.target.value as typeof discountType)}><option value="NONE">Sem desconto</option><option value="PERCENTAGE">Percentual (%)</option><option value="FIXED_AMOUNT">Valor (R$)</option></select></label>{discountType !== 'NONE' && numeric('Desconto do item', discount, setDiscount, false, 0)}</div></div>
        {priced.pending && <p role="status" className="text-sm text-slate-500">Calculando o melhor aproveitamento…</p>}
        {priced.error && <p role="alert" className="p-3 rounded-lg text-sm bg-rose-50 text-rose-700">{priced.error}</p>}
        {result&&<CompositionPreview items={[result]}/>}
        {result && <section className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 space-y-2"><h3 className="font-bold text-emerald-900 flex items-center gap-2"><CheckCircle2 size={18} />{roll ? 'Bobina recomendada' : sheet ? 'Chapa recomendada' : 'Valor do serviço'}</h3>
          {roll && <><p className="text-sm text-emerald-900">{material?.name} · {roll.selectedRollWidthCm ?? roll.recommendedRollWidthCm} cm de largura</p><p className="text-xs text-emerald-800">Consumo: {roll.linearMetersNeeded?.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} m lineares · {roll.billableAreaM2?.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} m²{roll.orientation === 'VERTICAL' ? ' · Peça girada' : ''}</p></>}
          {sheet && <><p className="text-sm text-emerald-900">{sheet.sheetName} · {sheet.widthCm} × {sheet.heightCm} cm</p><p className="text-xs text-emerald-800">{sheet.capacity} peças por chapa · {sheet.sheetsNeeded} {sheet.sheetsNeeded === 1 ? 'chapa necessária' : 'chapas necessárias'}{sheet.rotated ? ' · Peça girada' : ''}</p></>}
          <div className="flex justify-between items-center border-t border-emerald-200 pt-3"><span className="text-sm text-emerald-900">Total deste serviço</span><strong className="text-xl text-emerald-900">{formatCurrency(result.subtotal)}</strong></div>
        </section>}
      </div><div className="flex justify-end gap-3 p-4 bg-white border-t border-slate-200"><button type="button" className="nagano-button secondary" onClick={onClose}>Cancelar</button><button className="nagano-button primary" disabled={!result || priced.pending}>Confirmar serviço</button></div>
    </form>
  </div></div>;
}



