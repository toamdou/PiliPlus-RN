/**
 * semantic-colors —— 应用语义色板（useThemeColors 的唯一来源）。
 *
 * 不改动 `tokens.ts` 的共享令牌；这里只集中维护 SwiftUIHost 当前使用的
 * iOS 语义色值，避免同一套颜色散落在组件里。
 */

export const SEMANTIC_COLORS = {
  systemGroupedBg: { light: '#F2F2F7', dark: '#000000' },
  bg: { light: '#F2F2F7', dark: '#000000' },
  card: { light: '#FFFFFF', dark: '#1C1C1E' },
  elevatedCard: { light: '#FFFFFF', dark: '#2C2C2E' },
  text: { light: '#000000', dark: '#FFFFFF' },
  label: { light: '#000000', dark: '#FFFFFF' },
  textSecondary: { light: '#6C6C70', dark: '#98989D' },
  secondaryLabel: { light: 'rgba(60,60,67,0.6)', dark: 'rgba(235,235,245,0.6)' },
  textTertiary: { light: '#AEAEB2', dark: '#636366' },
  tertiaryLabel: { light: 'rgba(60,60,67,0.3)', dark: 'rgba(235,235,245,0.3)' },
  quaternaryLabel: { light: 'rgba(60,60,67,0.18)', dark: 'rgba(235,235,245,0.18)' },
  border: { light: '#E5E5EA', dark: '#38383A' },
  separator: { light: 'rgba(60,60,67,0.12)', dark: 'rgba(84,84,88,0.65)' },
  fill1: { light: 'rgba(120,120,128,0.20)', dark: 'rgba(120,120,128,0.36)' },
  fill2: { light: 'rgba(120,120,128,0.16)', dark: 'rgba(120,120,128,0.32)' },
  fill3: { light: 'rgba(120,120,128,0.12)', dark: 'rgba(118,118,128,0.24)' },
  searchBg: { light: '#E5E5EA', dark: '#2C2C2E' },
  shadowColor: { light: 'rgba(0,0,0,0.08)', dark: 'rgba(0,0,0,0.8)' },
  cardBorder: { light: 'rgba(0,0,0,0.04)', dark: 'rgba(255,255,255,0.08)' },
  headerBlurBg: { light: 'rgba(242,242,247,0.85)', dark: 'rgba(0,0,0,0.85)' },
} as const;

export type SemanticColorKey = keyof typeof SEMANTIC_COLORS;

export function semanticColor(key: SemanticColorKey, isDark: boolean): string {
  return SEMANTIC_COLORS[key][isDark ? 'dark' : 'light'];
}
