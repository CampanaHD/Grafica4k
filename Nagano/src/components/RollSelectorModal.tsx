import React, { useState } from 'react';
import {useAccess} from './AccessBoundary';
import {canViewCosts} from '../utils/profileAccess';
import { EvaluatedRollOption, CalculationSnapshot, RollOption } from '../types';
import { rollOptimizationService } from '../services/rollOptimizationService';
import { formatCurrency } from '../utils/formatters';
import { RollComparisonMatrix } from './RollComparisonMatrix';
import {
  X,
  Layers,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  Info,
  RotateCcw,
  Check,
  ShieldAlert,
  ArrowRight
} from 'lucide-react';

interface RollSelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  allOptions: EvaluatedRollOption[];
  recommendedSnapshot: CalculationSnapshot | null;
  selectedSnapshot?: CalculationSnapshot | null;
  onConfirmSelection: (selectedOption: EvaluatedRollOption, reason: string) => void;
  onRestoreAutomatic: () => void;
}

const PRESET_REASONS = [
  'Bobina já instalada na máquina de impressão',
  'Melhor disponibilidade em estoque físico',
  'Aproveitamento de retalho/sobra de produção',
  'Preferência da equipe técnica de produção',
  'Atender prazo com bobina pronta para uso',
  'Solicitação expressa do cliente/gerência'
];

