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
import { useVideoPlayback } from '@/hooks/use-video-playback';
import { useVideoActions } from '@/hooks/use-video-actions';
import { beginAudioTransitionTaskAsync, endAudioTransitionTaskAsync } from 'pili-audio';
import { loadSubtitleJsonAsync } from 'pili-danmaku';
import { saveImageToAlbum } from '@/utils/save-image';

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

/** 选集条目（分P/合集剧集统一形状，字段防御式读取） */
export interface EpisodeItem {
  aid: number;
  bvid: string;
  cid: number;
  title: string;
  pic?: string;
  duration?: number;
  play?: number;
  danmaku?: number;
  badge?: string;
}

/** 选集分组：UGC 合集每个 section 一组；多 P 无合集时按「分P」单组（对齐 Flutter episode_panel TabBar） */
export interface EpisodeSection {
  id: string;
  title: string;
  episodes: EpisodeItem[];
}

/** AI 总结大纲章节（对齐 Flutter AiConclusionResult：summary + outline[].part_outline[].timestamp/content） */
export interface AiOutlinePart {
  timestamp: number;
  content: string;
}

export interface AiOutlineChapter {
  title: string;
  parts: AiOutlinePart[];
}

/* ==================== 播放列表 medialist 模块级通信 ====================
 * VideoIntroSection 无法经 VideoScreenView 透传新 props（该文件由并行代理独占），
 * 采用 use-video-actions 同款「模块级最新句柄/快照」模式：
 *   控制器在渲染期同步刷新 mediaListBus（渲染体赋值，快照读取不滞后一帧），
 *   并注册 open/close/playNext/playPrev 句柄；组件层渲染期直接 get 读取。 */
export interface MediaListItem {
  aid: number;
  bvid: string;
  cid: number;
  title: string;
  pic?: string;
  duration?: number;
}

export interface MediaListBus {
  /** 队列是否激活（稍后再看 params 或合集连播已打开过） */
  active: boolean;
  /** 面板是否显示 */
  visible: boolean;
  queue: MediaListItem[];
  title: string;
  currentBvid: string;
  currentCid: number;
  /** 当前播放进度（秒，面板打开时随 timeUpdate 镜像刷新） */
  currentTime: number;
  /** 当前播放时长（秒） */
  duration: number;
}

export interface MediaListHandlers {
  open: (queue?: MediaListItem[], title?: string) => void;
  close: () => void;
  playNext: () => void;
  playPrev: () => void;
}

let mediaListBus: MediaListBus = {
  active: false,
  visible: false,
  queue: [],
  title: '播放列表',
  currentBvid: '',
  currentCid: 0,
  currentTime: 0,
  duration: 0,
};
export function getMediaListBus(): MediaListBus {
  return mediaListBus;
}

let mediaListHandlers: MediaListHandlers | null = null;
export function setMediaListHandlers(h: MediaListHandlers | null) {
  mediaListHandlers = h;
}
export function getMediaListHandlers(): MediaListHandlers | null {
  return mediaListHandlers;
}

/* 跨视频 push 时队列随模块缓存延续：新页 mount 后按 queue=1 参数接管 */
let mediaQueueCache: MediaListItem[] = [];
let mediaQueueCacheTitle = '';
export function setMediaQueueCache(queue: MediaListItem[], title: string) {
  mediaQueueCache = queue;
  mediaQueueCacheTitle = title;
}
export function getMediaQueueCache(): MediaListItem[] {
  return mediaQueueCache;
}
export function getMediaQueueCacheTitle(): string {
  return mediaQueueCacheTitle;
}

