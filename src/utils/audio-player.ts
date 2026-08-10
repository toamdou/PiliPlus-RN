/**
 * audio-player —— 后台音频"听视频"命令式封装。
 *
 * 设计要点：
 *  - 播放由 iOS 原生 PiliAudio 模块自持 AVPlayer 驱动；
 *  - PiliAudio 模块负责 AVAudioSession、Now Playing、锁屏远程命令、
 *    中断/路由事件与播放器状态事件；
 *  - JS 只镜像 store 业务状态，不反向驱动播放器或锁屏进度；
 *  - 从 videoApi 返回的 dash 结构取 audio baseUrl 列表选最高音质。
 */
import {
  addInterruptionListener,
  addPlaybackStatusListener,
  addRemoteCommandListener,
  addRouteChangedListener,
  bindSharedPlayerAsync,
  clearNowPlayingAsync,
  configureAudioSessionAsync,
  isModuleAvailable as isAudioModuleAvailable,
  pauseAudioAsync,
  playAudioAsync,
  releaseAudioAsync,
  setActiveAsync,
  setNowPlayingAsync,
  setVolumeAsync,
  syncNowPlayingAsync,
} from 'pili-audio';
import { AppState } from 'react-native';
import { PiliPlayer } from 'pili-player';
import type { PlaybackStatus, RemoteCommandEvent } from 'pili-audio';
import { usePlayerStore } from '@/stores/player';
import { useSettingsStore } from '@/stores/settings';
import { PLAYER_HEADERS } from '@/utils/player-utils';
import { biliCover } from '@/utils/image-url';

/** 原生音频会话是否已配置并持有播放器 */
let activeAudioSession = false;

let playerStatusSub: (() => void) | null = null;
let appStateSub: { remove(): void } | null = null;
let nativeRemoteSub: (() => void) | null = null;
let nativeInterruptionSub: (() => void) | null = null;
let nativeRouteChangedSub: (() => void) | null = null;
let playerStoreUnsub: (() => void) | null = null;
let nativeBridgeReady = false;
let wasPlayingBeforeInterruption = false;
let currentTimeRef = 0;
let durationRef = 0;
let playingRef = false;
let releasePromise: Promise<void> | null = null;
let sharedAudioOnlyMode = false;
let sharedAudioOnlyUrl = '';

function pickDurlAudio(durl: any[]): string {
  for (const entry of durl) {
    if (!entry) continue;
    const explicit = entry.audio_url || entry.audioUrl || entry.audio;
    if (explicit) return explicit;
    if (entry.type === 'audio' && entry.url) return entry.url;
    if (String(entry.mime_type || entry.mimeType || '').includes('audio') && entry.url) {
      return entry.url;
    }
  }
  for (const entry of durl) {
    if (entry?.url) return entry.url;
  }
  return '';
}

/**
 * 音频模式统一取源函数：优先 DASH 分离音轨（真 audio-only），
 * 避免后台听视频时继续解码视频轨。
 * 当前 videoApi.playUrl 仍以 fnval=0 返回 durl 合流，dash.audio 通常为空；
 * 此时保留 durl 合流作为回退（AVPlayer 可只消费音轨），并顺带识别结构里的
 * audio-only 字段，后续 API 切到 fnval=16 后无需改调用方。
 */
export function getBestAudioUrl(dashData: any): string {
  if (!dashData) return '';

  const audioList = dashData.dash?.audio;
  if (Array.isArray(audioList) && audioList.length > 0) {
    const sorted = [...audioList].sort(
      (a, b) => (b.bandwidth || b.bandWidth || 0) - (a.bandwidth || a.bandWidth || 0),
    );
    const best = sorted[0];
    const url = best?.baseUrl || best?.base_url || '';
    if (url) return url;
  }

  const durl = dashData.durl;
  if (Array.isArray(durl) && durl.length > 0) {
    return pickDurlAudio(durl);
  }
  return '';
}

