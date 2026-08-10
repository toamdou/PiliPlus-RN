import { memo } from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Link } from 'expo-router';
import { Image as ExpoImage } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { type ThemeColors } from '@/components/SwiftUIHost';
import { Press } from '@/components/motion';
import { useType } from '@/components/type-scale';
import { formatCount } from '@/utils/format';
import { biliCover } from '@/utils/image-url';
import { isDefaultFav } from '@/utils/fav-utils';
import { RADII, continuous } from '@/theme/tokens';

export const CARD_GAP = 12;
export const CARD_W = 176;
export const COVER_H = CARD_W * 0.72;

export interface FavEntry {
  id: string;
  title: string;
  cover: string;
  subtitle: string;
  href: string;
  hrefType?: 'web' | 'route';
  webUrl?: string;
  attr?: number;
  mediaCount?: number;
}

export const FolderCard = memo(function FolderCard({
  item,
  index,
  colors,
  onManage,
}: {
  item: FavEntry;
  index: number;
  colors: ThemeColors;
  onManage?: (item: FavEntry) => void;
}) {
  const T = useType();
  const { width: windowWidth } = useWindowDimensions();
  const cardW = (windowWidth - 14 * 2 - CARD_GAP) / 2;
  const coverH = cardW * 0.72;
  return (
    <View style={{ width: cardW }}>
      <Link href={item.href as any} asChild>
        <Press haptic scaleTo={0.97} onLongPress={onManage ? () => onManage(item) : undefined} pressDelay={120}>
          <View style={styles.coverWrap}>
            {item.cover ? (
              <ExpoImage source={{ uri: biliCover(item.cover, 320, 200) }} recyclingKey={item.cover} cachePolicy="memory-disk" style={[styles.cover, { width: cardW, height: coverH, backgroundColor: colors.fill2 }]} contentFit="cover" />
            ) : (
              <View style={[styles.cover, styles.coverEmpty, { width: cardW, height: coverH, backgroundColor: colors.fill2 }]}>
                <Ionicons name="folder-outline" size={30} color={colors.textTertiary} />
              </View>
            )}
            <View style={styles.countBadge}>
              <Ionicons name="play" size={10} color="#FFFFFF" />
              <Text style={styles.countText}>{formatCount(item.mediaCount || 0)}</Text>
            </View>
            {isDefaultFav(item.attr) && (
              <View style={styles.defaultBadge}>
                <Text style={styles.defaultBadgeText}>默认</Text>
              </View>
            )}
          </View>
          <Text style={[T.subhead, styles.title, { color: colors.text }]} numberOfLines={1}>{item.title}</Text>
          <Text style={[T.caption1, styles.count, { color: colors.textSecondary }]}>{item.subtitle}</Text>
        </Press>
      </Link>
    </View>
  );
});

const styles = StyleSheet.create({
  coverWrap: { position: 'relative' },
  cover: { width: CARD_W, height: COVER_H, borderRadius: RADII.md, ...continuous },
  coverEmpty: { justifyContent: 'center', alignItems: 'center' },
  countBadge: {
    position: 'absolute', bottom: 8, right: 8, flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 8, paddingHorizontal: 7, paddingVertical: 3,
  },
  countText: { color: '#FFFFFF', fontSize: 11, fontWeight: '600' },
  defaultBadge: {
    position: 'absolute', top: 8, left: 8,
    backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 7, paddingHorizontal: 6, paddingVertical: 2,
  },
  defaultBadgeText: { color: '#FFFFFF', fontSize: 10, fontWeight: '700' },
  title: { fontWeight: '600', marginTop: 9 },
  count: { marginTop: 3 },
});
