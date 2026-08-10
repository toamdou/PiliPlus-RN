/* eslint-disable react-hooks/exhaustive-deps, react-hooks/immutability, react-hooks/refs */
import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useWindowDimensions, Alert, AppState, type NativeSyntheticEvent, type NativeScrollEvent } from 'react-native';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { PiliPlayer } from 'pili-player';
import {
  cancelSleepTimer,
  getBrightness as nativeGetBrightness,
  setBrightness as nativeSetBrightness,
} from 'pili-native-core';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Gesture } from 'react-native-gesture-handler';
import { useSharedValue, useAnimatedStyle, useAnimatedScrollHandler, withTiming, withSpring, runOnJS, Easing } from 'react-native-reanimated';
import { showToast } from '@/utils/toast';
import { videoApi } from '@/api/video';
import { danmakuApi } from '@/api/danmaku';
import { userApi } from '@/api/user';
import { useAuthStore } from '@/stores/auth';
import { useSettingsStore } from '@/stores/settings';
import { useNetwork } from '@/utils/network';
import { filterRelatedVideos } from '@/utils/recommend-filter';
import { getBestPlayUrl, getPlayerConfig, PLAYER_HEADERS, qualityStreamingLimits, formatPlayerTime } from '@/utils/player-utils';
import { biliCover } from '@/utils/image-url';
import { feedBack, feedBackSuccess, feedBackSelection } from '@/utils/feedback';
import { normalizeHttpUrl } from '@/utils/format';
import { createNativeRequestCancelToken, type NativeRequestCancelToken } from '@/utils/request-cancel';
import type { DanmakuDensityMarker } from '@/components/DanmakuOverlay';
import { usePlayerStore } from '@/stores/player';
import { startAudioPlayback, releaseAudioPlayer, getBestAudioUrl } from '@/utils/audio-player';
import { useFocusAwarePlayer } from '@/hooks/use-focus-aware-player';
import { sponsorBlockApi, type SBSegment } from '@/api/sponsor-block';
import { useVideoComments, type VideoInfo } from '@/hooks/use-video-comments';
import { addDownload } from '@/utils/download';
import { clamp01, useVideoPlayback } from '@/hooks/use-video-playback';
import { useVideoActions } from '@/hooks/use-video-actions';
import { beginAudioTransitionTaskAsync, endAudioTransitionTaskAsync } from 'pili-audio';
import { loadSubtitleJsonAsync } from 'pili-danmaku';

export async function fetchSubtitleJson(url: string): Promise<any> {
  const body = await loadSubtitleJsonAsync(url);
  return body.length > 0 ? { body } : null;
}

/** tempPlayerConf 开启时，页面卸载前需要还原的播放器相关设置 */
const TEMP_PLAYER_KEYS = [
  'cdnService',
  'playRepeat',
  'danmakuEnabled',
  'mergeDanmaku',
  'danmakuFontSize',
  'danmakuSpeed',
  'danmakuOpacity',
  'preferCodec',
  'enableSponsorBlock',
  'playerVolume',
  'defaultPlaySpeed',
  'subtitlePreference',
  'subtitleFontScale',
  'subtitleFontScaleFS',
  'subtitleFontWeight',
  'subtitleStrokeWidth',
  'subtitlePaddingH',
  'subtitlePaddingB',
  'subtitleBgOpacity',
] as const;

