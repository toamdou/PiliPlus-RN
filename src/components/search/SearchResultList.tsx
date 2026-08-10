import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text as RNText, View } from 'react-native';
import { Host, ProgressView } from '@expo/ui/swift-ui';
import { FlashList, FlashListRef } from '@shopify/flash-list';
import { Image as ExpoImage } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors } from '@/components/SwiftUIHost';
import { useType } from '@/components/type-scale';
import { Press } from '@/components/motion';
import { RADII, continuous, shadow } from '@/theme/tokens';
import { formatCount } from '@/utils/format';
import { biliCover } from '@/utils/image-url';

export interface SearchResult {
  bvid: string;
  title: string;
  pic: string;
  duration: string;
  author: string;
  play: number;
  danmaku: number;
  pubdate: number;
  avatar?: string;
  fans?: number;
  mid?: number;
  isLive?: boolean;
  roomid?: number;
  isPgc?: boolean;
  seasonId?: number;
  mediaId?: number;
  epId?: number;
  articleId?: number;
  isArticle?: boolean;
  score?: number;
  area?: string;
  year?: string;
}

interface SearchResultListProps {
  results: SearchResult[];
  searching: boolean;
  categoryIdx: number;
  onEndReached: () => void;
  onOpenUser: (item: SearchResult) => void;
  onOpenMedia: (item: SearchResult) => void;
}

const UserResultRow = memo(function UserResultRow({
  item,
  index: _index,
  colors,
  T,
  onPress,
}: {
  item: SearchResult;
  index: number;
  colors: ReturnType<typeof useThemeColors>;
  T: ReturnType<typeof useType>;
  onPress: (item: SearchResult) => void;
}) {
  return (
    <Press
      haptic
      scaleTo={0.98}
      style={[styles.resultCard, { backgroundColor: colors.card }, continuous, shadow('sm', colors.isDark)]}
      onPress={() => onPress(item)}>
      <ExpoImage
        source={{ uri: biliCover(item.avatar || '', 96, 96) }}
        recyclingKey={item.avatar || ''}
        cachePolicy="memory-disk"
        style={[styles.userAvatar, { backgroundColor: colors.fill2 }]}
        contentFit="cover"
      />
      <View style={styles.resultInfo}>
        <RNText style={[T.subhead, { color: colors.text, fontWeight: '600' }]} numberOfLines={1}>
          {item.title || item.author}
        </RNText>
        {item.fans ? (
          <RNText style={[T.caption1, { color: colors.text, marginTop: 3 }]} numberOfLines={1}>
            {formatCount(item.fans)} 粉丝
          </RNText>
        ) : null}
      </View>
    </Press>
  );
});

