import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseProduct } from '../server/futura/parser';
import { compatibleConfiguration } from '../server/futura/store';
import { futuraConfigurationFields } from '../src/utils/futuraConfiguration';

const folderUrl = 'https://www.futuraim.com.br/produto/pasta-com-bolsa?id=7306';
const date = '2026-10-01T13:00:00.000Z';
const fixture = (name: string) => readFileSync('tests/fixtures/futura/' + name, 'utf8');
const folder = () => parseProduct(fixture('folder-pocket.html'), folderUrl, date);

test('exact reported folder exposes Colada, Encaixe and Personalizada with source SKU links', () => {
  const p = folder();
  assert.equal(p.configuration.Modelo, 'Bolsa Colada');
  assert.equal(p.configuration['Formato Aberto'], '310x440mm');
  assert.equal(p.configuration.Acabamento, 'Colagem - 1 Vinco');
  const model = p.configurationGroups!.find(g => g.field === 'Modelo')!;
  assert.deepEqual(model.options, [
    { label: 'Bolsa Colada', url: folderUrl },
    { label: 'Bolsa Encaixe', url: folderUrl.replace('7306', '7362') },
    { label: 'Bolsa Personalizada', url: folderUrl.replace('7306', '53424') },
  ]);
  assert.equal(futuraConfigurationFields(p)[0].field, 'Modelo');
  assert.ok(futuraConfigurationFields(p).some(g => g.field === 'Formato Aberto'));
  assert.equal(p.configuration['Prazo de produção'], undefined);
});

test('native source select preserves the current SKU even when selected option links a default SKU', () => {
  const url = 'https://www.futuraim.com.br/produto/pasta-com-orelha?id=41946';
  const p = parseProduct(fixture('folder-select.html'), url, date);
  assert.equal(p.configuration.Modelo, 'Pasta com Orelha');
  assert.deepEqual(p.configurationGroups!.find(g => g.field === 'Modelo')!.options, [{ label: 'Pasta com Orelha', url }]);
  const html = fixture('folder-select.html').replace('</select>', '<option value="/produto/pasta-com-bolsa?id=7306">Bolsa Colada</option><option value="https://evil.test/produto/a?id=1">Inválida</option></select>');
  const other = parseProduct(html, url, date);
  assert.ok(other.configurationGroups!.find(g => g.field === 'Modelo')!.options.some(o => o.label === 'Bolsa Colada'));
  assert.doesNotMatch(JSON.stringify(other), /evil.test|Inválida/);
});

test('product-specific fields are discovered in the configurator without a fixed attribute list', () => {
  const extra = `<div class="selects-produto"><div role="group" aria-label="Tipo de fechamento">
    <button class="active" disabled>Encaixe</button><button onclick="trocarProdutoPorUrl('/produto/pasta-com-bolsa?id=53424')">Colado</button>
    </div></div><div role="group" aria-label="Campo fora do produto"><button class="active">Ignorar</button></div>`;
  const p = parseProduct(fixture('folder-pocket.html') + extra, folderUrl, date);
  assert.equal(p.configuration['Tipo de fechamento'], 'Encaixe');
  assert.equal(p.configuration['Campo fora do produto'], undefined);
  assert.equal(p.configurationGroups!.find(g => g.field === 'Tipo de fechamento')!.options.length, 2);
  assert.throws(() => parseProduct(fixture('folder-pocket.html') + extra.replace('class="active" disabled', ''), folderUrl, date), /opção selecionada/);
});

test('legacy enrichment accepts omitted facts once, but rejects changed known fields, SKU or quantity', () => {
  const p = folder(), legacy = structuredClone(p);
  delete legacy.configurationVersion; delete legacy.configuration.Modelo; delete legacy.configuration['Formato Aberto'];
  assert.equal(compatibleConfiguration(legacy, p), true);
  assert.equal(compatibleConfiguration(legacy, { ...p, sourceProductId: '7362' }), false);
  assert.equal(compatibleConfiguration(legacy, { ...p, quantity: p.quantity + 1 }), false);
  assert.equal(compatibleConfiguration(legacy, { ...p, configuration: { ...p.configuration, Acabamento: 'Outro' } }), false);
  assert.equal(compatibleConfiguration(p, { ...p, configuration: { ...p.configuration, Modelo: 'Bolsa Encaixe' } }), false);
  assert.equal(compatibleConfiguration(p, { ...p, configuration: { ...p.configuration, Extra: 'Novo' } }), false);
  const reordered = { ...p, configuration: Object.fromEntries(Object.entries(p.configuration).reverse()) };
  assert.equal(compatibleConfiguration(p, reordered), true);
});
