import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import {
  nativeGetKeysByPrefix,
  nativeGetString,
  nativeRemoveString,
  nativeSetString,
} from 'pili-native-core';

const PREFIX = 'piliplus_';

function nativeKey(key: string): string {
  return PREFIX + key;
}

export const storage = {
  /** 原生 UserDefaults 优先；旧 AsyncStorage 值首次读到后迁入原生。 */
  async get(key: string): Promise<string | null> {
    const fullKey = nativeKey(key);
    try {
      const native = await nativeGetString(fullKey);
      if (native != null) return native;
    } catch {}
    try {
      const legacy = await AsyncStorage.getItem(fullKey);
      if (legacy != null) {
        await nativeSetString(fullKey, legacy).catch(() => {});
        return legacy;
      }
    } catch {}
    return null;
  },

  async set(key: string, value: string): Promise<void> {
    const fullKey = nativeKey(key);
    let written = false;
    try {
      await nativeSetString(fullKey, value);
      written = true;
    } catch {}
    if (written) {
      await AsyncStorage.removeItem(fullKey).catch(() => {});
    }
  },

  async remove(key: string): Promise<void> {
    const fullKey = nativeKey(key);
    try {
      await nativeRemoveString(fullKey);
    } catch {}
    await AsyncStorage.removeItem(fullKey).catch(() => {});
  },

  async getJSON<T>(key: string): Promise<T | null> {
    const raw = await this.get(key);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  },

  async setJSON(key: string, value: any): Promise<void> {
    await this.set(key, JSON.stringify(value));
  },

  /** 读取一组 key（入参不带 PREFIX），返回去前缀后的键值映射。 */
  async getMany(keys: string[]): Promise<Record<string, string | null>> {
    const out: Record<string, string | null> = {};
    await Promise.all(keys.map(async (key) => {
      out[key] = await this.get(key);
    }));
    return out;
  },

  /** 返回带指定前缀（入参不带 PREFIX）的所有 key，已去除 PREFIX。 */
  async getKeysByPrefix(prefix: string): Promise<string[]> {
    const target = PREFIX + prefix;
    const keys = new Set<string>();
    try {
      const native = await nativeGetKeysByPrefix(target);
      for (const key of native) keys.add(key);
    } catch {}
    try {
      const legacy = await AsyncStorage.getAllKeys();
      for (const key of legacy) {
        if (key.startsWith(target)) keys.add(key);
      }
    } catch {}
    return [...keys]
      .filter((key) => key.startsWith(target))
      .map((key) => key.slice(PREFIX.length));
  },
};

export const secureStorage = {
  async get(key: string): Promise<string | null> {
    try {
      return await SecureStore.getItemAsync(key);
    } catch {
      return null;
    }
  },

  async set(key: string, value: string): Promise<void> {
    try {
      await SecureStore.setItemAsync(key, value);
    } catch {}
  },

  async remove(key: string): Promise<void> {
    try {
      await SecureStore.deleteItemAsync(key);
    } catch {}
  },
};
