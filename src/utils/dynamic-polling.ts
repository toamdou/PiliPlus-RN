import { create } from 'zustand';
import { AppState } from 'react-native';
import { useSettingsStore } from '@/stores/settings';
import { useAuthStore } from '@/stores/auth';
import {
  addDynamicCheckListener,
  markDynamicReadAsync,
  registerBackgroundDynamicCheckAsync,
  resetDynamicAccountAsync,
  setDynamicBadgeCountAsync,
  startDynamicPolling,
  stopDynamicPolling,
  unregisterBackgroundDynamicCheckAsync,
  clearDynamicNotifications,
  type DynamicCheckResult,
} from 'pili-native-core';
import { isPowerConstrained, usePowerStateStore } from '@/utils/power-state';

let appStateSub: { remove: () => void } | null = null;
let settingsUnsub: (() => void) | null = null;
let authUnsub: (() => void) | null = null;
let backgroundRegistered = false;
let powerStoreSub: (() => void) | null = null;
let powerRestartTimer: ReturnType<typeof setTimeout> | null = null;

function effectivePeriodMinutes(periodMinutes: number): number {
  return isPowerConstrained(usePowerStateStore.getState().state)
    ? periodMinutes * 2
    : periodMinutes;
}

/** 原生轮询直接返回检查结果，JS 只同步未读计数与游标。 */
function applyDynamicResult(result: DynamicCheckResult) {
  if (!result.success || !result.latestId) return;
  const { newCount, latestId, lastSeenId } = result;
  const { lastSeenId: prevLastSeenId } = useDynamicPoll.getState();
  if (prevLastSeenId === null) {
    // 首次：以原生游标为准，避免重启后前台与后台游标分叉
    useDynamicPoll.setState({
      newCount,
      lastSeenId: lastSeenId ?? latestId,
      latestId,
    });
  } else if (latestId !== prevLastSeenId) {
    useDynamicPoll.setState({
      newCount,
      lastSeenId: lastSeenId ?? prevLastSeenId,
      latestId,
    });
  } else {
    // latestId === lastSeenId → 无新动态，同步原生返回的计数
    useDynamicPoll.setState({ newCount, latestId });
  }
}

/* ================= 前台轮询 Store ================= */

interface DynamicPollState {
  newCount: number; // 新动态数量
  lastSeenId: string | null; // 用户上次看到的最新动态 ID
  latestId: string | null; // 最近一次轮询获取的最新动态 ID
  isPolling: boolean;
  pollingSubscription: (() => void) | null;
  start: () => Promise<void>;
  stop: () => Promise<void>;
  reset: () => void;
  resetAccount: () => Promise<void>;
  markRead: () => Promise<void>;
}

async function startNativePolling(periodMinutes: number) {
  const { pollingSubscription } = useDynamicPoll.getState();
  pollingSubscription?.();
  const effective = effectivePeriodMinutes(Math.max(periodMinutes, 1));
  const ok = await startDynamicPolling(effective * 60 * 1000);
  if (!ok) {
    useDynamicPoll.setState({ isPolling: false, pollingSubscription: null });
    return;
  }
  const subscription = addDynamicCheckListener(applyDynamicResult);
  useDynamicPoll.setState({ isPolling: true, pollingSubscription: subscription });
}

function stopNativePolling() {
  const { pollingSubscription } = useDynamicPoll.getState();
  pollingSubscription?.();
  void stopDynamicPolling();
  useDynamicPoll.setState({ isPolling: false, pollingSubscription: null });
}

async function registerBackground(periodMinutes: number) {
  try {
    const ok = await registerBackgroundDynamicCheckAsync({
      minimumIntervalMinutes: Math.max(periodMinutes, 1),
      accountId: String(useAuthStore.getState().userInfo?.mid ?? ''),
      badgeMode: useSettingsStore.getState().dynamicBadgeMode,
    });
    backgroundRegistered = ok;
  } catch (e) {
    console.warn('Native background register failed:', e);
    backgroundRegistered = false;
  }
}

async function unregisterBackground() {
  if (!backgroundRegistered) return;
  try {
    await unregisterBackgroundDynamicCheckAsync();
  } catch {}
  backgroundRegistered = false;
}

