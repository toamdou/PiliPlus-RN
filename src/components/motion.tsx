/**
 * motion —— 全局共享动效原语（react-native-reanimated）。
 *
 * 设计意图：让整站"活"起来——
 *  - Press：按压缩放 + 弹簧回弹（可选触觉反馈），替代裸 TouchableOpacity 的 opacity 闪变；
 *  - Reveal：入场淡入上移，虚拟列表（FlashList）中每个 item 挂载即触发，形成自然的滚动显现。
 *
 * 弹簧原则（Apple HIG）：
 *  - 用户可触发的动画一律用弹簧——可中断、从当前值出发，快速滚动/连续点击不抖动；
 *  - 按下用临界阻尼（dampingRatio 1.0）：按下即达、无过冲；
 *  - 松手用轻微欠阻尼（dampingRatio 0.75）："释放"语义允许微小回弹。
 *
 * 无障碍：全部原语响应系统"减弱动态效果"（useReducedMotion）——
 *  Press 改为纯 opacity 反馈（不触发前庭反应），Reveal 直接呈现最终态，
 *  useScrollHide 顶栏位移即时生效、不加动画。
 *
 * 全部基于 reanimated worklet，60/120fps 不掉帧，兼容 Expo Go。
 */
import React, { useEffect } from 'react';
import { Pressable, View, type PressableProps, type ViewStyle, type StyleProp } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  useAnimatedScrollHandler,
  withSpring,
  withTiming,
  withDelay,
  useReducedMotion,
  Easing,
  type AnimatedProps,
} from 'react-native-reanimated';
import { feedBack, feedBackMedium, feedBackHeavy, feedBackSelection, feedBackSoft, feedBackRigid } from '@/utils/feedback';

/** Apple HIG 动效 token */
export const MOTION = {
  // Apple-style spring: 自然减速，微妙弹跳
  spring: { damping: 22, stiffness: 300, mass: 0.8 },
  springBouncy: { damping: 16, stiffness: 260, mass: 0.7 },
  // Duration 预算 (ms)
  duration: { quick: 150, normal: 250, slow: 350 },
  // 列表入场
  staggerDelay: 40, // 30-80ms range
  revealDistance: 12,
};

const AnimatedPressable = Animated.createAnimatedComponent(Pressable) as React.ComponentType<
  AnimatedProps<PressableProps & { delayPressIn?: number }>
>;

/**
 * 弹簧配置助手：把 Apple 风格的“阻尼比 + 刚度”换算为 reanimated 物理弹簧参数。
 *
 * 为什么不用 { dampingRatio, stiffness } 直写：当前 reanimated 的 SpringConfig
 * 类型将二者划为互斥分支（dampingRatio 属于 duration 分支），且运行时一旦
 * 出现 dampingRatio 就走 duration 路径、stiffness 会被完全忽略。
 * 这里改用物理分支并用 damping = ratio × 2√(stiffness × mass)（mass 固定 1）换算，
 * 由 zeta = damping / (2√(k·m)) 可知运行时阻尼比精确等于传入的 ratio，
 * 类型正确且语义不丢失。
 */
function spring(dampingRatio: number, stiffness: number) {
  'worklet';
  return {
    damping: +(dampingRatio * 2 * Math.sqrt(stiffness)).toFixed(2),
    mass: 1,
    stiffness,
  };
}

/* ================= Press —— 弹簧按压 ================= */
export interface PressProps extends PressableProps {
  /** 按下时缩放目标（默认 0.95，越小反馈越强；Apple 推荐 0.95-0.97） */
  scaleTo?: number;
  /** 触觉反馈级别：true=light, 'medium'|'heavy'|'selection'|'soft'|'rigid' 为对应级别 */
  haptic?: boolean | 'medium' | 'heavy' | 'selection' | 'soft' | 'rigid';
  /** 按下延迟（ms）：防止滚动时误触缩放，默认 0 */
  pressDelay?: number;
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
}

