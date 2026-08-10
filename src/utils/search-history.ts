import { storage } from '@/utils/storage';

const SEARCH_HISTORY_KEY = 'search_history';
const SEARCH_HISTORY_LIMIT = 20;

export async function loadSearchHistory(): Promise<string[]> {
  const saved = await storage.getJSON<string[]>(SEARCH_HISTORY_KEY);
  return Array.isArray(saved)
    ? saved.filter((h): h is string => typeof h === 'string')
    : [];
}

export async function addSearchHistory(keyword: string): Promise<string[]> {
  const kw = keyword.trim();
  if (!kw) return loadSearchHistory();
  const existing = await loadSearchHistory();
  const next = [kw, ...existing.filter((h) => h !== kw)].slice(0, SEARCH_HISTORY_LIMIT);
  await storage.setJSON(SEARCH_HISTORY_KEY, next);
  return next;
}

export async function clearSearchHistory(): Promise<void> {
  await storage.remove(SEARCH_HISTORY_KEY);
}
