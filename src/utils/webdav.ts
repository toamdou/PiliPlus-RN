import { Platform } from 'react-native';
import { buildNativeRequestOptions } from '@/utils/native-request';
import {
  nativeRequestAsync,
  type NativeRequestResult,
} from 'pili-native-core';

export interface WebDavConfig {
  uri: string;
  username: string;
  password: string;
  directory: string;
}

export const SETTINGS_BACKUP_FILE = `piliplus_settings_${Platform.OS}.json`;

const STATUS_MESSAGES: Record<number, string> = {
  401: '认证失败',
  403: '没有访问权限',
  404: '文件不存在',
  405: '服务器不支持该操作',
  409: '目标路径已存在',
  412: '前置条件不满足',
};

function encodeCredentials(username: string, password: string): string {
  const raw = `${username}:${password}`;
  const bytes = encodeURIComponent(raw).replace(/%([0-9A-F]{2})/g, (_, hex: string) =>
    String.fromCharCode(parseInt(hex, 16)),
  );
  return btoa(bytes);
}

function buildUrl(config: WebDavConfig, filename: string): string {
  const base = config.uri.trim().replace(/\/+$/, '');
  if (!base) throw new Error('WebDAV 地址不能为空');
  const directory = config.directory.trim() || '/';
  const segments = directory
    .split('/')
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment));
  segments.push(encodeURIComponent(filename));
  return `${base}/${segments.join('/')}`;
}

async function request(
  config: WebDavConfig,
  filename: string,
  method: 'PUT' | 'GET',
  body?: string,
): Promise<{ status: number; data: string }> {
  const url = buildUrl(config, filename);
  const options = buildNativeRequestOptions({
    url,
    method,
    headers: {
      Authorization: `Basic ${encodeCredentials(config.username || '', config.password || '')}`,
      Accept: '*/*',
      ...(body === undefined ? {} : { 'Content-Type': 'application/json; charset=utf-8' }),
    },
    ...(body === undefined ? {} : { body }),
    timeoutMs: 10_000,
    responseType: 'text',
  });

  let result: NativeRequestResult;
  try {
    result = await nativeRequestAsync(options);
  } catch (e) {
    throw new Error(`WebDAV ${method} 请求失败：${e instanceof Error ? e.message : String(e)}`);
  }

  const data = typeof result.data === 'string' ? result.data : '';
  if (!result.ok) {
    const known = STATUS_MESSAGES[result.status] ? `（${STATUS_MESSAGES[result.status]}）` : '';
    const detail = data ? data.replace(/\s+/g, ' ').trim().slice(0, 160) : '';
    throw new Error(
      `WebDAV ${method} 失败：${result.status}${known}${detail ? `：${detail}` : ''}`,
    );
  }

  return { status: result.status, data };
}

export async function webdavPut(config: WebDavConfig, filename: string, text: string): Promise<void> {
  await request(config, filename, 'PUT', text);
}

export async function webdavGet(config: WebDavConfig, filename: string): Promise<string> {
  const response = await request(config, filename, 'GET');
  return response.data;
}
