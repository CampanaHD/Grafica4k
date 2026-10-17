import { FuturaCatalogEntry, FuturaCategory, FuturaProduct, FuturaShipping } from '../../src/types/futura';
import { load } from 'cheerio';
import { FUTURA_DESTINATION, parseShipping } from './shipping';
import { PricingError } from '../pricingValidation';
import { FUTURA_ORIGIN, normalized, parseCatalog, parseCategories, parseProduct, productUrl } from './parser';

export interface FuturaCatalogProvider {
  getCategories(): Promise<FuturaCategory[]>;
  searchProducts(query: string, category?: string): Promise<FuturaCatalogEntry[]>;
  getProductDetails(url: string): Promise<FuturaProduct>;
  getCurrentPrice(url: string): Promise<FuturaProduct>;
  getShipping?(product: FuturaProduct): Promise<FuturaShipping>;
}

/** Longest matching rule, Allow on equal length; supports wildcard and end anchors. */
export function robotsAllows(robots: string, path: string): boolean {
  const groups: { agents: string[]; rules: { allow: boolean; pattern: string }[] }[] = [];
  let group = { agents: [] as string[], rules: [] as { allow: boolean; pattern: string }[] };
  for (const line of robots.split(/\r?\n/)) {
    const [rawKey, ...rest] = line.split('#')[0].split(':');
    const key = rawKey.trim().toLowerCase(), value = rest.join(':').trim();
    if (key === 'user-agent') {
      if (group.rules.length) { groups.push(group); group = { agents: [], rules: [] }; }
      group.agents.push(value.toLowerCase());
    } else if (['allow', 'disallow'].includes(key) && value) group.rules.push({ allow: key === 'allow', pattern: value });
  }
  groups.push(group);
  const specific = groups.filter(g => g.agents.some(a => a !== '*' && 'naganocatalog'.includes(a)));
  const applicable = specific.length ? specific : groups.filter(g => g.agents.includes('*'));
  let length = -1, allowed = true;
  for (const rule of applicable.flatMap(g => g.rules)) {
    const pattern = rule.pattern.replace(/[.+?^{}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
    if (new RegExp('^' + pattern).test(path) && rule.pattern.length >= length) {
      if (rule.pattern.length > length || rule.allow) allowed = rule.allow;
      length = rule.pattern.length;
    }
  }
  return allowed;
}

export class FuturaImCatalogProvider implements FuturaCatalogProvider {
  private cache = new Map<string, { until: number; body: string; fetchedAt: string }>();
  private inflight = new Map<string, Promise<{ body: string; fetchedAt: string }>>();
  private queue: Promise<unknown> = Promise.resolve();
  private waiting = 0;
  private lastRequest = 0;
  constructor(private request: typeof fetch = fetch, private intervalMs = 1500, private timeoutMs = 12000) {}

  private async download(path: string, init: { method?: 'POST'; headers?: Record<string, string> } = {}) {
    if (++this.waiting > 20) { this.waiting--; throw new PricingError('Muitas consultas à FuturaIM. Aguarde alguns segundos.', 429); }
    const execute = async () => {
      try {
        for (let attempt = 0; attempt < 2; attempt++) {
          const delay = Math.max(0, this.lastRequest + this.intervalMs - Date.now());
          if (delay) await new Promise(resolve => setTimeout(resolve, delay));
          this.lastRequest = Date.now();
          try {
            const response = await this.request(FUTURA_ORIGIN + path, {
              method: init.method,
              signal: AbortSignal.timeout(this.timeoutMs), redirect: 'manual',
              headers: { 'User-Agent': 'NaganoCatalog/1.0', Accept: 'text/html,text/plain', ...init.headers },
            });
            if ([502, 503, 504].includes(response.status) && attempt === 0) { await response.body?.cancel(); continue; }
            if (!response.ok || response.status >= 300) { await response.body?.cancel(); throw new PricingError('FuturaIM indisponível ou acesso restrito. Tente mais tarde.', 502); }
            if (Number(response.headers.get('content-length')) > 5000000) throw new PricingError('Resposta FuturaIM excedeu o limite.', 502);
            const reader = response.body?.getReader();
            if (!reader) throw new PricingError('Resposta FuturaIM vazia.', 502);
            const chunks: Uint8Array[] = []; let size = 0;
            try {
              while (true) {
                const { done, value } = await reader.read(); if (done) break;
                size += value.length;
                if (size > 5000000) { await reader.cancel(); throw new PricingError('Resposta FuturaIM excedeu o limite.', 502); }
                chunks.push(value);
              }
            } finally { reader.releaseLock(); }
            return { body: Buffer.concat(chunks).toString('utf8'), fetchedAt: new Date().toISOString(), cookies: response.headers.getSetCookie() };
          } catch (error) {
            if (error instanceof PricingError) throw error;
            if (attempt === 1) throw new PricingError('Não foi possível consultar o preço atual da FuturaIM (conexão ou tempo limite).', 502);
          }
        }
        throw new PricingError('FuturaIM indisponível.', 502);
      } finally { this.waiting--; }
    };
    const result = this.queue.then(execute, execute);
    this.queue = result.catch(() => undefined);
    return result;
  }

  private async page(path: string, ttl = 0, robots = true) {
    if (robots) {
      const directives = await this.page('/robots.txt', 15 * 60000, false);
      if (!robotsAllows(directives.body, path)) throw new PricingError('Esta rota da FuturaIM não permite consulta automatizada.', 403);
    }
    const cached = this.cache.get(path);
    if (ttl && cached && cached.until > Date.now()) return cached;
    if (this.inflight.has(path)) return this.inflight.get(path)!;
    const pending = this.download(path).then(result => {
      if (ttl) {
        if (this.cache.size >= 100) this.cache.delete(this.cache.keys().next().value!);
        this.cache.set(path, { ...result, until: Date.now() + ttl });
      }
      return result;
    }).finally(() => this.inflight.delete(path));
    this.inflight.set(path, pending);
    return pending;
  }
  async getCategories() { return parseCategories((await this.page('/llms.txt', 15 * 60000)).body); }
  async searchProducts(query: string, category?: string) {
    const categories = await this.getCategories();
    if (category && !categories.some(c => c.path === category)) throw new PricingError('Categoria Futura inválida.');
    const words = normalized(query).split(/\s+/).filter(Boolean);
    const suggested = words.length ? categories.find(c => words.every(w => normalized(c.name).includes(w)))?.path : undefined;
    const result = await this.page(category || suggested || '/', 5 * 60000);
    console.info('[Futura] catalog', { category: category || suggested || '/', resultsFetchedAt: result.fetchedAt });
    return parseCatalog(result.body, result.fetchedAt).filter(p => words.every(w => normalized(p.name).includes(w))).slice(0, 80);
  }
  async getProductDetails(url: string) { return this.getCurrentPrice(url); }
  async getShipping(product: FuturaProduct) {
    const url = new URL(productUrl(product.url));
    const shippingPath = `/produtos/frete-sku/?cep=${FUTURA_DESTINATION.postalCode}&produtoId=${product.sourceProductId}&quantidade=1`;
    const robots = await this.page('/robots.txt', 15 * 60000, false);
    if (![url.pathname + url.search, shippingPath].every(p => robotsAllows(robots.body, p))) throw new PricingError('A Futura não permite consultar o frete automaticamente nesta rota.', 403);
    // A fresh anonymous session is used only for the site's public freight simulation.
    const page = await this.download(url.pathname + url.search);
    const current = parseProduct(page.body, url.href, page.fetchedAt);
    if (current.sourceProductId !== product.sourceProductId || current.quantity !== product.quantity || current.sourcePriceCents !== product.sourcePriceCents || JSON.stringify(current.configuration) !== JSON.stringify(product.configuration)) throw new PricingError('O produto mudou durante a consulta do frete. Consulte novamente.', 409);
    const $ = load(page.body), token = $('input[name="__RequestVerificationToken"]').attr('value');
    if (!token || $('#ProdutoId').attr('value') !== product.sourceProductId) throw new PricingError('Não foi possível iniciar a consulta pública de frete da Futura.', 502);
    const result = await this.download(shippingPath, { method: 'POST', headers: {
      RequestVerificationToken: token,
      Cookie: page.cookies.map(cookie => cookie.split(';')[0]).join('; '),
      Referer: url.href,
    } });
    return parseShipping(result.body, product.sourceProductId, result.fetchedAt);
  }
  async getCurrentPrice(raw: string) {
    const url = productUrl(raw), parsed = new URL(url);
    const response = await this.page(parsed.pathname + parsed.search);
    try {
      const product = parseProduct(response.body, url, response.fetchedAt);
      console.info('[Futura] price', { sku: product.sourceProductId, fetchedAt: product.fetchedAt });
      return product;
    } catch (e) { console.warn('[Futura] parser_failure', { sku: parsed.searchParams.get('id') }); throw e; }
  }
}
