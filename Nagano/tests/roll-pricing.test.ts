import test from 'node:test';
import assert from 'node:assert/strict';
import { runCalculationEngine, CalculationInput, calculateProductionDimensions, calculateItemDiscount, calculateQuotationTotals } from '../src/utils/calculationEngine';
import { materialCalculationRules } from '../src/utils/materialCalculation';
import { validateMaterial } from '../src/utils/materialValidation';
import { Material } from '../src/types';

const material = {
  id: 'test', name: 'Adesivo', controlType: 'ROLL', calculationUnit: 'M2', salePrice: 60,
  sellingPriceSqm: 60, costPerSqm: 20, costPerLinm: 20, active: true,
  allowedRollWidths: [1.4, 1.6, 1.8, 2.05, 2.2, 2.5, 3.2], availableRolls: [],
  allowRotation: true, allowManualRollOverride: true, volumeDiscountEnabled: true,
  discountTiers: [{ id: 'a', minimumArea: 10, percentage: 5 }, { id: 'b', minimumArea: 25, percentage: 10 }, { id: 'c', minimumArea: 50, percentage: 15 }],
} as Material;
const base: CalculationInput = {
  ...materialCalculationRules(material), finishedWidthCm: 142, finishedHeightCm: 234,
  quantity: 1, requestedOrientation: 'AUTO', allowances: { reinforcementCm: 0, hemCm: 0, rodPocketCm: 0, bleedCm: 0, edgeSafetyCm: 0 },
  costPerSqm: 20, finishingCost: 0, installationCost: 0, designCost: 0, deliveryCost: 0,
  markupPercentage: 0, discountAmount: 0, minimumCharge: 0, setupCharge: 0, pricingMethod: 'POR_AREA_CONSUMIDA_BOBINA',
};
const calc = (patch: Partial<CalculationInput> = {}) => runCalculationEngine({ ...base, ...patch });

