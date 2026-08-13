/**
 * EmptyState —— 全站共享空态（收敛 33 处 emptyIconBox 的"84px 圆图标 + 标题 + 副标题"样式）。
 *
 * 设计意图：此前每个页面各自复制一份 84px 圆图标 + 标题 + 副标题空态（文案/图标漂移），
 * 这里统一为一处，消费方只需声明 icon / title / subtitle。
 *
 * 主题：颜色全部走 useThemeColors、字阶走 useType、圆角走 RADII（对齐 05-C2）。
 * 动效：入场淡入上移，响应系统"减弱动态效果"（useReducedMotion 时直接呈现最终态）。
 *
 * 用法：
 *   import EmptyState from '@/components/EmptyState';
 *   <EmptyState icon="leaf-outline" title="暂无动态" subtitle="下拉刷新试试" />
 */
import { useEffect, type ComponentProps, type ReactNode } from 'react';
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
import { RADII, continuous } from '@/theme/tokens';

type IoniconName = ComponentProps<typeof Ionicons>['name'];

export interface EmptyStateProps {
  /** 圆图标（Ionicons 名称），默认 file-tray-outline */
  icon?: IoniconName;
  /** 主标题，默认"暂无内容" */
  title?: string;
  /** 副标题（可选） */
  subtitle?: string;
  /** 自定义容器样式（可覆盖间距/布局） */
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
}

export default function EmptyState({
  icon = 'file-tray-outline',
  title = '暂无内容',
  subtitle,
  style,
  children,
}: EmptyStateProps) {
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
      {subtitle ? (
        <Text style={[T.footnote, styles.sub, { color: colors.textSecondary }]}>{subtitle}</Text>
      ) : null}
      {children}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  /* 对齐现有 emptyWrap 布局（history/dynamics 同款）：顶部留白 + 水平居中 */
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
  sub: { textAlign: 'center' },
});
