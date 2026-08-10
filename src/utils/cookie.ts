import { secureStorage } from './storage';
import {
  nativeClearCookiesAsync,
  nativeGetCookiesDetailedAsync,
  nativeSetCookiesAsync,
  clearNetworkCaches,
  generateBuvid3Async,
  getAccountRecords,
  setAccountRecords,
  setActiveAccount,
  clearAccountRecords,
  type NativeAccountRecord,
  type NativeAccountStore,
  type NativeDetailedCookie,
  type NativeCookieInput,
} from 'pili-native-core';
import { clearBilibiliDataAsync } from 'pili-webview';

export { clearNetworkCaches };

const ACCOUNT_COOKIE_PREFIX = 'piliplus_account_cookies_';
const BUVID3 = 'buvid3';
const ACCESS_KEY = 'access_key';
const CSRF = 'bili_jct';

/** 当前账号名用于区分启动恢复与账号切换。 */
let currentAccountName: string | null = null;
let accessKeyCache: string | undefined;
let csrfCache: string | undefined;
let credentialAnonymous = false;

/** 生成 buvid3（对齐 Flutter IdUtils.genBuvid3：UUID v4 大写 + 5位随机数 + "infoc"） */
async function genBuvid3(): Promise<string> {
  return generateBuvid3Async();
}

async function nativeCookieDetails(): Promise<NativeDetailedCookie[]> {
  return nativeGetCookiesDetailedAsync('.bilibili.com');
}

async function setNativeCookies(cookies: NativeCookieInput[]): Promise<void> {
  if (cookies.length === 0) return;
  const normalized = cookies.map((cookie) => ({
    ...cookie,
    domain: cookie.domain || '.bilibili.com',
    path: cookie.path || '/',
  }));
  await nativeSetCookiesAsync(normalized);
}

function updateCredentialCache(pairs: { name: string; value: string }[]): void {
  for (const { name, value } of pairs) {
    if (name === ACCESS_KEY) accessKeyCache = value;
    else if (name === CSRF) csrfCache = value;
  }
}

/** 确保 buvid3 已存在于 HTTPCookieStorage（首次启动生成），降低风控 -352 概率 */
async function ensureBuvid(): Promise<void> {
  const cookies = await nativeCookieDetails();
  if (!cookies.some((c) => c.name === BUVID3)) {
    await setNativeCookies([{ name: BUVID3, value: await genBuvid3() }]);
  }
}

/** 旧版 SecureStore key 仅允许字母数字与 .-_，账号名统一做 UTF-8 hex 编码。 */
function accountCookieKey(name: string): string {
  const bytes = new TextEncoder().encode(name);
  let hex = '';
  for (const byte of bytes) {
    hex += byte.toString(16).padStart(2, '0');
  }
  return `${ACCOUNT_COOKIE_PREFIX}${hex}`;
}

function parseSnapshot(raw: string): NativeCookieInput[] {
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      const cookies: NativeCookieInput[] = [];
      for (const item of parsed) {
        if (!item || typeof item.name !== 'string' || typeof item.value !== 'string') continue;
        const cookie: NativeCookieInput = { name: item.name, value: item.value };
        if (typeof item.domain === 'string' && item.domain) cookie.domain = item.domain;
        if (typeof item.path === 'string' && item.path) cookie.path = item.path;
        if (typeof item.expires === 'number') cookie.expires = item.expires;
        if (typeof item.secure === 'boolean') cookie.secure = item.secure;
        if (typeof item.httpOnly === 'boolean') cookie.httpOnly = item.httpOnly;
        if (item.sameSite === 'strict' || item.sameSite === 'lax' || item.sameSite === 'none') {
          cookie.sameSite = item.sameSite;
        }
        cookies.push(cookie);
      }
      return cookies;
    }
    if (parsed && typeof parsed === 'object') {
      return Object.entries(parsed).map(([name, value]) => ({ name, value: String(value ?? '') }));
    }
  } catch {}
  return [];
}

/** 旧版 SecureStore cookie 快照迁移为原生账号记录内的 cookies 字段。 */
async function migrateLegacyCookieSnapshot(name: string): Promise<NativeCookieInput[] | null> {
  const raw = await secureStorage.get(accountCookieKey(name));
  if (!raw) return null;
  const parsed = parseSnapshot(raw);
  await secureStorage.remove(accountCookieKey(name));
  return parsed;
}

// MARK: - Native account store helpers

export async function readAccountStore(): Promise<NativeAccountStore | null> {
  return getAccountRecords();
}

export async function writeAccountStore(store: NativeAccountStore): Promise<boolean> {
  return setAccountRecords(store.records, store.currentIndex, store.anonymousMode);
}

export async function writeActiveAccount(
  key: string,
  store: NativeAccountStore,
  cookies: NativeCookieInput[],
): Promise<boolean> {
  return setActiveAccount(key, store.records, store.currentIndex, store.anonymousMode, cookies);
}

export async function clearAccountStore(): Promise<boolean> {
  return clearAccountRecords();
}

