import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, ActivityIndicator, useWindowDimensions } from 'react-native';
import { FlashList, FlashListRef } from '@shopify/flash-list';
import { Stack, useLocalSearchParams, useRouter, useScrollToTop } from 'expo-router';
import type { Href } from 'expo-router';
import { Host, ProgressView } from '@expo/ui/swift-ui';
import { Image as ExpoImage } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors, ACCENT } from '@/components/SwiftUIHost';
import { liveApi } from '@/api/live';
import { formatCount, parseChineseNumber } from '@/utils/format';
import { usePagedList } from '@/hooks/use-paged-list';
import type { NativeRequestCancelToken } from '@/utils/request-cancel';
import { SkeletonCard } from '@/components/Skeleton';
import { showToast } from '@/utils/toast';
import { feedBackMedium } from '@/utils/feedback';
import { Press } from '@/components/motion';
import { useType } from '@/components/type-scale';
import { RADII, continuous } from '@/theme/tokens';
import { biliCover } from '@/utils/image-url';
import EmptyState from '@/components/EmptyState';
import ErrorState from '@/components/ErrorState';

const SIDE = 14;
const GAP = 12;

interface AreaItem {
  id: number;
  name: string;
  pic: string;
  parent_id: number;
  parent_name: string;
}
interface LiveRoom {
  roomid: number;
  uid: number;
  uname: string;
  face: string;
  cover: string;
  title: string;
  area_name: string;
  online: number;
}

/* ===== 房间卡片（封面 + 标题 + 主播 + 在线，点击进直播间） ===== */
const LiveRoomCard = memo(function LiveRoomCard({ item, index, onPress }: { item: LiveRoom; index: number; onPress: (roomid: number) => void }) {
  const colors = useThemeColors();
  const T = useType();
  const { width: windowWidth } = useWindowDimensions();
  const cardW = (windowWidth - SIDE * 2 - GAP) / 2;
  const coverH = (cardW * 9) / 16;
  return (
    <View style={[styles.roomCell, { width: cardW }, index % 2 === 0 && { marginRight: GAP }]}>
      <Press haptic scaleTo={0.96} onPress={() => onPress(item.roomid)}>
        <View style={[styles.roomCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
          <View style={styles.coverWrap}>
            <ExpoImage
              source={{ uri: biliCover(item.cover, 320, 200) }}
              recyclingKey={item.cover}
              cachePolicy="memory-disk"
              style={[styles.roomCover, { width: cardW, height: coverH, backgroundColor: colors.fill2 }]}
              contentFit="cover"
            />
            <View style={styles.onlineBadge}>
              <Ionicons name="people" size={10} color="#FFFFFF" />
              <Text style={styles.onlineText}>{formatCount(item.online)}</Text>
            </View>
            {item.area_name ? (
              <View style={[styles.areaBadge, { maxWidth: cardW * 0.5 }]}>
                <Text style={styles.areaText} numberOfLines={1}>{item.area_name}</Text>
              </View>
            ) : null}
          </View>
          <View style={styles.cardBody}>
            <Text style={[T.subhead, styles.roomTitle, { color: colors.text }]} numberOfLines={2}>{item.title || item.uname}</Text>
            <View style={styles.anchorRow}>
              <ExpoImage
                source={{ uri: biliCover(item.face, 48, 48) }}
                recyclingKey={item.face}
                cachePolicy="memory-disk"
                style={[styles.anchorFace, { backgroundColor: colors.fill2 }]}
                contentFit="cover"
              />
              <Text style={[T.caption2, styles.anchorName, { color: colors.textSecondary }]} numberOfLines={1}>{item.uname}</Text>
            </View>
          </View>
        </View>
      </Press>
    </View>
  );
});

/* ===== 单个分区的房间列表 ===== */
function LiveRoomGrid({ areaId, parentAreaId, onPressRoom }: { areaId: number; parentAreaId: number; onPressRoom: (roomid: number) => void }) {
  const colors = useThemeColors();
  const T = useType();
  const { width: windowWidth } = useWindowDimensions();
  const coverH = ((windowWidth - SIDE * 2 - GAP) * 9) / 32;
  const listRef = useRef<FlashListRef<LiveRoom>>(null);
  useScrollToTop(listRef);

  const fetchPage = useCallback(
    async (page: number, cancelToken?: NativeRequestCancelToken) => {
      const res = await liveApi.secondList({ parent_area_id: parentAreaId, area_id: areaId, page, sort_type: 'online' }, cancelToken ? { cancelToken } : undefined);
      if (res?.code !== 0) {
        /* 风控等业务错误以 HTTP 200 + code!=0 返回：抛错走 usePagedList 错误态，避免假空态 */
        throw new Error(res?.message || `房间列表加载失败（${res?.code}）`);
      }
      const list = res?.data?.list ?? [];
      const rooms: LiveRoom[] = list.map((i: any) => ({
        roomid: i.roomid || i.id || 0,
        uid: i.uid || 0,
        uname: i.uname || '',
        face: i.face || '',
        cover: i.system_cover || i.cover || '',
        title: i.title || '',
        area_name: i.area_name || '',
        online: i.online ?? parseChineseNumber(i.watched_show?.text_large),
      }));
      return { items: rooms, hasMore: list.length >= 20 };
    },
    [areaId, parentAreaId],
  );

  const onError = useCallback((e: unknown) => {
    console.error('分区房间加载失败:', e);
    showToast('房间列表加载失败');
  }, []);

  const { items, loading, refreshing, loadingMore, error, refresh, loadMore } = usePagedList<LiveRoom>({ fetchPage, onError });

  const handleRefresh = useCallback(() => {
    feedBackMedium();
    refresh();
  }, [refresh]);

  const renderItem = useCallback(
    ({ item, index }: { item: LiveRoom; index: number }) => (
      <LiveRoomCard item={item} index={index} onPress={onPressRoom} />
    ),
    [onPressRoom],
  );

  return (
    <FlashList
      ref={listRef}
      data={items}
      numColumns={2}
      keyExtractor={(it) => String(it.roomid)}
      contentContainerStyle={styles.listContent}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.textSecondary} />}
      onEndReached={loadMore}
      onEndReachedThreshold={0.4}
      estimatedItemSize={220}
      drawDistance={250}
      overrideProps={{ initialDrawBatchSize: 10 }}
      ListEmptyComponent={
        loading ? (
          <View style={styles.skeletonGrid}>
            {Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} height={coverH} />)}
          </View>
        ) : error ? (
          <ErrorState
            title="加载失败"
            message="网络开小差了，试试重新加载"
            onRetry={refresh}
            retryLabel="重新加载"
          />
        ) : (
          <EmptyState
            icon="tv-outline"
            title="暂无直播"
            subtitle="该分区暂时没有正在直播的房间"
          />
        )
      }
      ListFooterComponent={
        loadingMore ? (
          <ActivityIndicator size="small" color={colors.textTertiary} style={{ marginVertical: 16 }} />
        ) : null
      }
      renderItem={renderItem}
    />
  );
}

