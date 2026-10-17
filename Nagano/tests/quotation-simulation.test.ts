import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { mkdtempSync } from 'node:fs';
import path from 'node:path';
import { calculateSimulationLayout } from '../src/utils/simulationLayout';
import { simulateQuotation, priceSimulationItem } from '../server/quotationSimulation';
import { priceQuotation } from '../server/quotationPricing';
import { createQuotationsRouter } from '../server/quotationsApi';
import { formatSimulationMessage } from '../src/utils/simulationMessage';
import type { Material, Quotation, QuotationItem } from '../src/types';
import type { SimulationConfig, SimulationSnapshot } from '../src/types/quotationSimulation';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SimulationPricingDetails } from '../src/components/SimulationPricingDetails';
import { describeQuotationItem } from '../src/utils/quotationMessage';

const config: SimulationConfig = { areaWidthCm: 100, areaHeightCm: 100, marginCm: 0, gapCm: 0, bleedCm: 0, allowRotation: true };
const roll = { id: 'roll', name: 'Vinil Matte', controlType: 'ROLL', active: true, salePrice: 60, sellingPriceSqm: 30,
  minimumCharge: 0, allowedRollWidths: [1], availableRolls: [], allowRotation: true, calculationUnit: 'M2' } as Material;
const sheet = { ...roll, id: 'sheet', controlType: 'SHEET', calculationUnit: 'SHEET', salePrice: 10 } as Material;
const source = (extra: Partial<QuotationItem> = {}): Partial<QuotationItem> => ({ id: 'sim', materialId: 'roll',
  serviceName: 'Adesivos', widthCm: 10, heightCm: 10, quantity: 100, finishings: [],
  simulationSnapshot: { config } as SimulationSnapshot, ...extra });

