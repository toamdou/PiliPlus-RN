import { HttpString } from './constants';
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
  /** 业务 code!==0 时抛 ApiError（默认不抛，保持既有 res?.code 判断兼容） */
  strictCode?: boolean;
}

/** 统一网络错误结构（批次2#21 API 侧）：HTTP 非 2xx / strictCode 业务错误均抛此类型。 */
export class ApiError extends Error {
  readonly code: number;
  readonly status: number;
  readonly data?: any;
  constructor(code: number, message: string, status = -1, data?: any) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.data = data;
  }
}

function serializeParams(params?: Record<string, any>): string {
  return params ? formBody(params) : '';
}

const IDENTITY_PARAM_KEYS = new Set(['access_key', 'csrf', 'csrf_token', 'bili_jct']);

/** web 请求 UA（对齐 Flutter init.dart：Dart/3.6），消除安卓 BiliDroid UA 混搭指纹（03-R2） */
const WEB_UA = 'Dart/3.6 (dart:io)';

/** 生成 x-bili-aurora-eid（对齐 Flutter IdUtils.genAuroraEid：mid 逐字节异或 + base64 去 '='） */
function genAuroraEid(mid: number): string {
  if (!mid || mid <= 0) return '';
  const bytes = new TextEncoder().encode(String(mid));
  const key = 'ad1va46a7lza';
  for (let i = 0; i < bytes.length; i++) bytes[i] ^= key.charCodeAt(i % key.length);
  try {
    return btoa(String.fromCharCode(...bytes)).replace(/=+$/, '');
  } catch {
    return '';
  }
}

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
  const baseURL = client.baseURL || '';
  // R2（03-1.3）：风控指纹头对全部 bilibili 域统一注入（Flutter baseHeaders），
  // 消除 api.bilibili.com / api.vc / message 缺头导致的间歇性 -352 空数据。
  const headers: Record<string, string> = {
    'User-Agent': WEB_UA,
    'Accept-Encoding': 'gzip, deflate',
    'env': 'prod',
    'app-key': 'android64',
    'x-bili-aurora-zone': 'sh001',
    ...BASE_HEADERS,
  };

  // 登录态指纹：x-bili-mid 用真实 mid 数字（不再是布尔字符串），并补 aurora-eid。
  const auth = useAuthStore.getState();
  const mid = auth.userInfo?.mid;
  if (!anonymousMode && mid && mid > 0) {
    headers['x-bili-mid'] = String(mid);
    const eid = genAuroraEid(mid);
    if (eid) headers['x-bili-aurora-eid'] = eid;
  }

  if (baseURL.includes('app.bilibili.com')) {
    // app 域仍用安卓客户端 UA，配合 appSign 与 app-key 头
    headers['User-Agent'] = USER_AGENT;
    headers['x-bili-trace-id'] = TRACE_ID;
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
    if (!result.ok) throw new ApiError(result.status, `请求失败: HTTP ${result.status}`, result.status);
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

  // 错误归一化（批次2#21 API 侧）：HTTP 非 2xx 统一抛 ApiError（带 code+message+status），
  // 兼容既有 catch；业务 code!==0 保持返回 body（调用方 res?.code 判断不受影响）。
  if (!result.ok) {
    const body: any = result.data && typeof result.data === 'object' ? result.data : null;
    const code = typeof body?.code === 'number' ? body.code : -1;
    const message = body?.message || `请求失败: HTTP ${result.status}`;
    throw new ApiError(code, message, result.status, body);
  }

  if (config?.rawResponse) {
    return {
      status: result.status,
      headers: result.headers,
      data: result.data || {},
    } as T;
  }

  const body: any = result.data || {};
  if (config?.strictCode && typeof body?.code === 'number' && body.code !== 0) {
    throw new ApiError(body.code, body.message || `业务错误 code=${body.code}`, result.status, body);
  }
  return body as T;
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