/** 用播放器状态事件镜像 store */
function startPlayerStatusSync() {
  stopPlayerStatusSync();
  const store = usePlayerStore.getState();
  if (!store.audioMode || store.progressSubscribers === 0) return;
  if (!appStateSub) {
    appStateSub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        if (activeAudioSession && !playerStatusSub) startPlayerStatusSync();
      } else {
        stopPlayerStatusSync();
      }
    });
  }
  if (AppState.currentState !== 'active') return;
  playerStatusSub = addPlaybackStatusListener((status: PlaybackStatus) => {
    const store = usePlayerStore.getState();
    currentTimeRef = status.currentTime || 0;
    const durationChanged = status.duration > 0 && status.duration !== durationRef;
    durationRef = status.duration || 0;
    playingRef = status.playing;

    // 拿到真实 duration 后同步锁屏进度信息，避免 Now Playing 一直显示 0。
    if (durationChanged) {
      void syncNowPlayingAsync(
        currentTimeRef,
        durationRef,
        playingRef ? (useSettingsStore.getState().defaultPlaySpeed || 1) : 0,
      ).catch(() => {});
    }

    if (store.progressSubscribers > 0) {
      store.syncProgress(currentTimeRef, durationRef);
    }
    store.setPlaying(playingRef);
  });
}

function stopPlayerStatusSync() {
  if (playerStatusSub) {
    playerStatusSub();
    playerStatusSub = null;
  }
}

function removeAppStateListener() {
  if (appStateSub) {
    appStateSub.remove();
    appStateSub = null;
  }
}

/** 订阅原生播放状态、远程命令、中断与路由事件 */
function setupNativeBridge() {
  if (nativeBridgeReady) return;
  nativeBridgeReady = true;

  playerStoreUnsub = usePlayerStore.subscribe((state, prev) => {
    const hasSubscriber = state.progressSubscribers > 0;
    const hadSubscriber = prev.progressSubscribers > 0;
    if (hasSubscriber === hadSubscriber) return;
    if (hasSubscriber && state.audioMode) startPlayerStatusSync();
    else if (!hasSubscriber) stopPlayerStatusSync();
  });

  nativeRemoteSub = addRemoteCommandListener((event: RemoteCommandEvent) => {
    const store = usePlayerStore.getState();

    switch (event.command) {
      case 'play':
        store.handleRemoteCommand('play');
        playingRef = true;
        break;
      case 'pause':
        store.handleRemoteCommand('pause');
        playingRef = false;
        break;
      case 'togglePlayPause': {
        store.handleRemoteCommand('togglePlayPause');
        playingRef = usePlayerStore.getState().playing;
        break;
      }
      case 'seek': {
        const position =
          typeof event.position === 'number' && event.position >= 0
            ? event.position
            : currentTimeRef;
        store.handleRemoteCommand('seek', position);
        currentTimeRef = position;
        break;
      }
      case 'skipForward':
      case 'skipBackward': {
        // 当前没有真实队列，固定按 15 秒快进/快退（原生 preferredIntervals 同值）。
        const direction = event.command === 'skipForward' ? 1 : -1;
        const interval = event.interval ?? 15;
        const target = Math.max(0, currentTimeRef + direction * interval);
        const clamped = durationRef > 0 ? Math.min(target, durationRef) : target;
        store.handleRemoteCommand('seek', clamped);
        currentTimeRef = clamped;
        break;
      }
    }
  });

  nativeInterruptionSub = addInterruptionListener((event) => {
    if (event.state === 'begin') {
      wasPlayingBeforeInterruption = usePlayerStore.getState().playing;
      usePlayerStore.getState().setPlaying(false);
      playingRef = false;
      return;
    }

    const shouldResume = event.options.includes('shouldResume');
    if (shouldResume && wasPlayingBeforeInterruption) {
      usePlayerStore.getState().setPlaying(true);
      playingRef = true;
    } else {
      usePlayerStore.getState().setPlaying(false);
      playingRef = false;
    }
    wasPlayingBeforeInterruption = false;
  });

  nativeRouteChangedSub = addRouteChangedListener((event) => {
    if (!event.shouldPause) return;
    usePlayerStore.getState().setPlaying(false);
    playingRef = false;
  });
}

