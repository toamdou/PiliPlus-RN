/**
 * 包装 @expo/ui/swift-ui 的 Host 组件，
 * 自动注入 seedColor 以避免蓝色字体，并按当前应用主题同步 colorScheme，
 * 让 SwiftUI 原生控件与 RN 页面使用同一明暗来源。
 * 同时提供 useThemeColors() hook 供纯 RN 页面使用。
 */
import { Host as OriginalHost } from '@expo/ui/swift-ui';
import { PlatformColor, useColorScheme } from 'react-native';
import { useMemo } from 'react';
import { useSettingsStore } from '@/stores/settings';
import { semanticColor } from '@/theme/semantic-colors';

export function Host(props: React.ComponentProps<typeof OriginalHost>) {
  const scheme = useColorScheme();
  const accent = useAccent();
  return (
    <OriginalHost
      seedColor={accent}
      colorScheme={scheme === 'dark' ? 'dark' : 'light'}
      {...props}
    />
  );
}

/**
 * B站品牌粉（仅用于激活态/品牌标识）；默认值来自设置主题色，不再在组件内写死。
 * 注意：这是模块加载时求值一次的**快照**，仅供模块级默认值兜底使用。
 * 需要跟随主题色实时变化的组件请改用 useAccent() hook（#38），
 * 否则在设置页切换主题色后不会跟随（旧 ACCENT 断裂问题）。
 */
export const ACCENT = useSettingsStore.getState().accentColor;

/**
 * 动态主题色 hook（#38）——替代模块级 ACCENT 快照。
 *
 * 订阅 useSettingsStore 的 accentColor / enableDynamicColor：
 * - enableDynamicColor 开启（动态取色）→ 返回系统动态强调色（ACCENT 快照）；
 * - 否则返回用户自选的 accentColor（缺省回退 ACCENT）。
 *
 * 任何消费主题色的组件都应使用本 hook，保证设置页换色后即时重渲染。
 * 已有组件迁移方式：`import { ACCENT } from '@/components/SwiftUIHost'`
 * 改为 `import { useAccent } from '@/components/SwiftUIHost'`，在组件内
 * `const accent = useAccent();`，再把 ACCENT 引用替换为 accent。
 */
export function useAccent(): string {
  const enableDynamicColor = useSettingsStore((s) => s.enableDynamicColor);
  const accentColor = useSettingsStore((s) => s.accentColor);
  return enableDynamicColor ? ACCENT : (accentColor || ACCENT);
}

/** iOS 系统精确色板 - 匹配 Apple HIG 语义色彩
 *  forceDark: 强制深色（如 darkVideoPage 设置下视频页强制深色），不传则跟随应用主题；
 *  纯黑主题（isPureBlackTheme）下深色模式的卡片层级也用纯黑。 */
export function useThemeColors(forceDark?: boolean) {
  const scheme = useColorScheme();
  const isPureBlack = useSettingsStore((s) => s.isPureBlackTheme);
  const isDark = forceDark ?? scheme === 'dark';
  const accent = useAccent();
  const pureBlack = semanticColor('bg', true);
  const card = isDark && isPureBlack ? pureBlack : semanticColor('card', isDark);
  const elevatedCard = isDark && isPureBlack ? pureBlack : semanticColor('elevatedCard', isDark);
  return useMemo(() => ({
    isDark,
    bg: semanticColor('bg', isDark),
    systemGroupedBg: semanticColor('systemGroupedBg', isDark),
    card,
    elevatedCard,
    text: semanticColor('text', isDark),
    label: semanticColor('label', isDark),
    textSecondary: semanticColor('textSecondary', isDark),
    secondaryLabel: semanticColor('secondaryLabel', isDark),
    textTertiary: semanticColor('textTertiary', isDark),
    tertiaryLabel: semanticColor('tertiaryLabel', isDark),
    quaternaryLabel: semanticColor('quaternaryLabel', isDark),
    border: semanticColor('border', isDark),
    separator: semanticColor('separator', isDark),
    fill1: semanticColor('fill1', isDark),
    fill2: semanticColor('fill2', isDark),
    fill3: semanticColor('fill3', isDark),
    searchBg: semanticColor('searchBg', isDark),
    accent,
    badge: PlatformColor('systemRed'),
    success: PlatformColor('systemGreen'),
    warning: PlatformColor('systemOrange'),
    shadowColor: semanticColor('shadowColor', isDark),
    cardBorder: semanticColor('cardBorder', isDark),
    headerBlurBg: semanticColor('headerBlurBg', isDark),
  }), [isDark, accent, card, elevatedCard]);
}

/** 类型导出 */
export type ThemeColors = ReturnType<typeof useThemeColors>;
