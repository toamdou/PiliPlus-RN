import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Share, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import * as ScreenOrientation from 'expo-screen-orientation';
import { PiliPlayer } from 'pili-player';
import { Gesture } from 'react-native-gesture-handler';
import { runOnJS, useSharedValue, withTiming } from 'react-native-reanimated';
import { cancelSleepTimer } from 'pili-native-core';
import {
  getBrightness as nativeGetBrightness,
  setBrightness as nativeSetBrightness,
} from 'pili-native-core';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { showToast } from '@/utils/toast';
import { videoApi } from '@/api/video';
import { useAuthStore } from '@/stores/auth';
import { useSettingsStore } from '@/stores/settings';
import { getBestPlayUrl, getPlayerConfig, PLAYER_HEADERS } from '@/utils/player-utils';
import { feedBack, feedBackSelection, feedBackSuccess } from '@/utils/feedback';
import { normalizeHttpUrl } from '@/utils/format';
import type { DanmakuDensityMarker } from '@/components/DanmakuOverlay';
import { usePlayerStore, nextVideoGravity, type VideoGravity } from '@/stores/player';
import type { SBSegment } from '@/api/sponsor-block';
import { useVideoEnhance } from '@/hooks/use-video-enhance';
import { fetchSubtitleJson } from '@/hooks/use-video-controller';
import { captureVideoFrameToAlbum } from '@/utils/screenshot';
import { sortSkipSegments } from '@/utils/skip-segments';
import { maybeHeartbeat, reportHeartbeatFinal } from '@/utils/heartbeat';

/** 画面比例显示名（04-B3/B4） */
const VIDEO_GRAVITY_LABELS: Record<VideoGravity, string> = {
  contain: '原始比例',
  cover: '填满画面',
  fill: '拉伸铺满',
};

