import React from 'react';
import { X, Check, ArrowRight, Sparkles, AlertCircle } from 'lucide-react';
import { RollDiagramSVG } from './RollDiagramSVG';
import { EvaluatedRollOption, AllowancesConfig } from '../types';
import { formatCurrency } from '../utils/formatters';

interface OrientationComparisonModalProps {
  isOpen: boolean;
  onClose: () => void;
  finishedWidthCm: number;
  finishedHeightCm: number;
  quantity: number;
  allowances: AllowancesConfig;
  allOptions: EvaluatedRollOption[];
  currentOrientation: 'HORIZONTAL' | 'VERTICAL' | 'AUTO';
  materialName?: string;
  pricePerSqm?: number;
  onSelectOrientation: (orientation: 'HORIZONTAL' | 'VERTICAL', rollWidthCm?: number) => void;
}

export const OrientationComparisonModal: React.FC<OrientationComparisonModalProps> = ({
  isOpen,
  onClose,
  finishedWidthCm,
  finishedHeightCm,
  quantity,
  allowances,
  allOptions,
  currentOrientation,
  materialName = 'Lona / Vinil',
  pricePerSqm = 50,
  onSelectOrientation
}) => {
  if (!isOpen) return null;

  // Filter options for HORIZONTAL and VERTICAL
  const horizontalOptions = allOptions.filter((o) => o.orientation === 'HORIZONTAL' && o.fits);
  const verticalOptions = allOptions.filter((o) => o.orientation === 'VERTICAL' && o.fits);

  // Best option for each orientation
  const bestHorizontal = horizontalOptions.sort((a, b) => a.finalPrice - b.finalPrice || a.wastePercentage - b.wastePercentage)[0];
  const bestVertical = verticalOptions.sort((a, b) => a.finalPrice - b.finalPrice || a.wastePercentage - b.wastePercentage)[0];

  // System recommended overall
  const recommendedOverall = allOptions.find((o) => o.tags.includes('RECOMENDADA')) || bestHorizontal || bestVertical;

  return (
    <div className="nagano-overlay fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-sm overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl max-w-5xl w-full max-h-[92vh] flex flex-col overflow-hidden border border-slate-200 text-slate-800">
        {/* MODAL HEADER */}
        <div className="p-4 sm:p-5 bg-slate-900 text-white flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-indigo-600/30 text-indigo-400 rounded-xl border border-indigo-500/30">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-lg text-white">Comparar Posições de Impressão</h3>
              <p className="text-xs text-slate-400">
                Análise comparativa entre Posição Horizontal vs. Posição Vertical (Arte: {finishedWidthCm} × {finishedHeightCm} cm)
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white bg-slate-800 rounded-lg transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* MODAL BODY: SIDE BY SIDE COMPARISON */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-6 bg-slate-50">
          {/* COMPARISON ECONOMY BANNER */}
          {bestHorizontal && bestVertical && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex flex-wrap items-center justify-between gap-2 text-xs text-emerald-950">
              <div className="flex items-center space-x-2">
                <Sparkles className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>
                  <strong>Comparativo Comercial:</strong> Posição{' '}
                  {bestHorizontal.finalPrice <= bestVertical.finalPrice ? 'Horizontal' : 'Vertical'} é mais econômica.
                </span>
              </div>
              <div className="font-mono text-xxs bg-emerald-100 text-emerald-900 px-2 py-1 rounded-lg border border-emerald-300 font-bold">
                Economia: {Math.abs(bestHorizontal.linearMetersNeeded - bestVertical.linearMetersNeeded).toFixed(2)}m linear (
                {formatCurrency(Math.abs(bestHorizontal.finalPrice - bestVertical.finalPrice))})
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* OPTION A: HORIZONTAL ORIENTATION */}
            <div
              className={`bg-white rounded-2xl p-4 border-2 transition shadow-sm space-y-4 flex flex-col justify-between ${
                currentOrientation === 'HORIZONTAL'
                  ? 'border-indigo-600 ring-2 ring-indigo-600/20'
                  : 'border-slate-200 hover:border-slate-300'
              }`}
            >
              <div className="space-y-3">
                <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                  <div className="flex items-center space-x-2">
                    <span className="w-3 h-3 rounded-full bg-indigo-600" />
                    <h4 className="font-bold text-sm text-slate-900">Posição Horizontal (Sem Rotação)</h4>
                  </div>
                  {recommendedOverall && bestHorizontal && recommendedOverall === bestHorizontal && (
                    <span className="bg-emerald-100 text-emerald-800 text-xxs font-bold px-2 py-0.5 rounded-full uppercase">
                      ★ Sugestão do Sistema
                    </span>
                  )}
                </div>

                {bestHorizontal ? (
                  <>
                    <RollDiagramSVG
                      rollWidthCm={bestHorizontal.rollWidthCm}
                      usableRollWidthCm={bestHorizontal.usableRollWidthCm}
                      finishedWidthCm={finishedWidthCm}
                      finishedHeightCm={finishedHeightCm}
                      productionWidthCm={bestHorizontal.productionWidthCm}
                      productionHeightCm={bestHorizontal.productionHeightCm}
                      orientation="HORIZONTAL"
                      quantity={quantity}
                      unitsAcross={bestHorizontal.unitsAcross}
                      rowsNeeded={bestHorizontal.rowsNeeded}
                      linearMetersNeeded={bestHorizontal.linearMetersNeeded}
                      wastePercentage={bestHorizontal.wastePercentage}
                      allowances={{
                        reinforcementCm: allowances.reinforcementCm,
                        hemCm: allowances.hemCm,
                        rodPocketCm: allowances.rodPocketCm,
                        bleedCm: allowances.bleedCm,
                        edgeSafetyCm: allowances.edgeSafetyCm
                      }}
                      materialName={materialName}
                      rollName={bestHorizontal.rollName}
                    />

                    <div className="grid grid-cols-2 gap-2 font-mono text-xs text-slate-700 bg-slate-50 p-3 rounded-xl border border-slate-200">
                      <div>
                        <span className="text-slate-500 font-sans text-xxs block">Bobina Selecionada:</span>
                        <strong className="text-slate-900 text-sm">{bestHorizontal.rollWidthCm} cm</strong>
                      </div>

                      <div>
                        <span className="text-slate-500 font-sans text-xxs block">Consumo Linear:</span>
                        <strong className="text-slate-900 text-sm">{bestHorizontal.linearMetersNeeded.toFixed(2)} m</strong>
                      </div>

                      <div>
                        <span className="text-slate-500 font-sans text-xxs block">Área Cobrada:</span>
                        <strong className="text-slate-900 text-sm">
                          {(bestHorizontal.billableAreaM2 || ((bestHorizontal.billableWidthCm || bestHorizontal.rollWidthCm) / 100 * bestHorizontal.linearMetersNeeded)).toFixed(2)} m²
                        </strong>
                      </div>

                      <div>
                        <span className="text-slate-500 font-sans text-xxs block">Desperdício:</span>
                        <strong
                          className={
                            bestHorizontal.wastePercentage > 20 ? 'text-rose-600 font-bold' : 'text-emerald-700 font-bold'
                          }
                        >
                          {bestHorizontal.wastePercentage.toFixed(1)}%
                        </strong>
                      </div>

                      <div className="col-span-2 border-t border-slate-200 pt-2 flex items-center justify-between font-sans">
                        <span className="text-slate-600 text-xs font-medium">Valor Total Calculado:</span>
                        <strong className="text-indigo-900 text-base font-bold font-mono">
                          {formatCurrency(bestHorizontal.finalPrice)}
                        </strong>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="p-6 bg-rose-50 border border-rose-200 rounded-xl text-center space-y-2 text-rose-800 text-xs">
                    <AlertCircle className="w-8 h-8 text-rose-500 mx-auto" />
                    <p className="font-bold">Arte Incompatível na Posição Horizontal</p>
                    <p className="text-xxs text-rose-700">
                      Nenhuma bobina cadastrada possui largura suficiente para a peça de {finishedWidthCm} cm na largura.
                    </p>
                  </div>
                )}
              </div>

              {bestHorizontal && (
                <button
                  type="button"
                  onClick={() => {
                    onSelectOrientation('HORIZONTAL', bestHorizontal.rollWidthCm);
                    onClose();
                  }}
                  className={`w-full py-2.5 px-4 rounded-xl font-bold text-xs flex items-center justify-center space-x-2 transition ${
                    currentOrientation === 'HORIZONTAL'
                      ? 'bg-indigo-600 text-white shadow-md'
                      : 'bg-slate-900 text-white hover:bg-indigo-700'
                  }`}
                >
                  <Check className="w-4 h-4" />
                  <span>
                    {currentOrientation === 'HORIZONTAL' ? 'Posição Atual Selecionada' : 'Usar Posição Horizontal'}
                  </span>
                </button>
              )}
            </div>

            {/* OPTION B: VERTICAL ORIENTATION (ROTATED 90 DEGREES) */}
            <div
              className={`bg-white rounded-2xl p-4 border-2 transition shadow-sm space-y-4 flex flex-col justify-between ${
                currentOrientation === 'VERTICAL'
                  ? 'border-indigo-600 ring-2 ring-indigo-600/20'
                  : 'border-slate-200 hover:border-slate-300'
              }`}
            >
              <div className="space-y-3">
                <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                  <div className="flex items-center space-x-2">
                    <span className="w-3 h-3 rounded-full bg-purple-600" />
                    <h4 className="font-bold text-sm text-slate-900">Posição Vertical (Rotacionada 90°)</h4>
                  </div>
                  {recommendedOverall && bestVertical && recommendedOverall === bestVertical && (
                    <span className="bg-emerald-100 text-emerald-800 text-xxs font-bold px-2 py-0.5 rounded-full uppercase">
                      ★ Sugestão do Sistema
                    </span>
                  )}
                </div>

                {bestVertical ? (
                  <>
                    <RollDiagramSVG
                      rollWidthCm={bestVertical.rollWidthCm}
                      usableRollWidthCm={bestVertical.usableRollWidthCm}
                      finishedWidthCm={finishedWidthCm}
                      finishedHeightCm={finishedHeightCm}
                      productionWidthCm={bestVertical.productionWidthCm}
                      productionHeightCm={bestVertical.productionHeightCm}
                      orientation="VERTICAL"
                      quantity={quantity}
                      unitsAcross={bestVertical.unitsAcross}
                      rowsNeeded={bestVertical.rowsNeeded}
                      linearMetersNeeded={bestVertical.linearMetersNeeded}
                      wastePercentage={bestVertical.wastePercentage}
                      allowances={{
                        reinforcementCm: allowances.reinforcementCm,
                        hemCm: allowances.hemCm,
                        rodPocketCm: allowances.rodPocketCm,
                        bleedCm: allowances.bleedCm,
                        edgeSafetyCm: allowances.edgeSafetyCm
                      }}
                      materialName={materialName}
                      rollName={bestVertical.rollName}
                    />

                    <div className="grid grid-cols-2 gap-2 font-mono text-xs text-slate-700 bg-slate-50 p-3 rounded-xl border border-slate-200">
                      <div>
                        <span className="text-slate-500 font-sans text-xxs block">Bobina Selecionada:</span>
                        <strong className="text-slate-900 text-sm">{bestVertical.rollWidthCm} cm</strong>
                      </div>

                      <div>
                        <span className="text-slate-500 font-sans text-xxs block">Consumo Linear:</span>
                        <strong className="text-slate-900 text-sm">{bestVertical.linearMetersNeeded.toFixed(2)} m</strong>
                      </div>

                      <div>
                        <span className="text-slate-500 font-sans text-xxs block">Área Cobrada:</span>
                        <strong className="text-slate-900 text-sm">
                          {(bestVertical.billableAreaM2 || ((bestVertical.billableWidthCm || bestVertical.rollWidthCm) / 100 * bestVertical.linearMetersNeeded)).toFixed(2)} m²
                        </strong>
                      </div>

                      <div>
                        <span className="text-slate-500 font-sans text-xxs block">Desperdício:</span>
                        <strong
                          className={
                            bestVertical.wastePercentage > 20 ? 'text-rose-600 font-bold' : 'text-emerald-700 font-bold'
                          }
                        >
                          {bestVertical.wastePercentage.toFixed(1)}%
                        </strong>
                      </div>

                      <div className="col-span-2 border-t border-slate-200 pt-2 flex items-center justify-between font-sans">
                        <span className="text-slate-600 text-xs font-medium">Valor Total Calculado:</span>
                        <strong className="text-indigo-900 text-base font-bold font-mono">
                          {formatCurrency(bestVertical.finalPrice)}
                        </strong>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="p-6 bg-rose-50 border border-rose-200 rounded-xl text-center space-y-2 text-rose-800 text-xs">
                    <AlertCircle className="w-8 h-8 text-rose-500 mx-auto" />
                    <p className="font-bold">Arte Incompatível na Posição Vertical</p>
                    <p className="text-xxs text-rose-700">
                      Nenhuma bobina cadastrada possui largura suficiente para a peça de {finishedHeightCm} cm na largura.
                    </p>
                  </div>
                )}
              </div>

              {bestVertical && (
                <button
                  type="button"
                  onClick={() => {
                    onSelectOrientation('VERTICAL', bestVertical.rollWidthCm);
                    onClose();
                  }}
                  className={`w-full py-2.5 px-4 rounded-xl font-bold text-xs flex items-center justify-center space-x-2 transition ${
                    currentOrientation === 'VERTICAL'
                      ? 'bg-indigo-600 text-white shadow-md'
                      : 'bg-slate-900 text-white hover:bg-indigo-700'
                  }`}
                >
                  <Check className="w-4 h-4" />
                  <span>
                    {currentOrientation === 'VERTICAL' ? 'Posição Atual Selecionada' : 'Usar Posição Vertical'}
                  </span>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* MODAL FOOTER */}
        <div className="p-4 bg-slate-100 border-t border-slate-200 flex items-center justify-between text-xs text-slate-600">
          <span>💡 Dica: O sistema calcula a melhor posição combinando menor desperdício e menor valor de produção.</span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-xl font-semibold transition"
          >
            Fechar Comparação
          </button>
        </div>
      </div>
    </div>
  );
};