test('fit respects margins, gap and per-side bleed, with decimal-boundary tolerance', () => {
  assert.equal(calculateSimulationLayout(10, 10, config).capacity, 100);
  assert.equal(calculateSimulationLayout(10, 10, { ...config, marginCm: 1 }).capacity, 81);
  assert.equal(calculateSimulationLayout(10, 10, { ...config, gapCm: 1 }).capacity, 81);
  assert.equal(calculateSimulationLayout(10, 10, { ...config, bleedCm: 0.5 }).capacity, 81);
  assert.equal(calculateSimulationLayout(0.1, 0.1, { ...config, areaWidthCm: 0.3, areaHeightCm: 0.3 }).capacity, 9);
  assert.throws(() => calculateSimulationLayout(101, 101, config), /não cabe/);
  assert.throws(() => calculateSimulationLayout(0, 1, config), /válidas/);
  assert.throws(() => calculateSimulationLayout(0.01, 0.01, config), /1.000.000/);
});
test('rotation chooses the greater uniform fit and obeys material restriction', () => {
  const narrow = { ...config, areaWidthCm: 30, areaHeightCm: 20 };
  const rotated = calculateSimulationLayout(20, 10, narrow);
  assert.equal(rotated.capacity, 3); assert.equal(rotated.rotated, true);
  assert.equal(calculateSimulationLayout(20, 10, { ...narrow, allowRotation: false }).capacity, 2);
  const material = { ...sheet, allowRotation: false };
  const priced = priceSimulationItem(material, source({ widthCm: 20, heightCm: 10, simulationSnapshot: { config: narrow } as SimulationSnapshot }));
  assert.equal(priced.item.simulationSnapshot!.layout.capacity, 2);
});
test('sheets bill complete sheets, rolls bill actual rows with full width', () => {
  assert.equal(priceSimulationItem(sheet, source({ quantity: 101 })).item.subtotal, 20);
  assert.equal(priceSimulationItem(roll, source({ quantity: 101 })).item.subtotal, 66);
  assert.equal(priceSimulationItem(roll, source({ quantity: 1 })).item.subtotal, 6);
  assert.equal(priceSimulationItem({ ...sheet, calculationUnit: 'M2', salePrice: 60 }, source({ quantity: 101 })).item.subtotal, 120);
  assert.equal(priceSimulationItem({ ...roll, calculationUnit: 'LINEAR_METER', salePrice: 25 }, source({ quantity: 101 })).item.subtotal, 27.5);
});
test('roll block margins are included per block and partial rows', () => {
  const item = priceSimulationItem(roll, source({ quantity: 82, simulationSnapshot: { config: { ...config, marginCm: 1 } } as SimulationSnapshot })).item;
  assert.equal(item.simulationSnapshot!.layout.capacity, 81);
  assert.equal(item.simulationSnapshot!.usedLengthM, 1.04);
  assert.equal(item.subtotal, 62.4);
});
test('stored price and discounts win over forged prices and computed fields, including save', () => {
  const material = { ...roll, volumeDiscountEnabled: true, discountTiers: [{ id: 'd', minimumArea: 2, percentage: 20 }] };
  const fake = source({ quantity: 200, subtotal: 1, baseValue: 1, servicePriceSnapshot: 1,
    simulationSnapshot: { config, rate: 1, consumedAreaM2: 999, layout: { capacity: 99999 } } as SimulationSnapshot });
  const priced = priceSimulationItem(material, fake).item;
  assert.equal(priced.subtotal, 96); assert.equal(priced.simulationSnapshot!.rate, 60);
  assert.equal(priced.simulationSnapshot!.layout.capacity, 100);
  const saved = priceQuotation({ items: [fake] } as Quotation, () => material);
  assert.equal(saved.totalAmount, 96);
  assert.equal(priceSimulationItem({ ...material, minimumCharge: 50 }, source({ quantity: 1 })).item.subtotal, 50);
});
test('finishings recompute for each quantity, and minimum pricing can create real savings', () => {
  const fin = { id: 'cut', finishingId: 'cut', finishingName: 'Meio corte', costType: 'PER_UNIT', unitPriceSnapshot: 0.1, subtotal: 999, minimumChargeSnapshot: 0 } as any;
  const result = simulateQuotation({ ...roll, minimumCharge: 30 }, source({ finishings: [fin] }), [1, 100, 200]);
  assert.equal(result.options[0].total, 30.1);
  assert.equal(result.options[1].total, 70);
  assert.equal(result.options[2].total, 140);
  assert.equal(result.lowestUnitPriceQuantity, 100);
});
test('simulation produces full-block tiers, deduplicates and sorts custom quantities, no invented discounts', () => {
  const result = simulateQuotation(roll, source());
  assert.deepEqual(result.options.map(o => o.quantity), [100, 200, 400, 800, 1500, 3000]);
  assert.equal(result.lowestUnitPriceQuantity, undefined);
  assert.ok(result.options.every(o => o.saving === 0));
  assert.deepEqual(simulateQuotation(roll, source(), [200, 100, 100]).options.map(o => o.quantity), [100, 200]);
  const msg = formatSimulationMessage(result, 48);
  assert.match(msg, /100 UNIDADES/); assert.match(msg, /60,00/); assert.match(msg, /48h/);
  assert.doesNotMatch(msg, /Economia|MENOR VALOR/);
});
test('invalid quantities, dimensions, price and roll widths are rejected', () => {
  for (const q of [0, 1.5, Infinity, 10000001]) assert.throws(() => priceSimulationItem(roll, source({ quantity: q })), /Quantidade/);
  assert.throws(() => simulateQuotation(roll, source(), []), /quantidades/);
  assert.throws(() => simulateQuotation(roll, source(), new Array(13).fill(100)), /quantidades/);
  assert.throws(() => priceSimulationItem(roll, source({ simulationSnapshot: { config: { ...config, areaWidthCm: 150 } } as SimulationSnapshot })), /largura de bobina/);
  assert.throws(() => priceSimulationItem({ ...roll, salePrice: 0 }, source()), /preço de venda/);
  assert.throws(() => priceSimulationItem({ ...sheet, active: false }, source()), /ativo/);
  assert.throws(() => priceSimulationItem(roll, source({ heightCm: NaN })), /Altura/);
});
test('zero-area discount threshold and saved simulation details remain consistent', () => {
  const material = { ...sheet, volumeDiscountEnabled: true, discountTiers: [{ id: 'all', minimumArea: 0, percentage: 10 }] };
  const item = priceSimulationItem(material, source({ widthCm: 4, heightCm: 6.5, quantity: 100 })).item;
  assert.equal(item.subtotal, 9);
  assert.deepEqual(describeQuotationItem(item).details[0], { label: 'Medida', value: '4 x 6,5 cm' });
  const html = renderToStaticMarkup(createElement(SimulationPricingDetails, { item }));
  assert.match(html, /folha\/chapa/); assert.match(html, /Sangria/); assert.match(html, /9,00/);
  assert.match(html, /Consumo: 1 folhas\/chapas completas/);
  assert.doesNotMatch(html, /100 un\. ×/);
});
test('API preview and saving selected option use the same authoritative simulation price', async () => {
  const dir = mkdtempSync(path.resolve('tests/tmp-simulation-'));
  const api = createQuotationsRouter(id => id === 'roll' ? roll : undefined, dir);
  const app = express(); app.use(express.json()); app.use(api.router);
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${(server.address() as any).port}`;
  try {
    const response = await fetch(`${base}/api/quotations/simulate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ item: source(), quantities: [100, 101] }) });
    assert.equal(response.status, 200);
    const preview = await response.json();
    assert.equal(preview.options[1].total, 66);
    const save = await fetch(`${base}/api/quotations/api-sim`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: 'api-sim', status: 'ORCAMENTO', items: [{ ...preview.options[1].item, subtotal: 1 }] }) });
    assert.equal(save.status, 200); assert.equal((await save.json()).data.totalAmount, 66);
    const invalid = await fetch(`${base}/api/quotations/simulate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ item: source({ widthCm: 101, heightCm: 101 }) }) });
    assert.equal(invalid.status, 400);
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); api.close(); }
});
