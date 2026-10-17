import type { Quotation } from '../types';

export const quotationRetentionDays = 30;
export function isQuotationDueForDeletion(quote: Quotation, now = Date.now(), protectedIds: ReadonlySet<string> = new Set()) {
  if (!['RASCUNHO', 'ENVIADO'].includes(quote.status) || quote.outsourcedServices?.length || quote.workOrderId || protectedIds.has(quote.id)) return false;
  const created = Date.parse(quote.createdAt);
  return Number.isFinite(created) && now - created >= quotationRetentionDays * 86400000;
}
export interface QuotationListSnapshot { data: Quotation[]; deletedIds: string[]; cleanupEnabled: boolean }
export function mergeQuotationSnapshot(snapshot: QuotationListSnapshot, local: Quotation[], protectedIds: ReadonlySet<string>, now = Date.now()) {
  const deleted = new Set(snapshot.deletedIds);
  const saved = new Set(snapshot.data.map(q => q.id));
  return [...snapshot.data, ...local.filter(q => !saved.has(q.id) && !deleted.has(q.id) && (!snapshot.cleanupEnabled || !isQuotationDueForDeletion(q, now, protectedIds)))];
}
