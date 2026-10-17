import { load } from 'cheerio';
import { FuturaShipping } from '../../src/types/futura';
import { PricingError } from '../pricingValidation';
import { decimalCents, applyMarkup } from './money';

export const FUTURA_DESTINATION = {
  postalCode: '17504010',
  address: 'R. Vinte e Quatro de Dezembro, 948 - Centro, Marília - SP, 17504-010',
};
const text = (s: string) => s.replace(/\s+/g, ' ').trim();

/** Public simulator returns both pickup and delivery. Only delivery is eligible for this address. */
export function parseShipping(html: string, sourceProductId: string, fetchedAt: string): FuturaShipping {
  const $ = load(html);
  const options: FuturaShipping[] = [];
  $('.row').each((_i, row) => {
    const method = text($(row).children('.col-5').text());
    if (!method || /retir|balc[aã]o|pickup/i.test(method)) return;
    const deadline = text($(row).children('.col-4').text());
    const priceText = text($(row).children('.col-3').text());
    if (!priceText || !deadline) throw new PricingError('Resposta de frete incompleta. Consulte novamente.', 502);
    const amount = priceText.replace(/R\$|\s/g, '').replace(/\./g, '').replace(',', '.');
    const priceCents = /^(?:gr[aá]tis|gratuito|frete gr[aá]tis)$/i.test(priceText) || /^0(?:\.0{1,2})?$/.test(amount) ? 0 : decimalCents(amount);
    options.push({ ...FUTURA_DESTINATION, method: method.slice(0, 150), deadline: deadline.slice(0, 150), priceCents, fetchedAt, sourceProductId, lots: 1 });
  });
  if (!options.length) throw new PricingError('A Futura não retornou entrega no endereço para este produto e CEP. Retirada em balcão não será usada como entrega.', 502);
  return options.sort((a, b) => a.priceCents - b.priceCents || a.method.localeCompare(b.method))[0];
}

export function priceWithShipping(sourcePriceCents: number, multiplier: string, shipping?: FuturaShipping) {
  const productSalePriceCents = applyMarkup(sourcePriceCents, multiplier);
  const freight = shipping?.priceCents ?? 0;
  if (!Number.isSafeInteger(freight) || freight < 0 || productSalePriceCents + freight > 999999999999) throw new PricingError('Valor de frete inválido ou total acima do limite.');
  return { productSalePriceCents, salePriceCents: productSalePriceCents + freight };
}
