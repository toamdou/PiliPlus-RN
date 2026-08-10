import { HttpString } from './constants';
import { getAccessKey } from '@/utils/cookie';
import { USER_AGENT, BASE_HEADERS, TRACE_ID, signAppParamsAsync } from '@/utils/app-sign';
import { useAuthStore } from '@/stores/auth';
import { buildNativeRequestOptions } from '@/utils/native-request';
import { formBody, formBodyStrict } from '@/utils/form';
import {
  cancelNativeRequest,
  nativeBinaryRequestAsync,
  nativeBinaryRequestWithHeadersAsync,
  nativeRequestAsync,
  type NativeRequestOptions,
} from 'pili-native-core';
import type { NativeRequestCancelToken } from '@/utils/request-cancel';
import { toArrayBuffer } from '@/utils/bytes';

const DEFAULT_TIMEOUT = 10000;

export interface ApiClient {
  baseURL: string;
  timeout: number;
  headers: Record<string, string>;
}

export interface RequestConfig {
  params?: Record<string, any>;
  headers?: Record<string, any>;
  responseType?: 'text' | 'arraybuffer' | 'json';
  rawResponse?: boolean;
  cancelToken?: NativeRequestCancelToken;
}

function serializeParams(params?: Record<string, any>): string {
  return params ? formBody(params) : '';
}

const IDENTITY_PARAM_KEYS = new Set(['access_key', 'csrf', 'csrf_token', 'bili_jct']);

function stripIdentityFields(record: Record<string, any>): Record<string, any> {
  const next: Record<string, any> = {};
  for (const [key, value] of Object.entries(record)) {
    if (!IDENTITY_PARAM_KEYS.has(key)) next[key] = value;
  }
  return next;
}

function buildNativeURL(baseURL: string, url: string, params?: Record<string, any>): string {
  const query = serializeParams(params);
  if (url.startsWith('http')) {
    return query ? `${url}?${query}` : url;
  }
  const base = baseURL.replace(/\/+$/, '');
  const path = url.startsWith('/') ? url : `/${url}`;
  return query ? `${base}${path}?${query}` : `${base}${path}`;
}

async function buildNativeHeaders(
  client: ApiClient,
  url: string,
  config?: RequestConfig,
): Promise<{ headers: Record<string, string>; skipCookies: boolean }> {
  const { anonymousMode } = useAuthStore.getState();
  // 无痕模式：任何 B 站请求都不携带账号 Cookie/access_key（登录响应由 JS 手动落盘）。
  const skipCookies = anonymousMode;
  const headers: Record<string, string> = {
    'User-Agent': USER_AGENT,
    'Accept-Encoding': 'gzip, deflate',
    ...BASE_HEADERS,
  };

  if (client.baseURL.includes('app.bilibili.com')) {
    headers['app-key'] = 'android64';
    headers['x-bili-aurora-zone'] = 'sh001';
    headers['x-bili-trace-id'] = TRACE_ID;
    headers['x-bili-mid'] = getAccessKey() && !anonymousMode ? '1' : '0';
  }

  if (config?.headers) {
    const customHeaders = config.headers as Record<string, any>;
    Object.entries(customHeaders).forEach(([key, value]) => {
      if (value != null) headers[key] = String(value);
    });
  }
  return { headers, skipCookies };
}

async function nativeRequestOptions(
  client: ApiClient,
  url: string,
  method: string,
  params?: Record<string, any>,
  config?: RequestConfig,
  data?: any,
): Promise<{ options: NativeRequestOptions; bodyData?: Uint8Array }> {
  const baseURL = client.baseURL || '';
  let finalParams = (config?.params as Record<string, any> | undefined) ?? params;
  const { anonymousMode } = useAuthStore.getState();
  if (anonymousMode && finalParams) {
    finalParams = stripIdentityFields(finalParams);
  }
  if (baseURL.includes('app.bilibili.com') && finalParams && !('sign' in finalParams)) {
    finalParams = await signAppParamsAsync(finalParams);
  }
  const fullUrl = buildNativeURL(baseURL, url, finalParams);

  const { headers, skipCookies } = await buildNativeHeaders(client, url, config);
  let body: string | undefined;
  let bodyData: Uint8Array | undefined;
  const wantsBinary = config?.responseType === 'arraybuffer';
  if (data instanceof Uint8Array || data instanceof ArrayBuffer) {
    bodyData = data instanceof Uint8Array ? data : new Uint8Array(data);
  } else if (typeof data === 'string') {
    body = anonymousMode ? stripIdentityFieldsFromForm(data) : data;
  } else if (data != null) {
    const safeData = anonymousMode ? stripIdentityFields(data as Record<string, any>) : data;
    const contentTypeKey = Object.keys(headers).find(
      (key) => key.toLowerCase() === 'content-type',
    );
    const contentType = contentTypeKey ? headers[contentTypeKey].toLowerCase() : '';
    if (contentType.includes('application/x-www-form-urlencoded')) {
      body = formBodyStrict(safeData as Record<string, any>);
    } else {
      if (!contentTypeKey) headers['Content-Type'] = 'application/json';
      body = JSON.stringify(safeData);
    }
  }

  const options = buildNativeRequestOptions({
    url: fullUrl,
    method,
    headers,
    ...(body === undefined ? {} : { body }),
    skipCookies,
    timeoutMs: client.timeout || DEFAULT_TIMEOUT,
    responseType: wantsBinary ? 'arraybuffer' : (config?.responseType ?? 'json'),
  });
  if (config?.cancelToken) {
    options.requestId = config.cancelToken.id;
  }
  return { options, bodyData };
}

