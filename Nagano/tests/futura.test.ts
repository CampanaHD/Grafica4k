import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdirSync, mkdtempSync } from 'node:fs';
import path from 'node:path';
import express from 'express';
import { parseCatalog, parseCategories, parseProduct, productUrl } from '../server/futura/parser';
import { applyMarkup, decimalCents, parseMarkup } from '../server/futura/money';
import { FuturaImCatalogProvider, robotsAllows } from '../server/futura/provider';
import { createFuturaIntegration } from '../server/futura/api';
import { calculateQuotationItem } from '../server/quotationPricing';
import { createQuotationsRouter } from '../server/quotationsApi';
import { createGraphicProductsRouter } from '../server/graphicProductsApi';
import { FuturaProduct } from '../src/types/futura';
import { PricingError } from '../server/pricingValidation';
import { FuturaStore } from '../server/futura/store';
import { futuraConfigurationFields, splitFuturaMaterial } from '../src/utils/futuraConfiguration';
import { parseShipping } from '../server/futura/shipping';

const fixture = (file: string) => readFileSync(path.resolve('tests/fixtures/futura', file), 'utf8');
const sourceUrl = 'https://www.futuraim.com.br/produto/cartao-de-visita-em-couche-fosco-com-laminacao-fosca-e-verniz-localizado?id=3551';
const product = () => parseProduct(fixture('product.html'), sourceUrl, '2026-10-01T12:00:00.000Z');

test('Futura uses integer cents: 100 × 2 = 200; 87.50 × 2 = 175; configurable multiplier rounds once', () => {
  assert.equal(applyMarkup(decimalCents('100.00'), '2.00'), 20000);
  assert.equal(applyMarkup(decimalCents('87.50'), '2.00'), 17500);
  assert.equal(applyMarkup(101, '1.50'), 152);
  assert.equal(parseMarkup('2'), '2.00');
  for (const value of [undefined, null, '', '-1', 'NaN', '0', '12.345', '1e3', Infinity]) assert.throws(() => decimalCents(value));
  for (const value of ['0', '-1', 'abc', '2.001']) assert.throws(() => parseMarkup(value));
});

test('sanitized source contract parses current SKU, exact quantity, options and factual fields only', () => {
  const p = product();
  assert.equal(p.sourceProductId, '3551'); assert.equal(p.quantity, 500); assert.equal(p.sourcePriceCents, 10699);
  assert.equal(p.configuration.Material, 'Couché Fosco 300g');
  assert.equal(p.configuration.Acabamento, '4 Cantos Arredondados');
  assert.ok(p.options.some(o => o.label === 'Quantidade: 1000' && o.url.endsWith('id=20145')));
  assert.equal(p.url, sourceUrl); assert.equal(p.fetchedAt, '2026-10-01T12:00:00.000Z');
  assert.doesNotMatch(JSON.stringify(p), /review|RequestVerificationToken|image|author/);
  assert.ok(parseCatalog(fixture('catalog.html'), p.fetchedAt).length > 0);
  assert.ok(parseCategories(fixture('categories.md')).some(c => c.path === '/cartao-de-visita'));
});

test('configuration controls preserve source groups, current values and exact variation links', () => {
  const p = product();
  const groups = new Map(p.configurationGroups!.map(g => [g.field, g]));
  assert.equal(groups.get('Material')!.value, 'Couché Fosco 300g');
  assert.equal(groups.get('Material')!.options.length, 1);
  assert.equal(groups.get('Enobrecimento')!.options.length, 1);
  assert.ok(groups.get('Formato')!.options.some(o => o.label === '50x50mm' && o.url.endsWith('id=81792')));
  assert.ok(groups.get('Cor de Impressão')!.options.some(o => o.label.startsWith('4×0') && o.url.endsWith('id=3111')));
  assert.ok(groups.get('Acabamento')!.options.some(o => o.label === 'Refile' && o.url.endsWith('id=4626')));
  assert.ok(groups.get('Quantidade')!.options.some(o => o.label === '1000' && o.url.endsWith('id=20145')));
  for (const group of groups.values()) assert.ok(group.options.some(o => o.url === p.url && o.label === group.value));
  const fields = futuraConfigurationFields(p);
  assert.deepEqual(fields.map(g => g.field), ['Papel / Material', 'Gramatura', 'Formato', 'Cor', 'Enobrecimento', 'Acabamento', 'Quantidade']);
  assert.equal(fields[0].value, 'Couché Fosco'); assert.equal(fields[1].value, '300g');
  assert.equal(fields.find(g => g.field === 'Quantidade')!.options.length, 5);
});