function useFullscreenPlayerWith(player: any) {
  const fs = usePlayerStore((s) => s.fullscreenState);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width: winW, height: winH } = useWindowDimensions();
  const removeSafeArea = useSettingsStore((s) => s.removeSafeArea);
  const showFSActionItem = useSettingsStore((s) => s.showFSActionItem);
  const showFSLockBtn = useSettingsStore((s) => s.showFSLockBtn);
  const showFsScreenshotBtn = useSettingsStore((s) => s.showFsScreenshotBtn);
  const showBatteryLevel = useSettingsStore((s) => s.showBatteryLevel);
  const btmProgressBehavior = useSettingsStore((s) => s.btmProgressBehavior);
  const autoRotate = useSettingsStore((s) => s.autoRotate);
  const fullScreenMode = useSettingsStore((s) => s.fullScreenMode);
  const enableSlideFS = useSettingsStore((s) => s.enableSlideFS);
  const enableSlideVolumeBrightness = useSettingsStore((s) => s.enableSlideVolumeBrightness);
  const enableDragSubtitle = useSettingsStore((s) => s.enableDragSubtitle);
  // 04-B3/B4/17：画面比例以设置 store 为准（并行代理 F3 在 settings.ts 维护 videoGravity）。
  // 防御式读取：字段尚未就绪时回退 'contain'，不依赖 usePlayerStore 的进入时快照。
  const videoGravity = (useSettingsStore((s) => (s as any).videoGravity) ?? 'contain') as VideoGravity;
  const sponsorBlockEnabled = useSettingsStore((s) => s.enableSponsorBlock);
  const {
    enabled: enhanceEnabled,
    options: enhanceOptions,
    onError: onEnhancementError,
    onStateChange: onEnhancementStateChange,
  } = useVideoEnhance();
  const safePadding = removeSafeArea
    ? { top: 0, right: 0, bottom: 0, left: 0 }
    : { top: insets.top, right: insets.right, bottom: insets.bottom, left: insets.left };

  const id = fs?.bvid || '';
  const aid = fs?.aid || 0;
  const cid = fs?.cid || 0;
  const title = fs?.title || '';
  const pic = fs?.pic || '';
  const playUrl = fs?.playUrl || '';
  const onlineCount = fs?.onlineCount || '';
  const seekTo = fs?.currentTime || 0;
  const initSpeed = fs?.playbackRate || 1;
  const initVolume = fs?.volume ?? 1;
  const videoInfo = { aid, bvid: id, title, owner: { name: '' } };

  const [currentTime, setCurrentTime] = useState(seekTo);
  const [duration, setDuration] = useState(0);
  const [playing, setPlaying] = useState(false);
  const playingRef = useRef(false);
  const pauseForBackgroundRef = useRef(false);
  const [locked, setLocked] = useState(false);
  const lockedRef = useRef(false);
  const exitFullscreenRef = useRef<() => void>(() => {});
  const [coverShown, setCoverShown] = useState(true);
  const [controlsShown, setControlsShown] = useState(true);
  const controlsVisibleRef = useRef(true);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [settingsVisible, setSettingsVisible] = useState(false);
  const [playSpeed, setPlaySpeed] = useState(initSpeed);
  const [dmVisible, setDmVisible] = useState(fs?.dmVisible ?? true);
  const [subtitleVisible, setSubtitleVisible] = useState(fs?.subtitleVisible ?? false);
  const [subtitleData, setSubtitleData] = useState<{ from: number; to: number; content: string }[]>(
    fs?.subtitleData ?? [],
  );
  const [sbSegments] = useState<SBSegment[]>(fs?.sbSegments ?? []);
  const sortedSbSegments = useMemo(() => (
    sortSkipSegments(sbSegments.filter((seg) => seg.actionType === 'skip'))
  ), [sbSegments]);

  /* ===== 缓冲中 / 播放错误状态（04-P0/3.4：error → toast + 一键重载；buffering → spinner） ===== */
  const [buffering, setBuffering] = useState(false);
  const [playError, setPlayError] = useState<string | null>(null);

  useEffect(() => {
    if (!player || typeof player.setSkipSegments !== 'function') return;
    player.setSkipSegments(
      sponsorBlockEnabled
        ? sortedSbSegments.map((seg) => [seg.segment[0], seg.segment[1]])
        : [],
    );
  }, [player, sortedSbSegments, sponsorBlockEnabled]);
  const [liked, setLiked] = useState(fs?.liked ?? false);
  const [coined, setCoined] = useState(fs?.coined ?? false);
  const [faved, setFaved] = useState(fs?.faved ?? false);
  const [disliked, setDisliked] = useState(fs?.disliked ?? false);
  const [qualityList] = useState<{ quality: number; new_description: string }[]>(fs?.qualityList ?? []);
  const [currentQn, setCurrentQn] = useState(fs?.currentQn ?? 0);
  const qualityListRef = useRef(qualityList);
  const currentQnRef = useRef(currentQn);
  useEffect(() => { currentQnRef.current = currentQn; }, [currentQn]);
  const seekOnceRef = useRef(false);
  const lastHeartbeatRef = useRef(0);
  // 01-B1：本次会话是否已补报过"最终进度"（暂停/退出/卸载只补报一次，避免重复请求）。
  // 恢复播放时复位，允许下一次暂停再补报。
  const heartbeatFinalSentRef = useRef(false);
  // 全屏会话标识（04-3.2/06-6.7）：进入全屏即生成，退出/卸载回写校验用。
  // 快速进出全屏时，详情页可能因路由竞态还未消费上一轮 fullscreenState，
  // 这里用新鲜会话号让旧会话立即失效，避免脏状态残留。
  const sessionIdRef = useRef(Math.floor(Math.random() * 0x7fffffff) + 1);
  // 04-3.2/06-6.7：本会话是否已回写过 fullscreenState。
  // "写一次-读一次-清空"协议：exitFullscreen 与路由卸载 cleanup 各可能触发一次回写，
  // 只允许第一次生效，避免重复写入；配合 sessionId 校验防止跨会话脏残留。
  const stateWrittenRef = useRef(false);
  const videoGravityRef = useRef<VideoGravity>(videoGravity);
  const dmVisibleRef = useRef(dmVisible);
  const subtitleVisibleRef = useRef(subtitleVisible);
  const subtitleDataRef = useRef(subtitleData);
  const [dmDensity, setDmDensity] = useState<DanmakuDensityMarker[]>([]);
  useEffect(() => { dmVisibleRef.current = dmVisible; }, [dmVisible]);
  useEffect(() => { subtitleVisibleRef.current = subtitleVisible; }, [subtitleVisible]);
  useEffect(() => { subtitleDataRef.current = subtitleData; }, [subtitleData]);
  useEffect(() => { videoGravityRef.current = videoGravity; }, [videoGravity]);

  // 04-3.2/06-6.7：进入全屏即把当前 fullscreenState 打上本会话号。
  // 快速进出全屏时，旧会话的路由卸载 cleanup 若晚于新会话执行，可通过 sessionId
  // 识别出已被新会话覆盖（或已被主页面消费清空）而跳过回写，避免残留脏状态。
  useEffect(() => {
    const base = usePlayerStore.getState().fullscreenState;
    if (base && (base.sessionId === undefined || base.sessionId === sessionIdRef.current)) {
      usePlayerStore.getState().setFullscreenState({ ...base, sessionId: sessionIdRef.current });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const videoSource = useMemo(() => {
    if (!playUrl) return null;
    return { uri: playUrl, headers: { ...PLAYER_HEADERS } };
  }, [playUrl]);

  const playerRef = useRef<any>(player);
  useEffect(() => { playerRef.current = player; }, [player]);
  // F4：记录当前真实 playUrl，供切画质/退出全屏回写 usePlayerStore.fullscreenState
  const playUrlRef = useRef(playUrl);
  useEffect(() => { playUrlRef.current = playUrl; }, [playUrl]);

  // 全屏页后台守卫：与详情页一致，后台暂停、回前台只恢复先前正在播放的会话。
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      const currentPlayer = playerRef.current;
      if (!currentPlayer) return;
      const st = useSettingsStore.getState();
      if (state !== 'active') {
        if (st.enableBackgroundPlay && st.continuePlayInBackground) return;
        if (playingRef.current) {
          pauseForBackgroundRef.current = true;
          currentPlayer.pause();
        }
        return;
      }
      if (pauseForBackgroundRef.current) {
        pauseForBackgroundRef.current = false;
        currentPlayer.play();
      }
    });
    return () => sub.remove();
  }, []);

  const durationSV = useSharedValue(0);

  // 原生共享会话可能已经处于播放态：挂载时同步一次，避免 UI 显示错误的暂停按钮。
  useEffect(() => {
    if (!player) return;
    if (typeof (player as any).playing === 'boolean') {
      const initialPlaying = !!(player as any).playing;
      playingRef.current = initialPlaying;
      const timer = setTimeout(() => setPlaying(initialPlaying), 0);
      return () => clearTimeout(timer);
    }
  }, [player]);

  // 复用原生共享会话：详情页已加载同一源时不再 replace。
  useEffect(() => {
    if (!videoSource || !player) return;
    if ((player as any).sourceUri === playUrl) return;
    player.replaceAsync(videoSource).catch(() => {});
  }, [playUrl, player, videoSource]);

  useEffect(() => {
    if (!player) return;
    const sub = player.addListener('timeUpdate', (e: any) => {
      const duration = typeof e.duration === 'number' && e.duration > 0 ? e.duration : 0;
      if (duration > 0) {
        setDuration(duration);
        durationSV.set(duration);
      }
      setCurrentTime(e.currentTime);
      // 01-B1（P0）：全屏播放同样上报心跳（15s 收敛到 utils/heartbeat.ts），
      // 避免进入全屏后上报中断，且与详情页共用同一收敛逻辑。
      maybeHeartbeat({ aid, bvid: id, cid }, e.currentTime, lastHeartbeatRef);
    });
    const endSub = player.addListener('playToEnd', () => {
      if (!useSettingsStore.getState().enableAutoExit) return;
      lockedRef.current = false;
      exitFullscreenRef.current();
    });
    const playingSub = player.addListener('playingChange', (e: any) => {
      playingRef.current = !!e.isPlaying;
      setPlaying(!!e.isPlaying);
      // 01-B1：暂停即补报一次最终进度（play_type=1），恢复播放后允许再次补报。
      if (e.isPlaying) {
        heartbeatFinalSentRef.current = false;
      } else if (!heartbeatFinalSentRef.current) {
        heartbeatFinalSentRef.current = true;
        const t = playerRef.current?.currentTime || 0;
        maybeHeartbeat({ aid, bvid: id, cid }, t, lastHeartbeatRef);
        reportHeartbeatFinal({ aid, bvid: id, cid }, t);
      }
    });
    const applyReady = () => {
      if (!seekOnceRef.current) {
        seekOnceRef.current = true;
        if (seekTo > 0 && seekTo < (player.duration || Infinity)) player.currentTime = seekTo;
        player.playbackRate = initSpeed;
        if (!Number.isNaN(initVolume)) player.volume = Math.min(Math.max(initVolume, 0), 1);
      }
      if (player.duration > 0) {
        setDuration(player.duration);
        durationSV.set(player.duration);
      }
      player.play();
    };
    const statusSub = player.addListener('statusChange', (e: any) => {
      if (e.status === 'readyToPlay') applyReady();
    });
    // 04-P0/3.4：播放中途 error（item failed / failedToPlayToEndTime）→ toast + 提示重载。
    // 不自动 reload（避免网络抖动时死循环），交给用户点设置面板的"重载"。
    const errorSub = player.addListener('error', (e: any) => {
      setPlayError(e?.message || '播放出错');
      showToast(e?.message || '播放出错，请点击设置中的重载重试');
    });
    // buffering 事件：原生 timeControlStatus == .waitingToPlayAtSpecifiedRate 时透出
    const bufferSub = player.addListener('buffering', (e: any) => {
      setBuffering(!!e?.isBuffering);
    });
    if ((player as any).status === 'readyToPlay') applyReady();
    return () => {
      sub.remove(); playingSub.remove(); statusSub.remove(); endSub.remove();
      errorSub.remove(); bufferSub.remove();
    };
  }, [player, aid, cid, durationSV, id, initSpeed, initVolume, seekTo]);

  // 退出全屏时把播放器设置写回 usePlayerStore，主页面 useFocusEffect 消费后清零
  function writeFullscreenState() {
    // 04-3.2/06-6.7："写一次-读一次-清空"协议——exitFullscreen 与路由卸载 cleanup
    // 各可能触发一次，只允许第一次生效；sessionId 校验排除已被新会话覆盖/已清空的残留。
    if (stateWrittenRef.current) return;
    try {
      const base = usePlayerStore.getState().fullscreenState;
      if (!base || base.sessionId !== sessionIdRef.current) return;
      // 04-3.2：currentTime 必须取当前真实进度（退出时读取），
      // 不再用进入全屏时的 base.currentTime 快照（双路径写进度风险）。
      const now = playerRef.current?.currentTime ?? base?.currentTime ?? 0;
      usePlayerStore.getState().setFullscreenState({
        bvid: base?.bvid ?? id,
        aid: base?.aid ?? aid,
        cid: base?.cid ?? cid,
        title: base?.title ?? title,
        pic: base?.pic ?? pic,
        // F4：全屏内切画质后必须回写新 playUrl，否则退出全屏清晰度悄悄回退。
        // 这里用 playUrlRef.current（始终是最新值），不再回退到进入全屏时的旧快照。
        playUrl: playUrlRef.current || base?.playUrl || playUrl,
        currentTime: now,
        playbackRate: playerRef.current?.playbackRate || 1,
        volume: typeof playerRef.current?.volume === 'number' ? playerRef.current.volume : (base?.volume ?? 1),
        dmVisible: dmVisibleRef.current,
        subtitleVisible: subtitleVisibleRef.current,
        subtitleData: subtitleDataRef.current,
        sbSegments: base?.sbSegments ?? [],
        liked: base?.liked ?? liked,
        coined: base?.coined ?? coined,
        faved: base?.faved ?? faved,
        disliked: base?.disliked ?? disliked,
        onlineCount: base?.onlineCount ?? onlineCount,
        qualityList: qualityListRef.current,
        currentQn: currentQnRef.current,
        // 06-6.7：携带本次全屏会话号。主页面消费时校验一致，
        // 避免快速进出/页面先卸载时把陈旧会话写回（残留脏状态）。
        sessionId: sessionIdRef.current,
      });
      stateWrittenRef.current = true;
    } catch {}
  }

  function exitFullscreen() {
    if (lockedRef.current) {
      toggleLock();
      return;
    }
    try {
      writeFullscreenState();
      usePlayerStore.setState({ playing: playingRef.current });
      usePlayerStore.getState().syncProgress(playerRef.current?.currentTime || 0, playerRef.current?.duration || 0);
    } catch {}
    PiliPlayer.shared.dismissFullscreen();
    router.back();
  }

  useEffect(() => {
    exitFullscreenRef.current = exitFullscreen;
  });

  // 方向/状态栏由原生 presented VC 管理；卸载时写回进度/播放态并释放全屏 VC。
  useEffect(() => {
    return () => {
      try {
        writeFullscreenState();
        usePlayerStore.setState({ playing: playingRef.current });
        usePlayerStore.getState().syncProgress(playerRef.current?.currentTime || 0, playerRef.current?.duration || 0);
        const pt = Math.floor(playerRef.current?.currentTime || 0);
        // 01-B1：退出全屏补报一次最终进度（play_type=1），截至当前真实时间。
        // 若已在暂停时补报过（heartbeatFinalSentRef），则不重复上报。
        if (!heartbeatFinalSentRef.current) {
          heartbeatFinalSentRef.current = true;
          reportHeartbeatFinal({ aid, bvid: id, cid }, pt);
        }
        if (aid && cid && useAuthStore.getState().isLoggedIn && !useAuthStore.getState().anonymousMode) {
          videoApi.historyReport({ aid, cid, progress: pt }).catch(() => {});
        }
        if (gestureHudTimerRef.current) clearTimeout(gestureHudTimerRef.current);
        playerRef.current?.pause();
      } catch {}
      void cancelSleepTimer().catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ===== 控制栏显隐（播放中 4s 自动隐藏） ===== */
  const controlsOpacity = useSharedValue(1);
  const clearHide = useCallback(() => {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  }, []);
  const hideControls = useCallback(() => {
    controlsVisibleRef.current = false;
    setControlsShown(false);
    controlsOpacity.set(withTiming(0, { duration: 250 }));
  }, [controlsOpacity]);
  const pokeControls = useCallback(() => {
    if (lockedRef.current) return;
    if (!controlsVisibleRef.current) {
      controlsVisibleRef.current = true;
      setControlsShown(true);
      controlsOpacity.set(withTiming(1, { duration: 200 }));
    }
    clearHide();
    if (playingRef.current) {
      hideTimerRef.current = setTimeout(hideControls, 4000);
    }
  }, [clearHide, controlsOpacity, hideControls]);
  const handleTap = () => {
    if (lockedRef.current) return;
    if (controlsVisibleRef.current) hideControls();
    else pokeControls();
  };

  /* 长按加速开始/结束（JS 侧，04-3.4）：
   * 记录按下时的倍速，切到 longPressSpeedDefault，松手恢复原倍速。 */
  const boostStateRef = useRef<{ base: number } | null>(null);
  const startLongPressBoost = () => {
    const st = useSettingsStore.getState();
    if (!st.enableAutoLongPressSpeed) return;
    const p = playerRef.current;
    if (!p) return;
    boostStateRef.current = { base: (typeof p.playbackRate === 'number' ? p.playbackRate : 1) || 1 };
    p.playbackRate = st.longPressSpeedDefault || 3;
    feedBack();
  };
  const endLongPressBoost = () => {
    const base = boostStateRef.current?.base;
    boostStateRef.current = null;
    if (base) {
      try { playerRef.current!.playbackRate = base; } catch {}
    }
  };

  useEffect(() => {
    if (!playing || locked) return;
    clearHide();
    hideTimerRef.current = setTimeout(hideControls, 4000);
    return clearHide;
  }, [clearHide, hideControls, locked, playing]);

  const togglePlay = () => {
    if (lockedRef.current) return;
    pokeControls();
    const p = playerRef.current;
    if (!p) return;
    if (playingRef.current) p.pause();
    else p.play();
  };

  const commitSeek = (t: number) => {
    if (lockedRef.current) return;
    playerRef.current.currentTime = t;
    setCurrentTime(t);
    pokeControls();
  };

  function toggleLock() {
    const next = !lockedRef.current;
    lockedRef.current = next;
    setLocked(next);
    if (next) {
      clearHide();
      setSettingsVisible(false);
      controlsVisibleRef.current = false;
      setControlsShown(false);
      controlsOpacity.set(withTiming(0, { duration: 180 }));
    } else {
      pokeControls();
    }
  }
  const handleDmDensityChange = useCallback((markers: DanmakuDensityMarker[]) => {
    setDmDensity(markers);
  }, []);

  /* 手势 HUD（04-B2：原生 HUD 已移除，亮度/音量反馈统一走 RN 侧，与详情页一致） */
  const [gestureHud, setGestureHud] = useState<{ type: 'brightness' | 'volume'; value: number } | null>(null);
  const gestureHudTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hideGestureHud = useCallback(() => {
    if (gestureHudTimerRef.current) clearTimeout(gestureHudTimerRef.current);
    gestureHudTimerRef.current = setTimeout(() => {
      gestureHudTimerRef.current = null;
      setGestureHud(null);
    }, 350);
  }, []);

  // 04-B3/B4/17：双击循环切换画面比例（contain → cover → fill）。
  // 单一事实源为 settings.videoGravity（并行代理 F3 维护）；同时回写
  // usePlayerStore.videoGravity 以兼容 F1 详情页（并行期间两处字段都可用）。
  const cycleVideoGravity = useCallback(() => {
    const current = (useSettingsStore.getState() as any).videoGravity ?? 'contain';
    const next = nextVideoGravity(current as VideoGravity);
    useSettingsStore.getState().set({ videoGravity: next } as any);
    usePlayerStore.getState().setVideoGravity(next);
    showToast(`画面比例：${VIDEO_GRAVITY_LABELS[next]}`);
  }, []);

  const playerWidthSV = useSharedValue(winW);

  /* ===== 点按：单击显隐控制栏；双击中央播放暂停 / 左右快退快进；长按倍速 ===== */
  const doubleTapSeek = (x: number) => {
    if (lockedRef.current) return;
    // 04-B3/B4：关闭"双击快退/快进"时，双击循环切换画面比例（contain/cover/fill）。
    // 该分支原本整体无效（enableQuickDouble 关闭后双击无任何行为），
    // 现在让出给画面模式切换，避免与既有双击 seek 语义冲突。
    if (!useSettingsStore.getState().enableQuickDouble) {
      cycleVideoGravity();
      return;
    }
    const w = playerWidthSV.value > 0 ? playerWidthSV.value : winW;
    const dur = durationSV.value;
    if (x < w / 3 || x > (w * 2) / 3) {
      if (dur <= 0) return;
      const step = useSettingsStore.getState().fastForBackwardDuration || 10;
      const target = Math.min(Math.max((playerRef.current?.currentTime || 0) + (x < w / 3 ? -step : step), 0), dur);
      commitSeek(target);
    } else {
      togglePlay();
    }
  };
  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .enabled(!locked)
    .onEnd((e) => {
      runOnJS(doubleTapSeek)(e.x);
    });
  const singleTap = Gesture.Tap()
    .numberOfTaps(1)
    .enabled(!locked)
    .onEnd(() => {
      runOnJS(handleTap)();
    });

  /* ===== 长按倍速（04-3.3/04-3.4：长按加速 JS 侧） =====
   * 04-B6-5 全屏手势单一事实源：原生 pan 已移除，这里补齐详情页已有的长按倍速，
   * 保证长按手势在全屏下仍可用（与 seekPanGesture/verticalPan 由 Race 仲裁）。
   * 全屏页无 seek 进度条拖动，故长按直接对应"长按加速"语义。 */
  const longPressBoost = Gesture.LongPress()
    .minDuration(350)
    .maxDistance(20)
    .enabled(!locked)
    .onStart(() => {
      runOnJS(startLongPressBoost)();
    })
    .onFinalize(() => {
      runOnJS(endLongPressBoost)();
    });

  /* ===== 全屏竖向手势（04-B6-5 / 04-3.3）：JS RNGH 为唯一手势源 =====
   * 原生 PiliFullscreenController 的 window 级 pan（亮度/音量）与 HUD 已移除，
   * 这里统一承接：左 1/3=亮度、右 1/3=音量、中部=滑动退出全屏（enableSlideFS）、
   * 底部=拖字幕（enableDragSubtitle）。
   * failOffsetX 从 [-8,8] 放宽到 [-16,16]：斜向滑动不再轻易失败（04-3.3-②）。
   * 音量/亮度反馈走 RN gestureHud（与详情页一致，替代原生字母 HUD）。 */
  const verticalModeSV = useSharedValue(0); // 0=none 1=subtitle 2=brightness 3=volume 4=fullscreen
  const subtitleBaseSV = useSharedValue(useSettingsStore.getState().subtitlePaddingB ?? 24);
  const fsSlideTriggeredSV = useSharedValue(0);
  const brightnessBaseSV = useSharedValue(0.5);
  const volumeBaseSV = useSharedValue(0.7);
  const dragSubtitleSV = useSharedValue(enableDragSubtitle ? 1 : 0);
  const fsSlideSV = useSharedValue(enableSlideFS ? 1 : 0);
  const brightnessSlideSV = useSharedValue(enableSlideVolumeBrightness ? 1 : 0);
  useEffect(() => { dragSubtitleSV.set(enableDragSubtitle ? 1 : 0); }, [enableDragSubtitle, dragSubtitleSV]);
  useEffect(() => { fsSlideSV.set(enableSlideFS ? 1 : 0); }, [enableSlideFS, fsSlideSV]);
  useEffect(() => { brightnessSlideSV.set(enableSlideVolumeBrightness ? 1 : 0); }, [enableSlideVolumeBrightness, brightnessSlideSV]);

  const startSubtitleDrag = () => {
    subtitleBaseSV.set(useSettingsStore.getState().subtitlePaddingB ?? 24);
  };

  const updateSubtitlePadding = (v: number) => {
    const next = Math.min(200, Math.max(0, Math.round(v)));
    useSettingsStore.getState().set({ subtitlePaddingB: next });
  };

  const readBrightness = () => {
    try {
      const b = nativeGetBrightness();
      brightnessBaseSV.set(b);
      setGestureHud({ type: 'brightness', value: b });
    } catch {
      brightnessBaseSV.set(0.7);
      setGestureHud({ type: 'brightness', value: 0.7 });
    }
  };
  const applyBrightness = (val: number) => {
    nativeSetBrightness(val);
    setGestureHud({ type: 'brightness', value: val });
  };
  const readVolume = () => {
    const vol = typeof playerRef.current?.volume === 'number' ? playerRef.current.volume : 1;
    volumeBaseSV.set(vol);
    setGestureHud({ type: 'volume', value: vol });
  };
  const applyVolume = (val: number) => {
    if (playerRef.current) playerRef.current.volume = Math.min(Math.max(val, 0), 1);
    setGestureHud({ type: 'volume', value: val });
  };

  const triggerFsSlide = (dy: number) => {
    const st = useSettingsStore.getState();
    if (!st.enableSlideFS) return;
    const reverse = st.fullScreenGestureReverse;
    // 全屏页默认下滑退出，反向设置后上滑退出
    if ((!reverse && dy > 8) || (reverse && dy < -8)) {
      exitFullscreen();
    }
  };

  const subtitleZoneY = winH - insets.top - insets.bottom - 140;
  const verticalPanGesture = Gesture.Pan()
    .activeOffsetY([-16, 16])
    .failOffsetX([-16, 16])
    .enabled((enableDragSubtitle || enableSlideFS || enableSlideVolumeBrightness) && !locked)
    .onStart((e) => {
      const w = playerWidthSV.value > 0 ? playerWidthSV.value : winW;
      const third = w / 3;
      if (dragSubtitleSV.value === 1 && e.y >= subtitleZoneY) {
        verticalModeSV.set(1);
        runOnJS(startSubtitleDrag)();
      } else if (brightnessSlideSV.value === 1 && e.x < third) {
        verticalModeSV.set(2);
        runOnJS(readBrightness)();
      } else if (brightnessSlideSV.value === 1 && e.x > third * 2) {
        verticalModeSV.set(3);
        runOnJS(readVolume)();
      } else if (fsSlideSV.value === 1) {
        verticalModeSV.set(4);
      } else {
        verticalModeSV.set(0);
      }
      if (verticalModeSV.value === 2 || verticalModeSV.value === 3) {
        runOnJS(clearHide)();
      }
    })
    .onUpdate((e) => {
      const mode = verticalModeSV.value;
      if (mode === 0) return;
      if (mode === 1) {
        runOnJS(updateSubtitlePadding)(subtitleBaseSV.value - e.translationY);
        return;
      }
      if (mode === 4) {
        if (fsSlideTriggeredSV.value === 0 && Math.abs(e.translationY) > 8) {
          fsSlideTriggeredSV.set(1);
          runOnJS(triggerFsSlide)(e.translationY);
        }
        return;
      }
      const delta = -e.translationY / 200;
      const newVal = Math.min(1, Math.max(0, (mode === 2 ? brightnessBaseSV : volumeBaseSV).value + delta));
      if (mode === 2) runOnJS(applyBrightness)(newVal);
      else if (mode === 3) runOnJS(applyVolume)(newVal);
    })
    .onFinalize(() => {
      fsSlideTriggeredSV.set(0);
      runOnJS(hideGestureHud)();
      runOnJS(pokeControls)();
    });
  const tapGesture = Gesture.Race(
    longPressBoost,
    verticalPanGesture,
    Gesture.Exclusive(doubleTap, singleTap),
  );

  /* ===== 互动操作（对齐 Flutter 全屏 action 行） ===== */
  const handleLike = async () => {
    if (!aid || !useAuthStore.getState().isLoggedIn) { showToast('请先登录'); return; }
    feedBackSuccess();
    const next = !liked;
    setLiked(next);
    if (next) setDisliked(false);
    await videoApi.like({ aid, like: next ? 1 : 2 }).catch(() => setLiked(!next));
  };
  const handleDislike = async () => {
    if (!aid || !useAuthStore.getState().isLoggedIn) { showToast('请先登录'); return; }
    feedBackSelection();
    const next = !disliked;
    try {
      const res = await videoApi.dislike({ aid, dislike: next ? '0' : '1' });
      if (res?.code === 0) {
        setDisliked(next);
        if (next && liked) setLiked(false);
        showToast(next ? '已点踩' : '已取消点踩');
      } else {
        showToast(res?.message || '操作失败');
      }
    } catch {
      showToast('操作失败');
    }
  };
  const handleTriple = async () => {
    if (!useAuthStore.getState().isLoggedIn) { showToast('请先登录'); return; }
    if (!id) return;
    feedBackSuccess();
    try {
      const res = await videoApi.triple({ aid, bvid: id });
      if (res?.code === 0) {
        setLiked(true);
        setCoined(true);
        setFaved(true);
        setDisliked(false);
        showToast('三连成功');
      } else {
        showToast(res?.message || '操作失败');
      }
    } catch {
      showToast('操作失败');
    }
  };
  const handleCoin = async () => {
    if (!aid || !useAuthStore.getState().isLoggedIn) { showToast('请先登录'); return; }
    if (coined) return;
    feedBackSuccess();
    setCoined(true);
    await videoApi.coin({ aid, multiply: 1 }).catch(() => setCoined(false));
  };
  const handleFav = async () => {
    if (!aid || !useAuthStore.getState().isLoggedIn) { showToast('请先登录'); return; }
    feedBackSuccess();
    const next = !faved;
    setFaved(next);
    await videoApi.favVideo({
      rid: aid, type: 2,
      add_media_ids: next ? '0' : '',
      del_media_ids: next ? '' : '0',
    }).catch(() => setFaved(!next));
  };
  const handleShare = () => {
    feedBack();
    Share.share({
      title,
      message: `https://www.bilibili.com/video/${id}`,
    }).catch(() => {});
  };

  const handleScreenshot = () => {
    pokeControls();
    captureVideoFrameToAlbum(
      playerRef.current,
      playerRef.current?.currentTime ?? currentTime
    );
  };

  /* ===== 设置：画质切换 / CDN 或编码重载（替换源后恢复进度并续播） ===== */
  async function changeQuality(qn: number) {
    if (!cid || qn === currentQn) return;
    try {
      const res = await videoApi.playUrl({ bvid: id, cid, qn });
      const url = getBestPlayUrl(res?.data);
      if (url) {
        const t = playerRef.current?.currentTime || 0;
        await playerRef.current?.replaceAsync({ uri: url, headers: { ...PLAYER_HEADERS } });
        playerRef.current.currentTime = t;
        playerRef.current.play();
        setCurrentQn(qn);
        // F4：全屏内切画质成功后立即把新 playUrl/画质写回 fullscreenState，
        // 退出全屏时详情页可据此恢复画质（use-video-controller 消费 fullscreenState）。
        playUrlRef.current = url;
        try {
          const base = usePlayerStore.getState().fullscreenState;
          usePlayerStore.getState().setFullscreenState({
            bvid: base?.bvid ?? id,
            aid: base?.aid ?? aid,
            cid: base?.cid ?? cid,
            title: base?.title ?? title,
            pic: base?.pic ?? pic,
            playUrl: url,
            currentTime: base?.currentTime ?? 0,
            playbackRate: playerRef.current?.playbackRate || 1,
            volume: typeof playerRef.current?.volume === 'number' ? playerRef.current.volume : (base?.volume ?? 1),
            dmVisible: dmVisibleRef.current,
            subtitleVisible: subtitleVisibleRef.current,
            subtitleData: subtitleDataRef.current,
            sbSegments: base?.sbSegments ?? [],
            liked: base?.liked ?? liked,
            coined: base?.coined ?? coined,
            faved: base?.faved ?? faved,
            disliked: base?.disliked ?? disliked,
            onlineCount: base?.onlineCount ?? onlineCount,
            qualityList: qualityListRef.current,
            currentQn: qn,
            sessionId: sessionIdRef.current,
          });
        } catch {}
        feedBackSuccess();
        showToast('画质已切换');
      }
    } catch {
      showToast('切换失败');
    }
  }
  async function reloadSource() {
    try {
      const res = await videoApi.playUrl({ bvid: id, cid, qn: currentQn || 0 });
      const url = getBestPlayUrl(res?.data);
      if (!url) return;
      const t = playerRef.current?.currentTime || 0;
      await playerRef.current?.replaceAsync({ uri: url, headers: { ...PLAYER_HEADERS } });
      playerRef.current.currentTime = t;
      playerRef.current.play();
      // 重载成功即更新真实 URL，保证退出全屏回写的 playUrl 是新地址
      playUrlRef.current = url;
      setPlayError(null);
    } catch {}
  }

  const handleSpeedChange = (sp: number) => {
    setPlaySpeed(sp);
    playerRef.current.playbackRate = sp;
  };
  const handleVolumeChange = (v: number) => {
    playerRef.current.volume = v;
  };
  const handleSubtitleSelect = async (url: string) => {
    try {
      const fullUrl = normalizeHttpUrl(url);
      const json = await fetchSubtitleJson(fullUrl);
      if (json?.body && Array.isArray(json.body)) {
        setSubtitleData(json.body);
        setSubtitleVisible(true);
        showToast('字幕已加载');
      }
    } catch {
      showToast('字幕加载失败');
    }
  };
  const handleSubtitleClose = () => {
    setSubtitleVisible(false);
    setSubtitleData([]);
  };
  const toggleDanmaku = () => {
    pokeControls();
    setDmVisible(!dmVisible);
  };
  const openSettings = () => {
    pokeControls();
    setSettingsVisible(true);
  };
  const closeSettings = () => setSettingsVisible(false);

  // 04-B1/B4：进入全屏按 FULLSCREEN_MODES 锁方向，退出（卸载）恢复竖屏。
  // 方向交由 expo-screen-orientation 统一接管；原生 PiliFullscreenController 不再做旋转。
  // mode 0=横向全屏 → LANDSCAPE；mode 1=竖向全屏 → PORTRAIT_UP；
  // mode 2=不改变方向 → 保持竖屏（原实现允许全方向旋转，语义相反，一并修正）。
  // 04-B4：mode 0 下若视频为竖屏（宽 < 高），自动锁 PORTRAIT 实现竖屏全屏（对齐 Flutter changeOrientation）。
  useEffect(() => {
    if (!player) return;
    (async () => {
      try {
        let orientation = ScreenOrientation.OrientationLock.LANDSCAPE;
        if (fullScreenMode === 0) {
          const track = (player as any).videoTrack;
          const isVertical = !!(track?.size && track.size.width > 0 && track.size.width < track.size.height);
          orientation = isVertical
            ? ScreenOrientation.OrientationLock.PORTRAIT_UP
            : ScreenOrientation.OrientationLock.LANDSCAPE;
        } else {
          // mode 1（竖向）与 mode 2（不改变方向，保持竖屏）统一锁竖屏
          orientation = ScreenOrientation.OrientationLock.PORTRAIT_UP;
        }
        await ScreenOrientation.lockAsync(orientation);
      } catch {}
    })();
    return () => {
      // 退出全屏恢复竖屏
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {});
    };
  }, [fullScreenMode, player]);

  return {
    id,
    aid,
    cid,
    title,
    pic,
    playUrl,
    onlineCount,
    winH,
    safePadding,
    insets,
    player,
    enhanceEnabled,
    enhanceOptions,
    onEnhancementError,
    onEnhancementStateChange,
    currentTime,
    duration,
    buffering,
    playError,
    onPreviewTime: setCurrentTime,
    commitSeek,
    coverShown,
    setCoverShown,
    controlsShown,
    controlsOpacity,
    playing,
    locked,
    settingsVisible,
    dmVisible,
    dmDensity,
    subtitleVisible,
    subtitleData,
    liked,
    disliked,
    coined,
    faved,
    qualityList,
    currentQn,
    playSpeed,
    videoInfo,
    playerWidthSV,
    tapGesture,
    videoGravity,
    gestureHud,
    handleDmDensityChange,
    togglePlay,
    toggleLock,
    toggleDanmaku,
    openSettings,
    closeSettings,
    exitFullscreen,
    handleLike,
    handleDislike,
    handleTriple,
    handleCoin,
    handleFav,
    handleShare,
    handleScreenshot,
    showFSActionItem,
    showFSLockBtn,
    showFsScreenshotBtn,
    showBatteryLevel,
    btmProgressBehavior,
    changeQuality,
    reloadSource,
    handleSpeedChange,
    handleVolumeChange,
    handleSubtitleSelect,
    handleSubtitleClose,
  };
}

export function useNativeFullscreenPlayer() {
  // 01-R5/06-C7：渲染期副作用移入 effect——原实现直接在渲染体调原生单例 setter，
  // StrictMode / React Compiler 下会重复执行。移入一次性 effect 保证只应用一次。
  useEffect(() => {
    const cfg = getPlayerConfig();
    PiliPlayer.shared.setLoop(cfg.playRepeat === 1);
    PiliPlayer.shared.setMuted(false);
    PiliPlayer.shared.setBufferConfig(cfg.bufferSec);
  }, []);
  return useFullscreenPlayerWith(PiliPlayer.shared);
}

export type FullscreenPlayerController = ReturnType<typeof useFullscreenPlayerWith>;