function useVideoControllerWithPlayer(player: any) {
  const { id, t, queue: queueParam } = useLocalSearchParams<{ id: string; t?: string; queue?: string }>();
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
  /** 视频信息/取流 3 次重试全部耗尽后的错误文案（供 UI 渲染错误态 + 一键重试） */
  const [loadError, setLoadError] = useState<string | null>(null);
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
  /** AI 总结章节大纲（model_result.outline），无大纲时为 null（保持字符串展示） */
  const [aiOutline, setAiOutline] = useState<AiOutlineChapter[] | null>(null);
  const [expanded, setExpanded] = useState(false);
  /** 独立选集底部面板开关（详情页选集入口打开；全屏页可经 openEpisodePanel 回调后续接入） */
  const [episodePanelVisible, setEpisodePanelVisible] = useState(false);
  /* ===== 播放列表 medialist（02-2.2 连播队列）：队列状态与面板开关 ===== */
  const [medialistVisible, setMedialistVisible] = useState(false);
  /** 队列是否激活（稍后再看「播放全部」/ 合集连播） */
  const [medialistActive, setMedialistActive] = useState(false);
  /** 当前连播队列（稍后再看列表 或 合集 seasonEpisodes 平铺） */
  const [medialistQueue, setMedialistQueue] = useState<MediaListItem[]>([]);
  const [medialistTitle, setMedialistTitle] = useState('播放列表');
  /** 面板打开时镜像当前进度（秒）/时长，驱动面板内高亮项进度条 */
  const [mediaNow, setMediaNow] = useState(0);
  const [mediaDuration, setMediaDuration] = useState(0);
  const medialistQueueRef = useRef<MediaListItem[]>([]);
  useEffect(() => { medialistQueueRef.current = medialistQueue; }, [medialistQueue]);
  const medialistActiveRef = useRef(false);
  useEffect(() => { medialistActiveRef.current = medialistActive; }, [medialistActive]);
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
    sourceScreen: '/video/[id]',
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

  /** UGC 合集/剧集选集分组（ugc_season.sections[].episodes → 多 section；无合集且多 P → 单「分P」组）。
   *  分组结构供独立选集底部面板（EpisodePanel）做 section 合集切换。
   *  当前视频自身多 P 时始终前置「分P」组（对齐 Flutter 当前分P的子分P面板）。 */
  const episodeSections = useMemo<EpisodeSection[]>(() => {
    const infoAny = info as any;
    const out: EpisodeSection[] = [];
    // 分P组：当前视频自己的分 P（cid 去重，排除已并入合集 section 的条目）
    if (Array.isArray(infoAny?.pages) && infoAny.pages.length > 1) {
      const seen = new Set<number>();
      for (const s of infoAny?.ugc_season?.sections || []) {
        for (const ep of s?.episodes || []) {
          const cid = Number(ep?.cid || 0);
          if (cid) seen.add(cid);
        }
      }
      const eps: EpisodeItem[] = [];
      for (const p of infoAny.pages as any[]) {
        const cid = Number(p?.cid || 0);
        if (!cid || seen.has(cid)) continue;
        eps.push({
          aid: infoAny.aid || 0,
          bvid: infoAny.bvid || '',
          cid,
          title: p?.part || `P${eps.length + 1}`,
        });
      }
      if (eps.length > 1) out.push({ id: 'pages', title: '分P', episodes: eps });
    }
    const sections = infoAny?.ugc_season?.sections;
    if (Array.isArray(sections) && sections.length > 0) {
      sections.forEach((section, idx) => {
        const eps: EpisodeItem[] = [];
        for (const ep of section?.episodes || []) {
          const cid = Number(ep?.cid || 0);
          if (!cid) continue;
          eps.push({
            aid: Number(ep?.aid || 0),
            bvid: ep?.bvid || '',
            cid,
            title: ep?.title || ep?.long_title || `P${eps.length + 1}`,
            pic: ep?.arc?.pic || ep?.cover || '',
            duration: Number(ep?.arc?.duration || ep?.duration || 0) || undefined,
            play: Number(ep?.arc?.stat?.view || 0) || undefined,
            danmaku: Number(ep?.arc?.stat?.danmaku || 0) || undefined,
            badge: typeof ep?.badge === 'string' ? ep.badge : undefined,
          });
        }
        if (eps.length > 0) {
          out.push({
            id: `section-${idx}-${section?.id ?? section?.title ?? ''}`,
            title: section?.title || `合集 ${idx + 1}`,
            episodes: eps,
          });
        }
      });
    }
    return out;
  }, [info]);
  /** 兼容扁平选集（既有调用方 playableCount 使用；每个 section 条目独立，不跨组去重） */
  const seasonEpisodes = useMemo(() => {
    const out: { aid: number; bvid: string; cid: number; title: string }[] = [];
    for (const section of episodeSections) {
      for (const ep of section.episodes) {
        out.push({ aid: ep.aid, bvid: ep.bvid, cid: ep.cid, title: ep.title });
      }
    }
    return out;
  }, [episodeSections]);
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

  /* ===== #15 播放器高度与评论滚动解耦（04-B5，方案② absolute sticky） =====
     旧实现：playerCollapseStyle 高度 = f(滚动偏移)，滚动 1px 播放器缩 1px，
     FlashList 视口逐帧变化 → 空白/欠渲染。
     新实现：播放器 absolute 置顶覆盖，内容列表 paddingTop 起步（滚动中视口恒定），
     滚动只做「一次性收起」阈值判定（0.6 收起 / 0.4 展开 滞回），高度由
     collapseLevelSV 单一驱动 withTiming 一次性过渡，不再逐帧写回滚动偏移。 */
  const collapseLevelSV = useSharedValue(0); // 0=展开 1=收起（收起高度按播放态：播放中=16:9 紧凑档，暂停=工具栏槽位）
  const playerCollapseStyle = useAnimatedStyle(() => {
    const base = baseHeightSV.value;
    const minH = insets.top + (isPlayingSV.value === 1 ? minVideoHeight : TOOLBAR_HEIGHT);
    return { height: base + (minH - base) * collapseLevelSV.value };
  });
  /* 内容区槽位：与播放器高度同步的动画 paddingTop（列表视口滚动中恒定，收起动画一次性过渡） */
  const playerSlotStyle = useAnimatedStyle(() => {
    const base = baseHeightSV.value;
    const minH = insets.top + (isPlayingSV.value === 1 ? minVideoHeight : TOOLBAR_HEIGHT);
    return { paddingTop: base + (minH - base) * collapseLevelSV.value };
  });
  /* 暂停收起：渐变模糊蒙层（随收起进度 0→1，恢复播放淡出） */
  const collapseBlurStyle = useAnimatedStyle(() => {
    return { opacity: isPlayingSV.value === 1 ? 0 : collapseLevelSV.value };
  });
  const [playerCollapsed, setPlayerCollapsed] = useState(false);
  const playerCollapsedRef = useRef(false);
  const playerCollapsedSV = useSharedValue(0);
  const applyCollapsed = useCallback((collapsed: boolean) => {
    playerCollapsedRef.current = collapsed;
    setPlayerCollapsed(collapsed);
  }, []);
  /* 恢复播放时若处于「暂停收起」态（如收起栏点播放），立即解除收起标记 */
  useEffect(() => {
    if (isPlaying && playerCollapsedRef.current) {
      playerCollapsedRef.current = false;
      setPlayerCollapsed(false);
    }
  }, [isPlaying]);

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
      // #15：播放器当前屏幕高度 = 展开基准 + (收起目标 - 基准) × 收起进度
      const base = baseHeightSV.value;
      const minH = insets.top + (isPlayingSV.value === 1 ? minVideoHeight : TOOLBAR_HEIGHT);
      const stageH = Math.max(0, base + (minH - base) * collapseLevelSV.value);
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

  /* #17 画面模式（04-B4）：详情页双击循环切换 contain→cover→fill。
     与全屏页一致：仅在「双击快进/快退」关闭（enableQuickDouble=false）时让出双击，
     避免与既有双击 seek/暂停语义冲突。 */
  const enableQuickDouble = useSettingsStore((s) => s.enableQuickDouble);
  const VIDEO_GRAVITY_LABELS: Record<string, string> = { contain: '适应', cover: '填充', fill: '拉伸' };
  const cycleVideoGravity = useCallback(() => {
    // 防御式读取：F3 在 settings.ts 新增 videoGravity 字段，编辑期可能尚未就绪
    const st = useSettingsStore.getState() as any;
    const cur: string = st.videoGravity === 'cover' ? 'cover' : st.videoGravity === 'fill' ? 'fill' : 'contain';
    const next = cur === 'contain' ? 'cover' : cur === 'cover' ? 'fill' : 'contain';
    (useSettingsStore.getState() as any).set({ videoGravity: next });
    showToast(`画面比例：${VIDEO_GRAVITY_LABELS[next]}`);
  }, []);
  const gravityCycleTap = Gesture.Tap()
    .numberOfTaps(2)
    .enabled(!enableQuickDouble)
    .onEnd(() => {
      runOnJS(cycleVideoGravity)();
    });

  // 组合：长按 / 水平拖动 / 垂直拖动 / 双击（优先于单击）——Race 让先识别者胜出。
  // enableQuickDouble 开启时保留既有双击快进/中央暂停；关闭时双击让位给画面比例循环切换
  // （与全屏页语义一致，互斥挂载避免双双击同时触发）。
  const playerGestures = Gesture.Race(
    longPressGesture,
    seekPanGesture,
    verticalPanGesture,
    Gesture.Exclusive(enableQuickDouble ? doubleTapGesture : gravityCycleTap, singleTapGesture),
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

  /* 简介滚动（worklet）：0.6 收起 / 0.4 展开 滞回阈值。阈值翻转时一次性 withTiming
     过渡（高度只随 collapseLevelSV 变化），滚动过程不再逐帧改播放器高度/列表视口 */
  const handleTabScroll = useAnimatedScrollHandler((event) => {
    const y = Math.max(0, event.contentOffset.y);
    let level = collapseLevelSV.value;
    if (y > playerBaseHeight * 0.6) {
      level = 1;
    } else if (y < playerBaseHeight * 0.4) {
      level = 0;
    }
    if (level !== collapseLevelSV.value) {
      collapseLevelSV.value = withTiming(level, { duration: 220, easing: Easing.out(Easing.ease) });
    }
    // 暂停收起才显示工具栏槽位栏；播放中收起（16:9 紧凑档）不显示
    const collapsed = level === 1 && isPlayingSV.value === 0;
    if ((collapsed ? 1 : 0) !== playerCollapsedSV.value) {
      playerCollapsedSV.value = collapsed ? 1 : 0;
      runOnJS(applyCollapsed)(collapsed);
    }
  }, [playerBaseHeight, applyCollapsed, collapseLevelSV]);

  /* 评论 FlashList 走 JS 回调（列表内部事件不参与播放器收起动画的逐帧计算；
     阈值翻转时一次性 withTiming，滚动过程列表视口恒定） */
  const handleCommentScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const y = Math.max(0, e.nativeEvent.contentOffset.y);
    let level = collapseLevelSV.value;
    if (y > playerBaseHeight * 0.6) {
      level = 1;
    } else if (y < playerBaseHeight * 0.4) {
      level = 0;
    }
    if (level !== collapseLevelSV.value) {
      collapseLevelSV.value = withTiming(level, { duration: 220, easing: Easing.out(Easing.ease) });
    }
    const collapsed = level === 1 && isPlayingRef.current === false;
    if (collapsed !== playerCollapsedRef.current) {
      playerCollapsedRef.current = collapsed;
      setPlayerCollapsed(collapsed);
    }
  }, [playerBaseHeight, collapseLevelSV]);

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
    else queueMicrotask(() => setLoading(false));
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
    setLoadError(null);
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
        setAiSummary('');
        setAiOutline(null);
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
          setLoadError(msg); // 重试耗尽：暴露错误态供 UI 渲染（代理 E 消费 loadError/retryLoad）
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
            // 接口返回结构（对齐 Flutter AiConclusionData）：data.model_result.{summary, outline[]}
            // outline[].{title, part_outline[].{timestamp, content}}；旧版字段 conclusion 字符串兜底。
            const mr = r?.data?.model_result;
            const summary: string = mr && typeof mr.summary === 'string' ? mr.summary : '';
            if (summary) setAiSummary(summary);
            else if (typeof r?.data?.conclusion === 'string' && r.data.conclusion) setAiSummary(r.data.conclusion);
            const rawOutline = Array.isArray(mr?.outline) ? mr.outline : null;
            if (rawOutline && rawOutline.length > 0) {
              const chapters: AiOutlineChapter[] = rawOutline
                .map((ch: any) => ({
                  title: ch && typeof ch.title === 'string' ? ch.title : '',
                  parts: (Array.isArray(ch?.part_outline) ? ch.part_outline : [])
                    .map((p: any) => ({
                      timestamp: Number(p?.timestamp || 0),
                      content: p && typeof p.content === 'string' ? p.content : '',
                    }))
                    .filter((p: AiOutlinePart) => p.timestamp > 0 && p.content),
                }))
                .filter((c: AiOutlineChapter) => c.parts.length > 0);
              setAiOutline(chapters.length > 0 ? chapters : null);
            } else {
              setAiOutline(null);
            }
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
      // 重试耗尽：暴露错误文案，供 UI 渲染错误态（代理 E 在 VideoScreenView 消费 loadError/retryLoad）
      const errMsg = (e as Error)?.message || String(e);
      setLoadError(errMsg || '视频加载失败，请重试');
    }
    setLoading(false);
  }

  /** 错误态一键重试：直接清空错误并重新发起完整加载 */
  function retryLoad() {
    if (loadVideoTokenRef.current) {
      loadVideoTokenRef.current.abort();
      loadVideoTokenRef.current = null;
    }
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
    setLoadError(null);
    if (id) loadVideo();
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

  /* ===== 独立选集面板开关 =====
     详情页入口（VideoIntroSection）打开；全屏页如需选集，可后续在 fullscreen.tsx 中
     调用 openEpisodePanel 弹出本页挂载的 SwiftUI BottomSheet（面板在 VideoScreenView 渲染，
     全屏路由压栈后详情页仍挂载，sheet 可覆盖全屏展示）。 */
  const openEpisodePanel = useCallback(() => setEpisodePanelVisible(true), []);
  const closeEpisodePanel = useCallback(() => setEpisodePanelVisible(false), []);

  /* ===== 播放列表 medialist：队列生命周期 ===== */
  /** 从「稍后再看·播放全部」push 进入（queue=1 参数）：接管模块缓存的队列。
   *  跨视频连播时 switchEpisode 会携带 queue=1 push 新页，队列经缓存延续。 */
  useEffect(() => {
    if (queueParam !== '1') return;
    queueMicrotask(() => {
      const cached = getMediaQueueCache();
      if (cached.length > 0) {
        setMedialistQueue(cached);
        setMedialistTitle(getMediaQueueCacheTitle());
        setMedialistActive(true);
      }
    });
  }, []);

  /** 面板打开时镜像当前进度/时长（0.5s timeUpdate），关闭即停（不产生常驻开销） */
  useEffect(() => {
    if (!player || !medialistVisible) return;
    const read = () => {
      try { setMediaNow(Math.floor(player.currentTime || 0)); } catch {}
      try { const d = player.duration || 0; if (d > 0) setMediaDuration(d); } catch {}
    };
    read();
    const sub = player.addListener('timeUpdate', (e: any) => {
      setMediaNow(Math.floor(e.currentTime || 0));
      if (typeof e.duration === 'number' && e.duration > 0) setMediaDuration(e.duration);
    });
    return () => sub.remove();
  }, [player, medialistVisible]);

  /** 打开播放队列面板：队列缺省回退到已激活队列（稍后再看 params）或合集平铺队列，
   *  并写入模块缓存供跨视频延续 */
  const openMediaList = useCallback((queue?: MediaListItem[], title?: string) => {
    let q = queue && queue.length > 0 ? queue : medialistQueueRef.current;
    if (q.length === 0) {
      // 合集连播：seasonEpisodes 平铺为队列（EpisodeItem → MediaListItem）
      q = seasonEpisodes.map((ep) => ({
        aid: ep.aid,
        bvid: ep.bvid,
        cid: ep.cid,
        title: ep.title,
      }));
    }
    if (q.length === 0) return;
    const fallbackTitle = seasonEpisodes.length > 0 ? '合集连播' : '播放列表';
    setMedialistQueue(q);
    setMedialistTitle(title || fallbackTitle);
    setMediaQueueCache(q, title || fallbackTitle);
    setMedialistActive(true);
    setMedialistVisible(true);
  }, [seasonEpisodes]);
  const closeMediaList = useCallback(() => setMedialistVisible(false), []);

  /* ===== 播放列表 medialist：队列生命周期（模块级句柄注册见 playNext/playPrev 定义之后） ===== */

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
    if (!ep) return;
    // 稍后再看条目（无 cid）：直接进入视频页并携带连播队列（queue=1）延续连播
    if (!ep.cid) {
      if (ep.bvid) {
        router.push({ pathname: `/video/${ep.bvid}`, params: { queue: '1' } } as any);
      }
      return;
    }
    // 跨视频合集选集保持 push（对齐 Flutter 返回链语义）。
    // N1 源不恢复 / N2 blur 暂停竞态已由 use-video-playback 焦点源校验 + useFocusAwarePlayer
    // 消费屏豁免修复，push 新视频页后返回即可正确恢复本页源与进度（审计 V12）。
    if (ep.bvid && info && ep.bvid !== info.bvid) {
      // 处于连播队列时携带 queue=1，新页接管模块缓存队列继续自动连播
      const carryQueue = medialistActiveRef.current;
      router.push({ pathname: `/video/${ep.bvid}`, params: carryQueue ? { queue: '1' } : {} } as any);
      return;
    }
    switchToCid(ep.cid);
  }

  /* ===== 播放列表 medialist：上下集切换 + 播完自动连播 =====
     对齐 Flutter medialist / PGC handleEpisodeEnd 语义：
       - 手动「下一集/上一集」（面板底栏）不受 playRepeat 限制，始终循环切换；
       - 播完自动连播受 playRepeat 约束：0=播完暂停（仅上报"看完"），3=随机，1/2=顺序循环。 */
  const switchEpisodeRef = useRef(switchEpisode);
  useEffect(() => { switchEpisodeRef.current = switchEpisode; });

  /** 队列中当前项索引：同视频多 P 时按 cid 精确匹配，否则退化为 bvid 匹配 */
  const findQueueIndex = (queue: MediaListItem[], bvid: string, cid: number): number => {
    if (queue.length === 0) return -1;
    if (cid) {
      const exact = queue.findIndex((it) => it.bvid === bvid && it.cid === cid);
      if (exact >= 0) return exact;
    }
    return queue.findIndex((it) => it.bvid === bvid);
  };

  const advanceQueue = useCallback(
    (manual: boolean) => {
      const q = medialistQueueRef.current;
      const bvid = infoRef.current?.bvid || id;
      const idx = findQueueIndex(q, bvid, currentCid);
      if (q.length === 0 || idx < 0) return;
      const st = useSettingsStore.getState();
      if (!manual && st.playRepeat === 0) {
        // 播完暂停：仅上报"看完"（清除稍后再看保留，由 toview 接口服务端处理）
        if (infoRef.current) {
          videoApi.toViewLater({ aid: infoRef.current.aid }).catch(() => {});
        }
        return;
      }
      let nextIdx = (idx + 1) % q.length;
      if (!manual && st.playRepeat === 3 && q.length > 1) {
        let r = Math.floor(Math.random() * q.length);
        if (r === idx) r = (r + 1) % q.length;
        nextIdx = r;
      }
      if (nextIdx === idx) return;
      switchEpisodeRef.current(q[nextIdx]);
    },
    [id, currentCid],
  );
  const advanceQueueRef = useRef(advanceQueue);
  useEffect(() => { advanceQueueRef.current = advanceQueue; });

  /** 播完自动连播：仅连播队列激活时接管（普通播放不干扰既有行为） */
  useEffect(() => {
    if (!player) return;
    const endSub = player.addListener('playToEnd', () => {
      if (!medialistActiveRef.current) return;
      advanceQueueRef.current(false);
    });
    return () => endSub.remove();
  }, [player]);

  /** 面板底栏「下一集」：手动循环切换（不受播完暂停约束） */
  const playNextInQueue = useCallback(() => advanceQueue(true), [advanceQueue]);

  /** 面板底栏「上一集」：手动向前切换 */
  const playPrevInQueue = useCallback(() => {
    const q = medialistQueueRef.current;
    const bvid = infoRef.current?.bvid || id;
    const idx = findQueueIndex(q, bvid, currentCid);
    if (q.length === 0 || idx < 0) return;
    const prev = q[(idx - 1 + q.length) % q.length];
    switchEpisodeRef.current(prev);
  }, [id, currentCid]);

  /** 注册模块级句柄（依赖四项保证闭包新鲜），供 VideoIntroSection / MediaListPanel 渲染期取用 */
  useEffect(() => {
    setMediaListHandlers({
      open: openMediaList,
      close: closeMediaList,
      playNext: playNextInQueue,
      playPrev: playPrevInQueue,
    });
    return () => setMediaListHandlers(null);
  }, [openMediaList, closeMediaList, playNextInQueue, playPrevInQueue]);

  /* 更多菜单（对齐 Flutter 版: 稍后再看/查看笔记/复制链接/分享/举报 + 保存封面/听音频） */
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
      case 'saveCover':
        // 保存封面到相册（复用 pili-native-core 的 PHPhotoLibrary 原生路径）
        if (info?.pic) void saveImageToAlbum(info.pic);
        else showToast('暂无封面');
        break;
      case 'listenAudio':
        handleListenVideo();
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
      { text: '保存封面', onPress: () => handleMoreAction('saveCover') },
      { text: '听音频', onPress: () => handleMoreAction('listenAudio') },
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

  /* 渲染期同步模块级总线快照（VideoIntroSection 经 getMediaListBus 读取，快照不滞后一帧）。
     react-hooks/globals：本写入是有意为之——若移入 effect，面板状态翻转的那次渲染
     读取到的是旧快照，且没有后续渲染修正，会破坏同渲染可见性契约（详见模块头注释）。 */
  // eslint-disable-next-line react-hooks/globals
  mediaListBus = {
    active: medialistActive,
    visible: medialistVisible,
    queue: medialistQueue,
    title: medialistTitle,
    currentBvid: info?.bvid || '',
    currentCid,
    currentTime: mediaNow,
    duration: mediaDuration,
  };

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
    episodeSections,
    seasonEpisodes,
    playableCount,
    playerBaseHeight,
    playerCollapseStyle,
    playerSlotStyle,
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
    aiOutline,
    episodePanelVisible,
    openEpisodePanel,
    closeEpisodePanel,
    /* 播放列表 medialist：队列面板状态与上下集切换（VideoScreenView 无需消费，面板内联于 VideoIntroSection 经模块总线取用） */
    medialistVisible,
    medialistQueue,
    medialistTitle,
    mediaNow,
    mediaDuration,
    openMediaList,
    closeMediaList,
    playNextInQueue,
    playPrevInQueue,
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
    loadError,
    retryLoad,
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
  // 01-R5/04-3.7/06-C7：渲染期副作用移入 effect（StrictMode/React Compiler 下不重复执行）
  useEffect(() => {
    const cfg = getPlayerConfig();
    PiliPlayer.shared.setLoop(cfg.playRepeat === 1);
    PiliPlayer.shared.setMuted(false);
    PiliPlayer.shared.setBufferConfig(cfg.bufferSec);
    PiliPlayer.shared.setLiveMode(false);
  }, []);
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