test('paper and weight are linked source choices, without inventing material combinations', () => {
  const p = product();
  const material = p.configurationGroups!.find(g => g.field === 'Material')!;
  material.options.push({ label: 'Couché Fosco 250g', url: sourceUrl.replace('3551', '9001') },
    { label: 'Offset 90g', url: sourceUrl.replace('3551', '9002') });
  const fields = futuraConfigurationFields(p);
  assert.deepEqual(fields[0].options.map(o => o.label), ['Couché Fosco', 'Offset']);
  assert.deepEqual(fields[1].options.map(o => o.label), ['300g', '250g']);
  assert.equal(fields[1].options[1].url, sourceUrl.replace('3551', '9001'));
  assert.equal(fields[0].options[1].url, sourceUrl.replace('3551', '9002'));
  assert.deepEqual(splitFuturaMaterial('Offset 90 g/m²'), { paper: 'Offset', weight: '90 g/m²' });
  assert.deepEqual(splitFuturaMaterial('PVC 0,3mm'), { paper: 'PVC 0,3mm', weight: '' });
  delete p.configurationGroups;
  assert.ok(futuraConfigurationFields(p).every(g => g.options.length === 1));
});

test('all supported source groups parse alternatives and reject unsafe or unrelated links', () => {
  const extra = `<div class="selects-produto"><div role="group" aria-label="Material"><button onclick="trocarProdutoPorUrl('/produto/teste?id=9001')">Offset 90g</button></div>
    <div role="group" aria-label="Enobrecimento"><button onclick="trocarProdutoPorUrl('/produto/teste?id=9002')">Sem Enobrecimento</button><button onclick="trocarProdutoPorUrl('https://evil.test/produto/a?id=1')">Inválido</button></div></div>`;
  const p = parseProduct(fixture('product.html') + extra, sourceUrl, '2026-10-01T12:00:00.000Z');
  assert.ok(p.configurationGroups!.find(g => g.field === 'Material')!.options.some(o => o.label === 'Offset 90g'));
  assert.ok(p.configurationGroups!.find(g => g.field === 'Enobrecimento')!.options.some(o => o.label === 'Sem Enobrecimento'));
  assert.doesNotMatch(JSON.stringify(p), /evil.test|Inválido/);
});

test('missing, mismatched, expired, unavailable or malformed source prices cannot be accepted', () => {
  const html = fixture('product.html');
  for (const broken of [html.replace('"price":"106.99"', '"price":null'), html.replace('"price":"106.99"', '"price":"-1"'),
    html.replace('"price":"106.99"', '"price":"100.00"'), html.replace('InStock', 'OutOfStock'),
    html.replace('"BRL"', '"USD"'), html.replace('2026-12-30', '2025-01-01'), '<html>Site indisponível</html>']) {
    assert.throws(() => parseProduct(broken, sourceUrl, '2026-10-01T12:00:00.000Z'));
  }
  assert.throws(() => parseProduct(html, sourceUrl.replace('3551', '3552'), '2026-10-01T12:00:00.000Z'));
  for (const url of ['http://www.futuraim.com.br/produto/a?id=1', 'https://localhost/produto/a?id=1', 'https://www.futuraim.com.br@evil.test/produto/a?id=1', '/checkout', '/produto/a', '/produto/../login?id=1']) assert.throws(() => productUrl(url));
});

