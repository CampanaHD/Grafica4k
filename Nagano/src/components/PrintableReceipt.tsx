import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { CompanySettings, PaymentMethod, Receipt } from '../types';
import { formatCurrency, formatDate } from '../utils/formatters';
import { FittedPrintPage } from './FittedPrintPage';

const paymentLabels: Record<string, string> = {
  CARTAO_CREDITO: 'Cartão de crédito', CARTAO_DEBITO: 'Cartão de débito', BOLETO: 'Boleto bancário', DINHEIRO: 'Dinheiro', PIX: 'Pix', DEBITO: 'Cartão de débito', CREDITO: 'Cartão de crédito', TRANSFERENCIA: 'Transferência bancária', OUTRO: 'Outra forma de pagamento',
};
const brandName = 'Nagano Comunicação Visual';
const legacyCompanyNames = ['Gráfica Rápida & Comunicação Visual', 'Gráfica & Impressão Express'];
const styles = `
.receipt-preview {position:fixed;inset:0;z-index:100;overflow:auto;background:#111522c2;padding:24px;}
.receipt-actions {max-width:210mm;margin:0 auto 14px;display:flex;justify-content:space-between;align-items:center;gap:12px;color:#fff;font:600 13px "Segoe UI",Arial,sans-serif;}
.receipt-actions p {margin:0;font-size:12px;color:#dce2ef;}
.receipt-actions > div {display:flex;gap:10px;}
.receipt-actions button {border:1px solid #dce2ee;border-radius:9px;padding:11px 18px;background:#fff;color:#344058;cursor:pointer;font:600 13px "Segoe UI",Arial,sans-serif;}
.receipt-actions button:last-child {background:#3158ed;color:#fff;border-color:#3158ed;}
.nagano-receipt {font:10pt/1.5 "Segoe UI",Arial,sans-serif;color:#202737;}
.nagano-receipt * {box-sizing:border-box;}
.nagano-receipt p,.nagano-receipt h1,.nagano-receipt h2 {margin:0;white-space:pre-wrap;overflow-wrap:anywhere;}
.nagano-receipt .receipt-layout {min-height:272mm;display:flex;flex-direction:column;gap:4mm;}
.nagano-receipt .receipt-header {display:flex;justify-content:space-between;align-items:center;gap:8mm;padding:6mm;background:#111522;color:#fff;border-radius:3mm 3mm 0 0;}
.nagano-receipt .receipt-logo {display:block;width:51mm;height:auto;max-width:45%;}
.nagano-receipt .receipt-document {text-align:right;min-width:0;}
.nagano-receipt .receipt-document h1 {font-size:19pt;font-weight:700;line-height:1.2;letter-spacing:-.6pt;color:#fff;}
.nagano-receipt .receipt-document p {margin-top:2mm;font-size:8.5pt;letter-spacing:.4pt;color:#d7dfef;}
.nagano-receipt .receipt-spectrum {height:1mm;background:linear-gradient(100deg,#207dff,#7255e8 38%,#e413ae 64%,#ff861e 89%,#f5bb17);}
.nagano-receipt .receipt-meta {display:flex;justify-content:space-between;gap:4mm;font-size:8pt;color:#617086;margin-top:3mm;}
.nagano-receipt .receipt-amount {display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:2mm 5mm;background:#3158ed;color:#fff;padding:5mm 6mm;border-radius:3mm;}
.nagano-receipt .receipt-amount p {font-size:9pt;font-weight:600;}
.nagano-receipt .receipt-amount span {display:block;color:#dce5ff;font-size:8pt;margin-top:1mm;}
.nagano-receipt .receipt-amount strong {color:#fff;font-size:28pt;letter-spacing:-.7pt;font-weight:700;line-height:1.2;font-variant-numeric:tabular-nums;overflow-wrap:anywhere;}
.nagano-receipt .receipt-card {border:1px solid #dfe5ef;border-radius:2.5mm;padding:4mm 5mm;}
.nagano-receipt .receipt-label {display:block;font-size:7.5pt;font-weight:700;letter-spacing:.8pt;text-transform:uppercase;color:#68758b;margin-bottom:1.5mm;}
.nagano-receipt .receipt-customer {font-size:13pt;line-height:1.4;font-weight:650;color:#202737;}
.nagano-receipt .receipt-document-id {color:#617086;font-size:8.5pt;margin-top:1.5mm;}
.nagano-receipt .receipt-words {font-size:10pt;color:#344058;background:#f7f9fc;}
.nagano-receipt .receipt-reference p {font-size:10pt;line-height:1.6;}
.nagano-receipt .receipt-order {display:inline-block;border:1px solid #dbe4ff;background:#eff3ff;border-radius:1.5mm;padding:1mm 2mm;font-size:8pt;color:#2747c8;margin-top:3mm;}
.nagano-receipt .receipt-payment {display:grid;grid-template-columns:1fr 1fr;gap:4mm;}
.nagano-receipt .receipt-payment strong {font-size:10pt;font-weight:650;color:#202737;}
.nagano-receipt .receipt-notes {background:#f7f9fc;border-left:3px solid #7191fc;font-size:9pt;}
.nagano-receipt .receipt-signatures {margin-top:auto;padding-top:5mm;}
.nagano-receipt .receipt-place {text-align:right;font-size:8pt;color:#617086;}
.nagano-receipt .receipt-signature-grid {display:grid;grid-template-columns:1fr 1fr;gap:12mm;margin-top:13mm;}
.nagano-receipt .receipt-signature {text-align:center;border-top:1px solid #a9b5ca;padding-top:2mm;font-size:8pt;}
.nagano-receipt .receipt-signature strong {display:block;font-weight:650;color:#202737;overflow-wrap:anywhere;}
.nagano-receipt .receipt-signature p {color:#617086;font-size:7.5pt;margin-top:1mm;}
.nagano-receipt .receipt-footer {border-top:1px solid #dfe5ef;padding-top:3mm;margin-top:3mm;color:#617086;font-size:7.5pt;line-height:1.5;}
.nagano-receipt .receipt-footer strong {color:#202737;}
.nagano-receipt .receipt-footer .receipt-legal {margin-bottom:2mm;}
@media screen and (max-width:600px) {
 .receipt-preview {padding:10px;}
 .receipt-actions {align-items:flex-end;}
 .receipt-actions button {padding:10px;font-size:12px;}
 .receipt-actions p {max-width:100px;font-size:11px;}
 .nagano-receipt {height:auto!important;padding:5mm!important;}
 .nagano-receipt .receipt-layout {min-height:0;}
 .nagano-receipt .receipt-header {padding:4mm;gap:3mm;}
 .nagano-receipt .receipt-logo {width:36mm;}
 .nagano-receipt .receipt-document h1 {font-size:14pt;}
 .nagano-receipt .receipt-document p {font-size:7pt;}
 .nagano-receipt .receipt-amount strong {font-size:25pt;}
 .nagano-receipt .receipt-payment {grid-template-columns:1fr;gap:3mm;}
 .nagano-receipt .receipt-signature-grid {gap:5mm;}
}
@media print {
 @page {size:A4;margin:0;}
 body:has(> .receipt-preview) {margin:0!important;background:#fff!important;}
 body:has(> .receipt-preview) > :not(.receipt-preview) {display:none!important;}
 .receipt-preview {position:static;overflow:visible;padding:0;background:#fff;}
 .receipt-actions {display:none!important;}
 .nagano-receipt {print-color-adjust:exact;-webkit-print-color-adjust:exact;}
}
`;
interface PrintableReceiptProps { receipt: Receipt; company: CompanySettings }
export const PrintableReceipt: React.FC<PrintableReceiptProps> = ({ receipt: r, company: c }) => {
  const address = [c.street, c.number, c.complement, c.neighborhood, [c.city,c.state].filter(Boolean).join(' / ')].filter(Boolean).join(', ');
  const contacts = [c.whatsapp || c.telephone, c.email].filter(Boolean).join(' · ');
  const legalName = c.companyName && !legacyCompanyNames.includes(c.companyName) && c.companyName !== brandName ? c.companyName : '';
  const place = [c.city,c.state].filter(Boolean).join(' / ');
  return <FittedPrintPage size="A4" className="nagano-receipt" label={`Recibo de pagamento ${r.number}`}>
    <style>{styles}</style>
    <div className="receipt-layout">
      <div><header className="receipt-header"><img className="receipt-logo" src="/brand/nagano-logo-white.png" alt={brandName}/><div className="receipt-document"><h1>Recibo de<br/>{r.kind==='FINAL_SETTLEMENT'?'quitação':'pagamento'}</h1><p>{r.number}</p></div></header><div className="receipt-spectrum"/><div className="receipt-meta"><span>{r.kind==='FINAL_SETTLEMENT'?'Quitação integral do pedido':'Comprovante de recebimento'}</span><span>Data: {formatDate(r.paymentDate)}</span></div></div>
      <section className="receipt-amount" aria-label="Valor recebido"><div><p>Valor recebido</p><span>{r.kind==='FINAL_SETTLEMENT'?'Valor total do pedido quitado':'Pagamento registrado'}</span></div><strong>{formatCurrency(r.amount)}</strong></section>
      <section className="receipt-card"><h2 className="receipt-label">Recebemos de</h2><p className="receipt-customer">{r.customerName}</p>{r.cpfCnpj?.trim()&&<p className="receipt-document-id">CPF/CNPJ: {r.cpfCnpj}</p>}</section>
      {r.amountInWords?.trim()&&<section className="receipt-card receipt-words"><h2 className="receipt-label">Valor por extenso</h2><p>{r.amountInWords}</p></section>}
      <section className="receipt-card receipt-reference"><h2 className="receipt-label">Referente a</h2><p>{r.referringTo}</p>{r.workOrderNumber&&<span className="receipt-order">Ordem de serviço · {r.workOrderNumber}</span>}</section>
      <div className="receipt-payment"><section className="receipt-card"><h2 className="receipt-label">Forma de pagamento</h2><strong>{paymentLabels[r.paymentMethod] ?? r.paymentMethod}</strong></section><section className="receipt-card"><h2 className="receipt-label">Data do pagamento</h2><strong>{formatDate(r.paymentDate)}</strong></section></div>
      {r.observations?.trim()&&<section className="receipt-card receipt-notes"><h2 className="receipt-label">Observações</h2><p>{r.observations}</p></section>}
      <section className="receipt-signatures"><p className="receipt-place">{place&&`${place}, `}{formatDate(r.paymentDate)}</p><div className="receipt-signature-grid"><div className="receipt-signature"><strong>{brandName}</strong><p>Assinatura do recebedor{r.issuerName?.trim()&&<><br/>{r.issuerName}</>}</p></div><div className="receipt-signature"><strong>{r.customerName}</strong><p>Assinatura do pagador</p></div></div></section>
      <footer className="receipt-footer">{c.receiptFooter?.trim()&&<p className="receipt-legal">{c.receiptFooter}</p>}<p><strong>{brandName}</strong>{legalName&&` · ${legalName}`}</p>{c.cnpjCpf&&<p>CNPJ/CPF: {c.cnpjCpf}{c.stateRegistration&&` · I.E.: ${c.stateRegistration}`}</p>}{address&&<p>{address}</p>}{contacts&&<p>{contacts}</p>}</footer>
    </div>
  </FittedPrintPage>;
};
export function ReceiptPreview({ receipt, company, onClose }: PrintableReceiptProps & { onClose: () => void }) {
  const closeButton = useRef<HTMLButtonElement>(null);
  useEffect(()=>{const previous=document.activeElement as HTMLElement|null;closeButton.current?.focus();const key=(event:KeyboardEvent)=>{if(event.key==='Escape'){event.preventDefault();onClose();}};document.addEventListener('keydown',key);return()=>{document.removeEventListener('keydown',key);previous?.focus();};},[onClose]);
  return createPortal(<div className="receipt-preview" role="dialog" aria-modal="true" aria-label="Prévia do recibo"><style>{styles}</style><div className="receipt-actions"><p>Recibo de pagamento · A4</p><div><button ref={closeButton} onClick={onClose}>Fechar</button><button onClick={async()=>{await Promise.all(Array.from(document.querySelectorAll<HTMLImageElement>('.nagano-receipt img')).map(img=>img.decode().catch(()=>undefined)));await document.fonts.ready;window.print();}}>Imprimir / Salvar PDF</button></div></div><PrintableReceipt receipt={receipt} company={company}/></div>,document.body);
}

