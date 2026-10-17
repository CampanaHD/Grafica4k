import type { QuotationItem } from './index';

export interface SimulationConfig {
  areaWidthCm: number;
  areaHeightCm: number;
  marginCm: number;
  gapCm: number;
  bleedCm: number;
  allowRotation: boolean;
}

export interface SimulationLayout {
  columns: number;
  rows: number;
  capacity: number;
  rotated: boolean;
  pieceWidthCm: number;
  pieceHeightCm: number;
  occupiedWidthCm: number;
  occupiedHeightCm: number;
}

export interface SimulationSnapshot {
  config: SimulationConfig;
  layout: SimulationLayout;
  mode: 'ROLL' | 'SHEET';
  blocks: number;
  consumedAreaM2: number;
  usedLengthM: number;
  pricingUnit: 'M2' | 'SHEET' | 'LINEAR_METER';
  rate: number;
  volumeDiscountPercentage: number;
  minimumChargeApplied: boolean;
}

export interface SimulationOption {
  quantity: number;
  unitPrice: number;
  total: number;
  saving: number;
  savingPercentage: number;
  item: QuotationItem;
}

export interface SimulationResult {
  success: boolean;
  layout: SimulationLayout;
  options: SimulationOption[];
  lowestUnitPriceQuantity?: number;
}
