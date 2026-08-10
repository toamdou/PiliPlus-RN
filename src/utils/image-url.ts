/**
 * image-url —— B 站图片 CDN 缩放工具。
 *
 * B 站封面等图片 URL 支持追加 `@w_h_1c.webp` 及 `@w_h_80q.webp` 缩放参数（CDN 端缩放），
 * 信息流按显示尺寸请求 2x 缩略图：网络传输、解码像素、内存占用三重下降
 * （原图通常 1080p+，解码为 ARGB8888 单张可达 8MB+）。
 */

import { useSettingsStore } from '@/stores/settings';

/** 默认显示宽度：immersive 全宽卡片（390pt × 2 = 780px），compact 半宽（180pt × 2 = 360px） */
export const COVER_W = { immersive: 780, compact: 360 } as const;

const QUALITY_TAIL_RE = /_\d+q$/i;

function clampQuality(quality: number): number {
  const q = Math.round(quality);
  if (!Number.isFinite(q)) return 80;
  return Math.min(100, Math.max(0, q));
}

function applyCdnTransform(
  url: string,
  quality: number,
  width?: number,
  height?: number,
): string {
  if (!url) return url;
  const q = clampQuality(quality);
  const queryIndex = url.search(/[?#]/);
  const base = queryIndex >= 0 ? url.slice(0, queryIndex) : url;
  const query = queryIndex >= 0 ? url.slice(queryIndex) : '';
  const at = base.lastIndexOf('@');

  // 已带 CDN 参数时保留原缩放尺寸，只补齐/替换质量后缀
  if (at >= 0) {
    const prefix = base.slice(0, at);
    let params = base.slice(at + 1);
    const extMatch = /(\.[a-zA-Z0-9]+)$/.exec(params);
    const ext = extMatch ? extMatch[1] : '';
    if (ext) params = params.slice(0, -ext.length);
    params = params.replace(QUALITY_TAIL_RE, '');
    const tail = q >= 100 ? '' : `_${q}q`;
    return `${prefix}@${params}${tail}${ext}${query}`;
  }

  if (width == null) {
    return q >= 100 ? url : `${base}@${q}q.webp${query}`;
  }

  const size = `${width}w${height ? `_${height}h` : ''}`;
  return q >= 100
    ? `${base}@${size}_1c.webp${query}`
    : `${base}@${size}_1c_${q}q.webp${query}`;
}

/**
 * 为 B 站图片 URL 追加 CDN 缩放参数（webp 输出）。
 * @param url 原图 URL（可能已带 @ 参数或 query）
 * @param w 目标宽度（px，建议 2x 显示清晰度）
 * @param h 目标高度（可选，不传保持原比例）
 */
export function biliCover(url: string, w: number, h?: number): string {
  return applyCdnTransform(url, useSettingsStore.getState().picQuality, w, h);
}

/** 查看大图时按 previewQuality 追加 CDN 质量参数，不改变原始尺寸。 */
export function biliPreview(url: string): string {
  return applyCdnTransform(url, useSettingsStore.getState().previewQuality);
}
