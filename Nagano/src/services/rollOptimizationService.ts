import {
  Quotation,
  RollOption,
  CalculationSnapshot,
  EvaluatedRollOption,
  RollOverrideAuditLog
} from '../types';
import { runCalculationEngine, CalculationInput } from '../utils/calculationEngine';

export interface RollComparisonResult {
  recommendedRollWidthCm: number;
  recommendedOrientation: 'HORIZONTAL' | 'VERTICAL';
  recommendedFinalPrice: number;
  recommendedWastePct: number;
  selectedRollWidthCm: number;
  selectedOrientation: 'HORIZONTAL' | 'VERTICAL';
  selectedFinalPrice: number;
  selectedWastePct: number;
  priceDifference: number; // positive means selected is more expensive
  wasteDifference: number; // positive means selected has more waste
  linearMeterDifference: number;
  explanation: string;
}

export const rollOptimizationService = {
  /**
   * Evaluates all active roll options for a material and given job dimensions.
   */
  evaluateOptions(input: CalculationInput) {
    return runCalculationEngine(input);
  },

  /**
   * Compares the recommended option against a selected option.
   */
  compareOptions(
    recommended: CalculationSnapshot,
    selected: CalculationSnapshot
  ): RollComparisonResult {
    const priceDiff = selected.finalPrice - recommended.finalPrice;
    const wasteDiff = selected.wastePercentage - recommended.wastePercentage;
    const linearDiff = selected.linearMetersNeeded - recommended.linearMetersNeeded;

    let explanation = '';
    if (priceDiff > 0) {
      explanation = `A bobina de ${selected.selectedRollWidthCm || selected.recommendedRollWidthCm} cm resulta em um acréscimo de R$ ${priceDiff.toFixed(2)} no valor final e +${wasteDiff.toFixed(1)}% de desperdício em relação à sugestão automática (${recommended.recommendedRollWidthCm} cm).`;
    } else if (priceDiff < 0) {
      explanation = `A bobina de ${selected.selectedRollWidthCm || selected.recommendedRollWidthCm} cm reduz o valor final em R$ ${Math.abs(priceDiff).toFixed(2)} em relação à sugestão automática (${recommended.recommendedRollWidthCm} cm).`;
    } else {
      explanation = `A bobina de ${selected.selectedRollWidthCm || selected.recommendedRollWidthCm} cm possui custo idêntico ao da bobina recomendada (${recommended.recommendedRollWidthCm} cm).`;
    }

    return {
      recommendedRollWidthCm: recommended.recommendedRollWidthCm,
      recommendedOrientation: recommended.orientation,
      recommendedFinalPrice: recommended.finalPrice,
      recommendedWastePct: recommended.wastePercentage,
      selectedRollWidthCm: selected.selectedRollWidthCm || selected.recommendedRollWidthCm,
      selectedOrientation: selected.orientation,
      selectedFinalPrice: selected.finalPrice,
      selectedWastePct: selected.wastePercentage,
      priceDifference: priceDiff,
      wasteDifference: wasteDiff,
      linearMeterDifference: linearDiff,
      explanation
    };
  },

  /**
   * Validates if a manual override is permitted and returns validation status and error messages.
   */
  validateOverride(
    targetOption: EvaluatedRollOption,
    reason: string
  ): { valid: boolean; error?: string; warning?: string } {
    if (!targetOption.fits) {
      return {
        valid: false,
        error: `Incompatível: ${targetOption.rejectionReason || 'Medida excede a largura útil da bobina.'}`
      };
    }

    if (!reason || reason.trim().length < 3) {
      return {
        valid: false,
        error: 'É obrigatório informar uma justificativa/motivo válido para a alteração manual da bobina.'
      };
    }

    let warning: string | undefined = undefined;
    if (targetOption.wastePercentage > 30) {
      warning = `Atenção: A bobina selecionada de ${targetOption.rollWidthCm} cm possui desperdício elevado de ${targetOption.wastePercentage.toFixed(1)}%. Deseja realmente prosseguir?`;
    } else if (targetOption.stockStatus === 'SEM_ESTOQUE') {
      warning = `Atenção: A bobina de ${targetOption.rollWidthCm} cm consta como sem estoque no sistema.`;
    }

    return { valid: true, warning };
  },

  /**
   * Builds an audit log record for a roll selection override.
   */
  createAuditLog(params: {
    quotationId?: string;
    itemId?: string;
    user: string;
    action: 'MANUAL_OVERRIDE' | 'RESTORE_AUTOMATIC';
    previousRollWidthCm: number;
    newRollWidthCm: number;
    previousOrientation: 'HORIZONTAL' | 'VERTICAL';
    newOrientation: 'HORIZONTAL' | 'VERTICAL';
    previousFinalPrice: number;
    newFinalPrice: number;
    previousWastePct: number;
    newWastePct: number;
    reason: string;
  }): RollOverrideAuditLog {
    return {
      id: `audit_roll_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      quotationId: params.quotationId,
      itemId: params.itemId,
      timestamp: new Date().toISOString(),
      user: params.user,
      action: params.action,
      previousRollWidthCm: params.previousRollWidthCm,
      newRollWidthCm: params.newRollWidthCm,
      previousOrientation: params.previousOrientation,
      newOrientation: params.newOrientation,
      previousFinalPrice: params.previousFinalPrice,
      newFinalPrice: params.newFinalPrice,
      previousWastePct: params.previousWastePct,
      newWastePct: params.newWastePct,
      reason: params.reason
    };
  }
};