const MediaResultRow = memo(function MediaResultRow({
  item,
  index: _index,
  colors,
  T,
  onPress,
}: {
  item: SearchResult;
  index: number;
  colors: ReturnType<typeof useThemeColors>;
  T: ReturnType<typeof useType>;
  onPress: (item: SearchResult) => void;
}) {
  return (
    <Press
      haptic
      scaleTo={0.98}
      style={[styles.resultCard, { backgroundColor: colors.card }, continuous, shadow('sm', colors.isDark)]}
      onPress={() => onPress(item)}>
      <View style={styles.thumbWrap}>
        <ExpoImage
          source={{ uri: biliCover(item.pic || '', 320, 200) }}
          recyclingKey={item.pic || ''}
          cachePolicy="memory-disk"
          style={[styles.resultThumb, { backgroundColor: colors.fill2 }]}
          contentFit="cover"
        />
        {item.duration ? (
          <View style={styles.durationBadge}>
            <RNText style={styles.durationText}>{item.duration}</RNText>
          </View>
        ) : null}
        {item.isLive ? (
          <View style={styles.liveBadge}>
            <RNText style={styles.liveBadgeText}>直播</RNText>
          </View>
        ) : null}
        {item.isArticle ? (
          <View style={[styles.liveBadge, { backgroundColor: '#FF9500' }]}>
            <RNText style={styles.liveBadgeText}>专栏</RNText>
          </View>
        ) : null}
      </View>
      <View style={styles.resultInfo}>
        <RNText style={[T.subhead, styles.resultTitle, { color: colors.text }]} numberOfLines={2}>
          {item.title}
        </RNText>
        <RNText style={[T.caption1, styles.resultMeta, { color: colors.text }]} numberOfLines={1}>
          {item.isArticle
            ? item.author
            : item.isPgc
              ? [item.area, item.year, item.author].filter(Boolean).join(' · ')
              : item.author}
        </RNText>
        <View style={styles.resultStatRow}>
          {item.isArticle ? (
            <>
              <Ionicons name="reader-outline" size={12} color={colors.textTertiary} />
              <RNText style={[T.caption2, { color: colors.textTertiary }]}>
                {formatCount(item.play)} 阅读
              </RNText>
            </>
          ) : item.isPgc ? (
            <>
              {item.score ? (
                <>
                  <Ionicons name="star" size={12} color="#FF9500" />
                  <RNText style={[T.caption2, { color: '#FF9500', fontWeight: '600' }]}>
                    {item.score.toFixed(1)}
                  </RNText>
                </>
              ) : null}
              <RNText style={[T.caption2, { color: colors.textTertiary }]}>
                {item.duration || item.author}
              </RNText>
            </>
          ) : item.isLive ? (
            <>
              <Ionicons name="people-outline" size={12} color={colors.textTertiary} />
              <RNText style={[T.caption2, { color: colors.textTertiary }]}>
                {formatCount(item.play)} 人气
              </RNText>
            </>
          ) : (
            <>
              <Ionicons name="play-outline" size={12} color={colors.textTertiary} />
              <RNText style={[T.caption2, { color: colors.textTertiary }]}>
                {formatCount(item.play)}
              </RNText>
              <Ionicons name="chatbubble-outline" size={11} color={colors.textTertiary} style={{ marginLeft: 10 }} />
              <RNText style={[T.caption2, { color: colors.textTertiary }]}>
                {formatCount(item.danmaku)}
              </RNText>
            </>
          )}
        </View>
      </View>
    </Press>
  );
});