test('robots rules, allowed categories and cache avoid forbidden search and repeated catalog requests', async () => {
  const robots = 'User-agent: *\nDisallow: /busca\nDisallow: /todos-produtos\nDisallow: /login\nDisallow: /produto/private*\nAllow: /produto/private-ok$';
  assert.equal(robotsAllows(robots, '/busca?q=cartao'), false);
  assert.equal(robotsAllows(robots, '/produto/a?id=1'), true);
  assert.equal(robotsAllows(robots, '/produto/private-a'), false);
  assert.equal(robotsAllows(robots, '/produto/private-ok'), true);
  assert.equal(robotsAllows('User-agent: NaganoCatalog\nDisallow: /\nUser-agent: *\nAllow: /', '/produto/a'), false);
  const requests: string[] = [];
  const fakeFetch = async (url: string | URL) => {
    const route = new URL(String(url)).pathname; requests.push(route);
    return new Response(route === '/robots.txt' ? robots : route === '/llms.txt' ? fixture('categories.md') : route.startsWith('/produto/') ? fixture('product.html') : fixture('catalog.html'));
  };
  const provider = new FuturaImCatalogProvider(fakeFetch as typeof fetch, 0);
  await provider.searchProducts('', '/cartao-de-visita'); await provider.searchProducts('', '/cartao-de-visita');
  assert.equal(requests.filter(p => p === '/cartao-de-visita').length, 1);
  await provider.getCurrentPrice(sourceUrl); await provider.getCurrentPrice(sourceUrl);
  assert.equal(requests.filter(p => p.startsWith('/produto/')).length, 2);
  await assert.rejects(provider.searchProducts('test', '/busca'));
  assert.ok(!requests.some(p => p.startsWith('/busca')));
});

test('upstream errors and timeouts fail explicitly, with only bounded retries', async () => {
  let calls = 0;
  const provider = new FuturaImCatalogProvider((async (url: string) => {
    if (url.endsWith('/robots.txt')) return new Response('User-agent: *\nAllow: /');
    calls++; throw new Error('timeout');
  }) as typeof fetch, 0, 10);
  await assert.rejects(provider.getCurrentPrice(sourceUrl), /tempo limite/); assert.equal(calls, 2);
  calls = 0;
  const forbidden = new FuturaImCatalogProvider((async () => { calls++; return new Response('', { status: 403 }); }) as typeof fetch, 0);
  await assert.rejects(forbidden.getCurrentPrice(sourceUrl), /restrito/); assert.equal(calls, 1);
});

async function setup() {
  const root = path.resolve('work/test-data'); mkdirSync(root, { recursive: true });
  const dir = mkdtempSync(path.join(root, 'futura-'));
  const graphics = createGraphicProductsRouter(dir);
  const state = { price: 10000, fail: false, quantity: 500, delay: 0, shippingPrice: 990, shippingFail: false };
  const provider = {
    getCategories: async () => [{ name: 'Cartão', path: '/cartao-de-visita' }], searchProducts: async () => [product()],
    getProductDetails: async () => current(), getCurrentPrice: async () => current(),
    getShipping: async (p: FuturaProduct) => {
      if (state.shippingFail) throw new PricingError('Frete indisponível.', 502);
      return { ...parseShipping(fixture('shipping.html'), p.sourceProductId, new Date().toISOString()), priceCents: state.shippingPrice };
    },
  };
  const current = async (): Promise<FuturaProduct> => {
    if (state.delay) await new Promise(r => setTimeout(r, state.delay));
    if (state.fail) throw new PricingError('Futura indisponível.', 502);
    if (!Number.isSafeInteger(state.price) || state.price <= 0) throw new PricingError('Preço ausente ou inválido.', 502);
    return { ...product(), quantity: state.quantity, sourcePriceCents: state.price, fetchedAt: new Date().toISOString() };
  };
  const futura = createFuturaIntegration({ dataDir: dir, provider, multiplier: '2.00', autoRefreshMinutes: 60, startScheduler: false });
  const getMaterial = (id: string) => {
    const row = futura.store.db.prepare('SELECT payload FROM materials_db.materials WHERE id=?').get(id);
    return row ? JSON.parse(String(row.payload)) : undefined;
  };
  const quotes = createQuotationsRouter(getMaterial, dir, graphics.get);
  const app = express(); app.use(express.json()); app.use(futura.router); app.use(graphics.router); app.use(quotes.router);
  const server = app.listen(0, '127.0.0.1'); await new Promise<void>(r => server.once('listening', r));
  const base = `http://127.0.0.1:${(server.address() as any).port}`;
  const call = async (route: string, body?: unknown, method = body ? 'POST' : 'GET') => {
    const response = await fetch(base + route, { method, ...(body ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}) });
    return { status: response.status, ...await response.json() };
  };
  const importProduct = async (serviceGroup = 'GRAPHIC_PRODUCTS', includeShipping = false) => {
    const preview = await call('/api/futura/preview', { url: sourceUrl, serviceGroup, includeShipping, shipping: { priceCents: 1 } }); assert.equal(preview.status, 200);
    return call('/api/futura/confirm', { token: preview.data.token, actor: 'ADMIN', salePriceCents: 1, sourcePriceCents: 1 });
  };
  const makeDue = (id: string) => {
    const record = futura.store.get(id); record.lastSyncAt = '2020-01-01T00:00:00.000Z';
    futura.store.db.prepare('UPDATE futura_imports SET payload=? WHERE id=?').run(JSON.stringify(record), id);
    futura.store.db.prepare('DELETE FROM futura_sync WHERE id=?').run(id);
  };
  const close = async () => { server.closeAllConnections(); await new Promise<void>(r => server.close(() => r())); quotes.close(); graphics.close(); await futura.close(); };
  return { dir, futura, provider, state, call, importProduct, getMaterial, graphics, makeDue, close };
}

