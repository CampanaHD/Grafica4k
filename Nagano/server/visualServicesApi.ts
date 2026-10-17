import {requireCollectionActions} from './actionPermissions';
import {canPerform} from '../src/utils/permissions';
import {legacyImportDisabled} from './maintenance/runtime';
import { Router } from 'express';
import {canViewCosts} from '../src/utils/profileAccess';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import type { Material, Service } from '../src/types';
import { PricingError, numberInput } from './pricingValidation';

export function migrateVisualServices(services: Service[], materials: Material[]) {
  return services.map(service => {
    const {materialPrices:_obsolete,...saved}=service;
    if (service.serviceGroup === 'GRAPHIC_PRODUCTS') return saved;
    const candidates = materials.filter(m => !m.futuraImportId && (service.allowedMaterialIds?.length ? service.allowedMaterialIds.includes(m.id) : service.defaultMaterialId ? m.id === service.defaultMaterialId : true));
    const defaultMaterial = candidates.find(m => m.id === service.defaultMaterialId) ?? candidates[0];
    return { ...saved, serviceGroup: 'VISUAL_COMMUNICATION' as const,
      allowedMaterialIds: candidates.map(m => m.id),
      volumeDiscountEnabled: service.volumeDiscountEnabled ?? defaultMaterial?.volumeDiscountEnabled ?? false,
      areaDiscountTiers: service.areaDiscountTiers ?? defaultMaterial?.discountTiers ?? [],
    };
  });
}
function validate(services: unknown): Service[] {
  if (!Array.isArray(services) || services.length > 10000) throw new PricingError('Lista de serviços inválida.');
  const ids = new Set<string>();
  return services.map(source => {
    if (!source || typeof source.id !== 'string' || !source.id || ids.has(source.id) || typeof source.name !== 'string' || !source.name.trim()) throw new PricingError('Preencha o nome e a identificação única de cada serviço.');
    ids.add(source.id);
    if (!['PER_SQM','PER_LINM','PER_UNIT','FIXED','HOURLY','POR_AREA_CONSUMIDA_BOBINA'].includes(source.pricingMethod)) throw new PricingError('Forma de cobrança do serviço inválida.');
    if (source.serviceGroup && !['VISUAL_COMMUNICATION','GRAPHIC_PRODUCTS'].includes(source.serviceGroup)) throw new PricingError('Classificação inválida.');
    if (typeof source.active !== 'boolean') throw new PricingError('Status do serviço inválido.');
    for (const key of ['basePrice','minimumCharge','setupFee','hourlyRate','referencePrice'] as const) if (source[key] !== undefined) numberInput(source[key],key);
    if (source.allowedMaterialIds && (!Array.isArray(source.allowedMaterialIds) || source.allowedMaterialIds.some(id=>typeof id!=='string'))) throw new PricingError('Materiais permitidos inválidos.');
    if(source.areaDiscountTiers!==undefined&&!Array.isArray(source.areaDiscountTiers))throw new PricingError('Faixas de desconto inválidas.');
    const areas = new Set<number>();
    for (const tier of source.areaDiscountTiers ?? []) {
      const area=numberInput(tier.minimumArea,'Área mínima'); const pct=numberInput(tier.percentage,'Desconto');
      if (pct>100 || areas.has(area)) throw new PricingError('Faixa de desconto inválida ou repetida.'); areas.add(area);
    }
    const {materialPrices:_obsolete,...saved}=source;
    return {...saved,name:source.name.trim()} as Service;
  });
}
export function createVisualServicesRouter(getMaterials: () => Material[], dataDir=process.env.PRINTSHOP_DATA_DIR || path.resolve('data')) {
  fs.mkdirSync(dataDir,{recursive:true}); const db=new DatabaseSync(path.join(dataDir,'visual-services.sqlite'));
  db.exec('CREATE TABLE IF NOT EXISTS service_catalog(id INTEGER PRIMARY KEY CHECK(id=1),payload TEXT NOT NULL)');
  const list=():Service[]=>{const row=db.prepare('SELECT payload FROM service_catalog WHERE id=1').get();return row?JSON.parse(String(row.payload)).map(({materialPrices:_obsolete,...service}:Service)=>service):[];};
  const revision=()=>crypto.createHash('sha256').update(JSON.stringify(list())).digest('hex');
  const result=()=>({success:true,data:list(),revision:revision()});
  const save=(services:Service[])=>db.prepare('INSERT INTO service_catalog(id,payload) VALUES(1,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload').run(JSON.stringify(services));
  // Remove the obsolete material-price table from existing catalogs as well as new saves.
  if(db.prepare('SELECT id FROM service_catalog WHERE id=1').get())save(list());
  const router=Router();
  const endpoint=(action:(req:any,res:any)=>void)=>(req:any,res:any)=>{try{action(req,res);}catch(e){res.status(e instanceof PricingError?e.status:500).json({success:false,error:e instanceof PricingError?e.message:'Não foi possível salvar os serviços.'});}};
  router.get('/api/visual-services',endpoint((_req,res)=>res.json(result())));
  router.post('/api/visual-services/bootstrap',endpoint((req,res)=>{
    if (!legacyImportDisabled(dataDir)&&!db.prepare('SELECT id FROM service_catalog WHERE id=1').get()) save(validate(migrateVisualServices(validate(req.body.services),getMaterials())));
    res.json(result());
  }));
  router.put('/api/visual-services',endpoint((req,res)=>{
    if (req.body.revision!==revision()) throw new PricingError('Serviços alterados em outra sessão. Recarregue a página.',409);
    if(Array.isArray(req.body.services)){try{requireCollectionActions(req.naganoProfile,'settings',list(),req.body.services);}catch(e:any){throw new PricingError(e.message,e.status||403);}}
    let rows=req.body.services;if((req as any).naganoProfile&&(!canViewCosts((req as any).naganoProfile)||!canPerform((req as any).naganoProfile,'costs','edit'))&&Array.isArray(rows)){const previous=list();rows=rows.map((row:any)=>{const old=previous.find(s=>s.id===row.id);for(const key of ['internalCost','profitMarginPct'])if(row[key]!==undefined&&row[key]!==old?.[key])throw new PricingError('Sem permissão para alterar custos internos.',403);return {...row,internalCost:old?.internalCost,profitMarginPct:old?.profitMarginPct};});}save(validate(rows));res.json(result());
  }));
  return {router,list,get:(id:string)=>list().find(s=>s.id===id),close:()=>db.close()};
}


