/**
 * 文章 tab（对应 Flutter member_article）：封面 + 标题 + 发布时间 + 阅读/评论。
 * 点击打开对应专栏：uri 为 bilibili://article/{id} 时转为 read 页，
 * 其余 http(s) 直开（与 video/notes 的站外打开方式一致）。
 */
import { memo, useCallback } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useRouter } from 'expo-router';
import { Host, ProgressView } from '@expo/ui/swift-ui';
import { Image as ExpoImage } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { Press } from '@/components/motion';
import { useType } from '@/components/type-scale';
import { useThemeColors } from '@/components/SwiftUIHost';
import { userApi } from '@/api/user';
import { usePagedList } from '@/hooks/use-paged-list';
import type { NativeRequestCancelToken } from '@/utils/request-cancel';
import { SkeletonRow } from '@/components/Skeleton';
import { biliCover } from '@/utils/image-url';
import { formatCount } from '@/utils/format';
import { showToast } from '@/utils/toast';
import { RADII, continuous, shadow } from '@/theme/tokens';
import { TabEmpty, TabError, type MemberTabProps } from '@/components/member/tab-states';
import { openLink } from '@/utils/feedback';

interface ArticleItem {
  title: string;
  cover: string;
  view: number;
  reply: number;
  publishTimeText: string;
  uri: string;
}

/* ===== 文章行（memo：回收复用时不重建闭包） ===== */
const ArticleRow = memo(function ArticleRow({
  item,
  index,
  colors,
  T,
  onOpen,
}: {
  item: ArticleItem;
  index: number;
  colors: ReturnType<typeof useThemeColors>;
  T: ReturnType<typeof useType>;
  onOpen: (uri: string) => void;
}) {
  return (
    <>
      <Press
        haptic
        scaleTo={0.98}
        onPress={() => onOpen(item.uri)}
        style={StyleSheet.flatten([
          styles.card,
          { backgroundColor: colors.card, ...shadow('sm', colors.isDark) },
        ])}>
        {item.cover ? (
          <ExpoImage
            source={{ uri: biliCover(item.cover, 320, 200) }}
            recyclingKey={item.cover}
            cachePolicy="memory-disk"
            style={[styles.cover, { backgroundColor: colors.fill2 }]}
            contentFit="cover"
          />
        ) : null}
        <View style={styles.info}>
          <Text style={[T.subhead, styles.title, { color: colors.text }]} numberOfLines={2}>
            {item.title || '无标题'}
          </Text>
          <View style={styles.meta}>
            {item.publishTimeText ? (
              <Text style={[T.caption1, { color: colors.textTertiary }]} numberOfLines={1}>
                {item.publishTimeText}
              </Text>
            ) : null}
            <View style={styles.statRow}>
              <Ionicons name="eye-outline" size={12} color={colors.textTertiary} />
              <Text style={[T.caption1, { color: colors.textTertiary }]}>{formatCount(item.view)}</Text>
              <Ionicons name="chatbubble-outline" size={12} color={colors.textTertiary} />
              <Text style={[T.caption1, { color: colors.textTertiary }]}>{formatCount(item.reply)}</Text>
            </View>
          </View>
        </View>
      </Press>
    </>
  );
});

function articleUrl(uri: string): string | null {
  if (!uri) return null;
  if (uri.startsWith('http')) return uri;
  const m = /bilibili:\/\/article\/(\d+)/.exec(uri);
  return m ? `https://www.bilibili.com/read/cv${m[1]}` : null;
}

export default function ArticleTab({ mid, header, listRef }: MemberTabProps) {
  const colors = useThemeColors();
  const T = useType();
  const router = useRouter();

  const list = usePagedList<ArticleItem>({
    fetchPage: async (page, cancelToken?: NativeRequestCancelToken) => {
      const res = await userApi.spaceArticle({ mid, pn: page }, cancelToken ? { cancelToken } : undefined);
      const data = res?.data;
      const items = (data?.item ?? []).map((it: any) => ({
        title: it.title ?? '',
        cover: it.origin_image_urls?.[0] ?? '',
        view: it.stats?.view ?? 0,
        reply: it.stats?.reply ?? 0,
        publishTimeText: it.publish_time_text ?? '',
        uri: it.uri ?? '',
      }));
      const count = typeof data?.count === 'number' ? data.count : null;
      return { items, hasMore: count != null ? page * 10 < count : items.length >= 10 };
    },
    onError: (e) => {
      console.error('spaceArticle error:', e);
      showToast('文章加载失败');
    },
  });

  const openArticle = useCallback((uri: string) => {
    const url = articleUrl(uri);
    if (!url) {
      showToast('无法打开链接');
      return;
    }
    const m = /read\/cv(\d+)/.exec(url);
    if (m) {
      router.push({ pathname: '/article/[id]', params: { id: m[1] } } as any);
    } else {
      openLink(url);
    }
  }, [router]);

  const renderItem = useCallback(
    ({ item, index }: { item: ArticleItem; index: number }) => (
      <ArticleRow item={item} index={index} colors={colors} T={T} onOpen={openArticle} />
    ),
    [colors, T, openArticle],
  );

  const ItemSeparator = useCallback(() => <View style={{ height: 10 }} />, []);

  return (
    <FlashList
      ref={listRef}
      data={list.items}
      keyExtractor={(item, index) => item.uri || item.title || `art_${index}`}
      contentContainerStyle={styles.listContent}
      showsVerticalScrollIndicator={false}
      ListHeaderComponent={header}
      onEndReached={list.loadMore}
      onEndReachedThreshold={0.4}
      estimatedItemSize={110}
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
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <View key={i} style={styles.skelGap}>
                <SkeletonRow height={64} />
              </View>
            ))}
          </View>
        ) : list.error ? (
          <TabError message={list.error} onRetry={list.refresh} />
        ) : (
          <TabEmpty icon="document-text-outline" text="暂无文章" />
        )
      }
      renderItem={renderItem}
      ItemSeparatorComponent={ItemSeparator}
    />
  );
}

const styles = StyleSheet.create({
  listContent: { paddingHorizontal: 14, paddingTop: 12, paddingBottom: 40 },
  card: {
    flexDirection: 'row', gap: 10, borderRadius: RADII.card,
    padding: 10, overflow: 'hidden', ...continuous,
  },
  cover: { width: 110, height: 69, borderRadius: RADII.sm, ...continuous },
  info: { flex: 1, justifyContent: 'space-between', paddingVertical: 1 },
  title: { fontWeight: '600', lineHeight: 20 },
  meta: { gap: 5 },
  statRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  footer: { marginVertical: 18, alignItems: 'center' },
  skelGap: { marginBottom: 10 },
});

