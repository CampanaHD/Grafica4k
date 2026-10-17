import { ProductionStatus, WorkOrder } from '../types';

export const productionStatusLabels: Partial<Record<ProductionStatus,string>> = {
  PRODUCAO_ARTES:'Produção de arte',ARTE_APROVADA:'Arte aprovada',PRODUCAO:'Produção / impressão',ACABAMENTO:'Acabamentos',
  AGUARDANDO_RETIRADA:'Aguardando retirada',ENTREGUE:'Entregue',PAUSADO:'Pausado',AGUARDANDO_INFORMACAO_CLIENTE:'Aguardando Informação do Cliente',AGUARDANDO_MATERIAL:'Aguardando matéria-prima',CANCELADO:'Cancelado',
};

export const productionColumns: { id: ProductionStatus; title: string; statuses: ProductionStatus[] }[] = [
  { id: 'PRODUCAO_ARTES', title: 'Produção de arte', statuses: ['PRODUCAO_ARTES', 'AGUARDANDO_APROVACAO_ARTE'] },
  { id: 'ARTE_APROVADA', title: 'Arte aprovada', statuses: ['ARTE_APROVADA'] },
  { id: 'PRODUCAO', title: 'Produção / impressão', statuses: ['PRODUCAO'] },
  { id: 'ACABAMENTO', title: 'Acabamentos', statuses: ['ACABAMENTO'] },
];
export function nextProductionStep(status: ProductionStatus): { status: ProductionStatus; label: string } | undefined {
  return ({
    PRODUCAO_ARTES: { status: 'ARTE_APROVADA', label: 'Confirmar arte aprovada' },
    AGUARDANDO_APROVACAO_ARTE: { status: 'ARTE_APROVADA', label: 'Confirmar arte aprovada' },
    ARTE_APROVADA: { status: 'PRODUCAO', label: 'Iniciar impressão' },
    PRODUCAO: { status: 'ACABAMENTO', label: 'Enviar para acabamento' },
    ACABAMENTO: { status: 'AGUARDANDO_RETIRADA', label: 'Finalizar produção' },
  } as Partial<Record<ProductionStatus, { status: ProductionStatus; label: string }>>)[status];
}
export function moveProductionOrder(order: WorkOrder, requested: ProductionStatus, notes = '', now = new Date().toISOString()): WorkOrder {
  if (order.quotationRevisionPending) throw new Error('O orçamento está em revisão. Aguarde a nova aprovação.');
  const target = requested === 'FINALIZADO' ? 'AGUARDANDO_RETIRADA' : requested;
  if (order.productionStatus === target) return order;
  return { ...order, productionStatus: target,
    productionCompletedAt: target === 'AGUARDANDO_RETIRADA' ? now : target === 'ENTREGUE' ? order.productionCompletedAt : undefined,
    statusHistory: [...(order.statusHistory ?? []), { id: crypto.randomUUID(), previousStatus: order.productionStatus,
      newStatus: target, changedAt: now, changedBy: 'Operador Sistema', observation: notes.trim() || (target === 'AGUARDANDO_RETIRADA' ? 'Produção finalizada e encaminhada para retirada.' : 'Alteração de etapa de produção.') }],
  };
}

const calendarDay = (date: string) => {
  const match = date?.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return NaN;
  const year = Number(match[1]), month = Number(match[2]) - 1, day = Number(match[3]);
  const result = new Date(Date.UTC(year, month, day));
  return result.getUTCFullYear() === year && result.getUTCMonth() === month && result.getUTCDate() === day ? result.getTime() / 86400000 : NaN;
};
/** Starts at the saved final deadline, and counts only approved orders whose production ended. */
export function customerServiceRecency(customerId: string, orders: WorkOrder[], today = new Date()) {
  const completed = orders.filter(order => order.customerId === customerId && !order.quotationRevisionPending &&
    ['FINALIZADO', 'AGUARDANDO_RETIRADA', 'ENTREGUE'].includes(order.productionStatus) && order.approvalDate && Number.isFinite(calendarDay(order.deadlineDate)))
    .sort((a, b) => calendarDay(b.deadlineDate) - calendarDay(a.deadlineDate));
  const last = completed[0];
  if (!last) return { days: null, lastDeadline: null, orderNumber: null };
  const todayDay = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()) / 86400000;
  return { days: Math.max(0, todayDay - calendarDay(last.deadlineDate)), lastDeadline: last.deadlineDate, orderNumber: last.number };
}
