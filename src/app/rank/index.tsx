import { memo, useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  useWindowDimensions,
} from 'react-native';
import { FlashList, FlashListRef } from '@shopify/flash-list';
import { Stack, useScrollToTop } from 'expo-router';
import { Host, ProgressView } from '@expo/ui/swift-ui';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors, ACCENT } from '@/components/SwiftUIHost';
import { videoApi } from '@/api/video';
import { createNativeRequestCancelToken, type NativeRequestCancelToken } from '@/utils/request-cancel';
import { Press, stagger } from '@/components/motion';
import { useType } from '@/components/type-scale';
import { RADII, continuous } from '@/theme/tokens';
import { VideoCard, cellHeightFor, type VideoItem } from '@/components/video/VideoCard';
import { type FlashListItemLayout } from '@/utils/list-layout';
import { feedBackMedium } from '@/utils/feedback';

interface RankItem extends VideoItem {
  rank: number;
}

interface Partition {
  label: string;
  rid?: number;
  seasonType?: number;
}

const PARTITIONS: Partition[] = [
  { label: '全站', rid: 0 },
  { label: '番剧', seasonType: 1 },
  { label: '国创', seasonType: 4 },
  { label: '动画', rid: 1005 },
  { label: '音乐', rid: 1003 },
  { label: '舞蹈', rid: 1004 },
  { label: '游戏', rid: 1008 },
  { label: '知识', rid: 1010 },
  { label: '科技', rid: 1012 },
  { label: '运动', rid: 1018 },
  { label: '汽车', rid: 1013 },
  { label: '美食', rid: 1020 },
  { label: '动物', rid: 1024 },
  { label: '鬼畜', rid: 1007 },
  { label: '时尚', rid: 1014 },
  { label: '娱乐', rid: 1002 },
  { label: '影视', rid: 1001 },
  { label: '记录', seasonType: 3 },
  { label: '电影', seasonType: 2 },
  { label: '剧集', seasonType: 5 },
  { label: '综艺', seasonType: 7 },
];

function parsePgcSeasonId(url: string): number {
  const match = (url || '').match(/ss(\d+)/);
  return match ? parseInt(match[1], 10) : 0;
}

const RankBadge = memo(function RankBadge({ rank }: { rank: number }) {
  const top3 = rank <= 3;
  return (
    <View style={[styles.rankBadge, { backgroundColor: top3 ? 'rgba(251,114,153,0.92)' : 'rgba(0,0,0,0.72)' }]}>
      <Text style={styles.rankBadgeText}>{rank}</Text>
    </View>
  );
});