function stripIdentityFieldsFromForm(encoded: string): string {
  const params = new URLSearchParams(encoded);
  for (const key of IDENTITY_PARAM_KEYS) {
    params.delete(key);
  }
  return params.toString();
}

async function nativeRequest<T = any>(
  client: ApiClient,
  url: string,
  method: string,
  params?: Record<string, any>,
  config?: RequestConfig,
  data?: any,
): Promise<T> {
  const { options, bodyData } = await nativeRequestOptions(client, url, method, params, config, data);
  const cancelToken = config?.cancelToken;
  if (cancelToken?.aborted) throw new Error('请求已取消');
  if (cancelToken) {
    cancelToken.onAbort(() => {
      void cancelNativeRequest(cancelToken.id);
    });
  }
  const isBinaryResponse = config?.responseType === 'arraybuffer';
  const binaryBody = bodyData ?? new Uint8Array(0);

  // rawResponse 需要状态码与响应头（gRPC 依赖 grpc-status），由原生直接返回 Data。
  if (config?.rawResponse && isBinaryResponse) {
    const result = await nativeBinaryRequestWithHeadersAsync(options, binaryBody);
    if (!result) throw new Error('原生请求无响应');
    if (!result.ok) throw new Error(`原生请求失败: HTTP ${result.status}`);
    return {
      status: result.status,
      headers: result.headers,
      data: toArrayBuffer(result.data),
    } as T;
  }

  if (isBinaryResponse) {
    const bytes = await nativeBinaryRequestAsync(options, binaryBody);
    if (!bytes) throw new Error('原生请求无响应');
    return toArrayBuffer(bytes) as T;
  }

  const result = await nativeRequestAsync(options, binaryBody);
  if (!result) throw new Error('原生请求无响应');
  if (!result.ok) throw new Error(`原生请求失败: HTTP ${result.status}`);

  if (config?.rawResponse) {
    return {
      status: result.status,
      headers: result.headers,
      data: result.data || {},
    } as T;
  }

  return (result.data || {}) as T;
}

export async function get<T = any>(
  client: ApiClient,
  url: string,
  params?: Record<string, any>,
  config?: RequestConfig,
): Promise<T> {
  return nativeRequest<T>(client, url, 'GET', params, config, undefined);
}

export async function post<T = any>(
  client: ApiClient,
  url: string,
  data?: any,
  params?: Record<string, any>,
  config?: RequestConfig,
): Promise<T> {
  return nativeRequest<T>(client, url, 'POST', params, config, data);
}

export async function getWbi<T = any>(
  client: ApiClient,
  url: string,
  params?: Record<string, any>,
  config?: RequestConfig,
): Promise<T> {
  const { wbiSignQuery } = await import('@/utils/wbi-sign');
  const signedParams = await wbiSignQuery(params || {});
  return get<T>(client, url, signedParams, config);
}

function createClient(baseURL: string): ApiClient {
  return {
    baseURL,
    timeout: DEFAULT_TIMEOUT,
    headers: {
      'User-Agent': USER_AGENT,
      'Accept-Encoding': 'gzip, deflate',
      ...BASE_HEADERS,
    },
  };
}

// Main API client
export const apiClient = createClient(HttpString.apiBaseUrl);

// App API client
export const appClient = createClient(HttpString.appBaseUrl);

// Live API client
export const liveClient = createClient(HttpString.liveBaseUrl);

// Passport client
export const passClient = createClient(HttpString.passBaseUrl);

// Message client
export const msgClient = createClient(HttpString.messageBaseUrl);

// T URL client (dynamics etc)
export const tClient = createClient(HttpString.tUrl);

// SponsorBlock client
