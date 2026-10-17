import React, { useEffect, useRef, useState } from 'react';
import { LayoutDashboard, Calculator, Users, FileText, Kanban, PackageCheck, DollarSign, Receipt, Globe, Settings, Bell, Menu, X, ChevronRight, Plus, ArrowUpRight, UserRound, Package, Wallet, ChartNoAxesCombined } from 'lucide-react';
import type { UserRole } from '../types';
import {useAccess} from './AccessBoundary';
import {canAccess} from '../utils/profileAccess';
import {ProfileMenu} from './ProfileMenu';

interface LayoutProps {
  currentTab: string; setCurrentTab: (tab: string) => void;
  currentRole: UserRole;
  onNewQuotation: () => void; children: React.ReactNode;
  urgentCount?: number; pendingPickupCount?: number;
}
const roles: { value: UserRole; label: string }[] = [
  { value: 'ADMIN', label: 'Administrador' }, { value: 'SALES', label: 'Vendas e balcão' },
  { value: 'DESIGN', label: 'Arte-finalista' }, { value: 'PRODUCTION', label: 'Produção' },
  { value: 'FINISHING', label: 'Acabamento' }, { value: 'FINANCE', label: 'Financeiro' }, { value: 'READONLY', label: 'Apenas consulta' },
];
export function Layout({ currentTab, setCurrentTab, currentRole, onNewQuotation, children, urgentCount = 0, pendingPickupCount = 0 }: LayoutProps) {
  const access=useAccess();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [compact, setCompact] = useState(() => typeof window !== 'undefined' && window.innerWidth <= 1000);
  const sidebarRef = useRef<HTMLElement>(null);
  const menuRef = useRef<HTMLButtonElement>(null);
  const menuItems = [
    { id: 'dashboard', label: 'Visão geral', icon: LayoutDashboard, group: 'OPERAÇÃO' },
    { id: 'quotations', label: 'Orçamentos', icon: Calculator, group: 'OPERAÇÃO' },
    { id: 'customers', label: 'Clientes', icon: Users, group: 'OPERAÇÃO' },
    { id: 'work_orders', label: 'Ordens de serviço', icon: FileText, group: 'OPERAÇÃO' },
    { id: 'kanban', label: 'Produção', icon: Kanban, group: 'OPERAÇÃO', badge: urgentCount },
    { id: 'pickup', label: 'Retiradas', icon: PackageCheck, group: 'OPERAÇÃO', badge: pendingPickupCount },
    { id: 'inventory', label: 'Estoque', icon: Package, group: 'OPERAÇÃO' },
    { id: 'payables', label: 'Contas a pagar', icon: Wallet, group: 'FINANCEIRO' },
    { id: 'reports', label: 'Resultados e custos', icon: ChartNoAxesCombined, group: 'FINANCEIRO' },
    { id: 'finance', label: 'Contas a receber', icon: DollarSign, group: 'FINANCEIRO' },
    { id: 'receipts', label: 'Recibos', icon: Receipt, group: 'FINANCEIRO' },
    { id: 'integrations', label: 'Integrações', icon: Globe, group: 'ADMINISTRAÇÃO' },
    { id: 'third_parties', label: 'Terceiros', icon: Users, group: 'ADMINISTRAÇÃO' },
    { id: 'activity', label: 'Atividades da equipe', icon: Bell, group: 'ADMINISTRAÇÃO' },
    { id: 'settings', label: 'Configurações', icon: Settings, group: 'ADMINISTRAÇÃO' },
  ];
  const allowedMenu=menuItems.filter(item=>canAccess(access.profile,item.id));
  const activePage = allowedMenu.find(item => item.id === currentTab) ?? allowedMenu[0] ?? menuItems[0];
  const date = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'America/Sao_Paulo' }).format(new Date());
  const go = (id: string) => { setCurrentTab(id); setMobileOpen(false); };
  useEffect(() => {
    const query = window.matchMedia('(max-width: 1000px)');
    const update = () => setCompact(query.matches);
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  useEffect(() => {
    if (!mobileOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    sidebarRef.current?.querySelector<HTMLButtonElement>('button')?.focus();
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMobileOpen(false);
      if (event.key === 'Tab') {
        const controls = [...(sidebarRef.current?.querySelectorAll<HTMLElement>('button, a') ?? [])].filter(control => control.offsetParent !== null);
        const first = controls[0], last = controls[controls.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    };
    const resize = () => { if (window.innerWidth > 1000) setMobileOpen(false); };
    document.addEventListener('keydown', key); window.addEventListener('resize', resize);
    return () => { document.body.style.overflow = previousOverflow; document.removeEventListener('keydown', key); window.removeEventListener('resize', resize); menuRef.current?.focus(); };
  }, [mobileOpen]);
  return <div className="nagano-shell">
    <a href="#conteudo-principal" className="skip-link">Ir para o conteúdo</a>
    {mobileOpen && <button className="sidebar-overlay" type="button" aria-label="Fechar menu de navegação" onClick={() => setMobileOpen(false)} />}
    <aside ref={sidebarRef} id="app-navigation" className={`app-sidebar ${mobileOpen ? 'is-open' : ''}`} aria-label="Menu principal" inert={compact && !mobileOpen}>
      <div className="sidebar-brand"><button type="button" className="brand-home" onClick={() => go(allowedMenu[0]?.id||'dashboard')} aria-label="Nagano Comunicação Visual — início"><img src="/brand/nagano-logo-white.png" alt="Nagano Comunicação Visual" width="194" height="53" /></button><button type="button" className="sidebar-close" aria-label="Fechar menu" onClick={() => setMobileOpen(false)}><X size={20} /></button><span className="brand-caption">GESTÃO & COMUNICAÇÃO VISUAL</span></div>
      <div className="brand-spectrum" aria-hidden="true" />
      <nav className="sidebar-nav" aria-label="Áreas do sistema">{['OPERAÇÃO', 'FINANCEIRO', 'ADMINISTRAÇÃO'].filter(group=>allowedMenu.some(item=>item.group===group)).map(group => <div key={group} className="nav-group"><p className="nav-group-title">{group}</p>{allowedMenu.filter(item => item.group === group).map(item => { const Icon = item.icon; return <button key={item.id} type="button" className={`nav-item ${currentTab === item.id ? 'is-active' : ''}`} aria-current={currentTab === item.id ? 'page' : undefined} onClick={() => go(item.id)}><Icon size={19} strokeWidth={1.7} /><span>{item.label}</span>{!!item.badge && <span className="nav-badge">{item.badge}</span>}</button>; })}</div>)}</nav>
      <div className="sidebar-bottom">{canAccess(access.profile,'quotations')&&<div className="sidebar-cta"><p>O próximo projeto<br />começa por aqui.</p><button type="button" onClick={() => { onNewQuotation(); setMobileOpen(false); }}><Plus size={16} /> Criar orçamento <ArrowUpRight size={15} /></button></div>}<div className="sidebar-signature"><span className="signature-dot" /><span>Nagano Comunicação Visual</span><span className="signature-version">v2.4</span></div></div>
    </aside>
    <div className="app-workspace" inert={compact && mobileOpen}><header className="app-topbar"><div className="topbar-location"><button ref={menuRef} type="button" className="mobile-menu-button" aria-label="Abrir menu" aria-expanded={mobileOpen} aria-controls="app-navigation" onClick={() => setMobileOpen(true)}><Menu size={22} /></button><span className="mobile-brand-name">Nagano</span><span className="nagano-emblem" aria-hidden="true"/><span className="topbar-root">Gestão</span><ChevronRight size={14} /><span className="topbar-page">{activePage.label}</span></div><div className="topbar-actions"><span className="topbar-date">{date}</span>{canAccess(access.profile,'kanban')&&<button type="button" className="notification-button" aria-label={`Alertas de produção${urgentCount ? `: ${urgentCount} ordens vencidas` : ''}`} title="Ver alertas de produção" onClick={() => go('kanban')}><Bell size={20} />{urgentCount > 0 && <span>{urgentCount > 9 ? '9+' : urgentCount}</span>}</button>}<div className="profile-control"><ProfileMenu/></div></div></header><main id="conteudo-principal" tabIndex={-1} className="workspace-content">{children}</main><footer className="workspace-footer"><span>Nagano Comunicação Visual</span><span>Sua experiência em 4K <span className="footer-spectrum" aria-hidden="true" /></span></footer></div>
  </div>;
}
