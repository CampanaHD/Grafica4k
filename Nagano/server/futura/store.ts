import { DatabaseSync } from 'node:sqlite';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { FuturaImport, FuturaProduct, FuturaShipping } from '../../src/types/futura';
import { ServiceGroup } from '../../src/types/graphicProduct';
import { PricingError } from '../pricingValidation';
import { validateGraphicProduct } from '../graphicPricing';

export const fingerprint = (value: unknown) => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
export function configurationKey(p: FuturaProduct) { return fingerprint([p.sourceProductId, p.url, p.quantity, Object.entries(p.configuration).sort(([a], [b]) => a.localeCompare(b))]); }
export function compatibleConfiguration(previous: FuturaProduct, current: FuturaProduct) {
  if (configurationKey(previous) === configurationKey(current)) return true;
  // One-time enrichment of older imports whose parser omitted model/open format.
  // Identity, lot and every previously known attribute must still match exactly.
  return previous.configurationVersion === undefined && current.configurationVersion === 2
    && previous.sourceProductId === current.sourceProductId && previous.url === current.url && previous.quantity === current.quantity
    && Object.entries(previous.configuration).every(([key, value]) => current.configuration[key] === value);
}
export class FuturaStore {
  readonly db: DatabaseSync;
  constructor(dataDir: string) {
    fs.mkdirSync(dataDir, { recursive: true });
    this.db = new DatabaseSync(path.join(dataDir, 'futura.sqlite'));
    this.db.exec(`PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS futura_imports (id TEXT PRIMARY KEY, sku TEXT NOT NULL, service_group TEXT NOT NULL, payload TEXT NOT NULL, UNIQUE(sku,service_group));
      CREATE TABLE IF NOT EXISTS futura_audit (id TEXT PRIMARY KEY, timestamp TEXT NOT NULL, user TEXT NOT NULL, action TEXT NOT NULL, entity TEXT NOT NULL, entityId TEXT NOT NULL, details TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS futura_sync (id TEXT PRIMARY KEY, last_attempt TEXT NOT NULL, error TEXT);
    `);
    this.db.prepare('ATTACH DATABASE ? AS products').run(path.join(dataDir, 'graphic-products.sqlite'));
    this.db.prepare('ATTACH DATABASE ? AS materials_db').run(path.join(dataDir, 'materials.sqlite'));
    this.db.exec(`CREATE TABLE IF NOT EXISTS products.graphic_products (id TEXT PRIMARY KEY, payload TEXT NOT NULL, revision INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS products.graphic_product_history (id INTEGER PRIMARY KEY, product_id TEXT NOT NULL, revision INTEGER NOT NULL, payload TEXT NOT NULL, changed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
      CREATE TABLE IF NOT EXISTS materials_db.materials (id TEXT PRIMARY KEY, payload TEXT NOT NULL)`);
  }
  get(id: string): FuturaImport {
    const row = this.db.prepare('SELECT payload FROM futura_imports WHERE id=?').get(id);
    if (!row) throw new PricingError('Importação Futura não encontrada.', 404);
    return JSON.parse(String(row.payload));
  }
  target(record: FuturaImport) {
    const table = record.serviceGroup === 'GRAPHIC_PRODUCTS' ? 'products.graphic_products' : 'materials_db.materials';
    const row = this.db.prepare(`SELECT payload FROM ${table} WHERE id=?`).get(record.targetId);
    if (!row) throw new PricingError('O cadastro importado foi removido. Reimporte a configuração ou restaure o cadastro.', 409);
    return JSON.parse(String(row.payload));
  }
  isManaged(record: FuturaImport, target = this.target(record)) {
    return record.serviceGroup === 'GRAPHIC_PRODUCTS'
      ? target.pricingMethod === 'QUANTITY_PRICE_TABLE' && target.priceTable?.length === 1 && target.priceTable[0].quantity === record.product.quantity && Math.round(target.priceTable[0].batchPrice * 100) === record.salePriceCents
      : target.controlType === 'UNIT' && target.futuraImportId === record.id && Math.round(target.salePrice * 100) === record.salePriceCents;
  }
  list() {
    return this.db.prepare('SELECT payload FROM futura_imports ORDER BY rowid DESC').all().map(row => {
      const record: FuturaImport = JSON.parse(String(row.payload));
      let managed = false, active = false;
      try { const target = this.target(record); managed = this.isManaged(record, target); active = target.active; } catch { /* Removed target remains in history. */ }
      const sync = this.db.prepare('SELECT last_attempt,error FROM futura_sync WHERE id=?').get(record.id);
      return { ...record, priceSource: managed ? 'FUTURA_IM' as const : 'MANUAL' as const, active, lastAttemptAt: sync?.last_attempt, syncError: sync?.error };
    });
  }
  audit(action: string, id: string, actor: string, details: unknown) {
    this.db.prepare('INSERT INTO futura_audit VALUES (?,?,?,?,?,?,?)').run(crypto.randomUUID(), new Date().toISOString(), actor.slice(0, 120), action, 'FUTURA_PRODUCT', id, JSON.stringify(details));
  }
  history() { return this.db.prepare('SELECT * FROM futura_audit ORDER BY timestamp DESC LIMIT 100').all(); }
  syncResult(id: string, error?: string) {
    this.db.prepare('INSERT INTO futura_sync VALUES (?,?,?) ON CONFLICT(id) DO UPDATE SET last_attempt=excluded.last_attempt,error=excluded.error').run(id, new Date().toISOString(), error ?? null);
  }
  save(product: FuturaProduct, group: ServiceGroup, multiplier: string, salePriceCents: number, actor: string, previous?: FuturaImport, expectedTarget?: string, shipping?: FuturaShipping): FuturaImport {
    const id = previous?.id ?? crypto.randomUUID(), targetId = previous?.targetId ?? `futura-${id}`;
    const record: FuturaImport = { id, targetId, sourceProvider: 'FUTURA_IM', priceSource: 'FUTURA_IM', serviceGroup: group,
      revision: (previous?.revision ?? 0) + 1, product: { ...product, options: [] }, markupMultiplier: multiplier, salePriceCents, shipping, lastSyncAt: new Date().toISOString() };
    this.db.exec('BEGIN IMMEDIATE');
    try {
      let target: any;
      if (previous) {
        const current = this.get(previous.id);
        target = this.target(current);
        if (current.revision !== previous.revision || fingerprint(target) !== expectedTarget) throw new PricingError('O produto mudou durante a consulta. Consulte novamente.', 409);
        if (!compatibleConfiguration(current.product, product)) throw new PricingError('A configuração da Futura mudou. Importe a nova configuração separadamente.', 409);
      } else if (this.db.prepare('SELECT id FROM futura_imports WHERE sku=? AND service_group=?').get(product.sourceProductId, group)) {
        throw new PricingError('Esta configuração já foi importada neste grupo. Use Atualizar preço.', 409);
      }
      const oldPriceCents = target ? Math.round((group === 'GRAPHIC_PRODUCTS' ? target.priceTable[0].batchPrice : target.salePrice) * 100) : undefined;
      const specification = Object.entries(product.configuration).map(([key, value]) => `${key}: ${value}`).join('; ');
      if (group === 'GRAPHIC_PRODUCTS') {
        const p = { ...validateGraphicProduct({ ...(target ?? {}), id: targetId, serviceGroup: group, name: target?.name ?? `${product.name} — ${product.quantity.toLocaleString('pt-BR')} un. [${product.sourceProductId}]`,
          code: target?.code ?? `FUT-${product.sourceProductId}`, category: target?.category ?? 'FuturaIM', description: target?.description ?? '', specification,
          active: target?.active ?? true, pricingMethod: 'QUANTITY_PRICE_TABLE', priceTable: [{ quantity: product.quantity, batchPrice: salePriceCents / 100 }] }),
          revision: (target?.revision ?? 0) + 1 };
        this.db.prepare('INSERT INTO products.graphic_products VALUES (?,?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload,revision=excluded.revision').run(targetId, JSON.stringify(p), p.revision);
        this.db.prepare('INSERT INTO products.graphic_product_history(product_id,revision,payload) VALUES (?,?,?)').run(targetId, p.revision, JSON.stringify(p));
      } else {
        const p = { ...(target ?? {}), id: targetId, futuraImportId: id, name: target?.name ?? `${product.name} (lote de ${product.quantity}) [${product.sourceProductId}]`,
          description: specification, code: target?.code ?? `FUT-${product.sourceProductId}`, category: target?.category ?? 'Comunicação Visual / Futura',
          controlType: 'UNIT', calculationUnit: 'UNIT', salePrice: salePriceCents / 100, referenceCost: (product.sourcePriceCents + (shipping?.priceCents ?? 0)) / 100,
          supplier: 'FuturaIM', unit: `lote de ${product.quantity}`, active: target?.active ?? true, allowedRollWidths: [], availableRolls: [],
          allowRotation: false, autoFindLowestCost: false, allowManualRollOverride: false, volumeDiscountEnabled: false, discountTiers: [],
          costPerSqm: 0, costPerLinm: 0, sellingPriceSqm: 0, minimumCharge: 0, expectedWastePct: 0,
          defaultReinforcementCm: 0, defaultHemCm: 0, defaultRodPocketCm: 0, defaultBleedCm: 0, defaultEdgeSafetyCm: 0 };
        this.db.prepare('INSERT INTO materials_db.materials VALUES (?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload').run(targetId, JSON.stringify(p));
      }
      this.db.prepare('INSERT INTO futura_imports VALUES (?,?,?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload').run(id, product.sourceProductId, group, JSON.stringify(record));
      this.audit(previous ? 'FUTURA_PRICE_REFRESHED' : 'FUTURA_PRODUCT_IMPORTED', id, actor, {
        oldPriceCents, newPriceCents: salePriceCents, sourcePriceCents: product.sourcePriceCents, multiplier, sourcePriceFetchedAt: product.fetchedAt,
        oldShipping: previous?.shipping, shipping,
      });
      this.syncResult(id);
      this.db.exec('COMMIT');
      return record;
    } catch (e) { this.db.exec('ROLLBACK'); throw e; }
  }
  close() { this.db.close(); }
}
