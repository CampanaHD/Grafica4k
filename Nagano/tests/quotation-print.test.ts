import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { QuotationDocument } from '../src/components/PrintableQuotation';
import { CompanySettings, Quotation } from '../src/types';

test('print uses Nagano brand and saved commercial data without internal pricing or invented payment terms', () => {
  const quotation = { number: 'ORC-TEST', customerName: 'Cliente <Especial>', createdAt: '2026-09-20', expirationDate: '2026-09-27',
    maxDeadlineDays: 3, totalAmount: 589.6, paymentTerms: 'Entrada de 50%. Saldo na retirada.', customerNotes: 'Conferir a arte.', salespersonName:'Responsável que não deve aparecer',
    internalNotes: 'Custo secreto', items: [
      { id: '1', serviceName: 'Lona', widthCm: 142, heightCm: 320, quantity: 1, subtotal: 409.6,
        materialName: 'Lona 440g', selectedRollWidthCm: 180, productionWidthCm: 162, baseValue: 999 },
      { id: '2', serviceName: 'Cartão', quantity: 1000, subtotal: 180, serviceGroup: 'GRAPHIC_PRODUCTS' },
    ] } as Quotation;
  const company = { tradingName: 'Nagano', companyName: 'Empresa Nagano', cnpjCpf: 'CNPJ cadastrado', quotationFooter: 'Condições cadastradas' } as CompanySettings;
  const before = structuredClone(quotation);
  const html = renderToStaticMarkup(React.createElement(QuotationDocument, { quotation, items: quotation.items, company }));
  assert.match(html, /\/brand\/nagano-logo-white.png/);
  assert.match(html, /data-paper="A4"/);
  assert.doesNotMatch(html, /Responsável que não deve aparecer|Atendimento:/);
  assert.match(html, /1º Serviço/); assert.match(html, /2º Serviço/);
  assert.match(html, /1,42 x 3,20 m/); assert.match(html, /1.000 unidades/);
  assert.match(html, /R\$ 409,60/); assert.match(html, /R\$ 589,60/);
  assert.match(html, /Entrada de 50%. Saldo na retirada./);
  assert.match(html, /Cliente &lt;Especial&gt;/);
  assert.match(html, /27\/09\/2026/);
  assert.doesNotMatch(html.replace(/<style>[\s\S]*?<\/style>/g, ''), /Custo secreto|999|162|5%|Boleto Bancário/);
  assert.deepEqual(quotation, before);
});

test('print omits unconfigured deadline, notes, payment and validity', () => {
  const html = renderToStaticMarkup(React.createElement(QuotationDocument, {
    quotation: { number: 'Q', createdAt: '2026-09-20', items: [], totalAmount: 0 } as Quotation,
    items: [], company: {} as CompanySettings,
  }));
  assert.doesNotMatch(html, /<h3>Observações|<h3>Prazo de produção|<h3>Formas de pagamento|Válido até:/);
  assert.match(html, /R\$ 0,00/);
});

test('document separates specifications, registered payment options and saved additional charges', () => {
  const q = { number: 'ORC-DETALHADO', customerName: 'Cliente', createdAt: '2026-10-14', paymentTerms: 'Entrada 50%',
    subtotal: 180, designCost: 40, deliveryCost: 20, installationCost: 0, extraCharges: 5, discountAmount: 10, totalAmount: 235,
    items: [{ id: '1', serviceName: 'Cartão', quantity: 1000, subtotal: 180, serviceGroup: 'GRAPHIC_PRODUCTS',
      graphicSnapshot: { specification: 'Material: Couchê 300g; Cores: 4x4; Acabamento: Verniz <total>' },
      description: 'Arte frente e verso.', internalNotes: 'segredo' }],
  } as unknown as Quotation;
  const before = structuredClone(q);
  const html = renderToStaticMarkup(React.createElement(QuotationDocument, { quotation: q, items: q.items, company: {} as CompanySettings,
    paymentOptions: ['PIX', 'Cartão de crédito', '', 'PIX'] }));
  assert.match(html, /<th scope="row">Material<\/th><td>Couchê 300g<\/td>/);
  assert.match(html, /<th scope="row">Cores<\/th><td>4x4<\/td>/);
  assert.match(html, /<th scope="row">Acabamento<\/th><td>Verniz &lt;total&gt;<\/td>/);
  assert.match(html, /<th scope="row">Descrição<\/th><td>Arte frente e verso\.<\/td>/);
  assert.match(html, /Valor por unidade<\/th><td>R\$ 0,18/);
  assert.match(html, /<li>PIX<\/li><li>Cartão de crédito<\/li>/);
  assert.equal((html.match(/<li>PIX<\/li>/g) ?? []).length, 1);
  assert.match(html, /Entrada 50%/);
  assert.match(html, /Criação de arte<\/dt><dd>R\$ 40,00/);
  assert.match(html, /Desconto do orçamento<\/dt><dd>- R\$ 10,00/);
  assert.match(html, /R\$ 235,00/);
  assert.doesNotMatch(html, /segredo|<dt>Instalação/);
  assert.deepEqual(q, before);
});
