import React from 'react';
import { Material } from '../types';
import { normalizeWidthToMeters } from '../utils/materialValidation';

export function MaterialRulesFields({ material: m, onChange, commercial=true, showSizes=true }: { material: Material; onChange: (m: Material) => void; commercial?:boolean;showSizes?:boolean }) {
  const update = (patch: Partial<Material>) => onChange({ ...m, ...patch });
  const widths = m.allowedRollWidths ?? m.availableRolls.map(r => r.widthCm);
  const tiers = m.discountTiers ?? [];
  const inputClass = 'w-full border border-slate-300 rounded p-2';
  return <div className="space-y-3">
    <div className="grid grid-cols-2 gap-3">
      <label>Código interno<input className={inputClass} value={m.code ?? ''} onChange={e => update({ code: e.target.value })} /></label>
      <label>Status<select className={inputClass} value={String(m.active)} onChange={e => update({ active: e.target.value === 'true' })}><option value="true">Ativo</option><option value="false">Inativo</option></select></label>
      <label>Tipo de controle<select required className={inputClass} value={m.controlType ?? 'ROLL'} onChange={e => update({ controlType: e.target.value as Material['controlType'], calculationUnit: e.target.value === 'UNIT' ? 'UNIT' : 'M2' })}><option value="ROLL">Bobina</option><option value="SHEET">Chapa</option><option value="UNIT">Unidade</option></select></label>
      {commercial&&<label>Unidade de cálculo<select required className={inputClass} value={m.calculationUnit ?? 'M2'} onChange={e => update({ calculationUnit: e.target.value as Material['calculationUnit'] })}><option value="M2">m²</option><option value="UNIT">Unidade</option><option value="LINEAR_METER">Metro linear</option><option value="SHEET">Chapa</option></select></label>}
    </div>
    {(m.controlType ?? 'ROLL') === 'ROLL' && <fieldset className="border rounded p-3 space-y-3">
      <legend className="font-bold">Configuração da bobina</legend>
      {showSizes&&<><p>Larguras permitidas em metros. Este cadastro não cria bobinas em estoque.</p>
      <div className="grid grid-cols-3 gap-2">{widths.map((w, i) => <div key={i} className="flex gap-1">
        <input aria-label={`Largura ${i + 1} (m)`} className={inputClass} type="number" min="0.01" step="0.01" required value={normalizeWidthToMeters(w)} onChange={e => update({ allowedRollWidths: widths.map((v, j) => i === j ? Number(e.target.value) : v) })} />
        <button type="button" aria-label={`Remover largura ${i + 1}`} onClick={() => update({ allowedRollWidths: widths.filter((_, j) => j !== i) })}>×</button>
      </div>)}</div>
      <button type="button" className="text-indigo-700 font-bold" onClick={() => update({ allowedRollWidths: [...widths, 1.4] })}>+ Adicionar largura</button></>}
      {([
        ['allowRotation', 'Permitir girar a arte'],
        ['autoFindLowestCost', 'Buscar automaticamente a opção de menor valor'],
        ['allowManualRollOverride', 'Permitir troca manual da bobina'],
        ['volumeDiscountEnabled', 'Desconto automático por metragem'],
      ] as const).filter(([key])=>commercial||key!=='volumeDiscountEnabled').map(([key, label]) => <label key={key} className="flex items-center gap-2"><input type="checkbox" checked={m[key] ?? key !== 'volumeDiscountEnabled'} onChange={e => update({ [key]: e.target.checked })} />{label}</label>)}
      {commercial && m.volumeDiscountEnabled && <div className="space-y-2">
        <p>A maior faixa atingida será aplicada sobre a área da bobina × quantidade.</p>
        {tiers.map((tier, i) => <div key={tier.id} className="grid grid-cols-[1fr_1fr_auto] gap-2 items-end">
          <label>A partir de (m²)<input className={inputClass} type="number" min="0" step="0.01" required value={tier.minimumArea} onChange={e => update({ discountTiers: tiers.map((t, j) => i === j ? { ...t, minimumArea: Number(e.target.value) } : t) })} /></label>
          <label>Desconto (%)<input className={inputClass} type="number" min="0" max="100" step="0.01" required value={tier.percentage} onChange={e => update({ discountTiers: tiers.map((t, j) => i === j ? { ...t, percentage: Number(e.target.value) } : t) })} /></label>
          <button type="button" aria-label={`Remover faixa ${i + 1}`} onClick={() => update({ discountTiers: tiers.filter((_, j) => j !== i) })}>Remover</button>
        </div>)}
        <button type="button" className="text-indigo-700 font-bold" onClick={() => update({ discountTiers: [...tiers, { id: crypto.randomUUID(), minimumArea: 0, percentage: 0, active: true }] })}>+ Adicionar faixa</button>
      </div>}
    </fieldset>}
    {m.controlType==='SHEET'&&<label className="flex items-center gap-2"><input type="checkbox" checked={m.allowRotation??true} onChange={e=>update({allowRotation:e.target.checked})}/>Permitir girar as peças na chapa</label>}
  </div>;
}

