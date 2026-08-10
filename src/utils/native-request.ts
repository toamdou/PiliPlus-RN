import type {
  NativeRequestOptions,
  NativeUploadOptions,
} from 'pili-native-core';

interface NativeRequestInput {
  url: string;
  method?: NativeRequestOptions['method'];
  headers?: Record<string, string>;
  body?: string;
  requestId?: string;
  timeoutMs?: number;
  responseType?: NativeRequestOptions['responseType'];
  skipCookies?: boolean;
  maxCacheSize?: number;
}

export function buildNativeRequestOptions(
  input: NativeRequestInput,
): NativeRequestOptions {
  const options: NativeRequestOptions = {
    url: input.url,
    method: input.method ?? 'GET',
    headers: input.headers ?? {},
    ...(input.body === undefined ? {} : { body: input.body }),
    ...(input.requestId === undefined ? {} : { requestId: input.requestId }),
    timeoutMs: input.timeoutMs ?? 10_000,
    responseType: input.responseType ?? 'json',
    ...(input.skipCookies === undefined ? {} : { skipCookies: input.skipCookies }),
    ...(input.maxCacheSize === undefined ? {} : { maxCacheSize: input.maxCacheSize }),
  };
  return options;
}

interface NativeUploadInput {
  url: string;
  fileUri: string;
  requestId?: string;
  fileName?: string;
  mimeType?: string;
  category?: string;
  biz?: string;
  csrf?: string;
  headers?: Record<string, string>;
  timeoutMs?: number;
  responseType?: NativeUploadOptions['responseType'];
}

export function buildNativeUploadOptions(
  input: NativeUploadInput,
): NativeUploadOptions {
  const options: NativeUploadOptions = {
    url: input.url,
    fileUri: input.fileUri,
    ...(input.requestId === undefined ? {} : { requestId: input.requestId }),
    ...(input.fileName === undefined ? {} : { fileName: input.fileName }),
    ...(input.mimeType === undefined ? {} : { mimeType: input.mimeType }),
    ...(input.category === undefined ? {} : { category: input.category }),
    ...(input.biz === undefined ? {} : { biz: input.biz }),
    ...(input.csrf === undefined ? {} : { csrf: input.csrf }),
    headers: input.headers ?? {},
    timeoutMs: input.timeoutMs ?? 10_000,
    responseType: input.responseType ?? 'json',
  };
  return options;
}
