import React from 'react';
import type { QuotationItem } from '../types';
import { formatCurrency } from '../utils/formatters';

export function SimulationPricingDetails({ item }: { item: QuotationItem }) {
  const snapshot = item.simulationSnapshot;
  if (!snapshot) return null;
  const { config, layout } = snapshot;
  const number = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 4 });
  const unit = snapshot.pricingUnit === 'M2' ? 'm²' : snapshot.pricingUnit === 'SHEET' ? 'folha/chapa' : 'metro linear';
  return <div className="bg-emerald-50 p-4 rounded-xl border border-emerald-200 space-y-2 text-emerald-950">
    <h4 className="font-bold">Cálculo por aproveitamento da área</h4>
    <p>Arte: {number.format(item.widthCm)} × {number.format(item.heightCm)} cm · {number.format(item.quantity)} unidades</p>
    <p>Área base: {number.format(config.areaWidthCm)} × {number.format(config.areaHeightCm)} cm ({snapshot.mode === 'ROLL' ? 'bloco de bobina' : 'folha/chapa'})</p>
    <p>Margem: {number.format(config.marginCm)} cm em cada borda · Espaço: {number.format(config.gapCm)} cm · Sangria: {number.format(config.bleedCm)} cm por lado</p>
    <p>Encaixe: {layout.columns} colunas × {layout.rows} fileiras = {number.format(layout.capacity)} peças por área{layout.rotated ? ' · Arte girada' : ''}</p>
    <p>Consumo: {snapshot.mode === 'SHEET' ? `${snapshot.blocks} folhas/chapas completas` : `${number.format(snapshot.usedLengthM)} metros lineares na largura de ${number.format(config.areaWidthCm)} cm`} · {number.format(snapshot.consumedAreaM2)} m²</p>
    <p>Preço cadastrado no cálculo: {formatCurrency(snapshot.rate)} / {unit}</p>
    {snapshot.volumeDiscountPercentage > 0 && <p>Faixa de desconto por área consumida: {number.format(snapshot.volumeDiscountPercentage)}%</p>}
    {snapshot.minimumChargeApplied && <p>Valor mínimo do material aplicado.</p>}
    <p className="font-bold pt-2 border-t border-emerald-200">Material após desconto/mínimo: {formatCurrency(item.baseValue)}</p>
  </div>;
}
