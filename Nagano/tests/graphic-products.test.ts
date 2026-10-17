import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { mkdtempSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { validateGraphicProduct, priceGraphicItem } from '../server/graphicPricing';
import { calculateQuotationItem, priceQuotation } from '../server/quotationPricing';
import { createGraphicProductsRouter } from '../server/graphicProductsApi';
import { createQuotationsRouter } from '../server/quotationsApi';
import { GraphicProduct } from '../src/types/graphicProduct';
import { Material, Quotation, QuotationItem } from '../src/types';

const unit: GraphicProduct = { id: 'card', serviceGroup: 'GRAPHIC_PRODUCTS', name: 'Cartão de visita', code: 'CV', category: 'Cartões', description: '', specification: '9 × 5 cm, couché 300g', active: true, pricingMethod: 'UNIT_PRICE', baseQuantity: 1000, baseBatchPrice: 200 };
const tiers: GraphicProduct = { ...unit, pricingMethod: 'BASE_BATCH_WITH_QUANTITY_DISCOUNT', discountsEnabled: true, quantityDiscounts: [{ minimumQuantity: 10000, percentage: 15 }, { minimumQuantity: 2000, percentage: 5 }, { minimumQuantity: 5000, percentage: 10 }] };
const table: GraphicProduct = { ...unit, pricingMethod: 'QUANTITY_PRICE_TABLE', priceTable: [{ quantity: 500, batchPrice: 160 }, { quantity: 1000, batchPrice: 220 }, { quantity: 2000, batchPrice: 350 }, { quantity: 5000, batchPrice: 690 }] };
const roll = { id: 'roll', name: 'Adesivo', controlType: 'ROLL', active: true, salePrice: 60, sellingPriceSqm: 30, minimumCharge: 30, costPerSqm: 10, allowedRollWidths: [1.4, 1.6, 1.8], availableRolls: [], allowRotation: false, autoFindLowestCost: true, allowManualRollOverride: true } as Material;
const visualItem = { id: 'v', serviceId: 'banner', materialId: 'roll', serviceGroup: 'VISUAL_COMMUNICATION', widthCm: 150, heightCm: 200, quantity: 1, allowances: {}, finishings: [], orientation: 'AUTO' } as QuotationItem;

test('graphic A: derived unit 0.20 and 2000 units cost 400', () => {
  const result = priceGraphicItem(unit, { quantity: 2000 });
  assert.equal(result.graphicCalculation.baseUnitPrice, .2);
  assert.equal(result.graphicCalculation.grossTotal, 400);
  assert.equal(result.item.subtotal, 400);
});
test('graphic B: 5% gives 380 and final unit 0.19; largest threshold only', () => {
  const s = priceGraphicItem(tiers, { quantity: 2000 }).graphicCalculation;
  assert.equal(s.grossTotal, 400); assert.equal(s.discountValue, 20); assert.equal(s.finalTotal, 380); assert.equal(s.finalUnitPrice, .19);
  assert.equal(priceGraphicItem(tiers, { quantity: 7000 }).graphicCalculation.discountPercentage, 10);
  assert.equal(priceGraphicItem(tiers, { quantity: 1000 }).graphicCalculation.discountPercentage, 0);
  assert.equal(priceGraphicItem({ ...tiers, discountsEnabled: false }, { quantity: 2000 }).item.subtotal, 400);
  assert.equal(priceGraphicItem({ ...tiers, quantityDiscounts: [{ minimumQuantity: 1, percentage: 100 }] }, { quantity: 2000 }).item.subtotal, 0);
});
test('graphic C: exact lot 350, fractional unit 0.175, missing quantity rejected', () => {
  const r = priceGraphicItem(table, { quantity: 2000, discountType: 'PERCENTAGE', discountInputValue: 99 });
  assert.equal(r.item.subtotal, 350); assert.equal(r.graphicCalculation.finalUnitPrice, .175); assert.equal(r.graphicCalculation.discountValue, 0);
  assert.throws(() => priceGraphicItem(table, { quantity: 3000 }), /3.000 unidades/);
});
test('graphic validation: duplicate thresholds, duplicate lots, invalid configuration', () => {
  assert.throws(() => validateGraphicProduct({ ...table, priceTable: [{ quantity: 1000, batchPrice: 220 }, { quantity: 1000, batchPrice: 250 }] }), /duplicadas/);
  assert.throws(() => validateGraphicProduct({ ...tiers, quantityDiscounts: [{ minimumQuantity: 2000, percentage: 5 }, { minimumQuantity: 2000, percentage: 8 }] }), /duplicadas/);
  for (const invalid of [0, -1, NaN, Infinity, undefined, 1.5]) assert.throws(() => validateGraphicProduct({ ...unit, baseQuantity: invalid }));
  for (const invalid of [-1, NaN, Infinity, undefined, .001]) assert.throws(() => validateGraphicProduct({ ...unit, baseBatchPrice: invalid }));
  for (const percentage of [-1, 101, NaN, Infinity]) assert.throws(() => validateGraphicProduct({ ...tiers, quantityDiscounts: [{ minimumQuantity: 1, percentage }] }));
  for (const patch of [{ name: '' }, { active: undefined }, { serviceGroup: undefined }, { pricingMethod: 'BAD' }]) assert.throws(() => validateGraphicProduct({ ...unit, ...patch } as GraphicProduct));
  assert.throws(() => validateGraphicProduct({ ...table, priceTable: [] }));
  assert.throws(() => priceGraphicItem({ ...unit, active: false }, { quantity: 2000 }), /inativo/);
  for (const quantity of [0, -1, 1.5, NaN, Infinity]) assert.throws(() => priceGraphicItem(unit, { quantity }));
});
test('cent precision, large totals, zero prices, decimal comma and unrounded unit', () => {
  assert.equal(priceGraphicItem({ ...unit, baseQuantity: 3, baseBatchPrice: 1 }, { quantity: 3 }).item.subtotal, 1);
  assert.equal(priceGraphicItem({ ...unit, baseQuantity: 3, baseBatchPrice: 1 }, { quantity: 2 }).item.subtotal, .67);
  assert.equal(priceGraphicItem({ ...unit, baseBatchPrice: 0 }, { quantity: 2000 }).item.subtotal, 0);
  assert.equal(priceGraphicItem({ ...unit, baseBatchPrice: '200,00' } as any, { quantity: 2000 }).item.subtotal, 400);
  assert.throws(() => priceGraphicItem({ ...unit, baseQuantity: 1, baseBatchPrice: 90071992547400 }, { quantity: 1000000 }), /limite/);
});
test('per-item dispatch: no roll lookup for graphic; no graphic strategy for visual; mixed total 572', () => {
  const graphic = { id: 'g', graphicProductId: 'card', serviceGroup: 'GRAPHIC_PRODUCTS', quantity: 2000, materialId: 'roll', widthCm: 999, selectedRollWidthCm: 320, subtotal: 30 } as QuotationItem;
  const g = calculateQuotationItem(graphic, () => { throw new Error('Roll engine reached'); }, () => tiers).item;
  assert.equal(g.subtotal, 380); assert.equal(g.materialId, undefined); assert.equal(g.calculationSnapshot, undefined); assert.equal(g.selectedRollWidthCm, undefined); assert.equal(g.widthCm, 0);
  const v = calculateQuotationItem(visualItem, () => roll, () => undefined).item;
  assert.equal(v.subtotal, 192); assert.equal(v.calculationSnapshot?.totalSqmUsed, 3.2);
  assert.equal(priceQuotation({ items: [visualItem, graphic] } as Quotation, () => roll, id => id === 'card' ? tiers : undefined).totalAmount, 572);
  assert.throws(() => calculateQuotationItem({ ...graphic, serviceGroup: 'VISUAL_COMMUNICATION' }, () => roll, () => tiers), /incompatível/);
  assert.throws(() => calculateQuotationItem(graphic, () => roll), /não encontrado/);
  assert.equal(calculateQuotationItem({ serviceId: 'card', quantity: 2000, materialId: 'roll', subtotal: 30 }, () => roll, () => tiers).item.subtotal, 380);
  assert.throws(() => calculateQuotationItem({ serviceId: 'card', serviceGroup: 'VISUAL_COMMUNICATION', materialId: 'roll' }, () => roll, () => tiers), /incompatível/);
});
test('API and SQLite: configuration reload, authoritative mixed save, revision, frozen approval and inactive product', async () => {
  const root = path.resolve('work/test-data'); mkdirSync(root, { recursive: true });
  const dir = mkdtempSync(path.join(root, 'graphic-'));
  let catalog = createGraphicProductsRouter(dir);
  let quotes = createQuotationsRouter(() => roll, dir, id => catalog.get(id));
  const app = express(); app.use(express.json()); app.use((req, res, next) => catalog.router(req, res, next)); app.use((req, res, next) => quotes.router(req, res, next));
  const server = app.listen(0, '127.0.0.1'); await new Promise<void>(r => server.once('listening', r));
  const url = `http://127.0.0.1:${(server.address() as any).port}`;
  const call = async (route: string, method = 'GET', body?: unknown) => {
    const r = await fetch(url + route, { method, ...(body ? { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {}) });
    return { status: r.status, ...await r.json() };
  };
  try {
    const saved = await call('/api/graphic-products/card', 'PUT', tiers); assert.equal(saved.status, 200);
    assert.equal((await call('/api/graphic-products/card', 'PUT', tiers)).status, 409);
    const invalid = await call('/api/graphic-products/bad', 'PUT', { ...table, priceTable: [{ quantity: 1, batchPrice: -1 }] }); assert.equal(invalid.status, 400);
    const preview = await call('/api/quotations/calculate-item', 'POST', { graphicProductId: 'card', quantity: 2000, baseBatchPrice: 30, subtotal: 30 }); assert.equal(preview.item.subtotal, 380);
    const q = await call('/api/quotations/mixed', 'PUT', { id: 'mixed', status: 'CALCULADO', items: [visualItem, preview.item] }); assert.equal(q.data.totalAmount, 572);
    quotes.close(); catalog.close(); catalog = createGraphicProductsRouter(dir); quotes = createQuotationsRouter(() => roll, dir, id => catalog.get(id));
    assert.equal((await call('/api/quotations/mixed')).data.totalAmount, 572);
    assert.equal((await call('/api/graphic-products')).data[0].baseBatchPrice, 200);
    const edited = await call('/api/quotations/mixed', 'PUT', { ...q.data, items: [visualItem, { ...preview.item, quantity: 7000 }] }); assert.equal(edited.data.totalAmount, 1452);
    const approval = await call('/api/quotations/mixed/approve', 'POST', { revision: edited.data.revision }); assert.equal(approval.status, 200);
    await call('/api/graphic-products/card', 'PUT', { ...saved.data, baseBatchPrice: 900, active: false });
    assert.equal((await call('/api/quotations/mixed')).data.totalAmount, 1452);
    assert.equal((await call('/api/quotations/mixed', 'PUT', { ...approval.data, status: 'CALCULADO' })).status, 409);
    assert.equal((await call('/api/quotations/calculate-item', 'POST', { graphicProductId: 'card', quantity: 2000 })).status, 400);
    assert.equal((await call('/api/quotations')).data.length, 1);
  } finally { await new Promise<void>(r => server.close(() => r())); quotes.close(); catalog.close(); }
});
