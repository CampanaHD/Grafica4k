import {canPerform} from '../src/utils/permissions';
import {isMaintenanceBusy,legacyImportDisabled} from './maintenance/runtime';
import {addComposedFinishings} from './erp/finishingComposition';
import type {FinishOption} from '../src/types';
import {addStockFinishings} from './erp/finishingPricing';
import {redactCosts} from '../src/utils/costAccess';
import {canViewCosts} from '../src/utils/profileAccess';
import { GraphicProduct } from '../src/types/graphicProduct';
import { Router } from 'express';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { Material, Quotation, Service } from '../src/types';
import { visualServiceMaterial } from './visualPricing';
import { calculateQuotationItem, priceRollItem, priceQuotation, PricingError } from './quotationPricing';
import { simulateQuotation } from './quotationSimulation';
import { isQuotationDueForDeletion } from '../src/utils/quotationRetention';
import { actorOf } from './auth';
import type { ThirdParty, ActorStamp } from '../src/types/team';

export function createQuotationsRouter(getMaterial: (id: string) => Material | undefined, dataDir = process.env.PRINTSHOP_DATA_DIR || path.resolve('data'), getProduct: (id: string) => GraphicProduct | undefined = () => undefined, getService?: (id:string)=>Service|undefined, team?:{beforeCleanup?:()=>Promise<void>;getFinish?:(id:string,version?:string)=>FinishOption|undefined;getStockItem?:(id:string)=>any;getThirdParty:(id:string)=>ThirdParty|undefined;onSaved:(quote:Quotation,actor:ActorStamp)=>void}) {
  fs.mkdirSync(dataDir, { recursive: true });
  const db = new DatabaseSync(path.join(dataDir, 'quotations.sqlite'));
  db.exec('CREATE TABLE IF NOT EXISTS quotations (id TEXT PRIMARY KEY, payload TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 1)');
  db.exec('CREATE TABLE IF NOT EXISTS quotation_approved_versions (quotation_id TEXT NOT NULL, version INTEGER NOT NULL, payload TEXT NOT NULL, archived_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY(quotation_id, version))');
  db.exec('CREATE TABLE IF NOT EXISTS quotation_retention (id INTEGER PRIMARY KEY CHECK(id=1), enabled INTEGER NOT NULL DEFAULT 0)');
  db.exec('INSERT OR IGNORE INTO quotation_retention(id, enabled) VALUES(1,0)');
  db.exec('CREATE TABLE IF NOT EXISTS quotation_deleted_ids (id TEXT PRIMARY KEY, deleted_at TEXT NOT NULL)');
  const cleanupEnabled = () => Boolean(db.prepare('SELECT enabled FROM quotation_retention WHERE id=1').get()?.enabled);
  const cleanup = (now = Date.now(),backedUp=false) => {
    if (isMaintenanceBusy()||!cleanupEnabled()||team?.beforeCleanup&&!backedUp) return 0;
    const approvedIds = new Set(db.prepare('SELECT DISTINCT quotation_id FROM quotation_approved_versions').all().map(row => String(row.quotation_id)));
    const candidates = db.prepare('SELECT id,payload FROM quotations').all().filter(row => isQuotationDueForDeletion(JSON.parse(String(row.payload)), now, approvedIds));
    db.exec('BEGIN IMMEDIATE');
    try {
      for (const row of candidates) {
        db.prepare('INSERT OR IGNORE INTO quotation_deleted_ids(id,deleted_at) VALUES(?,?)').run(String(row.id), new Date(now).toISOString());
        db.prepare('DELETE FROM quotations WHERE id=?').run(String(row.id));
      }
      db.exec('COMMIT');
    } catch (error) { db.exec('ROLLBACK'); throw error; }
    return candidates.length;
  };
  let cleanupTask:Promise<number>|undefined;
  const guardedCleanup=()=>{if(cleanupTask)return cleanupTask;if(!team?.beforeCleanup)return Promise.resolve(cleanup());
    if(isMaintenanceBusy()||!cleanupEnabled())return Promise.resolve(0);const approved=new Set(db.prepare('SELECT DISTINCT quotation_id FROM quotation_approved_versions').all().map(r=>String(r.quotation_id)));if(!db.prepare('SELECT payload FROM quotations').all().some(r=>isQuotationDueForDeletion(JSON.parse(String(r.payload)),Date.now(),approved)))return Promise.resolve(0);
    cleanupTask=team.beforeCleanup().then(()=>cleanup(Date.now(),true)).finally(()=>{cleanupTask=undefined;});return cleanupTask;
  };
  void guardedCleanup().catch(()=>console.error('Limpeza de orçamentos impedida: backup não validado.'));
  const cleanupTimer=setInterval(()=>{void guardedCleanup().catch(()=>console.error('Limpeza de orçamentos impedida: backup não validado.'));},3600000);
  cleanupTimer.unref();
  db.exec('CREATE TABLE IF NOT EXISTS quotation_sync_outbox(id TEXT PRIMARY KEY,payload TEXT NOT NULL,actor TEXT NOT NULL)');
  let transactionDepth=0;
  const router = Router();router.use((req:any,res,next)=>{if(req.naganoProfile&&!canViewCosts(req.naganoProfile)){const json=res.json.bind(res);res.json=(body:any)=>json(redactCosts(body));}next();});
  const get = (id: string) => {
    const row = db.prepare('SELECT payload, revision FROM quotations WHERE id = ?').get(id);
    return row ? { ...JSON.parse(String(row.payload)), revision: Number(row.revision) } as Quotation : undefined;
  };
  const save = (quote: Quotation):Quotation => {
    if(!transactionDepth)return transaction(()=>save(quote));
    const revision = (get(quote.id)?.revision ?? 0) + 1;
    const result = { ...quote, revision };
    db.prepare('INSERT INTO quotations (id,payload,revision) VALUES (?,?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload,revision=excluded.revision').run(quote.id, JSON.stringify(result), revision);
    if(team&&result.updatedBy)db.prepare('INSERT INTO quotation_sync_outbox VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload,actor=excluded.actor').run(quote.id,JSON.stringify(result),JSON.stringify(result.updatedBy));
    return result;
  };
  const stamp=(quote:Quotation,req:any,previous?:Quotation):Quotation=>{
    const actor=actorOf(req);if(!actor)return quote;
    return {...quote,createdBy:previous?previous.createdBy:actor,updatedBy:actor,salespersonName:previous?(previous.createdBy?.name||previous.salespersonName):actor.name};
  };
  const synchronize=(quote:Quotation,actor:ActorStamp)=>{team?.onSaved(quote,actor);db.prepare('DELETE FROM quotation_sync_outbox WHERE id=?').run(quote.id);};
  const flushPending=()=>{for(const row of db.prepare('SELECT payload,actor FROM quotation_sync_outbox').all())synchronize(JSON.parse(String(row.payload)),JSON.parse(String(row.actor)));};
  const signedResponse=(req:any,res:any,quote:Quotation)=>{const actor=actorOf(req);if(actor)synchronize(quote,actor);res.json({success:true,data:quote});};
  const endpoint = (handler:(req:any,res:any)=>any)=>(req:any,res:any)=>{Promise.resolve().then(()=>handler(req,res)).catch(error=>{const expected=error instanceof PricingError||[400,403,404,409].includes(error.status);res.status(expected?error.status:500).json({success:false,error:expected?error.message:'Não foi possível processar o orçamento.'});});};
  const transaction = <T,>(action: () => T): T => {
    if(transactionDepth)return action();db.exec('BEGIN IMMEDIATE');transactionDepth++;
    try { const result = action(); db.exec('COMMIT'); return result; }
    catch (error) { db.exec('ROLLBACK'); throw error; }finally{transactionDepth--;}
  };
  const archive = (quote: Quotation) => {
    db.prepare('INSERT INTO quotation_approved_versions(quotation_id,version,payload) VALUES(?,?,?) ON CONFLICT(quotation_id,version) DO NOTHING').run(quote.id, quote.commercialVersion ?? 1, JSON.stringify(quote));
  };
  const preview = endpoint((req, res) => {
    const source = req.body.item ?? req.body;
    if(req.naganoProfile&&(!canViewCosts(req.naganoProfile)||!canPerform(req.naganoProfile,'costs','edit'))&&source.internalCosts&&Object.values(source.internalCosts).some(v=>Number(v)!==0))throw new PricingError('Sem permissão para informar custos internos.',403);
    // Compatibility for callers of the previous dimension-only endpoint.
    const input = { ...source, widthCm: source.widthCm ?? source.finishedWidthCm, heightCm: source.heightCm ?? source.finishedHeightCm, orientation: source.orientation ?? source.requestedOrientation };
    res.json({ success: true, ...calculateQuotationItem(input, getMaterial, getProduct, getService,team?.getStockItem,team?.getFinish) });
  });
  router.post('/api/quotations/calculate-item', preview);
  router.post('/api/quotations/simulate', endpoint((req, res) => {
    const source = req.body.item;
    const material = getMaterial(source?.materialId ?? '');
    if (!material) throw new PricingError('Material não encontrado.');
    const service=getService?.(source.serviceId??'');
    if(getService && !['PER_SQM','PER_LINM','POR_AREA_CONSUMIDA_BOBINA'].includes(service?.pricingMethod??''))throw new PricingError('Escolha um serviço com cobrança por m² ou metro linear para simular quantidades.');
    const simulationSource={...source,finishings:(source.finishings||[]).filter((f:any)=>!f.compositionVersion)};
    const simulation=simulateQuotation(getService?visualServiceMaterial(service,material):material,getService?{...simulationSource,serviceId:service!.id,serviceName:typeof source.serviceName==='string'?source.serviceName.trim()||service!.name:service!.name}:simulationSource,req.body.quantities,service);
    if(source.stockFinishings?.length||source.finishings?.some((f:any)=>f.compositionVersion)){simulation.options=simulation.options.map(o=>{const priced=addComposedFinishings(addStockFinishings({item:o.item},{...source,quantity:o.quantity},team?.getStockItem),source,team?.getFinish).item;return {...o,item:priced,total:priced.subtotal,unitPrice:priced.subtotal/priced.quantity};});const base=simulation.options[0].unitPrice;simulation.options=simulation.options.map(o=>({...o,saving:Math.round(Math.max(0,base*o.quantity-o.total)*100)/100,savingPercentage:base?Math.round(Math.max(0,100*(base-o.unitPrice)/base)*100)/100:0}));simulation.lowestUnitPriceQuantity=simulation.options.reduce((best,o)=>o.unitPrice<best.unitPrice?o:best).quantity;}
    res.json(simulation);
  }));
  router.post('/api/calculate-roll', endpoint((req, res) => {
    const source = req.body.item ?? req.body;
    const material = getMaterial(source.materialId);
    if (!material) throw new PricingError('Material não encontrado.');
    const input={...source,widthCm:source.widthCm??source.finishedWidthCm,heightCm:source.heightCm??source.finishedHeightCm,orientation:source.orientation??source.requestedOrientation};
    res.json({ success: true, ...(getService?calculateQuotationItem(input,getMaterial,getProduct,getService,team?.getStockItem,team?.getFinish):priceRollItem(material,input)) });
  }));
  router.get('/api/quotations', endpoint(async(_req, res) => {
    await guardedCleanup();
    res.json({ success: true, cleanupEnabled: cleanupEnabled(), deletedIds: db.prepare('SELECT id FROM quotation_deleted_ids').all().map(row => String(row.id)), data: db.prepare('SELECT payload FROM quotations ORDER BY rowid DESC').all().map(row => JSON.parse(String(row.payload))) });
  }));
  router.get('/api/quotation-retention', endpoint((_req, res) => res.json({ success: true, enabled: cleanupEnabled(), days: 30 })));
  router.put('/api/quotation-retention', endpoint(async(req, res) => {
    if (typeof req.body.enabled !== 'boolean') throw new PricingError('Informe se a exclusão automática está ativada.');
    db.prepare('UPDATE quotation_retention SET enabled=? WHERE id=1').run(req.body.enabled ? 1 : 0);
    res.json({ success: true, enabled: cleanupEnabled(), days: 30, deletedCount: await guardedCleanup() });
  }));
  router.get('/api/quotations/:id', endpoint((req, res) => {
    const quote = get(req.params.id);
    if (!quote) throw new PricingError('Orçamento não encontrado.', 404);
    res.json({ success: true, data: quote });
  }));
  router.put('/api/quotations/:id', endpoint((req, res) => {
    if (db.prepare('SELECT id FROM quotation_deleted_ids WHERE id=?').get(req.params.id)) throw new PricingError('Este orçamento foi excluído pela limpeza automática. Atualize a página e crie um novo orçamento.', 410);
    const previous = get(req.params.id);
    if(req.naganoProfile&&req.method==='PUT'&&!canPerform(req.naganoProfile,'quotations',previous?'edit':'create'))throw new PricingError('Sem permissão para essa ação no orçamento.',403);
    if ((previous && (['APROVADO', 'REJEITADO', 'EXPIRADO', 'CANCELADO'].includes(previous.status) || (previous.workOrderId && previous.status !== 'EM_REVISAO'))) || req.body.status === 'APROVADO') throw new PricingError('Use Revisar orçamento para alterar uma versão aprovada.', 409);
    if (previous && req.body.revision !== previous.revision) throw new PricingError('O orçamento foi alterado em outra sessão. Atualize a página.', 409);
    if (req.body.status === 'EM_REVISAO' && previous?.status !== 'EM_REVISAO') throw new PricingError('Reabra o orçamento pela opção Revisar.', 409);
    if(req.naganoProfile&&(!canViewCosts(req.naganoProfile)||!canPerform(req.naganoProfile,'costs','edit')))req.body.items=(req.body.items||[]).map((row:any)=>{const old=previous?.items?.find(i=>i.id===row.id);if(row.internalCosts&&Object.entries(row.internalCosts).some(([k,v])=>Number(v)!==Number(old?.internalCosts?.[k]||0)))throw new PricingError('Sem permissão para alterar custos internos.',403);return {...row,internalCosts:old?.internalCosts};});
    if(req.naganoProfile&&(!canViewCosts(req.naganoProfile)||!canPerform(req.naganoProfile,'costs','edit'))&&Array.isArray(req.body.outsourcedServices))req.body.outsourcedServices=req.body.outsourcedServices.map((row:any)=>{if(row.value!==undefined)return row;const old=previous?.outsourcedServices?.find(i=>i.id===row.id);if(!old||old.value!==undefined||row.cost!==undefined&&row.cost!==old.cost)throw new PricingError('Sem permissão para alterar custos internos de terceiros.',403);return {...row,cost:old.cost};});
    const quote = priceQuotation({ ...req.body, id: req.params.id,
      number: previous?.number ?? (actorOf(req)?`ORC-${new Date().getFullYear()}-${String(Number(db.prepare('SELECT COUNT(*) AS count FROM quotations').get()!.count)+1).padStart(4,'0')}`:req.body.number), createdAt: previous?.createdAt ?? (actorOf(req)?.at||req.body.createdAt),
      status: previous?.status === 'EM_REVISAO' ? 'EM_REVISAO' : req.body.status,
      customerId: previous?.status === 'EM_REVISAO' ? previous.customerId : req.body.customerId,
      customerName: previous?.status === 'EM_REVISAO' ? previous.customerName : req.body.customerName,
      commercialVersion: previous?.commercialVersion ?? 1, revisionReason: previous?.revisionReason,
      revisedAt: previous?.revisedAt, lastApprovedTotal: previous?.lastApprovedTotal, workOrderId: previous?.workOrderId,
    }, getMaterial, getProduct, getService,team?.getThirdParty,team?.getStockItem,team?.getFinish);
    signedResponse(req,res,save(stamp(quote,req,previous)));
  }));
  router.get('/api/quotations/:id/history', endpoint((req, res) => {
    res.json({ success: true, data: db.prepare('SELECT payload FROM quotation_approved_versions WHERE quotation_id=? ORDER BY version DESC').all(req.params.id).map(row => JSON.parse(String(row.payload))) });
  }));
  router.post('/api/quotations/:id/reject',endpoint((req,res)=>{
    const previous=get(req.params.id);
    if(!previous)throw new PricingError('Orçamento não encontrado.',404);
    if(previous.revision!==req.body.revision)throw new PricingError('O orçamento foi alterado. Atualize a lista.',409);
    if(previous.workOrderId||['APROVADO','EM_REVISAO','REJEITADO','CANCELADO','EXPIRADO'].includes(previous.status))throw new PricingError('Este orçamento já foi aprovado ou encerrado.',409);
    const reason=typeof req.body.reason==='string'?req.body.reason.trim().slice(0,2000):'';
    signedResponse(req,res,save(stamp({...previous,status:'REJEITADO',rejectionReason:reason},req,previous)));
  }));
  router.post('/api/quotations/:id/reopen', endpoint((req, res) => {
    let previous = get(req.params.id);
    if (!previous) {
      // Existing local-only approvals are imported verbatim, never recalculated on reopen.
      const legacy = req.body.legacyQuotation;
      if (!legacy || legacy.id !== req.params.id || legacy.status !== 'APROVADO' || legacy.revision !== undefined || !Number.isFinite(legacy.totalAmount) || legacy.totalAmount < 0 || !legacy.number) throw new PricingError('Orçamento aprovado não encontrado.', 404);
      previous = { ...legacy, commercialVersion: 1, revision: undefined };
    } else if (req.body.revision !== previous.revision) throw new PricingError('O orçamento mudou. Atualize a página antes de revisar.', 409);
    if (previous.status !== 'APROVADO') throw new PricingError('Somente um orçamento aprovado pode ser reaberto.', 409);
    if (typeof req.body.reason !== 'string' || req.body.reason.trim().length < 3) throw new PricingError('Informe o motivo da alteração.');
    const workOrderId = previous.workOrderId ?? req.body.workOrderId;
    if (workOrderId !== undefined && typeof workOrderId !== 'string') throw new PricingError('Ordem de serviço inválida.');
    const approved = previous;
    const draft = transaction(() => {
      archive(approved);
      return save(stamp({ ...approved, workOrderId, status: 'EM_REVISAO', commercialVersion: (approved.commercialVersion ?? 1) + 1,
        revisionReason: req.body.reason.trim(), revisedAt: new Date().toISOString(), lastApprovedTotal: approved.totalAmount },req,approved));
    });
    signedResponse(req,res,draft);
  }));
  router.post('/api/quotations/:id/approve', endpoint((req, res) => {
    const previous = get(req.params.id);
    if(req.naganoProfile&&req.method==='PUT'&&!canPerform(req.naganoProfile,'quotations',previous?'edit':'create'))throw new PricingError('Sem permissão para essa ação no orçamento.',403);
    if (!previous) throw new PricingError('Salve o orçamento antes de aprovar.', 404);
    if(previous.status==='APROVADO'&&req.body.workOrderId===previous.workOrderId&&req.body.revision===previous.revision-1){signedResponse(req,res,previous);return;}
    if (['APROVADO', 'REJEITADO', 'EXPIRADO', 'CANCELADO'].includes(previous.status)) throw new PricingError('Orçamento já aprovado ou encerrado.', 409);
    if (req.body.revision !== previous.revision) throw new PricingError('O orçamento mudou. Atualize a página antes de aprovar.', 409);
    // Approval freezes the stored quote, rather than repricing historical terms.
    const workOrderId = previous.workOrderId ?? req.body.workOrderId;
    if (workOrderId !== undefined && typeof workOrderId !== 'string') throw new PricingError('Ordem de serviço inválida.');
    const approved = transaction(() => {
      const result = save(stamp({ ...previous, workOrderId, commercialVersion: previous.commercialVersion ?? 1, status: 'APROVADO' },req,previous));
      archive(result);
      return result;
    });
    signedResponse(req,res,approved);
  }));
  const getApproved=(id:string):Quotation|undefined=>{
    const current=get(id);
    if(current?.status==='APROVADO')return current;
    if(current&&['CANCELADO','REJEITADO','EXPIRADO'].includes(current.status))return undefined;
    const row=db.prepare('SELECT payload FROM quotation_approved_versions WHERE quotation_id=? ORDER BY version DESC LIMIT 1').get(id);
    return row?JSON.parse(String(row.payload)):undefined;
  };
  return { router, get, getApproved, cleanup, flushPending, close: () => { clearInterval(cleanupTimer); db.close(); } };
}