test('import maps exact graphic lot and visual UNIT separately, preserves provenance and ignores client prices', async () => {
  const s = await setup();
  try {
    const graphic = await s.importProduct(); assert.equal(graphic.status, 200);
    const gp = s.graphics.get(graphic.data.targetId)!;
    assert.equal(gp.serviceGroup, 'GRAPHIC_PRODUCTS'); assert.equal(gp.pricingMethod, 'QUANTITY_PRICE_TABLE');
    assert.deepEqual(gp.priceTable, [{ quantity: 500, batchPrice: 200 }]);
    assert.equal(graphic.data.product.sourcePriceCents, 10000); assert.equal(graphic.data.salePriceCents, 20000);
    assert.equal(graphic.data.product.url, sourceUrl); assert.ok(Date.parse(graphic.data.product.fetchedAt));
    assert.equal(calculateQuotationItem({ graphicProductId: gp.id, quantity: 500 }, () => { throw Error('No rolls'); }, s.graphics.get).item.subtotal, 200);
    const visual = await s.importProduct('VISUAL_COMMUNICATION'); assert.equal(visual.status, 200);
    const mat = s.getMaterial(visual.data.targetId);
    assert.equal(mat.controlType, 'UNIT'); assert.equal(mat.referenceCost, 100); assert.equal(mat.salePrice, 200);
    assert.deepEqual(mat.availableRolls, []); assert.deepEqual(mat.allowedRollWidths, []);
    const priced = calculateQuotationItem({ serviceGroup: 'VISUAL_COMMUNICATION', materialId: mat.id, quantity: 2, subtotal: 1 }, s.getMaterial);
    assert.equal(priced.item.subtotal, 400); assert.equal(priced.item.serviceGroup, 'VISUAL_COMMUNICATION');
    assert.throws(() => calculateQuotationItem({ materialId: mat.id, quantity: 1.5 }, s.getMaterial));
    assert.equal((await s.importProduct()).status, 409);
  } finally { await s.close(); }
});

test('missing or invalid prices and unavailable upstream never register a product', async () => {
  const s = await setup();
  try {
    for (const price of [0, -10, NaN]) {
      s.state.price = price;
      assert.equal((await s.call('/api/futura/preview', { url: sourceUrl, serviceGroup: 'GRAPHIC_PRODUCTS' })).status, 502);
    }
    s.state.fail = true;
    assert.equal((await s.call('/api/futura/preview', { url: sourceUrl, serviceGroup: 'GRAPHIC_PRODUCTS' })).status, 502);
    assert.equal(s.futura.store.list().length, 0);
  } finally { await s.close(); }
});

