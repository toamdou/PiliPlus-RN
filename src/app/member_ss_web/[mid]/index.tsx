import { memo, useCallback, useRef, useState } from 'react';
import { ActivityIndicator, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Stack, Link, useLocalSearchParams, useScrollToTop } from 'expo-router';
import { Image as ExpoImage } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors, ACCENT } from '@/components/SwiftUIHost';
import { Press } from '@/components/motion';
import { useType } from '@/components/type-scale';
import { SkeletonRow } from '@/components/Skeleton';
import { userApi } from '@/api/user';
import { usePagedList } from '@/hooks/use-paged-list';
import type { NativeRequestCancelToken } from '@/utils/request-cancel';
import { formatCount, formatDuration, formatTime } from '@/utils/format';
import { showToast } from '@/utils/toast';
import { feedBackMedium } from '@/utils/feedback';
import { fixedItemLayout } from '@/utils/list-layout';
import { RADII, continuous, shadow } from '@/theme/tokens';
import { biliCover } from '@/utils/image-url';

const archiveLayout = fixedItemLayout(96);

interface SsItem {
  kind: 'season' | 'series';
  id: number;
  name: string;
  cover: string;
  total: number;
  ptime: number;
}

interface SsArchive {
  bvid: string;
  aid: number;
  pic: string;
  title: string;
  duration: number;
  view: number;
  pubdate: number;
}

const SsCard = memo(function SsCard({
  item,
  index,
  colors,
  T,
  onPress,
}: {
  item: SsItem;
  index: number;
  colors: ReturnType<typeof useThemeColors>;
  T: ReturnType<typeof useType>;
  onPress: (item: SsItem) => void;
}) {
  return (
    <>
      <Press
        haptic
        scaleTo={0.98}
        onPress={() => onPress(item)}
        style={[styles.card, { backgroundColor: colors.card, ...shadow('sm', colors.isDark) }]}>
        <ExpoImage
          source={{ uri: biliCover((item.cover || ''), 320, 200) }}
          recyclingKey={item.cover || ''}
          cachePolicy="memory-disk"
          style={[styles.cardCover, { backgroundColor: colors.fill2 }]}
          contentFit="cover"
        />
        <View style={styles.cardInfo}>
          <View style={[styles.kindTag, { backgroundColor: item.kind === 'season' ? 'rgba(251,114,153,0.12)' : 'rgba(120,120,128,0.12)' }]}>
            <Text style={[T.caption2, { color: item.kind === 'season' ? ACCENT : colors.textSecondary, fontWeight: '600' }]}>
              {item.kind === 'season' ? '合集' : '系列'}
            </Text>
          </View>
          <Text style={[T.subhead, styles.cardTitle, { color: colors.text }]} numberOfLines={2}>{item.name || '未命名'}</Text>
          <Text style={[T.caption2, { color: colors.textTertiary }]}>
            {`${item.total || 0}个视频 · ${item.ptime ? formatTime(item.ptime) : ''}`}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={16} color={colors.quaternaryLabel} />
      </Press>
    </>
  );
});

const ArchiveRow = memo(function ArchiveRow({
  item,
  index,
  colors,
  T,
}: {
  item: SsArchive;
  index: number;
  colors: ReturnType<typeof useThemeColors>;
  T: ReturnType<typeof useType>;
}) {
  return (
    <>
      <Link href={{ pathname: '/video/[id]', params: { id: item.bvid } }} asChild>
        <Press haptic scaleTo={0.98} style={[styles.archiveCard, { backgroundColor: colors.card, ...shadow('sm', colors.isDark) }]}>
          <View style={styles.archiveCoverWrap}>
            <ExpoImage
              source={{ uri: biliCover((item.pic || ''), 240, 150) }}
              recyclingKey={item.pic || ''}
              cachePolicy="memory-disk"
              style={[styles.archiveCover, { backgroundColor: colors.fill2 }]}
              contentFit="cover"
            />
            {item.duration ? (
              <View style={styles.durationBadge}>
                <Text style={styles.durationText}>{formatDuration(item.duration)}</Text>
              </View>
            ) : null}
          </View>
          <View style={styles.archiveInfo}>
            <Text style={[T.subhead, styles.archiveTitle, { color: colors.text }]} numberOfLines={2}>{item.title}</Text>
            <Text style={[T.caption2, { color: colors.textTertiary }]} numberOfLines={1}>
              {formatCount(item.view)}播放 · {formatTime(item.pubdate)}
            </Text>
          </View>
        </Press>
      </Link>
    </>
  );
});

