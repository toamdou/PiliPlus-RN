import { useCallback, useEffect, useRef, useState } from 'react';
import { searchApi } from '@/api/search';
import { createNativeRequestCancelToken, type NativeRequestCancelToken } from '@/utils/request-cancel';
import type { SuggestItem } from '@/components/search/SearchSuggestionRow';

const DEBOUNCE_MS = 300;
const MAX_SUGGESTIONS = 8;

export function useSearchSuggestions(keyword: string, enabled = true) {
  const [suggestions, setSuggestions] = useState<SuggestItem[]>([]);
  const [showSuggest, setShowSuggest] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelTokenRef = useRef<NativeRequestCancelToken | null>(null);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    cancelTokenRef.current?.abort();
    const token = createNativeRequestCancelToken();
    cancelTokenRef.current = token;
    const kw = keyword.trim();
    if (!kw || !enabled) {
      timer.current = setTimeout(() => {
        setSuggestions([]);
        setShowSuggest(false);
      }, 0);
    } else {
      timer.current = setTimeout(async () => {
        try {
          const res = await searchApi.suggest({ term: kw }, { cancelToken: token });
          const list: SuggestItem[] = (res?.result?.tag || [])
            .map((t: any) => ({
              value: t.value || t.name || '',
              term: t.term || '',
            }))
            .filter((s: SuggestItem) => s.value);
          setSuggestions(list.slice(0, MAX_SUGGESTIONS));
          setShowSuggest(list.length > 0);
        } catch {
          if (!token.aborted) {
            setSuggestions([]);
            setShowSuggest(false);
          }
        }
      }, DEBOUNCE_MS);
    }
    return () => {
      if (timer.current) clearTimeout(timer.current);
      cancelTokenRef.current?.abort();
      cancelTokenRef.current = null;
    };
  }, [keyword, enabled]);

  const dismissSuggestions = useCallback(() => {
    setSuggestions([]);
    setShowSuggest(false);
  }, []);

  return { suggestions, showSuggest, dismissSuggestions };
}
