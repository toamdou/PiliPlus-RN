import * as Haptics from 'expo-haptics';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import type { WebBrowserOpenOptions } from 'expo-web-browser';
import { useSettingsStore } from '@/stores/settings';
import { router, type Href } from 'expo-router';
import { ACCENT } from '@/components/SwiftUIHost';
import { resolveShortLinkAsync } from 'pili-native-core';

/**
 * 根据设置触发震动反馈
 */
export function feedBack() {
  const s = useSettingsStore.getState();
  if (s.feedBackEnable) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }
}

/** 成功反馈（点赞/收藏/发送成功等有意义的完成时刻） */
export function feedBackSuccess() {
  const s = useSettingsStore.getState();
  if (s.feedBackEnable) {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }
}

/** 错误反馈（操作失败） */
export function feedBackError() {
  const s = useSettingsStore.getState();
  if (s.feedBackEnable) {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
  }
}

/** 选择反馈（分类切换/Tab切换/选项变化） */
export function feedBackSelection() {
  const s = useSettingsStore.getState();
  if (s.feedBackEnable) {
    Haptics.selectionAsync();
  }
}

/** 中等冲击（下拉刷新触发、卡片按压、重要按钮） */
export function feedBackMedium() {
  const s = useSettingsStore.getState();
  if (s.feedBackEnable) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  }
}

/** 重冲击（破坏性操作确认、长按触发） */
export function feedBackHeavy() {
  const s = useSettingsStore.getState();
  if (s.feedBackEnable) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
  }
}

/** 刚性冲击（iOS 13+ Rigid，用于精确对齐的 UI 吸附感） */
export function feedBackRigid() {
  const s = useSettingsStore.getState();
  if (s.feedBackEnable) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Rigid);
  }
}

/** 柔和冲击（iOS 13+ Soft，用于大面积柔软触碰感） */
export function feedBackSoft() {
  const s = useSettingsStore.getState();
  if (s.feedBackEnable) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft);
  }
}

/* ================= 站内链接解析 ================= */

/**
 * 解析 B 站链接为应用内路由。
 * 支持：
 *  - bilibili.com/video/(BVxxx|avxxx) → /video/[id]
 *  - space.bilibili.com/(\d+)         → /member/[mid]
 *  - live.bilibili.com/(\d+)          → /live/[roomId]
 *  - b23.tv 短链需先 resolveShortLink 再匹配
 * 返回 null 表示无法识别（应走外链）。
 */
export function parseBiliUrl(url: string): Href | null {
  if (!url) return null;
  const u = url.trim();

  // 视频：/video/BVxxx 或 /video/avxxx
  const videoMatch = u.match(/\/video\/(BV[0-9A-Za-z]+|av\d+)/i);
  if (videoMatch) return `/video/${videoMatch[1]}` as Href;

  // 用户空间：space.bilibili.com/12345
  const spaceMatch = u.match(/space\.bilibili\.com\/(\d+)/);
  if (spaceMatch) return `/member/${spaceMatch[1]}` as Href;

  // 直播间：live.bilibili.com/12345
  const liveMatch = u.match(/live\.bilibili\.com\/(\d+)/);
  if (liveMatch) return `/live/${liveMatch[1]}` as Href;

  return null;
}

/**
 * 解析 b23.tv 短链的 302 重定向目标。
 * 使用 HEAD + redirect:'manual' 读取 Location 头；
 * 失败时返回 null（调用方回退外链）。
 */
async function resolveShortLink(url: string): Promise<string | null> {
  return resolveShortLinkAsync(url);
}

/* ================= 链接打开 ================= */

/** 统一应用内浏览器入口（iOS 为 SFSafariViewController）。 */
export function openInAppBrowser(
  url: string,
  options: WebBrowserOpenOptions = {},
): Promise<void> {
  return WebBrowser.openBrowserAsync(url, {
    controlsColor: ACCENT,
    presentationStyle: WebBrowser.WebBrowserPresentationStyle.FORM_SHEET,
    ...options,
  }).then(() => undefined);
}

async function openLinkInternal(url: string, resolveShort: boolean): Promise<void> {
  const s = useSettingsStore.getState();

  let target = url;
  if (resolveShort && /b23\.tv\//.test(url)) {
    const resolved = await resolveShortLink(url);
    if (resolved) target = resolved;
  }

  if (s.openInBrowser) {
    Linking.openURL(target).catch(() => {});
    return;
  }

  const href = parseBiliUrl(target);
  if (href) {
    router.push(href);
  } else {
    openInAppBrowser(target).catch(() => {});
  }
}

/** 根据设置决定打开链接方式：外部浏览器 or 应用内。 */
export function openLink(url: string): void {
  void openLinkInternal(url, false);
}

/** 异步版本：先解析 b23.tv 短链再决定路由。 */
export function openBiliLink(url: string): Promise<void> {
  return openLinkInternal(url, true);
}
