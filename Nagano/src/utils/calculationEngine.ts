import { AllowancesConfig, CalculationSnapshot, RollOption, EvaluatedRollOption, QuotationItem, QuotationItemFinishing, FinishOption, QuantityDiscountTier } from '../types';

export function calculateUnitPrice(referencePrice: number = 0, referenceQuantity: number = 1): number {
  if (!referenceQuantity || referenceQuantity <= 0) return 0;
  return (Number(referencePrice) || 0) / Number(referenceQuantity);
}

export function findApplicableDiscountTier(
  tiers: QuantityDiscountTier[] | undefined,
  requestedQuantity: number
): { tier: QuantityDiscountTier | null; suggestedDiscountPct: number } {
  if (!tiers || tiers.length === 0 || requestedQuantity <= 0) {
    return { tier: null, suggestedDiscountPct: 0 };
  }

  const eligibleTiers = tiers.filter(t => (t.active !== false) && t.minimumQuantity > 0 && t.minimumQuantity <= requestedQuantity);

  if (eligibleTiers.length === 0) {
    return { tier: null, suggestedDiscountPct: 0 };
  }

  const bestTier = eligibleTiers.reduce((prev, curr) => (curr.minimumQuantity > prev.minimumQuantity ? curr : prev));

  return {
    tier: bestTier,
    suggestedDiscountPct: Math.max(0, Math.min(100, Number(bestTier.discountPercentage) || 0))
  };
}

