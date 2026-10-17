export class PricingError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

export function numberInput(value: unknown, label: string, fallback?: number): number {
  if (value === undefined && fallback !== undefined) return fallback;
  const normalized = typeof value === 'string' && /^\d+(?:[.,]\d+)?$/.test(value.trim()) ? Number(value.trim().replace(',', '.')) : value;
  if (typeof normalized !== 'number' || !Number.isFinite(normalized) || normalized < 0) throw new PricingError(`${label} inválido.`);
  return normalized;
}

