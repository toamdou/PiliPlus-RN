/**
 * SuperChatCard —— 直播间醒目留言（SuperChat）卡片。
 *
 * 背景：05-B12 审计指出 SuperChat 区是重灾区——整段 inline style
 * （fontSize 12/13、borderRadius 8、写死黄底 rgba(255,182,0,0.15)、头像 24px）
 * 与周围卡片体系完全脱节，是"直接插进来的组件"的实例。
 * 这里抽为独立组件：圆角走 RADII、字号走 useType（响应动态字型缩放）、
 * 间距走 SPACE，深色模式对服务端下发的 background_color 做亮度校验。
 *
 * 深色模式亮度校验：服务端 background_color 在深色下过亮时白字不可读，
 * 按 WCAG 相对亮度阈值降级为 SC 品牌黄 dim token 色（明暗双套）；
 * 文字颜色随"有效背景"亮度自适应（深底白字、浅底语义色）。
 */
import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { useThemeColors } from '@/components/SwiftUIHost';
import { useType } from '@/components/type-scale';
import { biliCover } from '@/utils/image-url';
import { RADII, continuous } from '@/theme/tokens';
import { SPACE } from '@/theme/spacing';

/** 深色模式"过亮"判定阈值（WCAG 相对亮度，超过则白字不可读） */
const BRIGHT_THRESHOLD = 0.5;
/** 深色底（白字/亮黄价格）判定阈值 */
const DARK_BG_THRESHOLD = 0.45;
/** SC 品牌黄 dim 底色：服务端未下发背景色 / 深色下过亮时的降级（dark 略强保证深色可读） */
const SC_YELLOW_DIM = { light: 'rgba(255,204,0,0.15)', dark: 'rgba(255,204,0,0.20)' } as const;
/** 深色卡片上的价格亮黄（与全屏 SC 浮层 FullscreenScOverlay 一致） */
const PRICE_YELLOW = '#FFD60A';

/** 解析 hex(#RGB/#RRGGBB) / rgb() / rgba() → [r,g,b]；失败返回 null（rgba 仅取 RGB，透明度保持原样） */
function parseRgb(color: string): [number, number, number] | null {
  const s = color.trim();
  let m = /^#([0-9a-f]{6})$/i.exec(s);
  if (m) {
    const v = parseInt(m[1], 16);
    return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
  }
  m = /^#([0-9a-f]{3})$/i.exec(s);
  if (m) {
    const c = m[1];
    return [parseInt(c[0] + c[0], 16), parseInt(c[1] + c[1], 16), parseInt(c[2] + c[2], 16)];
  }
  m = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i.exec(s);
  if (m) return [Number(m[1]), Number(m[2]), Number(m[3])];
  return null;
}

/** WCAG 相对亮度（sRGB 线性化） */
function luminance(rgb: [number, number, number]): number {
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * lin(rgb[0]) + 0.7152 * lin(rgb[1]) + 0.0722 * lin(rgb[2]);
}

/** 解析有效背景色：深色模式下服务端下发色过亮 → 换 SC 品牌黄 dim token 色 */
function resolveBackground(serverColor: string | undefined, isDark: boolean): string {
  if (!serverColor) return isDark ? SC_YELLOW_DIM.dark : SC_YELLOW_DIM.light;
  if (!isDark) return serverColor;
  const rgb = parseRgb(serverColor);
  if (rgb && luminance(rgb) > BRIGHT_THRESHOLD) return SC_YELLOW_DIM.dark;
  return serverColor;
}

export const SuperChatCard = memo(function SuperChatCard({
  sc,
  compact = false,
}: {
  sc: any;
  /** 紧凑形态：superChatType === 1 时列表只展示 2 条，收紧内边距/间距 */
  compact?: boolean;
}) {
  const colors = useThemeColors();
  const T = useType();
  // 有效背景（含深色亮度校验降级后的结果）→ 据此推导文字/价格颜色
  const bg = resolveBackground(sc?.background_color, colors.isDark);
  const rgb = parseRgb(bg);
  const isDarkBg = rgb ? luminance(rgb) < DARK_BG_THRESHOLD : false;
  const contentColor = isDarkBg ? '#FFFFFF' : colors.text;
  const priceColor = isDarkBg ? PRICE_YELLOW : colors.accent;
  const face = sc?.user_info?.face || '';
  const uname = sc?.user_info?.uname || '';

  return (
    <View style={[styles.card, compact ? styles.compact : styles.regular, { backgroundColor: bg }]}>
      <View style={[styles.header, compact && styles.headerCompact]}>
        {/* 行内小头像：24pt（消息行级），圆角走 RADII.circle */}
        <ExpoImage
          source={face ? { uri: biliCover(face, 48, 48) } : undefined}
          recyclingKey={face}
          style={[styles.avatar, { backgroundColor: 'rgba(255,255,255,0.25)' }]}
          contentFit="cover"
        />
        <Text style={[T.caption1, styles.name, { color: contentColor }]} numberOfLines={1}>{uname}</Text>
        <Text style={[T.caption1, styles.price, { color: priceColor }]} numberOfLines={1}>¥{sc?.price ?? 0}</Text>
      </View>
      {sc?.message ? (
        <Text style={[T.footnote, styles.message, { color: contentColor }]}>{sc.message}</Text>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  card: {
    borderRadius: RADII.md,
    ...continuous,
  },
  regular: { padding: SPACE.sm, marginBottom: SPACE.sm },
  compact: { padding: SPACE.xs, marginBottom: SPACE.xs },
  header: { flexDirection: 'row', alignItems: 'center', gap: SPACE.xs },
  headerCompact: { gap: SPACE.xxs },
  avatar: { width: 24, height: 24, borderRadius: RADII.circle },
  name: { fontWeight: '600', flexShrink: 1 },
  price: { fontWeight: '700', marginLeft: 'auto' },
  message: { marginTop: SPACE.xs },
});