export default function RankScreen() {
  const colors = useThemeColors();
  const T = useType();
  const { width: windowWidth } = useWindowDimensions();
  const [activeIdx, setActiveIdx] = useState(0);
  const [items, setItems] = useState<RankItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [failed, setFailed] = useState(false);
  const listRef = useRef<FlashListRef<RankItem>>(null);
  useScrollToTop(listRef);
  const cancelTokenRef = useRef<NativeRequestCancelToken | null>(null);

  const load = useCallback(async (idx: number, isRefresh = false) => {
    const chip = PARTITIONS[idx];
    const cancelToken = createNativeRequestCancelToken();
    cancelTokenRef.current?.abort();
    cancelTokenRef.current = cancelToken;
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setFailed(false);
    try {
      let raw: any[] = [];
      if (chip.rid != null) {
        const res = await videoApi.ranking({ rid: chip.rid }, { cancelToken });
        raw = res?.data?.list || [];
      } else if (chip.seasonType === 1) {
        const res = await videoApi.pgcRank({ season_type: chip.seasonType }, { cancelToken });
        raw = res?.result?.list || [];
      } else {
        const res = await videoApi.pgcSeasonRank({ season_type: chip.seasonType ?? 0 }, { cancelToken });
        raw = res?.data?.list || [];
      }
      const mapped: RankItem[] = raw.map((i: any, index: number) => {
        if (chip.rid != null) {
          const aid = i.aid || 0;
          return {
            aid,
            bvid: i.bvid || (aid ? '' : ''),
            title: i.title || '',
            pic: i.pic || '',
            duration: i.duration || 0,
            owner: { name: i.owner?.name || '', face: i.owner?.face || '', mid: i.owner?.mid || 0 },
            stat: { view: i.stat?.view || 0, danmaku: i.stat?.danmaku || 0 },
            goto: 'av' as const,
            rank: index + 1,
          };
        }
        const seasonId = parsePgcSeasonId(i.url || i.goto_url || '');
        return {
          aid: 0,
          bvid: '',
          title: i.title || '',
          pic: i.cover || '',
          duration: 0,
          owner: { name: i.new_ep?.index_show || '', face: '', mid: 0 },
          stat: { view: i.stat?.view || 0, danmaku: 0 },
          goto: 'pgc' as const,
          pgc: { season_id: seasonId },
          rank: index + 1,
        };
      });
      setItems(mapped);
    } catch (e) {
      if (cancelToken.aborted) return;
      console.error('rank load error:', e);
      setFailed(true);
    } finally {
      if (cancelTokenRef.current === cancelToken) cancelTokenRef.current = null;
      if (!cancelToken.aborted) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  useEffect(() => () => {
    cancelTokenRef.current?.abort();
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => load(activeIdx), 0);
    return () => clearTimeout(timer);
  }, [activeIdx, load]);

  const handleSelect = useCallback((idx: number) => {
    if (idx === activeIdx) return;
    feedBackMedium();
    setActiveIdx(idx);
    listRef.current?.scrollToOffset({ offset: 0, animated: false });
  }, [activeIdx]);

  const renderItem = useCallback(
    ({ item, index }: { item: RankItem; index: number }) => (
      <View style={styles.cell}>
        <View style={styles.cellWrap}>
          <VideoCard item={item} mode="immersive" delay={stagger(index)} />
          <RankBadge rank={item.rank} />
        </View>
      </View>
    ),
    [],
  );

  const overrideItemLayout = useCallback(
    (layout: FlashListItemLayout) => {
      layout.size = cellHeightFor('immersive', T.subhead.lineHeight ?? 20, T.caption1.lineHeight ?? 16, windowWidth) + 16;
    },
    [T, windowWidth],
  );

  const getItemType = useCallback((item: RankItem) => item.goto ?? 'av', []);

  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]}>
      <Stack.Title large>排行榜</Stack.Title>
      <Stack.Header blurEffect="systemMaterial" style={{ shadowColor: 'transparent' }} />

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.chipScroll}
        contentContainerStyle={styles.chipContent}>
        {PARTITIONS.map((p, i) => (
          <Press
            key={p.label}
            haptic
            scaleTo={0.94}
            onPress={() => handleSelect(i)}
            style={[styles.chip, continuous, i === activeIdx ? { backgroundColor: ACCENT } : { backgroundColor: colors.fill2 }]}>
            <Text style={[T.footnote, { color: i === activeIdx ? '#FFFFFF' : colors.textSecondary, fontWeight: i === activeIdx ? '600' : '400' }]}>
              {p.label}
            </Text>
          </Press>
        ))}
      </ScrollView>

      <FlashList
        ref={listRef}
        key={activeIdx}
        data={items}
        numColumns={1}
        keyExtractor={(it, idx) => `${it.bvid || it.pgc?.season_id || idx}`}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(activeIdx, true)} tintColor={colors.textSecondary} />}
        estimatedItemSize={220}
        overrideItemLayout={overrideItemLayout}
        getItemType={getItemType}
        windowSize={9}
        initialNumToRender={10}
        maxToRenderPerBatch={12}
        drawDistance={250}
        overrideProps={{ initialDrawBatchSize: 10 }}
        ListEmptyComponent={
          loading ? (
            <View style={styles.loadingWrap}>
              <Host matchContents><ProgressView /></Host>
            </View>
          ) : failed ? (
            <View style={styles.emptyWrap}>
              <View style={[styles.emptyIconBox, { backgroundColor: colors.fill2 }]}>
                <Ionicons name="cloud-offline-outline" size={38} color={colors.textTertiary} />
              </View>
              <Text style={[T.headline, styles.emptyTitle, { color: colors.text }]}>加载失败</Text>
              <Press haptic scaleTo={0.94} onPress={() => load(activeIdx)} style={styles.retryBtn}>
                <Text style={[T.subhead, { color: '#FFFFFF', fontWeight: '600' }]}>重新加载</Text>
              </Press>
            </View>
          ) : (
            <View style={styles.emptyWrap}>
              <Text style={[T.footnote, { color: colors.textTertiary }]}>暂无榜单数据</Text>
            </View>
          )
        }
        renderItem={renderItem}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  chipScroll: { maxHeight: 46 },
  chipContent: { paddingHorizontal: 14, gap: 8, alignItems: 'center', paddingVertical: 7 },
  chip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: RADII.sm },
  listContent: { paddingHorizontal: 12, paddingTop: 8, paddingBottom: 40 },
  cell: {},
  cellWrap: { position: 'relative' },
  rankBadge: {
    position: 'absolute',
    top: 6,
    left: 6,
    minWidth: 24,
    height: 22,
    borderRadius: 6,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankBadgeText: { color: '#FFFFFF', fontSize: 12, fontWeight: '800', fontVariant: ['tabular-nums'] },
  loadingWrap: { height: 260, justifyContent: 'center', alignItems: 'center' },
  emptyWrap: { alignItems: 'center', justifyContent: 'center', paddingTop: 120, paddingHorizontal: 40, gap: 8 },
  emptyIconBox: { width: 84, height: 84, borderRadius: 42, justifyContent: 'center', alignItems: 'center', marginBottom: 8, ...continuous },
  emptyTitle: { fontWeight: '600' },
  retryBtn: { marginTop: 14, backgroundColor: ACCENT, borderRadius: RADII.lg, paddingHorizontal: 30, paddingVertical: 10 },
});
