import React from 'react';
import { createPortal } from 'react-dom';
import { FittedPrintPage } from './FittedPrintPage';
import { CompanySettings, Quotation, QuotationItem } from '../types';
import { formatCurrency, formatDate } from '../utils/formatters';
import { describeQuotationItem, quotationCommercialSummary, quotationPaymentOptions, quotationRecalculationNotice } from '../utils/quotationMessage';

const printStyles = `
.quotation-preview { position:fixed; inset:0; background:rgba(17,21,34,.76); z-index:100; overflow:auto; padding:24px; }
.quotation-actions { max-width:210mm; margin:0 auto 14px; display:flex; justify-content:flex-end; gap:10px; }
.quotation-actions button { border:1px solid #dce2ee; border-radius:9px; padding:11px 18px; background:white; color:#344058; cursor:pointer; font:600 13px "Segoe UI",Arial,sans-serif; }
.quotation-actions button:last-child { background:#3158ed; color:white; border-color:#3158ed; }
.customer-quotation { box-sizing:border-box; width:210mm; max-width:100%; margin:auto; padding:10mm; background:white; color:#202737; font:9pt/1.5 "Segoe UI",Arial,sans-serif; box-shadow:0 16px 55px #0003; }
.customer-quotation * { box-sizing:border-box; }
.customer-quotation .quotation-layout { width:100%; border-collapse:collapse; table-layout:fixed; }
.customer-quotation .quotation-layout > thead > tr > td, .customer-quotation .quotation-layout > tbody > tr > td { padding:0; }
.customer-quotation .brand-header { display:flex; align-items:center; justify-content:space-between; gap:7mm; background:#111522; color:white; padding:4mm; border-radius:3mm 3mm 0 0; }
.customer-quotation .brand-logo { width:49mm; height:auto; display:block; }
.customer-quotation .brand-document { text-align:right; }
.customer-quotation .brand-document h1 { font-size:21pt; letter-spacing:-.6pt; line-height:1.1; margin:0 0 2mm; color:white; }
.customer-quotation .brand-document p { font-size:8pt; color:#cbd3e5; }
.customer-quotation .brand-line { height:1mm; background:linear-gradient(100deg,#207dff,#7255e8 38%,#e413ae 64%,#ff861e 89%,#f5bb17); margin-bottom:3mm; }
.customer-quotation .quote-meta { display:flex; justify-content:space-between; gap:6mm; color:#68758b; font-size:8pt; margin-bottom:4mm; }
.customer-quotation .client-card { border:1px solid #dfe5ef; border-radius:2.5mm; padding:2mm 4mm; margin-bottom:3mm; }
.customer-quotation .eyebrow { margin:0 0 1mm; font-size:7pt; font-weight:700; letter-spacing:1pt; color:#68758b; text-transform:uppercase; }
.customer-quotation .client-name { font-size:12pt; font-weight:650; color:#202737; }
.customer-quotation .service-block { border:1px solid #dfe5ef; border-radius:2.5mm; margin-bottom:3mm; break-inside:avoid; overflow:hidden; }
.customer-quotation .service-heading { padding:2mm 3mm; background:#f1f4fc; border-bottom:1px solid #dfe5ef; display:flex; align-items:flex-start; gap:3mm; }
.customer-quotation .service-number { border-radius:1.5mm; background:#3158ed; color:white; padding:1mm 2mm; font-weight:700; font-size:8pt; flex-shrink:0; }
.customer-quotation .service-heading h2 { margin:0; font-size:11pt; font-weight:650; line-height:1.35; color:#202737; overflow-wrap:anywhere; }
.customer-quotation .service-heading .eyebrow { margin-bottom:.5mm; font-size:6.5pt; }
.customer-quotation .service-table { width:100%; table-layout:fixed; border-collapse:collapse; }
.customer-quotation .service-table th { width:29%; text-align:left; padding:1mm 3mm; font-size:8pt; font-weight:600; color:#617086; vertical-align:top; border-bottom:1px solid #edf0f5; }
.customer-quotation .service-table td { padding:1mm 3mm; text-align:left; border-bottom:1px solid #edf0f5; overflow-wrap:anywhere; white-space:pre-wrap; }
.customer-quotation .service-table tr:last-child th, .customer-quotation .service-table tr:last-child td { border-bottom:0; }
.customer-quotation .service-table .item-total th, .customer-quotation .service-table .item-total td { background:#f7f9fe; color:#2747c8; font-weight:700; }
.customer-quotation .service-table .item-total td { text-align:right; font-size:11pt; }
.customer-quotation .service-table { display:block; }
.customer-quotation .service-table tbody { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); }
.customer-quotation .service-table tr { display:flex; border-bottom:1px solid #edf0f5; min-width:0; }
.customer-quotation .service-table tr.wide-detail { grid-column:1 / -1; }
.customer-quotation .service-table tr.wide-detail th { flex-basis:18%; }
.customer-quotation .service-table tr.item-unit { grid-column:1; }
.customer-quotation .service-table tr.item-total { grid-column:2; }
.customer-quotation .service-table th { display:block; flex:0 0 36%; width:auto; font-size:7.5pt; padding:1mm 2mm; border:0; }
.customer-quotation .service-table td { display:block; flex:1; min-width:0; font-size:8.5pt; padding:1mm 2mm; border:0; }
.customer-quotation .service-table .item-total th { flex-basis:50%; }
.customer-quotation .service-table .item-total td { font-size:9pt; }
.customer-quotation .summary { padding:2mm 4mm; background:#f7f9fc; border:1px solid #dfe5ef; border-radius:2.5mm; margin-bottom:3mm; break-inside:avoid; }
.customer-quotation .summary dl { margin:2mm 0 0; }
.customer-quotation .summary dl > div { display:flex; justify-content:space-between; gap:5mm; padding:0; font-size:8.5pt; }
.customer-quotation .summary dt { color:#617086; }
.customer-quotation .summary dd { margin:0; font-weight:600; }
.customer-quotation .quote-total { display:flex; justify-content:space-between; gap:5mm; background:#3158ed; color:white; padding:4mm 5mm; border-radius:2.5mm; font-size:11pt; font-weight:600; break-inside:avoid; margin:0 0 5mm; }
.customer-quotation .quote-total strong { font-size:17pt; line-height:1.2; white-space:nowrap; }
.customer-quotation .document-section { margin:0 0 3mm; break-inside:avoid; }
.customer-quotation h3 { margin:0 0 2mm; font-size:10pt; font-weight:650; color:#202737; }
.customer-quotation p { margin:0; white-space:pre-wrap; overflow-wrap:anywhere; }
.customer-quotation .payment-section { border:1px solid #dfe5ef; border-radius:2.5mm; padding:2mm 4mm; }
.customer-quotation .payment-options { margin:1mm 0 0; padding-left:4mm; display:grid; grid-template-columns:1fr 1fr; column-gap:5mm; }
.customer-quotation .payment-options li { padding:.7mm 0; white-space:pre-wrap; overflow-wrap:anywhere; }
.customer-quotation .payment-condition { padding-bottom:1mm; margin-bottom:1mm; border-bottom:1px solid #edf0f5; }
.customer-quotation .company-details { padding-top:2mm; border-top:1px solid #dfe5ef; break-inside:avoid; font-size:7.5pt; line-height:1.3; color:#617086; }
.customer-quotation .company-details strong { color:#202737; }
.customer-quotation .notice { margin:0 0 5mm; font-size:7.5pt; color:#68758b; }
.customer-quotation .company-details .notice { margin:3mm 0 0; }
@media screen and (max-width:600px) {
  .quotation-preview { padding:10px; }
  .customer-quotation { padding:5mm; font-size:8.5pt; }
  .customer-quotation .brand-header { padding:4mm; gap:3mm; }
  .customer-quotation .brand-logo { width:38mm; }
  .customer-quotation .brand-document h1 { font-size:17pt; }
  .customer-quotation .quote-meta { flex-wrap:wrap; }
  .customer-quotation .quote-total { flex-direction:column; gap:2mm; }
  .customer-quotation .service-table th { width:35%; }
}
@media print {
  @page { size:A4; margin:0; }
  body:has(> .quotation-preview) { margin:0 !important; background:white !important; }
  body:has(> .quotation-preview) > :not(.quotation-preview) { display:none !important; }
  .quotation-preview { position:static; padding:0; overflow:visible; background:white; }
  .quotation-actions { display:none !important; }
  .customer-quotation { width:100%; max-width:none; margin:0; padding:0; box-shadow:none; print-color-adjust:exact; -webkit-print-color-adjust:exact; }
  .customer-quotation .quotation-layout > thead { display:table-header-group; }
  .customer-quotation .service-table tr { break-inside:avoid; }
}
`;

