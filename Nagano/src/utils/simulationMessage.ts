import type { SimulationResult } from '../types/quotationSimulation';
import { formatCurrency } from './formatters';

export function formatSimulationMessage(result: SimulationResult, validityHours: number): string {
  const item = result.options[0]?.item;
  if (!item) return '';
  const number = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 });
  const finishes = item.finishings.map(f => f.finishingName).join(', ');
  const heading = `Fiz uma simulação para ${item.serviceName} ${number.format(item.widthCm)} × ${number.format(item.heightCm)} cm (${item.materialName})${finishes ? ` (${finishes})` : ''}.`;
  const options = result.options.map(opt => [
    opt.quantity === result.lowestUnitPriceQuantity ? '--- MENOR VALOR POR UNIDADE ---' : '',
    `*${number.format(opt.quantity)} UNIDADES*`,
    `Unit.: ${formatCurrency(opt.unitPrice)} | *Total: ${formatCurrency(opt.total)}*`,
    opt.saving > 0 ? `Economia: ${formatCurrency(opt.saving)} (${number.format(opt.savingPercentage)}%) em relação ao valor unitário da menor quantidade.` : '',
  ].filter(Boolean).join('\n'));
  return [heading, 'Veja as opções de quantidades:', ...options,
    `Atenção: valores válidos por ${number.format(validityHours)}h.`, 'Qual dessas quantidades atende melhor sua necessidade hoje?'].join('\n\n');
}
