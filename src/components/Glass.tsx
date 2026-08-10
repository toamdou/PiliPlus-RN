/**
 * Glass —— iOS 26+ Liquid Glass（液态玻璃）统一封装。
 *
 * 策略：
 *  - 使用 expo-glass-effect 的原生 GlassView（真正的液态玻璃，带系统级折射、
 *    边缘高光、自适应着色）。纯 iOS 项目不保留 BlurView / 实心降级路径。
 *
 * 主题联动（对齐 GlassEffect.md colorScheme）：
 *  - 默认读取 useSettingsStore.theme 解析为 'auto'|'light'|'dark' 透传 GlassView，
 *    应用内手动切换主题时玻璃着色同步翻转；
 *  - 播放器等恒定深色场景可传 schemeOverride='dark' 强制深色玻璃，避免误判。
 *
 * 形态动画（对齐 GlassEffect.md glassEffectStyle 对象配置）：
 *  - animated 为 true 时以 { style, animate: true, animationDuration } 下发，
 *    档位切换（如 prominent↔clear）走系统级补间，时长取 DURATION.glassMorph。
 *
 * 用法：<Glass variant="regular" style={{ borderRadius: 22 }}>...</Glass>
 */
import type { ComponentProps } from 'react';
import type { ViewProps } from 'react-native';
import { GlassView, isGlassEffectAPIAvailable } from 'expo-glass-effect';
import { useSettingsStore } from '@/stores/settings';
import { DURATION } from '@/theme/tokens';

export type GlassVariant = 'clear' | 'regular' | 'prominent';

/** 玻璃配色方案（GlassEffect.md GlassColorScheme） */
export type GlassColorScheme = 'auto' | 'light' | 'dark';

/** GlassView glassEffectStyle 的联合类型（字符串档位 | 动画配置对象） */
type GlassEffectStyleProp = ComponentProps<typeof GlassView>['glassEffectStyle'];

interface GlassProps extends ViewProps {
  /** 玻璃材质档位：clear 最透、regular 标准、prominent 更实 */
  variant?: GlassVariant;
  /** 叠加的品牌着色（可选，传 ACCENT 可得到粉色玻璃） */
  tint?: string;
  /** 是否参与交互（Liquid Glass 会给出按压高光反馈） */
  isInteractive?: boolean;
  /**
   * 配色方案覆盖（可选）：默认 'auto' 表示跟随应用主题
   * （useSettingsStore.theme：dark→'dark'、light→'light'、system→'auto'）；
   * 播放器 / 图片查看器等深色场景可强制 'dark'。
   */
  schemeOverride?: GlassColorScheme;
  /**
   * 形态动画开关（可选）：true 时 glassEffectStyle 以对象形式下发
   * { style, animate: true, animationDuration: DURATION.glassMorph }，
   * variant 切换时由系统补间（GlassEffect.md Animated glass effect style）。
   */
  animated?: boolean;
}

let cachedApi: boolean | null = null;
/** 安全探测 Liquid Glass 原生 API */
export function canUseLiquidGlass(): boolean {
  if (cachedApi === null) {
    try {
      cachedApi = isGlassEffectAPIAvailable();
    } catch {
      cachedApi = false;
    }
  }
  return cachedApi;
}

export function Glass({
  variant = 'regular',
  tint,
  isInteractive = false,
  schemeOverride = 'auto',
  animated = false,
  style,
  children,
  ...rest
}: GlassProps) {
  // 应用主题 → GlassView colorScheme：手动切主题时玻璃着色同步翻转；
  // schemeOverride 优先（播放器等深色场景强制 dark）
  const appTheme = useSettingsStore((s) => s.theme);
  const colorScheme: GlassColorScheme =
    schemeOverride !== 'auto'
      ? schemeOverride
      : appTheme === 'dark'
        ? 'dark'
        : appTheme === 'light'
          ? 'light'
          : 'auto';

  /* GlassView 原生档位只有 'clear'|'regular'|'none'，
     prominent 语义（更实）仍映射到 'regular'，但补默认高 tint 提升实体感。 */
  const mapped = variant === 'prominent' ? 'regular' : variant;
  const glassTint =
    variant === 'prominent'
      ? tint ??
        (colorScheme === 'dark' ? 'rgba(255,255,255,0.16)' : 'rgba(255,255,255,0.28)')
      : tint;
  /* animated=true：对象形式下发，档位切换走系统级补间（单位：秒） */
  const glassEffectStyle: GlassEffectStyleProp = animated
    ? { style: mapped, animate: true, animationDuration: DURATION.glassMorph }
    : mapped;

  return (
    <GlassView
      glassEffectStyle={glassEffectStyle}
      colorScheme={colorScheme}
      tintColor={glassTint}
      isInteractive={isInteractive}
      style={style}
      {...rest}>
      {children}
    </GlassView>
  );
}