export function calculateItemFinishing(
  finishing: FinishOption,
  widthCm: number,
  heightCm: number,
  quantity: number,
  baseValue: number,
  priceSnapshot?: number
): QuotationItemFinishing {
  const unitPrice = priceSnapshot !== undefined ? priceSnapshot : (finishing.unitPrice ?? finishing.unitCost ?? 0);
  let subtotal = 0;

  const costType = finishing.costType;
  if (costType === 'FIXED') {
    subtotal = unitPrice;
  } else if (costType === 'PER_UNIT') {
    subtotal = quantity * unitPrice;
  } else if (costType === 'PER_METER') {
    const perimeterM = (2 * (widthCm + heightCm)) / 100.0;
    subtotal = perimeterM * quantity * unitPrice;
  } else if (costType === 'PER_SQM') {
    const areaM2 = (widthCm / 100.0) * (heightCm / 100.0);
    subtotal = areaM2 * quantity * unitPrice;
  } else if (costType === 'PERCENTAGE') {
    const pct = finishing.percentage || unitPrice || 0;
    subtotal = (baseValue * pct) / 100.0;
  } else {
    subtotal = quantity * unitPrice;
  }

  if (finishing.minimumCharge && subtotal < finishing.minimumCharge) {
    subtotal = finishing.minimumCharge;
  }

  return {
    id: `qif_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
    compositionVersion:finishing.components?.length?finishing.compositionVersion:undefined,
    finishingId: finishing.id,
    finishingName: finishing.name,
    costType,
    quantity,
    unitPriceSnapshot: unitPrice,
    minimumChargeSnapshot: finishing.minimumCharge ?? 0,
    subtotal: Math.round(subtotal * 100) / 100,
    notes: finishing.description
  };
}

export interface ItemDiscountResult {
  discountEffectiveAmount: number;
  subtotalAfterDiscount: number;
  isValid: boolean;
  errorMessage?: string;
}

export function calculateItemDiscount(
  subtotalBeforeDiscount: number,
  discountType: 'NONE' | 'PERCENTAGE' | 'FIXED_AMOUNT' = 'NONE',
  discountInputValue: number = 0
): ItemDiscountResult {
  const cleanSubtotal = Math.max(0, Math.round((subtotalBeforeDiscount || 0) * 100) / 100);
  const cleanValue = Math.max(0, Number(discountInputValue) || 0);

  if (discountType === 'PERCENTAGE') {
    if (cleanValue < 0 || cleanValue > 100) {
      return {
        discountEffectiveAmount: 0,
        subtotalAfterDiscount: cleanSubtotal,
        isValid: false,
        errorMessage: 'O desconto percentual deve estar entre 0% e 100%.'
      };
    }
    const effective = Math.round(((cleanSubtotal * cleanValue) / 100) * 100) / 100;
    const finalVal = Math.max(0, Math.round((cleanSubtotal - effective) * 100) / 100);
    return {
      discountEffectiveAmount: effective,
      subtotalAfterDiscount: finalVal,
      isValid: true
    };
  }

  if (discountType === 'FIXED_AMOUNT') {
    if (cleanValue < 0) {
      return {
        discountEffectiveAmount: 0,
        subtotalAfterDiscount: cleanSubtotal,
        isValid: false,
        errorMessage: 'O desconto não pode ser negativo.'
      };
    }
    if (cleanValue > cleanSubtotal) {
      return {
        discountEffectiveAmount: 0,
        subtotalAfterDiscount: cleanSubtotal,
        isValid: false,
        errorMessage: 'O desconto não pode ser maior que o subtotal do item.'
      };
    }
    const effective = Math.round(cleanValue * 100) / 100;
    const finalVal = Math.max(0, Math.round((cleanSubtotal - effective) * 100) / 100);
    return {
      discountEffectiveAmount: effective,
      subtotalAfterDiscount: finalVal,
      isValid: true
    };
  }

  return {
    discountEffectiveAmount: 0,
    subtotalAfterDiscount: cleanSubtotal,
    isValid: true
  };
}

export function calculateQuotationTotals(
  items: QuotationItem[],
  deliveryCost: number = 0,
  designCost: number = 0,
  installationCost: number = 0,
  extraCharges: number = 0,
  discountAmount: number = 0
) {
  const itemsSubtotalBeforeDiscount = items.reduce(
    (acc, item) => acc + (item.subtotalBeforeDiscount !== undefined ? item.subtotalBeforeDiscount : (item.subtotal || 0)),
    0
  );
  const itemsTotalDiscounts = items.reduce((acc, item) => acc + (item.discountEffectiveAmount || 0), 0);
  const itemsSubtotal = items.reduce((acc, item) => acc + (item.subtotal || 0), 0);

  const globalTotal = itemsSubtotal + deliveryCost + designCost + installationCost + extraCharges - discountAmount;
  return {
    itemsSubtotalBeforeDiscount: Math.round(itemsSubtotalBeforeDiscount * 100) / 100,
    itemsTotalDiscounts: Math.round(itemsTotalDiscounts * 100) / 100,
    subtotal: Math.round(itemsSubtotal * 100) / 100,
    totalAmount: Math.max(0, Math.round(globalTotal * 100) / 100)
  };
}

export interface CalculationInput {
  finishedWidthCm: number;
  finishedHeightCm: number;
  quantity: number;
  requestedOrientation: 'HORIZONTAL' | 'VERTICAL' | 'AUTO';
  allowances: AllowancesConfig;
  availableRolls: RollOption[];
  costPerSqm: number;
  pricePerSqm?: number;
  pricePerLinearMeter?: number;
  finishingCost: number;
  installationCost: number;
  designCost: number;
  deliveryCost: number;
  markupPercentage: number;
  discountAmount: number;
  minimumCharge: number;
  setupCharge: number;
  selectedRollWidthCm?: number;
  selectedOrientation?: 'HORIZONTAL' | 'VERTICAL';
  manualSelectionReason?: string;
  allowRotation?: boolean;
  autoFindLowestCost?: boolean;
  allowManualRollOverride?: boolean;
  volumeDiscountTiers?: any[];
  pricingMethod?: 'POR_AREA_CONSUMIDA_BOBINA' | 'POR_METRO_LINEAR' | 'ROLL' | 'AREA' | string;
  allowsSideBySideFit?: boolean;
}

export interface CalculationResponse {
  success: boolean;
  error?: string;
  recommended: CalculationSnapshot | null;
  recommendedSnapshot: CalculationSnapshot | null;
  selectedSnapshot: CalculationSnapshot | null;
  isManualSelection: boolean;
  manualSelectionReason?: string;
  allOptions: EvaluatedRollOption[];
}

export function calculateProductionDimensions(
  widthCm: number,
  heightCm: number,
  allowances?: AllowancesConfig
): { productionWidthCm: number; productionHeightCm: number; extraWidthCm: number; extraHeightCm: number } {
  if (!allowances) {
    return { productionWidthCm: widthCm, productionHeightCm: heightCm, extraWidthCm: 0, extraHeightCm: 0 };
  }

  const overflowVal = allowances.overflowValueCm ?? 0;
  const isPerSideSet = (
    allowances.overflowTop !== undefined ||
    allowances.overflowBottom !== undefined ||
    allowances.overflowLeft !== undefined ||
    allowances.overflowRight !== undefined
  );

  let leftCm = allowances.leftCm ?? (allowances as any).bleed_left_cm ?? 0;
  let rightCm = allowances.rightCm ?? (allowances as any).bleed_right_cm ?? 0;
  let topCm = allowances.topCm ?? (allowances as any).bleed_top_cm ?? 0;
  let bottomCm = allowances.bottomCm ?? (allowances as any).bleed_bottom_cm ?? 0;

  if (overflowVal > 0) {
    if (allowances.overflowLeft) leftCm = overflowVal;
    if (allowances.overflowRight) rightCm = overflowVal;
    if (allowances.overflowTop) topCm = overflowVal;
    if (allowances.overflowBottom) bottomCm = overflowVal;
  }

  let extraW = leftCm + rightCm;
  let extraH = topCm + bottomCm;

  if (extraW === 0 && extraH === 0 && !isPerSideSet) {
    const reinf = allowances.reinforcementCm ?? 0;
    const hem = allowances.hemCm ?? 0;
    const bleed = allowances.bleedCm ?? 0;
    const rod = allowances.rodPocketCm ?? 0;
    extraW = (reinf + hem + bleed) * 2;
    extraH = (reinf + hem + rod + bleed) * 2;
  }

  return {
    productionWidthCm: Math.round((widthCm + extraW) * 100) / 100,
    productionHeightCm: Math.round((heightCm + extraH) * 100) / 100,
    extraWidthCm: Math.round(extraW * 100) / 100,
    extraHeightCm: Math.round(extraH * 100) / 100
  };
}

export function formatOverflowSidesText(allowances?: AllowancesConfig): string {
  if (!allowances) return 'Sem estouro';
  const val = allowances.overflowValueCm ?? 0;
  const t = allowances.overflowTop ?? false;
  const b = allowances.overflowBottom ?? false;
  const l = allowances.overflowLeft ?? false;
  const r = allowances.overflowRight ?? false;

  if (val <= 0 || (!t && !b && !l && !r)) {
    return 'Sem estouro';
  }

  const activeSides: string[] = [];
  if (t) activeSides.push('Superior');
  if (b) activeSides.push('Inferior');
  if (l) activeSides.push('Esquerdo');
  if (r) activeSides.push('Direito');

  if (activeSides.length === 4) {
    return `Estouro: ${val} cm (Todos os lados)`;
  }
  return `Estouro: ${val} cm (${activeSides.join(', ')})`;
}

export function runCalculationEngine(input: CalculationInput): CalculationResponse {
  if (![input.quantity, input.finishedWidthCm, input.finishedHeightCm].every(v => Number.isFinite(v) && v > 0) || !Number.isInteger(input.quantity)
    || Object.values(input.allowances ?? {}).some(v => typeof v === 'number' && (!Number.isFinite(v) || v < 0))
    || [input.pricePerSqm, input.costPerSqm, input.minimumCharge].some(v => v !== undefined && (!Number.isFinite(v) || v < 0))) {
    return {
      success: false,
      error: 'Dimensões e quantidade devem ser maiores que zero.',
      recommended: null,
      recommendedSnapshot: null,
      selectedSnapshot: null,
      isManualSelection: false,
      allOptions: []
    };
  }

  const { productionWidthCm: prodHorizW, productionHeightCm: prodHorizH, extraWidthCm: extraW } = calculateProductionDimensions(
    input.finishedWidthCm,
    input.finishedHeightCm,
    input.allowances
  );

  const evaluatedRawOptions: any[] = [];

  let orientations: ('HORIZONTAL' | 'VERTICAL')[] = [];
  if (input.allowRotation === false || input.requestedOrientation === 'HORIZONTAL') {
    orientations = ['HORIZONTAL'];
  } else if (input.requestedOrientation === 'VERTICAL') {
    orientations = ['VERTICAL'];
  } else {
    orientations = ['HORIZONTAL', 'VERTICAL'];
  }

  for (const roll of input.availableRolls) {
    if (!roll.active || !Number.isFinite(roll.widthCm) || roll.widthCm <= 0) continue;

    const usableW = roll.usableWidthCm && roll.usableWidthCm > 0
      ? roll.usableWidthCm - (input.allowances.edgeSafetyCm ?? 0)
      : roll.widthCm - (input.allowances.edgeSafetyCm ?? 0);

    const stockQty = roll.stockQty ?? 9999;
    const isOutOfStock = stockQty <= 0;

    for (const orient of orientations) {
      let pieceW = prodHorizW;
      let pieceH = prodHorizH;

      if (orient === 'VERTICAL') {
        pieceW = prodHorizH;
        pieceH = prodHorizW;
      }

      if (pieceW > usableW) {
        const reason = `Largura de produção de ${pieceW.toFixed(1)} cm (com reforço/folgas de ${extraW.toFixed(1)} cm) excede a largura útil da bobina de ${usableW.toFixed(1)} cm (bobina total ${roll.widthCm} cm).`;
        evaluatedRawOptions.push({
          rollId: roll.id,
          rollName: roll.name || `Bobina ${roll.widthCm} cm`,
          rollWidthCm: roll.widthCm,
          usableRollWidthCm: usableW,
          orientation: orient,
          fits: false,
          rejectionReason: reason,
          productionWidthCm: pieceW,
          productionHeightCm: pieceH,
          unitsAcross: 0,
          rowsNeeded: 0,
          linearMetersNeeded: 0,
          totalSqmUsed: 0,
          netSqmPrinted: 0,
          wasteSqm: 0,
          wastePercentage: 0,
          materialCost: 0,
          finishingCost: 0,
          installationCost: 0,
          designCost: 0,
          deliveryCost: 0,
          setupCharge: 0,
          totalBaseCost: 0,
          subtotalPrice: 0,
          discountAmount: 0,
          finalPrice: 0,
          stockQty,
          stockStatus: roll.stockQty === undefined ? 'ALERTA' : isOutOfStock ? 'SEM_ESTOQUE' : 'DISPONIVEL',
          explanation: `Rejeitada: ${reason}`,
          areaPerUnitM2: 0,
          grossUnitPrice: 0,
          grossTotalPrice: 0,
          totalCalculatedAreaM2: 0,
          discountPercentage: 0,
          discountValue: 0,
          requiredWidthCm: pieceW,
          usedLengthCm: pieceH
        });
        continue;
      }

      const fullWidthPerPiece = input.pricingMethod === 'POR_AREA_CONSUMIDA_BOBINA' || input.pricingMethod === 'ROLL' || input.allowsSideBySideFit !== true;
      let unitsAcross = fullWidthPerPiece ? 1 : Math.floor(usableW / pieceW);
      if (unitsAcross <= 0) unitsAcross = 1;

      const rowsNeeded = Math.ceil(input.quantity / unitsAcross);
      const linearCm = rowsNeeded * pieceH;
      const linearMeters = linearCm / 100.0;

      const billableWidthCm = roll.widthCm;
      const billableWidthM = billableWidthCm / 100.0;
      const billableAreaM2 = billableWidthM * linearMeters;

      let totalSqmUsed = (roll.widthCm / 100.0) * linearMeters;
      const netSqmPrinted = (input.finishedWidthCm / 100.0) * (input.finishedHeightCm / 100.0) * input.quantity;
      const wasteSqm = Math.max(0, totalSqmUsed - netSqmPrinted);
      const wastePercentage = totalSqmUsed > 0 ? (wasteSqm / totalSqmUsed) * 100.0 : 0;

      const costSqm = roll.costPerSqm > 0 ? roll.costPerSqm : input.costPerSqm;
      const materialCost = totalSqmUsed * costSqm;

      const totalBaseCost = materialCost + input.finishingCost + input.installationCost + input.designCost + input.deliveryCost + input.setupCharge;

      const configuredPrice = input.pricePerSqm ?? roll.sellingPriceSqm ?? input.pricePerLinearMeter ?? roll.sellingPriceLinm ?? 80;
      const areaPerUnitM2 = (roll.widthCm / 100.0) * (pieceH / 100.0);
      const linearPricing = input.pricingMethod === 'POR_METRO_LINEAR';
      const grossUnitPrice = Math.round((linearPricing ? pieceH / 100 : areaPerUnitM2) * configuredPrice * 10000) / 10000;

      let printingPrice: number;
      let grossTotalPrice: number;
      let totalCalculatedAreaM2: number;

      if (fullWidthPerPiece) {
        totalCalculatedAreaM2 = Math.round(areaPerUnitM2 * input.quantity * 10000) / 10000;
        grossTotalPrice = Math.round(grossUnitPrice * input.quantity * 100) / 100;
        printingPrice = grossTotalPrice;
        totalSqmUsed = totalCalculatedAreaM2;
      } else {
        totalCalculatedAreaM2 = totalSqmUsed;
        printingPrice = (linearPricing ? linearMeters : billableWidthM * linearMeters) * configuredPrice;
        grossTotalPrice = printingPrice;
      }

      let calculatedPrice: number;
      if (configuredPrice >= 0) {
        calculatedPrice = printingPrice + input.finishingCost + input.installationCost + input.designCost + input.deliveryCost + input.setupCharge;
      } else {
        const markupMultiplier = 1.0 + (input.markupPercentage / 100.0);
        calculatedPrice = totalBaseCost * markupMultiplier;
      }

      // Volume discount calculation based on actual consumed roll area (totalSqmUsed)
      let appliedDiscountPct = 0;
      let discountFromTiers = 0;
      if (input.volumeDiscountTiers && input.volumeDiscountTiers.length > 0) {
        const eligible = input.volumeDiscountTiers.filter(
          t => {
            const minQ = Number((t as any).minimumQuantity ?? (t as any).minimumArea ?? (t as any).minimum_area ?? 0);
            return t.active !== false && Number.isFinite(minQ) && minQ >= 0 && totalSqmUsed + 1e-9 >= minQ;
          }
        );
        if (eligible.length > 0) {
          const bestTier = eligible.reduce((prev, curr) => {
            const minPrev = Number((prev as any).minimumQuantity ?? (prev as any).minimumArea ?? (prev as any).minimum_area ?? 0);
            const minCurr = Number((curr as any).minimumQuantity ?? (curr as any).minimumArea ?? (curr as any).minimum_area ?? 0);
            return minCurr > minPrev ? curr : prev;
          });
          appliedDiscountPct = Math.max(0, Math.min(100, Number((bestTier as any).discountPercentage ?? (bestTier as any).percentage) || 0));
          discountFromTiers = Math.round((grossTotalPrice * (appliedDiscountPct / 100.0)) * 100) / 100;
        }
      }

      const totalItemDiscount = Math.round((discountFromTiers + (input.discountAmount || 0)) * 100) / 100;

      let minimumChargeApplied = false;
      if (calculatedPrice < input.minimumCharge) {
        calculatedPrice = input.minimumCharge;
        minimumChargeApplied = true;
      }

      const finalPrice = Math.max(0, Math.round((calculatedPrice - totalItemDiscount) * 100) / 100);

      const explanation = `Bobina de ${roll.widthCm} cm (${orient}): Peça de ${pieceW.toFixed(1)}×${pieceH.toFixed(1)} cm. Couve ${unitsAcross} un. na largura em ${rowsNeeded} fila(s). Fórmula: ${linearPricing ? '' : `${billableWidthM.toFixed(2)}m (boca) × `}${linearMeters.toFixed(2)}m (comprimento) × R$ ${configuredPrice.toFixed(2)} = R$ ${printingPrice.toFixed(2)}.${minimumChargeApplied ? ' [Valor mínimo aplicado]' : ''}${discountFromTiers > 0 ? ` [Desconto volume: ${appliedDiscountPct}% = R$ ${discountFromTiers.toFixed(2)}]` : ''}`;

      evaluatedRawOptions.push({
        rollId: roll.id,
        rollName: roll.name || `Bobina ${roll.widthCm} cm`,
        rollWidthCm: roll.widthCm,
        usableRollWidthCm: usableW,
        billableWidthCm,
        orientation: orient,
        fits: true,
        productionWidthCm: pieceW,
        productionHeightCm: pieceH,
        unitsAcross,
        rowsNeeded,
        linearMetersNeeded: linearMeters,
        totalSqmUsed,
        billableAreaM2,
        netSqmPrinted,
        wasteSqm,
        wastePercentage,
        materialCost,
        finishingCost: input.finishingCost,
        installationCost: input.installationCost,
        designCost: input.designCost,
        deliveryCost: input.deliveryCost,
        setupCharge: input.setupCharge,
        totalBaseCost,
        subtotalPrice: calculatedPrice,
        discountAmount: totalItemDiscount,
        minimumChargeApplied,
        finalPrice,
        stockQty,
        stockStatus: roll.stockQty === undefined ? 'ALERTA' : stockQty+1e-6<linearMeters ? 'SEM_ESTOQUE' : 'DISPONIVEL',
        explanation,
        areaPerUnitM2: Math.round(areaPerUnitM2 * 10000) / 10000,
        grossUnitPrice,
        grossTotalPrice: Math.round(grossTotalPrice * 100) / 100,
        totalCalculatedAreaM2: Math.round(totalSqmUsed * 10000) / 10000,
        discountPercentage: appliedDiscountPct,
        discountValue: discountFromTiers,
        requiredWidthCm: pieceW,
        usedLengthCm: pieceH
      });
    }
  }

  const validOptions = evaluatedRawOptions.filter(o => o.fits);
  if (validOptions.length === 0) {
    const activeRolls = input.availableRolls.filter(r => r.active);
    const maxRollWidth = activeRolls.length > 0
      ? Math.max(...activeRolls.map(r => r.widthCm))
      : 0;

    const minProdWidth = Math.min(...orientations.map(orientation => orientation === 'VERTICAL' ? prodHorizH : prodHorizW));

    return {
      success: false,
      error: `Nenhuma bobina disponível para este material comporta a largura de produção de ${(minProdWidth / 100).toFixed(2)} m (${minProdWidth.toFixed(1)} cm). Maior bobina ativa cadastrada: ${(maxRollWidth / 100).toFixed(2)} m (${maxRollWidth} cm).`,
      recommended: null,
      recommendedSnapshot: null,
      selectedSnapshot: null,
      isManualSelection: false,
      allOptions: evaluatedRawOptions.map(opt => ({
        ...opt,
        priceDifferenceVsRecommended: 0,
        wasteDifferenceVsRecommended: 0,
        linearMeterDifferenceVsRecommended: 0,
        tags: opt.fits ? [] : ['INCOMPATIVEL']
      }))
    };
  }

  // Prioritization logic:
  // 1. Lowest gross unit price before volume discount
  // 2. Lowest area per unit (or total sqm used)
  // 3. Smallest sufficient roll width
  // 4. Normal orientation first ("HORIZONTAL" before "VERTICAL")
  const sortedByPrice = [...validOptions].sort((a, b) => {
    if (Math.abs(a.grossUnitPrice - b.grossUnitPrice) > 0.0001) {
      return a.grossUnitPrice - b.grossUnitPrice;
    }
    if (Math.abs(a.areaPerUnitM2 - b.areaPerUnitM2) > 0.0001) {
      return a.areaPerUnitM2 - b.areaPerUnitM2;
    }
    if (a.rollWidthCm !== b.rollWidthCm) {
      return a.rollWidthCm - b.rollWidthCm;
    }
    return (a.orientation === 'HORIZONTAL' ? 0 : 1) - (b.orientation === 'HORIZONTAL' ? 0 : 1);
  });

  const sortedByWaste = [...validOptions].sort((a, b) => a.wastePercentage - b.wastePercentage);
  const sortedByLinear = [...validOptions].sort((a, b) => a.linearMetersNeeded - b.linearMetersNeeded);

  const bestTechnical = (input.autoFindLowestCost === false && validOptions.length > 0)
    ? validOptions[0]
    : sortedByPrice[0];
  const minWasteOpt = sortedByWaste[0];
  const minLinearOpt = sortedByLinear[0];

  const recSnapshot: CalculationSnapshot = {
    recommendedRollWidthCm: bestTechnical.rollWidthCm,
    usableRollWidthCm: bestTechnical.usableRollWidthCm,
    billableWidthCm: bestTechnical.billableWidthCm || bestTechnical.rollWidthCm,
    orientation: bestTechnical.orientation,
    productionWidthCm: bestTechnical.productionWidthCm,
    productionHeightCm: bestTechnical.productionHeightCm,
    unitsAcross: bestTechnical.unitsAcross,
    rowsNeeded: bestTechnical.rowsNeeded,
    linearMetersNeeded: bestTechnical.linearMetersNeeded,
    totalSqmUsed: bestTechnical.totalSqmUsed,
    billableAreaM2: bestTechnical.billableAreaM2 || ((bestTechnical.billableWidthCm || bestTechnical.rollWidthCm) / 100 * bestTechnical.linearMetersNeeded),
    netSqmPrinted: bestTechnical.netSqmPrinted,
    wasteSqm: bestTechnical.wasteSqm,
    wastePercentage: bestTechnical.wastePercentage,
    materialCost: bestTechnical.materialCost,
    finishingCost: bestTechnical.finishingCost,
    installationCost: bestTechnical.installationCost,
    designCost: bestTechnical.designCost,
    deliveryCost: bestTechnical.deliveryCost,
    setupCharge: bestTechnical.setupCharge,
    totalBaseCost: bestTechnical.totalBaseCost,
    subtotalPrice: bestTechnical.subtotalPrice,
    discountAmount: bestTechnical.discountAmount,
    minimumChargeApplied: bestTechnical.minimumChargeApplied,
    finalPrice: bestTechnical.finalPrice,
    explanation: bestTechnical.explanation,
    isManualSelection: false,
    areaPerUnitM2: bestTechnical.areaPerUnitM2,
    grossUnitPrice: bestTechnical.grossUnitPrice,
    grossTotalPrice: bestTechnical.grossTotalPrice,
    totalCalculatedAreaM2: bestTechnical.totalCalculatedAreaM2,
    discountPercentage: bestTechnical.discountPercentage,
    discountValue: bestTechnical.discountValue,
    requiredWidthCm: bestTechnical.requiredWidthCm,
    usedLengthCm: bestTechnical.usedLengthCm
  };

  let activeSnapshot = recSnapshot;
  let isManual = false;
  let selectedSnapshot: CalculationSnapshot | null = null;

  if (input.selectedRollWidthCm !== undefined) {
    const matchingOption = validOptions.find(o => 
      o.rollWidthCm === input.selectedRollWidthCm &&
      (!input.selectedOrientation || o.orientation === input.selectedOrientation)
    );
    if (input.allowManualRollOverride === false || !matchingOption) {
      return { success: false, error: input.allowManualRollOverride === false ? 'A troca manual de bobina está bloqueada para este material.' : 'A bobina ou orientação selecionada não é compatível com a medida de produção.', recommended: null, recommendedSnapshot: recSnapshot, selectedSnapshot: null, isManualSelection: false, allOptions: [] };
    }

    if (matchingOption) {
      isManual = true;
      selectedSnapshot = {
        recommendedRollWidthCm: bestTechnical.rollWidthCm,
        selectedRollWidthCm: matchingOption.rollWidthCm,
        usableRollWidthCm: matchingOption.usableRollWidthCm,
        billableWidthCm: matchingOption.billableWidthCm || matchingOption.rollWidthCm,
        orientation: matchingOption.orientation,
        productionWidthCm: matchingOption.productionWidthCm,
        productionHeightCm: matchingOption.productionHeightCm,
        unitsAcross: matchingOption.unitsAcross,
        rowsNeeded: matchingOption.rowsNeeded,
        linearMetersNeeded: matchingOption.linearMetersNeeded,
        totalSqmUsed: matchingOption.totalSqmUsed,
        billableAreaM2: matchingOption.billableAreaM2 || ((matchingOption.billableWidthCm || matchingOption.rollWidthCm) / 100 * matchingOption.linearMetersNeeded),
        netSqmPrinted: matchingOption.netSqmPrinted,
        wasteSqm: matchingOption.wasteSqm,
        wastePercentage: matchingOption.wastePercentage,
        materialCost: matchingOption.materialCost,
        finishingCost: matchingOption.finishingCost,
        installationCost: matchingOption.installationCost,
        designCost: matchingOption.designCost,
        deliveryCost: matchingOption.deliveryCost,
        setupCharge: matchingOption.setupCharge,
        totalBaseCost: matchingOption.totalBaseCost,
        subtotalPrice: matchingOption.subtotalPrice,
        discountAmount: matchingOption.discountAmount,
        minimumChargeApplied: matchingOption.minimumChargeApplied,
        finalPrice: matchingOption.finalPrice,
        explanation: `${matchingOption.explanation} [SELEÇÃO MANUAL: ${input.manualSelectionReason || 'Sem justificativa'}]`,
        isManualSelection: true,
        manualSelectionReason: input.manualSelectionReason,
        areaPerUnitM2: matchingOption.areaPerUnitM2,
        grossUnitPrice: matchingOption.grossUnitPrice,
        grossTotalPrice: matchingOption.grossTotalPrice,
        totalCalculatedAreaM2: matchingOption.totalCalculatedAreaM2,
        discountPercentage: matchingOption.discountPercentage,
        discountValue: matchingOption.discountValue,
        requiredWidthCm: matchingOption.requiredWidthCm,
        usedLengthCm: matchingOption.usedLengthCm
      };
      activeSnapshot = selectedSnapshot;
    }
  }

  const allEvaluated: EvaluatedRollOption[] = evaluatedRawOptions.map(opt => {
    const tags: EvaluatedRollOption['tags'] = [];
    if (!opt.fits) {
      tags.push('INCOMPATIVEL');
    } else {
      if (opt.rollWidthCm === bestTechnical.rollWidthCm && opt.orientation === bestTechnical.orientation) {
        tags.push('RECOMENDADA');
      }
      if (opt.rollWidthCm === minWasteOpt.rollWidthCm && opt.orientation === minWasteOpt.orientation && !tags.includes('RECOMENDADA')) {
        tags.push('MENOR_DESPERDICIO');
      }
      if (opt.finalPrice === bestTechnical.finalPrice && !tags.includes('RECOMENDADA')) {
        tags.push('MENOR_CUSTO');
      }
      if (opt.linearMetersNeeded === minLinearOpt.linearMetersNeeded && !tags.includes('RECOMENDADA')) {
        tags.push('MENOR_CONSUMO_LINEAR');
      }
      if (isManual && input.selectedRollWidthCm === opt.rollWidthCm && (input.selectedOrientation ? input.selectedOrientation === opt.orientation : true)) {
        tags.push('SELECIONADA_MANUALMENTE');
      }
    }

    if (opt.stockStatus === 'SEM_ESTOQUE') {
      tags.push('SEM_ESTOQUE');
    }

    const priceDiff = opt.fits ? opt.finalPrice - bestTechnical.finalPrice : 0;
    const wasteDiff = opt.fits ? opt.wastePercentage - bestTechnical.wastePercentage : 0;
    const linearDiff = opt.fits ? opt.linearMetersNeeded - bestTechnical.linearMetersNeeded : 0;

    return {
      ...opt,
      priceDifferenceVsRecommended: priceDiff,
      wasteDifferenceVsRecommended: wasteDiff,
      linearMeterDifferenceVsRecommended: linearDiff,
      tags
    };
  });

  return {
    success: true,
    recommended: activeSnapshot,
    recommendedSnapshot: recSnapshot,
    selectedSnapshot,
    isManualSelection: isManual,
    manualSelectionReason: input.manualSelectionReason,
    allOptions: allEvaluated
  };
}

export interface RollMaterialPriceParams {
  finishedWidthCm: number;
  finishedHeightCm: number;
  quantity?: number;
  availableRolls?: (number | { widthCm?: number; width_cm?: number; widthM?: number; width_m?: number; name?: string; active?: boolean; id?: string })[];
  pricePerSqm?: number;
  allowRotation?: boolean;
  requestedOrientation?: 'AUTO' | 'NORMAL' | 'ROTATED' | 'HORIZONTAL' | 'VERTICAL';
  bleedLeftCm?: number;
  bleedRightCm?: number;
  bleedTopCm?: number;
  bleedBottomCm?: number;
  volumeDiscountTiers?: Array<{
    minimumArea?: number;
    minimum_area?: number;
    minimumQuantity?: number;
    percentage?: number;
    discountPercentage?: number;
    active?: boolean;
  }>;
  manualSelectedRollWidthCm?: number;
  manualSelectedOrientation?: 'NORMAL' | 'ROTATED' | 'HORIZONTAL' | 'VERTICAL';
  userName?: string;
}

export function calculateRollMaterialPrice(params: RollMaterialPriceParams) {
  const {
    finishedWidthCm,
    finishedHeightCm,
    quantity = 1,
    availableRolls,
    pricePerSqm = 60,
    allowRotation = true,
    requestedOrientation = 'AUTO',
    bleedLeftCm = 0,
    bleedRightCm = 0,
    bleedTopCm = 0,
    bleedBottomCm = 0,
    volumeDiscountTiers,
    manualSelectedRollWidthCm,
    manualSelectedOrientation,
    userName = 'Operador'
  } = params;

  if (quantity <= 0 || finishedWidthCm <= 0 || finishedHeightCm <= 0) {
    return {
      success: false,
      error: 'Dimensões e quantidade devem ser maiores que zero.',
      recommended: null,
      allOptions: []
    };
  }

  const prodWidthCm = Math.round((finishedWidthCm + bleedLeftCm + bleedRightCm) * 100) / 100;
  const prodHeightCm = Math.round((finishedHeightCm + bleedTopCm + bleedBottomCm) * 100) / 100;

  const defaultWidths = [1.40, 1.60, 1.80, 2.05, 2.20, 2.50, 3.20];
  const rollsToProcess = (!availableRolls || availableRolls.length === 0)
    ? defaultWidths.map((w, idx) => ({ id: `r-${idx}`, widthCm: w * 100, name: `Bobina ${w.toFixed(2)}m`, active: true }))
    : availableRolls.map((r, idx) => {
        if (typeof r === 'number') {
          const wCm = r <= 10.0 ? r * 100 : r;
          return { id: `r-${idx}`, widthCm: wCm, name: `Bobina ${(wCm / 100).toFixed(2)}m`, active: true };
        }
        const w = Number(r.widthCm || (r as any).width_cm || ((r.widthM || (r as any).width_m || 0) * 100) || 160);
        return {
          id: r.id || `r-${idx}`,
          widthCm: w <= 10.0 ? w * 100 : w,
          name: r.name || `Bobina ${(w / 100).toFixed(2)}m`,
          active: r.active !== false
        };
      });

  const orientUpper = (requestedOrientation || 'AUTO').toUpperCase();
  let allowedOrientations: ('NORMAL' | 'ROTATED')[] = [];
  if (!allowRotation || orientUpper === 'NORMAL' || orientUpper === 'HORIZONTAL') {
    allowedOrientations = ['NORMAL'];
  } else if (orientUpper === 'ROTATED' || orientUpper === 'VERTICAL') {
    allowedOrientations = ['ROTATED'];
  } else {
    allowedOrientations = ['NORMAL', 'ROTATED'];
  }

  const validOptions: any[] = [];
  const rejectedOptions: any[] = [];

  for (const orient of allowedOrientations) {
    const reqWCm = orient === 'NORMAL' ? prodWidthCm : prodHeightCm;
    const usedLCm = orient === 'NORMAL' ? prodHeightCm : prodWidthCm;

    for (const roll of rollsToProcess) {
      if (!roll.active) continue;

      if (roll.widthCm >= reqWCm) {
        const rollWM = Math.round((roll.widthCm / 100.0) * 10000) / 10000;
        const usedLM = Math.round((usedLCm / 100.0) * 10000) / 10000;
        const areaUnit = Math.round(rollWM * usedLM * 10000) / 10000;
        const grossUnit = Math.round(areaUnit * pricePerSqm * 100) / 100;
        const totArea = Math.round(areaUnit * quantity * 10000) / 10000;
        const grossTot = Math.round(grossUnit * quantity * 100) / 100;

        validOptions.push({
          rollId: roll.id,
          rollName: roll.name,
          rollWidthCm: roll.widthCm,
          rollWidthM: rollWM,
          orientation: orient,
          fits: true,
          requiredWidthCm: reqWCm,
          requiredWidthM: Math.round((reqWCm / 100.0) * 10000) / 10000,
          usedLengthCm: usedLCm,
          usedLengthM: Math.round((usedLCm / 100.0) * 10000) / 10000,
          areaPerUnitM2: areaUnit,
          grossUnitPrice: grossUnit,
          totalCalculatedAreaM2: totArea,
          grossTotalPrice: grossTot
        });
      } else {
        rejectedOptions.push({
          rollId: roll.id,
          rollName: roll.name,
          rollWidthCm: roll.widthCm,
          rollWidthM: Math.round((roll.widthCm / 100.0) * 10000) / 10000,
          orientation: orient,
          fits: false,
          requiredWidthCm: reqWCm,
          rejectionReason: `A largura necessária de ${(reqWCm / 100).toFixed(2)} m excede a largura da bobina de ${(roll.widthCm / 100).toFixed(2)} m.`
        });
      }
    }
  }

  if (validOptions.length === 0) {
    const minReqCm = allowRotation ? Math.min(prodWidthCm, prodHeightCm) : prodWidthCm;
    const maxRollCm = Math.max(...rollsToProcess.filter(r => r.active).map(r => r.widthCm), 0);
    return {
      success: false,
      error: `Nenhuma bobina disponível para este material comporta a largura de produção necessária de ${(minReqCm / 100).toFixed(2)} m (${minReqCm.toFixed(1)} cm). Maior bobina ativa cadastrada: ${(maxRollCm / 100).toFixed(2)} m (${maxRollCm.toFixed(0)} cm).`,
      recommended: null,
      allOptions: rejectedOptions
    };
  }

  validOptions.sort((a, b) => {
    if (Math.abs(a.grossUnitPrice - b.grossUnitPrice) > 0.001) {
      return a.grossUnitPrice - b.grossUnitPrice;
    }
    if (Math.abs(a.areaPerUnitM2 - b.areaPerUnitM2) > 0.0001) {
      return a.areaPerUnitM2 - b.areaPerUnitM2;
    }
    if (a.rollWidthCm !== b.rollWidthCm) {
      return a.rollWidthCm - b.rollWidthCm;
    }
    return (a.orientation === 'NORMAL' ? 0 : 1) - (b.orientation === 'NORMAL' ? 0 : 1);
  });

  const applyDiscountAndTotals = (opt: any) => {
    const optCopy = { ...opt };
    const totArea = Math.round(optCopy.areaPerUnitM2 * quantity * 10000) / 10000;
    const grossTot = Math.round(optCopy.grossUnitPrice * quantity * 100) / 100;
    optCopy.totalCalculatedAreaM2 = totArea;
    optCopy.grossTotalPrice = grossTot;

    let appliedPct = 0;
    if (volumeDiscountTiers && volumeDiscountTiers.length > 0) {
      const eligible = volumeDiscountTiers.filter(t => {
        if (t.active === false) return false;
        const thresh = Number(t.minimumArea ?? t.minimum_area ?? t.minimumQuantity ?? 0);
        return Number.isFinite(thresh) && thresh >= 0 && totArea + 1e-9 >= thresh;
      });
      if (eligible.length > 0) {
        eligible.sort((a, b) => {
          const threshA = Number(a.minimumArea ?? a.minimum_area ?? a.minimumQuantity ?? 0);
          const threshB = Number(b.minimumArea ?? b.minimum_area ?? b.minimumQuantity ?? 0);
          return threshB - threshA;
        });
        appliedPct = Number(eligible[0].discountPercentage ?? eligible[0].percentage ?? 0);
      }
    }

    const discVal = Math.round(grossTot * (appliedPct / 100.0) * 100) / 100;
    const finalPrice = Math.round((grossTot - discVal) * 100) / 100;

    optCopy.discountPercentage = appliedPct;
    optCopy.discountValue = discVal;
    optCopy.finalPrice = finalPrice;
    optCopy.finalTotalPrice = finalPrice;
    return optCopy;
  };

  const recommended = applyDiscountAndTotals(validOptions[0]);
  let selected = null;
  let isManualOverride = false;
  let auditLog = null;

  if (manualSelectedRollWidthCm !== undefined && manualSelectedRollWidthCm !== null) {
    const targetWCm = manualSelectedRollWidthCm <= 10.0 ? manualSelectedRollWidthCm * 100 : manualSelectedRollWidthCm;
    const rawTargetOrient = (manualSelectedOrientation || recommended.orientation).toUpperCase();
    const targetOrient: 'NORMAL' | 'ROTATED' = (rawTargetOrient === 'HORIZONTAL' || rawTargetOrient === 'NORMAL') ? 'NORMAL' : 'ROTATED';
    const reqCheckW = targetOrient === 'NORMAL' ? prodWidthCm : prodHeightCm;

    if (targetWCm < reqCheckW) {
      return {
        success: false,
        error: `Bobina manual de ${(targetWCm / 100).toFixed(2)} m é incompatível com a largura de produção necessária de ${(reqCheckW / 100).toFixed(2)} m.`,
        recommended,
        selected: null,
        isManualOverride: false,
        allOptions: [...validOptions.map(applyDiscountAndTotals), ...rejectedOptions]
      };
    }

    let matching = validOptions.find(o => Math.abs(o.rollWidthCm - targetWCm) < 0.01 && o.orientation === targetOrient);
    if (!matching) {
      matching = validOptions.find(o => Math.abs(o.rollWidthCm - targetWCm) < 0.01);
    }

    if (matching) {
      selected = applyDiscountAndTotals(matching);
      isManualOverride = true;
      auditLog = {
        id: `audit-${Date.now()}`,
        timestamp: new Date().toISOString(),
        user: userName,
        action: 'MANUAL_OVERRIDE',
        previousRollWidthCm: recommended.rollWidthCm,
        newRollWidthCm: selected.rollWidthCm,
        previousOrientation: recommended.orientation,
        newOrientation: selected.orientation,
        previousFinalPrice: recommended.finalPrice,
        newFinalPrice: selected.finalPrice,
        reason: 'Substituição manual de bobina'
      };
    }
  }

  return {
    success: true,
    finalWidthCm: finishedWidthCm,
    finalHeightCm: finishedHeightCm,
    productionWidthCm: prodWidthCm,
    productionHeightCm: prodHeightCm,
    bleedLeftCm,
    bleedRightCm,
    bleedTopCm,
    bleedBottomCm,
    quantity,
    pricePerSqm,
    allowRotation,
    recommended,
    selected,
    isManualOverride,
    auditLog,
    allOptions: [...validOptions.map(applyDiscountAndTotals), ...rejectedOptions]
  };
}