test('confirmation rejects price changes, duplicate clicks, unselected groups and stale edits', async () => {
  const s = await setup();
  try {
    assert.equal((await s.call('/api/futura/preview', { url: sourceUrl })).status, 400);
    const p = await s.call('/api/futura/preview', { url: sourceUrl, serviceGroup: 'GRAPHIC_PRODUCTS' });
    s.state.price = 11000;
    assert.equal((await s.call('/api/futura/confirm', { token: p.data.token })).status, 409);
    assert.equal(s.futura.store.list().length, 0);
    const ok = await s.call('/api/futura/preview', { url: sourceUrl, serviceGroup: 'GRAPHIC_PRODUCTS' });
    s.state.delay = 20;
    const results = await Promise.all([s.call('/api/futura/confirm', { token: ok.data.token }), s.call('/api/futura/confirm', { token: ok.data.token })]);
    assert.deepEqual(results.map(r => r.status).sort(), [200, 409]);
    const record = s.futura.store.list()[0];
    const refresh = await s.call('/api/futura/preview', { importId: record.id });
    const target = s.graphics.get(record.targetId)!;
    await s.call(`/api/graphic-products/${target.id}`, { ...target, name: 'Nome editado' }, 'PUT');
    assert.equal((await s.call('/api/futura/confirm', { token: refresh.data.token })).status, 409);
    assert.equal(s.graphics.get(target.id)!.name, 'Nome editado');
  } finally { await s.close(); }
});

test('manual refresh is preview-only until confirmed; automatic refresh changes catalog, never historical quotes', async () => {
  const s = await setup();
  try {
    const imported = (await s.importProduct()).data;
    const saved = await s.call('/api/quotations/frozen', { id: 'frozen', number: 'Q-1', items: [{ id: 'i', graphicProductId: imported.targetId, quantity: 500 }] }, 'PUT');
    const approved = await s.call('/api/quotations/frozen/approve', { revision: saved.data.revision, workOrderId: 'os-test' });
    assert.equal(approved.data.totalAmount, 200);
    s.state.price = 8750;
    const preview = await s.call('/api/futura/preview', { importId: imported.id });
    assert.equal(preview.data.salePriceCents, 17500); assert.equal(s.graphics.get(imported.targetId)!.priceTable![0].batchPrice, 200);
    await s.call('/api/futura/confirm', { token: preview.data.token });
    assert.equal(s.graphics.get(imported.targetId)!.priceTable![0].batchPrice, 175);
    s.state.price = 12000; s.makeDue(imported.id);
    await s.futura.runAutomaticRefresh();
    assert.equal(s.graphics.get(imported.targetId)!.priceTable![0].batchPrice, 240);
    const all = await s.call('/api/quotations');
    assert.equal(all.data.find(q => q.id === 'frozen').totalAmount, 200);
    const history = await s.call('/api/quotations/frozen/history');
    assert.equal(history.data[0].totalAmount, 200);
    const events = s.futura.store.history(); assert.ok(events.some(e => e.user === 'Sistema (automático)' && e.action === 'FUTURA_PRICE_REFRESHED'));
  } finally { await s.close(); }
});

test('automatic refresh keeps old price on failures/config changes and skips manual prices', async () => {
  const s = await setup();
  try {
    const imported = (await s.importProduct()).data;
    s.state.fail = true; s.makeDue(imported.id); await s.futura.runAutomaticRefresh();
    assert.equal(s.graphics.get(imported.targetId)!.priceTable![0].batchPrice, 200);
    assert.match(String(s.futura.store.list()[0].syncError), /indisponível/);
    s.state.fail = false; s.state.quantity = 1000; s.makeDue(imported.id); await s.futura.runAutomaticRefresh();
    assert.equal(s.graphics.get(imported.targetId)!.priceTable![0].quantity, 500);
    s.state.quantity = 500; s.state.price = 30000;
    const target = s.graphics.get(imported.targetId)!;
    await s.call(`/api/graphic-products/${target.id}`, { ...target, priceTable: [{ quantity: 500, batchPrice: 222 }] }, 'PUT');
    s.makeDue(imported.id); await s.futura.runAutomaticRefresh();
    assert.equal(s.graphics.get(imported.targetId)!.priceTable![0].batchPrice, 222);
    assert.equal(s.futura.store.list()[0].priceSource, 'MANUAL');
  } finally { await s.close(); }
});

