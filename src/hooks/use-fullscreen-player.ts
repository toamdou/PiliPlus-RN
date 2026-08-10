import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Share, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { PiliPlayer } from 'pili-player';
import { Gesture } from 'react-native-gesture-handler';
import { runOnJS, useSharedValue, withTiming } from 'react-native-reanimated';
import { cancelSleepTimer } from 'pili-native-core';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { showToast } from '@/utils/toast';
import { videoApi } from '@/api/video';
import { useAuthStore } from '@/stores/auth';
import { useSettingsStore } from '@/stores/settings';
import { getBestPlayUrl, getPlayerConfig, PLAYER_HEADERS } from '@/utils/player-utils';
import { feedBack, feedBackSelection, feedBackSuccess } from '@/utils/feedback';
import { normalizeHttpUrl } from '@/utils/format';
import type { DanmakuDensityMarker } from '@/components/DanmakuOverlay';
import { usePlayerStore } from '@/stores/player';
import type { SBSegment } from '@/api/sponsor-block';
import { useVideoEnhance } from '@/hooks/use-video-enhance';
import { fetchSubtitleJson } from '@/hooks/use-video-controller';
import { captureVideoFrameToAlbum } from '@/utils/screenshot';
import { sortSkipSegments } from '@/utils/skip-segments';

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
  const enableDragSubtitle = useSettingsStore((s) => s.enableDragSubtitle);
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
  const dmVisibleRef = useRef(dmVisible);
  const subtitleVisibleRef = useRef(subtitleVisible);
  const subtitleDataRef = useRef(subtitleData);
  const [dmDensity, setDmDensity] = useState<DanmakuDensityMarker[]>([]);
  useEffect(() => { dmVisibleRef.current = dmVisible; }, [dmVisible]);
  useEffect(() => { subtitleVisibleRef.current = subtitleVisible; }, [subtitleVisible]);
  useEffect(() => { subtitleDataRef.current = subtitleData; }, [subtitleData]);

  const videoSource = useMemo(() => {
    if (!playUrl) return null;
    return { uri: playUrl, headers: { ...PLAYER_HEADERS } };
  }, [playUrl]);

  const playerRef = useRef<any>(player);
  useEffect(() => { playerRef.current = player; }, [player]);

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
      // 全屏播放同样上报心跳，避免进入全屏后上报中断
      if (
        useSettingsStore.getState().enableHeartbeat &&
        !useAuthStore.getState().anonymousMode &&
        e.currentTime - lastHeartbeatRef.current >= 5 &&
        aid && cid
      ) {
        lastHeartbeatRef.current = e.currentTime;
        videoApi.heartbeat({
          aid,
          bvid: id,
          cid,
          played_time: Math.floor(e.currentTime),
          real_time: Math.floor(e.currentTime),
          play_type: 0,
          network_type: 0,
        }).catch(() => {});
      }
    });
    const endSub = player.addListener('playToEnd', () => {
      if (!useSettingsStore.getState().enableAutoExit) return;
      lockedRef.current = false;
      exitFullscreenRef.current();
    });
    const playingSub = player.addListener('playingChange', (e: any) => {
      playingRef.current = !!e.isPlaying;
      setPlaying(!!e.isPlaying);
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
    if ((player as any).status === 'readyToPlay') applyReady();
    return () => { sub.remove(); playingSub.remove(); statusSub.remove(); endSub.remove(); };
  }, [player, aid, cid, durationSV, id, initSpeed, initVolume, seekTo]);

  // 退出全屏时把播放器设置写回 usePlayerStore，主页面 useFocusEffect 消费后清零
  function writeFullscreenState() {
    try {
      const base = usePlayerStore.getState().fullscreenState;
      usePlayerStore.getState().setFullscreenState({
        bvid: base?.bvid ?? id,
        aid: base?.aid ?? aid,
        cid: base?.cid ?? cid,
        title: base?.title ?? title,
        pic: base?.pic ?? pic,
        playUrl: base?.playUrl ?? playUrl,
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
        currentQn: currentQnRef.current,
      });
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
        if (useSettingsStore.getState().enableHeartbeat && !useAuthStore.getState().anonymousMode && aid && cid) {
          videoApi.heartbeat({
            aid,
            bvid: id,
            cid,
            played_time: pt,
            real_time: pt,
            play_type: 1,
            network_type: 0,
          }).catch(() => {});
        }
        if (aid && cid && useAuthStore.getState().isLoggedIn && !useAuthStore.getState().anonymousMode) {
          videoApi.historyReport({ aid, cid, progress: pt }).catch(() => {});
        }
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

  const playerWidthSV = useSharedValue(winW);

  /* ===== 点按：单击显隐控制栏；双击中央播放暂停 / 左右快退快进 ===== */
  const doubleTapSeek = (x: number) => {
    if (lockedRef.current) return;
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

  /* ===== 全屏竖向手势：底部拖字幕（enableDragSubtitle），中部滑动退出全屏（enableSlideFS + 反向） ===== */
  const verticalModeSV = useSharedValue(0); // 0=none 1=subtitle 2=fullscreen
  const subtitleBaseSV = useSharedValue(useSettingsStore.getState().subtitlePaddingB ?? 24);
  const fsSlideTriggeredSV = useSharedValue(0);
  const dragSubtitleSV = useSharedValue(enableDragSubtitle ? 1 : 0);
  const fsSlideSV = useSharedValue(enableSlideFS ? 1 : 0);
  useEffect(() => { dragSubtitleSV.set(enableDragSubtitle ? 1 : 0); }, [enableDragSubtitle, dragSubtitleSV]);
  useEffect(() => { fsSlideSV.set(enableSlideFS ? 1 : 0); }, [enableSlideFS, fsSlideSV]);

  const startSubtitleDrag = () => {
    subtitleBaseSV.set(useSettingsStore.getState().subtitlePaddingB ?? 24);
  };

  const updateSubtitlePadding = (v: number) => {
    const next = Math.min(200, Math.max(0, Math.round(v)));
    useSettingsStore.getState().set({ subtitlePaddingB: next });
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
    .failOffsetX([-8, 8])
    .enabled((enableDragSubtitle || enableSlideFS) && !locked)
    .onStart((e) => {
      if (dragSubtitleSV.value === 1 && e.y >= subtitleZoneY) {
        verticalModeSV.set(1);
        runOnJS(startSubtitleDrag)();
      } else if (fsSlideSV.value === 1) {
        verticalModeSV.set(2);
      } else {
        verticalModeSV.set(0);
      }
    })
    .onUpdate((e) => {
      if (verticalModeSV.value === 1) {
        runOnJS(updateSubtitlePadding)(subtitleBaseSV.value - e.translationY);
      } else if (verticalModeSV.value === 2 && fsSlideTriggeredSV.value === 0 && Math.abs(e.translationY) > 8) {
        fsSlideTriggeredSV.set(1);
        runOnJS(triggerFsSlide)(e.translationY);
      }
    })
    .onFinalize(() => {
      fsSlideTriggeredSV.set(0);
    });
  const tapGesture = Gesture.Race(verticalPanGesture, Gesture.Exclusive(doubleTap, singleTap));

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
  const cfg = getPlayerConfig();
  PiliPlayer.shared.setLoop(cfg.playRepeat === 1);
  PiliPlayer.shared.setMuted(false);
  PiliPlayer.shared.setBufferConfig(cfg.bufferSec);
  return useFullscreenPlayerWith(PiliPlayer.shared);
}

export type FullscreenPlayerController = ReturnType<typeof useFullscreenPlayerWith>;
