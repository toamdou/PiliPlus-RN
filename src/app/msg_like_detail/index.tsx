import { useCallback, useRef, useState } from 'react';
import { View, Text, StyleSheet, RefreshControl, ActivityIndicator } from 'react-native';
import { FlashList, FlashListRef } from '@shopify/flash-list';
import { Stack, useLocalSearchParams, Link, useRouter, useScrollToTop } from 'expo-router';
import { Image as ExpoImage } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors, ACCENT } from '@/components/SwiftUIHost';
import { msgApi } from '@/api/msg';
import { usePagedList } from '@/hooks/use-paged-list';
import { SkeletonRow } from '@/components/Skeleton';
import { Press } from '@/components/motion';
import { useType } from '@/components/type-scale';
import { RADII, continuous, shadow } from '@/theme/tokens';
import { feedBackMedium, openInAppBrowser } from '@/utils/feedback';
import { fixedItemLayout } from '@/utils/list-layout';
import { av2bv } from '@/utils/id-utils';
import { formatTime } from '@/utils/format';
import { biliCover } from '@/utils/image-url';

const rowLayout = fixedItemLayout(70);

interface LikeUser {
  mid: number;
  nickname: string;
  avatar: string;
}

interface LikeItem {
  user: LikeUser;
  likeTime: number;
}

interface LikeCard {
  business: string;
  title: string;
}

