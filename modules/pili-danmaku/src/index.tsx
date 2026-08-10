import React, { useMemo } from 'react';
import { type ViewProps } from 'react-native';
import {
  requireNativeModule,
  requireNativeViewManager,
} from 'expo-modules-core';

type DanmakuMode = 'scroll' | 'top' | 'bottom';

type NativeDanmakuItem = {
  id?: string | number;
  text: string;
  time: number;
  duration: number;
  color: string;
  fontSize: number;
  mode: DanmakuMode;
  /** JS 已分配好的轨道顶部偏移；缺省时原生用 cursor 分配 */
  top?: number;
};

export type DanmakuLoadOptions = {
  duration: number;
  merge: boolean;
  keywords: string[];
  regexps: string[];
  users: string[];
  showVipDm: boolean;
  dmFontSize: number;
  dmSpeed: number;
  staticDuration: number;
  maxResident: number;
  densityBucketSec: number;
  densityMinLevel: number;
  skipCookies?: boolean;
};

export type PreparedDanmaku = {
  items: NativeDanmakuItem[];
  density: { start: number; end: number; level: number }[];
};

export type DanmakuTapEvent = {
  id: string;
  text: string;
  time: number;
  mode: DanmakuMode;
};

type PiliDanmakuOverlayProps = ViewProps & {
  items: NativeDanmakuItem[];
  visible?: boolean;
  density?: number;
  height?: number;
  opacity?: number;
  speed?: number;
  lineHeight?: number;
  interactive?: boolean;
  onDanmakuTap?: (event: DanmakuTapEvent) => void;
};

type SubtitleItem = {
  from: number;
  to: number;
  content: string;
};

type PiliSubtitleOverlayProps = ViewProps & {
  subtitles: SubtitleItem[];
  visible?: boolean;
  fontSizeScale?: number;
  strokeWidth?: number;
  fontWeight?: number;
  paddingHorizontal?: number;
  paddingBottom?: number;
  backgroundOpacity?: number;
};

type NativeDanmakuModule = {
  bindPlayer(player: number | null): Promise<void>;
  loadAndPrepareAsync(
    cid: number,
    options: DanmakuLoadOptions,
    requestId: string,
  ): Promise<PreparedDanmaku>;
  cancelLoad(requestId: string): void;
  loadSubtitleJsonAsync(url: string): Promise<SubtitleItem[]>;
};

const NativeModule = requireNativeModule<NativeDanmakuModule>('PiliDanmaku');

export function bindPlayer(playerId: number | null | undefined): void {
  void NativeModule.bindPlayer(playerId ?? null).catch(() => {});
}

export async function loadAndPrepareDanmakuAsync(
  cid: number,
  options: DanmakuLoadOptions,
  requestId: string,
): Promise<PreparedDanmaku> {
  return NativeModule.loadAndPrepareAsync(cid, options, requestId);
}

export function cancelDanmakuLoadAsync(requestId: string): void {
  NativeModule.cancelLoad(requestId);
}

export async function loadSubtitleJsonAsync(url: string): Promise<SubtitleItem[]> {
  return NativeModule.loadSubtitleJsonAsync(url);
}

const NativeDanmakuOverlay = requireNativeViewManager('PiliDanmaku', 'PiliDanmakuOverlayView');
const NativeSubtitleOverlay = requireNativeViewManager('PiliDanmaku', 'PiliSubtitleView');

export function PiliDanmakuOverlay(props: PiliDanmakuOverlayProps) {
  const {
    items,
    visible = true,
    density = 1,
    height = 220,
    opacity = 1,
    speed = 8,
    lineHeight = 1.6,
    interactive = false,
    onDanmakuTap,
    ...viewProps
  } = props;

  const nativeItems = useMemo(
    () =>
      items.map((item) => ({
        ...item,
        id: item.id == null ? '' : String(item.id),
      })),
    [items],
  );

  return (
    <NativeDanmakuOverlay
      {...viewProps}
      items={nativeItems}
      visible={visible}
      density={density}
      height={height}
      opacity={opacity}
      speed={speed}
      lineHeight={lineHeight}
      interactive={interactive}
      onDanmakuTap={onDanmakuTap}
    />
  );
}

export function PiliSubtitleOverlay(props: PiliSubtitleOverlayProps) {
  const {
    subtitles,
    visible = true,
    fontSizeScale = 1,
    strokeWidth = 2,
    fontWeight = 5,
    paddingHorizontal = 24,
    paddingBottom = 24,
    backgroundOpacity = 0.67,
    ...viewProps
  } = props;

  return (
    <NativeSubtitleOverlay
      {...viewProps}
      subtitles={subtitles}
      visible={visible}
      fontSizeScale={fontSizeScale}
      strokeWidth={strokeWidth}
      fontWeight={fontWeight}
      paddingHorizontal={paddingHorizontal}
      paddingBottom={paddingBottom}
      backgroundOpacity={backgroundOpacity}
    />
  );
}
