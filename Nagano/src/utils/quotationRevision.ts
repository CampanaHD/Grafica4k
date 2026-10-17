import { Quotation, WorkOrder } from '../types';

export function pauseWorkOrderForRevision(order: WorkOrder, quote: Quotation): WorkOrder {
  if (order.quotationRevisionPending) return order;
  return { ...order, productionStatus: 'PAUSADO', quotationRevisionPending: true,
    statusHistory: [...(order.statusHistory ?? []), {
      id: crypto.randomUUID(), previousStatus: order.productionStatus, newStatus: 'PAUSADO',
      changedAt: new Date().toISOString(), changedBy: 'Atendimento',
      observation: `Orçamento em revisão ${quote.commercialVersion}: ${quote.revisionReason}. Aguardando nova aprovação.`,
    }],
  };
}

/** Reapproval updates the same OS and retains existing payments and production history. */
export function updateWorkOrderAfterRevision(previous: WorkOrder, updated: WorkOrder, additionalPayment: number): WorkOrder {
  if (!Number.isFinite(additionalPayment) || additionalPayment < 0) throw new Error('Pagamento adicional inválido.');
  const amountPaid = Math.round((previous.amountPaid + additionalPayment) * 100) / 100;
  return { ...previous, ...updated,
    id: previous.id, number: previous.number, createdAt: previous.createdAt,
    customerPhone: previous.customerPhone, designerName: previous.designerName,
    productionResponsible: previous.productionResponsible,
    notionPageId: previous.notionPageId, pickupNotifiedAt: undefined, pickedUpAt: undefined,
    quotationRevisionPending: false, amountPaid,
    remainingBalance: Math.max(0, Math.round((updated.totalAmount - amountPaid) * 100) / 100),
    productionStatus: 'PRODUCAO_ARTES',
    statusHistory: [...(previous.statusHistory ?? []), {
      id: crypto.randomUUID(), previousStatus: previous.productionStatus, newStatus: 'PRODUCAO_ARTES',
      changedAt: new Date().toISOString(), changedBy: 'Atendimento',
      observation: `Revisão aprovada. Valor anterior: R$ ${previous.totalAmount.toFixed(2)}; novo: R$ ${updated.totalAmount.toFixed(2)}. Pagamentos anteriores preservados.`,
    }],
  };
}
