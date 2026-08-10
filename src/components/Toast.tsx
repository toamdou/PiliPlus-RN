import { useEffect } from 'react';
import { showToastAsync } from 'pili-native-core';
import { setToastListener } from '@/utils/toast';

const TOAST_DURATION_MS = 1600;

/** 根布局挂载的 Toast 入口；提示统一由原生 PiliToastOverlay 展示。 */
export function Toast() {
  useEffect(() => {
    const show = (msg: string) => {
      void showToastAsync(msg, TOAST_DURATION_MS).catch(() => {});
    };
    setToastListener(show);
    return () => setToastListener(null);
  }, []);
  return null;
}
