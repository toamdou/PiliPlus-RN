import { useCallback, useRef } from 'react';
import { View, Text, StyleSheet, RefreshControl, ActivityIndicator, useWindowDimensions } from 'react-native';
import { FlashList, FlashListRef } from '@shopify/flash-list';
import { Stack, useScrollToTop } from 'expo-router';
import { Host, ProgressView } from '@expo/ui/swift-ui';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors, ACCENT } from '@/components/SwiftUIHost';
import { videoApi } from '@/api/video';
import { usePagedList } from '@/hooks/use-paged-list';
import type { NativeRequestCancelToken } from '@/utils/request-cancel';
import { Press, stagger } from '@/components/motion';
import { useType } from '@/components/type-scale';
import { RADII, continuous } from '@/theme/tokens';
import { VideoCard, cellHeightFor, type VideoItem } from '@/components/video/VideoCard';
import { type FlashListItemLayout } from '@/utils/list-layout';
import { feedBackMedium } from '@/utils/feedback';
import { showToast } from '@/utils/toast';
import EmptyState from '@/components/EmptyState';
import ErrorState from '@/components/ErrorState';

function mapItems(raw: any[]): VideoItem[] {
  return (raw || []).map((i: any) => {
    const aid = i.aid || 0;
    return {
      aid,
      bvid: i.bvid || '',
      title: i.title || '',
      pic: i.pic || '',
      duration: i.duration || 0,
      owner: { name: i.owner?.name || '', face: i.owner?.face || '', mid: i.owner?.mid || 0 },
      stat: { view: i.stat?.view || 0, danmaku: i.stat?.danmaku || 0 },
      goto: 'av' as const,
    };
  });
}

export default function PopularPreciousScreen() {
  const colors = useThemeColors();
  const T = useType();
  const { width: windowWidth } = useWindowDimensions();
  const listRef = useRef<FlashListRef<VideoItem>>(null);
  useScrollToTop(listRef);

  const fetchPage = useCallback(async (page: number, cancelToken?: NativeRequestCancelToken) => {
    const res = await videoApi.popularPrecious({ page }, cancelToken ? { cancelToken } : undefined);
    const list = res?.data?.list || [];
    return { items: mapItems(list), hasMore: list.length >= 100 };
  }, []);

  const onError = useCallback((e: unknown) => {
    console.error('popularPrecious error:', e);
    showToast('入站必刷加载失败');
  }, []);

  const { items, loading, refreshing, loadingMore, error, refresh, loadMore } = usePagedList<VideoItem>({
    fetchPage,
    onError,
  });

  const renderItem = useCallback(
    ({ item, index }: { item: VideoItem; index: number }) => (
      <View>
        <VideoCard item={item} mode="immersive" delay={stagger(index)} />
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

  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]}>
      <Stack.Title large>入站必刷</Stack.Title>
      <Stack.Header blurEffect="systemMaterial" style={{ shadowColor: 'transparent' }} />

      <FlashList
        ref={listRef}
        data={items}
        keyExtractor={(it, idx) => it.bvid || `precious-${idx}`}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { feedBackMedium(); refresh(); }} tintColor={colors.textSecondary} />}
        onEndReached={loadMore}
        onEndReachedThreshold={0.4}
        estimatedItemSize={220}
        overrideItemLayout={overrideItemLayout}
        drawDistance={250}
        overrideProps={{ initialDrawBatchSize: 10 }}
        ListEmptyComponent={
          loading ? (
            <View style={styles.loadingWrap}>
              <Host matchContents><ProgressView /></Host>
            </View>
          ) : error ? (
            <ErrorState title="加载失败" onRetry={refresh} retryLabel="重新加载" />
          ) : (
            <EmptyState title="暂无内容" />
          )
        }
        ListFooterComponent={
          loadingMore ? (
            <ActivityIndicator size="small" color={colors.textTertiary} style={{ marginVertical: 16 }} />
          ) : null
        }
        renderItem={renderItem}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  listContent: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 40 },
  loadingWrap: { height: 260, justifyContent: 'center', alignItems: 'center' },
});
