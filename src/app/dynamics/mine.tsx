import { useCallback, useRef } from 'react';
import { ActivityIndicator, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Link, Stack, useRouter, useScrollToTop } from 'expo-router';
import { Image as ExpoImage } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors, ACCENT } from '@/components/SwiftUIHost';
import { useType } from '@/components/type-scale';
import { useAuthStore } from '@/stores/auth';
import { userApi } from '@/api/user';
import { Press } from '@/components/motion';
import { usePagedList } from '@/hooks/use-paged-list';
import { formatTime } from '@/utils/format';
import { feedBackMedium } from '@/utils/feedback';
import { showToast } from '@/utils/toast';
import { RADII, continuous, shadow } from '@/theme/tokens';
import { biliCover } from '@/utils/image-url';

interface MyDynItem {
  id_str: string;
  type: string;
  text: string;
  pics: string[];
  authorName: string;
  authorFace: string;
  pubTs: number;
}

export default function MyDynamicsScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const T = useType();
  const { isLoggedIn, userInfo } = useAuthStore();
  const mid = userInfo?.mid || 0;
  const offsetRef = useRef('');
  const listRef = useRef<any>(null);
  useScrollToTop(listRef);

  const { items, loading, refreshing, loadingMore, refresh, loadMore } = usePagedList<MyDynItem>({
    enabled: isLoggedIn && mid > 0,
    fetchPage: async (page, cancelToken) => {
      const res = await userApi.dynamics({
        host_mid: mid,
        offset: page === 1 ? '' : offsetRef.current,
      }, { cancelToken });
      const list: MyDynItem[] = ((res?.data?.items || []) as any[]).map((d: any) => {
        const author = d.modules?.module_author || {};
        const dynamic = d.modules?.module_dynamic || {};
        const pics = (dynamic.major?.opus?.pics || dynamic.major?.draw?.items || []).map((p: any) => p?.src || p?.url || '');
        return {
          id_str: d.id_str || String(d.id || ''),
          type: d.type || '',
          text: dynamic.desc?.text || dynamic.major?.opus?.summary?.text || dynamic.major?.opus?.title || '',
          pics,
          authorName: author.name || userInfo?.name || '',
          authorFace: author.face || userInfo?.face || '',
          pubTs: Number(author.pub_ts || author.pub_time || 0),
        };
      });
      offsetRef.current = res?.data?.offset || '-1';
      return {
        items: list,
        hasMore: res?.data?.has_more !== false && offsetRef.current !== '-1' && list.length > 0,
      };
    },
    onError: (e) => {
      console.error('load my dynamics error:', e);
      showToast('动态加载失败');
    },
  });

  const renderRow = useCallback(
    ({ item, index }: { item: MyDynItem; index: number }) => {
      const row = (
        <Press
          haptic
          scaleTo={0.98}
          onPress={() => item.id_str ? router.push(`/dynamics/${item.id_str}` as any) : undefined}
          style={[styles.row, index > 0 && { borderTopColor: colors.separator, borderTopWidth: StyleSheet.hairlineWidth }]}>
          <ExpoImage
            source={{ uri: biliCover((item.authorFace || ''), 72, 72) }}
            recyclingKey={item.authorFace || ''}
            cachePolicy="memory-disk"
            style={[styles.avatar, { backgroundColor: colors.fill2 }]}
            contentFit="cover"
          />
          <View style={styles.body}>
            <View style={styles.metaRow}>
              <Text style={[T.footnote, styles.author, { color: colors.text }]} numberOfLines={1}>{item.authorName}</Text>
              <Text style={[T.caption2, { color: colors.textTertiary }]}>{formatTime(item.pubTs)}</Text>
            </View>
            <Text style={[T.subhead, styles.text, { color: colors.text }]} numberOfLines={3}>{item.text || '（无文字内容）'}</Text>
            {item.pics.length > 0 ? (
              <View style={styles.picRow}>
                {item.pics.slice(0, 3).map((uri, i) => (
                  <ExpoImage
                    key={`${uri}-${i}`}
                    source={{ uri: biliCover(uri, 160, 160) }}
                    recyclingKey={uri}
                    cachePolicy="memory-disk"
                    style={[styles.pic, { backgroundColor: colors.fill3 }]}
                    contentFit="cover"
                  />
                ))}
              </View>
            ) : null}
          </View>
          <Ionicons name="chevron-forward" size={16} color={colors.quaternaryLabel} />
        </Press>
      );
      return item.id_str ? (
        <Link href={`/dynamics/${item.id_str}` as any} asChild>{row}</Link>
      ) : row;
    },
    [colors, router, T],
  );

  if (!isLoggedIn) {
    return (
      <View style={[styles.root, { backgroundColor: colors.bg }]}>
        <Stack.Title large>我的动态</Stack.Title>
        <Stack.Header blurEffect="systemMaterial" style={{ shadowColor: 'transparent' }} />
        <View style={styles.emptyWrap}>
          <Text style={[T.headline, { color: colors.text }]}>请先登录</Text>
          <Press haptic scaleTo={0.94} onPress={() => router.push('/login' as any)} style={[styles.loginBtn, { backgroundColor: ACCENT }]}>
            <Text style={[T.subhead, styles.loginText]}>去登录</Text>
          </Press>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]}>
      <Stack.Title large>我的动态</Stack.Title>
      <Stack.Header blurEffect="systemMaterial" style={{ shadowColor: 'transparent' }} />
      <FlashList
        ref={listRef}
        data={items}
        keyExtractor={(it, idx) => `${it.id_str}-${idx}`}
        contentContainerStyle={[styles.listContent, items.length > 0 && { backgroundColor: colors.card, borderRadius: RADII.lg, marginHorizontal: 14, marginTop: 12, ...continuous, ...shadow('sm', colors.isDark) }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { feedBackMedium(); refresh(); }} tintColor={colors.textSecondary} />}
        onEndReached={loadMore}
        onEndReachedThreshold={0.4}
        estimatedItemSize={118}
        windowSize={9}
        initialNumToRender={10}
        maxToRenderPerBatch={12}
        drawDistance={250}
        overrideProps={{ initialDrawBatchSize: 10 }}
        ListFooterComponent={
          loadingMore ? <ActivityIndicator size="small" color={colors.textTertiary} style={{ marginVertical: 16 }} /> : null
        }
        ListEmptyComponent={
          loading ? null : (
            <View style={styles.emptyWrap}>
              <Ionicons name="albums-outline" size={38} color={colors.textTertiary} />
              <Text style={[T.headline, { color: colors.text }]}>还没有发布过动态</Text>
            </View>
          )
        }
        renderItem={renderRow}
      />
      {loading && items.length === 0 && (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="small" color={colors.textTertiary} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  listContent: { paddingBottom: 40 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 12 },
  avatar: { width: 42, height: 42, borderRadius: 21 },
  body: { flex: 1, gap: 5 },
  metaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  author: { flexShrink: 1, fontWeight: '600' },
  text: { lineHeight: 19 },
  picRow: { flexDirection: 'row', gap: 6 },
  pic: { width: 64, height: 64, borderRadius: 8 },
  emptyWrap: { alignItems: 'center', paddingTop: 110, gap: 12 },
  loginBtn: { borderRadius: RADII.lg, paddingHorizontal: 26, paddingVertical: 9, ...continuous },
  loginText: { color: '#FFFFFF', fontWeight: '600' },
  loadingWrap: { position: 'absolute', top: 60, left: 0, right: 0, alignItems: 'center' },
});
