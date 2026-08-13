/**
 * 音频 tab（对应 Flutter member_audio）：方形封面 + 标题 + 时间 + 播放/评论。
 * RN 暂无可用的音频取流接口，卡片明确标注“暂不支持播放”，不可点（Flutter 跳 AudioPage）。
 */
import { memo, useCallback } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Link } from 'expo-router';
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
import { formatCount, formatTime } from '@/utils/format';
import { showToast } from '@/utils/toast';
import { RADII, continuous, shadow } from '@/theme/tokens';
import { TabEmpty, TabError, type MemberTabProps } from '@/components/member/tab-states';

interface AudioItem {
  id: number;
  title: string;
  cover: string;
  ctime: number;
  hasStat: boolean;
  play: number;
  comment: number;
}

/* ===== 音频行（memo：回收复用时不重建闭包） ===== */
const AudioRow = memo(function AudioRow({
  item,
  index,
  colors,
  T,
}: {
  item: AudioItem;
  index: number;
  colors: ReturnType<typeof useThemeColors>;
  T: ReturnType<typeof useType>;
}) {
  return (
    <>
      <Link href={{ pathname: '/audio/[id]', params: { id: String(item.id), title: item.title, cover: item.cover } } as any} asChild>
        <Press haptic scaleTo={0.97} style={StyleSheet.flatten([styles.card, { backgroundColor: colors.card, ...shadow('sm', colors.isDark) }])}>
          <ExpoImage
            source={{ uri: biliCover(item.cover, 160, 160) }}
            recyclingKey={item.cover}
            cachePolicy="memory-disk"
            style={[styles.cover, { backgroundColor: colors.fill2 }]}
            contentFit="cover"
          />
          <View style={styles.info}>
            <Text style={[T.subhead, styles.title, { color: colors.text }]} numberOfLines={2}>{item.title || '无标题'}</Text>
            <Text style={[T.caption1, { color: colors.textTertiary }]}>
              {formatTime(item.hasStat ? Math.floor(item.ctime / 1000) : item.ctime)}
            </Text>
            <View style={[styles.unsupportedBadge, { backgroundColor: colors.fill3 }]}>
              <Ionicons name="headset-outline" size={12} color={colors.textSecondary} />
              <Text style={[T.caption2, { color: colors.textSecondary }]}>点击播放</Text>
            </View>
            <View style={styles.statRow}>
              <Ionicons name="headset-outline" size={12} color={colors.textTertiary} />
              <Text style={[T.caption1, { color: colors.textTertiary }]}>{formatCount(item.play)}</Text>
              <Ionicons name="chatbubble-outline" size={12} color={colors.textTertiary} />
              <Text style={[T.caption1, { color: colors.textTertiary }]}>{formatCount(item.comment)}</Text>
            </View>
          </View>
        </Press>
      </Link>
    </>
  );
});

export default function AudioTab({ mid, header, listRef }: MemberTabProps) {
  const colors = useThemeColors();
  const T = useType();

  const list = usePagedList<AudioItem>({
    fetchPage: async (page, cancelToken?: NativeRequestCancelToken) => {
      const res = await userApi.spaceAudio({ mid, pn: page }, cancelToken ? { cancelToken } : undefined);
      const data = res?.data;
      const items = (data?.data ?? []).map((it: any) => ({
        id: it.id ?? 0,
        title: it.title ?? '',
        cover: it.cover ?? '',
        ctime: it.ctime ?? 0,
        hasStat: it.statistic != null,
        play: it.statistic?.play ?? 0,
        comment: it.statistic?.comment ?? 0,
      }));
      const total = typeof data?.totalSize === 'number' ? data.totalSize : null;
      return { items, hasMore: total != null ? page * 20 < total : items.length >= 20 };
    },
    onError: (e) => {
      console.error('spaceAudio error:', e);
      showToast('音频加载失败');
    },
  });

  const renderItem = useCallback(
    ({ item, index }: { item: AudioItem; index: number }) => (
      <AudioRow item={item} index={index} colors={colors} T={T} />
    ),
    [colors, T],
  );

  const ItemSeparator = useCallback(() => <View style={{ height: 10 }} />, []);

  return (
    <FlashList
      ref={listRef}
      data={list.items}
      keyExtractor={(item, index) => String(item.id || `audio_${index}`)}
      contentContainerStyle={styles.listContent}
      showsVerticalScrollIndicator={false}
      ListHeaderComponent={header}
      onEndReached={list.loadMore}
      onEndReachedThreshold={0.4}
      estimatedItemSize={130}
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
          <TabEmpty icon="musical-notes-outline" text="暂无音频" />
        )
      }
      renderItem={renderItem}
      ItemSeparatorComponent={ItemSeparator}
    />
  );
}

const styles = StyleSheet.create({
  listContent: { paddingHorizontal: 14, paddingTop: 12, paddingBottom: 40 },
  card: { flexDirection: 'row', gap: 12, borderRadius: RADII.card, padding: 12, ...continuous },
  cover: { width: 64, height: 64, borderRadius: RADII.sm, ...continuous },
  info: { flex: 1, justifyContent: 'space-between', paddingVertical: 1, gap: 3 },
  title: { fontWeight: '600' },
  statRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  unsupportedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: RADII.circle,
    paddingHorizontal: 8,
    paddingVertical: 3,
    alignSelf: 'flex-start',
    ...continuous,
  },
  footer: { marginVertical: 18, alignItems: 'center' },
  skelGap: { marginBottom: 10 },
});