export default function MsgLikeDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ card_id: string; uri?: string; counts?: string }>();
  const colors = useThemeColors();
  const T = useType();
  const cardId = params.card_id || '';
  const uri = params.uri || '';
  const counts = parseInt(params.counts || '0', 10) || 0;
  const [card, setCard] = useState<LikeCard | null>(null);
  const listRef = useRef<FlashListRef<LikeItem>>(null);
  useScrollToTop(listRef);
  const lastMidRef = useRef(0);

  const { items, loading, refreshing, loadingMore, error, refresh, loadMore } = usePagedList<LikeItem>({
    enabled: !!cardId,
    fetchPage: async (page, cancelToken) => {
      const res = await msgApi.likeDetail({ card_id: cardId, pn: page, last_mid: page === 1 ? 0 : lastMidRef.current }, { cancelToken });
      const data = res?.data || {};
      if (data.card) {
        setCard({
          business: data.card.business || '',
          title: data.card.title || '',
        });
      }
      const mapped: LikeItem[] = (data.items || []).map((i: any) => ({
        user: {
          mid: i.user?.mid || 0,
          nickname: i.user?.nickname || '',
          avatar: i.user?.avatar || '',
        },
        likeTime: i.like_time || 0,
      }));
      const last = mapped[mapped.length - 1];
      if (last?.user?.mid) lastMidRef.current = last.user.mid;
      return { items: mapped, hasMore: data.page?.is_end !== true && mapped.length > 0 };
    },
    onError: (e) => {
      console.error('like detail error:', e);
    },
  });

  const openCard = useCallback(() => {
    if (!uri) return;
    const video = /bilibili:\/\/video\/(\d+)/.exec(uri);
    if (video) { router.push(`/video/${av2bv(Number(video[1]))}` as any); return; }
    const season = /bilibili:\/\/bangumi\/season\/(\d+)/.exec(uri);
    if (season) { router.push(`/pgc/${season[1]}` as any); return; }
    const live = /bilibili:\/\/live\/(\d+)/.exec(uri);
    if (live) { router.push({ pathname: '/live/[roomId]', params: { roomId: live[1] } } as any); return; }
    const article = /bilibili:\/\/article\/(\d+)/.exec(uri);
    if (article) {
      openInAppBrowser(`https://www.bilibili.com/read/cv${article[1]}`).catch(() => {});
      return;
    }
    if (uri.startsWith('http')) {
      openInAppBrowser(uri).catch(() => {});
    }
  }, [router, uri]);

  const renderItem = useCallback(
    ({ item, index }: { item: LikeItem; index: number }) => {
      const row = (
        <Press haptic scaleTo={0.98} style={[styles.row, index < items.length - 1 && { borderBottomColor: colors.separator, borderBottomWidth: StyleSheet.hairlineWidth }]}>
          <ExpoImage source={{ uri: biliCover((item.user.avatar || ''), 96, 96) }} recyclingKey={item.user.avatar} cachePolicy="memory-disk" style={[styles.avatar, { backgroundColor: colors.fill2 }]} contentFit="cover" />
          <View style={styles.info}>
            <View style={styles.nameRow}>
              <Text style={[T.subhead, styles.name, { color: ACCENT }]} numberOfLines={1}>{item.user.nickname || '用户'}</Text>
              <Text style={[T.footnote, { color: colors.textSecondary }]}>赞了我</Text>
            </View>
            <Text style={[T.caption1, { color: colors.textTertiary }]}>{formatTime(item.likeTime)}</Text>
          </View>
        </Press>
      );
      return (
        <View>
          {item.user.mid ? <Link href={{ pathname: '/member/[mid]', params: { mid: String(item.user.mid) } }} asChild>{row}</Link> : row}
        </View>
      );
    },
    [colors, items.length, T],
  );

  if (!cardId) {
    return (
      <View style={[styles.root, { backgroundColor: colors.bg }]}>
        <Stack.Title large>点赞详情</Stack.Title>
        <Stack.Header blurEffect="systemMaterial" style={{ shadowColor: 'transparent' }} />
        <View style={styles.emptyWrap}>
          <Text style={[T.headline, { color: colors.text }]}>缺少赞详情参数</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]}>
      <Stack.Title large>点赞详情</Stack.Title>
      <Stack.Header blurEffect="systemMaterial" style={{ shadowColor: 'transparent' }} />
      <FlashList
        ref={listRef}
        data={items}
        keyExtractor={(it, idx) => `${it.user.mid}-${idx}`}
        ListHeaderComponent={
          card ? (
            <Press
              haptic
              scaleTo={0.98}
              onPress={uri ? openCard : undefined}
              style={[styles.cardHeader, { backgroundColor: colors.card, ...shadow('sm', colors.isDark) }]}>
              <View style={[styles.cardIcon, { backgroundColor: 'rgba(251,114,153,0.12)' }]}>
                <Ionicons name="heart" size={18} color={ACCENT} />
              </View>
              <View style={styles.cardInfo}>
                <Text style={[T.footnote, { color: colors.textTertiary }]} numberOfLines={1}>{card.business || '内容'}</Text>
                <Text style={[T.subhead, styles.cardTitle, { color: colors.text }]} numberOfLines={2}>{card.title || '查看内容'}</Text>
              </View>
              {counts > 0 ? (
                <View style={[styles.countPill, { backgroundColor: colors.fill2 }]}>
                  <Text style={[T.caption2, { color: colors.textSecondary }]}>{counts} 人赞过</Text>
                </View>
              ) : null}
            </Press>
          ) : null
        }
        contentContainerStyle={[styles.listContent, items.length > 0 && { backgroundColor: colors.card, borderRadius: RADII.lg, marginHorizontal: 14, marginTop: 12, ...continuous, ...shadow('sm', colors.isDark) }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { feedBackMedium(); refresh(); }} tintColor={colors.textSecondary} />}
        onEndReached={loadMore}
        onEndReachedThreshold={0.4}
        estimatedItemSize={70}
        overrideItemLayout={rowLayout}
        windowSize={9}
        initialNumToRender={10}
        maxToRenderPerBatch={12}
        drawDistance={250}
        overrideProps={{ initialDrawBatchSize: 10 }}
        ListFooterComponent={loadingMore ? <ActivityIndicator size="small" color={colors.textTertiary} style={{ marginVertical: 14 }} /> : null}
        ListEmptyComponent={
          loading ? null : error ? (
            <View style={styles.emptyWrap}>
              <View style={[styles.emptyIconBox, { backgroundColor: colors.fill2 }]}>
                <Ionicons name="cloud-offline-outline" size={38} color={colors.textTertiary} />
              </View>
              <Text style={[T.headline, { color: colors.text }]}>{error}</Text>
              <Press haptic scaleTo={0.94} onPress={refresh} style={[styles.retryBtn, { backgroundColor: ACCENT }]}>
                <Text style={[T.subhead, styles.retryText]}>重试</Text>
              </Press>
            </View>
          ) : (
            <View style={styles.emptyWrap}>
              <View style={[styles.emptyIconBox, { backgroundColor: colors.fill2 }]}>
                <Ionicons name="heart-outline" size={38} color={colors.textTertiary} />
              </View>
              <Text style={[T.headline, { color: colors.text }]}>暂无点赞记录</Text>
            </View>
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
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: RADII.lg, marginBottom: 12, ...continuous },
  cardIcon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  cardInfo: { flex: 1, gap: 3 },
  cardTitle: { fontWeight: '600' },
  countPill: { borderRadius: RADII.circle, paddingHorizontal: 10, paddingVertical: 5, ...continuous },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  avatar: { width: 46, height: 46, borderRadius: 23 },
  info: { flex: 1, gap: 3 },
  nameRow: { flexDirection: 'row', alignItems: 'baseline', gap: 5 },
  name: { fontWeight: '600' },
  emptyWrap: { alignItems: 'center', justifyContent: 'center', paddingTop: 100, paddingHorizontal: 40, gap: 8 },
  emptyIconBox: { width: 84, height: 84, borderRadius: 42, justifyContent: 'center', alignItems: 'center', marginBottom: 8 },
  retryBtn: { marginTop: 14, borderRadius: RADII.lg, paddingHorizontal: 30, paddingVertical: 10, ...continuous },
  retryText: { color: '#FFFFFF', fontWeight: '600' },
  skeletonCard: { position: 'absolute', top: 12, left: 14, right: 14, borderRadius: RADII.lg, paddingHorizontal: 16, paddingTop: 8, gap: 4, ...continuous },
});