export const RollSelectorModal: React.FC<RollSelectorModalProps> = ({
  isOpen,
  onClose,
  allOptions,
  recommendedSnapshot,
  selectedSnapshot,
  onConfirmSelection,
  onRestoreAutomatic
}) => {
  const costs=canViewCosts(useAccess().profile);
  const [viewMode, setViewMode] = useState<'CARDS' | 'MATRIX'>('CARDS');
  const [activeTab, setActiveTab] = useState<'COMPATIBLE' | 'INCOMPATIBLE'>('COMPATIBLE');
  const [selectedOptionForOverride, setSelectedOptionForOverride] = useState<EvaluatedRollOption | null>(null);
  const [reason, setReason] = useState('');
  const [customReason, setCustomReason] = useState('');
  const [validationError, setValidationError] = useState('');

  if (!isOpen) return null;

  const compatibleOptions = allOptions.filter((o) => o.fits);
  const incompatibleOptions = allOptions.filter((o) => !o.fits);

  const activeRollWidth = selectedSnapshot?.selectedRollWidthCm || recommendedSnapshot?.recommendedRollWidthCm;
  const isManualActive = !!selectedSnapshot?.isManualSelection;

  const handleOpenOverrideConfirm = (opt: EvaluatedRollOption) => {
    setValidationError('');
    setReason(PRESET_REASONS[0]);
    setCustomReason('');
    setSelectedOptionForOverride(opt);
  };

  const handleConfirmSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOptionForOverride) return;

    const finalReasonText = reason === 'OUTRO' ? customReason.trim() : reason;

    const validation = rollOptimizationService.validateOverride(selectedOptionForOverride, finalReasonText);
    if (!validation.valid) {
      setValidationError(validation.error || 'Erro na validação do motivo.');
      return;
    }

    onConfirmSelection(selectedOptionForOverride, finalReasonText);
    setSelectedOptionForOverride(null);
    onClose();
  };

  return (
    <div className="nagano-overlay fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl max-w-5xl w-full p-6 space-y-5 my-6 max-h-[92vh] overflow-y-auto border border-slate-200">
        {/* MODAL HEADER */}
        <div className="flex items-center justify-between border-b border-slate-200 pb-3">
          <div>
            <h2 className="text-base font-bold text-slate-900 uppercase tracking-tight flex items-center space-x-2">
              <Layers className="w-5 h-5 text-indigo-600" />
              <span>Seleção Manual de Bobina & Comparador Técnico</span>
            </h2>
            <p className="text-xs text-slate-500">
              Analise consumo, perda e custos de cada largura de bobina para escolher a melhor opção.
            </p>
          </div>

          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* STATUS BAR & ACTIONS */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-3 bg-slate-50 rounded-xl border border-slate-200">
          <div className="text-xs">
            {isManualActive ? (
              <div className="flex items-center space-x-2 text-indigo-900 font-semibold">
                <span className="bg-amber-100 text-amber-900 px-2 py-0.5 rounded font-bold text-xxs uppercase">
                  Seleção Manual Ativa
                </span>
                <span>
                  Usando Bobina de <strong>{selectedSnapshot?.selectedRollWidthCm} cm</strong> ({selectedSnapshot?.orientation}). Motivo: "{selectedSnapshot?.manualSelectionReason}"
                </span>
              </div>
            ) : (
              <div className="flex items-center space-x-2 text-emerald-900 font-semibold">
                <span className="bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded font-bold text-xxs uppercase">
                  Sugestão Automática do Sistema
                </span>
                <span>
                  Bobina Recomendada: <strong>{recommendedSnapshot?.recommendedRollWidthCm} cm</strong> ({recommendedSnapshot?.orientation})
                </span>
              </div>
            )}
          </div>

          <div className="flex items-center space-x-2 w-full sm:w-auto justify-end">
            {isManualActive && (
              <button
                type="button"
                onClick={() => {
                  onRestoreAutomatic();
                  onClose();
                }}
                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition flex items-center space-x-1.5 shadow-xs"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Restaurar Sugestão Automática</span>
              </button>
            )}

            <div className="inline-flex rounded-lg border border-slate-300 p-0.5 bg-white text-xs">
              <button
                type="button"
                onClick={() => setViewMode('CARDS')}
                className={`px-3 py-1 rounded-md font-bold transition ${
                  viewMode === 'CARDS' ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Cards
              </button>
              <button
                type="button"
                onClick={() => setViewMode('MATRIX')}
                className={`px-3 py-1 rounded-md font-bold transition ${
                  viewMode === 'MATRIX' ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Tabela Matriz
              </button>
            </div>
          </div>
        </div>

        {/* TAB NAVIGATION: COMPATIBLE VS INCOMPATIBLE */}
        <div className="flex border-b border-slate-200 text-xs">
          <button
            type="button"
            onClick={() => setActiveTab('COMPATIBLE')}
            className={`py-2 px-4 font-bold border-b-2 transition flex items-center space-x-2 ${
              activeTab === 'COMPATIBLE'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            <span>Bobinas Compatíveis ({compatibleOptions.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('INCOMPATIBLE')}
            className={`py-2 px-4 font-bold border-b-2 transition flex items-center space-x-2 ${
              activeTab === 'INCOMPATIBLE'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            <AlertTriangle className="w-4 h-4 text-rose-500" />
            <span>Bobinas Incompatíveis ({incompatibleOptions.length})</span>
          </button>
        </div>

        {/* CONTENT AREA */}
        {activeTab === 'COMPATIBLE' && (
          viewMode === 'MATRIX' ? (
            <RollComparisonMatrix showCosts={costs}
              allOptions={allOptions}
              recommendedSnapshot={recommendedSnapshot}
              selectedSnapshot={selectedSnapshot}
              onSelectRoll={handleOpenOverrideConfirm}
            />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {compatibleOptions.map((opt, i) => {
                const isRecommended = opt.tags.includes('RECOMENDADA');
                const isSelected = activeRollWidth === opt.rollWidthCm && (selectedSnapshot ? selectedSnapshot.orientation === opt.orientation : recommendedSnapshot?.orientation === opt.orientation);
                const isWasteHigh = opt.wastePercentage > 20;

                return (
                  <div
                    key={`${opt.rollWidthCm}_${opt.orientation}_${i}`}
                    className={`rounded-2xl p-4 border transition flex flex-col justify-between space-y-3 relative ${
                      isSelected
                        ? 'border-2 border-indigo-600 bg-indigo-50/40 shadow-md ring-2 ring-indigo-500/20'
                        : isRecommended
                        ? 'border-2 border-emerald-500 bg-emerald-50/30 shadow-sm'
                        : 'border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm'
                    }`}
                  >
                    {/* CARD TOP TAGS */}
                    <div className="flex items-start justify-between">
                      <div>
                        <span className="text-xxs text-slate-400 font-bold uppercase tracking-wider block">
                          Largura de Bobina
                        </span>
                        <h3 className="text-lg font-black font-mono text-slate-900">
                          {opt.rollWidthCm} cm{' '}
                          <span className="text-xs font-sans font-normal text-slate-500">
                            ({opt.orientation})
                          </span>
                        </h3>
                      </div>

                      <div className="flex flex-col items-end space-y-1">
                        {isRecommended && (
                          <span className="bg-emerald-600 text-white text-xxs font-bold px-2 py-0.5 rounded-full flex items-center space-x-1 shadow-xs">
                            <Sparkles className="w-3 h-3" />
                            <span>Recomendada</span>
                          </span>
                        )}
                        {isSelected && !isRecommended && (
                          <span className="bg-indigo-600 text-white text-xxs font-bold px-2 py-0.5 rounded-full flex items-center space-x-1">
                            <Check className="w-3 h-3" />
                            <span>Selecionada</span>
                          </span>
                        )}
                      </div>
                    </div>

                    {/* METRICS GRID */}
                    <div className="grid grid-cols-2 gap-2 text-xxs font-mono bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                      <div>
                        <span className="text-slate-400 block font-sans">Encaixe</span>
                        <strong className="text-slate-800 text-xs">{opt.unitsAcross} un / fila</strong>
                      </div>
                      <div>
                        <span className="text-slate-400 block font-sans">Filas</span>
                        <strong className="text-slate-800 text-xs">{opt.rowsNeeded} fila(s)</strong>
                      </div>
                      <div>
                        <span className="text-slate-400 block font-sans">Metros Lineares</span>
                        <strong className="text-slate-800 text-xs">{opt.linearMetersNeeded.toFixed(2)} m</strong>
                      </div>
                      <div>
                        <span className="text-slate-400 block font-sans">Desperdício</span>
                        <strong
                          className={`text-xs ${
                            opt.wastePercentage <= 10
                              ? 'text-emerald-700'
                              : opt.wastePercentage <= 20
                              ? 'text-amber-700'
                              : 'text-rose-700 font-bold'
                          }`}
                        >
                          {opt.wastePercentage.toFixed(1)}%
                        </strong>
                      </div>
                    </div>

                    {/* FINANCIAL & DIFFERENCE */}
                    <div className="space-y-1 pt-1 border-t border-slate-100">
                      {costs&&<div className="flex justify-between items-baseline text-xs">
                        <span className="text-slate-500">Custo da bobina (referência):</span>
                        <span className="font-mono text-slate-800 font-bold">{formatCurrency(opt.materialCost)}</span>
                      </div>}
                      <div className="flex justify-between items-baseline text-sm">
                        <span className="font-bold text-slate-700">Valor Final:</span>
                        <span className="font-mono font-black text-indigo-950 text-base">
                          {formatCurrency(opt.finalPrice)}
                        </span>
                      </div>

                      {opt.priceDifferenceVsRecommended !== 0 && (
                        <div className="text-xxs text-right font-mono font-bold">
                          {opt.priceDifferenceVsRecommended > 0 ? (
                            <span className="text-rose-600">+ {formatCurrency(opt.priceDifferenceVsRecommended)} vs recomendada</span>
                          ) : (
                            <span className="text-emerald-600">- {formatCurrency(Math.abs(opt.priceDifferenceVsRecommended))} vs recomendada</span>
                          )}
                        </div>
                      )}
                    </div>

                    {/* CARD ACTION */}
                    <div>
                      {isSelected ? (
                        <div className="w-full text-center py-2 bg-indigo-100 text-indigo-900 font-bold rounded-xl text-xs flex items-center justify-center space-x-1.5">
                          <CheckCircle2 className="w-4 h-4 text-indigo-600" />
                          <span>Bobina Atual em Uso</span>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleOpenOverrideConfirm(opt)}
                          className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-xs shadow-xs transition flex items-center justify-center space-x-1.5"
                        >
                          <span>Selecionar esta Bobina</span>
                          <ArrowRight className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )
        )}

        {/* INCOMPATIBLE ROLLS TAB */}
        {activeTab === 'INCOMPATIBLE' && (
          <div className="space-y-3">
            <p className="text-xs text-slate-600">
              As bobinas abaixo foram avaliadas mas <strong>rejeitadas pelo sistema</strong> por não possuírem largura útil suficiente para acomodar a medida do trabalho com as folgas e reforços cadastrados.
            </p>

            <div className="space-y-2">
              {incompatibleOptions.map((opt, i) => (
                <div
                  key={i}
                  className="p-3 bg-rose-50/70 border border-rose-200 rounded-xl flex items-start space-x-3 text-xs"
                >
                  <ShieldAlert className="w-5 h-5 text-rose-600 flex-shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <strong className="text-rose-950 font-bold font-mono text-sm block">
                      Bobina de {opt.rollWidthCm} cm ({opt.orientation})
                    </strong>
                    <p className="text-rose-800 font-medium">
                      {opt.rejectionReason || 'Medida final excede a largura útil da bobina.'}
                    </p>
                  </div>
                </div>
              ))}

              {incompatibleOptions.length === 0 && (
                <div className="p-6 text-center text-slate-400 text-xs">
                  Todas as bobinas ativas cadastradas comportam esta medida.
                </div>
              )}
            </div>
          </div>
        )}

        {/* FOOTER */}
        <div className="flex justify-end pt-3 border-t border-slate-200">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 border border-slate-300 rounded-xl text-slate-700 font-bold text-xs hover:bg-slate-50"
          >
            Fechar
          </button>
        </div>
      </div>

      {/* OVERRIDE JUSTIFICATION / REASON MODAL */}
      {selectedOptionForOverride && (
        <div className="nagano-overlay fixed inset-0 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4 z-60">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-4 border border-slate-200">
            <div className="nagano-dialog-heading flex items-center justify-between border-b pb-3">
              <h3 className="font-bold text-slate-900 text-sm flex items-center space-x-2">
                <AlertTriangle className="w-5 h-5 text-amber-500" />
                <span>Confirmar Seleção Manual de Bobina</span>
              </h3>
              <button
                onClick={() => setSelectedOptionForOverride(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-600">
              Você está selecionando a bobina de <strong>{selectedOptionForOverride.rollWidthCm} cm</strong> ({selectedOptionForOverride.orientation}), divergindo da recomendação automática do sistema (<strong>{recommendedSnapshot?.recommendedRollWidthCm} cm</strong>).
            </p>

            {/* HIGH WASTE ALERT */}
            {selectedOptionForOverride.wastePercentage > 20 && (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 flex items-start space-x-2">
                <ShieldAlert className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                <div>
                  <strong>Aviso de Perda Elevada ({selectedOptionForOverride.wastePercentage.toFixed(1)}%)</strong>
                  <p className="text-xxs text-amber-800 mt-0.5">
                    Esta opção gera um desperdício superior ao recomendado. Certifique-se de que a troca é necessária.
                  </p>
                </div>
              </div>
            )}

            <form onSubmit={handleConfirmSubmit} className="space-y-4 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Selecione o Motivo / Justificativa da Alteração *
                </label>
                <select
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg p-2 text-xs focus:ring-1 focus:ring-indigo-500 font-medium"
                  required
                >
                  {PRESET_REASONS.map((r, i) => (
                    <option key={i} value={r}>
                      {r}
                    </option>
                  ))}
                  <option value="OUTRO">Outro motivo (especificar abaixo)</option>
                </select>
              </div>

              {reason === 'OUTRO' && (
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Especifique a justificativa *</label>
                  <textarea
                    value={customReason}
                    onChange={(e) => setCustomReason(e.target.value)}
                    placeholder="Descreva detalhadamente o motivo técnico da escolha..."
                    className="w-full border border-slate-300 rounded-lg p-2 text-xs focus:ring-1 focus:ring-indigo-500"
                    rows={3}
                    required
                  />
                </div>
              )}

              {validationError && (
                <div className="p-2 bg-rose-100 text-rose-800 rounded text-xxs font-bold">
                  {validationError}
                </div>
              )}

              <div className="flex justify-end space-x-3 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setSelectedOptionForOverride(null)}
                  className="px-4 py-2 border border-slate-300 rounded-lg font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-bold shadow-sm"
                >
                  Confirmar e Recalcular
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
