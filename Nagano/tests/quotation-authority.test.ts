import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import express from 'express';
import { createQuotationsRouter } from '../server/quotationsApi';
import { priceRollItem, priceQuotation } from '../server/quotationPricing';
import { Material, Quotation, QuotationItem } from '../src/types';

const material: Material = {
  id: 'roll', name: 'Adesivo', controlType: 'ROLL', active: true, salePrice: 60, sellingPriceSqm: 30,
  minimumCharge: 30, costPerSqm: 10, allowedRollWidths: [1.4, 1.6, 1.8], availableRolls: [],
  allowRotation: false, autoFindLowestCost: true, allowManualRollOverride: true,
} as Material;
const item = {
  id: 'item', materialId: 'roll', serviceId: 'generic-unit-service', serviceName: 'Serviço genérico',
  widthCm: 150, heightCm: 200, quantity: 1, orientation: 'AUTO', allowances: {}, finishings: [],
  isGraphic: true, calculationType: 'UNIT', servicePriceSnapshot: 30, unitPriceSnapshot: 30,
  baseValue: 30, subtotal: 30, discountType: 'NONE', discountInputValue: 0, position: 1,
} as QuotationItem;
const rotatedMaterial = { ...material, allowRotation: true, allowedRollWidths: [1.4, 1.6, 1.8, 2.05, 2.2, 2.5, 3.2] };
const tiers = [{ id: 'a', minimumArea: 10, percentage: 5 }, { id: 'b', minimumArea: 25, percentage: 10 }, { id: 'c', minimumArea: 50, percentage: 15 }];

test('R$30 regression: stored ROLL wins over generic unit flags, client price and legacy minimum', () => {
  const priced = priceRollItem(material, item).item;
  assert.notEqual(priced.subtotal, 30);
  assert.equal(priced.subtotal, 192);
  assert.equal(priced.calculationType, 'ROLL');
  assert.equal(priced.servicePriceSnapshot, 60);
  assert.equal(priced.calculationSnapshot?.billableWidthCm, 160);
  assert.equal(priced.calculationSnapshot?.totalSqmUsed, 3.2);
  assert.equal(priceRollItem(material, { ...item, widthCm: 20, heightCm: 20 }).item.subtotal, 16.8);
});
test('normal and rotated prices; quantity and area discount use authoritative material', () => {
  const source = { ...item, widthCm: 142, heightCm: 234 };
  const result = priceRollItem(rotatedMaterial, source);
  assert.equal(result.item.subtotal, 213);
  assert.equal(result.calculation.allOptions.find(o => o.rollWidthCm === 160 && o.orientation === 'HORIZONTAL')?.subtotalPrice, 224.64);
  assert.equal(result.item.calculationSnapshot?.orientation, 'VERTICAL');
  assert.equal(priceRollItem(rotatedMaterial, { ...source, quantity: 10 }).item.subtotal, 2130);
  const discounted = priceRollItem({ ...rotatedMaterial, volumeDiscountEnabled: true, discountTiers: tiers }, { ...source, quantity: 10 }).item;
  assert.equal(discounted.subtotal, 1917);
  assert.equal(discounted.calculationSnapshot?.totalCalculatedAreaM2, 35.5);
  assert.equal(discounted.calculationSnapshot?.discountPercentage, 10);
  assert.equal(discounted.discountEffectiveAmount, 213);
});
test('bleed before rotation, manual override, and no-fit error with no fallback', () => {
  const result = priceRollItem(rotatedMaterial, { ...item, widthCm: 142, heightCm: 234, allowances: { overflowValueCm: 10, overflowLeft: true, overflowRight: true } as any }).item;
  assert.equal(result.productionWidthCm, 162);
  assert.equal(result.calculationSnapshot?.usedLengthCm, 162);
  assert.equal(result.subtotal, 243);
  assert.equal(priceRollItem(material, { ...item, selectedRollWidthCm: 180, selectedOrientation: 'HORIZONTAL', manualSelectionReason: 'Bobina instalada' }).item.subtotal, 216);
  assert.throws(() => priceRollItem(material, { ...item, widthCm: 335 }), /3\.35 m/);
  assert.throws(() => priceRollItem(rotatedMaterial, { ...item, widthCm: 335, orientation: 'HORIZONTAL' }), /3\.35 m/);
  assert.throws(() => priceRollItem(material, { ...item, selectedRollWidthCm: 140, manualSelectionReason: 'Teste' }), /compatível/);
  assert.throws(() => priceRollItem({ ...material, allowManualRollOverride: false }, { ...item, selectedRollWidthCm: 180 }), /bloqueada/);
});
test('decimal comma conversion is once-only and malformed dimensions are rejected', () => {
  assert.equal(priceRollItem(material, { ...item, widthCm: '150,0', heightCm: '200,00', quantity: '1' } as any).item.subtotal, 192);
  for (const value of ['', null, 'bad', -1, Infinity]) assert.throws(() => priceRollItem(material, { ...item, widthCm: value } as any));
  assert.throws(() => priceRollItem({ ...material, salePrice: undefined, sellingPriceSqm: undefined } as any, item), /Preço/);
});
test('UNIT and SHEET keep existing prices, not roll pricing', () => {
  for (const controlType of ['UNIT', 'SHEET'] as const) {
    const quote = priceQuotation({ items: [{ ...item, materialId: controlType, subtotal: 75 }] } as Quotation, () => ({ ...material, controlType }));
    assert.equal(quote.items[0].subtotal, 75);
    assert.equal(quote.totalAmount, 75);
  }
});

