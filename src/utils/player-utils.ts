import { useSettingsStore } from '@/stores/settings';
import { randomBase64StringAsync } from 'pili-native-core';

export { formatDuration as formatPlayerTime } from '@/utils/format';

export const IPHONE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';

export const PLAYER_HEADERS = {
  Referer: 'https://www.bilibili.com',
  'User-Agent': IPHONE_UA,
} as const;

/** B 站 qn → AVPlayer 分辨率/码率上限（仅用于降低解码/流量，不做硬性画质选择）。 */
const QUALITY_STREAMING_LIMITS: Record<number, { maxWidth: number; maxHeight: number; peakBitRate: number }> = {
  16: { maxWidth: 640, maxHeight: 360, peakBitRate: 600_000 },
  32: { maxWidth: 854, maxHeight: 480, peakBitRate: 1_000_000 },
  64: { maxWidth: 1280, maxHeight: 720, peakBitRate: 2_500_000 },
  80: { maxWidth: 1920, maxHeight: 1080, peakBitRate: 6_000_000 },
  112: { maxWidth: 1920, maxHeight: 1080, peakBitRate: 8_000_000 },
  116: { maxWidth: 1920, maxHeight: 1080, peakBitRate: 8_000_000 },
  120: { maxWidth: 3840, maxHeight: 2160, peakBitRate: 15_000_000 },
  125: { maxWidth: 3840, maxHeight: 2160, peakBitRate: 15_000_000 },
  126: { maxWidth: 3840, maxHeight: 2160, peakBitRate: 15_000_000 },
  127: { maxWidth: 3840, maxHeight: 2160, peakBitRate: 25_000_000 },
};

export function qualityStreamingLimits(qn: number) {
  return QUALITY_STREAMING_LIMITS[qn] ?? QUALITY_STREAMING_LIMITS[80];
}

/** 直播 qn → AVPlayer 上限；10000/40000 为原画/HEVC 原画，不主动限到点播档位。 */
const LIVE_QUALITY_STREAMING_LIMITS: Record<number, { maxWidth: number; maxHeight: number; peakBitRate: number }> = {
  10000: { maxWidth: 3840, maxHeight: 2160, peakBitRate: 20_000_000 },
  40000: { maxWidth: 3840, maxHeight: 2160, peakBitRate: 25_000_000 },
  400: { maxWidth: 1920, maxHeight: 1080, peakBitRate: 8_000_000 },
  250: { maxWidth: 1280, maxHeight: 720, peakBitRate: 4_000_000 },
  150: { maxWidth: 854, maxHeight: 480, peakBitRate: 2_000_000 },
  80: { maxWidth: 640, maxHeight: 360, peakBitRate: 1_000_000 },
};

export function liveQualityStreamingLimits(qn: number) {
  return LIVE_QUALITY_STREAMING_LIMITS[qn] ?? LIVE_QUALITY_STREAMING_LIMITS[80];
}

/**
 * CDN 服务 host 映射
 */
const CDN_HOSTS: Record<string, string[]> = {
  ali: ['upos-sz-mirrorali.bilivideo.com', 'upos-sz-mirroralib.bilivideo.com'],
  tx: ['upos-sz-mirrortx.bilivideo.com', 'upos-sz-mirrortxb.bilivideo.com'],
  hw: ['upos-sz-mirrorhw.bilivideo.com', 'upos-sz-mirrorhwb.bilivideo.com'],
  bd: ['upos-sz-mirrorbd.bilivideo.com', 'upos-sz-mirrorbdb.bilivideo.com'],
  default: [],
};

/**
 * 根据设置的 CDN 服务替换视频 URL 中的 host
 */
function applyCdn(url: string): string {
  const s = useSettingsStore.getState();
  if (s.cdnService === 'default' || !url) return url;
  const hosts = CDN_HOSTS[s.cdnService];
  if (!hosts || hosts.length === 0) return url;
  try {
    const parsed = new URL(url);
    parsed.hostname = hosts[0];
    return parsed.toString();
  } catch {
    return url;
  }
}

/**
 * 根据设置的解码格式偏好选择视频流
 * dash.video 数组中每个项有 codecs 字段 (如 "avc1.640032", "hev1.1.6.L120.90")
 */
