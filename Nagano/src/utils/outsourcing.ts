import type { OutsourcedService } from '../types/team';
import type { QuotationItem } from '../types';

export const outsourcedServicesList=(row:OutsourcedService)=>row.services??(row.service?[row.service]:[]);
export const outsourcedValue=(row:OutsourcedService)=>row.value??((row.quantity??1)*(row.salePrice??0));
export const outsourcedChargedValue=(row:OutsourcedService)=>row.value??((row.quantity??1)*(row.cost??0));
export const outsourcedSaleTotal = (rows: OutsourcedService[] = []) => Math.round(rows.reduce((sum, row) => sum + outsourcedValue(row), 0) * 100) / 100;
/** Customer-facing representation deliberately contains no supplier name, PIX or cost. */
export const outsourcedCustomerItems = (rows: OutsourcedService[] = []): QuotationItem[] => rows.map((row, index) => ({
  id: `outsourced-${row.id}`, serviceName: outsourcedServicesList(row).join(' / '), quantity: row.value===undefined?(row.quantity??1):1, position: index,
  subtotal: Math.round(outsourcedValue(row) * 100) / 100, finishings: [], widthCm: 0, heightCm: 0,
} as QuotationItem));
