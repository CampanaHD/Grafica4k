import { Quotation, QuotationItem } from '../types';
import { formatCurrency } from './formatters';
import { outsourcedCustomerItems } from './outsourcing';

const number = new Intl.NumberFormat('pt-BR');
const meters = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
const positive = (value?: number) => Number.isFinite(value) && value > 0;
const text = (value?: string) => {
  if (typeof value !== 'string') return '';
  const clean = value.trim();
  return /^(null|undefined)$/i.test(clean) ? '' : clean;
};
const distinct = (values: Array<string | undefined>) => [...new Set(values.map(text).filter(Boolean))];
export const quotationPaymentOptions = (options: string[] = []) => distinct(options);
export const quotationRecalculationNotice = 'Este orçamento foi elaborado de acordo com as informações e especificações fornecidas. Caso seja necessário alterar medidas, quantidade, material, acabamento ou qualquer outra característica do serviço, o valor poderá ser recalculado.';

/** Split saved configuration fields without guessing information that was not entered. */
export function specificationDetails(value?: string) {
  return text(value).split(/\r?\n|;|\s+·\s+/).map(text).filter(Boolean).map(part => {
    const field = part.match(/^([^:]{1,60}):\s*(.+)$/);
    return field ? { label: field[1].trim(), value: field[2].trim() } : { label: 'Especificação', value: part };
  });
}

export function quotationCommercialSummary(q: Quotation) {
  const entries = [
    { label: 'Subtotal dos serviços', value: q.subtotal },
    { label: 'Criação de arte', value: q.designCost },
    { label: 'Entrega', value: q.deliveryCost },
    { label: 'Instalação', value: q.installationCost },
    { label: 'Acréscimos / extras', value: q.extraCharges },
    { label: 'Desconto do orçamento', value: q.discountAmount, discount: true },
  ];
  return entries.filter(entry => positive(entry.value));
}

/** Customer-facing fields shared by the message and print layout; never recalculates prices. */
export function describeQuotationItem(item: Partial<QuotationItem>, legacyFinishing?: string) {
  const name = text(item.serviceName) || text(item.description) || 'Produto';
  const graphic = item.serviceGroup ? item.serviceGroup === 'GRAPHIC_PRODUCTS'
    : !!item.graphicSnapshot || !!item.isGraphicSnapshot || !!item.isGraphic || item.calculationType === 'UNIT';
  const details: Array<{ label: string; value: string }> = [];
  if (positive(item.widthCm) && positive(item.heightCm)) {
    details.push(item.simulationSnapshot
      ? { label: 'Medida', value: `${number.format(item.widthCm)} x ${number.format(item.heightCm)} cm` }
      : graphic
      ? { label: 'Formato', value: `${number.format(item.widthCm)} x ${number.format(item.heightCm)} cm` }
      : { label: 'Medida', value: `${meters.format(item.widthCm / 100)} x ${meters.format(item.heightCm / 100)} m` });
  }
  const soldByLot = !!item.futuraImportId && !graphic;
  if (positive(item.quantity)) details.push({ label: 'Quantidade', value: `${number.format(item.quantity)} ${soldByLot ? item.quantity === 1 ? 'lote' : 'lotes' : item.quantity === 1 ? 'unidade' : 'unidades'}` });
  const sameAsName = (value?: string) => text(value).toLocaleLowerCase('pt-BR') === name.toLocaleLowerCase('pt-BR');
  if (text(item.materialName) && !sameAsName(item.materialName)) details.push({ label: 'Material', value: text(item.materialName) });
  details.push(...specificationDetails(item.graphicSnapshot?.specification));
  if (text(item.description) && !sameAsName(item.description) && text(item.description) !== text(item.materialName) && text(item.description) !== text(item.graphicSnapshot?.specification)) {
    // Imported visual products keep their configuration in the saved description.
    if (item.futuraImportId) details.push(...specificationDetails(item.description));
    else details.push({ label: 'Descrição', value: text(item.description) });
  }
  const finishings = distinct([...(item.finishings ?? []).map(f => f.finishingName),...(item.stockFinishings??[]).map(f=>`${f.name||'Acabamento'} · ${f.quantity} ${f.unit}${f.perUnit?' por peça':''}`), legacyFinishing]);
  finishings.forEach(value => details.push({ label: 'Acabamento', value }));
  const uniqueDetails = details.filter((detail, index) => details.findIndex(other => other.label.toLocaleLowerCase('pt-BR') === detail.label.toLocaleLowerCase('pt-BR') && other.value.toLocaleLowerCase('pt-BR') === detail.value.toLocaleLowerCase('pt-BR')) === index);
  return { name, details: uniqueDetails, unitLabel: soldByLot ? 'lote' : 'unidade' };
}

