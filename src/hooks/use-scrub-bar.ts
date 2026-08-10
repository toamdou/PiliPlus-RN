import { Gesture } from 'react-native-gesture-handler';
import {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

const clamp01 = (v: number) => {
  'worklet';
  return Math.min(Math.max(v, 0), 1);
};

export type ScrubBarOptions = {
  durationSV: SharedValue<number>;
  trackWidthSV: SharedValue<number>;
  progressRatio: SharedValue<number>;
  scrubbing: SharedValue<number>;
  enabled: boolean;
  velocitySpring: boolean;
  onPreview: (t: number) => void;
  onSeek: (t: number) => void;
  onStart?: () => void;
  /** 开启后额外生成播放器表面的横向 seek 手势，与进度条共用同一 worklet 路径。 */
  surface?: boolean;
  playerWidthSV?: SharedValue<number>;
  sliderScaleSV?: SharedValue<number>;
  seekBaseSV?: SharedValue<number>;
  seekTargetSV?: SharedValue<number>;
  edgeBlockedSV?: SharedValue<number>;
  onHudUpdate?: (target: number, delta: number) => void;
  onHudEnd?: () => void;
};

/**
 * 统一详情页与全屏页的进度条/表面 seek 手势/动画实现。
 * 手势在原生 UI 线程执行，预览/落点只按 6 帧节流回传 JS。
 */
export function useScrubBar({
  durationSV,
  trackWidthSV,
  progressRatio,
  scrubbing,
  enabled,
  velocitySpring,
  onPreview,
  onSeek,
  onStart,
  surface = false,
  playerWidthSV,
  sliderScaleSV,
  seekBaseSV,
  seekTargetSV,
  edgeBlockedSV,
  onHudUpdate,
  onHudEnd,
}: ScrubBarOptions) {
  const previewThrottle = useSharedValue(0);
  const surfaceThrottle = useSharedValue(0);

  const gesture = Gesture.Pan()
    .minDistance(0)
    .enabled(enabled)
    .onStart((e) => {
      if (durationSV.value <= 0 || trackWidthSV.value <= 0) return;
      scrubbing.set(withTiming(1, { duration: 150 }));
      previewThrottle.set(0);
      const ratio = clamp01(e.x / trackWidthSV.value);
      progressRatio.set(ratio);
      runOnJS(onPreview)(ratio * durationSV.value);
      if (onStart) runOnJS(onStart)();
    })
    .onUpdate((e) => {
      if (durationSV.value <= 0 || trackWidthSV.value <= 0) return;
      const ratio = clamp01(e.x / trackWidthSV.value);
      progressRatio.set(ratio);
      previewThrottle.set((previewThrottle.value + 1) % 6);
      if (previewThrottle.value === 0) {
        runOnJS(onPreview)(ratio * durationSV.value);
      }
    })
    .onEnd((e) => {
      if (durationSV.value <= 0 || trackWidthSV.value <= 0) return;
      if (velocitySpring) {
        const vRatio = e.velocityX / trackWidthSV.value;
        const target = clamp01(progressRatio.value + vRatio * 0.18);
        progressRatio.set(
          withSpring(target, {
            damping: 24,
            stiffness: 340,
            mass: 0.7,
            velocity: vRatio,
          }),
        );
        runOnJS(onSeek)(target * durationSV.value);
      } else {
        runOnJS(onSeek)(clamp01(e.x / trackWidthSV.value) * durationSV.value);
      }
    })
    .onFinalize(() => {
      scrubbing.set(withTiming(0, { duration: 200 }));
    });

  const surfaceGesture = Gesture.Pan()
    .activeOffsetX([-16, 16])
    .shouldCancelWhenOutside(true)
    .enabled(enabled)
    .onBegin((e) => {
      edgeBlockedSV?.set(e.absoluteX < 24 ? 1 : 0);
    })
    .onStart(() => {
      if (!surface || edgeBlockedSV?.value === 1) return;
      if (playerWidthSV == null) return;
      if (durationSV.value <= 0 || playerWidthSV.value <= 0) return;
      scrubbing.set(withTiming(1, { duration: 150 }));
      surfaceThrottle.set(0);
      const base = progressRatio.value * durationSV.value;
      if (seekBaseSV == null || seekTargetSV == null) return;
      seekBaseSV.set(base);
      seekTargetSV.set(base);
      progressRatio.set(base / durationSV.value);
      runOnJS(onPreview)(base);
      if (onHudUpdate) runOnJS(onHudUpdate)(base, 0);
      if (onStart) runOnJS(onStart)();
    })
    .onUpdate((e) => {
      if (!surface || edgeBlockedSV?.value === 1) return;
      if (playerWidthSV == null || sliderScaleSV == null) return;
      const width = playerWidthSV.value;
      const scale = sliderScaleSV.value;
      if (durationSV.value <= 0 || width <= 0 || scale <= 0) return;
      if (seekBaseSV == null || seekTargetSV == null) return;
      const deltaSec = (e.translationX / width) * scale;
      const target = clamp01((seekBaseSV.value + deltaSec) / durationSV.value) * durationSV.value;
      seekTargetSV.set(target);
      progressRatio.set(target / durationSV.value);
      surfaceThrottle.set((surfaceThrottle.value + 1) % 6);
      if (surfaceThrottle.value === 0) {
        runOnJS(onPreview)(target);
        if (onHudUpdate) runOnJS(onHudUpdate)(target, target - seekBaseSV.value);
      }
    })
    .onEnd(() => {
      if (!surface || edgeBlockedSV?.value === 1) return;
      if (durationSV.value <= 0) return;
      if (seekTargetSV == null) return;
      const target = seekTargetSV.value > 0 ? seekTargetSV.value : progressRatio.value * durationSV.value;
      runOnJS(onSeek)(target);
    })
    .onFinalize(() => {
      scrubbing.set(withTiming(0, { duration: 200 }));
      if (onHudEnd) runOnJS(onHudEnd)();
    });

  const fillStyle = useAnimatedStyle(() => ({
    width: `${progressRatio.value * 100}%`,
  }));
  const thumbStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: progressRatio.value * trackWidthSV.value - 6 },
      { scale: 1 + scrubbing.value * 0.35 },
    ],
  }));
  const trackStyle = useAnimatedStyle(() => ({
    height: 3 + scrubbing.value * 2,
  }));

  return { gesture, surfaceGesture, fillStyle, thumbStyle, trackStyle };
}
