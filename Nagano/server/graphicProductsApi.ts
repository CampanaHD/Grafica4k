import {canPerform} from '../src/utils/permissions';
import { Router } from 'express';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { GraphicProduct } from '../src/types/graphicProduct';
import { validateGraphicProduct } from './graphicPricing';
import { PricingError } from './pricingValidation';

export function createGraphicProductsRouter(dataDir = process.env.PRINTSHOP_DATA_DIR || path.resolve('data')) {
  fs.mkdirSync(dataDir, { recursive: true });
  const db = new DatabaseSync(path.join(dataDir, 'graphic-products.sqlite'));
  // Additive, idempotent migration. Existing materials and quotation snapshots are untouched.
  db.exec(`CREATE TABLE IF NOT EXISTS graphic_products (id TEXT PRIMARY KEY, payload TEXT NOT NULL, revision INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS graphic_product_history (id INTEGER PRIMARY KEY, product_id TEXT NOT NULL, revision INTEGER NOT NULL, payload TEXT NOT NULL, changed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`);
  const get = (id: string): GraphicProduct | undefined => {
    const row = db.prepare('SELECT payload FROM graphic_products WHERE id=?').get(id);
    return row ? JSON.parse(String(row.payload)) : undefined;
  };
  const router = Router();
  router.get('/api/graphic-products', (_req, res) => res.json({ success: true, data: db.prepare('SELECT payload FROM graphic_products ORDER BY rowid').all().map(r => JSON.parse(String(r.payload))).filter(p=>!p.archived) }));
  router.delete('/api/graphic-products/:id', (req,res)=>{
    try {
      const previous=get(req.params.id);
      if(!previous)throw new PricingError('Produto não encontrado.',404);
      if(req.body.revision!==previous.revision)throw new PricingError('Produto alterado em outra sessão. Recarregue o cadastro.',409);
      const product={...previous,active:false,archived:true,revision:(previous.revision??0)+1};
      db.exec('BEGIN IMMEDIATE');
      try {
        db.prepare('UPDATE graphic_products SET payload=?,revision=? WHERE id=?').run(JSON.stringify(product),product.revision,product.id);
        db.prepare('INSERT INTO graphic_product_history(product_id,revision,payload) VALUES (?,?,?)').run(product.id,product.revision,JSON.stringify(product));
        db.exec('COMMIT');
      }catch(e){db.exec('ROLLBACK');throw e;}
      res.json({success:true,data:product});
    }catch(e){res.status(e instanceof PricingError?e.status:500).json({success:false,error:e instanceof PricingError?e.message:'Não foi possível excluir o produto.'});}
  });
  router.post('/api/graphic-products/validate', (req, res) => {
    try { res.json({ success: true, data: validateGraphicProduct(req.body) }); }
    catch (e) { res.status(e instanceof PricingError ? e.status : 500).json({ success: false, error: e instanceof PricingError ? e.message : 'Configuração inválida.' }); }
  });
  router.put('/api/graphic-products/:id', (req, res) => {
    try {
      const previous = get(req.params.id);
      if((req as any).naganoProfile&&!canPerform((req as any).naganoProfile,'settings',previous?'edit':'create'))throw new PricingError('Sem permissão para essa ação.',403);
      if (previous && req.body.revision !== previous.revision) throw new PricingError('Produto alterado em outra sessão. Recarregue o cadastro.', 409);
      const p = validateGraphicProduct({ ...req.body, id: req.params.id });
      const result = { ...p, revision: (previous?.revision ?? 0) + 1 };
      db.exec('BEGIN IMMEDIATE');
      try {
        db.prepare('INSERT INTO graphic_products VALUES (?,?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload,revision=excluded.revision').run(result.id, JSON.stringify(result), result.revision);
        db.prepare('INSERT INTO graphic_product_history(product_id,revision,payload) VALUES (?,?,?)').run(result.id, result.revision, JSON.stringify(result));
        db.exec('COMMIT');
      } catch (e) { db.exec('ROLLBACK'); throw e; }
      res.json({ success: true, data: result });
    } catch (e) { res.status(e instanceof PricingError ? e.status : 500).json({ success: false, error: e instanceof PricingError ? e.message : 'Falha ao salvar produto gráfico.' }); }
  });
  return { router, get, close: () => db.close() };
}
