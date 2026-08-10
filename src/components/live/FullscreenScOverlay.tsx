/**
 * FullscreenScOverlay —— 直播播放器上的全屏 SuperChat 浮层。
 *
 * 对齐 Flutter live_room 的 fsSC 展示：最新一条 SC 浮在播放器左下角，
 * fullScreenScScale（50-200%）同时缩放卡片宽度与字号，10 秒后自动收起，
 * 新 SC 到达或手动关闭后按 id 重新判断。
 */
import { memo, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, useWindowDimensions } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors } from '@/components/SwiftUIHost';
import { Press } from '@/components/motion';
import { useType } from '@/components/type-scale';
import { biliCover } from '@/utils/image-url';
import { RADII, continuous, shadow } from '@/theme/tokens';

const AUTO_HIDE_MS = 10_000;

function clampRatio(scale: number): number {
  const ratio = (Number.isFinite(scale) ? scale : 100) / 100;
  return Math.min(Math.max(ratio, 0.5), 2);
}

export const FullscreenScOverlay = memo(function FullscreenScOverlay({
  superChats,
  scale,
}: {
  superChats: any[];
  scale: number;
}) {
  const colors = useThemeColors();
  const T = useType();
  const { width: windowWidth } = useWindowDimensions();
  const [dismissedId, setDismissedId] = useState<number | null>(null);
  const firstIdRef = useRef<number | null>(null);
  const latest = superChats[0];
  const latestId = latest?.id ?? null;
  if (firstIdRef.current === null && latestId != null) {
    firstIdRef.current = latestId;
  }
  const active =
    latest && latestId != null && latestId !== firstIdRef.current && latestId !== dismissedId
      ? latest
      : null;
  const activeId = active?.id ?? null;

  useEffect(() => {
    if (activeId == null) return;
    const timer = setTimeout(() => setDismissedId(activeId), AUTO_HIDE_MS);
    return () => clearTimeout(timer);
  }, [activeId]);

  if (!active) return null;

  const ratio = clampRatio(scale);
  const width = Math.min(Math.max(windowWidth * 0.55, 240), 320) * ratio;
  const name = active.user_info?.uname || 'SuperChat';
  const face = active.user_info?.face || '';

  return (
    <View style={[styles.overlay, { width }]} pointerEvents="box-none">
      <Press
        haptic
        scaleTo={0.86}
        onPress={() => setDismissedId(active.id)}
        accessibilityRole="button"
        accessibilityLabel="关闭 SuperChat"
        style={[styles.closeBtn, { backgroundColor: colors.card }]}>
        <Ionicons name="close" size={14} color={colors.text} />
      </Press>
      <View
        style={[
          styles.card,
          { backgroundColor: active.background_color || 'rgba(255,182,0,0.18)' },
          continuous,
          shadow('md', true),
        ]}>
        <View style={styles.header}>
          <ExpoImage
            source={face ? { uri: biliCover(face, 64, 64) } : undefined}
            recyclingKey={face}
            style={[styles.avatar, { backgroundColor: 'rgba(255,255,255,0.25)' }]}
            contentFit="cover"
          />
          <View style={styles.headerInfo}>
            <Text style={[T.subhead, styles.name, { fontSize: 13 * ratio, color: '#FFFFFF' }]} numberOfLines={1}>
              {name}
            </Text>
            <Text style={[styles.price, { fontSize: 12 * ratio }]}>¥{active.price}</Text>
          </View>
        </View>
        {active.message ? (
          <Text style={[styles.message, { fontSize: 14 * ratio }]} numberOfLines={6}>
            {active.message}
          </Text>
        ) : null}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    left: 16,
    bottom: 16,
    zIndex: 5,
  },
  card: {
    borderRadius: RADII.md,
    padding: 12,
    paddingTop: 20,
  },
  closeBtn: {
    position: 'absolute',
    top: -8,
    right: -8,
    zIndex: 6,
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
  },
  headerInfo: {
    flex: 1,
    gap: 2,
  },
  name: {
    fontWeight: '600',
  },
  price: {
    color: '#FFD60A',
    fontWeight: '700',
  },
  message: {
    color: '#FFFFFF',
    marginTop: 8,
    lineHeight: 20,
  },
});
