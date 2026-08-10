import { Image } from 'expo-image';
import { clearCacheFiles, clearNetworkCaches } from 'pili-native-core';

/** 清空 expo-image、原生 URLSession/URLCache 与应用 cache 目录。 */
export async function clearAppCaches(): Promise<void> {
  await Promise.all([
    Image.clearDiskCache(),
    Image.clearMemoryCache(),
    clearNetworkCaches(),
  ]);
  await clearCacheFiles();
}
