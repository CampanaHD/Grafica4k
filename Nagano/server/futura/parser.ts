import { load } from 'cheerio';
import { FuturaCategory, FuturaCatalogEntry, FuturaProduct, FuturaConfigurationGroup } from '../../src/types/futura';
import { PricingError } from '../pricingValidation';
import { decimalCents } from './money';

export const FUTURA_ORIGIN = 'https://www.futuraim.com.br';
export function productUrl(raw: string): string {
  let url: URL;
  try { url = new URL(raw, FUTURA_ORIGIN); } catch { throw new PricingError('URL de produto Futura inválida.'); }
  if (url.origin !== FUTURA_ORIGIN || url.username || url.password || !/^\/produto\/[a-z0-9-]+$/.test(url.pathname) || !/^\d{1,10}$/.test(url.searchParams.get('id') ?? '')) {
    throw new PricingError('Selecione um produto Futura com código de configuração (id).');
  }
  return `${url.origin}${url.pathname}?id=${url.searchParams.get('id')}`;
}
const clean = (s: string) => s.replace(/[\u0000-\u001f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 600);
export const normalized = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const fail = () => new PricingError('Não foi possível confirmar a configuração e o preço atual da FuturaIM. A página pode ter mudado.', 502);

export function parseCategories(markdown: string): FuturaCategory[] {
  const seen = new Map<string, FuturaCategory>();
  // Official public category directory; no search, customer, checkout or API routes.
  const catalog = markdown.split('## Catálogo')[1]?.split('\n## ')[0] ?? '';
  for (const m of catalog.matchAll(/\[([^\]]+)\]\(https:\/\/www\.futuraim\.com\.br(\/[a-z0-9-]+)\)/g)) seen.set(m[2], { name: clean(m[1]), path: m[2] });
  if (!seen.size) throw fail();
  return [...seen.values()];
}
export function parseCatalog(html: string, fetchedAt: string): FuturaCatalogEntry[] {
  const $ = load(html);
  const entries = new Map<string, FuturaCatalogEntry>();
  $('.card-prod').each((_i, card) => {
    const node = $(card), link = node.find('h3 a[href]').first();
    try {
      const url = productUrl(link.attr('href') ?? '');
      const name = clean(link.text());
      if (!name) return;
      const amount = node.find('.prod-preco').first().text().replace(/R\$|\s/g, '').replace(/\./g, '').replace(',', '.');
      let sourcePriceCents: number | undefined;
      try { sourcePriceCents = decimalCents(amount); } catch { /* Only detail pages can authorize an import. */ }
      entries.set(url, { name, url, sourcePriceCents, fetchedAt });
    } catch { /* Non-product promotions are not catalog entries. */ }
  });
  if (!entries.size) throw fail();
  return [...entries.values()];
}