function itemSection(item: Partial<QuotationItem>, index: number, legacyFinishing?: string) {
  const { name, details } = describeQuotationItem(item, legacyFinishing);
  const lines = details.map(({ label, value }) => `- ${label}: ${value}`);
  if (Number.isFinite(item.subtotal)) lines.push(`- Valor: *${formatCurrency(item.subtotal)}*`);
  return [`*${index + 1}º Serviço: ${name}*`, lines.join('\n')].filter(Boolean).join('\n\n');
}

/** Legacy documents use only fields saved on the quotation, with no invented measurements. */
export function quotationCustomerItems(quotation: Quotation): QuotationItem[] {
  if (quotation.items?.length || quotation.outsourcedServices?.length) return [...quotation.items||[],...outsourcedCustomerItems(quotation.outsourcedServices)];
  if (!text(quotation.serviceName)) return [];
  return [{
    id: `legacy-${quotation.id}`, serviceName: quotation.serviceName, description: quotation.description,
    materialName: quotation.materialName, widthCm: quotation.widthCm, heightCm: quotation.heightCm,
    quantity: quotation.quantity, subtotal: quotation.calculationSnapshot?.finalPrice ?? quotation.totalAmount,
    finishings: text(quotation.finishingText) ? [{ finishingName: text(quotation.finishingText) }] : [],
  } as QuotationItem];
}

/** Shared by preview, copy and WhatsApp. Presents saved values without repricing. */
export function formatQuotationMessage(quotation: Quotation, paymentOptions: string[] = []): string {
  const separator = '━━━━━━━━━━━━━━━━━━';
  const sections = quotationCustomerItems(quotation).map((item, index) => itemSection(item, index));
  const customer = text(quotation.customerName);
  const heading = [
    customer ? `Olá, *${customer}*!` : 'Olá!',
    'Conforme solicitado, segue abaixo o orçamento referente aos serviços:',
    separator,
    `📋 *ORÇAMENTO${text(quotation.number) ? ` ${text(quotation.number)}` : ''}*`,
  ].join('\n\n');
  const summary = [`💰 *VALOR TOTAL DO ORÇAMENTO:*\n*${formatCurrency(quotation.totalAmount)}*`];
  const additionalCharges = quotationCommercialSummary(quotation).filter(entry => entry.label !== 'Subtotal dos serviços');
  if (additionalCharges.length) summary.unshift(`*Resumo dos valores:*\n${quotationCommercialSummary(quotation).map(entry => `- ${entry.label}: ${entry.discount ? '- ' : ''}${formatCurrency(entry.value)}`).join('\n')}`);
  if (positive(quotation.maxDeadlineDays)) {
    summary.push(`⏱️ *Prazo de produção:*\n- ${number.format(quotation.maxDeadlineDays)} ${quotation.maxDeadlineDays === 1 ? 'dia útil' : 'dias úteis'} após a aprovação da arte e confirmação do pedido.`);
  }
  const notes = text(quotation.customerNotes);
  if (notes) summary.push(`*Observações:*\n${notes}`);
  if (text(quotation.paymentTerms)) summary.push(`*Condição deste orçamento:*\n- ${text(quotation.paymentTerms)}`);
  const payments = quotationPaymentOptions(paymentOptions);
  if (payments.length) summary.push(`💳 *Formas de pagamento disponíveis:*\n${payments.map(option => `- ${option}`).join('\n')}`);
  summary.push(quotationRecalculationNotice, 'Qualquer dúvida ou alteração, estamos à disposição.');
  if(quotation.createdBy?.name)summary.push(`Atendimento: ${quotation.createdBy.name}`);
  return [heading, ...sections, summary.join('\n\n')].join(`\n\n${separator}\n\n`);
}