export default function MemberSsWebScreen() {
  const { mid } = useLocalSearchParams<{ mid: string }>();
  const colors = useThemeColors();
  const T = useType();
  const listRef = useRef<any>(null);
  useScrollToTop(listRef);
  const midNum = Number(mid);
  const [selected, setSelected] = useState<SsItem | null>(null);
  const selectedRef = useRef<SsItem | null>(null);

  const ssList = usePagedList<SsItem>({
    enabled: midNum > 0 && !selected,
    fetchPage: async (page, cancelToken?: NativeRequestCancelToken) => {
      const res = await userApi.seasonSeriesList({ mid: midNum, pn: page }, cancelToken ? { cancelToken } : undefined);
      const data = res?.data?.items_lists ?? res?.data ?? {};
      const seasons: any[] = data.seasons_list ?? [];
      const series: any[] = data.series_list ?? [];
      const items: SsItem[] = [
        ...seasons.map((s) => ({
          kind: 'season' as const,
          id: s.meta?.season_id,
          name: s.meta?.name || '',
          cover: s.meta?.cover || '',
          total: s.meta?.total ?? 0,
          ptime: s.meta?.ptime ?? 0,
        })),
        ...series.map((s) => ({
          kind: 'series' as const,
          id: s.meta?.series_id,
          name: s.meta?.name || '',
          cover: s.meta?.cover || '',
          total: s.meta?.total ?? 0,
          ptime: s.meta?.ptime ?? 0,
        })),
      ].filter((it) => it.id != null);
      const total = data.page?.total;
      return {
        items,
        hasMore: typeof total === 'number' ? page * 10 < total : items.length >= 10,
      };
    },
    onError: (e) => {
      console.error('seasonSeriesList error:', e);
      showToast('合集/系列加载失败');
    },
  });

  const archiveList = usePagedList<SsArchive>({
    enabled: !!selected,
    fetchPage: async (page, cancelToken?: NativeRequestCancelToken) => {
      const target = selectedRef.current;
      if (!target) return { items: [], hasMore: false };
      const res = target.kind === 'season'
        ? await userApi.seasonArchives({ season_id: target.id, pn: page }, cancelToken ? { cancelToken } : undefined)
        : await userApi.seriesArchives({ series_id: target.id, pn: page }, cancelToken ? { cancelToken } : undefined);
      const data = res?.data;
      const archives: any[] = data?.archives ?? [];
      const total = data?.page?.total;
      return {
        items: archives.map((a) => ({
          bvid: a.bvid || '',
          aid: a.aid ?? 0,
          pic: a.pic || '',
          title: a.title || '',
          duration: a.duration ?? 0,
          view: a.stat?.view ?? 0,
          pubdate: a.pubdate ?? 0,
        })),
        hasMore: typeof total === 'number' ? page * 30 < total : archives.length >= 30,
      };
    },
    onError: (e) => {
      console.error('seasonArchives error:', e);
      showToast('视频加载失败');
    },
  });

  const openDetail = useCallback((item: SsItem) => {
    selectedRef.current = item;
    setSelected(item);
  }, []);

  const backToList = useCallback(() => {
    selectedRef.current = null;
    setSelected(null);
  }, []);

  const renderSs = useCallback(
    ({ item, index }: { item: SsItem; index: number }) => (
      <SsCard item={item} index={index} colors={colors} T={T} onPress={openDetail} />
    ),
    [colors, T, openDetail],
  );

  const renderArchive = useCallback(
    ({ item, index }: { item: SsArchive; index: number }) => (
      <ArchiveRow item={item} index={index} colors={colors} T={T} />
    ),
    [colors, T],
  );

  const getItemType = useCallback((item: SsItem) => item.kind, []);

  const SsSeparator = useCallback(() => <View style={{ height: 10 }} />, []);
  const ArchiveSeparator = useCallback(() => <View style={{ height: 10 }} />, []);

  if (selected) {
    return (
      <View style={[styles.root, { backgroundColor: colors.bg }]}>
        <Stack.Title large>{selected.name || '合集/系列'}</Stack.Title>
        <Stack.Header blurEffect="systemMaterial" style={{ shadowColor: 'transparent' }} />
        <FlashList
          ref={listRef}
          data={archiveList.items}
          keyExtractor={(it, i) => it.bvid || `archive_${i}`}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            <View style={styles.detailHeader}>
              <Press haptic scaleTo={0.94} onPress={backToList} style={[styles.backChip, { backgroundColor: colors.fill2 }]}>
                <Ionicons name="arrow-back" size={14} color={colors.textSecondary} />
                <Text style={[T.caption1, { color: colors.textSecondary }]}>返回列表</Text>
              </Press>
              {archiveList.items.length > 0 ? (
                <Text style={[T.caption2, { color: colors.textTertiary }]}>{archiveList.items.length}个视频</Text>
              ) : null}
            </View>
          }
          renderItem={renderArchive}
          ItemSeparatorComponent={ArchiveSeparator}
          onEndReached={archiveList.loadMore}
          onEndReachedThreshold={0.4}
          refreshControl={
            <RefreshControl
              refreshing={archiveList.refreshing}
              onRefresh={() => {
                feedBackMedium();
                archiveList.refresh();
              }}
              tintColor={colors.textSecondary}
            />
          }
          ListFooterComponent={
            archiveList.loadingMore ? (
              <ActivityIndicator size="small" color={colors.textTertiary} style={{ marginVertical: 16 }} />
            ) : null
          }
          ListEmptyComponent={
            archiveList.loading ? (
              <View style={styles.skeletonWrap}>
                <SkeletonRow height={64} />
                <SkeletonRow height={64} />
                <SkeletonRow height={64} />
              </View>
            ) : archiveList.error ? (
              <View style={styles.emptyWrap}>
                <Ionicons name="cloud-offline-outline" size={38} color={colors.textTertiary} />
                <Text style={[T.headline, styles.emptyTitle, { color: colors.text }]}>加载失败</Text>
                <Press haptic scaleTo={0.94} onPress={archiveList.refresh} style={[styles.retryBtn, { backgroundColor: colors.card }]}>
                  <Text style={[T.subhead, styles.retryText, { color: ACCENT }]}>重试</Text>
                </Press>
              </View>
            ) : (
              <View style={styles.emptyWrap}>
                <Ionicons name="videocam-outline" size={38} color={colors.textTertiary} />
                <Text style={[T.headline, styles.emptyTitle, { color: colors.text }]}>暂无视频</Text>
              </View>
            )
          }
          estimatedItemSize={96}
          overrideItemLayout={archiveLayout}
          windowSize={9}
          initialNumToRender={10}
          maxToRenderPerBatch={12}
          drawDistance={250}
          overrideProps={{ initialDrawBatchSize: 10 }}
        />
      </View>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]}>
      <Stack.Title large>合集/系列</Stack.Title>
      <Stack.Header blurEffect="systemMaterial" style={{ shadowColor: 'transparent' }} />
      <FlashList
        ref={listRef}
        data={ssList.items}
        keyExtractor={(it) => `${it.kind}-${it.id}`}
        getItemType={getItemType}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        renderItem={renderSs}
        ItemSeparatorComponent={SsSeparator}
        onEndReached={ssList.loadMore}
        onEndReachedThreshold={0.4}
        refreshControl={
          <RefreshControl
            refreshing={ssList.refreshing}
            onRefresh={() => {
              feedBackMedium();
              ssList.refresh();
            }}
            tintColor={colors.textSecondary}
          />
        }
        ListFooterComponent={
          ssList.loadingMore ? (
            <ActivityIndicator size="small" color={colors.textTertiary} style={{ marginVertical: 16 }} />
          ) : null
        }
        ListEmptyComponent={
          ssList.loading ? (
            <View style={styles.skeletonWrap}>
              <SkeletonRow height={64} />
              <SkeletonRow height={64} />
              <SkeletonRow height={64} />
            </View>
          ) : ssList.error ? (
            <View style={styles.emptyWrap}>
              <Ionicons name="cloud-offline-outline" size={38} color={colors.textTertiary} />
              <Text style={[T.headline, styles.emptyTitle, { color: colors.text }]}>加载失败</Text>
              <Press haptic scaleTo={0.94} onPress={ssList.refresh} style={[styles.retryBtn, { backgroundColor: colors.card }]}>
                <Text style={[T.subhead, styles.retryText, { color: ACCENT }]}>重试</Text>
              </Press>
            </View>
          ) : (
            <View style={styles.emptyWrap}>
              <Ionicons name="albums-outline" size={38} color={colors.textTertiary} />
              <Text style={[T.headline, styles.emptyTitle, { color: colors.text }]}>暂无合集/系列</Text>
            </View>
          )
        }
        estimatedItemSize={104}
        windowSize={9}
        initialNumToRender={10}
        maxToRenderPerBatch={12}
        drawDistance={250}
        overrideProps={{ initialDrawBatchSize: 10 }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  listContent: { padding: 14, paddingBottom: 40 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: RADII.card,
    padding: 10,
    ...continuous,
  },
  cardCover: { width: 92, height: 58, borderRadius: RADII.sm, ...continuous },
  cardInfo: { flex: 1, gap: 4 },
  kindTag: { alignSelf: 'flex-start', borderRadius: 5, paddingHorizontal: 6, paddingVertical: 1.5 },
  cardTitle: { fontWeight: '600', lineHeight: 20 },
  archiveCard: {
    flexDirection: 'row',
    gap: 10,
    borderRadius: RADII.card,
    padding: 10,
    overflow: 'hidden',
    ...continuous,
  },
  archiveCoverWrap: { position: 'relative' },
  archiveCover: { width: 120, height: 75, borderRadius: RADII.sm, ...continuous },
  durationBadge: { position: 'absolute', right: 5, bottom: 5, backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 5, paddingHorizontal: 5, paddingVertical: 1.5 },
  durationText: { color: '#FFFFFF', fontSize: 10, fontWeight: '600' },
  archiveInfo: { flex: 1, justifyContent: 'space-between', paddingVertical: 2 },
  archiveTitle: { fontWeight: '600', lineHeight: 20 },
  detailHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  backChip: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: RADII.circle, paddingHorizontal: 12, paddingVertical: 6, ...continuous },
  skeletonWrap: { gap: 10 },
  emptyWrap: { alignItems: 'center', paddingTop: 90, gap: 8 },
  emptyTitle: { fontWeight: '600' },
  retryBtn: { marginTop: 10, borderRadius: RADII.lg, paddingHorizontal: 28, paddingVertical: 9, ...continuous },
  retryText: { fontWeight: '600' },
});