function selectVideoByCodec(videos: any[]): any | null {
  if (!videos || videos.length === 0) return null;
  const s = useSettingsStore.getState();
  const codec = s.preferCodec;

  if (codec === 'hevc') {
    const hevc = videos.find((v) => v.codecs?.startsWith('hev') || v.codecs?.startsWith('hvc'));
    if (hevc) return hevc;
  } else if (codec === 'av1') {
    const av1 = videos.find((v) => v.codecs?.startsWith('av01'));
    if (av1) return av1;
  }
  // 默认 avc 或找不到偏好时
  const avc = videos.find((v) => v.codecs?.startsWith('avc'));
  return avc || videos[0];
}

/**
 * 生成随机 base64 形状字符串（长度在 [min, max] 区间）
 * 用于 playurl 接口的风控参数 dm_img_str / dm_cover_img_str（对齐 Flutter Utils.base64EncodeRandomString）
 */
export async function randomBase64String(min: number, max: number): Promise<string> {
  const len = min + Math.floor(Math.random() * Math.max(1, max - min));
  return randomBase64StringAsync(len);
}

/** B 站 web/WBI 接口共用风控参数（dm_img_*，对齐 Flutter）。 */
export async function buildDmRiskParams(): Promise<Record<string, string>> {
  return {
    dm_img_list: '[]',
    dm_img_str: await randomBase64String(16, 64),
    dm_cover_img_str: await randomBase64String(32, 128),
    dm_img_inter: '{"ds":[],"wh":[0,0,0],"of":[0,0,0]}',
  };
}

/**
 * 从播放数据中获取最佳播放 URL
 * 优先 durl（progressive MP4 合流，iOS AVPlayer 可直接播放），
 * 回退 DASH video（仅视频流，iOS 无法播放分离的 DASH，仅作兜底）
 */
export function getBestPlayUrl(dashData: any): string {
  if (!dashData) return '';
  // 优先 durl（音视频合并的渐进式 MP4）
  const durl = dashData.durl;
  if (Array.isArray(durl) && durl.length > 0) {
    for (const seg of durl) {
      if (seg?.url) return applyCdn(seg.url);
      // 主 URL 缺失时尝试备份 CDN
      const backup = seg?.backup_url;
      if (Array.isArray(backup) && backup.length > 0 && backup[0]) return applyCdn(backup[0]);
    }
  }
  // 回退 DASH video（仅视频流，无音频）
  if (dashData.dash?.video) {
    const video = selectVideoByCodec(dashData.dash.video);
    const base = video?.baseUrl || video?.base_url;
    if (base) return applyCdn(base);
  }
  return '';
}

/**
 * 获取播放器配置（从设置中读取）
 */
export function getPlayerConfig() {
  const s = useSettingsStore.getState();
  return {
    autoPlay: s.autoPlay,
    playOnWifi: s.playOnWifi,
    enableAutoEnter: s.enableAutoEnter,
    enableAutoExit: s.enableAutoExit,
    continuePlayInBackground: s.continuePlayInBackground,
    fullScreenMode: s.fullScreenMode,
    btmProgressBehavior: s.btmProgressBehavior,
    playRepeat: s.playRepeat,
    showFSLockBtn: s.showFSLockBtn,
    showFsScreenshotBtn: s.showFsScreenshotBtn,
    showFSActionItem: s.showFSActionItem,
    enableOnlineTotal: s.enableOnlineTotal,
    showSeekPreview: s.showSeekPreview,
    enableShrinkVideoSize: s.enableShrinkVideoSize,
    enableVerticalExpand: s.enableVerticalExpand,
    fullScreenGestureReverse: s.fullScreenGestureReverse,
    enableQuickDouble: s.enableQuickDouble,
    fastForBackwardDuration: s.fastForBackwardDuration,
    enableSlideVolumeBrightness: s.enableSlideVolumeBrightness,
    enableSlideFS: s.enableSlideFS,
    sliderDuration: s.sliderDuration,
    playerVolume: s.playerVolume,
    subtitlePreference: s.subtitlePreference,
    bufferSize: s.bufferSize,
    bufferSec: s.bufferSec,
  };
}
