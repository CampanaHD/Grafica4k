import { DialogHeader } from './DialogHeader';
import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Calculator, Copy, X, Upload, Check, RotateCw } from 'lucide-react';
import type { FinishOption, Material, QuotationItem, Service } from '../types';
import type { SimulationConfig, SimulationResult, SimulationSnapshot } from '../types/quotationSimulation';
import { materialCalculationRules } from '../utils/materialCalculation';
import { calculateItemFinishing } from '../utils/calculationEngine';
import { formatCurrency } from '../utils/formatters';
import { formatSimulationMessage } from '../utils/simulationMessage';
import { quotationApi } from '../services/quotationApi';

interface Props {
  services: Service[];
  materials: Material[];
  finishes: FinishOption[];
  initialItem?: QuotationItem;
  onClose: () => void;
  onChoose: (item: QuotationItem, validityHours: number) => void;
}
const kind = (m: Material) => m.controlType ?? (m.availableRolls?.length ? 'ROLL' : 'SHEET');
const number = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 });
const inputClass = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500';

export function QuotationSimulator({ services, materials, finishes, initialItem, onClose, onChoose }: Props) {
  const serviceCatalog=services.filter(s=>s.active && s.serviceGroup!=='GRAPHIC_PRODUCTS' && ['PER_SQM','PER_LINM','POR_AREA_CONSUMIDA_BOBINA'].includes(s.pricingMethod));
  const [serviceId,setServiceId]=useState(serviceCatalog.find(s=>s.id===initialItem?.serviceId)?.id??serviceCatalog[0]?.id??'');
  const service=serviceCatalog.find(s=>s.id===serviceId);
  const available = materials.filter(m => m.active && !m.futuraImportId && (!service?.allowedMaterialIds?.length || service.allowedMaterialIds.includes(m.id)) && ['ROLL', 'SHEET'].includes(kind(m)));
  const initialMaterial = available.find(m => m.id === initialItem?.materialId) ?? available[0];
  const [mode, setMode] = useState(kind(initialMaterial ?? { availableRolls: [] } as unknown as Material));
  const [materialId, setMaterialId] = useState(initialMaterial?.id ?? '');
  const material = available.find(m => m.id === materialId);
  const rolls = material ? materialCalculationRules(material).availableRolls.filter(r => r.active) : [];
  const previous = initialItem?.simulationSnapshot?.config;
  const [name, setName] = useState(initialItem?.serviceName ?? 'Adesivos');
  const [width, setWidth] = useState(initialItem?.widthCm ?? 4);
  const [height, setHeight] = useState(initialItem?.heightCm ?? 6.5);
  const [areaWidth, setAreaWidth] = useState(previous?.areaWidthCm ?? (mode === 'ROLL' ? rolls[0]?.widthCm ?? 100 : 32));
  const [areaHeight, setAreaHeight] = useState(previous?.areaHeightCm ?? (mode === 'ROLL' ? 100 : 45));
  const [margin, setMargin] = useState(previous?.marginCm ?? 0.5);
  const [gap, setGap] = useState(previous?.gapCm ?? 0.2);
  const [bleed, setBleed] = useState(previous?.bleedCm ?? 0);
  const [rotation, setRotation] = useState(previous?.allowRotation ?? true);
  const [selectedFinishes, setSelectedFinishes] = useState(initialItem?.finishings.map(f => f.finishingId) ?? []);
  const [quantitiesText, setQuantitiesText] = useState(initialItem ? String(initialItem.quantity) : '');
  const [validityHours, setValidityHours] = useState(48);
  const [result, setResult] = useState<SimulationResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [copyStatus, setCopyStatus] = useState('');
  const [reference, setReference] = useState<File | null>(null);
  const [preview, setPreview] = useState('');
  const controller = useRef<AbortController | null>(null);
  const requestVersion = useRef(0);
  const dialogRef = useRef<HTMLDivElement>(null);
  const patternId = useId().replace(/:/g, '');
  const compatibleFinishes = finishes.filter(f => f.active && (!f.compatibleMaterialIds?.length || f.compatibleMaterialIds.includes(materialId))
    && (!material?.compatibleFinishIds?.length || material.compatibleFinishIds.includes(f.id)));
  const config: SimulationConfig = { areaWidthCm: areaWidth, areaHeightCm: areaHeight, marginCm: margin, gapCm: gap, bleedCm: bleed, allowRotation: rotation };
  const inputKey = JSON.stringify({ serviceId, service, materialId, name, width, height, config, selectedFinishes, quantitiesText, reference: reference?.name, material, finishes });
  const message = useMemo(() => result ? formatSimulationMessage(result, validityHours) : '', [result, validityHours]);

  useEffect(() => {
    requestVersion.current++;
    controller.current?.abort();
    setBusy(false); setResult(null); setError(''); setCopyStatus('');
  }, [inputKey]);
  useEffect(() => {
    if (!reference || !['image/png', 'image/jpeg', 'image/webp'].includes(reference.type)) { setPreview(''); return; }
    const url = URL.createObjectURL(reference); setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [reference]);
  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();
    const listener = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); onClose(); }
      if (event.key === 'Tab') {
        const controls = [...(dialogRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled)') ?? [])].filter(el => el.offsetParent !== null);
        const first = controls[0], last = controls[controls.length - 1];
        if (event.shiftKey && (document.activeElement === first || document.activeElement === dialogRef.current)) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && (document.activeElement === last || document.activeElement === dialogRef.current)) { event.preventDefault(); first?.focus(); }
      }
    };
    document.addEventListener('keydown', listener);
    return () => { controller.current?.abort(); document.removeEventListener('keydown', listener); previousFocus?.focus(); };
  }, []);

  function chooseMaterial(id: string) {
    setMaterialId(id); setSelectedFinishes([]);
    const m = available.find(m => m.id === id);
    if (m && kind(m) === 'ROLL') setAreaWidth(materialCalculationRules(m).availableRolls.find(r => r.active)?.widthCm ?? 100);
  }
  function changeMode(value: string) {
    setMode(value);
    const m = available.find(m => kind(m) === value);
    chooseMaterial(m?.id ?? '');
    setAreaWidth(value === 'ROLL' && m ? materialCalculationRules(m).availableRolls.find(r => r.active)?.widthCm ?? 100 : 32);
    setAreaHeight(value === 'ROLL' ? 100 : 45);
  }
  async function simulate() {
    setError(''); setResult(null); setCopyStatus('');
    if (!service) { setError('Selecione um serviço com preço cadastrado.'); return; }
    if (!material) { setError('Cadastre e selecione um material deste tipo.'); return; }
    if (!Number.isInteger(validityHours) || validityHours < 1 || validityHours > 8760) { setError('Informe a validade entre 1 e 8.760 horas.'); return; }
    let quantities: number[] | undefined;
    if (quantitiesText.trim()) {
      const tokens = quantitiesText.trim().split(/[;,\s]+/);
      if (tokens.some(t => !/^\d+$/.test(t))) { setError('Use quantidades inteiras, separadas por vírgula. Exemplo: 100, 250, 500.'); return; }
      quantities = tokens.map(Number);
    }
    const source: Partial<QuotationItem> = {
      id: initialItem?.id ?? `sim_${Date.now()}`, serviceId, serviceName: name.trim() || 'Adesivos / peças', materialId, widthCm: width, heightCm: height,
      description: reference ? `Arte de referência: ${reference.name}` : initialItem?.description,
      simulationSnapshot: { config } as SimulationSnapshot,
      stockFinishings:initialItem?.stockFinishings,internalCosts:initialItem?.internalCosts,
      finishings: compatibleFinishes.filter(f => selectedFinishes.includes(f.id)).map(f => initialItem?.finishings?.find(s=>s.finishingId===f.id&&s.compositionVersion)||calculateItemFinishing(f, width, height, 1, 0)),
    };
    controller.current?.abort(); controller.current = new AbortController();
    const version = ++requestVersion.current;
    setBusy(true);
    try {
      const response = await quotationApi.simulate(source, quantities, controller.current.signal);
      if (version === requestVersion.current) setResult(response);
    } catch (err) { if (version === requestVersion.current && !(err instanceof DOMException && err.name === 'AbortError')) setError(err instanceof Error ? err.message : 'Não foi possível simular.'); }
    finally { if (version === requestVersion.current) setBusy(false); }
  }
  async function copy() {
    try { await navigator.clipboard.writeText(message); setCopyStatus('Mensagem copiada!'); }
    catch { setCopyStatus('Selecione o texto da mensagem abaixo e copie manualmente.'); }
  }
  function field(label: string, value: number, setter: (v: number) => void, min = 0) {
    return <label className="block text-xs font-semibold text-slate-600">{label}<input className={`${inputClass} mt-1`} type="number" min={min} step="0.01" value={Number.isFinite(value) ? value : ''} onChange={e => setter(e.target.value === '' ? NaN : Number(e.target.value))} /></label>;
  }
  const snapshot = result?.options[0].item.simulationSnapshot;
  return <div className="nagano-overlay fixed inset-0 z-[100] bg-slate-950/60 flex items-center justify-center p-2 sm:p-5">
    <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="sim-title" tabIndex={-1} className="bg-slate-50 rounded-2xl shadow-2xl w-full max-w-6xl max-h-[95vh] overflow-y-auto outline-none">
      <DialogHeader title="Simulador de quantidades" subtitle="Veja o aproveitamento da área e compare as opções para seu cliente." titleId="sim-title" icon={Calculator} closeLabel="Fechar simulador" onClose={onClose} />
      <div className="grid lg:grid-cols-[360px_1fr] gap-5 p-4 sm:p-5">
        <div className="space-y-4">
          <section className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
            <h3 className="font-bold text-slate-900">1. Arte e material</h3>
            <label className="block text-xs font-semibold text-slate-600">Serviço cadastrado<select aria-label="Serviço da simulação" className={`${inputClass} mt-1`} value={serviceId} onChange={e=>{const s=serviceCatalog.find(s=>s.id===e.target.value);setServiceId(e.target.value);const m=materials.find(m=>m.active&&!m.futuraImportId&&['ROLL','SHEET'].includes(kind(m))&&(!s?.allowedMaterialIds?.length||s.allowedMaterialIds.includes(m.id)));setMaterialId(m?.id??'');setMode(m?kind(m):'ROLL');setSelectedFinishes([]);if(m&&kind(m)==='ROLL')setAreaWidth(materialCalculationRules(m).availableRolls.find(r=>r.active)?.widthCm??100);}}><option value="">Selecione o serviço</option>{serviceCatalog.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
            <label className="block text-xs font-semibold text-slate-600">Nome do serviço<input className={`${inputClass} mt-1`} value={name} onChange={e => setName(e.target.value)} maxLength={120} /></label>
            <div className="grid grid-cols-2 gap-3">{field('Largura da arte (cm)', width, setWidth, 0.01)}{field('Altura da arte (cm)', height, setHeight, 0.01)}</div>
            <label className="block text-xs font-semibold text-slate-600">Tipo de impressão<select className={`${inputClass} mt-1`} value={mode} onChange={e => changeMode(e.target.value)}><option value="ROLL">Bobina</option><option value="SHEET">Folha / chapa</option></select></label>
            <label className="block text-xs font-semibold text-slate-600">Material<select className={`${inputClass} mt-1`} value={materialId} onChange={e => chooseMaterial(e.target.value)}><option value="">Selecione o material</option>{available.filter(m => kind(m) === mode).map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</select></label>
            {!available.some(m => kind(m) === mode) && <p className="text-xs text-amber-700">Cadastre um material do tipo {mode === 'ROLL' ? 'bobina' : 'folha/chapa'} em Configurações → Materiais.</p>}
            <label className="block text-xs font-semibold text-slate-600"><span className="flex gap-1 items-center"><Upload size={14} /> Arquivo da arte (opcional)</span><input className="mt-2 text-xs w-full" type="file" accept=".png,.jpg,.jpeg,.webp,.pdf,.svg" onChange={e => setReference(e.target.files?.[0] ?? null)} /></label>
            <p className="text-xs text-slate-500">Informe o tamanho final impresso acima. O arquivo serve como referência local e não fica salvo com o orçamento.</p>
            {preview && <img src={preview} alt="Prévia da arte de referência" className="max-h-24 rounded border border-slate-200 object-contain" />}
          </section>
          <section className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
            <h3 className="font-bold text-slate-900">2. Área de impressão</h3>
            <div className="grid grid-cols-2 gap-3">
              {mode === 'ROLL' ? <label className="block text-xs font-semibold text-slate-600">Largura da bobina (cm)<select className={`${inputClass} mt-1`} value={areaWidth} onChange={e => setAreaWidth(Number(e.target.value))}>{rolls.map(r => <option key={r.id} value={r.widthCm}>{number.format(r.widthCm)} cm</option>)}</select></label> : field('Largura da folha (cm)', areaWidth, setAreaWidth, 0.01)}
              {field(mode === 'ROLL' ? 'Comprimento do bloco (cm)' : 'Altura da folha (cm)', areaHeight, setAreaHeight, 0.01)}
            </div>
            <div className="grid grid-cols-3 gap-2">{field('Margem (cm)', margin, setMargin)}{field('Espaço (cm)', gap, setGap)}{field('Sangria (cm)', bleed, setBleed)}</div>
            <p className="text-xs text-slate-500">Margem em cada borda; espaço entre peças; sangria em cada lado da arte.</p>
            <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={rotation && (material?.allowRotation ?? material?.rollConfiguration?.allowRotation ?? true)} disabled={(material?.allowRotation ?? material?.rollConfiguration?.allowRotation) === false} onChange={e => setRotation(e.target.checked)} /><RotateCw size={15} /> Permitir girar a arte em 90°</label>
            {mode === 'ROLL' && <p className="text-xs text-slate-500">O bloco define a quantidade base. A cobrança considera a largura inteira e o comprimento das fileiras usadas.</p>}
            {mode === 'SHEET' && <p className="text-xs text-slate-500">Folhas/chapas são cobradas inteiras, inclusive quando sobra espaço.</p>}
          </section>
          <section className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
            <h3 className="font-bold text-slate-900">3. Opções e acabamento</h3>
            {compatibleFinishes.length > 0 && <div className="max-h-32 overflow-y-auto space-y-2">{compatibleFinishes.map(f => <label key={f.id} className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={selectedFinishes.includes(f.id)} onChange={e => setSelectedFinishes(old => e.target.checked ? [...old, f.id] : old.filter(id => id !== f.id))} />{f.name}</label>)}</div>}
            <label className="block text-xs font-semibold text-slate-600">Quantidades específicas (opcional)<input className={`${inputClass} mt-1`} value={quantitiesText} onChange={e => setQuantitiesText(e.target.value)} placeholder="Ex.: 100, 250, 500" /></label>
            <p className="text-xs text-slate-500">Em branco: simula 1, 2, 4, 8, 15 e 30 blocos completos. Os preços e descontos seguem o serviço selecionado.</p>
            <label className="block text-xs font-semibold text-slate-600">Validade da proposta (horas)<input type="number" min="1" max="8760" step="1" className={`${inputClass} mt-1`} value={Number.isFinite(validityHours) ? validityHours : ''} onChange={e => setValidityHours(e.target.value === '' ? NaN : Number(e.target.value))} /></label>
            <button type="button" onClick={simulate} disabled={busy || !material} className="w-full rounded-lg bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 text-white font-bold px-4 py-3">{busy ? 'Calculando…' : 'Calcular quantidades e valores'}</button>
            {error && <p role="alert" className="text-sm text-red-700 bg-red-50 rounded-lg p-3">{error}</p>}
          </section>
        </div>
        <div className="space-y-4 min-w-0">
          {!result && <div className="bg-white border border-dashed border-slate-300 rounded-xl p-10 text-center text-slate-500"><Calculator size={40} className="mx-auto mb-3 text-emerald-600" /><h3 className="font-bold text-slate-800">Quanto cabe nessa área?</h3><p className="text-sm mt-2">Preencha as medidas e clique em calcular para ver o encaixe, as quantidades e os preços.</p></div>}
          {result && snapshot && <>
            <section className="bg-white border border-slate-200 rounded-xl p-4">
              <div className="flex flex-wrap justify-between gap-2"><h3 className="font-bold text-slate-900">{number.format(result.layout.capacity)} peças por {mode === 'ROLL' ? 'bloco' : 'folha/chapa'}</h3><span className="text-xs text-slate-500">{result.layout.columns} colunas × {result.layout.rows} fileiras{result.layout.rotated ? ' · Arte girada' : ''}</span></div>
              <svg role="img" aria-label={`Encaixe com ${result.layout.columns} colunas e ${result.layout.rows} fileiras`} viewBox={`0 0 ${areaWidth} ${areaHeight}`} className="w-full h-52 mt-3 rounded-lg border border-slate-200 bg-slate-100" preserveAspectRatio="xMidYMid meet">
                <defs><pattern id={patternId} patternUnits="userSpaceOnUse" x={margin} y={margin} width={result.layout.pieceWidthCm + gap} height={result.layout.pieceHeightCm + gap}><rect width={result.layout.pieceWidthCm} height={result.layout.pieceHeightCm} rx={Math.min(width, height) * 0.04} fill="#a7f3d0" stroke="#047857" strokeWidth={Math.min(width, height) * 0.02} /></pattern></defs>
                <rect width={areaWidth} height={areaHeight} fill="#f1f5f9" /><rect x={margin} y={margin} width={result.layout.occupiedWidthCm} height={result.layout.occupiedHeightCm} fill={`url(#${patternId})`} />
              </svg>
              <p className="text-xs text-slate-500 mt-2">Encaixe em grade, comparando a arte normal e girada. Não mistura orientações na mesma área.</p>
              <p className="text-xs text-slate-700 mt-2">Preço cadastrado: <strong>{formatCurrency(snapshot.rate)} / {snapshot.pricingUnit === 'M2' ? 'm²' : snapshot.pricingUnit === 'SHEET' ? 'folha/chapa' : 'metro linear'}</strong>{service?.minimumCharge > 0 ? ` · Mínimo: ${formatCurrency(service.minimumCharge)}` : ''}</p>
            </section>
            <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-slate-100 text-slate-600 text-xs"><tr><th className="p-3 text-left">Quantidade</th><th className="p-3 text-right">Unitário</th><th className="p-3 text-right">Total</th><th className="p-3" /></tr></thead><tbody>{result.options.map(opt => <tr key={opt.quantity} className={`border-t border-slate-100 ${opt.quantity === result.lowestUnitPriceQuantity ? 'bg-emerald-50' : ''}`}><td className="p-3"><strong>{number.format(opt.quantity)} un.</strong>{opt.quantity === result.lowestUnitPriceQuantity && <div className="text-[10px] font-bold text-emerald-700 mt-1">MENOR VALOR POR UNIDADE</div>}<div className="text-xs text-slate-500 mt-1">{mode === 'SHEET' ? `${opt.item.simulationSnapshot!.blocks} folhas/chapas` : `${number.format(opt.item.simulationSnapshot!.usedLengthM)} m lineares`}{opt.item.simulationSnapshot!.minimumChargeApplied ? ' · Mínimo aplicado' : ''}</div></td><td className="p-3 text-right whitespace-nowrap">{formatCurrency(opt.unitPrice)}</td><td className="p-3 text-right whitespace-nowrap"><strong>{formatCurrency(opt.total)}</strong>{opt.saving > 0 && <div className="text-xs text-emerald-700 mt-1">Economia: {number.format(opt.savingPercentage)}%</div>}</td><td className="p-3"><button type="button" onClick={() => Number.isInteger(validityHours) && validityHours > 0 && validityHours <= 8760 ? onChoose(opt.item, validityHours) : setError('Informe uma validade válida.')} className="text-xs font-bold text-emerald-800 bg-emerald-100 hover:bg-emerald-200 px-3 py-2 rounded-lg">Usar no orçamento</button></td></tr>)}</tbody></table></div>
              <p className="p-3 text-xs text-slate-500 border-t border-slate-100">Economia comparada ao valor unitário da menor quantidade. O unitário é arredondado para exibição; o total vem do cálculo completo. Arte, instalação e entrega podem ser acrescentadas no orçamento.</p>
            </section>
            <section className="rounded-xl overflow-hidden border border-emerald-800">
              <div className="flex justify-between items-center gap-2 bg-emerald-900 text-white px-4 py-3"><h3 className="font-bold text-sm">Mensagem para o cliente</h3><button type="button" onClick={copy} disabled={!Number.isInteger(validityHours) || validityHours < 1 || validityHours > 8760} className="flex items-center gap-1 text-xs rounded px-3 py-2 bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50">{copyStatus === 'Mensagem copiada!' ? <Check size={14} /> : <Copy size={14} />} Copiar mensagem</button></div>
              <textarea aria-label="Mensagem da simulação" readOnly value={message} className="block w-full min-h-[450px] resize-y bg-[#154f3d] text-white p-4 text-sm leading-relaxed outline-none" />
              {copyStatus && <p role="status" className="text-xs p-3 bg-emerald-50 text-emerald-800">{copyStatus}</p>}
            </section>
          </>}
        </div>
      </div>
    </div>
  </div>;
}

