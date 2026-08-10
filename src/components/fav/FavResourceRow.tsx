import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Link } from 'expo-router';
import { Image as ExpoImage } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { ACCENT, type ThemeColors } from '@/components/SwiftUIHost';
import { Press } from '@/components/motion';
import { useType, type TypeScale } from '@/components/type-scale';
import { formatCount, formatDuration } from '@/utils/format';
import { biliCover } from '@/utils/image-url';
import { RADII, continuous } from '@/theme/tokens';
import type { FavEntry } from './FolderCard';

export interface FavResource {
  id: number;
  title: string;
  cover: string;
  duration: number;
  upper: { name: string; mid: number };
  cnt_info: { play: number; collect: number; danmaku: number };
  bvid: string;
  type: number;
}

export const FavEntryRow = memo(function FavEntryRow({
  item,
  index: _index,
  colors,
  onOpenWeb,
}: {
  item: FavEntry;
  index: number;
  colors: ThemeColors;
  onOpenWeb: (url: string) => void;
}) {
  const T = useType();
  const isWeb = item.hrefType === 'web';
  const webUrl = item.webUrl || item.href;
  const row = (
    <Press
      haptic
      scaleTo={0.98}
      onPress={isWeb ? () => onOpenWeb(webUrl) : undefined}
      style={styles.entryRow}>
      <View style={styles.entryCoverWrap}>
        {item.cover ? (
          <ExpoImage
            source={{ uri: biliCover(item.cover, 160, 100) }}
            recyclingKey={item.cover}
            cachePolicy="memory-disk"
            style={[styles.entryCover, { backgroundColor: colors.fill2 }]}
            contentFit="cover"
          />
        ) : (
          <View style={[styles.entryCover, styles.coverEmpty, { backgroundColor: colors.fill2 }]}>
            <Ionicons name="bookmark-outline" size={22} color={colors.textTertiary} />
          </View>
        )}
      </View>
      <View style={styles.entryInfo}>
        <Text style={[T.subhead, styles.entryTitle, { color: colors.text }]} numberOfLines={2}>{item.title}</Text>
        <Text style={[T.caption1, { color: colors.textSecondary }]} numberOfLines={1}>{item.subtitle}</Text>
      </View>
      <Ionicons name="chevron-forward" size={16} color={colors.quaternaryLabel} />
    </Press>
  );
  return (
    <>
      {isWeb ? row : <Link href={item.href as any} asChild>{row}</Link>}
    </>
  );
});

export const FavResourceRow = memo(function FavResourceRow({
  item,
  index: _index,
  colors,
  T,
  selectMode,
  selected,
  onToggle,
  onLongPress,
}: {
  item: FavResource;
  index: number;
  colors: ThemeColors;
  T: TypeScale;
  selectMode: boolean;
  selected: Set<number>;
  onToggle: (id: number) => void;
  onLongPress: (item: FavResource) => void;
}) {
  const row = (
    <Press
      haptic
      scaleTo={0.98}
      onPress={selectMode ? () => onToggle(item.id) : undefined}
      onLongPress={selectMode ? undefined : () => onLongPress(item)}
      style={styles.row}>
      {selectMode && (
        <Ionicons
          name={selected.has(item.id) ? 'checkbox' : 'square-outline'}
          size={20}
          color={selected.has(item.id) ? ACCENT : colors.textTertiary}
        />
      )}
      <View style={styles.coverWrap}>
        <ExpoImage
          source={{ uri: biliCover(item.cover, 320, 200) }}
          recyclingKey={item.cover}
          cachePolicy="memory-disk"
          style={[styles.cover, { backgroundColor: colors.fill2 }]}
          contentFit="cover"
        />
        {item.duration > 0 ? (
          <View style={styles.durationBadge}>
            <Text style={styles.durationText}>{formatDuration(item.duration)}</Text>
          </View>
        ) : null}
      </View>
      <View style={styles.info}>
        <Text style={[T.subhead, styles.title, { color: colors.text }]} numberOfLines={2}>{item.title}</Text>
        <Text style={[T.footnote, { color: colors.textSecondary }]} numberOfLines={1}>{item.upper.name}</Text>
        <View style={styles.statRow}>
          <Ionicons name="play-outline" size={12} color={colors.textTertiary} />
          <Text style={[T.caption1, styles.stat, { color: colors.textTertiary }]}>{formatCount(item.cnt_info.play)}</Text>
          <Ionicons name="chatbubble-outline" size={11} color={colors.textTertiary} />
          <Text style={[T.caption1, styles.stat, { color: colors.textTertiary }]}>{formatCount(item.cnt_info.danmaku)}</Text>
        </View>
      </View>
    </Press>
  );
  return (
    <>
      {selectMode || !item.bvid ? row : <Link href={`/video/${item.bvid}` as any} asChild>{row}</Link>}
    </>
  );
});

const styles = StyleSheet.create({
  entryRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11 },
  entryCoverWrap: { position: 'relative' },
  entryCover: { width: 96, height: 60, borderRadius: RADII.sm, ...continuous },
  coverEmpty: { justifyContent: 'center', alignItems: 'center' },
  entryInfo: { flex: 1, gap: 4 },
  entryTitle: { fontWeight: '600' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  coverWrap: { position: 'relative' },
  cover: { width: 140, height: 88, borderRadius: RADII.sm, ...continuous },
  durationBadge: { position: 'absolute', bottom: 5, right: 5, backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 5, paddingHorizontal: 5, paddingVertical: 1.5 },
  durationText: { color: '#FFFFFF', fontSize: 10.5, fontWeight: '600' },
  info: { flex: 1, gap: 5, justifyContent: 'center' },
  title: { fontWeight: '600' },
  statRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  stat: { marginRight: 8 },
});
