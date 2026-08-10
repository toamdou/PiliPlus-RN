import {
  getCapabilitiesAsync,
  isModuleAvailable,
  type EnhancementCapabilities,
  type EnhanceOptions,
} from 'pili-video-enhance';
import { useSettingsStore } from '@/stores/settings';

let cachedCapabilities: EnhancementCapabilities | null | undefined;
let capabilitiesPromise: Promise<EnhancementCapabilities | null> | null = null;

/**
 * 带缓存的增强能力检测；模块缺失 / Expo Go / 原生检测失败时返回 null。
 */
export function getEnhancementCapabilities(): Promise<EnhancementCapabilities | null> {
  if (!isModuleAvailable()) {
    return Promise.resolve(null);
  }
  if (cachedCapabilities !== undefined) {
    return Promise.resolve(cachedCapabilities);
  }
  if (!capabilitiesPromise) {
    capabilitiesPromise = getCapabilitiesAsync()
      .then((capabilities) => {
        cachedCapabilities = capabilities;
        return capabilities;
      })
      .catch(() => {
        cachedCapabilities = null;
        return null;
      })
      .finally(() => {
        capabilitiesPromise = null;
      });
  }
  return capabilitiesPromise;
}

/**
 * 从设置读取三个增强开关；全部关闭时返回 null。
 */
export function buildEnhanceOptions(): EnhanceOptions | null {
  const settings = useSettingsStore.getState();
  const options: EnhanceOptions = {};
  if (settings.enableSuperResolution) {
    options.superResolution = 'on';
  }
  if (settings.enableFrameInterpolation) {
    options.frameInterpolation = 'on';
  }
  if (settings.enableSdrToHdr) {
    options.sdrToHdr = 'on';
  }
  return options.superResolution || options.frameInterpolation || options.sdrToHdr
    ? options
    : null;
}
