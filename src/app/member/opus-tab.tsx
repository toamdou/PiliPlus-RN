/**
 * 作品 tab（对应 Flutter member_opus）：两列瀑布卡片，
 * 封面（按响应宽高比）+ 点赞数 + 正文；点击进入对应动态详情。
 * 分页：page + offset 游标（offset 由响应返回，翻页透传；刷新时重置）。
 */
import { memo, useCallback, useMemo, useRef } from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Host, ProgressView } from '@expo/ui/swift-ui';
import { Link } from 'expo-router';
import { Image as ExpoImage } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { Press } from '@/components/motion';
import { useType } from '@/components/type-scale';
import { useThemeColors } from '@/components/SwiftUIHost';
import { userApi } from '@/api/user';
import { usePagedList } from '@/hooks/use-paged-list';
import type { NativeRequestCancelToken } from '@/utils/request-cancel';
import { SkeletonCard } from '@/components/Skeleton';
import { biliCover } from '@/utils/image-url';
import { formatCount } from '@/utils/format';
import { showToast } from '@/utils/toast';
import { RADII, continuous, shadow } from '@/theme/tokens';
import { TabEmpty, TabError, type MemberTabProps } from '@/components/member/tab-states';

interface OpusItem {
  opusId: string;
  content: string;
  like: number;
  coverUrl: string;
  coverRatio: number;
}

const ROW_GAP = 12;

/** 封面高宽比，与 Flutter Cover.fromJson 一致（clamp 0.68 ~ 2.7） */
function clampRatio(height: number | null | undefined, width: number | null | undefined): number {
  if (!height || !width) return 1;
  return Math.min(Math.max(height / width, 0.68), 2.7);
}

/* ===== 作品行（memo：每行两卡片，回收复用时不重建闭包） ===== */
const OpusRow = memo(function OpusRow({
  row,
  index,
  colors,
  T,
}: {
  row: OpusItem[];
  index: number;
  colors: ReturnType<typeof useThemeColors>;
  T: ReturnType<typeof useType>;
}) {
  const { width: windowWidth } = useWindowDimensions();
  const cardW = (windowWidth - 14 * 2 - ROW_GAP) / 2;
  return (
    <>
      <View style={styles.row}>
        {row.map((it, idx) => (
          <Link key={`${idx}_${it.opusId}`} href={{ pathname: '/dynamics/[id]', params: { id: it.opusId } }} asChild>
            <Press
              haptic
              scaleTo={0.97}
              style={StyleSheet.flatten([
                styles.card,
                { width: cardW, backgroundColor: colors.card, ...shadow('sm', colors.isDark) },
              ])}>
              {it.coverUrl ? (
                <View>
                  <ExpoImage
                    source={{ uri: biliCover(it.coverUrl, 360) }}
                    recyclingKey={it.coverUrl}
                    cachePolicy="memory-disk"
                    style={[styles.cover, { aspectRatio: it.coverRatio, backgroundColor: colors.fill2 }]}
                    contentFit="cover"
                  />
                  <View style={styles.likeBadge}>
                    <Ionicons name="heart" size={11} color="#FFFFFF" />
                    <Text style={styles.likeText}>{formatCount(it.like)}</Text>
                  </View>
                </View>
              ) : null}
              {it.content ? (
                <Text
                  style={[T.footnote, styles.content, { color: colors.text }]}
                  numberOfLines={it.coverUrl ? 4 : 6}>
                  {it.content}
                </Text>
              ) : null}
            </Press>
          </Link>
        ))}
      </View>
    </>
  );
});

export default function OpusTab({ mid, header, listRef }: MemberTabProps) {
  const colors = useThemeColors();
  const T = useType();
  const { width: windowWidth } = useWindowDimensions();
  const cardW = (windowWidth - 14 * 2 - ROW_GAP) / 2;
  const offsetRef = useRef('');

  const list = usePagedList<OpusItem>({
    fetchPage: async (page, cancelToken?: NativeRequestCancelToken) => {
      if (page === 1) offsetRef.current = '';
      const res = await userApi.spaceOpus({ host_mid: mid, page, offset: offsetRef.current, type: 'all' }, cancelToken ? { cancelToken } : undefined);
      const data = res?.data;
      offsetRef.current = data?.offset ?? '';
      return {
        items: (data?.items ?? []).map((it: any) => ({
          opusId: String(it.opus_id ?? ''),
          content: it.content ?? '',
          like: Number(it.stat?.like) || 0,
          coverUrl: it.cover?.url ?? '',
          coverRatio: clampRatio(it.cover?.height, it.cover?.width),
        })),
        hasMore: data?.has_more === true,
      };
    },
    onError: (e) => {
      console.error('spaceOpus error:', e);
      showToast('作品加载失败');
    },
  });

  /* 两两成行：行内两卡片高度各自独立（封面比例不同），单列 FlashList 支持变高 */
  const rows = useMemo(() => {
    const out: OpusItem[][] = [];
    for (let i = 0; i < list.items.length; i += 2) out.push(list.items.slice(i, i + 2));
    return out;
  }, [list.items]);

  const renderRow = useCallback(
    ({ item, index }: { item: OpusItem[]; index: number }) => (
      <OpusRow row={item} index={index} colors={colors} T={T} />
    ),
    [colors, T],
  );

  const ItemSeparator = useCallback(() => <View style={{ height: ROW_GAP }} />, []);

  return (
    <FlashList
      ref={listRef}
      data={rows}
      keyExtractor={(row, index) => `${index}_${row.map((it) => it.opusId).join('_') || 'row'}`}
      contentContainerStyle={styles.listContent}
      showsVerticalScrollIndicator={false}
      ListHeaderComponent={header}
      onEndReached={list.loadMore}
      onEndReachedThreshold={0.4}
      estimatedItemSize={220}
      drawDistance={250}
      overrideProps={{ initialDrawBatchSize: 10 }}
      onRefresh={list.refresh}
      refreshing={list.refreshing}
      ListFooterComponent={
        list.loadingMore ? (
          <View style={styles.footer}>
            <Host matchContents><ProgressView /></Host>
          </View>
        ) : null
      }
      ListEmptyComponent={
        list.loading ? (
          <View>
            {[0, 1, 2].map((i) => (
              <View key={i} style={styles.row}>
                <View style={[styles.skelWrap, { width: cardW }]}><SkeletonCard height={150} /></View>
                <View style={[styles.skelWrap, { width: cardW }]}><SkeletonCard height={150} /></View>
              </View>
            ))}
          </View>
        ) : list.error ? (
          <TabError message={list.error} onRetry={list.refresh} />
        ) : (
          <TabEmpty icon="images-outline" text="暂无作品" />
        )
      }
      renderItem={renderRow}
      ItemSeparatorComponent={ItemSeparator}
    />
  );
}

const styles = StyleSheet.create({
  listContent: { paddingHorizontal: 14, paddingTop: 12, paddingBottom: 40 },
  row: { flexDirection: 'row', gap: ROW_GAP },
  card: { borderRadius: RADII.card, overflow: 'hidden', ...continuous },
  cover: { width: '100%' },
  likeBadge: {
    position: 'absolute', left: 8, bottom: 8,
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 6,
    paddingHorizontal: 6, paddingVertical: 2,
  },
  likeText: { color: '#FFFFFF', fontSize: 10.5, fontWeight: '600' },
  content: { paddingHorizontal: 10, paddingVertical: 8, lineHeight: 19 },
  footer: { marginVertical: 18, alignItems: 'center' },
  skelWrap: {},
});

