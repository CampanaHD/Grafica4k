import { useEffect, useState } from 'react';
import { QuotationItem } from '../types';
import { PricedItem, quotationApi } from './quotationApi';

/** A response is usable only for the exact current inputs; stale requests cannot restore old totals. */
export function useItemPricing(input: Partial<QuotationItem>, enabled: boolean, materialVersion: string) {
  const key = JSON.stringify({ input, materialVersion });
  const [state, setState] = useState<{ key: string; data?: PricedItem; error?: string }>({ key: '' });
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      quotationApi.preview(JSON.parse(key).input, controller.signal).then(data => {
        if (!controller.signal.aborted) setState({ key, data });
      }).catch(error => {
        if (!controller.signal.aborted) setState({ key, error: error.message });
      });
    }, 120);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [key, enabled]);
  const current = enabled && state.key === key ? state : null;
  return { data: current?.data, error: current?.error, pending: enabled && !current?.data && !current?.error };
}

// Backward-compatible name for the existing roll editor.
export const useRollPricing = useItemPricing;