export function accountRecordFromAccount(
  account: { mid: number; name: string; face: string; accessKey: string; userInfo: Record<string, any> },
  cookies?: NativeCookieInput[],
): NativeAccountRecord {
  return {
    mid: account.mid,
    name: account.name,
    face: account.face,
    accessKey: account.accessKey,
    userInfo: account.userInfo,
    ...(cookies ? { cookies } : {}),
  };
}

export async function loadCookies(): Promise<void> {
  const store = await readAccountStore();
  const savedKey = store?.activeAccessKey || (await secureStorage.get('access_key')) || undefined;
  if (savedKey) accessKeyCache = savedKey;
  await ensureBuvid();
  updateCredentialCache(await nativeCookieDetails());
}

export async function setCookie(name: string, value: string): Promise<void> {
  await setNativeCookies([{ name, value }]);
  updateCredentialCache([{ name, value }]);
}

/** 保存当前账号的 Cookie 快照（按账号名隔离）。 */
export async function saveCookiesForAccount(name: string, fallbackAccessKey?: string): Promise<void> {
  if (!name) return;
  const store = await readAccountStore();
  if (!store) return;
  const index = store.records.findIndex((record) => record.name === name);
  if (index < 0) return;

  await ensureBuvid();
  let cookies: NativeCookieInput[] = (await nativeCookieDetails()).map((cookie) => ({
    name: cookie.name,
    value: cookie.value,
    domain: cookie.domain,
    path: cookie.path,
    ...(cookie.expires != null ? { expires: cookie.expires } : {}),
    ...(cookie.secure ? { secure: true } : {}),
    ...(cookie.httpOnly ? { httpOnly: true } : {}),
    ...(cookie.sameSite !== 'none' ? { sameSite: cookie.sameSite } : {}),
  }));
  if (fallbackAccessKey && !cookies.some((c) => c.name === ACCESS_KEY)) {
    cookies.push({ name: ACCESS_KEY, value: fallbackAccessKey });
    await setNativeCookies([{ name: ACCESS_KEY, value: fallbackAccessKey }]);
    updateCredentialCache([{ name: ACCESS_KEY, value: fallbackAccessKey }]);
  }
  const legacy = await migrateLegacyCookieSnapshot(name);
  if (cookies.length === 0 && legacy && legacy.length > 0) {
    cookies = legacy;
  }

  const record = store.records[index];
  record.cookies = cookies;
  store.records[index] = record;
  await writeAccountStore(store);
}

/** 切换为指定账号的 Cookie 集合；启动恢复时保留原生已生效的新值。 */
export async function loadCookiesForAccount(name: string, fallbackAccessKey?: string): Promise<void> {
  if (!name) return;
  const store = await readAccountStore();
  const record = store?.records.find((r) => r.name === name);
  const snapshot = record?.cookies ? [...record.cookies] : [];
  if (fallbackAccessKey && !snapshot.some((c) => c.name === ACCESS_KEY)) {
    snapshot.push({ name: ACCESS_KEY, value: fallbackAccessKey });
    if (record && store) {
      record.cookies = snapshot;
      await writeAccountStore(store);
    }
  }

  const switching = currentAccountName !== name;
  if (switching) {
    await nativeClearCookiesAsync();
    await clearBilibiliDataAsync().catch(() => {});
    await clearNetworkCaches().catch(() => {});
  }
  await ensureBuvid();

  const existing = switching ? [] : await nativeCookieDetails();
  const existingNames = new Set(existing.map((c) => c.name));
  await setNativeCookies(snapshot.filter((c) => !existingNames.has(c.name)));

  currentAccountName = name;
  updateCredentialCache(await nativeCookieDetails());
}

/** 删除指定账号的 Cookie 快照。 */
export async function clearCookiesForAccount(name: string): Promise<void> {
  if (!name) return;
  const store = await readAccountStore();
  if (!store) return;
  const index = store.records.findIndex((record) => record.name === name);
  if (index < 0) return;
  store.records[index].cookies = [];
  await writeAccountStore(store);
}

/** 账号改名后迁移 Cookie 快照。 */
export async function renameCookies(oldName: string, newName: string): Promise<void> {
  if (!oldName || !newName || oldName === newName) return;
  const store = await readAccountStore();
  if (store) {
    const index = store.records.findIndex((record) => record.name === oldName);
    if (index >= 0) {
      store.records[index].name = newName;
      await writeAccountStore(store);
    }
  }
  await migrateLegacyCookieSnapshot(oldName);
  if (currentAccountName === oldName) currentAccountName = newName;
}

export async function clearCookies(): Promise<void> {
  await nativeClearCookiesAsync();
  await clearBilibiliDataAsync().catch(() => {});
  await clearNetworkCaches().catch(() => {});
  accessKeyCache = undefined;
  csrfCache = undefined;
  credentialAnonymous = false;
  currentAccountName = null;
}

export function getAccessKey(): string | undefined {
  return credentialAnonymous ? undefined : accessKeyCache;
}

export function getCSRF(): string | undefined {
  return credentialAnonymous ? undefined : csrfCache;
}

/** 匿名模式（无痕）下让凭据 getter 返回 undefined，避免 csrf/access_key 继续注入请求。 */
export function setCredentialAnonymous(value: boolean): void {
  credentialAnonymous = value;
}