test('visual automatic refresh persists across restart and additive migration preserves manual products', async () => {
  const s = await setup();
  let importedId: string;
  try {
    const manual = await s.call('/api/graphic-products/manual', { serviceGroup: 'GRAPHIC_PRODUCTS', name: 'Manual', active: true,
      pricingMethod: 'UNIT_PRICE', baseQuantity: 10, baseBatchPrice: 30 }, 'PUT');
    assert.equal(manual.status, 200);
    const record = (await s.importProduct('VISUAL_COMMUNICATION')).data; importedId = record.id;
    s.state.price = 8750; s.makeDue(record.id); await s.futura.runAutomaticRefresh();
    const mat = s.getMaterial(record.targetId);
    assert.equal(mat.salePrice, 175); assert.equal(mat.referenceCost, 87.5);
    assert.equal(calculateQuotationItem({ materialId: mat.id, quantity: 2 }, s.getMaterial).item.subtotal, 350);
    assert.equal(s.graphics.get('manual')!.baseBatchPrice, 30);
  } finally { await s.close(); }
  const reopened = new FuturaStore(s.dir);
  try {
    assert.equal(reopened.get(importedId).salePriceCents, 17500);
    assert.ok(reopened.history().some(e => e.action === 'FUTURA_PRICE_REFRESHED'));
    const row = reopened.db.prepare('SELECT payload FROM products.graphic_products WHERE id=?').get('manual');
    assert.equal(JSON.parse(String(row.payload)).baseBatchPrice, 30);
  } finally { reopened.close(); }
});

test('automatic queue rechecks manual changes before each product and audits actual prior price', async () => {
  const s = await setup();
  try {
    const graphic = (await s.importProduct()).data;
    const visual = (await s.importProduct('VISUAL_COMMUNICATION')).data;
    s.makeDue(graphic.id); s.makeDue(visual.id);
    const original = s.provider.getCurrentPrice;
    let requests = 0;
    s.provider.getCurrentPrice = async () => {
      requests++;
      const target = s.graphics.get(graphic.targetId)!;
      const changed = await s.call(`/api/graphic-products/${target.id}`, { ...target, priceTable: [{ quantity: 500, batchPrice: 222 }] }, 'PUT');
      assert.equal(changed.status, 200);
      return original();
    };
    await s.futura.runAutomaticRefresh();
    assert.equal(requests, 1);
    assert.equal(s.graphics.get(graphic.targetId)!.priceTable![0].batchPrice, 222);
    s.provider.getCurrentPrice = original;
    const preview = await s.call('/api/futura/preview', { importId: graphic.id });
    assert.equal(preview.data.previous.salePriceCents, 22200);
    assert.equal((await s.call('/api/futura/confirm', { token: preview.data.token })).status, 200);
    const event = s.futura.store.history().find(e => e.entityId === graphic.id && e.action === 'FUTURA_PRICE_REFRESHED')!;
    assert.equal(JSON.parse(String(event.details)).oldPriceCents, 22200);
  } finally { await s.close(); }
});

