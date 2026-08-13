/**
 * 商店 tab（对应 Flutter member_shop）：两列商品卡片（方形封面 + 标题 + 标签 + 价格/优惠）。
 * 接口无翻页参数（pageSize=8 单页），hasMore 恒 false。
 * 点击打开商品页（应用内 WebView，对齐 Flutter /webview）。
 */
import { memo, useCallback, useMemo } from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { FlashList } from '@shopify/flash-list';
import { Host, ProgressView } from '@expo/ui/swift-ui';
import { Image as ExpoImage } from 'expo-image';
import { Press } from '@/components/motion';
import { useType } from '@/components/type-scale';
import { useThemeColors, ACCENT } from '@/components/SwiftUIHost';
import { userApi } from '@/api/user';
import { usePagedList } from '@/hooks/use-paged-list';
import type { NativeRequestCancelToken } from '@/utils/request-cancel';
import { SkeletonCard } from '@/components/Skeleton';
import { biliCover } from '@/utils/image-url';
import { showToast } from '@/utils/toast';
import { RADII, continuous, shadow } from '@/theme/tokens';
import { TabEmpty, TabError, type MemberTabProps } from '@/components/member/tab-states';

interface ShopItem {
  coverUrl: string;
  title: string;
  cardUrl: string;
  belowLabels: string[];
  pricePrefix: string;
  priceSymbol: string;
  netPrice: string;
  benefits: string;
  itemSourceName: string;
}

/* ===== 商店行（memo：每行两商品卡，回收复用时不重建闭包） ===== */
const ShopRow = memo(function ShopRow({
  row,
  index: _index,
  colors,
  T,
  onOpen,
}: {
  row: ShopItem[];
  index: number;
  colors: ReturnType<typeof useThemeColors>;
  T: ReturnType<typeof useType>;
  onOpen: (cardUrl: string) => void;
}) {
  const { width: windowWidth } = useWindowDimensions();
  const cardW = (windowWidth - 14 * 2 - ROW_GAP) / 2;
  return (
    <>
      <View style={styles.row}>
        {row.map((it, idx) => {
          const price = it.netPrice ? `${it.pricePrefix} ${it.priceSymbol}${it.netPrice}` : '';
          return (
            <Press
              key={`${idx}_${it.title}_${it.netPrice}`}
              haptic
              scaleTo={0.97}
              onPress={() => onOpen(it.cardUrl)}
              style={StyleSheet.flatten([
                styles.card,
                { width: cardW, backgroundColor: colors.card, ...shadow('sm', colors.isDark) },
              ])}>
              {it.coverUrl ? (
                <ExpoImage
                  source={{ uri: biliCover(it.coverUrl, 360, 360) }}
                  recyclingKey={it.coverUrl}
                  cachePolicy="memory-disk"
                  style={[styles.cover, { backgroundColor: colors.fill2 }]}
                  contentFit="cover"
                />
              ) : (
                <View style={[styles.cover, { backgroundColor: colors.fill2 }]} />
              )}
              <View style={styles.body}>
                <Text style={[T.footnote, styles.title, { color: colors.text }]} numberOfLines={2}>
                  {it.title || '无标题'}
                </Text>
                {it.belowLabels.length > 0 ? (
                  <View style={styles.labelBadge}>
                    <Text style={styles.labelText} numberOfLines={1}>{it.belowLabels.join('|')}</Text>
                  </View>
                ) : null}
                <View style={styles.priceRow}>
                  {price ? <Text style={[T.footnote, styles.price, { color: ACCENT }]} numberOfLines={1}>{price}</Text> : null}
                  {it.benefits ? (
                    <Text style={[T.caption2, styles.benefits, { color: colors.textTertiary }]} numberOfLines={1}>
                      {it.benefits}
                    </Text>
                  ) : null}
                </View>
                {it.itemSourceName ? (
                  <Text style={[T.caption2, styles.source, { color: colors.textSecondary }]} numberOfLines={1}>
                    {`来自${it.itemSourceName}`}
                  </Text>
                ) : null}
              </View>
            </Press>
          );
        })}
      </View>
    </>
  );
});

