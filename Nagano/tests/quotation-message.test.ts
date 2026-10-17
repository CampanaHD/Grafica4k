import test from 'node:test';
import assert from 'node:assert/strict';
import { describeQuotationItem, formatQuotationMessage, quotationCustomerItems } from '../src/utils/quotationMessage';
import { Quotation } from '../src/types';

const quotation = {
  number: 'ORC-2026-0004', customerName: "Padaria e Confeitaria Pão D'Ouro Ltda",
  totalAmount: 589.60, maxDeadlineDays: 3,
  items: [
    { serviceName: 'Lona CO Ilhos', serviceGroup: 'VISUAL_COMMUNICATION', materialName: 'Lona Frontlight 440g',
      widthCm: 142, heightCm: 320, quantity: 1, subtotal: 409.60, finishings: [] },
    { serviceName: 'Cartão de Visita Brilho', serviceGroup: 'GRAPHIC_PRODUCTS',
      widthCm: 0, heightCm: 0, quantity: 1000, subtotal: 180, finishings: [] },
  ],
} as Quotation;

test('message follows the requested greeting, numbered services, hyphens, total and deadline', () => {
  assert.equal(formatQuotationMessage(quotation), `Olá, *Padaria e Confeitaria Pão D'Ouro Ltda*!

Conforme solicitado, segue abaixo o orçamento referente aos serviços:

━━━━━━━━━━━━━━━━━━

📋 *ORÇAMENTO ORC-2026-0004*

━━━━━━━━━━━━━━━━━━

*1º Serviço: Lona CO Ilhos*

- Medida: 1,42 x 3,20 m
- Quantidade: 1 unidade
- Material: Lona Frontlight 440g
- Valor: *R$ 409,60*

━━━━━━━━━━━━━━━━━━

*2º Serviço: Cartão de Visita Brilho*

- Quantidade: 1.000 unidades
- Valor: *R$ 180,00*

━━━━━━━━━━━━━━━━━━

💰 *VALOR TOTAL DO ORÇAMENTO:*
*R$ 589,60*

⏱️ *Prazo de produção:*
- 3 dias úteis após a aprovação da arte e confirmação do pedido.

Este orçamento foi elaborado de acordo com as informações e especificações fornecidas. Caso seja necessário alterar medidas, quantidade, material, acabamento ou qualquer outra característica do serviço, o valor poderá ser recalculado.

Qualquer dúvida ou alteração, estamos à disposição.`);
});

test('only populated details, notes and deadlines are included', () => {
  for (const absent of [undefined, null, '', ' ', 'null', 'undefined']) {
    const result = formatQuotationMessage({ ...quotation, maxDeadlineDays: undefined, customerNotes: absent,
      items: [{ ...quotation.items[0], materialName: absent, description: absent,
        widthCm: Infinity, heightCm: NaN, quantity: 0, finishings: [{ finishingName: absent }] as any }],
    });
    assert.doesNotMatch(result, /Prazo de produção|Observações|Medida:|Quantidade:|Material:|Descrição:|Especificação:|Acabamento:|undefined|null|NaN/);
    assert.equal((result.match(/º Serviço:/g) ?? []).length, 1);
    assert.match(result, /- Valor: \*R\$ 409,60\*/);
  }
});

test('graphic format, specification, finishing and Brazilian quantity stay available', () => {
  const result = formatQuotationMessage({ ...quotation, maxDeadlineDays: 1, customerNotes: 'Retirada na loja.',
    items: [{ ...quotation.items[1], widthCm: 10, heightCm: 15, quantity: 5000,
      graphicSnapshot: { specification: 'Couchê 115g' } as any,
      finishings: [{ finishingName: 'Refile' }] as any }],
  });
  assert.match(result, /- Formato: 10 x 15 cm/);
  assert.match(result, /- Quantidade: 5.000 unidades/);
  assert.match(result, /- Especificação: Couchê 115g\n- Acabamento: Refile/);
  assert.match(result, /1 dia útil após/);
  assert.match(result, /\*Observações:\*\nRetirada na loja\./);
});

test('legacy single-item quotes preserve saved prices and finishing', () => {
  const result = formatQuotationMessage({ ...quotation, items: [], serviceName: 'Placa de ACM',
    widthCm: 100, heightCm: 50, quantity: 1, totalAmount: 270,
    calculationSnapshot: { finalPrice: 250 } as any, finishingText: 'Cantos arredondados' });
  assert.match(result, /1º Serviço: Placa de ACM/);
  assert.match(result, /- Medida: 1,00 x 0,50 m/);
  assert.match(result, /- Acabamento: Cantos arredondados/);
  assert.match(result, /- Valor: \*R\$ 250,00\*/);
  assert.match(result, /\*R\$ 270,00\*/);
});

