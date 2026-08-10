import * as Clipboard from 'expo-clipboard';
import { storage } from '@/utils/storage';
import {
  ackDownloadCompletion,
  addDownloadCompleteListener,
  addDownloadStateChangeListener,
  cancelDownload as cancelNativeDownload,
  clearNativeDownloads,
  fetchDownloads,
  fetchPendingCompletions,
  getDocumentsDirectoryPath,
  removeDownloadRecord,
  replaceDownloadRecords,
  startDownload as startNativeDownload,
  type DownloadCompleteEvent,
  type DownloadPendingCompletion,
  type DownloadStateChangeEvent,
  type NativeDownloadRecord,
} from 'pili-native-core';

export interface DownloadItem {
  id: string;
  title: string;
  pic: string;
  url: string;
  createdAt: number;
  status: 'downloading' | 'done' | 'error' | 'paused';
  path?: string;
  error?: string;
  progress?: number;
  /** Legacy field used only to migrate old AsyncStorage entries. */
  nativeId?: string;
}

const LEGACY_KEYS = ['piliplus_downloads', 'downloads'] as const;
const MIGRATED_KEY = 'downloads_migrated_v2';
let nativeListenersAttached = false;
let downloadsCache: DownloadItem[] | null = null;
const downloadListeners = new Set<() => void>();

function notifyDownloadsChanged(): void {
  for (const listener of downloadListeners) {
    listener();
  }
}

export function subscribeDownloadsChanged(listener: () => void): () => void {
  downloadListeners.add(listener);
  return () => {
    downloadListeners.delete(listener);
  };
}

function recordToItem(record: NativeDownloadRecord): DownloadItem {
  const item: DownloadItem = {
    id: record.id,
    title: record.title || '未命名视频',
    pic: record.pic || '',
    url: record.url || '',
    createdAt: typeof record.createdAt === 'number' ? record.createdAt : Date.now(),
    status: record.status,
    path: record.path || record.destination || undefined,
    progress: typeof record.progress === 'number' ? record.progress : undefined,
  };
  if (record.error) item.error = record.error;
  return item;
}

function itemToRecord(item: DownloadItem): NativeDownloadRecord {
  const record: NativeDownloadRecord = {
    id: item.id,
    title: item.title || '',
    pic: item.pic || '',
    url: item.url || '',
    destination: item.path || '',
    path: item.path || '',
    createdAt: item.createdAt || Date.now(),
    status: item.status,
    progress: typeof item.progress === 'number' ? item.progress : item.status === 'done' ? 1 : 0,
  };
  if (item.error) record.error = item.error;
  return record;
}

async function readList(): Promise<DownloadItem[]> {
  if (downloadsCache) return downloadsCache;
  await migrateLegacyDownloads();
  const records = await fetchDownloads();
  downloadsCache = records
    .map(recordToItem)
    .sort((a, b) => b.createdAt - a.createdAt);
  return downloadsCache;
}

async function migrateLegacyDownloads(): Promise<void> {
  if (await storage.getJSON<boolean>(MIGRATED_KEY)) return;
  let legacy: DownloadItem[] = [];
  for (const key of LEGACY_KEYS) {
    const value = await storage.getJSON<DownloadItem[]>(key);
    if (Array.isArray(value)) legacy = legacy.concat(value);
  }

  const records = await fetchDownloads();
  const recordById = new Map(records.map((record) => [record.id, record]));
  const seen = new Set<string>();
  const merged: NativeDownloadRecord[] = [];

  for (const item of legacy) {
    const existing = item.nativeId ? recordById.get(item.nativeId) : undefined;
    const recordId = existing?.id ?? item.nativeId ?? item.id;
    if (!recordId || seen.has(recordId)) continue;
    seen.add(recordId);
    if (existing) {
      merged.push({
        ...existing,
        title: item.title || existing.title || '',
        pic: item.pic || existing.pic || '',
        url: item.url || existing.url || '',
        createdAt: item.createdAt || existing.createdAt || Date.now(),
      });
    } else {
      const record = itemToRecord(item);
      if (item.nativeId) record.id = item.nativeId;
      merged.push(record);
    }
  }

  for (const record of records) {
    if (!seen.has(record.id)) {
      merged.push(record);
      seen.add(record.id);
    }
  }

  if (merged.length > 0) {
    await replaceDownloadRecords(merged);
  }
  for (const key of LEGACY_KEYS) {
    await storage.remove(key);
  }
  await storage.setJSON(MIGRATED_KEY, true);
}

