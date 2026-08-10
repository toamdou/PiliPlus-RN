import { memo, useCallback } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Link } from 'expo-router';
import { Image as ExpoImage } from 'expo-image';
import { Host, ProgressView } from '@expo/ui/swift-ui';
import { useThemeColors } from '@/components/SwiftUIHost';
import { useType } from '@/components/type-scale';
import { Press } from '@/components/motion';
import { favApi } from '@/api/fav';
import { userApi } from '@/api/user';
import { usePagedList } from '@/hooks/use-paged-list';
import type { NativeRequestCancelToken } from '@/utils/request-cancel';
import { SkeletonRow } from '@/components/Skeleton';
import { showToast } from '@/utils/toast';
import { fixedItemLayout } from '@/utils/list-layout';
import { RADII, continuous, shadow } from '@/theme/tokens';
import { TabEmpty, TabError, type MemberTabProps } from '@/components/member/tab-states';
import { biliCover } from '@/utils/image-url';

const rowLayout = fixedItemLayout(102);

interface FolderItem {
  id: number;
  title: string;
  cover: string;
  subtitle: string;
  href: string;
}

const FolderRow = memo(function FolderRow({
  item,
  colors,
  T,
}: {
  item: FolderItem;
  colors: ReturnType<typeof useThemeColors>;
  T: ReturnType<typeof useType>;
}) {
  return (
    <>
      <Link href={item.href as any} asChild>
        <Press
          haptic
          scaleTo={0.98}
          style={StyleSheet.flatten([
            styles.row,
            { backgroundColor: colors.card, ...shadow('sm', colors.isDark) },
          ])}>
          <ExpoImage
            source={{ uri: biliCover((item.cover || ''), 320, 200) }}
            recyclingKey={item.cover || ''}
            cachePolicy="memory-disk"
            style={[styles.cover, { backgroundColor: colors.fill2 }]}
            contentFit="cover"
          />
          <View style={styles.info}>
            <Text style={[T.subhead, styles.title, { color: colors.text }]} numberOfLines={2}>{item.title}</Text>
            {item.subtitle ? (
              <Text style={[T.caption1, { color: colors.textTertiary }]} numberOfLines={1}>{item.subtitle}</Text>
            ) : null}
          </View>
        </Press>
      </Link>
    </>
  );
});

export function MemberFolderTab({ kind, mid, header, listRef }: MemberTabProps & { kind: 'favorite' | 'pgc' | 'collection' }) {
  const colors = useThemeColors();
  const T = useType();

  const list = usePagedList<FolderItem>({
    fetchPage: async (page, cancelToken?: NativeRequestCancelToken) => {
      if (kind === 'favorite') {
        const res = await favApi.folderList({ up_mid: mid, pn: page, ps: 20 }, cancelToken ? { cancelToken } : undefined);
        const raw = res?.data?.list || [];
        return {
          items: raw.map((it: any) => ({
            id: it.id || it.media_id || 0,
            title: it.title || '',
            cover: it.cover || '',
            subtitle: it.media_count != null ? `${it.media_count} 个内容` : '',
            href: `/fav/${it.id || it.media_id || 0}`,
          })),
          hasMore: res?.data?.has_more !== false && raw.length >= 20,
        };
      }
      if (kind === 'pgc') {
        const res = await favApi.pgcFollow({ vmid: mid, pn: page, ps: 20 }, cancelToken ? { cancelToken } : undefined);
        const raw = res?.data?.list || [];
        return {
          items: raw.map((it: any) => ({
            id: it.season_id || it.seasonId || 0,
            title: it.title || '',
            cover: it.cover || '',
            subtitle: it.new_ep?.index_show ? `更新至 ${it.new_ep.index_show}` : '已追番',
            href: `/pgc/${it.season_id || it.seasonId || 0}`,
          })),
          hasMore: raw.length >= 20,
        };
      }
      const res = await userApi.seasonSeriesList({ mid, pn: page }, cancelToken ? { cancelToken } : undefined);
      const data = res?.data?.items_lists ?? res?.data ?? {};
      const seasons: any[] = data.seasons_list ?? [];
      const series: any[] = data.series_list ?? [];
      const items = [
        ...seasons.map((it: any) => ({
          id: it.meta?.season_id,
          title: it.meta?.name || '',
          cover: it.meta?.cover || '',
          subtitle: it.meta?.total != null ? `${it.meta.total} 个视频` : '',
          href: `/member_ss_web/${mid}`,
        })),
        ...series.map((it: any) => ({
          id: it.meta?.series_id,
          title: it.meta?.name || '',
          cover: it.meta?.cover || '',
          subtitle: it.meta?.total != null ? `${it.meta.total} 个视频` : '',
          href: `/member_ss_web/${mid}`,
        })),
      ].filter((it) => it.id != null);
      const total = data.page?.total;
      return {
        items,
        hasMore: typeof total === 'number' ? page * 10 < total : items.length >= 10,
      };
    },
    onError: (e) => {
      console.error(`member ${kind} tab error:`, e);
      showToast('加载失败，请重试');
    },
  });

  const renderItem = useCallback(
    ({ item }: { item: FolderItem }) => (
      <FolderRow item={item} colors={colors} T={T} />
    ),
    [colors, T],
  );

  const ItemSeparator = useCallback(() => <View style={{ height: 10 }} />, []);

  return (
    <FlashList
      ref={listRef}
      data={list.items}
      keyExtractor={(it) => `${kind}-${it.id}`}
      contentContainerStyle={styles.listContent}
      showsVerticalScrollIndicator={false}
      ListHeaderComponent={header}
      onEndReached={list.loadMore}
      onEndReachedThreshold={0.4}
      estimatedItemSize={102}
      overrideItemLayout={rowLayout}
      windowSize={9}
      initialNumToRender={10}
      maxToRenderPerBatch={12}
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
            {[0, 1, 2, 3].map((i) => (
              <View key={i} style={styles.skelGap}>
                <SkeletonRow height={64} />
              </View>
            ))}
          </View>
        ) : list.error ? (
          <TabError message={list.error} onRetry={list.refresh} />
        ) : (
          <TabEmpty
            icon={kind === 'favorite' ? 'star-outline' : kind === 'pgc' ? 'tv-outline' : 'albums-outline'}
            text={kind === 'favorite' ? '暂无收藏夹' : kind === 'pgc' ? '暂无追番' : '暂无合集'}
          />
        )
      }
      renderItem={renderItem}
      ItemSeparatorComponent={ItemSeparator}
    />
  );
}

const styles = StyleSheet.create({
  listContent: { paddingHorizontal: 14, paddingTop: 12, paddingBottom: 40 },
  row: {
    flexDirection: 'row',
    gap: 12,
    borderRadius: RADII.card,
    padding: 10,
    ...continuous,
  },
  cover: { width: 132, height: 82, borderRadius: RADII.sm, ...continuous },
  info: { flex: 1, justifyContent: 'center', gap: 6 },
  title: { fontWeight: '600' },
  footer: { marginVertical: 18, alignItems: 'center' },
  skelGap: { marginBottom: 10 },
});
