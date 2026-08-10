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
        windowSize={9}
        initialNumToRender={8}
        maxToRenderPerBatch={10}
        drawDistance={250}
        overrideProps={{ initialDrawBatchSize: 10 }}
        ListEmptyComponent={
          loading ? (
            <View style={styles.loadingWrap}>
              <Host matchContents><ProgressView /></Host>
            </View>
          ) : error ? (
            <View style={styles.emptyWrap}>
              <View style={[styles.emptyIconBox, { backgroundColor: colors.fill2 }]}>
                <Ionicons name="cloud-offline-outline" size={38} color={colors.textTertiary} />
              </View>
              <Text style={[T.headline, { color: colors.text, fontWeight: '600' }]}>加载失败</Text>
              <Press haptic scaleTo={0.94} onPress={refresh} style={styles.retryBtn}>
                <Text style={[T.subhead, { color: '#FFFFFF', fontWeight: '600' }]}>重新加载</Text>
              </Press>
            </View>
          ) : (
            <View style={styles.emptyWrap}>
              <Text style={[T.footnote, { color: colors.textTertiary }]}>暂无内容</Text>
            </View>
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
  emptyWrap: { alignItems: 'center', justifyContent: 'center', paddingTop: 120, paddingHorizontal: 40, gap: 8 },
  emptyIconBox: { width: 84, height: 84, borderRadius: 42, justifyContent: 'center', alignItems: 'center', marginBottom: 8, ...continuous },
  retryBtn: { marginTop: 14, backgroundColor: ACCENT, borderRadius: RADII.lg, paddingHorizontal: 30, paddingVertical: 10 },
});
