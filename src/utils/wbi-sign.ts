import { ensureWbiMixinKeyAsync, wbiSignAsync as nativeWbiSignAsync } from 'pili-native-core';

let fetchPromise: Promise<string> | null = null;

/** Auto-fetch WBI mixin key from bilibili nav API if not cached */
export async function ensureMixinKey(): Promise<string> {
  if (fetchPromise) return fetchPromise;
  fetchPromise = ensureWbiMixinKeyAsync().finally(() => {
    fetchPromise = null;
  });
  return fetchPromise;
}

/** WBI 签名由原生完成；失败时直接抛出，不回退 JS 实现。 */
export async function wbiSignAsync(
  params: Record<string, any>,
  mixinKey: string,
): Promise<Record<string, any>> {
  return nativeWbiSignAsync(params, mixinKey);
}

/** 取 WBI key 并签名；key 缺失时原样返回参数。 */
export async function wbiSignQuery(params: Record<string, any>): Promise<Record<string, any>> {
  const mixinKey = await ensureMixinKey();
  return mixinKey ? wbiSignAsync(params, mixinKey) : params;
}
