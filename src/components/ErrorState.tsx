/**
 * ErrorState —— 全站共享错误态（图标 + 文案 + 品牌胶囊重试按钮）。
 *
 * 此前各屏失败静默空列表（无提示、无重试），或重试按钮至少 3 种样式；
 * 这里统一为：cloud-offline 图标 + 标题/说明 + 品牌胶囊（RADII.circle + colors.accent）重试按钮。
 * 样式全部走主题 token：useThemeColors / RADII / useType。
 * 动效：入场淡入上移，响应系统"减弱动态效果"（useReducedMotion 时直接呈现最终态）。
 *
 * 用法：
 *   import ErrorState from '@/components/ErrorState';
 *   <ErrorState title="加载失败" message="请检查网络后重试" onRetry={() => reload()} />
 *   // 无 onRetry 时只展示提示，不渲染按钮（如纯信息型失败）
 */
import { useEffect, type ComponentProps } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  useReducedMotion,
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { useThemeColors } from '@/components/SwiftUIHost';
import { useType } from '@/components/type-scale';
import { Press } from '@/components/motion';
import { RADII, continuous } from '@/theme/tokens';

type IoniconName = ComponentProps<typeof Ionicons>['name'];

export interface ErrorStateProps {
  /** 主标题，默认"加载失败" */
  title?: string;
  /** 说明文案（可选） */
  message?: string;
  /** 重试回调；不传则不渲染重试按钮 */
  onRetry?: () => void;
  /** 重试按钮文案，默认"重试" */
  retryLabel?: string;
  /** 图标（Ionicons 名称），默认 cloud-offline-outline */
  icon?: IoniconName;
  /** 自定义容器样式 */
  style?: StyleProp<ViewStyle>;
}

export default function ErrorState({
  title = '加载失败',
  message,
  onRetry,
  retryLabel = '重试',
  icon = 'cloud-offline-outline',
  style,
}: ErrorStateProps) {
  const colors = useThemeColors();
  const T = useType();
  const reducedMotion = useReducedMotion();
  // 入场淡入上移：减弱动态效果时直接呈现最终态（对齐 motion.tsx Reveal 的降级约定）
  const p = useSharedValue(reducedMotion ? 1 : 0);
  useEffect(() => {
    if (reducedMotion) return;
    p.set(withTiming(1, { duration: 250, easing: Easing.out(Easing.cubic) }));
  }, [reducedMotion, p]);
  const animStyle = useAnimatedStyle(() => ({
    opacity: p.value,
    transform: [{ translateY: (1 - p.value) * 12 }],
  }));
  return (
    <Animated.View style={[styles.wrap, animStyle, style]}>
      <View style={[styles.iconBox, { backgroundColor: colors.fill2 }]}>
        <Ionicons name={icon} size={40} color={colors.textTertiary} />
      </View>
      <Text style={[T.headline, styles.title, { color: colors.text }]}>{title}</Text>
      {message ? (
        <Text style={[T.footnote, styles.message, { color: colors.textSecondary }]}>{message}</Text>
      ) : null}
      {onRetry ? (
        <Press
          haptic
          scaleTo={0.94}
          onPress={onRetry}
          style={[styles.retryBtn, { backgroundColor: colors.accent }]}>
          <Text style={[T.subhead, styles.retryText]}>{retryLabel}</Text>
        </Press>
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  /* 对齐现有空态布局：顶部留白 + 水平居中 */
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 120,
    paddingHorizontal: 40,
    gap: 8,
  },
  iconBox: {
    width: 84,
    height: 84,
    borderRadius: RADII.circle,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
    ...continuous,
  },
  title: { fontWeight: '600', textAlign: 'center' },
  message: { textAlign: 'center' },
  /* 品牌胶囊重试按钮（05-C2：统一重试为 RADII.circle 品牌胶囊） */
  retryBtn: {
    marginTop: 14,
    borderRadius: RADII.circle,
    paddingHorizontal: 30,
    paddingVertical: 10,
    ...continuous,
  },
  retryText: { color: '#FFFFFF', fontWeight: '600' },
});
