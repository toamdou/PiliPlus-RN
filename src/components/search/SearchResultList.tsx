import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import EmptyState from '@/components/EmptyState';

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
        keyExtractor={(item) => (
          item.bvid ||
          (item.seasonId ? `pgc-${item.seasonId}` : '') ||
          (item.mediaId ? `media-${item.mediaId}` : '') ||
          (item.roomid ? `live-${item.roomid}` : '') ||
          (item.mid ? `user-${item.mid}` : '') ||
          `${getItemType(item)}`
        )}
        style={styles.resultList}
        contentInsetAdjustmentBehavior="never"
        contentContainerStyle={[styles.resultListContent, { paddingBottom: 100 }]}
        showsVerticalScrollIndicator={false}
        onScroll={(e) => { scrollOffsetRef.current = e.nativeEvent.contentOffset.y; }}
        scrollEventThrottle={16}
        estimatedItemSize={120}
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
            <EmptyState
              icon="search-outline"
              title="无搜索结果"
              subtitle="换个关键词试试"
              style={styles.loadingWrap}
            />
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
  /* ===== 综合 Tab（SearchAllResultList） ===== */
  allListContent: { paddingHorizontal: 14, paddingTop: 6, paddingBottom: 100 },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 6,
    marginBottom: 10,
  },
  sectionTitle: { fontWeight: '700', letterSpacing: -0.2 },
  sectionCount: { borderRadius: RADII.xs, paddingHorizontal: 6, paddingVertical: 2, overflow: 'hidden' },
  sectionCountText: { fontSize: 11, fontWeight: '600' },
  sectionMore: { marginLeft: 'auto', flexDirection: 'row', alignItems: 'center', gap: 2 },
  allVideoCard: { marginBottom: 12 },
  allRowCard: { marginBottom: 10 },
  allEnd: { alignItems: 'center', paddingVertical: 16 },
});

/* ================= 综合搜索（混合结果分组列表，批次5 搜索综合 Tab） ================= */

/** 综合搜索各分组解析结果（SearchResult 复用现有统一卡字段）。 */
export interface MixedSearchData {
  video: SearchResult[];
  user: SearchResult[];
  /** 番剧（media_bangumi）+ 影视（media_ft）合并分组 */
  pgc: SearchResult[];
  live: SearchResult[];
  article: SearchResult[];
  numResults?: number;
}

export function emptyMixedSearch(): MixedSearchData {
  return { video: [], user: [], pgc: [], live: [], article: [] };
}

export function isEmptyMixed(data: MixedSearchData): boolean {
  return (
    data.video.length === 0 &&
    data.user.length === 0 &&
    data.pgc.length === 0 &&
    data.live.length === 0 &&
    data.article.length === 0
  );
}

type AllItem =
  | { kind: 'header'; title: string; count: number; categoryIdx: number }
  | { kind: 'video'; item: SearchResult }
  | { kind: 'user'; item: SearchResult }
  | { kind: 'pgc'; item: SearchResult }
  | { kind: 'live'; item: SearchResult }
  | { kind: 'article'; item: SearchResult }
  | { kind: 'empty' };

function SectionHeader({
  title,
  count,
  categoryIdx,
  onJumpToCategory,
  colors,
  T,
}: {
  title: string;
  count: number;
  categoryIdx: number;
  onJumpToCategory: (idx: number) => void;
  colors: ReturnType<typeof useThemeColors>;
  T: ReturnType<typeof useType>;
}) {
  return (
    <View style={styles.sectionHeader}>
      <RNText style={[T.subhead, styles.sectionTitle, { color: colors.text }]}>{title}</RNText>
      <View style={[styles.sectionCount, { backgroundColor: colors.fill2 }]}>
        <RNText style={[styles.sectionCountText, { color: colors.textSecondary }]}>{count}</RNText>
      </View>
      <Press haptic scaleTo={0.94} onPress={() => onJumpToCategory(categoryIdx)} style={styles.sectionMore}>
        <RNText style={[T.footnote, { color: colors.accent, fontWeight: '600' }]}>查看全部</RNText>
        <Ionicons name="chevron-forward" size={12} color={colors.accent} />
      </Press>
    </View>
  );
}