function useVideoControllerWithPlayer(player: any) {
  const { id, t } = useLocalSearchParams<{ id: string; t?: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width: winW, height: winH } = useWindowDimensions();
  const tempPlayerSnapshotRef = useRef<Record<string, unknown> | null>(null);
  const { isLoggedIn } = useAuthStore();
  const audioMode = usePlayerStore((s) => s.audioMode);
  const enableSlideVolumeBrightness = useSettingsStore((s) => s.enableSlideVolumeBrightness);
  const enableSlideFS = useSettingsStore((s) => s.enableSlideFS);
  const enableVerticalExpand = useSettingsStore((s) => s.enableVerticalExpand);
  const enableDragSubtitle = useSettingsStore((s) => s.enableDragSubtitle);
  const [info, setInfo] = useState<VideoInfo | null>(null);
  const infoRef = useRef<VideoInfo | null>(null);
  useEffect(() => {
    infoRef.current = info;
  }, [info]);

  const comments = useVideoComments(info);
  const [playUrl, setPlayUrl] = useState('');
  const [loading, setLoading] = useState(true);
  const [related, setRelated] = useState<any[]>([]);
  const [activePage, setActivePage] = useState(0);
  const [activeCid, setActiveCid] = useState(0);
  const pageSeqRef = useRef(0);
  const playDataRef = useRef<any>(null);
  const [liked, setLiked] = useState(false);
  const [coined, setCoined] = useState(false);
  const [faved, setFaved] = useState(false);
  const [disliked, setDisliked] = useState(false);
  const [followed, setFollowed] = useState(false);
  const [onlineCount, setOnlineCount] = useState('');
  const [aiSummary, setAiSummary] = useState('');
  const [expanded, setExpanded] = useState(false);
  const [dmVisible, setDmVisible] = useState(true);
  const [dmDensity, setDmDensity] = useState<DanmakuDensityMarker[]>([]);
  const [settingsVisible, setSettingsVisible] = useState(false);
  const [dmInputVisible, setDmInputVisible] = useState(false);
  const [dmText, setDmText] = useState('');
  /** 评论排序（对齐 Flutter replySortType：0=最热 1=最新），切换时重置并重新拉取 */
  /** 自由复制对话框（对齐 Flutter showReplyCopyDialog：可选中文本） */
  const [activeTab, setActiveTab] = useState<'intro' | 'comments'>('intro');
  const [subtitleData, setSubtitleData] = useState<{ from: number; to: number; content: string }[]>([]);
  const [subtitleVisible, setSubtitleVisible] = useState(false);
  const [qualityList, setQualityList] = useState<{ quality: number; new_description: string }[]>([]);
  const [currentQn, setCurrentQn] = useState(0);
  const [steinChoices, setSteinChoices] = useState<{ id: number; cid: number; option: string }[]>([]);
  const [showStein, setShowStein] = useState(false);
  const graphVersionRef = useRef<number | undefined>(undefined);
  const [sbSegments, setSbSegments] = useState<SBSegment[]>([]);
  const videoViewRef = useRef<any>(null);

  // B站 CDN 要求 Referer 头，否则返回 403
  const videoSource = useMemo(() => {
    if (!playUrl) return null;
    return {
      uri: playUrl,
      headers: { ...PLAYER_HEADERS },
    };
  }, [playUrl]);

  // 焦点感知：失焦暂停 + 受控自动播放
  const { tryAutoPlay } = useFocusAwarePlayer(player);
  const enterFullscreenRef = useRef<() => void>(() => {});
  const autoEnterFullscreenDoneRef = useRef(false);

  const playback = useVideoPlayback({
    player,
    playUrl,
    videoSource,
    initialSeekTime: t ? parseInt(t, 10) || 0 : 0,
    sbSegments,
    dmInputVisible,
    infoRef,
    autoEnterFullscreenDoneRef,
    autoEnterFullscreenRef: enterFullscreenRef,
    tryAutoPlay,
  });

  const {
    videoStarted,
    setVideoStarted,
    currentTimeRef,
    timeControlRef,
    isPlaying,
    isPlayingRef,
    playSpeed,
    setPlaySpeed,
    playSpeedRef,
    durationSV,
    progressRatio,
    scrubbing,
    trackWidthSV,
    playerWidthSV,
    isScrubbingRef,
    seekGuardRef,
    lastHeartbeatRef,
    hasSeekedRef,
    seekThumbnails,
    setSeekThumbnails,
    showSeekThumb,
    seekHudTarget,
    seekHudDelta,
    seekHudAnimStyle,
    controlsShown,
    controlsAnimStyle,
    pokeControls,
    clearHideTimer,
    boostBadgeStyle,
    speedBoost,
    scrubGesture,
    progressFillStyle,
    progressThumbStyle,
    progressTrackAnimStyle,
    doubleTapGesture,
    singleTapGesture,
    longPressGesture,
    seekPanGesture,
    seekToTime,
    changePlaySpeed,
    changeVolume,
    resetPlaybackState,
    clearPlaybackProgress,
  } = playback;

  const actions = useVideoActions({
    info,
    liked,
    coined,
    faved,
    followed,
    setLiked,
    setCoined,
    setFaved,
    setDisliked,
    setFollowed,
  });
  const {
    handleLike,
    handleCoin,
    handleFav,
    handleFollow,
    handleShare,
    handleCopyLink,
    handleViewLater,
    handleReportVideo,
  } = actions;

  /* tempPlayerConf：进入页面时快照播放器设置，离开时恢复全局值 */
  useEffect(() => {
    const st = useSettingsStore.getState();
    if (!st.tempPlayerConf) return;
    const snapshot: Record<string, unknown> = {};
    for (const key of TEMP_PLAYER_KEYS) {
      snapshot[key] = st[key];
    }
    tempPlayerSnapshotRef.current = snapshot;
    return () => {
      if (tempPlayerSnapshotRef.current) {
        useSettingsStore.getState().set(tempPlayerSnapshotRef.current as Partial<ReturnType<typeof useSettingsStore.getState>>);
        tempPlayerSnapshotRef.current = null;
      }
    };
  }, []);

  /** UGC 合集/剧集选集（ugc_season.sections[].episodes），按 cid 去重 */
  const seasonEpisodes = useMemo(() => {
    const sections = (info as any)?.ugc_season?.sections;
    if (!Array.isArray(sections)) return [];
    const out: { aid: number; bvid: string; cid: number; title: string }[] = [];
    const seen = new Set<number>();
    for (const section of sections) {
      for (const ep of section?.episodes || []) {
        const cid = Number(ep?.cid || 0);
        if (!cid || seen.has(cid)) continue;
        seen.add(cid);
        out.push({
          aid: Number(ep?.aid || 0),
          bvid: ep?.bvid || '',
          cid,
          title: ep?.title || ep?.long_title || `P${out.length + 1}`,
        });
      }
    }
    return out;
  }, [info]);
  const currentCid = activeCid || info?.cid || 0;
  const playableCount = useMemo(() => {
    const ids = new Set((info?.pages || []).map((p) => p.cid));
    seasonEpisodes.forEach((ep) => ids.add(ep.cid));
    return ids.size;
  }, [info, seasonEpisodes]);

  /* ===== 播放器高度：按视频实际宽高比动态计算（videoTrackChange 驱动），滚动联动收起 =====
     对齐 Flutter video_detail_controller.dart：
     - minVideoHeight = 屏宽/16:9（横屏视频高度）
     - maxVideoHeight = max(屏高*0.65, 屏宽)（竖屏视频高度）
     - 播放中：滚动最多收起到 16:9（钉住）；暂停：滚动可完全收起到状态栏黑条+工具栏槽位 */
  const TOOLBAR_HEIGHT = 44;
  const scrollYSV = useSharedValue(0);
  const [videoAspect, setVideoAspect] = useState(16 / 9);
  const minVideoHeight = (winW * 9) / 16;
  const baseMaxVideoHeight = Math.max(Math.max(winH, winW) * 0.65, Math.min(winH, winW));
  const maxVideoHeight = Math.max(
    baseMaxVideoHeight,
    enableVerticalExpand && videoAspect < 1 ? winH - insets.top - TOOLBAR_HEIGHT : 0,
  );
  const playerBaseHeight = insets.top + Math.min(Math.max(winW / videoAspect, minVideoHeight), maxVideoHeight);
  const baseHeightSV = useSharedValue(playerBaseHeight);
  useEffect(() => {
    // 视频比例变化时 200ms 平滑过渡（对齐 Flutter expand/collapse 动画）
    baseHeightSV.set( withTiming(playerBaseHeight, { duration: 200, easing: Easing.out(Easing.ease) }));
  }, [playerBaseHeight]);
  const isPlayingSV = useSharedValue(0); // worklet 播放态镜像：1=播放中
  useEffect(() => { isPlayingSV.set( isPlaying ? 1 : 0); }, [isPlaying]);
  const playerCollapseStyle = useAnimatedStyle(() => {
    const minH = insets.top + (isPlayingSV.value === 1 ? minVideoHeight : TOOLBAR_HEIGHT);
    // clamp≥0：iOS bounce 的负偏移会让播放器高度超过基准，导致顶栏抽搐
    const h = Math.max(minH, baseHeightSV.value - Math.max(0, scrollYSV.value));
    return { height: h };
  });
  /* 暂停+上滑：渐变模糊蒙层（随收起进度 0→1，恢复播放淡出） */
  const collapseBlurStyle = useAnimatedStyle(() => {
    const base = baseHeightSV.value;
    const t = isPlayingSV.value === 1 ? 0 : clamp01((scrollYSV.value - base * 0.3) / (base * 0.4));
    return { opacity: t };
  });
  const [playerCollapsed, setPlayerCollapsed] = useState(false);
  const playerCollapsedRef = useRef(false);
  const playerCollapsedSV = useSharedValue(0);
  const applyCollapsed = useCallback((collapsed: boolean) => {
    playerCollapsedRef.current = collapsed;
    setPlayerCollapsed(collapsed);
  }, []);

  const playerRef = useRef<any>(player);
  useEffect(() => { playerRef.current = player; }, [player]);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const gestureHudTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadVideoTokenRef = useRef<NativeRequestCancelToken | null>(null);
  const sourceLoadTokenRef = useRef<NativeRequestCancelToken | null>(null);

  // 全屏页退出后：桥接进度 seek + 恢复播放态（usePlayerStore 写入一次即清零）
  useFocusEffect(useCallback(() => {
    const st = usePlayerStore.getState();
    if (st.audioMode) return;
    const fs = st.fullscreenState;
    if (fs) {
      if (fs.playbackRate > 0) {
        playSpeedRef.current = fs.playbackRate;
        setPlaySpeed(fs.playbackRate);
        try { playerRef.current.playbackRate = fs.playbackRate; } catch {}
      }
      try { playerRef.current.volume = Math.min(Math.max(fs.volume, 0), 1); } catch {}
      setDmVisible(fs.dmVisible);
      setSubtitleVisible(fs.subtitleVisible);
      if (fs.subtitleData) setSubtitleData(fs.subtitleData);
      usePlayerStore.getState().clearFullscreenState();
    }
    if (st.currentTime > 0) {
      try {
        playerRef.current.currentTime = st.currentTime;
        currentTimeRef.current = st.currentTime;
        timeControlRef.current?.publish(st.currentTime);
      } catch {}
      usePlayerStore.getState().syncProgress(0, 0);
    }
    if (st.playing && videoStarted) {
      try { playerRef.current.play(); } catch {}
    }
  }, [videoStarted]));

  // 监听视频轨道变化：按实际宽高比设置播放器容器高度（竖屏视频自适应加高）
  useEffect(() => {
    if (!player) return;
    const read = (tr: any) => {
      const s = tr?.size;
      if (s && s.width > 0 && s.height > 0) setVideoAspect(s.width / s.height);
    };
    read(player.videoTrack);
    const sub = player.addListener('videoTrackChange', (e: any) => read(e.videoTrack));
    return () => sub.remove();
  }, [player]);

  /* ===== 垂直拖动：左半屏=亮度，右半屏=音量（对齐 Flutter player_focus.dart） ===== */
  const [gestureHud, setGestureHud] = useState<{ type: 'brightness' | 'volume'; value: number } | null>(null);
  const gestureHudOpacity = useSharedValue(0);
  const gestureHudAnimStyle = useAnimatedStyle(() => ({ opacity: gestureHudOpacity.value }));
  const verticalBaseSV = useSharedValue(0);
  const verticalModeSV = useSharedValue(0); // 0=none 1=brightness 2=volume 3=fullscreen 4=subtitle
  const subtitleBaseSV = useSharedValue(useSettingsStore.getState().subtitlePaddingB ?? 24);
  const fsSlideTriggeredSV = useSharedValue(0);
  const brightnessSlideSV = useSharedValue(enableSlideVolumeBrightness ? 1 : 0);
  const fsSlideSV = useSharedValue(enableSlideFS ? 1 : 0);
  const dragSubtitleSV = useSharedValue(enableDragSubtitle ? 1 : 0);
  useEffect(() => { brightnessSlideSV.set(enableSlideVolumeBrightness ? 1 : 0); }, [enableSlideVolumeBrightness, brightnessSlideSV]);
  useEffect(() => { fsSlideSV.set(enableSlideFS ? 1 : 0); }, [enableSlideFS, fsSlideSV]);
  useEffect(() => { dragSubtitleSV.set(enableDragSubtitle ? 1 : 0); }, [enableDragSubtitle, dragSubtitleSV]);

  const startSubtitleDrag = () => {
    subtitleBaseSV.set(useSettingsStore.getState().subtitlePaddingB ?? 24);
  };

  const updateSubtitlePadding = (v: number) => {
    const next = Math.min(200, Math.max(0, Math.round(v)));
    useSettingsStore.getState().set({ subtitlePaddingB: next });
  };

  const triggerSlideFullscreen = (dy: number) => {
    const st = useSettingsStore.getState();
    if (!st.enableSlideFS) return;
    const reverse = st.fullScreenGestureReverse;
    // 主播放页始终处于非全屏态：默认上滑进入，反向设置后下滑进入
    if ((!reverse && dy < -8) || (reverse && dy > 8)) {
      enterFullscreenRef.current?.();
    }
  };

  // 亮度读取/设置由原生同步接口完成，避免逐帧异步 Promise 跨桥
  const getBrightness = () => {
    try {
      const b = nativeGetBrightness();
      verticalBaseSV.set( b);
      setGestureHud({ type: 'brightness', value: b });
    } catch {
      verticalBaseSV.set( 0.7);
      setGestureHud({ type: 'brightness', value: 0.7 });
    }
  };

  const setBrightness = (val: number) => {
    nativeSetBrightness(val);
    setGestureHud({ type: 'brightness', value: val });
  };

  // 音量读取/设置（JS 线程——player 对象不可序列化到 worklet）
  const readVolume = () => {
    const vol = player.volume ?? 1;
    verticalBaseSV.set( vol);
    setGestureHud({ type: 'volume', value: vol });
  };
  const setVolume = (val: number) => {
    player.volume = val;
    setGestureHud({ type: 'volume', value: val });
  };
  const hideGestureHud = () => {
    if (gestureHudTimerRef.current) clearTimeout(gestureHudTimerRef.current);
    gestureHudTimerRef.current = setTimeout(() => {
      gestureHudTimerRef.current = null;
      setGestureHud(null);
    }, 350);
  };

  const verticalPanGesture = Gesture.Pan()
    .activeOffsetY([-16, 16])
    .failOffsetX([-8, 8])
    .enabled(enableSlideVolumeBrightness || enableSlideFS || enableDragSubtitle)
    .onStart((e) => {
      const w = playerWidthSV.value > 0 ? playerWidthSV.value : winW;
      const third = w / 3;
      const stageH = Math.max(0, baseHeightSV.value - Math.max(0, scrollYSV.value));
      if (dragSubtitleSV.value === 1 && e.y >= stageH - 140) {
        verticalModeSV.set(4);
        runOnJS(startSubtitleDrag)();
      } else if (e.x < third) {
        if (brightnessSlideSV.value !== 1) {
          verticalModeSV.set(0);
          return;
        }
        verticalModeSV.set(1);
        runOnJS(getBrightness)();
      } else if (e.x < third * 2) {
        if (fsSlideSV.value !== 1) {
          verticalModeSV.set(0);
          return;
        }
        verticalModeSV.set(3);
      } else {
        if (brightnessSlideSV.value !== 1) {
          verticalModeSV.set(0);
          return;
        }
        verticalModeSV.set(2);
        runOnJS(readVolume)();
      }
      if (verticalModeSV.value === 1 || verticalModeSV.value === 2) {
        gestureHudOpacity.set( withTiming(1, { duration: 120 }));
        runOnJS(clearHideTimer)();
      }
    })
    .onUpdate((e) => {
      const mode = verticalModeSV.value;
      if (mode === 0) return;
      if (mode === 4) {
        runOnJS(updateSubtitlePadding)(subtitleBaseSV.value - e.translationY);
        return;
      }
      if (mode === 3) {
        if (fsSlideTriggeredSV.value === 0 && Math.abs(e.translationY) > 8) {
          fsSlideTriggeredSV.set(1);
          runOnJS(triggerSlideFullscreen)(e.translationY);
        }
        return;
      }
      const delta = -e.translationY / 200;
      const newVal = Math.min(1, Math.max(0, verticalBaseSV.value + delta));
      if (mode === 1) {
        runOnJS(setBrightness)(newVal);
      } else if (mode === 2) {
        runOnJS(setVolume)(newVal);
      }
    })
    .onEnd(() => {
      fsSlideTriggeredSV.set(0);
      gestureHudOpacity.set( withTiming(0, { duration: 300 }));
      runOnJS(hideGestureHud)();
      runOnJS(pokeControls)();
    });

  // 组合：长按 / 水平拖动 / 垂直拖动 / 双击（优先于单击）——Race 让先识别者胜出
  const playerGestures = Gesture.Race(
    longPressGesture,
    seekPanGesture,
    verticalPanGesture,
    Gesture.Exclusive(doubleTapGesture, singleTapGesture),
  );

  /* ================= Tab 切换：横向 pager 平移（对齐 Flutter PageView 简介/评论切换） ================= */

  const indicatorX = useSharedValue(0);
  const indicatorInitRef = useRef(false);
  useEffect(() => {
    // 两个 tab 定宽 96px（bar 有 20 水平内边距）：指示器（宽 20）居中于各自 tab 下方
    const target = 20 + 96 * (activeTab === 'intro' ? 0 : 1) + 48 - 10;
    if (!indicatorInitRef.current) {
      indicatorInitRef.current = true;
      indicatorX.set( target); // 首次布局直接定位，不做动画
    } else {
      // 临界阻尼弹簧（dampingRatio 1 = damping / 2√(k·m) = 40 / 2√400）：滑动干脆、无过冲
      indicatorX.set( withSpring(target, { damping: 40, stiffness: 400, mass: 1 }));
    }
  }, [activeTab]);
  const tabIndicatorAnimStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: indicatorX.value }],
  }));

  const switchTab = (tab: 'intro' | 'comments') => {
    if (tab === activeTab) return;
    feedBackSelection();
    setActiveTab(tab);
    // 原生 UIScrollView 分页切换（对齐 Flutter PageView 左右滑动切换）
    tabPagerRef.current?.scrollTo({ x: tab === 'comments' ? winW : 0, animated: true });
    // 懒加载评论：切换到评论 Tab 时如果未加载过则加载
    if (tab === 'comments' && !comments.commentsLoaded && info) comments.loadComments();
  };

  /* 简介/评论共用滚动逻辑：暂停时按滚动距离收起播放器，恢复播放时回到 16:9
     clamp≥0：iOS bounce 负偏移导致顶栏抽搐；0.6 收起 / 0.4 展开 滞回阈值：避免临界抖动 */
  const handleTabScroll = useAnimatedScrollHandler((event) => {
    const y = Math.max(0, event.contentOffset.y);
    scrollYSV.value = y;
    let collapsed = playerCollapsedSV.value === 1;
    if (isPlayingSV.value === 1) {
      collapsed = false;
    } else if (y > playerBaseHeight * 0.6) {
      collapsed = true;
    } else if (y < playerBaseHeight * 0.4) {
      collapsed = false;
    }
    if ((collapsed ? 1 : 0) !== playerCollapsedSV.value) {
      playerCollapsedSV.value = collapsed ? 1 : 0;
      runOnJS(applyCollapsed)(collapsed);
    }
  }, [playerBaseHeight, applyCollapsed]);

  /* 评论 FlashList 走 JS 回调（列表内部事件不参与播放器收起动画的逐帧计算） */
  const handleCommentScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const y = Math.max(0, e.nativeEvent.contentOffset.y);
    scrollYSV.set( y);
    let collapsed = playerCollapsedRef.current;
    if (isPlayingRef.current) {
      collapsed = false;
    } else if (y > playerBaseHeight * 0.6) {
      collapsed = true;
    } else if (y < playerBaseHeight * 0.4) {
      collapsed = false;
    }
    if (collapsed !== playerCollapsedRef.current) {
      playerCollapsedRef.current = collapsed;
      setPlayerCollapsed(collapsed);
    }
  }, [playerBaseHeight]);

  /* ===== Tab 水平滑动手势（左滑=评论，右滑=简介） =====
   * 外层水平 UIScrollView（pagingEnabled）负责跟手/惯性翻页，内层纵向滚动归各自 ScrollView。 */
  const activeTabRef = useRef(activeTab);
  useEffect(() => { activeTabRef.current = activeTab; }, [activeTab]);
  const tabPagerRef = useRef<any>(null); // 外层水平分页容器
  const tabScrollRef = useRef<any>(null); // 简介滚动容器
  const commentScrollRef = useRef<any>(null); // 评论滚动容器
  const handlePagerScrollEnd = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const page = Math.round(e.nativeEvent.contentOffset.x / Math.max(winW, 1));
      const next = page === 1 ? 'comments' as const : 'intro' as const;
      if (next === activeTabRef.current) return;
      feedBackSelection();
      setActiveTab(next);
      if (next === 'comments' && !comments.commentsLoaded && info) comments.loadComments();
    },
    [winW, comments, info],
  );

  useEffect(() => {
    if (id) loadVideo();
  }, [id]);

  // 组件卸载时恢复竖屏 + 释放资源
  useEffect(() => {
    return () => {
      // 恢复系统亮度（iOS：setBrightnessAsync 锁屏后自动恢复）
      clearHideTimer();
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
      if (gestureHudTimerRef.current) clearTimeout(gestureHudTimerRef.current);
      loadVideoTokenRef.current?.abort();
      loadVideoTokenRef.current = null;
      sourceLoadTokenRef.current?.abort();
      sourceLoadTokenRef.current = null;
      // 卸载时发送最终进度（try-catch 防止 player 原生对象已释放导致崩溃）
      if (useSettingsStore.getState().enableHeartbeat && !useAuthStore.getState().anonymousMode && infoRef.current) {
        try {
          const pt = Math.floor(player?.currentTime || 0);
          videoApi.heartbeat({
            aid: infoRef.current.aid, bvid: infoRef.current.bvid, cid: infoRef.current.cid,
            played_time: pt,
            real_time: pt,
            play_type: 1, // 结束
            network_type: 0,
          }).catch(() => {});
        } catch {}
      }
      // 历史上报（对齐 Flutter historyReport）
      if (infoRef.current && useAuthStore.getState().isLoggedIn && !useAuthStore.getState().anonymousMode) {
        try {
          videoApi.historyReport({
            aid: infoRef.current.aid,
            cid: infoRef.current.cid,
            progress: Math.floor(player?.currentTime || 0),
          }).catch(() => {});
        } catch {}
      }
      // 释放播放器资源；后台音频按「后台音频服务 + 后台播放」设置决定是否保留
      if (player) {
        try { player.pause(); } catch {}
      }
      const audioSettings = useSettingsStore.getState();
      const keepBackgroundAudio = audioSettings.enableBackgroundPlay && audioSettings.continuePlayInBackground;
      if (!keepBackgroundAudio) {
        releaseAudioPlayer();
        usePlayerStore.getState().exitAudioMode();
      }
      void cancelSleepTimer().catch(() => {});
    };
  }, []);

  async function loadVideo(retryCount = 0) {
    const MAX_RETRIES = 3;
    const cancelToken = loadVideoTokenRef.current ?? createNativeRequestCancelToken();
    loadVideoTokenRef.current = cancelToken;
    setLoading(true);
    const s = useSettingsStore.getState();
    try {
      const res = await videoApi.view({ bvid: id }, { cancelToken });
      console.log('[loadVideo] view response code:', res?.code, 'has data:', !!res?.data);
      if (res?.data) {
        const d = res.data;
        setInfo(d);
        setActiveCid(d.cid);
        setActivePage(0);
        pageSeqRef.current += 1;
        hasSeekedRef.current = false;
        clearPlaybackProgress();
        setSbSegments([]);
        setSubtitleData([]);
        setSubtitleVisible(false);
        setLiked(d.req_user?.like === 1);
        setCoined(d.req_user?.coin === 1);
        setFaved(d.req_user?.favorite === 1);
        if ((d as any).rights?.is_stein_gate === 1) {
          try {
            const pi = await videoApi.playInfo({ aid: d.aid, cid: d.cid, bvid: id }, { cancelToken });
            graphVersionRef.current = pi?.data?.interaction?.graph_version;
            if (graphVersionRef.current) {
              await loadSteinEdgeInfo(id, undefined, cancelToken);
            }
          } catch {}
        }
        if (s.alwaysExpandIntro) setExpanded(true);

        const playRes = await videoApi.playUrl({ bvid: id, cid: d.cid }, { cancelToken });
        playDataRef.current = playRes?.data ?? null;
        console.log('[loadVideo] playUrl response code:', playRes?.code, 'has durl:', !!playRes?.data?.durl, 'has dash:', !!playRes?.data?.dash);
        const url = getBestPlayUrl(playRes?.data);
        if (url) {
          autoEnterFullscreenDoneRef.current = false;
          setPlayUrl(url);
          // 确保 autoPlay 时 videoStarted 为 true
          const st = useSettingsStore.getState();
          if (st.autoPlay) setVideoStarted(true);
        } else {
          // 取流失败（风控 -352/-403 等）：抛错进入重试，避免静默黑屏
          const msg = playRes?.message || '获取播放地址失败';
          console.error('[loadVideo] playUrl empty, code:', playRes?.code, 'msg:', msg);
          if (retryCount < MAX_RETRIES) throw new Error(msg);
          showToast(`播放失败：${msg}`);
        }
        // 提取画质列表
        if (playRes?.data?.support_formats) {
          setQualityList(playRes.data.support_formats.map((f: any) => ({ quality: f.quality, new_description: f.new_description || f.description || '' })));
        }
        if (playRes?.data?.quality) setCurrentQn(playRes.data.quality);

        // 查询关注关系
        if (isLoggedIn && d.owner?.mid) {
          userApi.relation({ fid: d.owner.mid }).then((r) => {
            const attr = r?.data?.attribute || 0;
            setFollowed(attr === 1 || attr === 2 || attr === 6);
          }).catch(() => {});
        }

        if (s.showVideoReply && s.defaultShowComment) {
          await comments.loadCommentsFor(d.aid);
        }
        if (s.showRelatedVideo) {
          const relRes = await videoApi.related({ bvid: id }, { cancelToken });
          if (relRes?.data) {
            const relList = filterRelatedVideos(relRes.data);
            setRelated(relList);
          }
        }
        if (s.enableOnlineTotal) {
          videoApi.onlineTotal({ aid: d.aid, cid: d.cid, bvid: id }, { cancelToken }).then((r) => {
            if (r?.data?.total) setOnlineCount(r.data.total);
          }).catch(() => {});
        }
        if (s.enableAi && d.owner?.mid) {
          videoApi.aiConclusion({ bvid: id!, cid: d.cid, up_mid: d.owner.mid }, { cancelToken }).then((r) => {
            if (r?.data?.conclusion) setAiSummary(r.data.conclusion);
          }).catch(() => {});
        }
        // SponsorBlock：加载跳过片段
        if (s.enableSponsorBlock) {
          sponsorBlockApi.getSkipSegments(id!, d.cid, cancelToken).then((segs) => {
            const cats = useSettingsStore.getState().sponsorBlockCategories;
            const filtered = segs.filter((seg) => cats.includes(seg.category));
            if (filtered.length > 0) {
              setSbSegments(filtered);
              showToast(`SponsorBlock: ${filtered.length} 个片段`);
            }
          }).catch(() => {});
        }

        // 字幕自动选择（对齐 Flutter SubtitlePrefType）
        if (s.subtitlePreference > 0) {
          autoLoadSubtitle(d.aid, d.cid, id!, s.subtitlePreference, cancelToken);
        }

        // 进度条缩略图（seek 预览）
        if (s.showSeekPreview) {
          videoApi.videoshot({ bvid: id, cid: d.cid }, { cancelToken }).then((r) => {
            if (r?.data?.image) setSeekThumbnails(r.data as any);
          }).catch(() => {});
        }
      }
    } catch (e) {
      if (cancelToken.aborted) {
        setLoading(false);
        return;
      }
      console.error('loadVideo error:', e);
      // 重试机制：最多3次，指数退避
      if (retryCount < MAX_RETRIES) {
        const delay = Math.min(1000 * Math.pow(2, retryCount), 8000);
        console.warn(`loadVideo retry ${retryCount + 1}/${MAX_RETRIES} in ${delay}ms`);
        retryTimerRef.current = setTimeout(() => loadVideo(retryCount + 1), delay);
        return; // 重试时不设置 loading=false
      }
    }
    setLoading(false);
  }

  /**
   * 字幕自动选择（对齐 Flutter SubtitlePrefType）
   * pref 1 = 优先选择第一个可用字幕（含 AI）
   * pref 2 = 跳过 AI 字幕，选择第一个非 AI 字幕
   * pref 3 = auto：静音时同 1，非静音时同 2
   */
  async function autoLoadSubtitle(aid: number, cid: number, bvid: string, pref: number, cancelToken?: NativeRequestCancelToken) {
    try {
      const res = await videoApi.playInfo({ aid, cid, bvid }, cancelToken ? { cancelToken } : undefined);
      const subs: { lan: string; lan_doc: string; subtitle_url: string }[] = res?.data?.subtitle?.subtitles;
      if (!subs || subs.length === 0) return;

      const isMuted = player?.muted ?? false;
      let target: typeof subs[0] | undefined;

      if (pref === 1) {
        // 优先选择第一个可用字幕（含 AI）
        target = subs[0];
      } else if (pref === 2) {
        // 跳过 AI 字幕，选择第一个非 AI 字幕
        target = subs.find((s) => !s.lan.startsWith('ai')) || subs[0];
      } else if (pref === 3) {
        // auto：静音时选择第一个（含 AI），非静音时跳过 AI
        target = isMuted ? subs[0] : (subs.find((s) => !s.lan.startsWith('ai')) || subs[0]);
      }

      if (target?.subtitle_url) {
        const fullUrl = normalizeHttpUrl(target.subtitle_url);
        const json = await fetchSubtitleJson(fullUrl);
        if (json?.body && Array.isArray(json.body)) {
          setSubtitleData(json.body);
          setSubtitleVisible(true);
          console.log(`[autoLoadSubtitle] 已自动加载: ${target.lan_doc}`);
        }
      }
    } catch (e) {
      if (cancelToken?.aborted) return;
      console.warn('[autoLoadSubtitle] failed:', e);
    }
  }

  /* ===== 3.2 听视频：切换到后台音频模式 ===== */
  async function handleListenVideo() {
    if (!info || !playUrl) return;
    feedBack();
    const transitionToken = await beginAudioTransitionTaskAsync();
    try {
      // 获取播放数据中的音频 URL
      let audioUrl = playDataRef.current ? getBestAudioUrl(playDataRef.current) : '';
      if (!audioUrl) {
        const playRes = await videoApi.playUrl(
          { bvid: info.bvid || id, cid: currentCid },
          loadVideoTokenRef.current ? { cancelToken: loadVideoTokenRef.current } : undefined,
        );
        playDataRef.current = playRes?.data ?? null;
        audioUrl = getBestAudioUrl(playRes?.data);
      }
      if (!audioUrl) {
        showToast('未找到音频源');
        return;
      }
      // 暂停视频
      player.pause();
      // 启动音频播放（从当前进度接续）
      await startAudioPlayback(
        audioUrl,
        { bvid: info.bvid, title: info.title, cover: biliCover(info.pic, 600, 600) },
        player.currentTime || 0,
        audioUrl === playUrl || !!playDataRef.current?.durl?.length,
        false,
        playSpeedRef.current || player.playbackRate || 1,
      );
      showToast('已切换到听视频模式');
    } catch {
      showToast('切换失败');
    } finally {
      await endAudioTransitionTaskAsync(transitionToken).catch(() => {});
    }
  }

  // 后台播放设置开启时，应用进入后台自动切换到音频模式，停止视频解码以省电。
  const handleListenVideoRef = useRef(handleListenVideo);
  useEffect(() => {
    handleListenVideoRef.current = handleListenVideo;
  });
  const audioSwitchInFlightRef = useRef(false);
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'background') return;
      const s = useSettingsStore.getState();
      if (!s.enableBackgroundPlay || !s.continuePlayInBackground) return;
      if (usePlayerStore.getState().audioMode || audioSwitchInFlightRef.current) return;
      if (!player || !player.playing) return;
      audioSwitchInFlightRef.current = true;
      void handleListenVideoRef.current().finally(() => {
        audioSwitchInFlightRef.current = false;
      });
    });
    return () => sub.remove();
  }, [player]);

  const handleDmDensityChange = useCallback((markers: DanmakuDensityMarker[]) => {
    setDmDensity(markers);
  }, []);

  /* ===== 全屏：推入独立全屏路由（进度/倍速/音量/弹幕等经参数 + usePlayerStore 桥接） ===== */
  const enterFullscreen = () => {
    pokeControls();
    if (!playUrl || !info) return;
    try { playerRef.current.pause(); } catch {}
    usePlayerStore.getState().syncProgress(playerRef.current.currentTime || 0, playerRef.current.duration || 0);
    usePlayerStore.getState().setFullscreenState({
      bvid: info.bvid || id,
      aid: info.aid,
      cid: currentCid,
      title: info.title || '',
      pic: info.pic || '',
      playUrl,
      currentTime: playerRef.current.currentTime || 0,
      playbackRate: playSpeedRef.current || 1,
      volume: playerRef.current.volume ?? 1,
      dmVisible,
      subtitleVisible,
      subtitleData,
      sbSegments,
      liked,
      coined,
      faved,
      disliked,
      onlineCount: onlineCount || '',
      qualityList,
      currentQn,
    });
    router.push({ pathname: '/video/fullscreen' } as any);
  };

  useEffect(() => {
    enterFullscreenRef.current = enterFullscreen;
  });

  async function sendDanmaku() {
    const text = dmText.trim();
    if (!text || !info) return;
    if (!isLoggedIn) { showToast('请先登录'); return; }
    try {
      const res = await danmakuApi.post({ oid: currentCid, type: 1, msg: text, progress: Math.floor(currentTimeRef.current * 1000) });
      if (res?.code === 0) {
        feedBackSuccess();
        showToast('发送成功');
        setDmText('');
        setDmInputVisible(false);
      } else {
        showToast(res?.message || '发送失败');
      }
    } catch {
      showToast('发送失败');
    }
  }

  async function changeQuality(qn: number) {
    if (!info || qn === currentQn || !currentCid) return;
    sourceLoadTokenRef.current?.abort();
    const cancelToken = createNativeRequestCancelToken();
    sourceLoadTokenRef.current = cancelToken;
    try {
      const playRes = await videoApi.playUrl({ bvid: info.bvid || id, cid: currentCid, qn }, { cancelToken });
      playDataRef.current = playRes?.data ?? null;
      const url = getBestPlayUrl(playRes?.data);
      if (url) {
        setPlayUrl(url);
        setCurrentQn(qn);
        feedBackSuccess();
        showToast(`画质已切换`);
      }
    } catch {
      if (cancelToken.aborted) return;
      showToast('切换失败');
    }
  }

  /** 切 P/选集：清空当前进度、弹幕锚点与字幕，随后重新取流 */
  function resetPagePlayback() {
    autoEnterFullscreenDoneRef.current = false;
    try { playerRef.current?.pause(); } catch {}
    resetPlaybackState();
    setSbSegments([]);
    setSubtitleData([]);
    setSubtitleVisible(false);
    setCurrentQn(0);
  }

  async function loadSourceForCid(targetCid: number, targetBvid: string) {
    const seq = ++pageSeqRef.current;
    sourceLoadTokenRef.current?.abort();
    const cancelToken = createNativeRequestCancelToken();
    sourceLoadTokenRef.current = cancelToken;
    try {
      const playRes = await videoApi.playUrl({ bvid: targetBvid, cid: targetCid }, { cancelToken });
      if (seq !== pageSeqRef.current || cancelToken.aborted) return;
      playDataRef.current = playRes?.data ?? null;
      const url = getBestPlayUrl(playRes?.data);
      if (!url) {
        showToast(playRes?.message || '播放地址获取失败');
        return;
      }
      setPlayUrl(url);
      setActiveCid(targetCid);
      if (playRes?.data?.support_formats) {
        setQualityList(playRes.data.support_formats.map((f: any) => ({
          quality: f.quality,
          new_description: f.new_description || f.description || '',
        })));
      }
      if (playRes?.data?.quality) setCurrentQn(playRes.data.quality);

      const s = useSettingsStore.getState();
      const aid = infoRef.current?.aid || 0;
      if (s.enableOnlineTotal && aid) {
        videoApi.onlineTotal({ aid, cid: targetCid, bvid: targetBvid }, { cancelToken }).then((r) => {
          if (r?.data?.total) setOnlineCount(r.data.total);
        }).catch(() => {});
      }
      if (s.enableSponsorBlock && targetBvid) {
        sponsorBlockApi.getSkipSegments(targetBvid, targetCid, cancelToken).then((segs) => {
          const cats = useSettingsStore.getState().sponsorBlockCategories;
          const filtered = segs.filter((seg) => cats.includes(seg.category));
          if (filtered.length > 0) setSbSegments(filtered);
        }).catch(() => {});
      }
      if (s.showSeekPreview) {
        videoApi.videoshot({ bvid: targetBvid, cid: targetCid }, { cancelToken }).then((r) => {
          if (r?.data?.image) setSeekThumbnails(r.data as any);
        }).catch(() => {});
      }
      if (s.subtitlePreference > 0 && aid) {
        autoLoadSubtitle(aid, targetCid, targetBvid, s.subtitlePreference, cancelToken);
      }
    } catch {
      if (cancelToken.aborted) return;
      showToast('切换失败');
    }
  }

  function switchToCid(targetCid: number) {
    if (!info || !targetCid || targetCid === currentCid) return;
    const pageIndex = info.pages.findIndex((p) => p.cid === targetCid);
    setActivePage(pageIndex >= 0 ? pageIndex : -1);
    setActiveCid(targetCid);
    setInfo((prev) => (prev ? { ...prev, cid: targetCid } : prev));
    infoRef.current = infoRef.current ? { ...infoRef.current, cid: targetCid } : null;
    resetPagePlayback();
    loadSourceForCid(targetCid, info.bvid || id);
  }

  function switchPage(index: number) {
    if (!info || index < 0 || index >= info.pages.length || index === activePage) return;
    const page = info.pages[index];
    if (!page || page.cid === currentCid) {
      setActivePage(index);
      return;
    }
    switchToCid(page.cid);
  }

  async function loadSteinEdgeInfo(bvid: string, edgeId?: number, cancelToken?: NativeRequestCancelToken) {
    try {
      const res = await videoApi.edgeInfo({
        bvid,
        graph_version: graphVersionRef.current,
        edge_id: edgeId,
      }, cancelToken ? { cancelToken } : undefined);
      const questions = res?.data?.edges?.questions;
      if (questions?.length) {
        setSteinChoices(questions[0].choices || []);
        setShowStein(true);
      } else {
        setShowStein(false);
      }
    } catch {
      if (cancelToken?.aborted) return;
      setShowStein(false);
    }
  }

  const handleSteinChoice = useCallback(
    (choice: { id: number; cid: number; option: string }) => {
      if (choice.cid) switchToCid(choice.cid);
      void loadSteinEdgeInfo(info?.bvid || id, choice.id, loadVideoTokenRef.current ?? undefined);
    },
    [info, id],
  );

  function switchEpisode(ep: { bvid?: string; cid?: number }) {
    if (!ep?.cid) return;
    if (ep.bvid && info && ep.bvid !== info.bvid) {
      router.push(`/video/${ep.bvid}` as any);
      return;
    }
    switchToCid(ep.cid);
  }

  /* 更多菜单（对齐 Flutter 版: 稍后再看/查看笔记/复制链接/分享/举报） */
  function handleMoreAction(event: string) {
    switch (event) {
      case 'viewLater':
        handleViewLater();
        break;
      case 'notes':
        if (info) router.push({ pathname: '/video/notes', params: { oid: String(info.aid), title: info.title || '' } });
        break;
      case 'copyLink':
        handleCopyLink();
        break;
      case 'share':
        handleShare();
        break;
      case 'download':
        if (!playUrl) {
          showToast('暂无播放地址');
          break;
        }
        addDownload({ title: info?.title || '', pic: info?.pic || '', url: playUrl }).then(() => {
          showToast('已加入离线缓存');
        });
        break;
      case 'dlna':
        if (!playUrl) {
          showToast('暂无播放地址');
          break;
        }
        router.push({ pathname: '/dlna', params: { url: playUrl, title: info?.title || '' } } as any);
        break;
      case 'report':
        handleReportVideo();
        break;
    }
  }

  /* 更多菜单入口：Alert 弹出（iOS 不再用 SwiftUI Menu，避免图标不显示） */
  function showMoreMenu() {
    Alert.alert('更多', undefined, [
      { text: '稍后再看', onPress: () => handleMoreAction('viewLater') },
      { text: '查看笔记', onPress: () => handleMoreAction('notes') },
      { text: '复制链接', onPress: () => handleMoreAction('copyLink') },
      { text: '分享', onPress: () => handleMoreAction('share') },
      { text: '离线缓存', onPress: () => handleMoreAction('download') },
      { text: '投屏', onPress: () => handleMoreAction('dlna') },
      { text: '举报', style: 'destructive', onPress: () => handleMoreAction('report') },
      { text: '取消', style: 'cancel' },
    ]);
  }

  /* 分栏跳转（对齐 Flutter chapters/view_points 选择 seek） */
  function showViewPointsMenu() {
    const vps = info?.view_points || [];
    if (vps.length === 0) return;
    Alert.alert('视频分段', undefined, [
      ...vps.map((vp) => ({
        text: `${formatPlayerTime(vp.from)} ${vp.title}`,
        onPress: () => {
          try {
            player.currentTime = vp.from;
            currentTimeRef.current = vp.from;
            timeControlRef.current?.publish(vp.from);
          } catch {}
        },
      })),
      { text: '取消', style: 'cancel' },
    ]);
  }


  const s = useSettingsStore.getState();

  return {
    s,
    loading,
    info,
    player,
    playerRef,
    videoViewRef,
    timeControlRef,
    currentTimeRef,
    insets,
    winW,
    router,
    playUrl,
    videoStarted,
    setVideoStarted,
    videoSource,
    audioMode,
    activeTab,
    activeCid,
    currentCid,
    seasonEpisodes,
    playableCount,
    playerBaseHeight,
    playerCollapseStyle,
    collapseBlurStyle,
    playerCollapsed,
    setPlayerCollapsed,
    playerCollapsedRef,
    progressRatio,
    scrubbing,
    trackWidthSV,
    durationSV,
    isScrubbingRef,
    seekGuardRef,
    lastHeartbeatRef,
    hasSeekedRef,
    progressFillStyle,
    progressThumbStyle,
    progressTrackAnimStyle,
    scrubGesture,
    showSeekThumb,
    seekThumbnails,
    controlsShown,
    controlsAnimStyle,
    pokeControls,
    clearHideTimer,
    boostBadgeStyle,
    speedBoost,
    playerGestures,
    playerWidthSV,
    seekHudAnimStyle,
    seekHudTarget,
    seekHudDelta,
    gestureHud,
    gestureHudAnimStyle,
    isPlaying,
    dmVisible,
    setDmVisible,
    dmDensity,
    dmInputVisible,
    setDmInputVisible,
    dmText,
    setDmText,
    settingsVisible,
    setSettingsVisible,
    playSpeed,
    setPlaySpeed,
    playSpeedRef,
    subtitleData,
    setSubtitleData,
    subtitleVisible,
    setSubtitleVisible,
    qualityList,
    currentQn,
    steinChoices,
    showStein,
    setShowStein,
    handleSteinChoice,
    sbSegments,
    expanded,
    setExpanded,
    related,
    liked,
    coined,
    faved,
    disliked,
    followed,
    onlineCount,
    aiSummary,
    handleLike,
    handleCoin,
    handleFav,
    handleFollow,
    handleShare,
    handleListenVideo,
    handleCopyLink,
    handleViewLater,
    sendDanmaku,
    changeQuality,
    seekToTime,
    changePlaySpeed,
    changeVolume,
    loadVideo,
    enterFullscreen,
    showMoreMenu,
    showViewPointsMenu,
    switchPage,
    switchEpisode,
    switchTab,
    handleTabScroll,
    handleCommentScroll,
    tabIndicatorAnimStyle,
    tabPagerRef,
    handlePagerScrollEnd,
    tabScrollRef,
    commentScrollRef,
    handleDmDensityChange,
    ...comments,
  };
}

export function useNativeVideoController() {
  const cfg = getPlayerConfig();
  PiliPlayer.shared.setLoop(cfg.playRepeat === 1);
  PiliPlayer.shared.setMuted(false);
  PiliPlayer.shared.setBufferConfig(cfg.bufferSec);
  PiliPlayer.shared.setLiveMode(false);
  useEffect(() => {
    const apply = () => {
      const s = useSettingsStore.getState();
      const qn = useNetwork.getState().isWifi ? s.defaultQuality : s.cellularQuality;
      const limits = qualityStreamingLimits(qn);
      PiliPlayer.shared.setStreamingLimits(limits.maxWidth, limits.maxHeight, limits.peakBitRate);
    };
    const unsubSettings = useSettingsStore.subscribe(apply);
    const unsubNetwork = useNetwork.subscribe(apply);
    apply();
    return () => {
      unsubSettings();
      unsubNetwork();
    };
  }, []);
  return useVideoControllerWithPlayer(PiliPlayer.shared);
}

export type VideoController = ReturnType<typeof useVideoControllerWithPlayer>;

