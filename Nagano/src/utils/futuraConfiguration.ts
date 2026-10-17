import { FuturaConfigurationGroup, FuturaProduct } from '../types/futura';

// A source material can bundle paper and weight. Split its display, keeping the exact SKU link.
export function splitFuturaMaterial(value: string) {
  const match = value.match(/^(.*?)\s+(\d+(?:[.,]\d+)?\s*g(?:\s*\/\s*m[²2])?)$/i);
  return match ? { paper: match[1].trim(), weight: match[2].trim() } : { paper: value, weight: '' };
}

export function futuraConfigurationFields(product: FuturaProduct): FuturaConfigurationGroup[] {
  const groups = product.configurationGroups ?? [
    ...Object.entries(product.configuration).map(([field, value]) => ({ field, value, options: [{ label: value, url: product.url }] })),
    { field: 'Quantidade', value: String(product.quantity), options: [{ label: String(product.quantity), url: product.url }] },
  ];
  return groups.flatMap(group => {
    if (group.field !== 'Material') return [{ ...group, field: group.field === 'Cor de Impressão' ? 'Cor' : group.field }];
    const selected = splitFuturaMaterial(group.value);
    const papers = new Map<string, { label: string; url: string }>();
    // Prefer the current SKU and, for other papers, the current weight when it exists.
    for (const option of [...group.options].sort((a, b) => Number(splitFuturaMaterial(b.label).weight === selected.weight) - Number(splitFuturaMaterial(a.label).weight === selected.weight))) {
      const { paper } = splitFuturaMaterial(option.label);
      if (!papers.has(paper)) papers.set(paper, { label: paper, url: option.url });
    }
    papers.set(selected.paper, { label: selected.paper, url: product.url });
    const paper = { field: 'Papel / Material', value: selected.paper, options: [...papers.values()] };
    if (!selected.weight || groups.some(g => g.field === 'Gramatura')) return [paper];
    const weights = group.options.filter(o => splitFuturaMaterial(o.label).paper === selected.paper).map(o => ({ label: splitFuturaMaterial(o.label).weight, url: o.url })).filter(o => o.label);
    return [paper, { field: 'Gramatura', value: selected.weight, options: weights }];
  });
}
