import { Material, RollOption } from '../types';
import { normalizeWidthToCm } from './materialValidation';

/** Allowed widths are configuration, never proof of physical stock. */
export function materialCalculationRules(material: Material) {
  const config = material.rollConfiguration;
  const widths = material.allowedRollWidths ?? config?.allowedWidths;
  const price = material.salePrice ?? material.sellingPriceSqm;
  const availableRolls: RollOption[] = widths !== undefined
    ? widths.map(width => {
        const widthCm = normalizeWidthToCm(width);
        const legacy = material.availableRolls?.find(r => r.widthCm === widthCm);
        return {
          ...legacy,
          id: legacy?.id ?? `${material.id}_${widthCm}`,
          widthCm,
          active: material.active && (legacy?.active ?? true),
          costPerSqm: material.referenceCost ?? material.costPerSqm,
          costPerLinm: material.costPerLinm,
          sellingPriceSqm: price,
          stockQty: material.stockByWidth?.[String(widthCm)],
        };
      })
    : (material.availableRolls ?? []).map(r => ({ ...r, active: material.active && r.active, sellingPriceSqm: price,stockQty:material.stockByWidth?.[String(r.widthCm)] }));
  return {
    availableRolls,
    pricePerSqm: price,
    allowRotation: material.allowRotation ?? config?.allowRotation ?? true,
    autoFindLowestCost: material.autoFindLowestCost ?? config?.autoFindLowestCost ?? true,
    allowManualRollOverride: material.allowManualRollOverride ?? config?.allowManualRollOverride ?? true,
    volumeDiscountTiers: (material.volumeDiscountEnabled ?? config?.volumeDiscountEnabled)
      ? material.discountTiers ?? config?.discountTiers ?? [] : [],
  };
}