test('final stored item values and authoritative total are displayed without mutation or internal data', () => {
  const data = structuredClone(quotation);
  data.totalAmount = 1275.50;
  data.internalNotes = 'Margem interna confidencial';
  data.items[0].productionWidthCm = 170;
  data.items[0].selectedRollWidthCm = 180;
  data.items[0].baseValue = 999;
  data.items[0].discountInputValue = 70;
  data.items[1].graphicSnapshot = { specification: 'Couchê 300g', pricingMethod: 'QUANTITY_PRICE_TABLE', finalTotal: 999 } as any;
  data.items.push({ ...data.items[0], serviceName: 'Adesivo impresso', quantity: 3, subtotal: 0 });
  const before = structuredClone(data);
  const result = formatQuotationMessage(data);
  assert.equal((result.match(/º Serviço:/g) ?? []).length, 3);
  assert.equal((result.match(/VALOR TOTAL DO ORÇAMENTO:/g) ?? []).length, 1);
  assert.match(result, /3º Serviço: Adesivo impresso/);
  assert.match(result, /- Valor: \*R\$ 0,00\*/);
  assert.match(result, /\*R\$ 1\.275,50\*/);
  assert.doesNotMatch(result, /170|999|Margem interna|QUANTITY_PRICE_TABLE|bobina/i);
  assert.deepEqual(data, before);
});

test('message uses current registered payments and keeps this quotation condition', () => {
  const options = [' PIX ', '', 'Cartão em 3x', 'PIX', 'null'];
  const before = structuredClone(quotation);
  const result = formatQuotationMessage({ ...quotation, paymentTerms: 'Entrada de 30% e saldo na entrega.' }, options);
  assert.match(result, /\*Condição deste orçamento:\*\n- Entrada de 30% e saldo na entrega\./);
  assert.match(result, /\*Formas de pagamento disponíveis:\*\n- PIX\n- Cartão em 3x/);
  assert.equal((result.match(/- PIX/g) ?? []).length, 1);
  assert.doesNotMatch(formatQuotationMessage(quotation, []), /Formas de pagamento|Condição deste orçamento/);
  assert.doesNotMatch(formatQuotationMessage(quotation, ['Transferência']), /Cartão em 3x|PIX/);
  assert.deepEqual(quotation, before);
});

test('saved configuration is split into fields and separate finishings without losing the description', () => {
  const item = { ...quotation.items[1], graphicSnapshot: { specification: 'Material: Couchê 300g; Cores: 4x4; Acabamento: Verniz total; Formato: 9 x 5 cm' } as any,
    description: 'Dois modelos diferentes. Conferir arte com o cliente.', finishings: [{ finishingName: 'Refile' }, { finishingName: 'Cantos arredondados' }] as any };
  const result = formatQuotationMessage({ ...quotation, items: [item] });
  assert.match(result, /- Material: Couchê 300g\n- Cores: 4x4\n- Acabamento: Verniz total\n- Formato: 9 x 5 cm/);
  assert.match(result, /- Descrição: Dois modelos diferentes\. Conferir arte com o cliente\./);
  assert.match(result, /- Acabamento: Refile\n- Acabamento: Cantos arredondados/);
  const lot = describeQuotationItem({ futuraImportId: 'futura', serviceGroup: 'VISUAL_COMMUNICATION', quantity: 3, description: 'Material: Vinil; Cores: 4x0' });
  assert.deepEqual(lot.details[0], { label: 'Quantidade', value: '3 lotes' });
  assert.equal(lot.unitLabel, 'lote');
});

test('legacy customer documents do not invent size, quantity or material', () => {
  const q = { number: 'Antigo', serviceName: 'Instalação', items: [], totalAmount: 123, finishingText: 'Fixação' } as Quotation;
  const items = quotationCustomerItems(q);
  assert.equal(items[0].subtotal, 123);
  assert.equal(items[0].widthCm, undefined);
  assert.equal(items[0].quantity, undefined);
  assert.equal(items[0].materialName, undefined);
  assert.match(formatQuotationMessage(q), /- Acabamento: Fixação/);
  assert.doesNotMatch(formatQuotationMessage(q), /Medida:|Quantidade:|Material:/);
});
