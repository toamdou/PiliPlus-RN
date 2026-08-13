import { useCallback, useRef, useState } from 'react';
import { View, Text, StyleSheet, RefreshControl, ActivityIndicator } from 'react-native';
import { FlashList, FlashListRef } from '@shopify/flash-list';
import { Stack, useLocalSearchParams, Link, useScrollToTop } from 'expo-router';
import { Image as ExpoImage } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors, ACCENT } from '@/components/SwiftUIHost';
import { favApi } from '@/api/fav';
import { userApi } from '@/api/user';
import { usePagedList } from '@/hooks/use-paged-list';
import { SkeletonRow } from '@/components/Skeleton';
import { Press } from '@/components/motion';
import { useType } from '@/components/type-scale';
import { RADII, continuous, shadow } from '@/theme/tokens';
import { feedBackMedium } from '@/utils/feedback';
import { formatCount, formatDuration, formatDate } from '@/utils/format';
import { fixedItemLayout } from '@/utils/list-layout';
import { biliCover } from '@/utils/image-url';
import EmptyState from '@/components/EmptyState';
import ErrorState from '@/components/ErrorState';

const rowLayout = fixedItemLayout(106);

interface SubInfo {
  id: number;
  title: string;
  cover: string;
  mediaCount: number;
  upperName: string;
  upperMid: number;
  intro: string;
}

interface SubMedia {
  bvid: string;
  title: string;
  cover: string;
  duration: number;
  pubtime: number;
  play: number;
  danmaku: number;
}

