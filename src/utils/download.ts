import * as Clipboard from 'expo-clipboard';
import { storage } from '@/utils/storage';
import { videoApi } from '@/api/video';
import { getBestPlayUrl } from '@/utils/player-utils';
import {
  ackDownloadCompletion,
  addDownloadCompleteListener,
  addDownloadStateChangeListener,
  cancelDownload as cancelNativeDownload,
  clearNativeDownloads,
  fetchDownloads,
  fetchPendingCompletions,
  getDocumentsDirectoryPath,
  pauseDownload as pauseNativeDownload,
  removeDownloadRecord,
  replaceDownloadRecords,
  resumeDownload as resumeNativeDownload,
  startDownloadWithMeta,
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
  /** 以下为下载元数据（下载内搜索 / 单任务分P详情用），旧记录可能缺失。 */
  author?: string;
  bvid?: string;
  aid?: number;
  /** 同一视频（bvid）下的任务分组标识，单P 为 undefined。 */
  taskId?: string;
  /** 分P 序号（0 起），单P 为 undefined。 */
  partIndex?: number;
  /** 分P 标题。 */
  partTitle?: string;
  /** 总 P 数（多 P 视频）。 */
  partCount?: number;
  /** 下载清晰度（qn）。 */
  quality?: number;
  cid?: number;
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
  if (record.author) item.author = record.author;
  if (record.bvid) item.bvid = record.bvid;
  if (typeof record.aid === 'number') item.aid = record.aid;
  if (record.taskId) item.taskId = record.taskId;
  if (typeof record.partIndex === 'number') item.partIndex = record.partIndex;
  if (record.partTitle) item.partTitle = record.partTitle;
  if (typeof record.partCount === 'number') item.partCount = record.partCount;
  if (typeof record.quality === 'number') item.quality = record.quality;
  if (typeof record.cid === 'number') item.cid = record.cid;
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
  if (item.author) record.author = item.author;
  if (item.bvid) record.bvid = item.bvid;
  if (typeof item.aid === 'number') record.aid = item.aid;
  if (item.taskId) record.taskId = item.taskId;
  if (typeof item.partIndex === 'number') record.partIndex = item.partIndex;
  if (item.partTitle) record.partTitle = item.partTitle;
  if (typeof item.partCount === 'number') record.partCount = item.partCount;
  if (typeof item.quality === 'number') record.quality = item.quality;
  if (typeof item.cid === 'number') record.cid = item.cid;
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

export interface AddDownloadInput {
  title: string;
  pic: string;
  url: string;
  author?: string;
  bvid?: string;
  aid?: number;
  taskId?: string;
  partIndex?: number;
  partTitle?: string;
  partCount?: number;
  quality?: number;
  cid?: number;
}

/**
 * 加入离线缓存。
 * 支持多 P 下载：同一视频（bvid）多次调用并传 taskId / partIndex / partTitle / partCount，
 * 会在下载记录上写入分 P 元数据，供单任务分 P 详情页分组展示。
 */
export async function addDownload(input: AddDownloadInput): Promise<void> {
  attachCoreListeners();
  const list = await getDownloads();
  if (list.some((d) => d.url === input.url && d.status !== 'error')) return;
  const fileToken = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const documentsPath = await getDocumentsDirectoryPath();
  const filePath = `${documentsPath}/piliplus_${fileToken}.mp4`;
  const nativeId = await startDownloadWithMeta(
    input.url,
    filePath,
    {
      title: input.title || '未命名视频',
      pic: input.pic || '',
      author: input.author,
      bvid: input.bvid,
      aid: input.aid,
      taskId: input.taskId,
      partIndex: input.partIndex,
      partTitle: input.partTitle,
      partCount: input.partCount,
      quality: input.quality,
      cid: input.cid,
    },
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

/* ====================== 下载内搜索 / 单任务分P 详情辅助 ====================== */

/**
 * 按关键词本地过滤下载任务（对齐 Flutter download/search 纯本地过滤）：
 * 匹配标题 / UP 主 / 分P 标题 / BV 号，大小写不敏感。
 */
export async function searchDownloads(keyword: string): Promise<DownloadItem[]> {
  const list = await getDownloads();
  const q = keyword.trim().toLowerCase();
  if (!q) return list;
  return list.filter((item) =>
    item.title.toLowerCase().includes(q) ||
    (item.author || '').toLowerCase().includes(q) ||
    (item.partTitle || '').toLowerCase().includes(q) ||
    (item.bvid || '').toLowerCase().includes(q),
  );
}

/** 取单个下载任务。 */
export async function getDownloadTask(id: string): Promise<DownloadItem | null> {
  const list = await getDownloads();
  return list.find((it) => it.id === id) ?? null;
}

/**
 * 取某任务所属视频的全部分 P 下载（多 P 视频）：
 * 以 bvid（旧记录回退 taskId）分组，按 partIndex 升序；单 P 返回自身。
 */
export async function getTaskParts(id: string): Promise<DownloadItem[]> {
  const list = await getDownloads();
  const self = list.find((it) => it.id === id);
  if (!self) return [];
  const groupKey = self.bvid || self.taskId;
  if (!groupKey) return [self];
  const parts = list
    .filter((it) => (it.bvid || it.taskId) === groupKey)
    .sort((a, b) => (a.partIndex ?? 0) - (b.partIndex ?? 0));
  return parts.length > 0 ? parts : [self];
}

/**
 * 重试失败的任务：删除旧记录后，用缓存的流 URL 重新起一个下载任务。
 * 保持原分 P / 清晰度元数据，便于详情页继续分组。
 */
export async function retryDownload(item: DownloadItem): Promise<boolean> {
  try {
    await removeDownload(item.id);
    await addDownload({
      title: item.title,
      pic: item.pic,
      url: item.url,
      author: item.author,
      bvid: item.bvid,
      aid: item.aid,
      taskId: item.taskId,
      partIndex: item.partIndex,
      partTitle: item.partTitle,
      partCount: item.partCount,
      quality: item.quality,
      cid: item.cid,
    });
    return true;
  } catch {
    return false;
  }
}

/** 暂停单个下载任务（原生层取消 URLSession 任务并保留记录）。 */
export async function pauseTask(id: string): Promise<void> {
  await pauseNativeDownload(id);
  await refreshDownloadCache();
}

/** 恢复单个下载任务（原生层用缓存的流 URL 重开任务）。 */
export async function resumeTask(id: string): Promise<void> {
  await resumeNativeDownload(id);
  await refreshDownloadCache();
}

async function refreshDownloadCache(): Promise<void> {
  downloadsCache = null;
  await getDownloads();
  notifyDownloadsChanged();
}

/* ====================== 清晰度 / 分P 选择下载 ====================== */

export interface DownloadPartMeta {
  cid: number;
  /** 分P 标题（B 站 pagelist 的 part 字段） */
  part: string;
  duration?: number;
}

export interface DownloadVideoPartsInput {
  bvid?: string;
  aid?: number;
  title: string;
  pic: string;
  author?: string;
  /** 任务分组标识：同一视频多 P 共用一个 taskId（缺省回退 bvid）。 */
  taskId?: string;
  parts: DownloadPartMeta[];
  /** 需要下载的分 P cid 列表（多选）。 */
  selectedCids: number[];
  /** 清晰度（qn，作用于每个所选 P 的取流 URL）。 */
  quality: number;
}

/**
 * 多 P 下载：按所选清晰度逐 P 取流（videoApi.playUrl → getBestPlayUrl），
 * 再逐 P 写入下载记录。下载仍是"缓存当前流 URL"模型——清晰度选择作用于所选 P 的取流 URL。
 * 返回成功/失败数量。
 */
export async function downloadVideoParts(input: DownloadVideoPartsInput): Promise<{ ok: number; failed: number }> {
  attachCoreListeners();
  let ok = 0;
  let failed = 0;
  for (const cid of input.selectedCids) {
    const meta = input.parts.find((p) => p.cid === cid);
    if (!meta) continue;
    try {
      const res = await videoApi.playUrl({
        avid: input.aid,
        bvid: input.bvid,
        cid,
        qn: input.quality,
      });
      const url = getBestPlayUrl(res?.data);
      if (!url) {
        failed += 1;
        continue;
      }
      const partIndex = input.parts.findIndex((p) => p.cid === cid);
      await addDownload({
        title: input.title,
        pic: input.pic,
        url,
        author: input.author,
        bvid: input.bvid,
        aid: input.aid,
        taskId: input.taskId,
        partIndex: partIndex >= 0 ? partIndex : undefined,
        partTitle: meta.part,
        partCount: input.parts.length,
        quality: input.quality,
        cid,
      });
      ok += 1;
    } catch {
      failed += 1;
    }
  }
  return { ok, failed };
}