function ensureSubscriptions() {
  usePowerStateStore.getState().attach();
  if (!powerStoreSub) {
    powerStoreSub = usePowerStateStore.subscribe((store, prev) => {
      if (isPowerConstrained(store.state) === isPowerConstrained(prev.state)) return;
      const st = useSettingsStore.getState();
      const poll = useDynamicPoll.getState();
      if (
        st.checkDynamic &&
        st.dynamicBadgeMode !== 0 &&
        AppState.currentState === 'active' &&
        poll.isPolling
      ) {
        if (powerRestartTimer) clearTimeout(powerRestartTimer);
        powerRestartTimer = setTimeout(() => {
          powerRestartTimer = null;
          stopNativePolling();
          void useDynamicPoll.getState().start();
        }, 250);
      }
    });
  }
  if (!appStateSub) {
    appStateSub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') {
        stopNativePolling();
      } else {
        void useDynamicPoll.getState().start();
      }
    });
  }
  if (!settingsUnsub) {
    settingsUnsub = useSettingsStore.subscribe((state, prev) => {
      if (
        state.checkDynamic === prev.checkDynamic &&
        state.dynamicPeriod === prev.dynamicPeriod &&
        state.dynamicBadgeMode === prev.dynamicBadgeMode
      ) {
        return;
      }
      if (!state.checkDynamic || state.dynamicBadgeMode === 0) {
        stopNativePolling();
        void unregisterBackground();
        void clearDynamicNotifications();
        return;
      }
      if (AppState.currentState === 'active') {
        stopNativePolling();
        void useDynamicPoll.getState().start();
      } else {
        void unregisterBackground().then(() =>
          registerBackground(effectivePeriodMinutes(state.dynamicPeriod)),
        );
      }
    });
  }
  if (!authUnsub) {
    authUnsub = useAuthStore.subscribe((state, prev) => {
      if (state.anonymousMode === prev.anonymousMode) return;
      if (state.anonymousMode) {
        stopNativePolling();
        void unregisterBackground();
        void clearDynamicNotifications();
      } else if (AppState.currentState === 'active') {
        void useDynamicPoll.getState().start();
      }
    });
  }
}

/**
 * 动态轮询 store
 * 根据 checkDynamic + dynamicPeriod 设置，定时检查是否有新动态
 * dynamicBadgeMode: 0=不显示, 1=数字, 2=红点
 *
 * §3.5：前台 interval 保留；后台由原生 BGAppRefreshTask 调度执行动态检查。
 */
export const useDynamicPoll = create<DynamicPollState>((set, get) => ({
  newCount: 0,
  lastSeenId: null,
  latestId: null,
  isPolling: false,
  pollingSubscription: null,

  start: async () => {
    ensureSubscriptions();
    const s = useSettingsStore.getState();
    const auth = useAuthStore.getState();
    if (!s.checkDynamic || !auth.isLoggedIn || auth.anonymousMode) {
      stopNativePolling();
      void clearDynamicNotifications();
      return;
    }
    if (s.dynamicBadgeMode === 0) {
      stopNativePolling();
      await unregisterBackground();
      void clearDynamicNotifications();
      return;
    }
    if (AppState.currentState !== 'active') return;
    if (get().isPolling && get().pollingSubscription) return;

    const periodMinutes = Math.max(s.dynamicPeriod, 1);
    await startNativePolling(periodMinutes);

    // 设置变化后重新注册原生任务，让 badgeMode/mixinKey 使用最新值。
    if (backgroundRegistered) {
      try {
        await unregisterBackgroundDynamicCheckAsync();
      } catch {}
      backgroundRegistered = false;
    }
    if (!backgroundRegistered) await registerBackground(effectivePeriodMinutes(periodMinutes));

    // 如果在 await 期间被 stop() 取消，立即回滚注册
    if (!get().isPolling) {
      await unregisterBackground();
      return;
    }
  },

  stop: async () => {
    stopNativePolling();
    if (powerRestartTimer) {
      clearTimeout(powerRestartTimer);
      powerRestartTimer = null;
    }
    if (powerStoreSub) {
      powerStoreSub();
      powerStoreSub = null;
    }
    if (settingsUnsub) {
      settingsUnsub();
      settingsUnsub = null;
    }
    if (authUnsub) {
      authUnsub();
      authUnsub = null;
    }
    if (appStateSub) {
      appStateSub.remove();
      appStateSub = null;
    }
    await unregisterBackground();
  },

  reset: () => {
    set({ newCount: 0 });
  },

  resetAccount: async () => {
    try {
      await resetDynamicAccountAsync();
    } catch {}
    set({ newCount: 0, lastSeenId: null, latestId: null });
  },

  markRead: async () => {
    // 原生标记已读后再同步本地 state
    try {
      await markDynamicReadAsync();
    } catch {}
    const { latestId } = get();
    set({ newCount: 0, lastSeenId: latestId });
    void setDynamicBadgeCountAsync(0).catch(() => {});
  },
}));