test('imported freight is added once after markup in both groups, refreshed and preserved in saved quotes', async () => {
  const s = await setup();
  try {
    const graphic = (await s.importProduct('GRAPHIC_PRODUCTS', true)).data;
    const visual = (await s.importProduct('VISUAL_COMMUNICATION', true)).data;
    assert.equal(graphic.shipping.priceCents, 990); assert.equal(graphic.salePriceCents, 20990);
    assert.equal(s.getMaterial(visual.targetId).salePrice, 209.9);
    assert.equal(s.getMaterial(visual.targetId).referenceCost, 109.9);
    const saved = await s.call('/api/quotations/freight', { id: 'freight', number: 'F-1', items: [{ id: 'i', graphicProductId: graphic.targetId, quantity: 500 }], deliveryCost: 0 }, 'PUT');
    assert.equal(saved.data.totalAmount, 209.9);
    s.state.price = 8750; s.state.shippingPrice = 1500;
    s.makeDue(graphic.id); s.makeDue(visual.id); await s.futura.runAutomaticRefresh();
    assert.equal(s.futura.store.get(graphic.id).salePriceCents, 19000);
    assert.equal(s.getMaterial(visual.targetId).salePrice, 190);
    assert.equal((await s.call('/api/quotations')).data.find(q => q.id === 'freight').totalAmount, 209.9);
    s.state.shippingFail = true; s.state.price = 9000; s.makeDue(graphic.id);
    await s.futura.runAutomaticRefresh();
    assert.equal(s.futura.store.get(graphic.id).salePriceCents, 19000);
    assert.match(String(s.futura.store.list().find(r => r.id === graphic.id)!.syncError), /Frete indisponível/);
  } finally { await s.close(); }
});

test('freight change invalidates confirmation; legacy imports only add freight after explicit confirmation', async () => {
  const s = await setup();
  try {
    const record = (await s.importProduct()).data;
    assert.equal(record.shipping, undefined);
    const noChange = await s.call('/api/futura/preview', { importId: record.id });
    assert.equal(noChange.data.salePriceCents, 20000);
    const preview = await s.call('/api/futura/preview', { importId: record.id, includeShipping: true });
    assert.equal(preview.data.salePriceCents, 20990);
    assert.equal(s.futura.store.get(record.id).shipping, undefined);
    s.state.shippingPrice = 1000;
    assert.equal((await s.call('/api/futura/confirm', { token: preview.data.token, shipping: { priceCents: 1 } })).status, 409);
    assert.equal(s.futura.store.get(record.id).salePriceCents, 20000);
    const refreshed = await s.call('/api/futura/preview', { importId: record.id, includeShipping: true });
    assert.equal((await s.call('/api/futura/confirm', { token: refreshed.data.token })).data.salePriceCents, 21000);
    assert.equal(s.futura.store.get(record.id).shipping!.priceCents, 1000);
    assert.equal((await s.call('/api/futura/preview', { importId: record.id, includeShipping: 'true' })).status, 400);
  } finally { await s.close(); }
});

test('older imported products enrich missing model once during refresh and then reject model changes', async () => {
  const s = await setup();
  try {
    const record = (await s.importProduct()).data;
    delete record.product.configurationVersion;
    s.futura.store.db.prepare('UPDATE futura_imports SET payload=? WHERE id=?').run(JSON.stringify(record), record.id);
    const original = s.provider.getCurrentPrice;
    s.provider.getCurrentPrice = async () => { const p = await original(); return { ...p, configuration: { ...p.configuration, Modelo: 'Modelo original confirmado' } }; };
    s.makeDue(record.id); await s.futura.runAutomaticRefresh();
    assert.equal(s.futura.store.get(record.id).product.configurationVersion, 2);
    assert.equal(s.futura.store.get(record.id).product.configuration.Modelo, 'Modelo original confirmado');
    assert.equal(s.futura.store.get(record.id).salePriceCents, 20000);
    assert.match(s.graphics.get(record.targetId)!.specification!, /Modelo: Modelo original confirmado/);
    s.provider.getCurrentPrice = async () => { const p = await original(); return { ...p, configuration: { ...p.configuration, Modelo: 'Outro modelo' } }; };
    s.makeDue(record.id); await s.futura.runAutomaticRefresh();
    assert.equal(s.futura.store.get(record.id).product.configuration.Modelo, 'Modelo original confirmado');
    assert.match(String(s.futura.store.list()[0].syncError), /configuração/);
  } finally { await s.close(); }
});