test('150 × 200 uses full 160 cm width and costs R$192', () => {
  const result = calc({ finishedWidthCm: 150, finishedHeightCm: 200, requestedOrientation: 'HORIZONTAL' });
  assert.equal(result.recommended?.finalPrice, 192);
  assert.equal(result.recommended?.billableWidthCm, 160);
  assert.equal(result.recommended?.billableAreaM2, 3.2);
  assert.equal(result.allOptions.find(o => o.rollWidthCm === 140 && o.orientation === 'HORIZONTAL')?.fits, false);
});
test('normal 224.64 vs rotated 213: recommend rotated 250 cm', () => {
  const result = calc();
  assert.equal(result.recommended?.finalPrice, 213);
  assert.equal(result.recommended?.orientation, 'VERTICAL');
  assert.equal(result.recommended?.billableWidthCm, 250);
  assert.equal(calc({ allowRotation: false }).recommended?.finalPrice, 224.64);
  assert.ok(calc({ allowRotation: false }).allOptions.every(o => o.orientation === 'HORIZONTAL'));
});
test('ten units = 35.50 m², highest tier only, final R$1917', () => {
  const snap = calc({ quantity: 10 }).recommended!;
  assert.equal(snap.totalCalculatedAreaM2, 35.5);
  assert.equal(snap.discountPercentage, 10);
  assert.equal(snap.discountValue, 213);
  assert.equal(snap.finalPrice, 1917);
  assert.equal(snap.unitsAcross, 1);
  assert.equal(snap.rowsNeeded, 10);
  assert.equal(snap.linearMetersNeeded, 14.2);
  assert.equal(snap.materialCost, 710);
  assert.equal(snap.billableAreaM2, 35.5);
});
test('overflow applied before rotation, horizontal and vertical pairs', () => {
  const allowances = { ...base.allowances, overflowValueCm: 10, overflowLeft: true, overflowRight: true };
  assert.equal(calculateProductionDimensions(142, 234, allowances).productionWidthCm, 162);
  const snap = calc({ allowances }).recommended!;
  assert.equal(snap.productionHeightCm, 162);
  assert.equal(snap.finalPrice, 243);
  const vertical = { ...base.allowances, overflowValueCm: 10, overflowTop: true, overflowBottom: true };
  assert.equal(calculateProductionDimensions(142, 234, vertical).productionHeightCm, 254);
  assert.equal(calc({ allowances: vertical }).recommended?.finalPrice, 243.84);
});
test('no overflow, custom sides, and exact-fit widths', () => {
  assert.equal(calc({ finishedWidthCm: 160, finishedHeightCm: 200, allowRotation: false }).recommended?.billableWidthCm, 160);
  const dims = calculateProductionDimensions(142, 234, { ...base.allowances, leftCm: 3, topCm: 7 });
  assert.equal(dims.productionWidthCm, 145);
  assert.equal(dims.productionHeightCm, 241);
});
test('manual selection recalculates, including same width and different orientation', () => {
  assert.equal(calc({ selectedRollWidthCm: 180, selectedOrientation: 'HORIZONTAL' }).recommended?.finalPrice, 252.72);
  const same = calc({ selectedRollWidthCm: 250, selectedOrientation: 'HORIZONTAL' });
  assert.equal(same.isManualSelection, true);
  assert.equal(same.recommended?.finalPrice, 351);
  assert.equal(calc({ selectedRollWidthCm: 140, selectedOrientation: 'HORIZONTAL' }).success, false);
  assert.equal(calc({ selectedRollWidthCm: 180, allowManualRollOverride: false }).success, false);
  assert.equal(calc({ selectedRollWidthCm: 250, selectedOrientation: 'VERTICAL', allowRotation: false }).success, false);
});
test('material flags, custom widths, no fabricated stock and disabled discount', () => {
  const rules = materialCalculationRules({ ...material, allowedRollWidths: [1.7], volumeDiscountEnabled: false });
  assert.equal(rules.availableRolls.length, 1);
  assert.equal(rules.availableRolls[0].stockQty, undefined);
  assert.deepEqual(rules.volumeDiscountTiers, []);
  assert.equal(calc({ ...rules, quantity: 10 }).recommended?.discountValue, 0);
  assert.equal(calc({ ...materialCalculationRules({ ...material, active: false }) }).success, false);
});
test('area discount accepts zero threshold and boundary, ignores inactive tiers', () => {
  assert.equal(calc({ volumeDiscountTiers: [{ minimumArea: 0, percentage: 5 }] }).recommended?.discountPercentage, 5);
  assert.equal(calc({ volumeDiscountTiers: [{ minimumArea: 3.55, percentage: 10 }] }).recommended?.discountPercentage, 10);
  assert.equal(calc({ volumeDiscountTiers: [{ minimumArea: 0, percentage: 99, active: false }] }).recommended?.discountPercentage, 0);
});
test('invalid dimensions, fractional quantity, unavailable rolls and zero price', () => {
  for (const patch of [{ quantity: NaN }, { quantity: 1.5 }, { finishedWidthCm: Infinity }, { finishedHeightCm: 0 }, { availableRolls: [] }]) assert.equal(calc(patch).success, false);
  assert.equal(calc({ pricePerSqm: 0 }).recommended?.finalPrice, 0);
});
test('material validation rejects missing fields, empty widths, duplicate tiers and invalid prices', () => {
  assert.equal(validateMaterial(material).valid, true);
  for (const patch of [{ name: ' ' }, { controlType: undefined }, { calculationUnit: undefined }, { salePrice: Infinity }, { allowedRollWidths: [] }, { allowedRollWidths: [1.6, 160] }, { discountTiers: [{ id: 'a', minimumArea: 1, percentage: 101 }] }, { discountTiers: [{ id: 'a', minimumArea: 1, percentage: 5 }, { id: 'b', minimumArea: 1, percentage: 10 }] }]) assert.equal(validateMaterial({ ...material, ...patch }).valid, false);
});