export function Press({
  scaleTo = 0.95,
  haptic = false,
  pressDelay = 0,
  style,
  children,
  onPressIn,
  onPressOut,
  ...rest
}: PressProps) {
  const reducedMotion = useReducedMotion();
  const scale = useSharedValue(1);
  const opacity = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }));
  return (
    <AnimatedPressable
      delayPressIn={pressDelay}
      onPressIn={(e) => {
        if (reducedMotion) {
          // 减弱动态效果：不做缩放，仅用 opacity 反馈（100ms 淡变不触发前庭反应）
          opacity.set( withTiming(0.6, { duration: 100 }));
        } else {
          // 临界阻尼（ratio 1 / stiffness 500）：按下即达目标值，无弹跳
          scale.set( withSpring(scaleTo, spring(1, 500)));
        }
        if (haptic) {
          switch (haptic) {
            case 'medium': feedBackMedium(); break;
            case 'heavy': feedBackHeavy(); break;
            case 'selection': feedBackSelection(); break;
            case 'soft': feedBackSoft(); break;
            case 'rigid': feedBackRigid(); break;
            default: feedBack(); break; // true → light
          }
        }
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        if (reducedMotion) {
          opacity.set( withTiming(1, { duration: 100 }));
        } else {
          // 轻微欠阻尼（ratio 0.75 / stiffness 400）：松手是“释放”语义，允许微小过冲
          scale.set( withSpring(1, spring(0.75, 400)));
        }
        onPressOut?.(e);
      }}
      style={[animStyle, style]}
      {...rest}>
      {children}
    </AnimatedPressable>
  );
}

/* ================= Reveal —— 入场淡入上移 ================= */
export interface RevealProps {
  /** 延迟毫秒（用于列表交错入场：delay={index * 40}） */
  delay?: number;
  /** 上移距离 px */
  distance?: number;
  /** 动画时长 ms */
  duration?: number;
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
}

export function Reveal({ delay = 0, distance = MOTION.revealDistance, duration = MOTION.duration.normal, style, children }: RevealProps) {
  const reducedMotion = useReducedMotion();
  // 减弱动态效果：直接渲染最终状态，不启动动画
  const p = useSharedValue(reducedMotion ? 1 : 0);
  useEffect(() => {
    if (reducedMotion) return;
    p.set( withDelay(delay, withTiming(1, { duration, easing: Easing.out(Easing.cubic) })));
  }, [reducedMotion, p, delay, duration]);
  const animStyle = useAnimatedStyle(() => ({
    opacity: p.value,
    transform: [{ translateY: (1 - p.value) * distance }],
  }));
  if (reducedMotion) {
    return <View style={style}>{children}</View>;
  }
  return <Animated.View style={[animStyle, style]}>{children}</Animated.View>;
}

/** 列表交错入场延迟：配合 Reveal 使用 delay={stagger(index)} */
export function stagger(index: number, step = MOTION.staggerDelay): number {
  return Math.min(index, 10) * step;
}

/* ================= useScrollHide —— 滚动方向隐藏顶栏 ================= */
/**
 * 上滑（内容下移加载）隐藏、下滑（内容上移）显示。
 * 返回 headerAnim（translateY 动画 style）与 onScroll 处理器。
 * 底栏：iOS 26+ 由 NativeTabs minimizeBehavior="onScrollDown"（液态玻璃 pill 收缩/展开）原生处理；
 * iOS<26 由 useScrollHideTabBar + NativeTabs 官方 hidden prop 实现，详见 stores/tab-bar.ts。
 *
 * 弹簧驱动：临界阻尼（dampingRatio 1）+ stiffness 300——
 * 可中断、从当前值出发，快速滚动连续触发时平滑收敛、不抖动。
 * 减弱动态效果时直接落到目标值，不加任何动画。
 */
export function useScrollHide(headerH: number) {
  const reducedMotion = useReducedMotion();
  const translateY = useSharedValue(0);
  const lastY = useSharedValue(0);
  const headerAnim = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));
  const onScroll = useAnimatedScrollHandler((event) => {
    const y = event.contentOffset.y;
    const delta = y - lastY.value;
    lastY.set(y);
    if (y <= 0) {
      translateY.set(reducedMotion ? 0 : withSpring(0, spring(1, 300)));
    } else if (delta > 6) {
      translateY.set(
        reducedMotion ? -headerH : withSpring(-headerH, spring(1, 300)),
      );
    } else if (delta < -6) {
      translateY.set(reducedMotion ? 0 : withSpring(0, spring(1, 300)));
    }
  });
  return { headerAnim, onScroll };
}