export function parseProduct(html: string, sourceUrl: string, fetchedAt: string): FuturaProduct {
  const url = productUrl(sourceUrl), sku = new URL(url).searchParams.get('id')!;
  const $ = load(html);
  const products: any[] = [];
  $('script[type="application/ld+json"]').each((_i, el) => {
    try {
      const data = JSON.parse($(el).text());
      const entries = Array.isArray(data) ? data : data['@graph'] ?? [data];
      products.push(...entries.filter((x: any) => x?.['@type'] === 'Product' && String(x.sku) === sku));
    } catch { /* Ignore unrelated malformed markup, never evaluate scripts. */ }
  });
  if (products.length !== 1) throw fail();
  const product = products[0], offer = product.offers;
  if (!offer || Array.isArray(offer) || offer['@type'] !== 'Offer' || offer.priceCurrency !== 'BRL' || offer.availability !== 'https://schema.org/InStock' || productUrl(offer.url) !== url) throw fail();
  if (offer.priceValidUntil && (!/^\d{4}-\d{2}-\d{2}$/.test(offer.priceValidUntil) || offer.priceValidUntil < fetchedAt.slice(0, 10))) throw fail();
  const sourcePriceCents = decimalCents(offer.price);
  const selected = $('#table-variacoes input[name="qtd-sku"][checked]');
  if (selected.length !== 1) throw fail();
  const quantity = Number(selected.attr('id'));
  if (!Number.isSafeInteger(quantity) || quantity <= 0) throw fail();
  const displayedTotal = selected.closest('tr').find('td').last().text().replace(/R\$|\s/g, '').replace(/\./g, '').replace(',', '.');
  if (decimalCents(displayedTotal) !== sourcePriceCents) throw fail();
  const configuration: Record<string, string> = {};
  const fieldName = (raw: string) => {
    const label = clean(raw).replace(/:$/, '');
    if (!label || label.length > 80 || ['__proto__', 'constructor', 'prototype'].includes(label)) return '';
    return label === 'Cor' ? 'Cor de Impressão' : label;
  };
  $('.resumo-tabela').first().find('tr').each((_i, tr) => {
    const label = fieldName($(tr).find('th').text()), value = clean($(tr).find('td').text());
    // Only the selected SKU's specification table, never marketing tables or production deadlines.
    if (label && value && !/^(prazo|preço|valor|quantidade)/i.test(label)) configuration[label] = value;
  });
  if (!configuration.Material || !configuration.Formato || !configuration.Acabamento) throw fail();
  const options = new Map<string, { label: string; url: string }>();
  const groups = new Map<string, FuturaConfigurationGroup>();
  const ensureGroup = (field: string, selectedValue?: string) => {
    if (!field || field === 'Quantidade') return;
    const value = configuration[field] || selectedValue;
    if (!value) throw new PricingError('Não foi possível identificar a opção selecionada de ' + field + ' na FuturaIM.', 502);
    configuration[field] = value;
    if (!groups.has(field)) groups.set(field, { field, value, options: [{ label: value, url }] });
  };
  // Attribute groups may exist only in the configurator (e.g. Modelo / tipo de bolsa).
  $('.selects-produto [role="group"][aria-label], .selects-produto select[data-type]').each((_i, el) => {
    const node = $(el), field = fieldName(node.attr('data-type') ?? node.attr('aria-label') ?? '');
    if (!field) return;
    if (node.is('select')) {
      if (!/^trocarProdutoPorUrl\(this\.value\)\s*;?$/.test(node.attr('onchange') ?? '')) return;
      const selectedOption = node.find('option[selected]').first();
      ensureGroup(field, clean((selectedOption.length ? selectedOption : node.find('option').first()).text()));
    } else {
      const selectedButtons = node.find('button').filter((_j, button) => $(button).hasClass('active') || ($(button).attr('aria-current') ?? '').replace(/["']/g, '') === 'true');
      if (selectedButtons.length > 1) throw fail();
      ensureGroup(field, clean(selectedButtons.text()));
    }
  });
  for (const [field, value] of Object.entries(configuration)) ensureGroup(field, value);
  groups.set('Quantidade', { field: 'Quantidade', value: String(quantity), options: [{ label: String(quantity), url }] });
  const addOption = (field: string, value: string, rawUrl: string) => {
    try {
      const target = productUrl(rawUrl), group = groups.get(field);
      if (!group || !value || target === url || group.options.some(o => o.url === target || o.label === value)) return;
      if (field === 'Quantidade' && (!/^\d+$/.test(value) || Number(value) <= 0)) return;
      group.options.push({ label: value, url: target });
      options.set(field + ':' + target, { label: field + ': ' + value, url: target });
    } catch { /* Unsafe or unsupported URLs never become selectable variations. */ }
  };
  $('.selects-produto [onclick], #table-variacoes [onclick]').each((_i, el) => {
    const node = $(el), handler = node.attr('onclick') ?? '';
    const direct = handler.match(/^trocarProdutoPorUrl\('([^']+)'\)/);
    const variation = handler.match(/^trocarProduto\('([a-z0-9-]+)',\s*(\d+)\)/);
    if ((!direct && !variation) || node.is('[disabled]')) return;
    const quantityInput = node.find('input[name="qtd-sku"]');
    const groupField = node.closest('[role="group"][aria-label]').attr('aria-label');
    const title = node.attr('title') ?? '';
    const titleField = [...groups.keys(), 'Cor'].sort((a, b) => b.length - a.length).find(field => ['com', 'no'].some(prefix => title.startsWith('Ver produto ' + prefix + ' ' + field + ' ')));
    const field = quantityInput.length ? 'Quantidade' : fieldName(groupField || titleField || '');
    const value = clean(quantityInput.length ? quantityInput.attr('id') ?? '' : node.text());
    addOption(field, value, direct ? direct[1] : '/produto/' + variation![1] + '?id=' + variation![2]);
  });
  $('.selects-produto select[data-type]').each((_i, el) => {
    const node = $(el), field = fieldName(node.attr('data-type') ?? '');
    if (!/^trocarProdutoPorUrl\(this\.value\)\s*;?$/.test(node.attr('onchange') ?? '')) return;
    node.find('option:not([disabled])').each((_j, option) => addOption(field, clean($(option).text()), $(option).attr('value') ?? ''));
  });
  const name = clean(String(product.name ?? ''));
  if (!name) throw fail();
  // Deliberately whitelist facts: no descriptions, reviews, identities, cookies or images.
  return { name, url, sourceProductId: sku, sourcePriceCents, fetchedAt, quantity, configuration, configurationVersion: 2, options: [...options.values()].slice(0, 120), configurationGroups: [...groups.values()].map(g => ({ ...g, options: g.options.slice(0, 120) })) };
}
