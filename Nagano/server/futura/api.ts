import {isMaintenanceBusy} from '../maintenance/runtime';
import { Router } from 'express';
import crypto from 'node:crypto';
import path from 'node:path';
import { FuturaImport, FuturaPreview, FuturaProduct, FuturaShipping } from '../../src/types/futura';
import { ServiceGroup } from '../../src/types/graphicProduct';
import { PricingError } from '../pricingValidation';
import { FuturaCatalogProvider, FuturaImCatalogProvider } from './provider';
import { parseMarkup } from './money';
import { FUTURA_DESTINATION, priceWithShipping } from './shipping';
import { configurationKey, compatibleConfiguration, fingerprint, FuturaStore } from './store';
import { futuraConfig } from './config';

type Pending = { preview: FuturaPreview; previous?: FuturaImport; targetFingerprint?: string; consumed?: boolean };
export function createFuturaIntegration(options: { dataDir?: string; provider?: FuturaCatalogProvider; multiplier?: string; autoRefreshMinutes?: number; startScheduler?: boolean } = {}) {
  const configured = futuraConfig();
  const multiplier = parseMarkup(options.multiplier ?? configured.multiplier);
  const autoRefreshMinutes = options.autoRefreshMinutes ?? configured.autoRefreshMinutes;
  if (!Number.isSafeInteger(autoRefreshMinutes) || autoRefreshMinutes < 60) throw new PricingError('FUTURA_AUTO_REFRESH_MINUTES deve ser um inteiro de pelo menos 60 minutos.', 500);
  const store = new FuturaStore(options.dataDir ?? process.env.PRINTSHOP_DATA_DIR ?? path.resolve('data'));
  const provider = options.provider ?? new FuturaImCatalogProvider();
  const pending = new Map<string, Pending>();
  const router = Router();
  const limits = new Map<string, { since: number; count: number }>();
  router.use('/api/futura', (req, res, next) => {
    const now = Date.now(), key = req.ip ?? 'local';
    if (limits.size > 1000) limits.clear();
    const state = limits.get(key);
    if (!state || now - state.since > 60000) limits.set(key, { since: now, count: 1 });
    else if (++state.count > 40) return res.status(429).json({ success: false, error: 'Muitas solicitações. Aguarde um minuto.' });
    next();
  });
  const endpoint = (fn: (req: any) => Promise<unknown> | unknown) => async (req: any, res: any) => {
    try { res.json({ success: true, data: await fn(req) }); }
    catch (error) {
      console.warn('[Futura] request_failed', { code: error instanceof PricingError ? error.status : 500 });
      res.status(error instanceof PricingError ? error.status : 500).json({ success: false, error: error instanceof PricingError ? error.message : 'Falha na integração FuturaIM. Nenhum preço foi substituído.' });
    }
  };
  const groupOf = (value: unknown): ServiceGroup => {
    if (value !== 'GRAPHIC_PRODUCTS' && value !== 'VISUAL_COMMUNICATION') throw new PricingError('Escolha Gráfica ou Comunicação Visual.');
    return value;
  };
  const string = (value: unknown, max = 500) => {
    if (typeof value !== 'string' || value.length > max) throw new PricingError('Parâmetro de consulta inválido.');
    return value;
  };
  const assertCompatible = (record: FuturaImport, target: any) => {
    if (record.serviceGroup === 'GRAPHIC_PRODUCTS'
      ? target.pricingMethod !== 'QUANTITY_PRICE_TABLE' || target.priceTable?.length !== 1 || target.priceTable[0].quantity !== record.product.quantity
      : target.controlType !== 'UNIT' || target.futuraImportId !== record.id) {
      throw new PricingError('O método ou a configuração do cadastro foi alterado manualmente. A atualização Futura não substituirá essa configuração.', 409);
    }
  };
  const shippingFor = async (product: FuturaProduct, include: boolean) => {
    if (!include) return undefined;
    if (!provider.getShipping) throw new PricingError('Consulta de frete indisponível. Nenhum valor será presumido.', 502);
    return provider.getShipping(product);
  };
  const shippingKey = (shipping?: FuturaShipping) => JSON.stringify(shipping && [shipping.sourceProductId, shipping.postalCode, shipping.lots, shipping.method, shipping.priceCents, shipping.deadline]);
  router.get('/api/futura/config', endpoint(() => ({ multiplier, autoRefreshMinutes, automatic: true, shippingDestination: FUTURA_DESTINATION })));
  router.get('/api/futura/categories', endpoint(() => provider.getCategories()));
  router.get('/api/futura/search', endpoint(req => provider.searchProducts(string(req.query.q ?? '', 100), req.query.category ? string(req.query.category) : undefined)));
  router.get('/api/futura/product', endpoint(req => provider.getProductDetails(string(req.query.url))));
  router.get('/api/futura/imports', endpoint(() => store.list()));
  router.get('/api/futura/audit', endpoint(() => store.history()));
  router.post('/api/futura/preview', endpoint(async req => {
    const previous = req.body.importId ? store.get(string(req.body.importId, 100)) : undefined;
    const group = previous?.serviceGroup ?? groupOf(req.body.serviceGroup);
    const target = previous ? store.target(previous) : undefined;
    if (previous) assertCompatible(previous, target);
    const product = await provider.getCurrentPrice(previous?.product.url ?? string(req.body.url));
    if (previous && !compatibleConfiguration(previous.product, product)) throw new PricingError('A configuração mudou na FuturaIM. Selecione e importe novamente.', 409);
    if (req.body.includeShipping !== undefined && typeof req.body.includeShipping !== 'boolean') throw new PricingError('Opção de frete inválida.');
    const shipping = await shippingFor(product, req.body.includeShipping ?? !!previous?.shipping);
    const preview: FuturaPreview = { token: crypto.randomUUID(), product, serviceGroup: group, markupMultiplier: multiplier,
      ...priceWithShipping(product.sourcePriceCents, multiplier, shipping), shipping, expiresAt: new Date(Date.now() + 300000).toISOString(),
      previous: previous ? { ...previous, salePriceCents: Math.round((group === 'GRAPHIC_PRODUCTS' ? target.priceTable[0].batchPrice : target.salePrice) * 100) } : undefined };
    for (const [key, item] of pending) if (Date.parse(item.preview.expiresAt) < Date.now()) pending.delete(key);
    if (pending.size >= 200) pending.delete(pending.keys().next().value!);
    pending.set(preview.token, { preview, previous, targetFingerprint: previous ? fingerprint(target) : undefined });
    return preview;
  }));
  router.post('/api/futura/confirm', endpoint(async req => {
    const token = string(req.body.token, 100), item = pending.get(token);
    if (!item || item.consumed || Date.parse(item.preview.expiresAt) < Date.now()) throw new PricingError('A prévia expirou ou já foi usada. Consulte novamente.', 409);
    item.consumed = true;
    try {
      const current = await provider.getCurrentPrice(item.preview.product.url);
      if (configurationKey(current) !== configurationKey(item.preview.product) || current.sourcePriceCents !== item.preview.product.sourcePriceCents) throw new PricingError('O preço ou a configuração mudou desde a prévia. Consulte novamente antes de importar.', 409);
      const shipping = await shippingFor(current, !!item.preview.shipping);
      if (shippingKey(shipping) !== shippingKey(item.preview.shipping)) throw new PricingError('O frete mudou desde a prévia. Consulte novamente antes de confirmar.', 409);
      return store.save(current, item.preview.serviceGroup, multiplier, priceWithShipping(current.sourcePriceCents, multiplier, shipping).salePriceCents,
        `Perfil local informado: ${typeof req.body.actor === 'string' ? req.body.actor.slice(0, 70) : 'operador'}`, item.previous, item.targetFingerprint, shipping);
    } finally { pending.delete(token); }
  }));

  let running: Promise<void> | undefined;
  const runAutomaticRefresh = () => {
    if(isMaintenanceBusy())return Promise.resolve();
    if (running) return running;
    running = (async () => {
      const now = Date.now();
      const due = store.list().filter(record => record.active && record.priceSource === 'FUTURA_IM'
        && now - Date.parse(record.lastSyncAt) >= autoRefreshMinutes * 60000
        && (!record.lastAttemptAt || now - Date.parse(String(record.lastAttemptAt)) >= 3600000)).slice(0, 20);
      for (const record of due) {
        try {
          const target = store.target(record), expected = fingerprint(target);
          if (!target.active || !store.isManaged(record, target)) continue;
          assertCompatible(record, target);
          const current = await provider.getCurrentPrice(record.product.url);
          if (!compatibleConfiguration(record.product, current)) throw new PricingError('A configuração da FuturaIM mudou. Atualização automática suspensa para este item.', 409);
          const shipping = await shippingFor(current, !!record.shipping);
          store.save(current, record.serviceGroup, multiplier, priceWithShipping(current.sourcePriceCents, multiplier, shipping).salePriceCents, 'Sistema (automático)', record, expected, shipping);
          console.info('[Futura] automatic_refresh', { importId: record.id });
        } catch (error) {
          const message = error instanceof PricingError ? error.message : 'Não foi possível atualizar o preço da FuturaIM.';
          store.syncResult(record.id, message);
          store.audit('FUTURA_SYNC_FAILED', record.id, 'Sistema (automático)', { error: message });
          console.warn('[Futura] automatic_refresh_failed', { importId: record.id });
        }
      }
    })().finally(() => { running = undefined; });
    return running;
  };
  const timer = options.startScheduler === false ? undefined : setInterval(() => { void runAutomaticRefresh().catch(() => console.warn('[Futura] scheduler_failed')); }, 60000);
  timer?.unref();
  return { router, store, runAutomaticRefresh, close: async () => { if (timer) clearInterval(timer); await running; store.close(); } };
}
