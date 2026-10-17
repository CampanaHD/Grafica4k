import type { CompanySettings, Customer, Quotation, WorkOrder } from '../types';
import { formatCurrency } from './formatters';
import { formatQuotationMessage } from './quotationMessage';
import {outsourcedServicesList} from './outsourcing';

export const messagePurposes = {
  GREETING: 'Atendimento', QUOTATION: 'Enviar orçamento', PICKUP_READY: 'Pedido pronto para retirada',
  PAYMENT_REMINDER: 'Lembrete de pagamento', REACTIVATION: 'Cliente sem serviços há algum tempo',
} as const;
export type MessagePurpose = keyof typeof messagePurposes;
export interface MessageTemplate { id: string; name: string; purpose: MessagePurpose; body: string }
export interface MessageTemplateSettings { templates: MessageTemplate[]; bindings: Record<MessagePurpose, string> }
export const messageVariables = {
  cliente: 'Nome do cliente', empresa: 'Nome da gráfica', pedido: 'Número da OS', servico: 'Serviços da OS',
  valor_total: 'Valor total', valor_pago: 'Valor já pago', saldo_pendente: 'Saldo pendente',
  aviso_pagamento: 'Ressalva de pagamento, somente quando houver saldo', dias_sem_servico: 'Dias desde o último serviço finalizado',
  detalhes_orcamento: 'Orçamento completo, com serviços, valores e pagamentos', pix: 'Chave PIX cadastrada',
} as const;
export const defaultMessageTemplates = (): MessageTemplateSettings => {
  const bodies: Record<MessagePurpose, string> = {
    GREETING: 'Olá, *{cliente}*! 👋\n\nAqui é da *{empresa}*.\n\nComo podemos ajudar com seus impressos e serviços de comunicação visual?',
    QUOTATION: '{detalhes_orcamento}\n\n*{empresa}*',
    PICKUP_READY: 'Olá, *{cliente}*!\n\n✅ *Seu pedido está pronto para retirada!*\n\n*Pedido:* {pedido}\n*Serviço:* {servico}\n*Local:* {empresa}\n\n{aviso_pagamento}\n\nAguardamos sua visita! 😊',
    PAYMENT_REMINDER: 'Olá, *{cliente}*!\n\nAqui é da *{empresa}*.\n\n💳 *Lembrete de pagamento*\nSaldo pendente: *{saldo_pendente}*\n\nPodemos combinar o pagamento?',
    REACTIVATION: 'Olá, *{cliente}*! 👋\n\nAqui é da *{empresa}*. Faz um tempo que não nos falamos!\n\nEstá precisando de novos impressos, adesivos, banners ou comunicação visual?\n\nEstamos à disposição para preparar um orçamento para você. 😊\n\nSe preferir não receber essas mensagens, é só nos avisar.',
  };
  return {
    templates: Object.entries(messagePurposes).map(([purpose, name]) => ({ id: `default-${purpose}`, purpose: purpose as MessagePurpose, name, body: bodies[purpose as MessagePurpose] })),
    bindings: Object.fromEntries(Object.keys(messagePurposes).map(p => [p, `default-${p}`])) as Record<MessagePurpose, string>,
  };
};
/** Upgrade only the original untouched defaults; keep every customized template. */
export function upgradeDefaultMessageTemplates(settings: MessageTemplateSettings): MessageTemplateSettings {
  const previous: Record<MessagePurpose, string> = {
    GREETING: 'Olá, {cliente}! Aqui é da {empresa}. Como podemos ajudar com seus impressos e serviços de comunicação visual?',
    QUOTATION: '{detalhes_orcamento}\n\n{empresa}',
    PICKUP_READY: 'Olá, {cliente}! Seu pedido {pedido} ({servico}) está pronto para retirada na {empresa}.\n\n{aviso_pagamento}\n\nAguardamos sua visita!',
    PAYMENT_REMINDER: 'Olá, {cliente}! Aqui é da {empresa}. Consta um saldo pendente de {saldo_pendente}. Podemos combinar o pagamento?',
    REACTIVATION: 'Olá, {cliente}! Aqui é da {empresa}. Faz um tempo que não nos falamos. Está precisando de novos impressos, adesivos, banners ou comunicação visual? Estamos à disposição para preparar um orçamento!\n\nSe preferir não receber essas mensagens, é só nos avisar.',
  };
  const defaults = defaultMessageTemplates();
  return { ...settings, templates: settings.templates.map(t => t.id === `default-${t.purpose}` && t.name === messagePurposes[t.purpose] && t.body === previous[t.purpose]
    ? { ...t, body: defaults.templates.find(d => d.purpose === t.purpose)!.body } : t) };
}
export function validateMessageTemplates(settings: MessageTemplateSettings): void {
  const ids = new Set<string>();
  for (const t of settings.templates) {
    if (!t.id || ids.has(t.id) || !Object.hasOwn(messagePurposes, t.purpose) || !t.name?.trim() || !t.body?.trim()) throw new Error('Preencha o nome e o texto de cada mensagem.');
    ids.add(t.id);
    if (t.body.length > 20000) throw new Error('Uma mensagem pode ter até 20.000 caracteres.');
    for (const [, variable] of t.body.matchAll(/\{([^{}]+)\}/g)) {
      if (!Object.hasOwn(messageVariables, variable)) throw new Error(`Campo desconhecido: {${variable}}.`);
    }
    if (t.purpose === 'QUOTATION' && !t.body.includes('{detalhes_orcamento}')) throw new Error('Inclua {detalhes_orcamento} na mensagem de orçamento para manter todos os serviços e valores.');
    if (t.purpose === 'PICKUP_READY' && !t.body.includes('{aviso_pagamento}')) throw new Error('Inclua {aviso_pagamento} na mensagem de retirada. Ele só aparece quando há saldo pendente.');
  }
  for (const purpose of Object.keys(messagePurposes) as MessagePurpose[]) {
    if (!settings.templates.some(t => t.id === settings.bindings[purpose] && t.purpose === purpose)) throw new Error(`Escolha uma mensagem padrão para: ${messagePurposes[purpose]}.`);
  }
}
export function renderMessageTemplate(body: string, variables: Record<string, string>): string {
  // One pass: braces contained in customer-entered values are never interpreted as fields.
  return body.replace(/\{([^{}]+)\}/g, (match, key) => Object.hasOwn(variables, key) ? variables[key] : match)
    .replace(/\n[ \t]*\n(?:[ \t]*\n)+/g, '\n\n').trim();
}
export function pickupBalance(order: WorkOrder): number {
  const amount = Number.isFinite(order.remainingBalance) ? order.remainingBalance : order.totalAmount - order.amountPaid;
  return Math.max(0, Math.round((Number.isFinite(amount) ? amount : 0) * 100) / 100);
}
export interface MessageContext {
  customer?: Customer; company?: CompanySettings; order?: WorkOrder; quotation?: Quotation;
  paymentOptions?: string[]; daysWithoutService?: number | null; pendingBalance?: number;
}
export function prepareMessage(purpose: MessagePurpose, settings: MessageTemplateSettings, context: MessageContext, templateId?: string): string {
  const template = settings.templates.find(t => t.id === (templateId || settings.bindings[purpose]) && t.purpose === purpose)
    ?? defaultMessageTemplates().templates.find(t => t.purpose === purpose)!;
  const { order, quotation, customer, company } = context;
  const configuredName = company?.tradingName?.trim() || company?.companyName?.trim() || '';
  const companyName = !configuredName || /^(Gráfica & Impressão Express|Gráfica Rápida & Comunicação Visual)$/i.test(configuredName)
    ? 'Nagano Comunicação Visual' : configuredName;
  const balance = order ? pickupBalance(order) : Math.max(0, context.pendingBalance ?? customer?.pendingBalance ?? 0);
  const paymentNotice = balance > 0 ? `⚠️ *Pagamento na retirada*\nAtenção: há um saldo pendente de *${formatCurrency(balance)}* para pagamento na retirada.` : '';
  const details = quotation ? formatQuotationMessage(quotation, context.paymentOptions) : '';
  let body = template.body;
  if (purpose === 'PICKUP_READY' && !body.includes('{aviso_pagamento}')) body += '\n\n{aviso_pagamento}';
  if (purpose === 'QUOTATION' && !body.includes('{detalhes_orcamento}')) body += '\n\n{detalhes_orcamento}';
  return renderMessageTemplate(body, {
    cliente: customer?.name || quotation?.customerName || order?.customerName || '',
    empresa: companyName,
    pedido: order?.number || '', servico: [...(order?.items||[]).map(i=>i.serviceName),...(order?.outsourcedServices||[]).flatMap(outsourcedServicesList)].filter(Boolean).join(', ') || order?.serviceName || '',
    valor_total: formatCurrency(order?.totalAmount ?? quotation?.totalAmount ?? 0), valor_pago: formatCurrency(order?.amountPaid ?? 0),
    saldo_pendente: formatCurrency(balance), aviso_pagamento: paymentNotice,
    dias_sem_servico: context.daysWithoutService == null ? 'sem serviço finalizado registrado' : String(context.daysWithoutService),
    detalhes_orcamento: details, pix: company?.pixKey || '',
  });
}