export default function LiveAreaDetailScreen() {
  const { areaId, parentAreaId, parentName } = useLocalSearchParams<{ areaId: string; parentAreaId?: string; parentName?: string }>();
  const router = useRouter();
  const colors = useThemeColors();
  const T = useType();
  const [siblings, setSiblings] = useState<AreaItem[]>([]);
  const [activeIdx, setActiveIdx] = useState(0);
  const [loadingAreas, setLoadingAreas] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      setLoadingAreas(true);
      (async () => {
        try {
          const pid = parentAreaId ? parseInt(parentAreaId, 10) : 0;
          const res = pid > 0 ? await liveApi.roomAreaList({ parent_id: pid }) : null;
          const list: AreaItem[] = (res?.data ?? []).map((a: any) => ({
            id: a.id ?? 0,
            name: a.name || '',
            pic: a.pic || '',
            parent_id: a.parent_id ?? pid,
            parent_name: a.parent_name || parentName || '',
          }));
          if (!cancelled) {
            setSiblings(list);
            const idx = list.findIndex((a) => String(a.id) === String(areaId));
            setActiveIdx(Math.max(0, idx));
          }
        } catch (e) {
          console.error('roomAreaList error:', e);
          if (!cancelled) setSiblings([]);
        } finally {
          if (!cancelled) setLoadingAreas(false);
        }
      })();
    }, 0);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [areaId, parentAreaId, parentName]);

  const aid = parseInt(areaId || '0', 10);
  const pid = parentAreaId ? parseInt(parentAreaId, 10) : 0;
  const title = parentName || '直播分区';

  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]}>
      {title && <Stack.Title large>{title}</Stack.Title>}
      <Stack.Header blurEffect="systemMaterial" style={{ shadowColor: 'transparent' }} />

      {siblings.length > 1 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.chipScroll}
          contentContainerStyle={styles.chipContent}>
          {siblings.map((s, i) => (
            <Press
              key={s.id}
              haptic
              scaleTo={0.94}
              onPress={() => setActiveIdx(i)}
              style={[styles.chip, continuous, i === activeIdx ? { backgroundColor: ACCENT } : { backgroundColor: colors.fill2 }]}>
              <Text style={[T.footnote, { color: i === activeIdx ? '#FFFFFF' : colors.textSecondary, fontWeight: i === activeIdx ? '600' : '400' }]}>
                {s.name}
              </Text>
            </Press>
          ))}
        </ScrollView>
      ) : null}

      {loadingAreas && siblings.length === 0 ? (
        <View style={styles.loadingWrap}>
          <Host matchContents><ProgressView /></Host>
        </View>
      ) : (
        <LiveRoomGrid
          key={siblings.length > 0 ? siblings[activeIdx]?.id : aid}
          areaId={siblings.length > 0 ? siblings[activeIdx]?.id ?? aid : aid}
          parentAreaId={siblings.length > 0 ? siblings[activeIdx]?.parent_id ?? pid : pid}
          onPressRoom={(roomid) => router.push(`/live/${roomid}` as Href)}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  loadingWrap: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  /* 子分区 chips */
  chipScroll: { maxHeight: 46 },
  chipContent: { paddingHorizontal: 14, gap: 8, alignItems: 'center', paddingVertical: 7 },
  chip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: RADII.sm },
  /* 房间网格 */
  listContent: { paddingHorizontal: SIDE, paddingTop: 8, paddingBottom: 40 },
  roomCell: { marginBottom: GAP },
  roomCard: {
    borderRadius: RADII.card,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    ...continuous,
  },
  coverWrap: { position: 'relative' },
  roomCover: {},
  onlineBadge: {
    position: 'absolute', bottom: 5, left: 5,
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 5,
    paddingHorizontal: 5, paddingVertical: 2,
  },
  onlineText: { color: '#FFFFFF', fontSize: 10, fontWeight: '600', fontVariant: ['tabular-nums'] },
  areaBadge: {
    position: 'absolute', bottom: 5, right: 5,
    backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 5,
    paddingHorizontal: 5, paddingVertical: 2,
  },
  areaText: { color: '#FFFFFF', fontSize: 10, fontWeight: '500' },
  cardBody: { padding: 9, gap: 6 },
  roomTitle: { fontWeight: '600', lineHeight: 18 },
  anchorRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  anchorFace: { width: 18, height: 18, borderRadius: 9 },
  anchorName: { flex: 1 },
  /* 骨架 */
  skeletonGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: GAP, paddingTop: 8 },
});
