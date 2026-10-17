import type { SimulationConfig, SimulationLayout } from '../types/quotationSimulation';

/** Uniform rectangular grid. Bleed belongs to each piece; gap is between pieces. */
export function calculateSimulationLayout(widthCm: number, heightCm: number, config: SimulationConfig): SimulationLayout {
  if (![widthCm, heightCm, config.areaWidthCm, config.areaHeightCm].every(v => Number.isFinite(v) && v >= 0.01 && v <= 100000)
    || ![config.marginCm, config.gapCm, config.bleedCm].every(v => Number.isFinite(v) && v >= 0 && v <= 100000)) {
    throw new Error('Informe medidas válidas em centímetros (mínimo de 0,01 cm).');
  }
  const usableWidth = config.areaWidthCm - 2 * config.marginCm;
  const usableHeight = config.areaHeightCm - 2 * config.marginCm;
  const grid = (rotated: boolean): SimulationLayout => {
    const pieceWidthCm = (rotated ? heightCm : widthCm) + 2 * config.bleedCm;
    const pieceHeightCm = (rotated ? widthCm : heightCm) + 2 * config.bleedCm;
    const columns = Math.max(0, Math.floor((usableWidth + config.gapCm) / (pieceWidthCm + config.gapCm) + 1e-9));
    const rows = Math.max(0, Math.floor((usableHeight + config.gapCm) / (pieceHeightCm + config.gapCm) + 1e-9));
    return { columns, rows, capacity: columns * rows, rotated, pieceWidthCm, pieceHeightCm,
      occupiedWidthCm: columns ? columns * (pieceWidthCm + config.gapCm) - config.gapCm : 0,
      occupiedHeightCm: rows ? rows * (pieceHeightCm + config.gapCm) - config.gapCm : 0 };
  };
  const normal = grid(false);
  const rotated = config.allowRotation ? grid(true) : normal;
  const best = rotated.capacity > normal.capacity ? rotated : normal;
  if (!best.capacity) throw new Error('A arte não cabe na área disponível com essas margens, sangria e espaçamento.');
  if (!Number.isSafeInteger(best.capacity) || best.capacity > 1000000) throw new Error('O bloco excede 1.000.000 de peças. Reduza a área de simulação.');
  return best;
}
