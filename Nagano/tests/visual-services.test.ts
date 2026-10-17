import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {DatabaseSync} from 'node:sqlite';
import {mkdtempSync,mkdirSync} from 'node:fs';
import path from 'node:path';
import type {Material,Service,QuotationItem} from '../src/types';
import {calculateQuotationItem} from '../server/quotationPricing';
import {createVisualServicesRouter,migrateVisualServices} from '../server/visualServicesApi';
import {createGraphicProductsRouter} from '../server/graphicProductsApi';
import {createQuotationsRouter} from '../server/quotationsApi';
import {validateMaterialPayload} from '../server/materialsApi';
const roll={id:'roll',name:'Adesivo',active:true,controlType:'ROLL',salePrice:999,sellingPriceSqm:999,costPerSqm:2,allowedRollWidths:[1,1.6],availableRolls:[],allowRotation:false,allowManualRollOverride:true,autoFindLowestCost:true} as Material;
const service={id:'banner',name:'Adesivo impresso',serviceGroup:'VISUAL_COMMUNICATION',active:true,pricingMethod:'PER_SQM',basePrice:40,materialPrices:[{materialId:'roll',price:45}],allowedMaterialIds:['roll'],minimumCharge:0,setupFee:10,hourlyRate:0} as Service;
const source={serviceId:'banner',materialId:'roll',widthCm:90,heightCm:50,quantity:2,allowances:{},finishings:[],subtotal:1,servicePriceSnapshot:1,orientation:'AUTO'} as Partial<QuotationItem>;
const price=(s=service,m=roll,item=source)=>calculateQuotationItem(item,()=>m,()=>undefined,()=>s).item;
test('service price is the only rate: old material price and obsolete per-material table never override it',()=>{
  assert.equal(price().subtotal,50);assert.equal(price().servicePriceSnapshot,40);
  assert.equal(price({...service,basePrice:65}).subtotal,75);
  assert.equal(price({...service,materialPrices:[{materialId:'roll',price:999}]}).subtotal,50);
  assert.throws(()=>price({...service,basePrice:undefined}),/Cadastre o preço do serviço/);
  assert.throws(()=>price({...service,allowedMaterialIds:['other']}),/habilitado/);
  assert.throws(()=>price({...service,active:false}),/ativo/);
});
test('linear service charges actual length independently of roll width',()=>{
  const linear={...service,pricingMethod:'PER_LINM' as const};
  assert.equal(price(linear).subtotal,50);
  assert.equal(price(linear,{...roll,allowedRollWidths:[1.6]}).subtotal,50);
});
test('restored roll editor: manual choice reprices from service, scales consumption and survives saved inputs',()=>{
  const manual=price(service,roll,{...source,selectedRollWidthCm:160,selectedOrientation:'HORIZONTAL',manualSelectionReason:'Bobina instalada na máquina'});
  assert.equal(manual.subtotal,74);assert.equal(manual.isRollSelectionManual,true);
  assert.equal(manual.calculationSnapshot?.selectedRollWidthCm,160);
  assert.equal(manual.calculationSnapshot?.linearMetersNeeded,1);
  assert.equal(price(service,roll,manual).subtotal,74);
  assert.equal(price(service,roll,{...manual,quantity:4}).subtotal,138);
  const automatic=price(service,roll,{...manual,selectedRollWidthCm:undefined,selectedOrientation:undefined,manualSelectionReason:undefined});
  assert.equal(automatic.subtotal,50);assert.equal(automatic.isRollSelectionManual,false);
  assert.throws(()=>price(service,roll,{...source,selectedRollWidthCm:160}),/justificativa/);
});
test('printing formula uses full roll mouth times production length times m2 rate; overflow is applied before fit and quantity',()=>{
 const material={...roll,allowedRollWidths:[1.6,1.8],allowRotation:false};
 const printing={...service,basePrice:60,setupFee:0,minimumCharge:0};
 const item={...source,widthCm:150,heightCm:200,quantity:1};
 assert.equal(price(printing,material,item).subtotal,192); // 1.60 × 2.00 × 60
 const lengthOverflow=price(printing,material,{...item,allowances:{overflowValueCm:10,overflowTop:true,overflowBottom:true}});
 assert.equal(lengthOverflow.productionHeightCm,220);assert.equal(lengthOverflow.subtotal,211.2); // 1.60 × 2.20 × 60
 const allSides=price(printing,material,{...item,quantity:3,allowances:{overflowValueCm:10,overflowTop:true,overflowBottom:true,overflowLeft:true,overflowRight:true}});
 assert.equal(allSides.productionWidthCm,170);assert.equal(allSides.recommendedRollWidthCm,180);
 assert.equal(allSides.subtotal,712.8); // 1.80 × 2.20 × 60 × 3
 assert.equal(allSides.calculationSnapshot?.linearMetersNeeded,6.6);
});
const sheet={...roll,id:'ps',name:'PS 2 mm',controlType:'SHEET',allowRotation:true,availableSheets:[{id:'big',name:'PS grande',widthCm:100,heightCm:200,active:true},{id:'small',name:'PS compacto',widthCm:60,heightCm:100,active:true}]} as Material;
const psService={...service,basePrice:100,allowedMaterialIds:['ps'],setupFee:0};
test('sheets choose smallest total consumption and count whole sheets across quantities',()=>{
  const item=price(psService,sheet,{...source,materialId:'ps',widthCm:50,heightCm:40,quantity:5});
  assert.equal(item.sheetSnapshot?.sheetId,'small');assert.equal(item.sheetSnapshot?.capacity,2);
  assert.equal(item.sheetSnapshot?.sheetsNeeded,3);assert.equal(item.subtotal,180);
  assert.equal(price(psService,sheet,{...source,materialId:'ps',widthCm:50,heightCm:40,quantity:10}).sheetSnapshot?.sheetId,'big');
});
test('sheet rotation, margins and no-fit fail without falling back to a fake price',()=>{
  const narrow={...sheet,availableSheets:[{id:'s',name:'PS',widthCm:60,heightCm:100,active:true}]};
  const item={...source,materialId:'ps',widthCm:90,heightCm:50,quantity:1};
  assert.equal(price(psService,narrow,item).sheetSnapshot?.rotated,true);
  assert.throws(()=>price(psService,{...narrow,allowRotation:false},item),/não cabe/);
  assert.throws(()=>price(psService,narrow,{...item,allowances:{edgeSafetyCm:6}}),/não cabe/);
  assert.throws(()=>price(psService,{...narrow,availableSheets:[]},item),/não cabe/);
});
test('migration removes the old table and never copies a material price into the service price',()=>{
  const migrated=migrateVisualServices([service,{...service,id:'hours',pricingMethod:'HOURLY',hourlyRate:120},{...service,id:'missing',basePrice:undefined}], [roll]);
  assert.equal(migrated[0].basePrice,40);assert.equal('materialPrices' in migrated[0],false);
  assert.equal(migrated[1].hourlyRate,120);assert.equal(migrated[2].basePrice,undefined);
  assert.equal(migrateVisualServices(migrated,[{...roll,salePrice:1}])[0].basePrice,40);
});
test('sheet payload rejects repeated dimensions and nonfinite measurements',()=>{
  const base={...sheet,calculationUnit:'M2',salePrice:0} as any;
  assert.equal(validateMaterialPayload(base,[]).valid,true);
  assert.equal(validateMaterialPayload({...base,availableSheets:[...sheet.availableSheets!,{...sheet.availableSheets![0],id:'repeat'}]},[]).valid,false);
  assert.equal(validateMaterialPayload({...base,availableSheets:[{id:'bad',widthCm:Infinity,heightCm:10,active:true}]},[]).valid,false);
});
test('service catalog persists, protects revisions; simulation reprices from service; graphic deletion preserves saved quotation',async()=>{
  mkdirSync(path.resolve('work'),{recursive:true});const dir=mkdtempSync(path.resolve('work/qa-service-test-'));
  let catalog=createVisualServicesRouter(()=>[roll],dir);const graphics=createGraphicProductsRouter(dir);
  const quotes=createQuotationsRouter(()=>roll,dir,graphics.get,id=>catalog.get(id));
  const app=express();app.use(express.json());app.use((req,res,next)=>catalog.router(req,res,next));app.use(graphics.router);app.use(quotes.router);
  const server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));const url=`http://127.0.0.1:${(server.address() as any).port}`;
  const call=async(route:string,method='GET',body?:unknown)=>{const r=await fetch(url+route,{method,...(body?{headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{})});return {status:r.status,...await r.json()};};
  try{
    const initial=await call('/api/visual-services/bootstrap','POST',{services:[service]});assert.equal(initial.status,200);assert.equal(initial.data[0].materialPrices,undefined);assert.equal(initial.data[0].basePrice,40);
    const updated=await call('/api/visual-services','PUT',{services:[{...service,setupFee:15}],revision:initial.revision});assert.equal(updated.status,200);
    assert.equal((await call('/api/visual-services','PUT',{services:[],revision:initial.revision})).status,409);
        catalog.close();
    const oldDb=new DatabaseSync(path.join(dir,'visual-services.sqlite'));
    oldDb.prepare('UPDATE service_catalog SET payload=? WHERE id=1').run(JSON.stringify([{...service,setupFee:15}]));oldDb.close();
    catalog=createVisualServicesRouter(()=>[roll],dir);
    const migratedDb=new DatabaseSync(path.join(dir,'visual-services.sqlite'));
    assert.equal(JSON.parse(String(migratedDb.prepare('SELECT payload FROM service_catalog WHERE id=1').get()!.payload))[0].materialPrices,undefined);migratedDb.close();
    assert.equal((await call('/api/visual-services/bootstrap','POST',{services:[]})).data[0].setupFee,15);
    const simulated=await call('/api/quotations/simulate','POST',{item:{...source,serviceName:'Adesivos do cliente',widthCm:10,heightCm:10,simulationSnapshot:{config:{areaWidthCm:100,areaHeightCm:100,marginCm:0,gapCm:0,bleedCm:0,allowRotation:true}}},quantities:[100,200]});
    assert.equal(simulated.options[0].item.serviceName,'Adesivos do cliente');assert.equal(simulated.options[0].total,55);assert.equal(simulated.options[1].total,95);
    const again=await call('/api/quotations/calculate-item','POST',{item:{...simulated.options[1].item,subtotal:1}});assert.equal(again.item.subtotal,95);
    const product=await call('/api/graphic-products/card','PUT',{id:'card',serviceGroup:'GRAPHIC_PRODUCTS',name:'Cartão',active:true,pricingMethod:'UNIT_PRICE',baseQuantity:100,baseBatchPrice:50});
    const quotation=await call('/api/quotations/graphic','PUT',{id:'graphic',status:'CALCULADO',items:[{graphicProductId:'card',serviceGroup:'GRAPHIC_PRODUCTS',quantity:200}]});assert.equal(quotation.data.totalAmount,100);
    assert.equal((await call('/api/graphic-products/card','DELETE',{revision:0})).status,409);
    assert.equal((await call('/api/graphic-products/card','DELETE',{revision:product.data.revision})).status,200);
    assert.equal((await call('/api/graphic-products')).data.length,0);
    assert.equal((await call('/api/quotations/graphic')).data.totalAmount,100);
    assert.equal((await call('/api/quotations/calculate-item','POST',{graphicProductId:'card',quantity:100})).status,400);
  }finally{await new Promise<void>(r=>server.close(()=>r()));quotes.close();graphics.close();catalog.close();}
});




