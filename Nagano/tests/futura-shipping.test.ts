import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { FUTURA_DESTINATION, parseShipping, priceWithShipping } from '../server/futura/shipping';
import { parseProduct } from '../server/futura/parser';
import { FuturaImCatalogProvider } from '../server/futura/provider';

const html = readFileSync('tests/fixtures/futura/shipping.html', 'utf8');
const date = '2026-10-01T13:00:00.000Z';
const url = 'https://www.futuraim.com.br/produto/cartao-de-visita-em-couche-fosco-com-laminacao-fosca-e-verniz-localizado?id=3551';
const productHtml = readFileSync('tests/fixtures/futura/product.html', 'utf8');
const row = (method: string, price: string) => `<div class="row"><div class="col-5">${method}</div><div class="col-4">4 dias úteis</div><div class="col-3">${price}</div></div>`;

test('shipping selects lowest home delivery for the provided destination, excluding pickup', () => {
  const shipping = parseShipping(html + row('Retire no balcão', 'Grátis') + row('Expresso', 'R$ 29,00'), '20145', date);
  assert.equal(shipping.method, 'JAD - Delivery'); assert.equal(shipping.priceCents, 990);
  assert.equal(shipping.deadline, '4 dias úteis'); assert.equal(shipping.lots, 1);
  assert.equal(shipping.postalCode, '17504010'); assert.equal(shipping.address, FUTURA_DESTINATION.address);
  assert.equal(shipping.sourceProductId, '20145'); assert.equal(shipping.fetchedAt, date);
  assert.equal(priceWithShipping(10000, '2.00', shipping).salePriceCents, 20990);
  assert.equal(priceWithShipping(8750, '2.00', shipping).salePriceCents, 18490);
  assert.equal(priceWithShipping(8750, '2.00').salePriceCents, 17500);
});

test('shipping accepts explicit free delivery and fails on missing/invalid home delivery', () => {
  assert.equal(parseShipping(row('Delivery', 'Grátis'), '1', date).priceCents, 0);
  assert.equal(parseShipping(row('Delivery', 'R$ 0,00'), '1', date).priceCents, 0);
  for (const content of [row('Retire no balcão', 'R$ 9,90'), '<div>Erro</div>', row('Delivery', ''), row('Delivery', 'A consultar'), row('Delivery', 'R$ -1,00')]) assert.throws(() => parseShipping(content, '1', date));
});

test('shipping uses an anonymous public simulation for one exact lot, without leaking session data', async () => {
  const requests: { url: string; method?: string }[] = [];
  const product = parseProduct(productHtml, url, date);
  const provider = new FuturaImCatalogProvider((async (input: string, init: RequestInit) => {
    requests.push({ url: input, method: init.method });
    if (input.endsWith('/robots.txt')) return new Response('User-agent: *\nAllow: /');
    if (input.includes('/produto/')) return new Response(productHtml + '<input id="ProdutoId" value="3551"><input name="__RequestVerificationToken" value="test-only-token">', { headers: { 'Set-Cookie': 'test-session=anonymous; Path=/; HttpOnly' } });
    assert.equal(new URL(input).pathname, '/produtos/frete-sku/');
    assert.equal(new URL(input).searchParams.get('cep'), '17504010');
    assert.equal(new URL(input).searchParams.get('quantidade'), '1');
    assert.equal(new URL(input).searchParams.get('produtoId'), '3551');
    assert.equal(init.method, 'POST');
    const headers = new Headers(init.headers);
    assert.equal(headers.get('Cookie'), 'test-session=anonymous');
    assert.equal(headers.get('RequestVerificationToken'), 'test-only-token');
    return new Response(html);
  }) as typeof fetch, 0);
  const shipping = await provider.getShipping(product);
  assert.equal(shipping.priceCents, 990);
  assert.equal(requests.length, 3);
  assert.doesNotMatch(JSON.stringify(shipping), /test-session|test-only-token|cookie/i);
});

test('shipping respects robots and rejects source changes before public simulation', async () => {
  const product = parseProduct(productHtml, url, date);
  let posts = 0;
  for (const blocked of [true, false]) {
    const provider = new FuturaImCatalogProvider((async (input: string, init: RequestInit) => {
      if (input.endsWith('/robots.txt')) return new Response(`User-agent: *\n${blocked ? 'Disallow: /produtos/frete-sku/' : 'Allow: /'}`);
      if (init.method === 'POST') posts++;
      return new Response(productHtml);
    }) as typeof fetch, 0);
    await assert.rejects(provider.getShipping({ ...product, sourcePriceCents: product.sourcePriceCents + 1 }));
  }
  assert.equal(posts, 0);
});
