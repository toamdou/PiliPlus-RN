/**
 * heartbeat —— 播放心跳上报（01-B1，P0）。
 *
 * 原实现：use-video-playback 与 use-fullscreen-player 各写一份 5s 心跳，
 * 播放 1 小时约 720 次请求。这里收敛为单一 util：
 *  - 周期心跳间隔 15s（播放中，随 timeUpdate 事件驱动）；
 *  - 暂停 / 退出全屏 / 页面卸载时各补报一次（play_type=1）。
 *
 * 说明：heartbeat 依赖 videoApi（网络层）与 auth/settings store，
 * 通过参数传入 source，避免本 util 与播放器 hook 耦合。
 */
import { videoApi } from '@/api/video';
import { useAuthStore } from '@/stores/auth';
import { useSettingsStore } from '@/stores/settings';

/** 心跳上报间隔（秒）。01-B1：5s → 15s，播放 1 小时请求量 720 → 240。 */
export const HEARTBEAT_INTERVAL_SEC = 15;

export interface HeartbeatSource {
  aid?: number;
  bvid?: string;
  cid?: number;
}

function shouldSkipHeartbeat(): boolean {
  if (!useSettingsStore.getState().enableHeartbeat) return true;
  if (useAuthStore.getState().anonymousMode) return true;
  return false;
}

/**
 * 单次上报（内部）：跳过开关/游客，组装参数。
 * @param source 视频信息（aid/bvid/cid）
 * @param currentTime 当前播放进度（秒）
 * @param playType 0=播放中 1=结束（暂停/退出/卸载）
 */
function sendHeartbeat(source: HeartbeatSource, currentTime: number, playType: 0 | 1): void {
  if (shouldSkipHeartbeat()) return;
  if (!source || !source.cid) return;
  const t = Math.floor(Math.max(0, currentTime || 0));
  videoApi
    .heartbeat({
      aid: source.aid,
      bvid: source.bvid,
      cid: source.cid,
      played_time: t,
      real_time: t,
      play_type: playType,
      network_type: 0,
    })
    .catch(() => {});
}

/**
 * 周期心跳：距上次上报 ≥ 15s 才发一次（play_type=0），并推进 lastReportedRef。
 * 供播放页 timeUpdate 监听内调用，两份实现共用同一收敛逻辑。
 */
export function maybeHeartbeat(
  source: HeartbeatSource | null | undefined,
  currentTime: number,
  lastReportedRef: { current: number },
): void {
  if (!source) return;
  if (currentTime - lastReportedRef.current < HEARTBEAT_INTERVAL_SEC) return;
  lastReportedRef.current = currentTime;
  sendHeartbeat(source, currentTime, 0);
}

/**
 * 收尾补报（play_type=1）：暂停 / 退出全屏 / 页面卸载时调用一次，
 * 上报截至当前的真实进度。
 */
export function reportHeartbeatFinal(
  source: HeartbeatSource | null | undefined,
  currentTime: number,
): void {
  if (!source) return;
  sendHeartbeat(source, currentTime, 1);
}
