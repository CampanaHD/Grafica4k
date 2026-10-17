import {moveProductionOrder} from '../src/utils/productionFlow';
import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { mkdirSync, mkdtempSync } from 'node:fs';
import path from 'node:path';
import { createQuotationsRouter } from '../server/quotationsApi';
import { Material, Quotation, WorkOrder } from '../src/types';
import { pauseWorkOrderForRevision, updateWorkOrderAfterRevision } from '../src/utils/quotationRevision';
import { formatQuotationMessage } from '../src/utils/quotationMessage';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ProductionKanban } from '../src/components/ProductionKanban';

test('approved quote can reopen, edit, resend and reapprove while preserving immutable prior versions and OS link', async () => {
  const root = path.resolve('work/test-data'); mkdirSync(root, { recursive: true });
  const dir = mkdtempSync(path.join(root, 'revision-'));
  const material = { id: 'roll', name: 'Lona', controlType: 'ROLL', active: true, salePrice: 60, costPerSqm: 10, availableRolls: [], allowedRollWidths: [1.6], allowRotation: false } as Material;
  let repository = createQuotationsRouter(() => material, dir);
  const app = express(); app.use(express.json()); app.use((req, res, next) => repository.router(req, res, next));
  const server = app.listen(0, '127.0.0.1'); await new Promise<void>(r => server.once('listening', r));
  const url = `http://127.0.0.1:${(server.address() as any).port}`;
  const call = async (route: string, method = 'GET', body?: unknown) => {
    const r = await fetch(url + route, { method, ...(body ? { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {}) });
    return { status: r.status, ...await r.json() };
  };
  try {
    const item = { id: 'i', serviceName: 'Lona', materialId: 'roll', widthCm: 150, heightCm: 200, quantity: 1, finishings: [] };
    const created = await call('/api/quotations/test', 'PUT', { number: 'ORC-TEST', status: 'RASCUNHO', customerId: 'ana', customerName: 'Ana', items: [item] });
    const approved = await call('/api/quotations/test/approve', 'POST', { revision: created.data.revision, workOrderId: 'os-original' });
    assert.equal(approved.data.totalAmount, 192);
    assert.equal((await call('/api/quotations/test', 'PUT', { ...approved.data, status: 'EM_REVISAO' })).status, 409);
    assert.equal((await call('/api/quotations/test/reopen', 'POST', { revision: 0, reason: 'Alterar' })).status, 409);
    assert.equal((await call('/api/quotations/test/reopen', 'POST', { revision: approved.data.revision, reason: '' })).status, 400);
    const draft = await call('/api/quotations/test/reopen', 'POST', { revision: approved.data.revision, reason: 'Cliente pediu outra peça' });
    assert.equal(draft.data.status, 'EM_REVISAO'); assert.equal(draft.data.commercialVersion, 2);
    assert.equal(draft.data.totalAmount, 192); assert.equal(draft.data.lastApprovedTotal, 192);
    assert.equal((await call('/api/quotations/test/reopen', 'POST', { revision: draft.data.revision, reason: 'Duplicar' })).status, 409);
    const saved = await call('/api/quotations/test', 'PUT', { ...draft.data, items: [item, { ...item, id: 'extra' }], commercialVersion: 99, workOrderId: 'wrong', customerId: 'wrong' });
    assert.equal(saved.data.totalAmount, 384); assert.equal(saved.data.workOrderId, 'os-original');
    assert.equal(saved.data.customerId, 'ana'); assert.equal(saved.data.commercialVersion, 2);
    const message = formatQuotationMessage(saved.data);
    assert.match(message, /VALOR TOTAL DO ORÇAMENTO:\*\n\*R\$ 384,00\*/);
    assert.equal((message.match(/º Serviço:/g) ?? []).length, 2);
    assert.equal((await call('/api/quotations/test/approve', 'POST', { revision: draft.data.revision })).status, 409);
    const reapproved = await call('/api/quotations/test/approve', 'POST', { revision: saved.data.revision, workOrderId: 'wrong' });
    assert.equal(reapproved.data.status, 'APROVADO'); assert.equal(reapproved.data.workOrderId, 'os-original');
    repository.close(); repository = createQuotationsRouter(() => material, dir);
    const history = (await call('/api/quotations/test/history')).data;
    assert.deepEqual(history.map(q => [q.commercialVersion, q.totalAmount]), [[2, 384], [1, 192]]);
    assert.equal(history[1].items.length, 1); assert.equal(history[0].items.length, 2);
    assert.equal((await call('/api/quotations')).data.length, 1);
    assert.equal((await call('/api/quotations/test/approve', 'POST', { revision: reapproved.data.revision })).status, 409);
    const legacy = { id: 'legacy', number: 'OLD', status: 'APROVADO', totalAmount: 777, serviceName: 'Preço antigo', workOrderId: 'old-os' };
    const legacyDraft = await call('/api/quotations/legacy/reopen', 'POST', { legacyQuotation: legacy, reason: 'Acrescentar serviço' });
    assert.equal(legacyDraft.data.totalAmount, 777); assert.equal(legacyDraft.data.workOrderId, 'old-os');
    assert.equal((await call('/api/quotations/legacy/history')).data[0].totalAmount, 777);
  } finally { server.closeAllConnections(); await new Promise<void>(r => server.close(() => r())); repository.close(); }
});

test('production pauses once; reapproval keeps OS identity, old payments and history without double charging', () => {
  const previous = { id: 'os-1', number: 'OS-1', quotationId: 'q', amountPaid: 100, totalAmount: 192, remainingBalance: 92, productionStatus: 'PRODUCAO', createdAt: '2026-01-01', statusHistory: [], designerName: 'Designer', productionResponsible: 'Operador' } as WorkOrder;
  const paused = pauseWorkOrderForRevision(previous, { commercialVersion: 2, revisionReason: 'Novo serviço' } as Quotation);
  assert.equal(paused.productionStatus, 'PAUSADO'); assert.equal(paused.amountPaid, 100);
  assert.equal(pauseWorkOrderForRevision(paused, {} as Quotation), paused);
  const next = updateWorkOrderAfterRevision(paused, { ...previous, id: 'new', number: 'NEW', totalAmount: 384, items: [] }, 50);
  assert.equal(next.id, 'os-1'); assert.equal(next.number, 'OS-1');
  assert.equal(next.amountPaid, 150); assert.equal(next.remainingBalance, 234);
  assert.equal(next.quotationRevisionPending, false); assert.equal(next.productionStatus, 'PRODUCAO_ARTES');
  assert.equal(next.statusHistory.length, 2); assert.equal(previous.statusHistory.length, 0);
  const reduced = updateWorkOrderAfterRevision(paused, { ...previous, totalAmount: 80 }, 0);
  assert.equal(reduced.amountPaid, 100); assert.equal(reduced.remainingBalance, 0);
  assert.throws(() => updateWorkOrderAfterRevision(paused, previous, -1));
});

test('paused revision has a compact indicator and cannot be advanced by the movement helper', () => {
  const order = { id: 'pending', number: 'OS-REVISION', customerName: 'Cliente de teste', serviceName: 'Lona', productionStatus: 'PAUSADO', quotationRevisionPending: true, deadlineDate: '2099-12-31', quantity: 1 } as WorkOrder;
  const html = renderToStaticMarkup(React.createElement(ProductionKanban, { workOrders: [order], onUpdateStatus: () => {} }));
  assert.match(html, /Serviços pausados/);
  assert.doesNotMatch(html, /OS-REVISION/);
  assert.throws(()=>moveProductionOrder(order,'PRODUCAO'),/revisão/);
});
