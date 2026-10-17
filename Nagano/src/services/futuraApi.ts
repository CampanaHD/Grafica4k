import { FuturaCategory, FuturaCatalogEntry, FuturaProduct, FuturaImport, FuturaPreview } from '../types/futura';
import { ServiceGroup } from '../types/graphicProduct';
async function request<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch('/api/futura' + path, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : undefined);
  const result = await response.json();
  if (!response.ok || !result.success) throw new Error(result.error || 'Falha na consulta à Futura.');
  return result.data;
}
export type ImportedFutura = FuturaImport & { active: boolean; lastAttemptAt?: string; syncError?: string };
export const futuraApi = {
  config: () => request<{ multiplier: string; autoRefreshMinutes: number; automatic: boolean; shippingDestination: { postalCode: string; address: string } }>('/config'),
  categories: () => request<FuturaCategory[]>('/categories'),
  search: (q: string, category: string) => request<FuturaCatalogEntry[]>(`/search?q=${encodeURIComponent(q)}&category=${encodeURIComponent(category)}`),
  product: (url: string) => request<FuturaProduct>(`/product?url=${encodeURIComponent(url)}`),
  list: () => request<ImportedFutura[]>('/imports'),
  preview: (input: { importId?: string; url?: string; serviceGroup?: ServiceGroup; includeShipping?: boolean }) => request<FuturaPreview>('/preview', input),
  confirm: (token: string, actor: string) => request<FuturaImport>('/confirm', { token, actor }),
  audit: () => request<{ id: string; timestamp: string; user: string; action: string; details: string }[]>('/audit'),
};