/** 综合 Tab 结果列表：视频大卡 + 用户/番剧/直播/专栏分组，每个分组可"查看全部"跳对应 Tab。 */
export function SearchAllResultList({
  data,
  searching,
  onEndReached,
  onOpenUser,
  onOpenMedia,
  onJumpToCategory,
}: {
  data: MixedSearchData;
  searching: boolean;
  onEndReached: () => void;
  onOpenUser: (item: SearchResult) => void;
  onOpenMedia: (item: SearchResult) => void;
  onJumpToCategory: (idx: number) => void;
}) {
  const colors = useThemeColors();
  const T = useType();

  /* 展平为分组行：视频最多 5 条大卡，其余分组最多 3 条行卡 */
  const items = useMemo<AllItem[]>(() => {
    const out: AllItem[] = [];
    const isEmpty = isEmptyMixed(data);
    if (isEmpty) {
      /* 搜索中且暂无数据 → 空数组（配合 ListEmptyComponent 显示加载指示） */
      if (searching) return [];
      out.push({ kind: 'empty' });
      return out;
    }
    if (data.video.length > 0) {
      out.push({ kind: 'header', title: '视频', count: data.video.length, categoryIdx: 1 });
      for (const item of data.video.slice(0, 5)) out.push({ kind: 'video', item });
    }
    if (data.user.length > 0) {
      out.push({ kind: 'header', title: '用户', count: data.user.length, categoryIdx: 5 });
      for (const item of data.user.slice(0, 3)) out.push({ kind: 'user', item });
    }
    if (data.pgc.length > 0) {
      out.push({ kind: 'header', title: '番剧/影视', count: data.pgc.length, categoryIdx: 2 });
      for (const item of data.pgc.slice(0, 3)) out.push({ kind: 'pgc', item });
    }
    if (data.live.length > 0) {
      out.push({ kind: 'header', title: '直播', count: data.live.length, categoryIdx: 4 });
      for (const item of data.live.slice(0, 3)) out.push({ kind: 'live', item });
    }
    if (data.article.length > 0) {
      out.push({ kind: 'header', title: '专栏', count: data.article.length, categoryIdx: 6 });
      for (const item of data.article.slice(0, 3)) out.push({ kind: 'article', item });
    }
    return out;
  }, [data, searching]);

  const renderItem = useCallback(
    ({ item }: { item: AllItem }) => {
      switch (item.kind) {
        case 'header':
          return <SectionHeader title={item.title} count={item.count} categoryIdx={item.categoryIdx} onJumpToCategory={onJumpToCategory} colors={colors} T={T} />;
        case 'video':
          return (
            <View style={styles.allVideoCard}>
              <MediaResultRow item={item.item} index={0} colors={colors} T={T} onPress={onOpenMedia} />
            </View>
          );
        case 'user':
          return (
            <View style={styles.allRowCard}>
              <UserResultRow item={item.item} index={0} colors={colors} T={T} onPress={onOpenUser} />
            </View>
          );
        case 'pgc':
        case 'live':
        case 'article':
          return (
            <View style={styles.allRowCard}>
              <MediaResultRow item={item.item} index={0} colors={colors} T={T} onPress={onOpenMedia} />
            </View>
          );
        case 'empty':
          return (
            <EmptyState
              icon="search-outline"
              title="无搜索结果"
              subtitle="换个关键词试试"
              style={{ paddingTop: 120 }}
            />
          );
        default:
          return null;
      }
    },
    [colors, T, onOpenUser, onOpenMedia, onJumpToCategory],
  );

  const getItemType = useCallback(
    (item: AllItem) => (item.kind === 'header' ? 'header' : item.kind === 'video' ? 'video' : item.kind === 'user' ? 'user' : 'media'),
    [],
  );

  return (
    <View style={{ flex: 1 }}>
      <FlashList
        data={items}
        keyExtractor={(item, index) =>
          item.kind === 'header' ? `h-${item.title}` : item.kind === 'empty' ? 'empty' : `${item.kind}-${item.item.bvid || item.item.mid || item.item.seasonId || item.item.roomid || item.item.articleId || index}`
        }
        style={styles.resultList}
        contentInsetAdjustmentBehavior="never"
        contentContainerStyle={styles.allListContent}
        showsVerticalScrollIndicator={false}
        estimatedItemSize={110}
        drawDistance={250}
        overrideProps={{ initialDrawBatchSize: 8 }}
        getItemType={getItemType}
        onEndReached={onEndReached}
        onEndReachedThreshold={0.4}
        ListHeaderComponent={
          searching ? null : (
            <View style={styles.allEnd}>
              <RNText style={[T.caption2, { color: colors.textTertiary }]}>
                共 {data.numResults ?? '-'} 条结果
              </RNText>
            </View>
          )
        }
        ListFooterComponent={
          searching ? (
            <View style={{ marginVertical: 16, alignItems: 'center' }}>
              <Host matchContents><ProgressView /></Host>
            </View>
          ) : null
        }
        ListEmptyComponent={
          searching ? (
            <View style={styles.loadingWrap}>
              <Host matchContents><ProgressView /></Host>
            </View>
          ) : null
        }
        renderItem={renderItem}
      />
    </View>
  );
}
