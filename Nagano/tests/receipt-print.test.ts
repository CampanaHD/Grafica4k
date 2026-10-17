import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {PrintableReceipt} from '../src/components/PrintableReceipt';
import type {Receipt,CompanySettings} from '../src/types';

test('receipt prints saved payment data with Nagano branding, without changing the financial record',()=>{
 const receipt={id:'receipt',number:'REC-2026-1224',customerName:'Cliente <Especial>',cpfCnpj:'52.998.224/0001-25',amount:69.88,amountInWords:'sessenta e nove reais e oitenta e oito centavos',paymentMethod:'CREDITO',paymentDate:'2026-10-14',referringTo:'Quitação final da OS de cartões',workOrderNumber:'OS-2026-0002',issuerName:'Atendimento',observations:'Conferir comprovante.'} as Receipt;
 const company={companyName:'Gráfica Rápida & Comunicação Visual',cnpjCpf:'CNPJ cadastrado',receiptFooter:'Texto cadastrado de quitação',pixKey:'DADO QUE NÃO DEVE SER IMPRESSO'} as CompanySettings;
 const before=structuredClone(receipt);
 const html=renderToStaticMarkup(React.createElement(PrintableReceipt,{receipt,company}));
 const content=html.replace(/<style>[\s\S]*?<\/style>/g,'');
 assert.match(content,/nagano-logo-white.png/);assert.match(content,/data-paper="A4"/);
 assert.match(content,/R\$ 69,88/);assert.match(content,/sessenta e nove reais e oitenta e oito centavos/);
 assert.match(content,/Cliente &lt;Especial&gt;/);assert.match(content,/52.998.224\/0001-25/);
 assert.match(content,/Cartão de crédito/);assert.match(content,/14\/10\/2026/);assert.match(content,/OS-2026-0002/);
 assert.match(content,/Conferir comprovante/);assert.match(content,/Texto cadastrado de quitação/);
 assert.doesNotMatch(content,/Gráfica Rápida|DADO QUE NÃO DEVE SER IMPRESSO|undefined|null/);
 assert.deepEqual(receipt,before);
});
test('receipt omits missing optional fields and uses clear payment method names',()=>{
 for(const [paymentMethod,label] of Object.entries({PIX:'Pix',DINHEIRO:'Dinheiro',DEBITO:'Cartão de débito',TRANSFERENCIA:'Transferência bancária',OUTRO:'Outra forma de pagamento'})){
  const html=renderToStaticMarkup(React.createElement(PrintableReceipt,{receipt:{number:'REC-1',customerName:'Cliente',amount:10,paymentMethod,paymentDate:'2026-10-14',referringTo:'Pagamento'} as Receipt,company:{} as CompanySettings})).replace(/<style>[\s\S]*?<\/style>/g,'');
  assert.ok(html.includes(label));assert.doesNotMatch(html,/CPF\/CNPJ:|Observações|Ordem de serviço ·|undefined|null/);
 }
});
