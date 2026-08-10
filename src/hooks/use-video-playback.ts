/* eslint-disable react-hooks/immutability, react-hooks/refs, react-hooks/purity, react-hooks/preserve-manual-memoization */
import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { useWindowDimensions } from 'react-native';
import { Gesture } from 'react-native-gesture-handler';
import {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { videoApi } from '@/api/video';
import type { VideoShotData } from '@/api/video';
import type { SBSegment } from '@/api/sponsor-block';
import type { PlayerTimeControl } from '@/components/video/PlayerTimeProvider';
import type { VideoInfo } from '@/hooks/use-video-comments';
import { useScrubBar } from '@/hooks/use-scrub-bar';
import { usePlayerStore } from '@/stores/player';
import { useAuthStore } from '@/stores/auth';
import { useSettingsStore } from '@/stores/settings';
import { feedBack } from '@/utils/feedback';
import { formatPlayerTime } from '@/utils/player-utils';
import { sortSkipSegments } from '@/utils/skip-segments';
import { showToast } from '@/utils/toast';

export const clamp01 = (v: number) => {
  'worklet';
  return Math.min(Math.max(v, 0), 1);
};

export interface VideoPlaybackOptions {
  player: any;
  playUrl: string;
  videoSource: { uri: string; headers: Record<string, string> } | null;
  initialSeekTime: number;
  sbSegments: SBSegment[];
  dmInputVisible: boolean;
  infoRef: RefObject<VideoInfo | null>;
  autoEnterFullscreenDoneRef: RefObject<boolean>;
  autoEnterFullscreenRef: RefObject<() => void>;
  tryAutoPlay: () => boolean;
}

export function useVideoPlayback(options: VideoPlaybackOptions) {
  'use no memo';
  const {
    player,
    playUrl,
    videoSource,
    initialSeekTime,
    sbSegments,
    dmInputVisible,
    infoRef,
    autoEnterFullscreenDoneRef,
    autoEnterFullscreenRef,
    tryAutoPlay,
  } = options;

  const { width: windowWidth } = useWindowDimensions();

  const [videoStarted, setVideoStarted] = useState(() => useSettingsStore.getState().autoPlay);
  const videoStartedRef = useRef(videoStarted);
  useEffect(() => { videoStartedRef.current = videoStarted; }, [videoStarted]);

  const [isPlaying, setIsPlaying] = useState(false);
  const isPlayingRef = useRef(false);
  const [playSpeed, setPlaySpeed] = useState(1.0);
  const playSpeedRef = useRef(1.0);
  const preBoostSpeed = useRef(1.0);
  const [speedBoost, setSpeedBoost] = useState(false);
  const speedBoostRef = useRef(false);
  useEffect(() => { speedBoostRef.current = speedBoost; }, [speedBoost]);

  const currentTimeRef = useRef(0);
  const timeControlRef = useRef<PlayerTimeControl | null>(null);
  const [, setDuration] = useState(0);
  const isScrubbingRef = useRef(false);
  const seekGuardRef = useRef(0);
  const lastHeartbeatRef = useRef(0);
  const hasSeekedRef = useRef(false);
  const [seekThumbnails, setSeekThumbnails] = useState<VideoShotData | null>(null);
  const [showSeekThumb, setShowSeekThumb] = useState(false);
  const sponsorBlockEnabled = useSettingsStore((s) => s.enableSponsorBlock);

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

  const durationSV = useSharedValue(0);
  const progressRatio = useSharedValue(0);
  const scrubbing = useSharedValue(0);
  const trackWidthSV = useSharedValue(0);
  const playerWidthSV = useSharedValue(windowWidth);
  const seekBaseSV = useSharedValue(0);
  const seekTargetSV = useSharedValue(0);
  const sliderScaleSV = useSharedValue(90);
  const edgeBlockedSV = useSharedValue(0);
  const seekHudOpacity = useSharedValue(0);
  const [seekHudTarget, setSeekHudTarget] = useState(0);
  const [seekHudDelta, setSeekHudDelta] = useState(0);
  const seekHudTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seekHudAnimStyle = useAnimatedStyle(() => ({ opacity: seekHudOpacity.value }));

  const controlsVisibleRef = useRef(true);
  const [controlsShown, setControlsShown] = useState(true);
  const controlsOpacity = useSharedValue(1);
  const controlsTY = useSharedValue(0);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearHideTimer = useCallback(() => {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  }, []);

  const setControls = useCallback((show: boolean) => {
    controlsVisibleRef.current = show;
    setControlsShown(show);
    if (!show) clearHideTimer();
    controlsOpacity.set(withSpring(show ? 1 : 0, { damping: 30, stiffness: 400, mass: 1 }));
    controlsTY.set(withSpring(show ? 0 : 10, { damping: 30, stiffness: 400, mass: 1 }));
  }, [clearHideTimer, controlsOpacity, controlsTY]);

  const scheduleHideIfPlaying = useCallback(() => {
    clearHideTimer();
    if (isPlaying && !dmInputVisible) {
      const st = useSettingsStore.getState();
      hideTimerRef.current = setTimeout(
        () => setControls(false),
        st.enableLongShowControl ? 30000 : 4000,
      );
    }
  }, [clearHideTimer, dmInputVisible, isPlaying, setControls]);

  const pokeControls = useCallback(() => {
    if (!controlsVisibleRef.current) setControls(true);
    scheduleHideIfPlaying();
  }, [scheduleHideIfPlaying, setControls]);

  useEffect(() => {
    if (!videoStarted) return;
    if (!isPlaying) {
      clearHideTimer();
      if (!controlsVisibleRef.current) setControls(true);
    } else {
      scheduleHideIfPlaying();
    }
    return clearHideTimer;
  }, [clearHideTimer, isPlaying, scheduleHideIfPlaying, setControls, videoStarted]);

  const controlsAnimStyle = useAnimatedStyle(() => ({
    opacity: controlsOpacity.value,
    transform: [{ translateY: controlsTY.value }],
  }));

  const boostScale = useSharedValue(0.8);
  const boostOpacity = useSharedValue(0);
  useEffect(() => {
    if (speedBoost) {
      boostScale.set(withSpring(1, { damping: 14, stiffness: 480, mass: 0.7 }));
      boostOpacity.set(withTiming(1, { duration: 120 }));
    } else {
      boostScale.set(withTiming(0.8, { duration: 150 }));
      boostOpacity.set(withTiming(0, { duration: 150 }));
    }
  }, [boostOpacity, boostScale, speedBoost]);
  const boostBadgeStyle = useAnimatedStyle(() => ({
    opacity: boostOpacity.value,
    transform: [{ scale: boostScale.value }],
  }));

  useEffect(() => {
    if (!player) return;
    const sub = player.addListener('timeUpdate', (e: any) => {
      if (typeof e.duration === 'number' && e.duration > 0) setDuration(e.duration);
      if (isScrubbingRef.current) return;
      if (Date.now() - seekGuardRef.current < 600) return;
      currentTimeRef.current = e.currentTime;
      if (
        useSettingsStore.getState().enableHeartbeat &&
        !useAuthStore.getState().anonymousMode &&
        e.currentTime - lastHeartbeatRef.current >= 5 &&
        infoRef.current
      ) {
        lastHeartbeatRef.current = e.currentTime;
        videoApi.heartbeat({
          aid: infoRef.current.aid,
          bvid: infoRef.current.bvid,
          cid: infoRef.current.cid,
          played_time: Math.floor(e.currentTime),
          real_time: Math.floor(e.currentTime),
          play_type: 0,
          network_type: 0,
        }).catch(() => {});
      }
    });
    const playingSub = player.addListener('playingChange', (e: any) => {
      isPlayingRef.current = !!e.isPlaying;
      setIsPlaying(!!e.isPlaying);
      if (e.isPlaying) {
        const st = useSettingsStore.getState();
        if (st.enableAutoEnter && videoStartedRef.current && !usePlayerStore.getState().audioMode && !autoEnterFullscreenDoneRef.current) {
          autoEnterFullscreenDoneRef.current = true;
          autoEnterFullscreenRef.current?.();
        }
      }
    });
    const statusSub = player.addListener('statusChange', (e: any) => {
      if (e.status === 'readyToPlay') {
        if (player.duration > 0) setDuration(player.duration);
        const seekTo = initialSeekTime;
        if (seekTo > 0 && !hasSeekedRef.current && seekTo < (player.duration || Infinity)) {
          hasSeekedRef.current = true;
          player.currentTime = seekTo;
          showToast(`已跳转至 ${formatPlayerTime(seekTo)}`);
        }
      }
    });
    let initialTimer: ReturnType<typeof setTimeout> | null = null;
    if (typeof (player as any).playing === 'boolean') {
      const initialPlaying = !!(player as any).playing;
      isPlayingRef.current = initialPlaying;
      initialTimer = setTimeout(() => setIsPlaying(initialPlaying), 0);
    }
    return () => {
      sub.remove();
      playingSub.remove();
      statusSub.remove();
      if (initialTimer) clearTimeout(initialTimer);
    };
  }, [autoEnterFullscreenDoneRef, autoEnterFullscreenRef, infoRef, initialSeekTime, player]);

  const initialSourceRef = useRef(videoSource);
  useEffect(() => {
    if (initialSourceRef.current && initialSourceRef.current === videoSource) {
      if (!player) return;
      const st = useSettingsStore.getState();
      player.playbackRate = playSpeedRef.current || st.defaultPlaySpeed || 1;
      player.volume = Math.min(Math.max((st.playerVolume ?? 100) / 100, 0), 1);
      const ready = () => {
        if (player.duration && player.duration > 0) setDuration(player.duration);
        if (videoStartedRef.current) player.play();
        else tryAutoPlay();
      };
      if ((player as any).status === 'readyToPlay') {
        ready();
        return;
      }
      const sub = player.addListener('statusChange', (e: any) => {
        if (e?.status === 'readyToPlay') {
          ready();
          sub.remove();
        }
      });
      return () => sub.remove();
    }
    let cancelled = false;
    if (playUrl && player) {
      (async () => {
        try {
          await player.replaceAsync(videoSource!);
        } catch {
          return;
        }
        if (cancelled) return;
        const st = useSettingsStore.getState();
        player.playbackRate = playSpeedRef.current || st.defaultPlaySpeed || 1;
        player.volume = Math.min(Math.max((st.playerVolume ?? 100) / 100, 0), 1);
        if (player.duration && player.duration > 0) setDuration(player.duration);
        if (videoStartedRef.current) player.play();
        else tryAutoPlay();
      })();
    }
    return () => { cancelled = true; };
  }, [playUrl, player, tryAutoPlay, videoSource]);

  useEffect(() => () => {
    if (seekHudTimerRef.current) clearTimeout(seekHudTimerRef.current);
  }, []);

  const scrubPreview = useCallback((t: number) => {
    isScrubbingRef.current = true;
    currentTimeRef.current = t;
    timeControlRef.current?.publish(t);
  }, []);

  const onScrubStart = useCallback(() => {
    clearHideTimer();
    if (seekThumbnails?.image?.length) setShowSeekThumb(true);
  }, [clearHideTimer, seekThumbnails]);

  const hideSeekHud = useCallback(() => {
    seekHudOpacity.set(withTiming(0, { duration: 220 }));
  }, [seekHudOpacity]);

  const jsSeekUpdateHud = (target: number, delta: number) => {
    setSeekHudTarget(target);
    setSeekHudDelta(delta);
  };

  const onSurfaceSeekStart = useCallback(() => {
    clearHideTimer();
    const st = useSettingsStore.getState();
    const duration = player.duration || durationSV.value || 0;
    sliderScaleSV.set(st.useRelativeSlide
      ? duration * ((st.sliderDuration || 90) / 100)
      : (st.sliderDuration || 90));
    const base = player.currentTime || 0;
    seekBaseSV.set(base);
    seekTargetSV.set(base);
    isScrubbingRef.current = true;
    currentTimeRef.current = base;
    timeControlRef.current?.publish(base);
    seekHudOpacity.set(withTiming(1, { duration: 120 }));
    setSeekHudTarget(base);
    setSeekHudDelta(0);
    onScrubStart();
  }, [
    clearHideTimer,
    durationSV,
    onScrubStart,
    player,
    seekBaseSV,
    seekHudOpacity,
    seekTargetSV,
    sliderScaleSV,
  ]);

  const finishScrub = useCallback((t: number) => {
    isScrubbingRef.current = false;
    setShowSeekThumb(false);
    seekGuardRef.current = Date.now();
    if (player) player.currentTime = t;
    currentTimeRef.current = t;
    timeControlRef.current?.publish(t);
    seekHudOpacity.set(withTiming(0, { duration: 220 }));
    pokeControls();
  }, [player, pokeControls, seekHudOpacity]);

  const {
    gesture: scrubGesture,
    surfaceGesture,
    fillStyle: progressFillStyle,
    thumbStyle: progressThumbStyle,
    trackStyle: progressTrackAnimStyle,
  } = useScrubBar({
    durationSV,
    trackWidthSV,
    progressRatio,
    scrubbing,
    enabled: true,
    velocitySpring: true,
    onPreview: scrubPreview,
    onSeek: finishScrub,
    onStart: onSurfaceSeekStart,
    surface: true,
    playerWidthSV,
    sliderScaleSV,
    seekBaseSV,
    seekTargetSV,
    edgeBlockedSV,
    onHudUpdate: jsSeekUpdateHud,
    onHudEnd: hideSeekHud,
  });

  const togglePlay = useCallback(() => {
    pokeControls();
    if (isPlayingRef.current) player.pause();
    else player.play();
  }, [player, pokeControls]);

  const doubleTapSeek = (dir: number) => {
    const st = useSettingsStore.getState();
    if (!st.enableQuickDouble) return;
    const dur = player.duration || durationSV.value || 0;
    if (dur <= 0) return;
    const step = st.fastForBackwardDuration || 10;
    const target = Math.min(Math.max((player.currentTime || 0) + dir * step, 0), dur);
    seekGuardRef.current = Date.now();
    player.currentTime = target;
    currentTimeRef.current = target;
    timeControlRef.current?.publish(target);
    feedBack();
    setSeekHudTarget(target);
    setSeekHudDelta(dir * step);
    seekHudOpacity.set(withTiming(1, { duration: 120 }));
    if (seekHudTimerRef.current) clearTimeout(seekHudTimerRef.current);
    seekHudTimerRef.current = setTimeout(() => {
      seekHudTimerRef.current = null;
      seekHudOpacity.set(withTiming(0, { duration: 220 }));
    }, 650);
    pokeControls();
  };

  const startBoost = () => {
    const st = useSettingsStore.getState();
    if (!st.enableAutoLongPressSpeed) return;
    preBoostSpeed.current = playSpeedRef.current || player.playbackRate || 1;
    player.playbackRate = st.longPressSpeedDefault || 3;
    setSpeedBoost(true);
    feedBack();
  };

  const endBoost = useCallback(() => {
    if (speedBoostRef.current) player.playbackRate = preBoostSpeed.current;
    setSpeedBoost(false);
  }, [player]);

  const handlePlayerTap = useCallback(() => {
    if (controlsVisibleRef.current) setControls(false);
    else pokeControls();
  }, [pokeControls, setControls]);

  const doubleTapGesture = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd((e) => {
      const w = playerWidthSV.value > 0 ? playerWidthSV.value : windowWidth;
      if (e.x < w / 3) runOnJS(doubleTapSeek)(-1);
      else if (e.x > (w * 2) / 3) runOnJS(doubleTapSeek)(1);
      else runOnJS(togglePlay)();
    });

  const singleTapGesture = Gesture.Tap()
    .numberOfTaps(1)
    .onEnd(() => {
      runOnJS(handlePlayerTap)();
    });

  const longPressGesture = Gesture.LongPress()
    .minDuration(350)
    .maxDistance(20)
    .onStart(() => {
      runOnJS(startBoost)();
    })
    .onFinalize(() => {
      runOnJS(endBoost)();
    });

  const seekPanGesture = surfaceGesture;

  const seekToTime = useCallback((t: number) => {
    try {
      player.currentTime = t;
      currentTimeRef.current = t;
      timeControlRef.current?.publish(t);
    } catch {}
  }, [player]);

  const changePlaySpeed = useCallback((sp: number) => {
    setPlaySpeed(sp);
    playSpeedRef.current = sp;
    player.playbackRate = sp;
  }, [player]);

  const changeVolume = useCallback((v: number) => {
    player.volume = v;
  }, [player]);

  const resetPlaybackState = useCallback(() => {
    currentTimeRef.current = 0;
    lastHeartbeatRef.current = 0;
    hasSeekedRef.current = true;
    setDuration(0);
    durationSV.set(0);
    progressRatio.set(0);
    timeControlRef.current?.publish(0, 0);
    setSeekThumbnails(null);
  }, [durationSV, progressRatio]);

  const clearPlaybackProgress = useCallback(() => {
    setDuration(0);
    durationSV.set(0);
    progressRatio.set(0);
    setSeekThumbnails(null);
  }, [durationSV, progressRatio]);

  return {
    videoStarted,
    setVideoStarted,
    videoStartedRef,
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
    togglePlay,
    doubleTapSeek,
    startBoost,
    endBoost,
    seekToTime,
    changePlaySpeed,
    changeVolume,
    resetPlaybackState,
    clearPlaybackProgress,
    sortedSbSegments,
  };
}
