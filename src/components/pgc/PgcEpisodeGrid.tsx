import { memo } from 'react';
import type { ReactNode, RefObject } from 'react';
import { View, Text, StyleSheet, useWindowDimensions } from 'react-native';
import { FlashList, FlashListRef } from '@shopify/flash-list';
import { Image as ExpoImage } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors } from '@/components/SwiftUIHost';
import { Press } from '@/components/motion';
import { useType } from '@/components/type-scale';
import { RADII, continuous } from '@/theme/tokens';
import type { Episode, SeasonDetail } from './pgc-types';
import { PgcTimelineStrip } from './PgcTimelineStrip';
import { biliCover } from '@/utils/image-url';

const SIDE = 14;
const GAP = 10;

const EpisodeCell = memo(function EpisodeCell({
  item,
  index,
  active,
  colors,
  T,
  onSelect,
}: {
  item: Episode;
  index: number;
  active: boolean;
  colors: ReturnType<typeof useThemeColors>;
  T: ReturnType<typeof useType>;
  onSelect: (index: number) => void;
}) {
  const { width: windowWidth } = useWindowDimensions();
  const cardW = (windowWidth - SIDE * 2 - GAP * 2) / 3;
  const coverH = cardW * 0.62;
  return (
    <View style={[styles.epCell, { width: cardW }, (index + 1) % 3 !== 0 && { marginRight: GAP }]}>
      <Press haptic scaleTo={0.96} onPress={() => onSelect(index)}>
        <View style={styles.epCoverWrap}>
          <ExpoImage
            source={{ uri: biliCover(item.cover, 320, 200) }}
            recyclingKey={item.cover}
            cachePolicy="memory-disk"
            style={[styles.epCover, { width: cardW, height: coverH, backgroundColor: colors.fill2 }]}
            contentFit="cover"
          />
          <View style={[styles.epBadge, { maxWidth: cardW - 8 }]}>
            <Text style={styles.epBadgeText}>{item.title}</Text>
          </View>
          {item.badge ? (
            <View
              style={[
                styles.epPremiumBadge,
                { backgroundColor: item.badge === '会员' ? '#FB7299' : item.badge === '限免' ? '#34C759' : 'rgba(80,80,84,0.88)', maxWidth: cardW - 8 },
              ]}>
              <Text style={styles.epPremiumText}>{item.badge}</Text>
            </View>
          ) : null}
          {active ? (
            <View style={styles.playingBadge}>
              <Ionicons name="play" size={10} color="#FFFFFF" />
              <Text style={styles.playingBadgeText}>正在播放</Text>
            </View>
          ) : null}
        </View>
        {item.long_title ? (
          <Text style={[T.caption2, styles.epTitle, { color: colors.textSecondary }]} numberOfLines={1}>{item.long_title}</Text>
        ) : null}
      </Press>
    </View>
  );
});

export function PgcEpisodeGrid({
  episodes,
  activeIndex,
  onSelect,
  listRef,
  header,
  showTimeline,
  isFinish,
  newEp,
  seasonId,
  seasonType,
  onSelectEpId,
}: {
  episodes: Episode[];
  activeIndex: number;
  onSelect: (index: number) => void;
  listRef: RefObject<FlashListRef<Episode> | null>;
  header?: ReactNode;
  showTimeline: boolean;
  isFinish: number | undefined;
  newEp: SeasonDetail['new_ep'];
  seasonId?: number;
  seasonType?: number;
  onSelectEpId?: (epId: number) => void;
}) {
  const colors = useThemeColors();
  const T = useType();

  const renderEpisode = ({ item, index }: { item: Episode; index: number }) => (
    <EpisodeCell item={item} index={index} active={index === activeIndex} colors={colors} T={T} onSelect={onSelect} />
  );

  return (
    <FlashList
      ref={listRef}
      data={episodes}
      numColumns={3}
      keyExtractor={(it) => String(it.id)}
      contentContainerStyle={styles.listContent}
      showsVerticalScrollIndicator={false}
      estimatedItemSize={140}
      windowSize={9}
      initialNumToRender={10}
      maxToRenderPerBatch={12}
      drawDistance={250}
      overrideProps={{ initialDrawBatchSize: 10 }}
      ListHeaderComponent={
        <View>
          {header}
          <View style={styles.epHeader}>
            <Text style={[T.subhead, styles.sectionTitle, { color: colors.text }]}>{`选集 (${episodes.length})`}</Text>
            {showTimeline && episodes.length > 0 ? (
              <Text style={[T.caption1, styles.timeline]}>
                {isFinish === 1
                  ? `共${episodes.length}话 · 已完结`
                  : newEp?.index_show
                    ? `更新至 ${newEp.index_show}`
                    : `共${episodes.length}话 · 连载中`}
              </Text>
            ) : null}
          </View>
          {showTimeline && isFinish !== 1 && seasonId ? (
            <PgcTimelineStrip
              seasonId={seasonId}
              seasonType={seasonType}
              onSelectEpId={onSelectEpId}
            />
          ) : null}
        </View>
      }
      ListEmptyComponent={
        <Text style={[T.footnote, styles.emptyEp, { color: colors.textTertiary }]}>暂无选集</Text>
      }
      renderItem={renderEpisode}
    />
  );
}

const styles = StyleSheet.create({
  listContent: { paddingHorizontal: SIDE, paddingBottom: 40 },
  /* 选集 */
  epHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 20, marginBottom: 12 },
  sectionTitle: { fontWeight: '700' },
  timeline: { color: '#FF9500', fontWeight: '600' },
  epCell: { marginBottom: 14 },
  epCoverWrap: { position: 'relative' },
  epCover: { borderRadius: RADII.sm, ...continuous },
  epBadge: { position: 'absolute', bottom: 4, left: 4, backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 5, paddingHorizontal: 5, paddingVertical: 1.5 },
  epBadgeText: { color: '#FFFFFF', fontSize: 10.5, fontWeight: '600' },
  playingBadge: {
    position: 'absolute', top: 4, right: 4,
    flexDirection: 'row', alignItems: 'center', gap: 2,
    backgroundColor: 'rgba(0,0,0,0.62)', borderRadius: 5,
    paddingHorizontal: 5, paddingVertical: 2,
  },
  playingBadgeText: { color: '#FFFFFF', fontSize: 9, fontWeight: '700' },
  epPremiumBadge: {
    position: 'absolute',
    top: 4,
    left: 4,
    borderRadius: 5,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  epPremiumText: { color: '#FFFFFF', fontSize: 9.5, fontWeight: '700' },
  epTitle: { marginTop: 5 },
  emptyEp: { textAlign: 'center', marginTop: 30 },
});
