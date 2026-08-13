/**
 * 课堂 tab（对应 Flutter member_cheese）：封面（带 marks 角标）+ 标题 + 状态 + 收藏时间。
 * 点击进入对应课堂（PUGV）详情页 /pgc/[id]。
 */
import { memo, useCallback } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Host, ProgressView } from '@expo/ui/swift-ui';
import { Link } from 'expo-router';
import { Image as ExpoImage } from 'expo-image';
import { Press } from '@/components/motion';
import { useType } from '@/components/type-scale';
import { useThemeColors } from '@/components/SwiftUIHost';
import { userApi } from '@/api/user';
import { usePagedList } from '@/hooks/use-paged-list';
import type { NativeRequestCancelToken } from '@/utils/request-cancel';
import { SkeletonRow } from '@/components/Skeleton';
import { biliCover } from '@/utils/image-url';
import { formatTime } from '@/utils/format';
import { showToast } from '@/utils/toast';
import { RADII, continuous, shadow } from '@/theme/tokens';
import { TabEmpty, TabError, type MemberTabProps } from '@/components/member/tab-states';

interface CheeseItem {
  cover: string;
  marks: string[];
  seasonId: number;
  status: string;
  title: string;
  ctime: string;
}

/* ===== 课堂行（memo：回收复用时不重建闭包） ===== */
const CheeseRow = memo(function CheeseRow({
  item,
  index,
  colors,
  T,
}: {
  item: CheeseItem;
  index: number;
  colors: ReturnType<typeof useThemeColors>;
  T: ReturnType<typeof useType>;
}) {
  return (
    <>
      <Link href={{ pathname: '/pgc/[id]', params: { id: String(item.seasonId) } }} asChild>
        <Press
          haptic
          scaleTo={0.98}
          style={StyleSheet.flatten([
            styles.card,
            { backgroundColor: colors.card, ...shadow('sm', colors.isDark) },
          ])}>
          <View style={styles.coverWrap}>
            <ExpoImage
              source={{ uri: biliCover(item.cover, 320, 200) }}
              recyclingKey={item.cover}
              cachePolicy="memory-disk"
              style={[styles.cover, { backgroundColor: colors.fill2 }]}
              contentFit="cover"
            />
            {item.marks.length > 0 ? (
              <View style={styles.markBadge}>
                <Text style={styles.markText} numberOfLines={1}>{item.marks.join('|')}</Text>
              </View>
            ) : null}
          </View>
          <View style={styles.info}>
            <Text style={[T.subhead, styles.title, { color: colors.text }]} numberOfLines={2}>
              {item.title || '无标题'}
            </Text>
            {item.status ? (
              <Text style={[T.caption1, { color: colors.textSecondary }]} numberOfLines={1}>{item.status}</Text>
            ) : null}
            {item.ctime ? (
              <Text style={[T.caption1, { color: colors.textTertiary }]}>
                {`收藏于${formatTime(parseInt(item.ctime, 10) || 0)}`}
              </Text>
            ) : null}
          </View>
        </Press>
      </Link>
    </>
  );
});

export default function CheeseTab({ mid, header, listRef }: MemberTabProps) {
  const colors = useThemeColors();
  const T = useType();

  const list = usePagedList<CheeseItem>({
    fetchPage: async (page, cancelToken?: NativeRequestCancelToken) => {
      const res = await userApi.spaceCheese({ mid, pn: page }, cancelToken ? { cancelToken } : undefined);
      const data = res?.data;
      return {
        items: (data?.items ?? []).map((it: any) => ({
          cover: it.cover ?? '',
          marks: it.marks ?? [],
          seasonId: it.season_id ?? 0,
          status: it.status ?? '',
          title: it.title ?? '',
          ctime: it.ctime != null ? String(it.ctime) : '',
        })),
        hasMore: data?.page?.next === true,
      };
    },
    onError: (e) => {
      console.error('spaceCheese error:', e);
      showToast('课堂加载失败');
    },
  });

  const renderItem = useCallback(
    ({ item, index }: { item: CheeseItem; index: number }) => (
      <CheeseRow item={item} index={index} colors={colors} T={T} />
    ),
    [colors, T],
  );

  const ItemSeparator = useCallback(() => <View style={{ height: 10 }} />, []);

  return (
    <FlashList
      ref={listRef}
      data={list.items}
      keyExtractor={(item, index) => String(item.seasonId || `cheese_${index}`)}
      contentContainerStyle={styles.listContent}
      showsVerticalScrollIndicator={false}
      ListHeaderComponent={header}
      onEndReached={list.loadMore}
      onEndReachedThreshold={0.4}
      estimatedItemSize={140}
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
          <TabEmpty icon="school-outline" text="暂无课堂" />
        )
      }
      renderItem={renderItem}
      ItemSeparatorComponent={ItemSeparator}
    />
  );
}

const styles = StyleSheet.create({
  listContent: { paddingHorizontal: 14, paddingTop: 12, paddingBottom: 40 },
  card: { flexDirection: 'row', gap: 10, borderRadius: RADII.card, padding: 10, ...continuous },
  coverWrap: { position: 'relative' },
  cover: { width: 120, height: 75, borderRadius: RADII.sm, ...continuous },
  markBadge: {
    position: 'absolute', right: 5, top: 5,
    backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 5,
    paddingHorizontal: 5, paddingVertical: 1.5, maxWidth: 90,
  },
  markText: { color: '#FFFFFF', fontSize: 9.5, fontWeight: '600' },
  info: { flex: 1, justifyContent: 'space-between', paddingVertical: 1, gap: 3 },
  title: { fontWeight: '600', lineHeight: 20 },
  footer: { marginVertical: 18, alignItems: 'center' },
  skelGap: { marginBottom: 10 },
});

