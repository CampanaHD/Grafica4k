import React from 'react';
import { EvaluatedRollOption, CalculationSnapshot } from '../types';
import { formatCurrency } from '../utils/formatters';
import { Check, AlertTriangle, XCircle, ArrowRight, ShieldAlert, Sparkles } from 'lucide-react';

interface RollComparisonMatrixProps {
  showCosts?: boolean;
  allOptions: EvaluatedRollOption[];
  recommendedSnapshot: CalculationSnapshot | null;
  selectedSnapshot?: CalculationSnapshot | null;
  onSelectRoll: (option: EvaluatedRollOption) => void;
}

export const RollComparisonMatrix: React.FC<RollComparisonMatrixProps> = ({
  showCosts=false,
  allOptions,
  recommendedSnapshot,
  selectedSnapshot,
  onSelectRoll
}) => {
  const activeRollWidth = selectedSnapshot?.selectedRollWidthCm || recommendedSnapshot?.recommendedRollWidthCm;
  const activeOrientation = selectedSnapshot?.orientation || recommendedSnapshot?.orientation;

  return (
    <div className="space-y-4 text-xs">
      <div className="flex items-center justify-between">
        <h4 className="font-bold text-slate-800 uppercase tracking-wider text-xxs flex items-center space-x-1.5">
          <Sparkles className="w-4 h-4 text-indigo-600" />
          <span>Matriz de Comparação Técnica de Bobinas</span>
        </h4>
        <span className="text-xxs text-slate-500 font-mono">
          {allOptions.filter(o => o.fits).length} compatíveis / {allOptions.length} avaliadas
        </span>
      </div>

      <div className="overflow-x-auto border border-slate-200 rounded-xl bg-white shadow-xs">
        <table className="w-full text-left text-slate-700">
          <thead className="bg-slate-50 border-b border-slate-200 uppercase text-xxs font-bold text-slate-500">
            <tr>
              <th className="p-3">Bobina & Orientação</th>
              <th className="p-3 text-center">Status</th>
              <th className="p-3 text-center">Encaixe</th>
              <th className="p-3 text-right">Consumo</th>
              <th className="p-3 text-right">Desperdício</th>
              {showCosts&&<th className="p-3 text-right">Custo da bobina (referência)</th>}
              <th className="p-3 text-right">Valor Final</th>
              <th className="p-3 text-right">Diferença</th>
              <th className="p-3 text-center">Ação</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 font-mono text-xs">
            {allOptions.map((opt, i) => {
              const isRecommended = opt.tags.includes('RECOMENDADA');
              const isSelected = activeRollWidth === opt.rollWidthCm && activeOrientation === opt.orientation;
              const isWasteHigh = opt.wastePercentage > 20;

              return (
                <tr
                  key={`${opt.rollWidthCm}_${opt.orientation}_${i}`}
                  className={`transition ${
                    isSelected
                      ? 'bg-indigo-50/80 font-bold border-l-4 border-l-indigo-600'
                      : isRecommended
                      ? 'bg-emerald-50/50'
                      : !opt.fits
                      ? 'bg-slate-50/60 opacity-60'
                      : 'hover:bg-slate-50'
                  }`}
                >
                  <td className="p-3 font-sans">
                    <div className="flex items-center space-x-2">
                      <strong className="text-slate-900 font-bold font-mono text-sm">
                        {opt.rollWidthCm} cm
                      </strong>
                      <span className="text-xxs text-slate-500 font-medium">({opt.orientation})</span>
                    </div>

                    <div className="flex flex-wrap gap-1 mt-1">
                      {isRecommended && (
                        <span className="bg-emerald-100 text-emerald-800 text-xxxs px-1.5 py-0.5 rounded font-bold uppercase">
                          ★ Recomendada
                        </span>
                      )}
                      {isSelected && !isRecommended && (
                        <span className="bg-indigo-100 text-indigo-900 text-xxxs px-1.5 py-0.5 rounded font-bold uppercase">
                          ✓ Selecionada
                        </span>
                      )}
                      {opt.tags.includes('MENOR_DESPERDICIO') && (
                        <span className="bg-blue-100 text-blue-800 text-xxxs px-1.5 py-0.5 rounded font-bold">
                          Menor Perda
                        </span>
                      )}
                      {opt.tags.includes('MENOR_CONSUMO_LINEAR') && (
                        <span className="bg-purple-100 text-purple-800 text-xxxs px-1.5 py-0.5 rounded font-bold">
                          Menor Metragem
                        </span>
                      )}
                      {opt.stockStatus === 'SEM_ESTOQUE' && (
                        <span className="bg-rose-100 text-rose-800 text-xxxs px-1.5 py-0.5 rounded font-bold">
                          Sem Estoque
                        </span>
                      )}
                    </div>
                  </td>

                  <td className="p-3 text-center font-sans">
                    {opt.fits ? (
                      <span className="inline-flex items-center text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full text-xxs font-semibold">
                        <Check className="w-3 h-3 mr-1" /> Compatível
                      </span>
                    ) : (
                      <span className="inline-flex items-center text-rose-700 bg-rose-50 px-2 py-0.5 rounded-full text-xxs font-semibold">
                        <XCircle className="w-3 h-3 mr-1" /> Incompatível
                      </span>
                    )}
                  </td>

                  <td className="p-3 text-center text-xxs">
                    {opt.fits ? (
                      <span>
                        {opt.unitsAcross} un / fila ({opt.rowsNeeded} fila{opt.rowsNeeded > 1 ? 's' : ''})
                      </span>
                    ) : (
                      <span className="text-rose-600 font-sans italic text-xxs">
                        Excede largura
                      </span>
                    )}
                  </td>

                  <td className="p-3 text-right">
                    {opt.fits ? `${opt.linearMetersNeeded.toFixed(2)} m` : '-'}
                  </td>

                  <td className="p-3 text-right">
                    {opt.fits ? (
                      <span
                        className={`inline-block px-1.5 py-0.5 rounded ${
                          opt.wastePercentage <= 10
                            ? 'text-emerald-800 bg-emerald-100'
                            : opt.wastePercentage <= 20
                            ? 'text-amber-800 bg-amber-100'
                            : 'text-rose-800 bg-rose-100 font-bold'
                        }`}
                      >
                        {opt.wastePercentage.toFixed(1)}%
                      </span>
                    ) : (
                      '-'
                    )}
                  </td>

                  {showCosts&&<td className="p-3 text-right">
                    {opt.fits ? formatCurrency(opt.materialCost) : '-'}
                  </td>}

                  <td className="p-3 text-right font-bold text-slate-900">
                    {opt.fits ? formatCurrency(opt.finalPrice) : '-'}
                  </td>

                  <td className="p-3 text-right text-xxs font-bold">
                    {opt.fits ? (
                      opt.priceDifferenceVsRecommended === 0 ? (
                        <span className="text-slate-400">0,00</span>
                      ) : opt.priceDifferenceVsRecommended > 0 ? (
                        <span className="text-rose-600">+ {formatCurrency(opt.priceDifferenceVsRecommended)}</span>
                      ) : (
                        <span className="text-emerald-600">- {formatCurrency(Math.abs(opt.priceDifferenceVsRecommended))}</span>
                      )
                    ) : (
                      '-'
                    )}
                  </td>

                  <td className="p-3 text-center font-sans">
                    {opt.fits ? (
                      isSelected ? (
                        <span className="text-indigo-600 text-xxs font-bold flex items-center justify-center">
                          <Check className="w-3.5 h-3.5 mr-1" /> Em uso
                        </span>
                      ) : (
                        <button
                          onClick={() => onSelectRoll(opt)}
                          className="px-2.5 py-1 bg-indigo-50 hover:bg-indigo-600 hover:text-white text-indigo-700 rounded text-xxs font-bold transition flex items-center justify-center mx-auto space-x-1"
                        >
                          <span>Escolher</span>
                          <ArrowRight className="w-3 h-3" />
                        </button>
                      )
                    ) : (
                      <span className="text-slate-400 text-xxs italic">Indisponível</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
