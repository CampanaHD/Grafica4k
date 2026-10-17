import { Quotation, QuotationItem } from '../types';
import { CalculationResponse } from '../utils/calculationEngine';
import type { SimulationResult } from '../types/quotationSimulation';
import type { QuotationListSnapshot } from '../utils/quotationRetention';

export interface PricedItem { success: boolean; item: QuotationItem; calculation: CalculationResponse }
async function request(url: string, options?: RequestInit) {
  const response = await fetch(url, options);
  const result = await response.json();
  if (!response.ok || !result.success) throw new Error(result.error || 'Não foi possível calcular ou salvar o orçamento.');
  return result;
}
export const quotationApi = {
  listSnapshot: async (): Promise<QuotationListSnapshot> => request('/api/quotations'),
  retention: async (): Promise<{ enabled: boolean; days: number }> => request('/api/quotation-retention'),
  saveRetention: async (enabled: boolean): Promise<{ enabled: boolean; days: number; deletedCount: number }> => request('/api/quotation-retention', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled }) }),
  simulate: (item: Partial<QuotationItem>, quantities?: number[], signal?: AbortSignal): Promise<SimulationResult> => request('/api/quotations/simulate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ item, quantities }), signal }),
  preview: (item: Partial<QuotationItem>, signal?: AbortSignal): Promise<PricedItem> => request('/api/quotations/calculate-item', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ item }), signal }),
  list: async (): Promise<Quotation[]> => (await request('/api/quotations')).data,
  save: async (quote: Quotation): Promise<Quotation> => (await request(`/api/quotations/${encodeURIComponent(quote.id)}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(quote) })).data,
  approve: async (quote: Quotation, workOrderId?: string): Promise<Quotation> => (await request(`/api/quotations/${encodeURIComponent(quote.id)}/approve`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ revision: quote.revision, workOrderId }) })).data,
  reject: async (quote:Quotation,reason:string):Promise<Quotation>=>(await request(`/api/quotations/${encodeURIComponent(quote.id)}/reject`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({revision:quote.revision,reason})})).data,
  reopen: async (quote: Quotation, reason: string, workOrderId?: string): Promise<Quotation> => (await request(`/api/quotations/${encodeURIComponent(quote.id)}/reopen`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ revision: quote.revision, reason, workOrderId, legacyQuotation: quote.revision === undefined ? quote : undefined }) })).data,
  history: async (id: string): Promise<Quotation[]> => (await request(`/api/quotations/${encodeURIComponent(id)}/history`)).data,
};
