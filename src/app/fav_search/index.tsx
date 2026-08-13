import { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, RefreshControl, ActivityIndicator } from 'react-native';
import { FlashList, FlashListRef } from '@shopify/flash-list';
import { Stack, useLocalSearchParams, Link, useRouter, useScrollToTop } from 'expo-router';
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
import { feedBackMedium, feedBackSelection } from '@/utils/feedback';
import { formatCount, formatDuration } from '@/utils/format';
import { showToast } from '@/utils/toast';
import { fixedItemLayout } from '@/utils/list-layout';
import { biliCover } from '@/utils/image-url';
import EmptyState from '@/components/EmptyState';
import ErrorState from '@/components/ErrorState';

const rowLayout = fixedItemLayout(112);

interface FavFolder {
  id: number;
  title: string;
  media_count: number;
}

interface SearchItem {
  id: number;
  title: string;
  cover: string;
  duration: number;
  upper: string;
  play: number;
  danmaku: number;
  bvid: string;
  type: number;
}

export default function FavSearchScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ mediaId?: string; title?: string }>();
  const colors = useThemeColors();
  const T = useType();
  const { userInfo, isLoggedIn } = useAuthStore();
  const paramId = parseInt(params.mediaId || '', 10);
  const [folderId, setFolderId] = useState<number | null>(Number.isNaN(paramId) ? null : paramId);
  const [folders, setFolders] = useState<FavFolder[]>([]);
  const [keyword, setKeyword] = useState('');
  const listRef = useRef<FlashListRef<SearchItem>>(null);
  useScrollToTop(listRef);
  const folderIdRef = useRef(folderId);
  const queryRef = useRef('');

  const loadFolders = useCallback(async () => {
    if (!userInfo) return;
    try {
      const res = await favApi.folderList({ up_mid: userInfo.mid, pn: 1, ps: 50 });
      setFolders((res?.data?.list || []).map((f: any) => ({
        id: f.id,
        title: f.title,
        media_count: f.media_count || 0,
      })));
    } catch {
      showToast('收藏夹加载失败');
    }
  }, [userInfo]);

  const { items, loading, refreshing, loadingMore, error, refresh, loadMore, setItems } = usePagedList<SearchItem>({
    enabled: isLoggedIn && folderId != null,
    fetchPage: async (page, cancelToken) => {
      const fid = folderIdRef.current;
      if (!fid) return { items: [] as SearchItem[], hasMore: false };
      const res = await favApi.resourceList({
        media_id: fid,
        pn: page,
        ps: 20,
        keyword: queryRef.current.trim() || undefined,
      }, { cancelToken });
      const mapped: SearchItem[] = (res?.data?.medias || []).map((m: any) => ({
        id: m.id,
        title: m.title || '',
        cover: m.cover || '',
        duration: m.duration || 0,
        upper: m.upper?.name || '',
        play: m.cnt_info?.play || 0,
        danmaku: m.cnt_info?.danmaku || 0,
        bvid: m.bvid || m.bv_id || '',
        type: m.type || 2,
      }));
      return { items: mapped, hasMore: res?.data?.has_more !== false };
    },
    onError: (e) => {
      console.error('fav search error:', e);
    },
  });

  useEffect(() => {
    const t = setTimeout(() => {
      if (isLoggedIn) loadFolders();
    }, 0);
    return () => clearTimeout(t);
  }, [isLoggedIn, loadFolders]);

  const selectFolder = useCallback((id: number) => {
    feedBackSelection();
    folderIdRef.current = id;
    setFolderId(id);
    setItems([]);
    setTimeout(() => refresh(), 0);
  }, [refresh, setItems]);

  const submit = useCallback((value?: string) => {
    if (!folderIdRef.current) { showToast('请先选择收藏夹'); return; }
    queryRef.current = value ?? keyword;
    setItems([]);
    setTimeout(() => refresh(), 0);
  }, [keyword, refresh, setItems]);

  const renderItem = useCallback(
    ({ item, index }: { item: SearchItem; index: number }) => {
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
            <Text style={[T.caption1, { color: colors.textSecondary }]} numberOfLines={1}>{item.upper}</Text>
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

  if (!isLoggedIn) {
    return (
      <View style={[styles.root, { backgroundColor: colors.bg }]}>
        <Stack.Title large>收藏搜索</Stack.Title>
        <Stack.Header blurEffect="systemMaterial" style={{ shadowColor: 'transparent' }} />
        <EmptyState
          icon="lock-closed-outline"
          title="请先登录"
          subtitle="登录后可使用收藏搜索">
          <Press haptic scaleTo={0.94} onPress={() => router.push('/login' as any)} style={[styles.loginBtn, { backgroundColor: ACCENT }]}>
            <Text style={[T.subhead, styles.loginText]}>去登录</Text>
          </Press>
        </EmptyState>
      </View>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]}>
      <Stack.Title large>收藏搜索</Stack.Title>
      <Stack.Header blurEffect="systemMaterial" style={{ shadowColor: 'transparent' }} />
      <View style={styles.toolbar}>
        {folders.length > 0 && (
          <View style={styles.folderRow}>
            {folders.map((f) => (
              <Press
                key={f.id}
                haptic
                scaleTo={0.94}
                onPress={() => selectFolder(f.id)}
                style={[styles.folderChip, { backgroundColor: folderId === f.id ? ACCENT : colors.fill2 }]}>
                <Text style={[T.caption1, { color: folderId === f.id ? '#FFFFFF' : colors.textSecondary, fontWeight: folderId === f.id ? '700' : '500' }]} numberOfLines={1}>
                  {f.title}
                </Text>
              </Press>
            ))}
          </View>
        )}
      </View>
      <Stack.SearchBar
        placeholder={folderId ? '搜索收藏内容' : '先选择收藏夹'}
        autoCapitalize="none"
        onChangeText={(e: any) => setKeyword(typeof e === 'string' ? e : e?.nativeEvent?.text ?? '')}
        onSearchButtonPress={(e: any) => submit(typeof e === 'string' ? e : e?.nativeEvent?.text ?? keyword)}
        tintColor={folderId ? ACCENT : colors.textTertiary}
        textColor={colors.text}
        hintTextColor={colors.textTertiary}
        headerIconColor={colors.textSecondary}
      />
      <FlashList
        ref={listRef}
        data={items}
        keyExtractor={(it) => String(it.id)}
        contentContainerStyle={[styles.listContent, items.length > 0 && { backgroundColor: colors.card, borderRadius: RADII.lg, marginHorizontal: 14, marginTop: 12, ...continuous, ...shadow('sm', colors.isDark) }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { feedBackMedium(); refresh(); }} tintColor={colors.textSecondary} />}
        onEndReached={loadMore}
        onEndReachedThreshold={0.4}
        estimatedItemSize={112}
        overrideItemLayout={rowLayout}
        drawDistance={250}
        overrideProps={{ initialDrawBatchSize: 10 }}
        ListFooterComponent={loadingMore ? <ActivityIndicator size="small" color={colors.textTertiary} style={{ marginVertical: 14 }} /> : null}
        ListEmptyComponent={
          loading ? null : error ? (
            <ErrorState title={typeof error === 'string' ? error : '加载失败'} onRetry={refresh} />
          ) : (
            <EmptyState
              icon="search-outline"
              title={folderId ? (keyword ? '没有匹配的收藏' : '暂无收藏内容') : '请选择收藏夹'}
            />
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
  toolbar: { gap: 10, paddingHorizontal: 14, paddingTop: 10 },
  folderRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  folderChip: { maxWidth: '48%', paddingHorizontal: 12, paddingVertical: 7, borderRadius: RADII.circle, ...continuous },
  listContent: { paddingHorizontal: 16, paddingBottom: 40 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  coverWrap: { position: 'relative' },
  cover: { width: 140, height: 88, borderRadius: RADII.sm, ...continuous },
  durationBadge: { position: 'absolute', bottom: 5, right: 5, backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 5, paddingHorizontal: 5, paddingVertical: 1.5 },
  durationText: { color: '#FFFFFF', fontSize: 10.5, fontWeight: '600' },
  info: { flex: 1, gap: 5, justifyContent: 'center' },
  title: { fontWeight: '600' },
  statRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  loginBtn: { marginTop: 14, borderRadius: RADII.lg, paddingHorizontal: 30, paddingVertical: 10, ...continuous },
  loginText: { color: '#FFFFFF', fontWeight: '600' },
  skeletonCard: { position: 'absolute', top: 0, left: 14, right: 14, borderRadius: RADII.lg, paddingHorizontal: 16, paddingTop: 8, gap: 4, ...continuous },
});