test('API → SQLite → reload → edit: never trust posted R$30, preserve approved history', async () => {
  const root = path.resolve('work/test-data'); mkdirSync(root, { recursive: true });
  const dir = mkdtempSync(path.join(root, 'quotes-'));
  let storedMaterial = { ...material };
  let repository = createQuotationsRouter(() => storedMaterial, dir);
  const app = express(); app.use(express.json()); app.use((req, res, next) => repository.router(req, res, next));
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const url = `http://127.0.0.1:${(server.address() as any).port}`;
  const call = async (route: string, method = 'GET', body?: unknown) => {
    const response = await fetch(url + route, { method, ...(body ? { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {}) });
    return { status: response.status, ...(await response.json()) };
  };
  try {
    const preview = await call('/api/quotations/calculate-item', 'POST', { item: { ...item, salePrice: 1, availableRolls: [1], controlType: 'UNIT' } });
    assert.equal(preview.item.subtotal, 192);
    const payload = { id: 'quote', number: 'REGRESSION', status: 'ORCAMENTO', items: [item], totalAmount: 30 };
    const saved = await call('/api/quotations/quote', 'PUT', payload);
    assert.equal(saved.status, 200);
    assert.equal(saved.data.totalAmount, 192);
    assert.equal(saved.data.items[0].widthCm, 150);
    assert.equal(saved.data.items[0].calculationSnapshot.usedLengthCm, 200);
    repository.close(); repository = createQuotationsRouter(() => storedMaterial, dir);
    assert.equal((await call('/api/quotations/quote')).data.totalAmount, 192);
    const edited = await call('/api/quotations/quote', 'PUT', { ...saved.data, items: [{ ...item, quantity: 2 }] });
    assert.equal(edited.data.totalAmount, 384);
    assert.equal((await call('/api/quotations')).data.length, 1);
    assert.equal((await call('/api/quotations/quote', 'PUT', saved.data)).status, 409);
    storedMaterial = { ...material, salePrice: 70 };
    const repriced = await call('/api/quotations/quote', 'PUT', edited.data);
    assert.equal(repriced.data.totalAmount, 448);
    const approved = await call('/api/quotations/quote/approve', 'POST', { revision: repriced.data.revision });
    assert.equal(approved.data.totalAmount, 448);
    storedMaterial = { ...material, salePrice: 100 };
    assert.equal((await call('/api/quotations/quote')).data.totalAmount, 448);
    assert.equal((await call('/api/quotations/quote', 'PUT', approved.data)).status, 409);
    const failed = await call('/api/quotations/calculate-item', 'POST', { item: { ...item, widthCm: 335 } });
    assert.equal(failed.status, 400);
    assert.equal(failed.item, undefined);
  } finally {
    server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); repository.close();
  }
});

