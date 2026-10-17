import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { customerServiceRecency, moveProductionOrder, nextProductionStep, productionColumns } from '../src/utils/productionFlow';
import { PrintableWorkOrder } from '../src/components/PrintableWorkOrder';
import { ProductionKanban } from '../src/components/ProductionKanban';
import { CompanySettings, WorkOrder } from '../src/types';

const order = { id:'os', number:'OS-TEST', customerId:'c', customerName:'Cliente', approvalDate:'2026-01-01', deadlineDate:'2026-01-05',
  productionStatus:'ACABAMENTO', serviceName:'Banner', quantity:2, statusHistory:[], amountPaid:100, remainingBalance:80, totalAmount:180 } as WorkOrder;

test('four production stages advance to pickup directly, preserve finances and register history once', () => {
  assert.equal(productionColumns.length,4);
  assert.deepEqual(productionColumns.map(col=>col.id),['PRODUCAO_ARTES','ARTE_APROVADA','PRODUCAO','ACABAMENTO']);
  assert.equal(nextProductionStep('ACABAMENTO')?.status,'AGUARDANDO_RETIRADA');
  const moved = moveProductionOrder(order,'FINALIZADO','Acabamento conferido.','2026-01-05T15:00:00Z');
  assert.equal(moved.productionStatus,'AGUARDANDO_RETIRADA');
  assert.equal(moved.productionCompletedAt,'2026-01-05T15:00:00Z');
  assert.equal(moved.statusHistory[0].previousStatus,'ACABAMENTO');
  assert.equal(moved.statusHistory[0].newStatus,'AGUARDANDO_RETIRADA');
  assert.equal(moved.amountPaid,100); assert.equal(moved.remainingBalance,80);
  assert.equal(moveProductionOrder(moved,'FINALIZADO'),moved);
  assert.throws(()=>moveProductionOrder({...order,quotationRevisionPending:true},'PRODUCAO'));
  assert.equal(moveProductionOrder(moved,'PRODUCAO').productionCompletedAt,undefined);
});

test('customer recency starts at final deadline of completed approved service, never quote or delivery date', () => {
  const done = {...order,productionStatus:'ENTREGUE',pickedUpAt:'2026-01-20T12:00:00Z'} as WorkOrder;
  const open = {...order,id:'open',deadlineDate:'2026-01-25',productionStatus:'PRODUCAO'} as WorkOrder;
  assert.deepEqual(customerServiceRecency('c',[done,open],new Date(2026,0,15)),{days:10,lastDeadline:'2026-01-05',orderNumber:'OS-TEST'});
  assert.equal(customerServiceRecency('c',[{...done,deadlineDate:'2026-01-10'}],new Date(2026,0,15)).days,5);
  assert.equal(customerServiceRecency('c',[done],new Date(2026,0,4)).days,0);
  for (const ignored of [open,{...done,quotationRevisionPending:true},{...done,approvalDate:''},{...done,deadlineDate:'2026-02-30'},{...done,customerId:'other'}]) assert.equal(customerServiceRecency('c',[ignored],new Date(2026,0,15)).days,null);
  assert.equal(customerServiceRecency('c',[{...done,deadlineDate:'2024-03-09'}],new Date(2024,2,11)).days,2);
});

test('completed orders leave production; waiting artwork stays in artwork column; paused revisions remain accessible through a compact indicator', () => {
  const html = renderToStaticMarkup(React.createElement(ProductionKanban,{workOrders:[
    {...order,id:'pickup',number:'OS-RETIRADA',productionStatus:'AGUARDANDO_RETIRADA'},
    {...order,id:'delivery',number:'OS-ENTREGUE',productionStatus:'ENTREGUE'},
    {...order,id:'waiting',number:'OS-APROVACAO',productionStatus:'AGUARDANDO_APROVACAO_ARTE'},
    {...order,id:'pause',number:'OS-PAUSADA',productionStatus:'PAUSADO',quotationRevisionPending:true},
  ],onUpdateStatus:()=>{}}));
  assert.doesNotMatch(html,/OS-RETIRADA|OS-ENTREGUE/);
  assert.match(html,/OS-APROVACAO|Confirmar arte aprovada/);
  assert.doesNotMatch(html,/OS-PAUSADA|bg-amber-50/); assert.match(html,/Serviços pausados/); assert.match(html,/>1<\/span>/);
});

test('A5 production sheet contains quantities, configuration and notes, without signatures, money or team', () => {
  const html = renderToStaticMarkup(React.createElement(PrintableWorkOrder,{workOrder:{...order,colors:'4x0',internalNotes:'Conferir ilhós.',
    salespersonName:'Vendedor secreto',designerName:'Designer secreto',productionResponsible:'Equipe secreta',
    items:[{id:'i',serviceName:'Banner',quantity:2,widthCm:100,heightCm:150,materialName:'Lona 440g',description:'Dois modelos',finishings:[{finishingName:'Ilhós'}],subtotal:180} as any]},company:{} as CompanySettings}));
  assert.match(html,/data-paper="A5"/); assert.match(html,/2 unidades|Lona 440g|Ilhós|Conferir ilhós\./);
  assert.doesNotMatch(html,/R\$|Resumo Financeiro|Assinatura|Vendedor secreto|Designer secreto|Equipe secreta|Forma Pagto/);
});
