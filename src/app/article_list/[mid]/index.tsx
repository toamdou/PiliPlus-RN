import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Stack, Link, useLocalSearchParams } from 'expo-router';
import { Image as ExpoImage } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors, ACCENT } from '@/components/SwiftUIHost';
import { Press } from '@/components/motion';
import { useType } from '@/components/type-scale';
import { dynamicsApi } from '@/api/dynamics';
import { userApi } from '@/api/user';
import { formatCount, formatDate } from '@/utils/format';
import { feedBackMedium } from '@/utils/feedback';
import { RADII, continuous, shadow } from '@/theme/tokens';
import { biliCover } from '@/utils/image-url';

interface ArticleHit {
  id: number;
  title: string;
  cover: string;
  summary: string;
  view: number;
  reply: number;
  like: number;
}

interface ListMeta {
  id: number;
  name: string;
  imageUrl: string;
  updateTime: number;
  words: number;
  read: number;
  articlesCount: number;
  authorMid: number;
  authorName: string;
  authorFace: string;
}

const ArticleRow = ({ item, index, colors, T }: {
  item: ArticleHit;
  index: number;
  colors: ReturnType<typeof useThemeColors>;
  T: ReturnType<typeof useType>;
}) => (
  <View>
    <Link href={{ pathname: '/article/[id]', params: { id: String(item.id) } } as any} asChild>
      <Press haptic scaleTo={0.98} style={[styles.card, { backgroundColor: colors.card, ...shadow('sm', colors.isDark) }]}>
        {item.cover ? (
          <ExpoImage
            source={{ uri: biliCover(item.cover, 160, 100) }}
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
          {item.summary ? (
            <Text style={[T.footnote, styles.summary, { color: colors.textSecondary }]} numberOfLines={2}>
              {item.summary}
            </Text>
          ) : null}
          <View style={styles.statRow}>
            <Ionicons name="eye-outline" size={12} color={colors.textTertiary} />
            <Text style={[T.caption1, { color: colors.textTertiary }]}>{formatCount(item.view)}</Text>
            <Ionicons name="heart-outline" size={11} color={colors.textTertiary} />
            <Text style={[T.caption1, { color: colors.textTertiary }]}>{formatCount(item.like)}</Text>
            <Ionicons name="chatbubble-outline" size={11} color={colors.textTertiary} />
            <Text style={[T.caption1, { color: colors.textTertiary }]}>{formatCount(item.reply)}</Text>
          </View>
        </View>
      </Press>
    </Link>
  </View>
);

function extractArticleId(it: any): number {
  const raw = Number(it?.id);
  if (Number.isFinite(raw) && raw > 0) return raw;
  const uri = String(it?.uri ?? '');
  const slash = /(?:cv|article)\/(\d+)/i.exec(uri);
  if (slash) return Number(slash[1]);
  const compact = /(?:cv|article)(\d+)/i.exec(uri);
  return compact ? Number(compact[1]) : 0;
}

export default function ArticleListScreen() {
  const { mid } = useLocalSearchParams<{ mid: string }>();
  const colors = useThemeColors();
  const T = useType();
  const listId = Number(mid);
  const [meta, setMeta] = useState<ListMeta | null>(null);
  const [items, setItems] = useState<ArticleHit[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const res = await dynamicsApi.articleList({ id: listId, sort: 'publish_time' });
      const data = res?.data;
      const hasListData = res?.code === 0 && (data?.list || Array.isArray(data?.articles));
      if (!hasListData) {
        const fallback = await userApi.spaceArticle({ mid: listId });
        if (fallback?.code !== 0) {
          setError(fallback?.message || res?.message || '加载失败');
          return;
        }
        const fd = fallback?.data;
        setMeta({
          id: listId,
          name: 'TA 的专栏',
          imageUrl: '',
          updateTime: 0,
          words: 0,
          read: 0,
          articlesCount: fd?.count ?? 0,
          authorMid: listId,
          authorName: '',
          authorFace: '',
        });
        setItems((fd?.item ?? []).map((a: any) => ({
          id: extractArticleId(a),
          title: a?.title ?? '',
          cover: a?.origin_image_urls?.[0] ?? a?.image_urls?.[0] ?? '',
          summary: a?.summary ?? '',
          view: a?.stats?.view ?? 0,
          reply: a?.stats?.reply ?? 0,
          like: a?.stats?.like ?? 0,
        })));
        return;
      }
      const list = data?.list;
      setMeta({
        id: list?.id ?? listId,
        name: list?.name ?? '',
        imageUrl: list?.image_url ?? '',
        updateTime: list?.update_time ?? 0,
        words: list?.words ?? 0,
        read: list?.read ?? 0,
        articlesCount: list?.articles_count ?? 0,
        authorMid: data?.author?.mid ?? 0,
        authorName: data?.author?.name ?? '',
        authorFace: data?.author?.face ?? '',
      });
      setItems((data?.articles ?? []).map((a: any) => ({
        id: a?.id ?? 0,
        title: a?.title ?? '',
        cover: a?.image_urls?.[0] ?? '',
        summary: a?.summary ?? '',
        view: a?.stats?.view ?? 0,
        reply: a?.stats?.reply ?? 0,
        like: a?.stats?.like ?? 0,
      })));
    } catch (e) {
      console.error('article list error:', e);
      setError('加载失败，请重试');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [listId]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void load();
    }, 0);
    return () => clearTimeout(timer);
  }, [load]);

  const renderItem = useCallback(
    ({ item, index }: { item: ArticleHit; index: number }) => (
      <ArticleRow item={item} index={index} colors={colors} T={T} />
    ),
    [colors, T],
  );

  const ItemSeparator = useCallback(() => <View style={{ height: 10 }} />, []);

  const header = useMemo(() => {
    if (!meta) return null;
    return (
      <View style={styles.header}>
        <View style={[styles.metaCard, { backgroundColor: colors.card, ...shadow('sm', colors.isDark) }]}>
          <View style={styles.metaRow}>
            {meta.imageUrl ? (
              <ExpoImage
                source={{ uri: biliCover(meta.imageUrl, 160, 100) }}
                recyclingKey={meta.imageUrl}
                cachePolicy="memory-disk"
                style={[styles.metaCover, { backgroundColor: colors.fill2 }]}
                contentFit="cover"
              />
            ) : null}
            <View style={styles.metaInfo}>
              <Text style={[T.headline, styles.metaName, { color: colors.text }]} numberOfLines={2}>
                {meta.name || '专栏合集'}
              </Text>
              <Text style={[T.caption1, { color: colors.textTertiary }]}>
                {meta.articlesCount ? `${formatCount(meta.articlesCount)} 篇` : ''}
                {meta.words ? ` · ${formatCount(meta.words)} 字` : ''}
                {meta.read ? ` · ${formatCount(meta.read)} 阅读` : ''}
              </Text>
              {meta.updateTime ? (
                <Text style={[T.caption2, { color: colors.textTertiary }]}>{formatDate(meta.updateTime)} 更新</Text>
              ) : null}
            </View>
          </View>
          {meta.authorMid > 0 ? (
            <Link href={{ pathname: '/member/[mid]', params: { mid: String(meta.authorMid) } }} asChild>
              <Press haptic scaleTo={0.96} style={[styles.authorRow, { borderTopColor: colors.separator }]}>
                {meta.authorFace ? (
                  <ExpoImage
                    source={{ uri: biliCover(meta.authorFace, 96, 96) }}
                    recyclingKey={meta.authorFace}
                    cachePolicy="memory-disk"
                    style={[styles.authorAvatar, { backgroundColor: colors.fill2 }]}
                    contentFit="cover"
                  />
                ) : (
                  <View style={[styles.authorAvatar, { backgroundColor: colors.fill2 }]}>
                    <Ionicons name="person" size={18} color={colors.textTertiary} />
                  </View>
                )}
                <Text style={[T.subhead, styles.authorName, { color: colors.text }]} numberOfLines={1}>
                  {meta.authorName || 'UP主'}
                </Text>
                <Ionicons name="chevron-forward" size={16} color={colors.quaternaryLabel} />
              </Press>
            </Link>
          ) : null}
        </View>
      </View>
    );
  }, [meta, colors, T]);

  const emptyContent = useMemo(() => {
    if (loading) {
      return (
        <View style={styles.emptyWrap}>
          <ActivityIndicator size="small" color={colors.textTertiary} />
        </View>
      );
    }
    if (error) {
      return (
        <View style={styles.emptyWrap}>
          <Ionicons name="cloud-offline-outline" size={38} color={colors.textTertiary} />
          <Text style={[T.headline, styles.emptyTitle, { color: colors.text }]}>{error}</Text>
          <Press haptic scaleTo={0.94} onPress={() => void load(true)} style={[styles.retryBtn, { backgroundColor: colors.card }]}>
            <Text style={[T.subhead, styles.retryText, { color: ACCENT }]}>重试</Text>
          </Press>
        </View>
      );
    }
    return (
      <View style={styles.emptyWrap}>
        <Ionicons name="document-text-outline" size={38} color={colors.textTertiary} />
        <Text style={[T.headline, styles.emptyTitle, { color: colors.text }]}>暂无文章</Text>
      </View>
    );
  }, [loading, error, colors, T, load]);

  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]}>
      <Stack.Screen options={{ title: meta?.name || '专栏合集', headerBackButtonDisplayMode: 'minimal' }} />
      <Stack.Header blurEffect="systemMaterial" style={{ shadowColor: 'transparent' }} />
      <FlashList
        data={items}
        keyExtractor={(item, index) => String(item.id || `art_${index}`)}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={header}
        renderItem={renderItem}
        ItemSeparatorComponent={ItemSeparator}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              feedBackMedium();
              void load(true);
            }}
            tintColor={colors.textSecondary}
          />
        }
        ListEmptyComponent={emptyContent}
        estimatedItemSize={112}
        windowSize={9}
        initialNumToRender={10}
        maxToRenderPerBatch={12}
        drawDistance={250}
        overrideProps={{ initialDrawBatchSize: 10 }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  listContent: { paddingHorizontal: 14, paddingTop: 12, paddingBottom: 40 },
  header: { marginBottom: 12 },
  metaCard: { borderRadius: RADII.card, padding: 12, ...continuous },
  metaRow: { flexDirection: 'row', gap: 12 },
  metaCover: { width: 104, height: 68, borderRadius: RADII.sm, ...continuous },
  metaInfo: { flex: 1, justifyContent: 'center', gap: 5 },
  metaName: { fontWeight: '700' },
  authorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  authorAvatar: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  authorName: { flex: 1, fontWeight: '500' },
  card: {
    flexDirection: 'row',
    gap: 10,
    borderRadius: RADII.card,
    padding: 10,
    overflow: 'hidden',
    ...continuous,
  },
  cover: { width: 110, height: 69, borderRadius: RADII.sm, ...continuous },
  info: { flex: 1, justifyContent: 'space-between', paddingVertical: 1 },
  title: { fontWeight: '600', lineHeight: 20 },
  summary: { lineHeight: 17, marginTop: 2 },
  statRow: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 4 },
  emptyWrap: { alignItems: 'center', paddingTop: 80, gap: 8 },
  emptyTitle: { fontWeight: '600' },
  retryBtn: { marginTop: 10, borderRadius: RADII.lg, paddingHorizontal: 28, paddingVertical: 9, ...continuous },
  retryText: { fontWeight: '600' },
});
