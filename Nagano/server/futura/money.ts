import { PricingError } from '../pricingValidation';

export function decimalCents(value: unknown): number {
  const raw = String(value ?? '');
  if (!/^\d{1,10}(?:\.\d{1,2})?$/.test(raw)) throw new PricingError('Preço da FuturaIM ausente ou inválido.', 502);
  const [whole, fraction = ''] = raw.split('.');
  const cents = Number(BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0')));
  if (!Number.isSafeInteger(cents) || cents <= 0) throw new PricingError('Preço da FuturaIM ausente ou inválido.', 502);
  return cents;
}
export function parseMarkup(raw = process.env.FUTURA_MARKUP_MULTIPLIER ?? '2.00') {
  if (!/^\d{1,2}(?:\.\d{1,2})?$/.test(raw) || Number(raw) <= 0) throw new PricingError('FUTURA_MARKUP_MULTIPLIER inválido.', 500);
  return (decimalCents(raw) / 100).toFixed(2);
}
export function applyMarkup(sourceCents: number, multiplier: string): number {
  if (!Number.isSafeInteger(sourceCents) || sourceCents <= 0) throw new PricingError('Preço da FuturaIM inválido.', 502);
  const result = (BigInt(sourceCents) * BigInt(decimalCents(parseMarkup(multiplier))) + 50n) / 100n;
  if (result > 999999999999n) throw new PricingError('Preço importado excede o limite permitido.');
  return Number(result);
}
