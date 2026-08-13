import { useCallback, useRef, useState } from 'react';
import { View, Text, StyleSheet, RefreshControl, ActivityIndicator } from 'react-native';
import { FlashList, FlashListRef } from '@shopify/flash-list';
import { Stack, useRouter, Link, useScrollToTop } from 'expo-router';
import { Image as ExpoImage } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors, ACCENT } from '@/components/SwiftUIHost';
import { userApi } from '@/api/user';
import { usePagedList } from '@/hooks/use-paged-list';
import { useAuthStore } from '@/stores/auth';
import { SkeletonRow } from '@/components/Skeleton';
import { Press } from '@/components/motion';
import { useType } from '@/components/type-scale';
import { RADII, continuous, shadow } from '@/theme/tokens';
import { feedBackMedium } from '@/utils/feedback';
import { fixedItemLayout } from '@/utils/list-layout';
import { biliCover } from '@/utils/image-url';
import EmptyState from '@/components/EmptyState';
import ErrorState from '@/components/ErrorState';

const rowLayout = fixedItemLayout(72);

interface FollowSearchItem {
  mid: number;
  uname: string;
  face: string;
  sign: string;
}

export default function FollowSearchScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const T = useType();
  const { isLoggedIn, userInfo } = useAuthStore();
  const vmid = userInfo?.mid || 0;
  const [keyword, setKeyword] = useState('');
  const listRef = useRef<FlashListRef<FollowSearchItem>>(null);
  useScrollToTop(listRef);
  const queryRef = useRef('');

  const { items, loading, refreshing, loadingMore, error, refresh, loadMore } = usePagedList<FollowSearchItem>({
    enabled: isLoggedIn && vmid > 0,
    fetchPage: async (page, cancelToken) => {
      const q = queryRef.current.trim();
      if (!q) return { items: [] as FollowSearchItem[], hasMore: false };
      const res = await userApi.followSearch({ vmid, name: q, pn: page, ps: 20 }, { cancelToken });
      const mapped: FollowSearchItem[] = (res?.data?.list || []).map((u: any) => ({
        mid: u.mid || 0,
        uname: u.uname || '',
        face: u.face || '',
        sign: u.sign || '',
      }));
      return { items: mapped, hasMore: mapped.length >= 20 };
    },
    onError: (e) => {
      console.error('follow search error:', e);
    },
  });

  const submit = useCallback((value?: string) => {
    queryRef.current = value ?? keyword;
    setTimeout(() => refresh(), 0);
  }, [keyword, refresh]);

  const renderItem = useCallback(
    ({ item, index }: { item: FollowSearchItem; index: number }) => (
      <>
        <Link href={{ pathname: '/member/[mid]', params: { mid: String(item.mid) } }} asChild>
          <Press haptic scaleTo={0.98} style={[styles.row, index < items.length - 1 && { borderBottomColor: colors.separator, borderBottomWidth: StyleSheet.hairlineWidth }]}>
            <ExpoImage source={{ uri: biliCover((item.face || ''), 96, 96) }} recyclingKey={item.face} cachePolicy="memory-disk" style={[styles.avatar, { backgroundColor: colors.fill2 }]} contentFit="cover" />
            <View style={styles.info}>
              <Text style={[T.subhead, styles.name, { color: colors.text }]} numberOfLines={1}>{item.uname}</Text>
              <Text style={[T.caption1, { color: colors.textSecondary }]} numberOfLines={1}>{item.sign || '这个人很懒'}</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={colors.quaternaryLabel} />
          </Press>
        </Link>
      </>
    ),
    [colors, items.length, T],
  );

  if (!isLoggedIn || !vmid) {
    return (
      <View style={[styles.root, { backgroundColor: colors.bg }]}>
        <Stack.Title large>关注搜索</Stack.Title>
        <Stack.Header blurEffect="systemMaterial" style={{ shadowColor: 'transparent' }} />
        <EmptyState
          icon="lock-closed-outline"
          title="请先登录"
          subtitle="登录后可使用关注搜索">
          <Press haptic scaleTo={0.94} onPress={() => router.push('/login' as any)} style={[styles.retryBtn, { backgroundColor: ACCENT }]}>
            <Text style={[T.subhead, styles.retryText]}>去登录</Text>
          </Press>
        </EmptyState>
      </View>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]}>
      <Stack.Title large>关注搜索</Stack.Title>
      <Stack.Header blurEffect="systemMaterial" style={{ shadowColor: 'transparent' }} />
      <Stack.SearchBar
        placeholder="搜索关注的 UP 主"
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
        keyExtractor={(it) => String(it.mid)}
        contentContainerStyle={[styles.listContent, items.length > 0 && { backgroundColor: colors.card, borderRadius: RADII.lg, marginHorizontal: 14, marginTop: 12, ...continuous, ...shadow('sm', colors.isDark) }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { feedBackMedium(); refresh(); }} tintColor={colors.textSecondary} />}
        onEndReached={loadMore}
        onEndReachedThreshold={0.4}
        estimatedItemSize={72}
        overrideItemLayout={rowLayout}
        drawDistance={250}
        overrideProps={{ initialDrawBatchSize: 10 }}
        ListFooterComponent={loadingMore ? <ActivityIndicator size="small" color={colors.textTertiary} style={{ marginVertical: 14 }} /> : null}
        ListEmptyComponent={
          loading ? null : error ? (
            <ErrorState title={typeof error === 'string' ? error : '加载失败'} onRetry={refresh} />
          ) : (
            <EmptyState icon="search-outline" title="输入昵称搜索关注" />
          )
        }
        renderItem={renderItem}
      />
      {loading && items.length === 0 && (
        <View style={[styles.skeletonCard, { backgroundColor: colors.card }]}>
          <SkeletonRow round />
          <SkeletonRow round />
          <SkeletonRow round />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  listContent: { paddingHorizontal: 16, paddingBottom: 40 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  avatar: { width: 48, height: 48, borderRadius: 24 },
  info: { flex: 1, gap: 3 },
  name: { fontWeight: '600' },
  retryBtn: { marginTop: 14, borderRadius: RADII.lg, paddingHorizontal: 30, paddingVertical: 10, ...continuous },
  retryText: { color: '#FFFFFF', fontWeight: '600' },
  skeletonCard: { position: 'absolute', top: 0, left: 14, right: 14, borderRadius: RADII.lg, paddingHorizontal: 16, paddingTop: 8, gap: 4, ...continuous },
});
