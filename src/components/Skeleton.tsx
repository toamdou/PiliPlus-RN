/**
 * Skeleton —— 骨架屏共享件（替代各页面 8+ 处复制的骨架实现）。
 *
 * 脉冲动画统一：单程 0.35 → 0.7（900ms），灰块用 useThemeColors 取色。
 *  - SkeletonCard：媒体大图占位 + 两行文字（视频/收藏卡片类骨架）；
 *  - SkeletonRow：方块占位 + 两行文字（头像/封面行类骨架）。
 * 页面按自身布局传 height 控制占位块尺寸。
 */
import { useEffect } from 'react';
import type React from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useThemeColors } from '@/components/SwiftUIHost';
import { RADII, continuous } from '@/theme/tokens';

function useBone(colors: ReturnType<typeof useThemeColors>) {
  const reducedMotion = useReducedMotion();
  const pulse = useSharedValue(0.35);
  useEffect(() => {
    if (reducedMotion) {
      /* 减弱动态效果：静态灰块，不做脉冲 */
      pulse.set(0.5);
      return;
    }
    /* 有限脉冲：0.35 → 0.7 一次到位后保持静态，避免加载期无限动画常驻 */
    pulse.set(0.35);
    pulse.set(withTiming(0.7, { duration: 900 }));
    /* pulse 为共享值，引用稳定，effect 只在 reducedMotion/pulse 变化时执行 */
  }, [reducedMotion, pulse]);
  return useAnimatedStyle(() => ({
    opacity: reducedMotion ? 0.5 : pulse.value,
    backgroundColor: colors.fill2,
  }));
}

/** 卡片骨架：媒体占位（height 控制高度）+ 两行文字 */
export function SkeletonCard({ height = 120 }: { height?: number }): React.JSX.Element {
  const colors = useThemeColors();
  const bone = useBone(colors);
  return (
    <View style={styles.card}>
      <Animated.View style={[styles.media, { height }, bone]} />
      <Animated.View style={[styles.lineWide, bone]} />
      <Animated.View style={[styles.lineNarrow, bone]} />
    </View>
  );
}

/** 行骨架：方形占位（height 控制边长）+ 两行文字；round 时占位为圆形（头像类骨架） */
export function SkeletonRow({
  height = 56,
  round = false,
  trailing,
}: {
  height?: number;
  round?: boolean;
  trailing?: React.ReactNode;
}): React.JSX.Element {
  const colors = useThemeColors();
  const bone = useBone(colors);
  return (
    <View style={styles.row}>
      <Animated.View style={[{ width: height, height, borderRadius: round ? height / 2 : RADII.sm, ...continuous }, bone]} />
      <View style={styles.rowLines}>
        <Animated.View style={[styles.lineWide, bone]} />
        <Animated.View style={[styles.lineNarrow, bone]} />
      </View>
      {trailing}
    </View>
  );
}

/** 媒体行骨架：封面/缩略图占位 + 多行文字（历史/稍后再看等列表行用） */
export function SkeletonMediaRow({
  mediaWidth = 132,
  mediaHeight = 82,
  lines = 2,
}: {
  mediaWidth?: number;
  mediaHeight?: number;
  lines?: number;
}): React.JSX.Element {
  const colors = useThemeColors();
  const bone = useBone(colors);
  return (
    <View style={styles.mediaRow}>
      <Animated.View style={[{ width: mediaWidth, height: mediaHeight, borderRadius: RADII.sm, ...continuous }, bone]} />
      <View style={styles.mediaRowLines}>
        <Animated.View style={[styles.lineWide, bone]} />
        <Animated.View style={[styles.lineNarrow, bone]} />
        {lines >= 3 ? <Animated.View style={[styles.lineThird, bone]} /> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: 9 },
  media: { borderRadius: RADII.md, ...continuous },
  row: { flexDirection: 'row', gap: 12 },
  rowLines: { flex: 1, justifyContent: 'center', gap: 8 },
  mediaRow: { flexDirection: 'row', gap: 12 },
  mediaRowLines: { flex: 1, justifyContent: 'center', gap: 8 },
  lineWide: { width: '80%', height: 13, borderRadius: 5 },
  lineNarrow: { width: '45%', height: 11, borderRadius: 5 },
  lineThird: { width: '35%', height: 11, borderRadius: 5 },
});
