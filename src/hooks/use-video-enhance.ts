import { useCallback, useEffect, useState } from 'react';
import type {
  EnhancementCapabilities,
  EnhancementError,
  EnhancementState,
} from 'pili-video-enhance';
import { useSettingsStore } from '@/stores/settings';
import { buildEnhanceOptions, getEnhancementCapabilities } from '@/utils/video-enhance';

/**
 * 全屏增强视图状态：能力检测、开关选项、失败回退。
 */
export function useVideoEnhance() {
  const enableSuperResolution = useSettingsStore((s) => s.enableSuperResolution);
  const enableFrameInterpolation = useSettingsStore((s) => s.enableFrameInterpolation);
  const enableSdrToHdr = useSettingsStore((s) => s.enableSdrToHdr);
  const [capabilities, setCapabilities] = useState<EnhancementCapabilities | null>(null);
  const [enhancementFailed, setEnhancementFailed] = useState(false);

  useEffect(() => {
    let active = true;
    getEnhancementCapabilities().then((result) => {
      if (active) {
        setCapabilities(result);
      }
    });
    return () => {
      active = false;
    };
  }, []);

  const options = buildEnhanceOptions();
  const hasEnabledOption =
    enableSuperResolution || enableFrameInterpolation || enableSdrToHdr;

  const enabled =
    !enhancementFailed &&
    capabilities != null &&
    capabilities.available &&
    hasEnabledOption &&
    options != null &&
    (
      (options.superResolution === 'on' && capabilities.superResolution.available) ||
      (options.frameInterpolation === 'on' && capabilities.frameInterpolation.available) ||
      (options.sdrToHdr === 'on' && capabilities.sdrToHdr.available)
    );

  const onError = useCallback((_error: EnhancementError) => {
    setEnhancementFailed(true);
  }, []);

  const onStateChange = useCallback((state: EnhancementState) => {
    if (state.state === 'fallingBack') {
      setEnhancementFailed(true);
    }
  }, []);

  return {
    enabled,
    capabilities,
    options,
    enhancementFailed,
    setEnhancementFailed,
    onError,
    onStateChange,
  };
}
