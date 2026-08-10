/**
 * tokens —— 全站视觉令牌（iOS 26 Liquid Glass 设计规范）。
 *
 * 三大目标（对齐 Apple HIG / iOS 26）：
 *  1. 圆角：连续曲率（borderCurve: 'continuous'）——iOS 系统"连续圆角"渲染，
 *     避免普通四段圆弧在玻璃/卡片边缘的廉价感；
 *  2. 阴影：环境光分层（ambient + key 双层阴影语义），深色模式自动降影增边；
 *  3. 玻璃：GlassView 档位/动画/着色的统一调用约定，杜绝各页面手写参数漂移。
 *
 * 用法：
 *   import { RADII, shadow, glassPreset, DYN } from '@/theme/tokens';
 *   style={[{ borderRadius: RADII.card, ...shadow('card', isDark) }]}
 */
import { DynamicColorIOS } from 'react-native';
import type { ViewStyle } from 'react-native';

/* ================= 圆角阶梯（连续曲率） ================= */
export const RADII = {
  /** 小元素：chip / badge / 分段按钮 */
  sm: 10,
  /** 按钮 / 输入框 / pill */
  md: 14,
  /** 卡片（紧凑双列） */
  card: 16,
  /** 大卡片（沉浸单列 / 弹窗） */
  lg: 20,
  /** 底部面板顶部圆角 */
  sheet: 24,
  /** 圆形（头像 / 玻璃圆钮） */
  circle: 999,
} as const;

/** 连续曲率圆角通用样式片段（iOS 13+ 生效，其他平台回退为普通圆角） */
export const continuous = {
  borderCurve: 'continuous',
} as const;

/* ================= 阴影层级 ================= */
export type ShadowLevel = 'sm' | 'md' | 'lg' | 'glass';

/**
 * 环境光阴影：浅色模式双层投影（贴近 iOS 系统卡片），
 * 深色模式投影几乎不可见、改用微亮边框表达层级（iOS 深色规范）。
 */
export function shadow(level: ShadowLevel, isDark: boolean): ViewStyle {
  if (isDark) {
    return {
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.25,
      shadowRadius: 3,
      elevation: 2,
      borderColor: 'rgba(255,255,255,0.08)',
      borderWidth: 0.5,
    };
  }
  switch (level) {
    case 'sm':
      return {
        shadowColor: '#000000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.06,
        shadowRadius: 3,
        elevation: 2,
      };
    case 'md':
      return {
        shadowColor: '#000000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 8,
        elevation: 4,
      };
    case 'lg':
      return {
        shadowColor: '#000000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.16,
        shadowRadius: 20,
        elevation: 8,
      };
    case 'glass':
      /* 玻璃元素的"接触阴影"：短距、低透明度，模拟玻璃贴附表面 */
      return {
        shadowColor: '#000000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.12,
        shadowRadius: 8,
        elevation: 3,
      };
  }
}

/* ================= 动态色（随系统明暗翻转） ================= */
export const DYN = {
  label: DynamicColorIOS({ light: '#000000', dark: '#FFFFFF' }),
  secondaryLabel: DynamicColorIOS({ light: 'rgba(60,60,67,0.6)', dark: 'rgba(235,235,245,0.6)' }),
  tertiaryLabel: DynamicColorIOS({ light: 'rgba(60,60,67,0.3)', dark: 'rgba(235,235,245,0.3)' }),
  separator: DynamicColorIOS({ light: 'rgba(60,60,67,0.12)', dark: 'rgba(84,84,88,0.65)' }),
  fill: DynamicColorIOS({ light: 'rgba(120,120,128,0.2)', dark: 'rgba(120,120,128,0.36)' }),
  cardBg: DynamicColorIOS({ light: '#FFFFFF', dark: '#1C1C1E' }),
  systemBg: DynamicColorIOS({ light: '#F2F2F7', dark: '#000000' }),
  /** 玻璃边缘受光描边 */
  glassEdge: DynamicColorIOS({ light: 'rgba(255,255,255,0.4)', dark: 'rgba(255,255,255,0.14)' }),
} as const;

/* ================= 玻璃预设（GlassView 调用约定） ================= */
import type { GlassVariant } from '@/components/Glass';

export const GLASS = {
  /** 浮动搜索框 / 工具条：标准材质 */
  bar: { variant: 'regular', radius: RADII.circle } as { variant: GlassVariant; radius: number },
  /** 圆形玻璃按钮 */
  circleButton: { variant: 'clear', radius: RADII.circle } as { variant: GlassVariant; radius: number },
  /** 播放器悬浮控件：更实，保证视频上可读 */
  playerControl: { variant: 'prominent', radius: RADII.md } as { variant: GlassVariant; radius: number },
  /** Toast 胶囊 */
  toast: { variant: 'regular', radius: RADII.circle } as { variant: GlassVariant; radius: number },
} as const;

/* ================= 动画时长（与 motion.tsx 弹簧配套） ================= */
export const DURATION = {
  quick: 150,
  normal: 250,
  slow: 350,
  /** 玻璃形态变换（glassEffectStyle.animationDuration，单位秒） */
  glassMorph: 0.35,
} as const;
