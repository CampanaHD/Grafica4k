import fs from 'node:fs';
import { parse } from 'dotenv';
import { parseMarkup } from './money';
import { PricingError } from '../pricingValidation';
/** Reads only this integration's settings, without changing other integrations' environment. */
export function futuraConfig() {
  const file = fs.existsSync('.env') ? parse(fs.readFileSync('.env')) : {};
  const multiplier = parseMarkup(process.env.FUTURA_MARKUP_MULTIPLIER ?? file.FUTURA_MARKUP_MULTIPLIER ?? '2.00');
  const autoRefreshMinutes = Number(process.env.FUTURA_AUTO_REFRESH_MINUTES ?? file.FUTURA_AUTO_REFRESH_MINUTES ?? 1440);
  if (!Number.isSafeInteger(autoRefreshMinutes) || autoRefreshMinutes < 60) throw new PricingError('FUTURA_AUTO_REFRESH_MINUTES deve ser um inteiro de pelo menos 60 minutos.', 500);
  return { multiplier, autoRefreshMinutes };
}
