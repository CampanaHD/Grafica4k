import { ServiceGroup } from './graphicProduct';
export interface FuturaCategory { name: string; path: string }
export interface FuturaCatalogEntry { name: string; url: string; sourcePriceCents?: number; fetchedAt: string }
export interface FuturaOption { label: string; url: string }
export interface FuturaConfigurationGroup {
  field: string;
  value: string;
  options: FuturaOption[];
}
export interface FuturaShipping {
  postalCode: string;
  address: string;
  method: string;
  priceCents: number;
  deadline: string;
  fetchedAt: string;
  sourceProductId: string;
  lots: 1;
}
export interface FuturaProduct extends FuturaCatalogEntry {
  sourceProductId: string;
  sourcePriceCents: number;
  quantity: number;
  configuration: Record<string, string>;
  configurationVersion?: 2;
  options: FuturaOption[];
  configurationGroups?: FuturaConfigurationGroup[];
}
export interface FuturaImport {
  id: string; targetId: string; serviceGroup: ServiceGroup; revision: number;
  sourceProvider: 'FUTURA_IM'; priceSource: 'FUTURA_IM' | 'MANUAL';
  product: FuturaProduct; markupMultiplier: string; salePriceCents: number; lastSyncAt: string;
  shipping?: FuturaShipping;
}
export interface FuturaPreview {
  token: string; product: FuturaProduct; serviceGroup: ServiceGroup;
  markupMultiplier: string; salePriceCents: number; expiresAt: string;
  previous?: FuturaImport;
  shipping?: FuturaShipping;
  productSalePriceCents?: number;
}
