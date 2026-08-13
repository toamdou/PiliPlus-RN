import { useCallback, useRef, useState } from 'react';
import { View, Text, StyleSheet, RefreshControl, ActivityIndicator } from 'react-native';
import { FlashList, FlashListRef } from '@shopify/flash-list';
import { Stack, useRouter, Link, useScrollToTop } from 'expo-router';
import { Image as ExpoImage } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors, ACCENT } from '@/components/SwiftUIHost';
import { favApi } from '@/api/fav';
import { usePagedList } from '@/hooks/use-paged-list';
import { useAuthStore } from '@/stores/auth';
import { SkeletonRow } from '@/components/Skeleton';
import { Press } from '@/components/motion';
import { useType } from '@/components/type-scale';
import { RADII, continuous, shadow } from '@/theme/tokens';
import { feedBackMedium, feedBackSuccess } from '@/utils/feedback';
import { formatDuration } from '@/utils/format';
import { showToast } from '@/utils/toast';
import { fixedItemLayout } from '@/utils/list-layout';
import { biliCover } from '@/utils/image-url';
import EmptyState from '@/components/EmptyState';
import ErrorState from '@/components/ErrorState';

const rowLayout = fixedItemLayout(106);

interface LaterSearchItem {
  aid: number;
  bvid: string;
  title: string;
  pic: string;
  duration: number;
  owner: string;
}

export default function LaterSearchScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const T = useType();
  const { isLoggedIn } = useAuthStore();
  const [keyword, setKeyword] = useState('');
  const listRef = useRef<FlashListRef<LaterSearchItem>>(null);
  useScrollToTop(listRef);
  const queryRef = useRef('');

  const { items, loading, refreshing, loadingMore, error, refresh, loadMore, setItems } = usePagedList<LaterSearchItem>({
    enabled: isLoggedIn,
    fetchPage: async (page, cancelToken) => {
      const q = queryRef.current.trim();
      if (!q) return { items: [] as LaterSearchItem[], hasMore: false };
      const res = await favApi.toViewList({ pn: page, key: q, viewed: 0 }, { cancelToken });
      const mapped: LaterSearchItem[] = (res?.data?.list || []).map((i: any) => ({
        aid: i.aid || 0,
        bvid: i.bvid || '',
        title: i.title || '',
        pic: i.pic || '',
        duration: i.duration || 0,
        owner: i.owner?.name || '',
      }));
      return { items: mapped, hasMore: mapped.length >= 20 };
    },
    onError: (e) => {
      console.error('later search error:', e);
    },
  });

  const submit = useCallback((value?: string) => {
    queryRef.current = value ?? keyword;
    setTimeout(() => refresh(), 0);
  }, [keyword, refresh]);

  const removeItem = useCallback(async (item: LaterSearchItem) => {
    try {
      await favApi.delToView({ resources: String(item.aid) });
      setItems((prev) => prev.filter((x) => x.aid !== item.aid));
      feedBackSuccess();
    } catch {
      showToast('删除失败');
    }
  }, []);

  const renderItem = useCallback(
    ({ item, index }: { item: LaterSearchItem; index: number }) => {
      const row = (
        <Press haptic scaleTo={0.98} style={[styles.row, index < items.length - 1 && { borderBottomColor: colors.separator, borderBottomWidth: StyleSheet.hairlineWidth }]}>
          <View style={styles.coverWrap}>
            <ExpoImage source={{ uri: biliCover((item.pic || ''), 320, 200) }} recyclingKey={item.pic} cachePolicy="memory-disk" style={[styles.cover, { backgroundColor: colors.fill2 }]} contentFit="cover" />
            {item.duration > 0 ? (
              <View style={styles.durationBadge}>
                <Text style={styles.durationText}>{formatDuration(item.duration)}</Text>
              </View>
            ) : null}
          </View>
          <View style={styles.info}>
            <Text style={[T.subhead, styles.title, { color: colors.text }]} numberOfLines={2}>{item.title}</Text>
            <Text style={[T.caption1, { color: colors.textSecondary }]} numberOfLines={1}>{item.owner}</Text>
          </View>
          <Press haptic scaleTo={0.9} onPress={() => removeItem(item)} style={styles.removeBtn}>
            <Ionicons name="close" size={16} color={colors.textTertiary} />
          </Press>
        </Press>
      );
      return (
        <View>
          {item.bvid ? <Link href={{ pathname: '/video/[id]', params: { id: item.bvid } } as any} asChild>{row}</Link> : row}
        </View>
      );
    },
    [colors, items.length, removeItem, T],
  );

  if (!isLoggedIn) {
    return (
      <View style={[styles.root, { backgroundColor: colors.bg }]}>
        <Stack.Title large>稍后再看搜索</Stack.Title>
        <Stack.Header blurEffect="systemMaterial" style={{ shadowColor: 'transparent' }} />
        <EmptyState
          icon="lock-closed-outline"
          title="请先登录"
          subtitle="登录后可使用稍后再看搜索">
          <Press haptic scaleTo={0.94} onPress={() => router.push('/login' as any)} style={[styles.retryBtn, { backgroundColor: ACCENT }]}>
            <Text style={[T.subhead, styles.retryText]}>去登录</Text>
          </Press>
        </EmptyState>
      </View>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]}>
      <Stack.Title large>稍后再看搜索</Stack.Title>
      <Stack.Header blurEffect="systemMaterial" style={{ shadowColor: 'transparent' }} />
      <Stack.SearchBar
        placeholder="搜索稍后再看"
        autoCapitalize="none"
        onChangeText={(e: any) => setKeyword(typeof e === 'string' ? e : e?.nativeEvent?.text ?? '')}
        onSearchButtonPress={(e: any) => submit(typeof e === 'string' ? e : e?.nativeEvent?.text ?? keyword)}
        tintColor={ACCENT}
        textColor={colors.text}
        hintTextColor={colors.textTertiary}
        headerIconColor={colors.textSecondary}
      />
      <FlashList
        ref={listRef}
        data={items}
        keyExtractor={(it) => String(it.aid)}
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
            <EmptyState icon="search-outline" title="输入关键词搜索稍后再看" />
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
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  coverWrap: { position: 'relative' },
  cover: { width: 132, height: 82, borderRadius: RADII.sm, ...continuous },
  durationBadge: { position: 'absolute', bottom: 5, right: 5, backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 5, paddingHorizontal: 5, paddingVertical: 1.5 },
  durationText: { color: '#FFFFFF', fontSize: 10.5, fontWeight: '600' },
  info: { flex: 1, gap: 6, justifyContent: 'center' },
  title: { fontWeight: '600' },
  removeBtn: { padding: 8, alignSelf: 'center' },
  retryBtn: { marginTop: 14, borderRadius: RADII.lg, paddingHorizontal: 30, paddingVertical: 10, ...continuous },
  retryText: { color: '#FFFFFF', fontWeight: '600' },
  skeletonCard: { position: 'absolute', top: 0, left: 14, right: 14, borderRadius: RADII.lg, paddingHorizontal: 16, paddingTop: 8, gap: 4, ...continuous },
});
