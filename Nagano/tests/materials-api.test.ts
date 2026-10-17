import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import express from 'express';

test('material configuration persists atomically in SQLite and never creates stock', async () => {
  const testRoot = path.resolve('work/test-data');
  mkdirSync(testRoot, { recursive: true });
  process.env.PRINTSHOP_DATA_DIR = mkdtempSync(path.join(testRoot, 'materials-'));
  const { materialsRouter } = await import('../server/materialsApi');
  const app = express();
  app.use(express.json());
  app.use(materialsRouter);
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const url = `http://127.0.0.1:${(server.address() as any).port}`;
  const read = async (route: string) => (await fetch(url + route)).json();
  const save = async (body: unknown) => fetch(url + '/api/materials', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  try {
    const before = await read('/api/materials');
    const stock = await read('/api/physical-rolls');
    const added = { ...before.data[0], id: 'acceptance-test', code: 'ACCEPT', name: 'Material de teste', salePrice: 60, sellingPriceSqm: 60, allowedRollWidths: [1.4, 1.6, 2.5], availableRolls: [], discountTiers: [{ id: 'test', minimumArea: 25, percentage: 10 }] };
    const response = await save({ materials: [...before.data, added], revision: before.revision });
    assert.equal(response.status, 200);
    const saved = await response.json();
    assert.notEqual(saved.revision, before.revision);
    const db = new DatabaseSync(path.join(process.env.PRINTSHOP_DATA_DIR!, 'materials.sqlite'), { readOnly: true });
    const row = db.prepare('SELECT payload FROM materials WHERE id = ?').get('acceptance-test');
    assert.equal(JSON.parse(String(row?.payload)).salePrice, 60);
    db.close();
    assert.deepEqual(await read('/api/physical-rolls'), stock);
    assert.equal((await save({ materials: before.data, revision: before.revision })).status, 409);
    const invalid = { ...added, allowedRollWidths: [] };
    assert.equal((await save({ materials: [invalid], revision: saved.revision })).status, 400);
    assert.equal((await read('/api/materials')).revision, saved.revision);
    const inactive = saved.data.map((m: any) => m.id === added.id ? { ...m, active: false } : m);
    assert.equal((await save({ materials: inactive, revision: saved.revision })).status, 200);
    assert.equal((await read('/api/materials/acceptance-test')).data.active, false);
  } finally {
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});
