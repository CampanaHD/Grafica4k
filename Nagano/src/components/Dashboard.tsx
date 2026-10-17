import {AdminBackupNotice} from './AdminBackupNotice';
import React from 'react';
import {useAccess} from './AccessBoundary';
import {canAccess} from '../utils/profileAccess';
import type { Quotation, WorkOrder, PaymentRecord, Customer } from '../types';
import { formatCurrency, formatDate } from '../utils/formatters';
import { Calculator, Kanban, PackageCheck, DollarSign, Plus, AlertTriangle, ArrowUpRight, ArrowRight, FileText, Users, Sparkles, Clock3, Layers3, Palette, Printer, Scissors, CheckCircle2 } from 'lucide-react';

interface DashboardProps {
  quotations: Quotation[]; workOrders: WorkOrder[]; payments: PaymentRecord[]; customers: Customer[];
  onNavigate: (tab: string) => void; onNewQuotation: () => void; onSimulate: () => void;
}
const readableStatus: Record<string, string> = {
  PAUSADO: 'Pausado', AGUARDANDO_INFORMACAO_CLIENTE: 'Aguardando Informação do Cliente', AGUARDANDO_MATERIAL: 'Aguardando matéria-prima', PRODUCAO_ARTES: 'Criação de arte', AGUARDANDO_APROVACAO_ARTE: 'Aprovação da arte', ARTE_APROVADA: 'Arte aprovada', PRODUCAO: 'Em impressão', ACABAMENTO: 'Acabamento', FINALIZADO: 'Finalizado', AGUARDANDO_RETIRADA: 'Aguardando retirada', ENTREGUE: 'Entregue', CANCELADO: 'Cancelado',
};
export function Dashboard({ quotations, workOrders, customers, onNavigate, onNewQuotation, onSimulate }: DashboardProps) {
  const {profile}=useAccess(),can=(key:string)=>canAccess(profile,key),financial=can('finance');
  const quotesToday = quotations.filter(q => q.createdAt.startsWith(new Date().toISOString().split('T')[0])).length;
  const inProductionCount = workOrders.filter(os => !['FINALIZADO', 'AGUARDANDO_RETIRADA', 'ENTREGUE', 'CANCELADO'].includes(os.productionStatus)).length;
  const awaitingPickup = workOrders.filter(os => os.productionStatus === 'AGUARDANDO_RETIRADA');
  const pendingReceivablesTotal = workOrders.reduce((sum, os) => sum + os.remainingBalance, 0);
  const urgentOrders = workOrders.filter(os => !['FINALIZADO', 'AGUARDANDO_RETIRADA', 'ENTREGUE', 'CANCELADO'].includes(os.productionStatus) && new Date(os.deadlineDate).getTime() < Date.now());
  const metrics = [
    { label: 'Orçamentos', value: String(quotations.length).padStart(2, '0'), detail: `${quotesToday} ${quotesToday === 1 ? 'criado hoje' : 'criados hoje'}`, icon: Calculator, color: 'blue', tab: 'quotations' },
    { label: 'Em produção', value: String(inProductionCount).padStart(2, '0'), detail: 'Projetos em andamento', icon: Layers3, color: 'purple', tab: 'kanban' },
    { label: 'Prontos para retirada', value: String(awaitingPickup.length).padStart(2, '0'), detail: 'Aguardando o cliente', icon: PackageCheck, color: 'orange', tab: 'pickup' },
    { label: 'Total a receber', value: formatCurrency(pendingReceivablesTotal), detail: 'Saldo das ordens de serviço', icon: DollarSign, color: 'green', tab: 'finance' },
  ];
  const stages = [
    { title: 'Arte e aprovação', status: ['PRODUCAO_ARTES', 'AGUARDANDO_APROVACAO_ARTE', 'ARTE_APROVADA'], icon: Palette, color: 'blue' },
    { title: 'Impressão', status: ['PRODUCAO'], icon: Printer, color: 'purple' },
    { title: 'Acabamento', status: ['ACABAMENTO'], icon: Scissors, color: 'orange' },
    { title: 'Prontos', status: ['FINALIZADO', 'AGUARDANDO_RETIRADA'], icon: CheckCircle2, color: 'green' },
  ];
  const quickActions = [
    { title: 'Simular quantidades', detail: 'Encaixe, aproveitamento e valores', icon: Calculator, tab:'quotations', action: onSimulate, color: 'blue' },
    { title: 'Acompanhar produção', detail: 'Veja cada etapa do projeto', icon: Kanban, tab:'kanban', action: () => onNavigate('kanban'), color: 'purple' },
    { title: 'Gerenciar clientes', detail: 'Cadastros e histórico de pedidos', icon: Users, tab:'customers', action: () => onNavigate('customers'), color: 'orange' },
    { title: 'Consultar financeiro', detail: 'Pagamentos e valores pendentes', icon: DollarSign, tab:'finance', action: () => onNavigate('finance'), color: 'green' },
  ];
  return <div className="nagano-dashboard"><AdminBackupNotice onSettings={()=>onNavigate('settings')}/>
    <div className="dashboard-heading"><div><span className="page-eyebrow">PAINEL DA GRÁFICA</span><h1>Visão geral da operação</h1><p>Seus projetos, sua produção e seus resultados em um só lugar.</p></div>{can('quotations')&&<div className="heading-actions"><button type="button" className="nagano-button secondary" onClick={onSimulate}><Calculator size={17} /> Simular quantidades</button><button type="button" className="nagano-button primary" onClick={onNewQuotation}><Plus size={18} /> Novo orçamento</button></div>}</div>
    <div className="dashboard-metrics">{metrics.filter(metric=>can(metric.tab)).map(metric => { const Icon = metric.icon; return <button type="button" key={metric.tab} onClick={() => onNavigate(metric.tab)} className={`metric-card tone-${metric.color}`}><div className="metric-label"><span>{metric.label}</span><span className="metric-icon"><Icon size={20} strokeWidth={1.8} /></span></div><strong className={`metric-value ${metric.tab === 'finance' ? 'is-currency' : ''}`}>{metric.value}</strong><div className="metric-description"><span>{metric.detail}</span><ArrowUpRight size={16} /></div></button>; })}</div>
    {urgentOrders.length > 0 && <div className="production-alert"><span className="alert-icon"><AlertTriangle size={19} /></span><div><strong>{urgentOrders.length === 1 ? 'Uma ordem precisa da sua atenção' : `${urgentOrders.length} ordens precisam da sua atenção`}</strong><p>{urgentOrders.length === 1 ? 'Há um projeto' : 'Há projetos'} com prazo de entrega vencido. Confira as etapas de produção.</p></div><button type="button" onClick={() => onNavigate('kanban')}>Ver produção <ArrowRight size={16} /></button></div>}
    <section className="dashboard-panel production-panel"><div className="panel-heading"><div><span className="section-eyebrow">DO ARQUIVO À ENTREGA</span><h2>Fluxo de produção</h2></div><button type="button" className="text-action" onClick={() => onNavigate('kanban')}>Abrir quadro <ArrowUpRight size={16} /></button></div><div className="production-stages">{stages.map((stage, i) => { const count = workOrders.filter(os => stage.status.includes(os.productionStatus)).length; const Icon = stage.icon; return <button type="button" key={stage.title} className={`stage-card tone-${stage.color}`} onClick={() => onNavigate(stage.title === 'Prontos' ? 'pickup' : 'kanban')}><span className="stage-icon"><Icon size={20} strokeWidth={1.7} /></span><div><span className="stage-title">{stage.title}</span><strong>{count} <span>{count === 1 ? 'projeto' : 'projetos'}</span></strong></div><span className="stage-number">0{i + 1}</span></button>; })}</div>{workOrders.some(os => os.productionStatus === 'PAUSADO') && <p className="production-note"><Clock3 size={14} /> {workOrders.filter(os => os.productionStatus === 'PAUSADO').length} ordem(ns) pausada(s). Consulte os motivos no quadro de produção.</p>}</section>
    <div className="dashboard-detail-grid"><section className="dashboard-panel orders-panel"><div className="panel-heading"><div><span className="section-eyebrow">ACOMPANHAMENTO</span><h2>Ordens de serviço</h2></div><button type="button" className="text-action" onClick={() => onNavigate('work_orders')}>Ver todas <ArrowUpRight size={16} /></button></div><div className="orders-table-wrap"><table className="dashboard-orders-table"><thead><tr><th>Projeto / cliente</th><th>Prazo</th><th>Status</th>{financial&&<th className="amount-cell">Saldo</th>}</tr></thead><tbody>{workOrders.slice(0, 5).map(order => <tr key={order.id}><td><button type="button" className="order-link" onClick={() => onNavigate('work_orders')}><span className="order-number">{order.number}</span><strong>{order.serviceName}</strong><span className="order-customer">{order.customerName}</span></button></td><td className="deadline-cell">{formatDate(order.deadlineDate)}</td><td><span className={`order-status ${['ENTREGUE', 'FINALIZADO'].includes(order.productionStatus) ? 'status-green' : order.productionStatus === 'AGUARDANDO_RETIRADA' ? 'status-orange' : 'status-blue'}`}><span />{readableStatus[order.productionStatus] ?? order.productionStatus.replace(/_/g, ' ')}</span></td>{financial&&<td className="amount-cell">{order.remainingBalance > 0 ? formatCurrency(order.remainingBalance) : <span className="paid-status">Quitado</span>}</td>}</tr>)}{!workOrders.length && <tr><td colSpan={4}><div className="dashboard-empty"><FileText size={28} /><strong>Seus projetos aparecerão aqui</strong><span>Aprove um orçamento para iniciar a produção.</span><button type="button" className="text-action" onClick={onNewQuotation}>Criar orçamento <ArrowRight size={15} /></button></div></td></tr>}</tbody></table></div><div className="panel-footer"><FileText size={14} /><span>{workOrders.length} {workOrders.length === 1 ? 'ordem registrada' : 'ordens registradas'} no sistema</span></div></section>
      <section className="dashboard-panel quick-panel"><div className="panel-heading"><div><span className="section-eyebrow">SEU DIA A DIA</span><h2>Atalhos de trabalho</h2></div><Sparkles size={19} className="text-slate-400" /></div><div className="quick-action-list">{quickActions.filter(action=>can(action.tab)).map(action => { const Icon = action.icon; return <button type="button" key={action.title} className={`quick-action tone-${action.color}`} onClick={action.action}><span className="quick-action-icon"><Icon size={18} /></span><span className="quick-action-copy"><strong>{action.title}</strong><span>{action.detail}</span></span><ArrowUpRight size={16} className="quick-arrow" /></button>; })}</div>{can('customers')&&<div className="customer-summary"><span className="customer-summary-icon"><Users size={20} /></span><div><strong>{customers.filter(c => c.active).length} clientes ativos</strong><span>Relacionamentos que viram projetos.</span></div><button type="button" aria-label="Ver clientes" onClick={() => onNavigate('customers')}><ArrowUpRight size={18} /></button></div>}</section>
    </div>
  </div>;
}