function attachCoreListeners(): void {
  if (nativeListenersAttached) return;
  const complete = addDownloadCompleteListener((event: DownloadCompleteEvent) => {
    void (async () => {
      await updateById(event.id, (item) => (
        event.error
          ? { ...item, status: 'error', error: event.error, progress: undefined }
          : { ...item, status: 'done', path: event.uri || item.path, progress: 1 }
      ));
      await ackDownloadCompletion(event.id).catch(() => {});
    })();
  });
  const state = addDownloadStateChangeListener((event: DownloadStateChangeEvent) => {
    void (async () => {
      await updateById(event.id, (item) => {
        if (event.state === 'error') {
          return { ...item, status: 'error', error: '下载失败' };
        }
        if (event.state === 'paused') {
          return { ...item, status: 'paused' };
        }
        return { ...item, status: 'downloading' };
      });
    })();
  });
  if (!complete || !state) {
    complete?.();
    state?.();
    return;
  }
  nativeListenersAttached = true;
  void reconcilePendingCompletions();
}

async function updateById(
  id: string,
  updater: (item: DownloadItem) => DownloadItem,
): Promise<boolean> {
  const list = await readList();
  const idx = list.findIndex((d) => d.id === id);
  if (idx < 0) return false;
  list[idx] = updater(list[idx]);
  downloadsCache = [...list];
  notifyDownloadsChanged();
  return true;
}

async function applyPendingCompletion(event: DownloadPendingCompletion): Promise<void> {
  await updateById(event.id, (item) => (
    event.error
      ? { ...item, status: 'error', error: event.error, progress: undefined }
      : { ...item, status: 'done', path: event.uri || item.path, progress: 1 }
  ));
  await ackDownloadCompletion(event.id).catch(() => {});
}

async function reconcilePendingCompletions(): Promise<void> {
  const pending = await fetchPendingCompletions();
  for (const event of pending) {
    await applyPendingCompletion(event);
  }
}

export async function getDownloads(): Promise<DownloadItem[]> {
  const result = await readList();
  attachCoreListeners();
  return result;
}

export async function addDownload(input: { title: string; pic: string; url: string }): Promise<void> {
  attachCoreListeners();
  const list = await getDownloads();
  if (list.some((d) => d.url === input.url && d.status !== 'error')) return;
  const fileToken = `${Date.now()}`;
  const documentsPath = await getDocumentsDirectoryPath();
  const filePath = `${documentsPath}/piliplus_${fileToken}.mp4`;
  const nativeId = await startNativeDownload(
    input.url,
    filePath,
    input.title || '未命名视频',
    input.pic || '',
  );
  if (!nativeId) {
    throw new Error('Native download failed to start');
  }
  downloadsCache = null;
  await getDownloads();
}

export async function removeDownload(id: string): Promise<void> {
  await removeDownloads([id]);
}

export async function removeDownloads(ids: string[]): Promise<void> {
  const idSet = new Set(ids);
  const list = await getDownloads();
  for (const target of list) {
    if (!idSet.has(target.id)) continue;
    const cancelled = await cancelNativeDownload(target.id);
    if (!cancelled) {
      await removeDownloadRecord(target.id).catch(() => {});
    }
  }
  downloadsCache = list.filter((d) => !idSet.has(d.id));
  notifyDownloadsChanged();
}

export async function clearDownloads(): Promise<void> {
  await clearNativeDownloads();
  downloadsCache = [];
  notifyDownloadsChanged();
}

export async function exportDownloadsToClipboard(items: DownloadItem[]): Promise<void> {
  await Clipboard.setStringAsync(JSON.stringify(items, null, 2));
}
