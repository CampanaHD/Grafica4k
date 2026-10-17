import React from 'react';
import { createPortal } from 'react-dom';
import { CompanySettings, QuotationItem, WorkOrder } from '../types';
import { formatDate } from '../utils/formatters';
import { describeQuotationItem } from '../utils/quotationMessage';
import { FittedPrintPage } from './FittedPrintPage';
import { outsourcedCustomerItems } from '../utils/outsourcing';

const styles = `
.production-sheet-preview {position:fixed;inset:0;z-index:100;overflow:auto;background:#111522bd;padding:24px;}
.production-sheet-actions {max-width:148mm;display:flex;gap:10px;justify-content:flex-end;margin:0 auto 14px;}
.production-sheet-actions button {border:1px solid #dfe5ef;background:white;border-radius:9px;padding:11px 16px;color:#344058;font:600 13px "Segoe UI",Arial,sans-serif;cursor:pointer;}
.production-sheet-actions button:last-child {background:#3158ed;color:white;border-color:#3158ed;}
.production-sheet {font:8.5pt/1.4 "Segoe UI",Arial,sans-serif;}
.production-sheet * {box-sizing:border-box;}
.production-sheet .sheet-header {display:flex;align-items:center;justify-content:space-between;gap:4mm;background:#111522;color:white;padding:3mm 4mm;border-radius:2mm 2mm 0 0;}
.production-sheet .sheet-header img {width:37mm;height:auto;}
.production-sheet .sheet-heading {text-align:right;}
.production-sheet h1 {font-size:13pt;line-height:1.2;margin:0 0 1mm;color:white;}
.production-sheet .sheet-heading p {font-size:8pt;margin:0;color:#cbd3e5;}
.production-sheet .sheet-spectrum {height:.8mm;background:linear-gradient(100deg,#207dff,#7255e8 38%,#e413ae 64%,#ff861e 89%);margin-bottom:3mm;}
.production-sheet .sheet-meta {border:1px solid #dfe5ef;border-radius:2mm;padding:2mm 3mm;margin-bottom:3mm;}
.production-sheet p {margin:0;white-space:pre-wrap;overflow-wrap:anywhere;}
.production-sheet .sheet-meta .deadline {margin-top:1mm;color:#2747c8;}
.production-sheet .technical-item {border:1px solid #dfe5ef;border-radius:2mm;margin-bottom:3mm;overflow:hidden;}
.production-sheet h2 {font-size:9.5pt;color:#202737;background:#f1f4fc;padding:2mm 3mm;margin:0;font-weight:700;}
.production-sheet dl {margin:0;}
.production-sheet dl > div {display:grid;grid-template-columns:31% 1fr;border-top:1px solid #edf0f5;padding:1mm 3mm;gap:2mm;}
.production-sheet dt {font-size:8pt;color:#617086;font-weight:600;}
.production-sheet dd {margin:0;white-space:pre-wrap;overflow-wrap:anywhere;}
.production-sheet .sheet-note {margin-bottom:3mm;padding:2mm 3mm;background:#f7f9fc;border:1px solid #dfe5ef;border-radius:2mm;}
.production-sheet .sheet-note h3 {font-size:9pt;margin:0 0 1mm;font-weight:700;}
.production-sheet .sheet-footer {font-size:7pt;color:#68758b;border-top:1px solid #dfe5ef;padding-top:2mm;}
@media print {
 @page {size:A5;margin:0;}
 body:has(> .production-sheet-preview) {margin:0!important;background:white!important;}
 body:has(> .production-sheet-preview) > :not(.production-sheet-preview) {display:none!important;}
 .production-sheet-preview {position:static;padding:0;background:white;overflow:visible;}
 .production-sheet-actions {display:none!important;}
}
`;
interface PrintableWorkOrderProps { workOrder: WorkOrder; company: CompanySettings }
export const PrintableWorkOrder: React.FC<PrintableWorkOrderProps> = ({ workOrder: os }) => {
  const items = [...(os.items?.length ? os.items : os.outsourcedServices?.length?[]:[{ id:'legacy', serviceName:os.serviceName, description:os.description, widthCm:os.widthCm, heightCm:os.heightCm, quantity:os.quantity, materialName:os.materialName,
    finishings: os.finishingText ? [{finishingName:os.finishingText}] : [] } as QuotationItem]),...outsourcedCustomerItems(os.outsourcedServices)];
  const notes = [...new Set([os.artworkInstructions, os.customerNotes, os.internalNotes,os.productionNotes].map(value => value?.trim()).filter(Boolean))];
  return <FittedPrintPage size="A5" className="production-sheet" label={`Ficha de produção ${os.number}`}>
    <style>{styles}</style>
    <header className="sheet-header"><img src="/brand/nagano-logo-white.png" alt="Nagano Comunicação Visual" /><div className="sheet-heading"><h1>Ficha de produção</h1><p>{os.number}</p></div></header><div className="sheet-spectrum" />
    <div className="sheet-meta"><p><strong>Cliente:</strong> {os.customerName}</p><p className="deadline"><strong>Prazo final:</strong> {formatDate(os.deadlineDate)}</p>{os.quotationNumber && <p>Orçamento: {os.quotationNumber}</p>}</div>
    {items.map((item, index) => {
      const { name, details } = describeQuotationItem(item);
      const technical = [...details];
      if (os.colors && items.length === 1 && !details.some(detail => /^cores?$/i.test(detail.label))) technical.push({label:'Cores',value:os.colors});
      if (item.productionWidthCm > 0 && item.productionHeightCm > 0) technical.push({label:'Medida de produção',value:`${item.productionWidthCm.toLocaleString('pt-BR')} x ${item.productionHeightCm.toLocaleString('pt-BR')} cm`});
      if (item.sheetSnapshot) {
        const s=item.sheetSnapshot;
        technical.push({label:'Chapa',value:`${s.sheetName} · ${s.widthCm} x ${s.heightCm} cm`});
        technical.push({label:'Encaixe na chapa',value:`${s.columns} colunas x ${s.rows} fileiras · ${s.capacity} peças por chapa${s.rotated?' · Girado 90°':''}`});
        technical.push({label:'Chapas necessárias',value:String(s.sheetsNeeded)});
      }
      if (item.simulationSnapshot) {
        const snap = item.simulationSnapshot;
        technical.push({label:'Encaixe',value:`${snap.layout.columns} colunas x ${snap.layout.rows} fileiras por área de ${snap.config.areaWidthCm} x ${snap.config.areaHeightCm} cm${snap.layout.rotated ? ' · Girado 90°' : ''}`});
        technical.push({label:'Preparação',value:`Margem ${snap.config.marginCm} cm · Espaço ${snap.config.gapCm} cm · Sangria ${snap.config.bleedCm} cm por lado`});
      }
      if (item.notes?.trim()) technical.push({label:'Observação do item',value:item.notes});
      (item.finishings ?? []).filter(fin => fin.notes?.trim()).forEach(fin => technical.push({label:fin.finishingName,value:fin.notes}));
      return <section className="technical-item" key={item.id || index}><h2>{String(index+1).padStart(2,'0')} · {name}</h2><dl>{technical.map((detail, i) => <div key={i}><dt>{detail.label}</dt><dd>{detail.value}</dd></div>)}</dl></section>;
    })}
    {os.installationText?.trim() && !/^não inclusa\.?$/i.test(os.installationText.trim()) && <section className="sheet-note"><h3>Instalação</h3><p>{os.installationText}</p></section>}
    {notes.length > 0 && <section className="sheet-note"><h3>Observações e instruções</h3>{notes.map((note, i) => <p key={i}>{note}</p>)}</section>}
    <footer className="sheet-footer">Nagano Comunicação Visual · Produção e acabamento</footer>
  </FittedPrintPage>;
};
export function ProductionSheetPreview({ workOrder, company, onClose }: PrintableWorkOrderProps & {onClose:()=>void}) {
  return createPortal(<div className="production-sheet-preview" role="dialog" aria-modal="true" aria-label="Ficha de produção A5"><style>{styles}</style><div className="production-sheet-actions"><button onClick={onClose}>Fechar</button><button onClick={async () => { await Promise.all(Array.from(document.querySelectorAll<HTMLImageElement>('.production-sheet img')).map(img=>img.decode().catch(()=>undefined))); await document.fonts.ready; window.print(); }}>Imprimir / Salvar A5</button></div><PrintableWorkOrder workOrder={workOrder} company={company}/></div>,document.body);
}