const ROW_GAP = 12;

export default function ShopTab({ mid, header, listRef }: MemberTabProps) {
  const router = useRouter();
  const colors = useThemeColors();
  const T = useType();
  const { width: windowWidth } = useWindowDimensions();
  const cardW = (windowWidth - 14 * 2 - ROW_GAP) / 2;

  const list = usePagedList<ShopItem>({
    fetchPage: async (_page, cancelToken?: NativeRequestCancelToken) => {
      const res = await userApi.spaceShop({ mid }, cancelToken ? { cancelToken } : undefined);
      const data = res?.data;
      return {
        items: (data?.data ?? []).map((it: any) => ({
          coverUrl: it.cover?.url ?? '',
          title: it.title ?? '',
          cardUrl: it.cardUrl ?? '',
          belowLabels: (it.belowLabels ?? []).map((b: any) => b.title ?? '').filter(Boolean),
          pricePrefix: it.netPrice?.pricePrefix ?? '',
          priceSymbol: it.netPrice?.priceSymbol ?? '',
          netPrice: it.netPrice?.netPrice ?? '',
          benefits: (it.benefitInfos ?? [])
            .map((b: any) => `${b.prefix ?? ''}${b.amount ?? ''}${b.suffix ?? ''}`)
            .filter(Boolean)
            .join('|'),
          itemSourceName: it.itemSourceName ?? '',
        })),
        hasMore: false,
      };
    },
    onError: (e) => {
      console.error('spaceShop error:', e);
      showToast('商店加载失败');
    },
  });

  const rows = useMemo(() => {
    const out: ShopItem[][] = [];
    for (let i = 0; i < list.items.length; i += 2) out.push(list.items.slice(i, i + 2));
    return out;
  }, [list.items]);

  const openItem = useCallback((cardUrl: string) => {
    if (!cardUrl) {
      showToast('无法打开链接');
      return;
    }
    router.push({ pathname: '/webview', params: { url: cardUrl, title: '商品详情' } } as any);
  }, [router]);

  const renderRow = useCallback(
    ({ item, index }: { item: ShopItem[]; index: number }) => (
      <ShopRow row={item} index={index} colors={colors} T={T} onOpen={openItem} />
    ),
    [colors, T, openItem],
  );

  const ItemSeparator = useCallback(() => <View style={{ height: ROW_GAP }} />, []);

  return (
    <FlashList
      ref={listRef}
      data={rows}
      keyExtractor={(row, index) => `${index}_${row.map((it) => it.title).join('_') || 'row'}`}
      contentContainerStyle={styles.listContent}
      showsVerticalScrollIndicator={false}
      ListHeaderComponent={header}
      onEndReached={list.loadMore}
      onEndReachedThreshold={0.4}
      estimatedItemSize={200}
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
                <View style={[styles.skelWrap, { width: cardW }]}><SkeletonCard height={160} /></View>
                <View style={[styles.skelWrap, { width: cardW }]}><SkeletonCard height={160} /></View>
              </View>
            ))}
          </View>
        ) : list.error ? (
          <TabError message={list.error} onRetry={list.refresh} />
        ) : (
          <TabEmpty icon="storefront-outline" text="暂无商品" />
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
  cover: { width: '100%', aspectRatio: 1 },
  body: { padding: 8, gap: 4 },
  title: { fontWeight: '600', lineHeight: 18, minHeight: 36 },
  labelBadge: {
    alignSelf: 'flex-start', backgroundColor: 'rgba(251,114,153,0.12)',
    borderRadius: 5, paddingHorizontal: 5, paddingVertical: 2, maxWidth: '100%',
  },
  labelText: { color: ACCENT, fontSize: 10, fontWeight: '600' },
  priceRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 4 },
  price: { fontWeight: '700' },
  benefits: { flexShrink: 1 },
  source: {},
  footer: { marginVertical: 18, alignItems: 'center' },
  skelWrap: {},
});
