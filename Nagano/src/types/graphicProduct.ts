export type ServiceGroup = 'VISUAL_COMMUNICATION' | 'GRAPHIC_PRODUCTS';
export type GraphicPricingMethod = 'UNIT_PRICE' | 'BASE_BATCH_WITH_QUANTITY_DISCOUNT' | 'QUANTITY_PRICE_TABLE';
export interface GraphicProduct {
  archived?: boolean;
  id: string;
  revision?: number;
  serviceGroup: 'GRAPHIC_PRODUCTS';
  name: string;
  code: string;
  category: string;
  description: string;
  specification: string;
  active: boolean;
  pricingMethod: GraphicPricingMethod;
  baseQuantity?: number;
  baseBatchPrice?: number; // BRL, persisted to cent precision
  baseUnitPrice?: number; // derived by server, never used as pricing input
  discountsEnabled?: boolean;
  quantityDiscounts?: { minimumQuantity: number; percentage: number }[];
  priceTable?: { quantity: number; batchPrice: number }[];
}
export interface GraphicPricingSnapshot {
  serviceGroup: 'GRAPHIC_PRODUCTS';
  productId: string;
  productRevision?: number;
  specification: string;
  pricingMethod: GraphicPricingMethod;
  requestedQuantity: number;
  baseQuantity?: number;
  baseBatchPrice?: number;
  baseUnitPrice?: number;
  discountTier?: { minimumQuantity: number; percentage: number };
  selectedPriceTableEntry?: { quantity: number; batchPrice: number };
  grossTotal: number;
  discountPercentage: number;
  discountValue: number;
  finalUnitPrice: number;
  finalTotal: number;
}
export const graphicMethodLabels: Record<GraphicPricingMethod, string> = {
  UNIT_PRICE: 'Preço unitário',
  BASE_BATCH_WITH_QUANTITY_DISCOUNT: 'Lote base com desconto por quantidade',
  QUANTITY_PRICE_TABLE: 'Tabela de preços por quantidade',
};
