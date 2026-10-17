import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { mkdirSync, mkdtempSync } from 'node:fs';
import path from 'node:path';
import { createQuotationsRouter } from '../server/quotationsApi';
import { isQuotationDueForDeletion, mergeQuotationSnapshot } from '../src/utils/quotationRetention';
import { Material, Quotation } from '../src/types';

test('30-day cleanup respects exact boundary, disabled option, protected references and invalid dates', () => {
  const q = {id:'q',status:'ENVIADO',createdAt:'2026-01-01T12:00:00Z'} as Quotation;
  const boundary = Date.parse('2026-01-31T12:00:00Z');
  assert.equal(isQuotationDueForDeletion(q,boundary-1),false);
  assert.equal(isQuotationDueForDeletion(q,boundary),true);
  for (const keep of [{...q,status:'APROVADO'},{...q,status:'EM_REVISAO'},{...q,workOrderId:'os'},{...q,createdAt:'invalid'},{...q,createdAt:'2027-01-01'}]) assert.equal(isQuotationDueForDeletion(keep as Quotation,boundary),false);
  assert.equal(isQuotationDueForDeletion(q,boundary,new Set(['q'])),false);
  assert.equal(mergeQuotationSnapshot({data:[],deletedIds:[],cleanupEnabled:false},[q],new Set(),boundary).length,1);
  assert.equal(mergeQuotationSnapshot({data:[],deletedIds:[],cleanupEnabled:true},[q],new Set(),boundary).length,0);
  assert.equal(mergeQuotationSnapshot({data:[],deletedIds:['q'],cleanupEnabled:false},[q],new Set(),boundary).length,0);
});

test('server cleanup persists option and deleted IDs, preserves approvals/history and rejects stale resurrection', async () => {
  const root = path.resolve('work/test-data'); mkdirSync(root,{recursive:true});
  const dir = mkdtempSync(path.join(root,'retention-'));
  const material = {id:'unit',controlType:'UNIT',active:true} as Material;
  let repo = createQuotationsRouter(()=>material,dir);
  const app = express(); app.use(express.json()); app.use((req,res,next)=>repo.router(req,res,next));
  const server = app.listen(0,'127.0.0.1'); await new Promise<void>(r=>server.once('listening',r));
  const url = `http://127.0.0.1:${(server.address() as any).port}`;
  const call = async (route:string,method='GET',body?:unknown) => {const response=await fetch(url+route,{method,...(body?{headers:{'content-type':'application/json'},body:JSON.stringify(body)}:{})}); return {status:response.status,...await response.json()};};
  const q = {id:'old',number:'ORC-OLD',createdAt:'2020-01-01',status:'RASCUNHO',items:[{id:'i',materialId:'unit',quantity:1,subtotal:10}],totalAmount:10};
  try {
    assert.equal((await call('/api/quotation-retention')).enabled,false);
    const pending = (await call('/api/quotations/old','PUT',q)).data;
    const approvedDraft = (await call('/api/quotations/approved','PUT',{...q,id:'approved'})).data;
    await call('/api/quotations/approved/approve','POST',{revision:approvedDraft.revision,workOrderId:'os'});
    await call('/api/quotations/fresh','PUT',{...q,id:'fresh',createdAt:new Date().toISOString()});
    assert.equal((await call('/api/quotations')).data.length,3);
    const enabled = await call('/api/quotation-retention','PUT',{enabled:true});
    assert.equal(enabled.deletedCount,1);
    assert.deepEqual((await call('/api/quotations')).data.map(quote=>quote.id).sort(),['approved','fresh']);
    assert.deepEqual((await call('/api/quotations')).deletedIds,['old']);
    assert.equal((await call('/api/quotations/old','PUT',pending)).status,410);
    assert.equal((await call('/api/quotations/approved/history')).data.length,1);
    repo.close(); repo=createQuotationsRouter(()=>material,dir);
    assert.equal((await call('/api/quotation-retention')).enabled,true);
    await call('/api/quotation-retention','PUT',{enabled:false});
    assert.deepEqual((await call('/api/quotations')).deletedIds,['old']);
  } finally {server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));repo.close();}
});
