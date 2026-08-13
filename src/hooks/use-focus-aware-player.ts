/**
 * useFocusAwarePlayer —— 焦点感知的播放器生命周期管理。
 *
 * 职责：
 *  1. 页面失去焦点时自动暂停（防止 expo-router 恢复后台栈时出声）
 *  2. 应用进入后台时暂停，回到前台时按先前播放状态恢复
 *  3. 提供 tryAutoPlay() —— 仅在页面可见 + 用户设置允许时才播放
 *
 * 用法：
 *   const { tryAutoPlay } = useFocusAwarePlayer(player);
 *   // 在 source 加载完成后：
 *   tryAutoPlay();
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useIsFocused, usePathname } from 'expo-router';
import { useSettingsStore } from '@/stores/settings';
import { useNetwork } from '@/utils/network';
import { isPowerConstrained, usePowerStateStore } from '@/utils/power-state';

interface VideoPlayerLike {
  play: () => void;
  pause: () => void;
  playing?: boolean;
}

/**
 * 共享播放器消费屏判定（审计 06-N2/F1 修复）：
 * 进入这些页面时，旧页（视频详情）的迟到 blur 不应暂停共享播放器——
 * 全屏页/新视频页挂载即 play，旧页 blur 的 player.pause() 会把刚开始的播放停掉。
 * 注意 /video/notes 是纯列表页（无播放器），不豁免，仍应暂停。
 */
function isPlayerConsumerPath(pathname: string | null): boolean {
  if (!pathname) return false;
  if (pathname === '/video/fullscreen' || pathname === '/download/player') return true;
  if (pathname.startsWith('/pgc/') || pathname.startsWith('/live/')) return true;
  if (pathname.startsWith('/video/') && !pathname.startsWith('/video/notes')) return true;
  return false;
}

export function useFocusAwarePlayer(player: VideoPlayerLike | null) {
  const isFocused = useIsFocused();
  const isFocusedRef = useRef(isFocused);
  const pathname = usePathname();
  const [isAppActive, setIsAppActive] = useState(() => AppState.currentState === 'active');
  const isAppActiveRef = useRef(isAppActive);
  const playerRef = useRef(player);
  const powerConstrainedRef = useRef(false);
  /** 对齐 Flutter：仅恢复进入后台前正在播放的会话 */
  const pauseDueToBackgroundRef = useRef(false);

  // 在 effect 中更新 ref，避免渲染阶段修改被 worklet 序列化过的对象
  useEffect(() => {
    playerRef.current = player;
  }, [player]);

  useEffect(() => {
    usePowerStateStore.getState().attach();
    powerConstrainedRef.current = isPowerConstrained(
      usePowerStateStore.getState().state,
    );
    const sub = usePowerStateStore.subscribe((store) => {
      powerConstrainedRef.current = isPowerConstrained(store.state);
    });
    return () => {
      sub();
    };
  }, []);

  useEffect(() => {
    isFocusedRef.current = isFocused;
  }, [isFocused]);

  useEffect(() => {
    isAppActiveRef.current = isAppActive;
  }, [isAppActive]);

  // 失去焦点 → 立即暂停。
  // 但"新焦点路由属于共享播放器消费屏"时豁免：全屏页挂载即 play，
  // 旧页（详情页）的 blur 在转场结束后才到达，此时的 pause 会把刚开始的播放停掉（06-N2/F1 竞态）。
  useEffect(() => {
    if (!isFocused && player) {
      if (isPlayerConsumerPath(pathname)) return;
      player.pause();
    }
  }, [isFocused, pathname, player]);

  // 页面在后台挂载时也按后台策略处理一次
  useEffect(() => {
    if (isAppActiveRef.current) return;
    const currentPlayer = playerRef.current;
    const st = useSettingsStore.getState();
    if (!currentPlayer || (st.enableBackgroundPlay && st.continuePlayInBackground)) return;
    if (typeof currentPlayer.playing === 'boolean' && currentPlayer.playing) {
      pauseDueToBackgroundRef.current = true;
      currentPlayer.pause();
    }
  }, []);

  /**
   * 尝试自动播放：综合检查页面焦点 + 应用前台 + autoPlay 设置 + WiFi 限制。
   * 返回是否实际执行了 play()。
   */
  const tryAutoPlay = useCallback(() => {
    const currentPlayer = playerRef.current;
    if (!currentPlayer || !isFocusedRef.current || !isAppActiveRef.current) return false;
    const st = useSettingsStore.getState();
    if (!st.autoPlay) return false;
    if (st.playOnWifi && !useNetwork.getState().isWifi) return false;
    if (powerConstrainedRef.current) return false;
    currentPlayer.play();
    return true;
  }, []);

  // 系统前后台监听：后台暂停，前台只恢复先前正在播放的会话
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      const active = nextState === 'active';
      isAppActiveRef.current = active;
      setIsAppActive(active);

      const currentPlayer = playerRef.current;
      if (!currentPlayer) return;
      const st = useSettingsStore.getState();
      if (!active) {
        if (st.enableBackgroundPlay && st.continuePlayInBackground) return;
        if (typeof currentPlayer.playing === 'boolean' && currentPlayer.playing) {
          pauseDueToBackgroundRef.current = true;
          currentPlayer.pause();
        }
        return;
      }
      if (pauseDueToBackgroundRef.current) {
        pauseDueToBackgroundRef.current = false;
        if (isFocusedRef.current) {
          currentPlayer.play();
        }
      }
    });
    return () => subscription.remove();
  }, []);

  return { isFocused, isFocusedRef, isAppActive, tryAutoPlay };
}
