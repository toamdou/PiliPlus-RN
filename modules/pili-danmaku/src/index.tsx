import React from 'react';
import { type ViewProps } from 'react-native';
import {
  requireNativeModule,
  requireNativeViewManager,
} from 'expo-modules-core';

export type DanmakuMode = 'scroll' | 'top' | 'bottom';

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
  /** 01-M3（P1）：原生侧 prepared 结果（6000 条上屏条目）的引用 token，条目整体留在原生 */
  token: string;
  density: { start: number; end: number; level: number }[];
};

export type DanmakuTapEvent = {
  id: string;
  text: string;
  time: number;
  mode: DanmakuMode;
};

type PiliDanmakuOverlayProps = ViewProps & {
  /** 01-M3（P1）：原生 prepared 结果 token，替代整包 items 过桥 */
  itemsRef?: string;
  visible?: boolean;
  density?: number;
  height?: number;
  opacity?: number;
  speed?: number;
  lineHeight?: number;
  /** 批次5 P1：弹幕显示区域比例（0~1），原生按此收敛轨道高度（底部弹幕锚定区域底边） */
  area?: number;
  /** 批次5 P1：描边粗细（pt，0=关闭描边，退回软阴影） */
  strokeWidth?: number;
  /** 批次5 P1：描边颜色（hex） */
  strokeColor?: string;
  /** 批次5 P1：按类型屏蔽的弹幕模式集合（scroll/top/bottom），原生 spawn 时跳过 */
  blockModes?: DanmakuMode[];
  /** 批次5 P1：屏蔽彩色弹幕（强制转白，对齐 Flutter blockColorful） */
  blockColorful?: boolean;
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
  releaseDanmakuRefAsync(token: string): Promise<void>;
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

/** 01-M3（P1）：释放 token 引用的原生 prepared 结果（页面卸载时调用）。 */
export async function releaseDanmakuRefAsync(token: string): Promise<void> {
  if (!token) return;
  await NativeModule.releaseDanmakuRefAsync(token).catch(() => {});
}

export async function loadSubtitleJsonAsync(url: string): Promise<SubtitleItem[]> {
  return NativeModule.loadSubtitleJsonAsync(url);
}

const NativeDanmakuOverlay = requireNativeViewManager('PiliDanmaku', 'PiliDanmakuOverlayView');
const NativeSubtitleOverlay = requireNativeViewManager('PiliDanmaku', 'PiliSubtitleView');

export function PiliDanmakuOverlay(props: PiliDanmakuOverlayProps) {
  const {
    itemsRef,
    visible = true,
    density = 1,
    height = 220,
    opacity = 1,
    speed = 8,
    lineHeight = 1.6,
    area = 1,
    strokeWidth = 0,
    strokeColor = '#000000',
    blockModes = [],
    blockColorful = false,
    interactive = false,
    onDanmakuTap,
    ...viewProps
  } = props;

  return (
    <NativeDanmakuOverlay
      {...viewProps}
      itemsRef={itemsRef ?? ''}
      visible={visible}
      density={density}
      height={height}
      opacity={opacity}
      speed={speed}
      lineHeight={lineHeight}
      area={area}
      strokeWidth={strokeWidth}
      strokeColor={strokeColor}
      blockModes={blockModes}
      blockColorful={blockColorful}
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
