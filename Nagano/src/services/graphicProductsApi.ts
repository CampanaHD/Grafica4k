import { GraphicProduct } from '../types/graphicProduct';
async function request(url: string, options?: RequestInit) {
  const response = await fetch(url, options);
  const result = await response.json();
  if (!response.ok || !result.success) throw new Error(result.error || 'Falha ao acessar produtos gráficos.');
  return result.data;
}
export const graphicProductsApi = {
  remove: (product: GraphicProduct): Promise<GraphicProduct> => request(`/api/graphic-products/${encodeURIComponent(product.id)}`, {method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({revision:product.revision})}),
  list: (): Promise<GraphicProduct[]> => request('/api/graphic-products'),
  save: (product: GraphicProduct): Promise<GraphicProduct> => request(`/api/graphic-products/${encodeURIComponent(product.id)}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(product) }),
};
