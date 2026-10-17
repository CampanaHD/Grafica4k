import React from 'react';
import { PanelsTopLeft, X, type LucideIcon } from 'lucide-react';

interface DialogHeaderProps {
  title: string; subtitle?: string; onClose: () => void;
  icon?: LucideIcon; titleId?: string; closeLabel?: string;
}
export function DialogHeader({ title, subtitle, onClose, icon: Icon = PanelsTopLeft, titleId, closeLabel = 'Fechar janela' }: DialogHeaderProps) {
  return <header className="nagano-dialog-header"><div className="dialog-header-content">
    <span className="dialog-brand-label">NAGANO COMUNICAÇÃO VISUAL</span>
    <div className="dialog-title-row"><span className="dialog-heading-icon"><Icon size={21} strokeWidth={1.7} /></span><h2 id={titleId}>{title}</h2></div>
    {subtitle && <p>{subtitle}</p>}
  </div><button type="button" className="dialog-close-button" aria-label={closeLabel} onClick={onClose}><X size={20} /></button></header>;
}
