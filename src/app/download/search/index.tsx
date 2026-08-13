/**
 * 下载内搜索（对齐 Flutter download/search）。
 * 纯本地过滤：按标题 / UP 主 / 分P 标题 / BV 号匹配本地下载任务，无网络请求。
 * 结果行点击进入单任务分P 详情页（/download/[id]）。
 */
import { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Stack, useRouter } from 'expo-router';
import { Image as ExpoImage } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { Host, useThemeColors } from '@/components/SwiftUIHost';
import { BILI } from '@/theme/bili-colors';
import { RADII, shadow } from '@/theme/tokens';
import { useType } from '@/components/type-scale';
import { Press } from '@/components/motion';
import { searchDownloads, subscribeDownloadsChanged, type DownloadItem } from '@/utils/download';
import { fixedItemLayout } from '@/utils/list-layout';
import { biliCover } from '@/utils/image-url';
import EmptyState from '@/components/EmptyState';

const rowLayout = fixedItemLayout(102);

export default function DownloadSearchScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const T = useType();
  const [keyword, setKeyword] = useState('');
  const [items, setItems] = useState<DownloadItem[]>([]);

  const run = useCallback(async (q: string) => {
    setItems(await searchDownloads(q));
  }, []);

  // 首次进入默认展示全部下载
  useEffect(() => {
    queueMicrotask(() => void run(''));
  }, [run]);

  // 下载状态变化时刷新（进度/暂停/完成）
  useEffect(() => subscribeDownloadsChanged(() => { void run(keyword); }), [run, keyword]);

  const openDetail = useCallback((item: DownloadItem) => {
    router.push({ pathname: '/download/[id]', params: { id: item.id } } as any);
  }, [router]);

  const renderRow = useCallback(
    ({ item }: { item: DownloadItem }) => (
      <Press
        haptic
        scaleTo={0.98}
        onPress={() => openDetail(item)}
        style={[styles.row, { backgroundColor: colors.card }, shadow('sm', colors.isDark)]}>
        {item.pic ? (
          <ExpoImage source={{ uri: biliCover(item.pic, 160, 100) }} recyclingKey={item.pic} cachePolicy="memory-disk" style={[styles.cover, { backgroundColor: colors.fill2 }]} contentFit="cover" />
        ) : (
          <View style={[styles.cover, { backgroundColor: colors.fill2, justifyContent: 'center', alignItems: 'center' }]}>
            <Ionicons name="videocam-outline" size={24} color={colors.textTertiary} />
          </View>
        )}
        <View style={styles.info}>
          <Text style={[T.subhead, { color: colors.text }]} numberOfLines={2}>{item.title}</Text>
          <View style={styles.meta}>
            <Ionicons
              name={item.status === 'done' ? 'checkmark-circle' : item.status === 'error' ? 'alert-circle' : item.status === 'paused' ? 'pause-circle' : 'hourglass'}
              size={14}
              color={item.status === 'done' ? '#34C759' : item.status === 'error' ? '#FF3B30' : item.status === 'paused' ? '#FF9F0A' : colors.textTertiary}
            />
            <Text style={[T.caption1, { color: colors.textTertiary }]}>
              {item.status === 'done' ? '已下载' : item.status === 'error' ? '下载失败' : item.status === 'paused' ? '已暂停' : '下载中'}
            </Text>
            {typeof item.partCount === 'number' && item.partCount > 1 ? (
              <Text style={[T.caption2, { color: colors.textTertiary }]}>
                {`P${(item.partIndex ?? 0) + 1} / ${item.partCount}`}
              </Text>
            ) : null}
          </View>
          {item.author ? (
            <Text style={[T.caption2, { color: colors.textSecondary }]} numberOfLines={1}>UP：{item.author}</Text>
          ) : null}
        </View>
        <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
      </Press>
    ),
    [colors, T, openDetail],
  );

  return (
    <Host style={{ flex: 1 }} useViewportSizeMeasurement>
      <View style={[styles.root, { backgroundColor: colors.bg }]}>
        <Stack.Title large>搜索下载</Stack.Title>
        <Stack.Header blurEffect="systemMaterial" style={{ shadowColor: 'transparent' }} />
        <Stack.SearchBar
          placeholder="搜索标题 / UP 主"
          autoCapitalize="none"
          onChangeText={(e: any) => {
            const v = typeof e === 'string' ? e : e?.nativeEvent?.text ?? '';
            setKeyword(v);
            void run(v);
          }}
          onSearchButtonPress={(e: any) => {
            const v = typeof e === 'string' ? e : e?.nativeEvent?.text ?? keyword;
            setKeyword(v);
            void run(v);
          }}
          tintColor={colors.accent}
          textColor={colors.text}
          hintTextColor={colors.textTertiary}
          headerIconColor={colors.textSecondary}
        />
        <FlashList
          data={items}
          keyExtractor={(it) => it.id}
          contentContainerStyle={styles.listContent}
          estimatedItemSize={102}
          overrideItemLayout={rowLayout}
          drawDistance={250}
          overrideProps={{ initialDrawBatchSize: 10 }}
          ListEmptyComponent={
            <EmptyState
              icon="search-outline"
              title={keyword ? '没有匹配的下载' : '暂无下载'}
              subtitle={keyword ? '试试其他关键词' : '在视频页选择下载后，可在这里搜索'}
            />
          }
          renderItem={renderRow}
        />
      </View>
    </Host>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  listContent: { paddingHorizontal: 14, paddingTop: 10, paddingBottom: 40, gap: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10, borderRadius: RADII.md },
  cover: { width: 132, height: 82, borderRadius: RADII.thumb },
  info: { flex: 1, gap: 6 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 5 },
});