export default function SubscriptionDetailScreen() {
  const params = useLocalSearchParams<{ mid: string; title?: string }>();
  const colors = useThemeColors();
  const T = useType();
  const id = parseInt(params.mid || '0', 10) || 0;
  const [info, setInfo] = useState<SubInfo | null>(null);
  const listRef = useRef<FlashListRef<SubMedia>>(null);
  useScrollToTop(listRef);

  const { items, loading, refreshing, loadingMore, error, refresh, loadMore } = usePagedList<SubMedia>({
    enabled: id > 0,
    fetchPage: async (page, cancelToken) => {
      let res: any;
      try {
        res = await favApi.seasonList({ season_id: id, pn: page, ps: 20 }, { cancelToken });
      } catch (e) {
        if (cancelToken?.aborted) throw e;
        res = await userApi.seasonArchives({ season_id: id, pn: page, ps: 30 }, { cancelToken });
      }
      const data = res?.data || {};
      const rawMedias = data.medias || data.archives || [];
      const mapped: SubMedia[] = rawMedias.map((m: any) => ({
        bvid: m.bvid || '',
        title: m.title || '',
        cover: m.cover || m.pic || '',
        duration: m.duration || 0,
        pubtime: m.pubtime || m.pubdate || 0,
        play: m.cnt_info?.play || m.stat?.view || 0,
        danmaku: m.cnt_info?.danmaku || m.stat?.danmaku || 0,
      }));
      const rawInfo = data.info;
      if (rawInfo) {
        setInfo({
          id: rawInfo.id || id,
          title: rawInfo.title || params.title || '订阅详情',
          cover: rawInfo.cover || '',
          mediaCount: rawInfo.media_count || 0,
          upperName: rawInfo.upper?.name || '',
          upperMid: rawInfo.upper?.mid || rawInfo.mid || 0,
          intro: rawInfo.intro || '',
        });
      }
      return {
        items: mapped,
        hasMore: data.has_more !== false && rawMedias.length >= 20,
      };
    },
    onError: (e) => {
      console.error('subscription detail error:', e);
    },
  });

  const renderItem = useCallback(
    ({ item, index }: { item: SubMedia; index: number }) => {
      const row = (
        <Press haptic scaleTo={0.98} style={[styles.row, index < items.length - 1 && { borderBottomColor: colors.separator, borderBottomWidth: StyleSheet.hairlineWidth }]}>
          <View style={styles.coverWrap}>
            <ExpoImage source={{ uri: biliCover((item.cover || ''), 320, 200) }} recyclingKey={item.cover} cachePolicy="memory-disk" style={[styles.cover, { backgroundColor: colors.fill2 }]} contentFit="cover" />
            {item.duration > 0 ? (
              <View style={styles.durationBadge}>
                <Text style={styles.durationText}>{formatDuration(item.duration)}</Text>
              </View>
            ) : null}
          </View>
          <View style={styles.info}>
            <Text style={[T.subhead, styles.title, { color: colors.text }]} numberOfLines={2}>{item.title}</Text>
            {item.pubtime > 0 ? (
              <Text style={[T.caption1, { color: colors.textSecondary }]}>{formatDate(item.pubtime)}</Text>
            ) : null}
            <View style={styles.statRow}>
              <Ionicons name="play-outline" size={12} color={colors.textTertiary} />
              <Text style={[T.caption2, { color: colors.textTertiary }]}>{formatCount(item.play)}</Text>
              <Ionicons name="chatbubble-outline" size={11} color={colors.textTertiary} />
              <Text style={[T.caption2, { color: colors.textTertiary }]}>{formatCount(item.danmaku)}</Text>
            </View>
          </View>
        </Press>
      );
      return (
        <View>
          {item.bvid ? <Link href={`/video/${item.bvid}` as any} asChild>{row}</Link> : row}
        </View>
      );
    },
    [colors, items.length, T],
  );

  if (!id) {
    return (
      <View style={[styles.root, { backgroundColor: colors.bg }]}>
        <Stack.Title large>订阅详情</Stack.Title>
        <Stack.Header blurEffect="systemMaterial" style={{ shadowColor: 'transparent' }} />
        <EmptyState icon="alert-circle-outline" title="缺少订阅参数" />
      </View>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]}>
      <Stack.Title large>{info?.title || String(params.title || '订阅详情')}</Stack.Title>
      <Stack.Header blurEffect="systemMaterial" style={{ shadowColor: 'transparent' }} />
      <FlashList
        ref={listRef}
        data={items}
        keyExtractor={(it) => it.bvid || `${it.title}-${it.pubtime}`}
        ListHeaderComponent={
          info ? (
            <View style={[styles.infoHeader, { backgroundColor: colors.card, ...shadow('sm', colors.isDark) }]}>
              <ExpoImage source={{ uri: biliCover((info.cover || ''), 320, 200) }} recyclingKey={info.cover} cachePolicy="memory-disk" style={[styles.infoCover, { backgroundColor: colors.fill2 }]} contentFit="cover" />
              <View style={styles.infoText}>
                <Text style={[T.subhead, styles.infoTitle, { color: colors.text }]} numberOfLines={2}>{info.title}</Text>
                {info.upperName ? (
                  <Text style={[T.caption1, { color: colors.textSecondary }]} numberOfLines={1}>{info.upperName}</Text>
                ) : null}
                <Text style={[T.caption1, { color: colors.textTertiary }]}>{`${info.mediaCount || items.length} 个视频`}</Text>
                {info.intro ? (
                  <Text style={[T.caption1, { color: colors.textSecondary }]} numberOfLines={2}>{info.intro}</Text>
                ) : null}
              </View>
            </View>
          ) : null
        }
        contentContainerStyle={[styles.listContent, items.length > 0 && { backgroundColor: colors.card, borderRadius: RADII.lg, marginHorizontal: 14, marginTop: 12, ...continuous, ...shadow('sm', colors.isDark) }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { feedBackMedium(); refresh(); }} tintColor={colors.textSecondary} />}
        onEndReached={loadMore}
        onEndReachedThreshold={0.4}
        estimatedItemSize={106}
        overrideItemLayout={rowLayout}
        drawDistance={250}
        overrideProps={{ initialDrawBatchSize: 10 }}
        ListFooterComponent={loadingMore ? <ActivityIndicator size="small" color={colors.textTertiary} style={{ marginVertical: 14 }} /> : null}
        ListEmptyComponent={
          loading ? null : error ? (
            <ErrorState title={typeof error === 'string' ? error : '加载失败'} onRetry={refresh} />
          ) : (
            <EmptyState icon="list-outline" title="暂无视频" />
          )
        }
        renderItem={renderItem}
      />
      {loading && items.length === 0 && (
        <View style={[styles.skeletonCard, { backgroundColor: colors.card }]}>
          <SkeletonRow />
          <SkeletonRow />
          <SkeletonRow />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  listContent: { paddingHorizontal: 16, paddingBottom: 40 },
  infoHeader: { flexDirection: 'row', gap: 12, padding: 12, borderRadius: RADII.lg, marginBottom: 12, ...continuous },
  infoCover: { width: 132, height: 82, borderRadius: RADII.sm, ...continuous },
  infoText: { flex: 1, gap: 4, justifyContent: 'center' },
  infoTitle: { fontWeight: '700' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  coverWrap: { position: 'relative' },
  cover: { width: 132, height: 82, borderRadius: RADII.sm, ...continuous },
  durationBadge: { position: 'absolute', bottom: 5, right: 5, backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 5, paddingHorizontal: 5, paddingVertical: 1.5 },
  durationText: { color: '#FFFFFF', fontSize: 10.5, fontWeight: '600' },
  info: { flex: 1, gap: 4, justifyContent: 'center' },
  title: { fontWeight: '600' },
  statRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  skeletonCard: { position: 'absolute', top: 12, left: 14, right: 14, borderRadius: RADII.lg, paddingHorizontal: 16, paddingTop: 8, gap: 4, ...continuous },
});
