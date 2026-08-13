import { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, RefreshControl } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Stack, Link, useLocalSearchParams } from 'expo-router';
import { Image as ExpoImage } from 'expo-image';
import { useThemeColors } from '@/components/SwiftUIHost';
import { useType } from '@/components/type-scale';
import { favApi } from '@/api/fav';
import { Press } from '@/components/motion';
import { RADII, continuous, shadow } from '@/theme/tokens';
import { fixedItemLayout } from '@/utils/list-layout';
import { biliCover } from '@/utils/image-url';

const rowLayout = fixedItemLayout(102);

interface FolderItem {
  id: number;
  title: string;
  cover: string;
  media_count?: number;
}

export default function MemberFavoriteScreen() {
  const { mid } = useLocalSearchParams<{ mid: string }>();
  const colors = useThemeColors();
  const T = useType();
  const [items, setItems] = useState<FolderItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    try {
      const res = await favApi.folderAll({ up_mid: parseInt(mid || '0', 10) });
      setItems((res?.data?.list || []).map((i: any) => ({
        id: i.id || i.media_id || 0,
        title: i.title || '',
        cover: i.cover || '',
        media_count: i.media_count,
      })));
    } catch {
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [mid]);

  useEffect(() => {
    const t = setTimeout(() => { load(true); }, 0);
    return () => clearTimeout(t);
  }, [load]);

  const renderRow = useCallback(
    ({ item, index }: { item: FolderItem; index: number }) => (
      <>
        <Link href={{ pathname: '/fav/[fid]', params: { fid: String(item.id) } } as any} asChild>
          <Press haptic scaleTo={0.97} style={[styles.row, { backgroundColor: colors.card }, continuous, shadow('sm', colors.isDark)]}>
            <ExpoImage source={{ uri: biliCover(item.cover, 160, 100) }} recyclingKey={item.cover} cachePolicy="memory-disk" style={[styles.cover, { backgroundColor: colors.fill2 }]} contentFit="cover" />
            <View style={styles.info}>
              <Text style={[T.subhead, styles.title, { color: colors.text }]} numberOfLines={2}>{item.title}</Text>
              {item.media_count != null ? <Text style={[T.caption1, { color: colors.textTertiary }]}>{item.media_count} 个内容</Text> : null}
            </View>
          </Press>
        </Link>
      </>
    ),
    [colors, T],
  );

  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]}>
      <Stack.Title large>TA 的收藏</Stack.Title>
      <Stack.Header blurEffect="systemMaterial" style={{ shadowColor: 'transparent' }} />
      <FlashList
        data={items}
        keyExtractor={(it) => String(it.id)}
        contentContainerStyle={styles.listContent}
        estimatedItemSize={102}
        overrideItemLayout={rowLayout}
        drawDistance={250}
        overrideProps={{ initialDrawBatchSize: 10 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={colors.textSecondary} />}
        ListEmptyComponent={loading ? null : <Text style={[T.headline, styles.empty, { color: colors.text }]}>暂无收藏夹</Text>}
        renderItem={renderRow}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  listContent: { paddingHorizontal: 14, paddingTop: 12, paddingBottom: 40, gap: 10 },
  row: { flexDirection: 'row', gap: 12, padding: 10, borderRadius: RADII.lg },
  cover: { width: 132, height: 82, borderRadius: RADII.sm, ...continuous },
  info: { flex: 1, justifyContent: 'center', gap: 6 },
  title: { fontWeight: '600' },
  empty: { textAlign: 'center', paddingTop: 120 },
});