async function performRelease(): Promise<void> {
  if (releasePromise) {
    return releasePromise;
  }

  releasePromise = (async () => {
    stopPlayerStatusSync();
    removeAppStateListener();

    const wasActive = activeAudioSession;
    activeAudioSession = false;
    if (sharedAudioOnlyMode) {
      sharedAudioOnlyMode = false;
      sharedAudioOnlyUrl = '';
      try {
        await PiliPlayer.shared.exitAudioOnlyAsync();
      } catch {
        /* 静默 */
      }
    }
    if (wasActive) {
      try {
        await releaseAudioAsync();
      } catch {
        /* 静默 */
      }
    }

    wasPlayingBeforeInterruption = false;
    currentTimeRef = 0;
    durationRef = 0;
    playingRef = false;

    if (nativeRemoteSub) {
      nativeRemoteSub();
      nativeRemoteSub = null;
    }
    if (nativeInterruptionSub) {
      nativeInterruptionSub();
      nativeInterruptionSub = null;
    }
    if (nativeRouteChangedSub) {
      nativeRouteChangedSub();
      nativeRouteChangedSub = null;
    }
    if (playerStoreUnsub) {
      playerStoreUnsub();
      playerStoreUnsub = null;
    }
    nativeBridgeReady = false;

    try {
      await clearNowPlayingAsync();
    } catch {
      /* 静默 */
    }
    try {
      await setActiveAsync(false);
    } catch {
      /* 静默 */
    }
  })();

  try {
    await releasePromise;
  } catch {
    /* 静默 */
  } finally {
    releasePromise = null;
  }
}

/**
 * 开始音频模式播放。
 * @param audioUrl 音频源 URL（从 getBestAudioUrl 取得）
 * @param info 视频元信息 { bvid, title, cover }
 * @param startTime 起始播放位置（秒），用于从视频当前进度接续
 */
export async function startAudioPlayback(
  audioUrl: string,
  info: { bvid: string; title: string; cover: string },
  startTime = 0,
  reuseSharedPlayer = false,
  isLiveStream = false,
  playbackRate = 1,
) {
  if (!isAudioModuleAvailable()) {
    throw new Error('原生音频模块不可用');
  }
  const settings = useSettingsStore.getState();
  const shouldPlayInBackground = settings.enableBackgroundPlay && settings.continuePlayInBackground;

  // 先等旧原生播放器释放完成，避免 loadAsync 与 releaseAsync 在主线程乱序。
  await performRelease();
  await configureAudioSessionAsync(true, shouldPlayInBackground);
  activeAudioSession = true;
  setupNativeBridge();

  try {
    const sharedPlayer = PiliPlayer.shared;
    const sourceMatches =
      sharedPlayer.sourceUri === audioUrl && sharedPlayer.status !== 'idle';
    const canReuse =
      (reuseSharedPlayer || sharedPlayer.status !== 'idle') && sourceMatches;
    if (sharedAudioOnlyMode && sharedAudioOnlyUrl === audioUrl) {
      await bindSharedPlayerAsync(sharedPlayer.getSharedPlayer());
    } else if (canReuse && sharedPlayer.getSharedPlayer() != null) {
      await bindSharedPlayerAsync(sharedPlayer.getSharedPlayer());
    } else {
      await sharedPlayer.enterAudioOnlyAsync(
        {
          uri: audioUrl,
          headers: { ...PLAYER_HEADERS },
        },
        Math.max(0, startTime),
      );
      sharedAudioOnlyMode = true;
      sharedAudioOnlyUrl = audioUrl;
      await bindSharedPlayerAsync(sharedPlayer.getSharedPlayer());
    }
  } catch (error) {
    if (sharedAudioOnlyMode) {
      sharedAudioOnlyMode = false;
      sharedAudioOnlyUrl = '';
      await PiliPlayer.shared.exitAudioOnlyAsync().catch(() => {});
    }
    activeAudioSession = false;
    await releaseAudioAsync().catch(() => {});
    await setActiveAsync(false).catch(() => {});
    throw error;
  }

  currentTimeRef = Math.max(0, startTime);
  durationRef = 0;
  playingRef = false;
  const store = usePlayerStore.getState();
  store.enterAudioMode(info);

  try {
    await setNowPlayingAsync(
      info.title,
      'PiliPlus',
      biliCover(info.cover, 600, 600),
      durationRef,
      currentTimeRef,
      playbackRate,
      isLiveStream,
    );
    await setVolumeAsync(Math.min(Math.max(useSettingsStore.getState().playerVolume / 100, 0), 1));
  } catch {
    /* 锁屏信息/音量失败不阻塞播放 */
  }

  await playAudioAsync();
  playingRef = true;
  store.setPlaying(true);
  startPlayerStatusSync();
}

/** 释放播放器（退出音频模式 / 切换视频时调用） */
export function releaseAudioPlayer(): Promise<void> {
  return performRelease();
}

/** 按当前 store 播放状态切换播放/暂停（audio 页等共享入口）。 */
export async function toggleAudioPlayback(): Promise<void> {
  if (usePlayerStore.getState().playing) {
    await pauseAudioAsync();
  } else {
    await playAudioAsync();
  }
}