type DocumentProps = { quotation: Quotation; items: QuotationItem[]; company: CompanySettings; paymentOptions?: string[] };

/** Customer document presents saved prices and specifications; it never reprices a quote. */
export function QuotationDocument({ quotation: q, items, company, paymentOptions }: DocumentProps) {
  const name = company.tradingName || company.companyName;
  const address = [company.street, company.number, company.complement, company.neighborhood,
    [company.city, company.state].filter(Boolean).join('/')].filter(Boolean).join(', ');
  const contacts = [company.whatsapp || company.telephone, company.email].filter(Boolean).join(' | ');
  const payments = quotationPaymentOptions(paymentOptions);
  const summary = quotationCommercialSummary(q);
  return <FittedPrintPage size="A4" className="customer-quotation" label={`Orçamento ${q.number}`}>
    <style>{printStyles}</style>
    <table className="quotation-layout"><thead><tr><td>
      <header className="brand-header">
        <img className="brand-logo" src="/brand/nagano-logo-white.png" alt="Nagano Comunicação Visual" />
        <div className="brand-document"><h1>Orçamento</h1><p>{q.number}{(q.commercialVersion ?? 1) > 1 && ` · Revisão ${q.commercialVersion}`}</p></div>
      </header>
      <div className="brand-line" />
    </td></tr></thead><tbody><tr><td>
      <div className="quote-meta"><span>Emissão: {formatDate(q.createdAt)}{q.createdBy?.name&&<><br/>Atendimento: {q.createdBy.name}</>}</span>{q.expirationDate && <span>Válido até: <strong>{formatDate(q.expirationDate)}</strong></span>}</div>
      <div className="client-card"><p className="eyebrow">Preparado para</p><p className="client-name">{q.customerName}</p></div>
    </td></tr>
      {items.map((item, index) => {
        const { name: serviceName, details, unitLabel } = describeQuotationItem(item, !q.items?.length && index === 0 ? q.finishingText : undefined);
        const unitValue = Number.isFinite(item.subtotal) && Number.isFinite(item.quantity) && item.quantity > 0 ? item.subtotal / item.quantity : undefined;
        return <tr key={item.id || index}><td><section className="service-block">
          <header className="service-heading"><span className="service-number">{String(index + 1).padStart(2, '0')}</span><div><p className="eyebrow">{index + 1}º Serviço</p><h2>{serviceName}</h2></div></header>
          <table className="service-table"><tbody>
            {details.map((detail, detailIndex) => <tr className={['Descrição', 'Especificação'].includes(detail.label) ? 'wide-detail' : undefined} key={detailIndex}><th scope="row">{detail.label}</th><td>{detail.value}</td></tr>)}
            {unitValue !== undefined && <tr className="item-unit"><th scope="row">Valor por {unitLabel}</th><td>{formatCurrency(unitValue)}</td></tr>}
            <tr className="item-total"><th scope="row">Total do serviço</th><td>{formatCurrency(item.subtotal)}</td></tr>
          </tbody></table>
        </section></td></tr>;
      })}
      {summary.length > 0 && <tr><td><section className="summary"><h3>Resumo do orçamento</h3><dl>{summary.map(entry => <div key={entry.label}><dt>{entry.label}</dt><dd>{entry.discount && '- '}{formatCurrency(entry.value)}</dd></div>)}</dl></section></td></tr>}
      <tr><td><div className="quote-total"><span>Valor total do orçamento</span><strong>{formatCurrency(q.totalAmount)}</strong></div></td></tr>
      {Number.isFinite(q.maxDeadlineDays) && q.maxDeadlineDays > 0 && <tr><td><section className="document-section"><h3>Prazo de produção</h3><p><strong>{q.maxDeadlineDays} {q.maxDeadlineDays === 1 ? 'dia útil' : 'dias úteis'}</strong> após a aprovação da arte e confirmação do pedido.</p></section></td></tr>}
      {(q.paymentTerms?.trim() || payments.length > 0) && <tr><td><section className="document-section payment-section"><h3>Formas de pagamento</h3>
        {q.paymentTerms?.trim() && <div className={payments.length ? 'payment-condition' : undefined}><p className="eyebrow">Condição deste orçamento</p><p>{q.paymentTerms}</p></div>}
        {payments.length > 0 && <><p className="eyebrow">Opções disponíveis</p><ul className="payment-options">{payments.map(option => <li key={option}>{option}</li>)}</ul></>}
      </section></td></tr>}
      {q.customerNotes?.trim() && <tr><td><section className="document-section"><h3>Observações</h3><p>{q.customerNotes}</p></section></td></tr>}
      <tr><td><p className="notice">{quotationRecalculationNotice}</p></td></tr>
      <tr><td><footer className="company-details">
        {name && <p><strong>{name}</strong></p>}
        {company.companyName && company.companyName !== name && <p>Razão social: {company.companyName}</p>}
        {company.cnpjCpf && <p>CNPJ/CPF: {company.cnpjCpf}</p>}
        {contacts && <p>{contacts}</p>}
        {address && <p>{address}</p>}
        {company.cep && <p>CEP: {company.cep}</p>}
        {company.quotationFooter?.trim() && <p className="notice">{company.quotationFooter}</p>}
      </footer>
    </td></tr></tbody></table>
  </FittedPrintPage>;
}

export function PrintableQuotation({ quotation, items, company, paymentOptions, onClose }: DocumentProps & { onClose: () => void }) {
  return createPortal(<div className="quotation-preview" role="dialog" aria-modal="true" aria-label="Prévia do orçamento">
    <div className="quotation-actions">
      <button onClick={onClose}>Fechar</button>
      <button onClick={async () => {
        await Promise.all(Array.from(document.querySelectorAll<HTMLImageElement>('.customer-quotation img')).map(img => img.decode().catch(() => undefined)));
        await document.fonts.ready;
        window.print();
      }}>Imprimir / Salvar PDF</button>
    </div>
    <QuotationDocument quotation={quotation} items={items} company={company} paymentOptions={paymentOptions} />
  </div>, document.body);
}