export function SearchResultList({
  results,
  searching,
  categoryIdx,
  onEndReached,
  onOpenUser,
  onOpenMedia,
}: SearchResultListProps) {
  const colors = useThemeColors();
  const T = useType();
  const listRef = useRef<FlashListRef<SearchResult>>(null);
  const categoryCacheRef = useRef<Record<number, { results: SearchResult[]; offset: number }>>({});
  const lastCategoryRef = useRef(categoryIdx);
  const scrollOffsetRef = useRef(0);
  const [displayResults, setDisplayResults] = useState<SearchResult[]>(results);

  /* 结果更新时刷新当前分类缓存（搜索中且结果为空时保留旧缓存，避免切换分类白屏） */
  useEffect(() => {
    /* 切换分类后旧 results 可能仍短暂存在；只写入当前分类，避免污染新分类缓存 */
    if (lastCategoryRef.current === categoryIdx && (results.length > 0 || !searching)) {
      categoryCacheRef.current[categoryIdx] = { results, offset: scrollOffsetRef.current };
      setDisplayResults(results);
    }
  }, [results, searching, categoryIdx]);

  /* 切换分类：缓存旧分类，立即恢复新分类数据与滚动位置 */
  useEffect(() => {
    if (lastCategoryRef.current === categoryIdx) return;
    categoryCacheRef.current[lastCategoryRef.current] = {
      results: displayResults,
      offset: scrollOffsetRef.current,
    };
    lastCategoryRef.current = categoryIdx;
    const cached = categoryCacheRef.current[categoryIdx];
    setDisplayResults(cached?.results ?? []);
    const timer = setTimeout(() => {
      listRef.current?.scrollToOffset({ offset: cached?.offset ?? 0, animated: false });
    }, 0);
    return () => clearTimeout(timer);
  }, [categoryIdx, displayResults]);

  const renderItem = useCallback(
    ({ item, index }: { item: SearchResult; index: number }) =>
      categoryIdx === 4 ? (
        <UserResultRow item={item} index={index} colors={colors} T={T} onPress={onOpenUser} />
      ) : (
        <MediaResultRow item={item} index={index} colors={colors} T={T} onPress={onOpenMedia} />
      ),
    [categoryIdx, colors, T, onOpenUser, onOpenMedia],
  );

  const getItemType = useCallback((item: SearchResult) => (categoryIdx === 4 ? 'user' : 'media'), [categoryIdx]);

  return (
    <View style={{ flex: 1 }}>
      <FlashList
        ref={listRef}
        data={displayResults}
        keyExtractor={(item, idx) => (
          item.bvid ||
          (item.seasonId ? `pgc-${item.seasonId}` : '') ||
          (item.mediaId ? `media-${item.mediaId}` : '') ||
          (item.roomid ? `live-${item.roomid}` : '') ||
          `${getItemType(item)}-${idx}`
        )}
        style={styles.resultList}
        contentInsetAdjustmentBehavior="never"
        contentContainerStyle={[styles.resultListContent, { paddingBottom: 100 }]}
        showsVerticalScrollIndicator={false}
        onScroll={(e) => { scrollOffsetRef.current = e.nativeEvent.contentOffset.y; }}
        scrollEventThrottle={16}
        estimatedItemSize={120}
        windowSize={9}
        initialNumToRender={10}
        maxToRenderPerBatch={12}
        drawDistance={250}
        overrideProps={{ initialDrawBatchSize: 10 }}
        getItemType={getItemType}
        onEndReached={onEndReached}
        onEndReachedThreshold={0.4}
        ListEmptyComponent={
          searching && displayResults.length === 0 ? (
            <View style={styles.loadingWrap}>
              <Host matchContents><ProgressView /></Host>
            </View>
          ) : (
            <View style={styles.loadingWrap}>
              <View style={[styles.emptyIconBox, { backgroundColor: colors.fill2 }]}>
                <Ionicons name="search-outline" size={36} color={colors.textTertiary} />
              </View>
              <RNText style={[T.subhead, { color: colors.textSecondary, marginTop: 14, fontWeight: '500' }]}>无搜索结果</RNText>
              <RNText style={[T.footnote, { color: colors.textTertiary, marginTop: 4 }]}>换个关键词试试</RNText>
            </View>
          )
        }
        ListFooterComponent={
          searching && displayResults.length > 0 ? (
            <View style={{ marginVertical: 16, alignItems: 'center' }}>
              <Host matchContents><ProgressView /></Host>
            </View>
          ) : null
        }
        renderItem={renderItem}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  resultList: { flex: 1 },
  resultListContent: { paddingHorizontal: 14, paddingTop: 6, paddingBottom: 40, gap: 16 },
  loadingWrap: { height: 240, justifyContent: 'center', alignItems: 'center' },
  emptyIconBox: { width: 72, height: 72, borderRadius: 36, justifyContent: 'center', alignItems: 'center' },
  resultCard: {
    flexDirection: 'row',
    borderRadius: RADII.md,
    padding: 10,
    gap: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(120,120,128,0.12)',
  },
  thumbWrap: { position: 'relative' },
  resultThumb: { width: 160, height: 100, borderRadius: RADII.sm },
  durationBadge: {
    position: 'absolute',
    bottom: 5,
    right: 5,
    backgroundColor: 'rgba(0,0,0,0.72)',
    borderRadius: 5,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  durationText: { color: '#FFFFFF', fontSize: 10, fontWeight: '500', fontVariant: ['tabular-nums'] },
  resultInfo: { flex: 1, justifyContent: 'space-between', paddingVertical: 1 },
  resultTitle: { fontWeight: '500', lineHeight: 19 },
  resultMeta: { marginTop: 3 },
  resultStatRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4, gap: 4 },
  userAvatar: { width: 48, height: 48, borderRadius: 24 },
  liveBadge: {
    position: 'absolute',
    top: 5,
    left: 5,
    backgroundColor: '#FF3B30',
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  liveBadgeText: { color: '#FFFFFF', fontSize: 10, fontWeight: '600' },
});
