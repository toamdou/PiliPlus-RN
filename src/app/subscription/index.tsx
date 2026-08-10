import { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, RefreshControl } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Stack, Link, useRouter } from 'expo-router';
import { Image as ExpoImage } from 'expo-image';
import { useThemeColors, ACCENT } from '@/components/SwiftUIHost';
import { useType } from '@/components/type-scale';
import { useAuthStore } from '@/stores/auth';
import { favApi } from '@/api/fav';
import { Press } from '@/components/motion';
import { feedBackMedium } from '@/utils/feedback';
import { RADII, continuous, shadow } from '@/theme/tokens';
import { fixedItemLayout } from '@/utils/list-layout';
import { biliCover } from '@/utils/image-url';

const rowLayout = fixedItemLayout(102);

interface SubItem {
  id: number;
  mid: number;
  title: string;
  cover: string;
  media_count?: number;
  type: number;
}

export default function SubscriptionScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const T = useType();
  const { isLoggedIn, userInfo } = useAuthStore();
  const mid = userInfo?.mid;
  const [items, setItems] = useState<SubItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    if (!isLoggedIn || !mid) {
      setLoading(false);
      return;
    }
    if (isRefresh) setRefreshing(true);
    try {
      const res = await favApi.subFolder({ up_mid: mid });
      setItems((res?.data?.list || []).map((i: any) => ({
        id: i.id || i.fid || 0,
        mid: i.mid || 0,
        title: i.title || i.name || '',
        cover: i.cover || '',
        media_count: i.media_count,
        type: i.type || 21,
      })));
    } catch {
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [isLoggedIn, mid]);

  useEffect(() => {
    const t = setTimeout(() => { load(true); }, 0);
    return () => clearTimeout(t);
  }, [load]);

  const renderRow = useCallback(
    ({ item, index }: { item: SubItem; index: number }) => {
      const href = item.type === 11
        ? { pathname: '/fav/[fid]', params: { fid: String(item.id), title: item.title } }
        : { pathname: '/subscription_detail/[mid]', params: { mid: String(item.id), title: item.title } };
      return (
        <View>
          <Link href={href as any} asChild>
            <Press haptic scaleTo={0.97} style={[styles.row, { backgroundColor: colors.card }, continuous, shadow('sm', colors.isDark)]}>
              <ExpoImage source={{ uri: biliCover(item.cover, 160, 100) }} recyclingKey={item.cover} cachePolicy="memory-disk" style={[styles.cover, { backgroundColor: colors.fill2 }]} contentFit="cover" />
              <View style={styles.info}>
                <Text style={[T.subhead, styles.title, { color: colors.text }]} numberOfLines={2}>{item.title}</Text>
                {item.media_count != null ? (
                  <Text style={[T.caption1, { color: colors.textTertiary }]}>{item.media_count} 个内容</Text>
                ) : null}
              </View>
            </Press>
          </Link>
        </View>
      );
    },
    [colors, T],
  );

  if (!isLoggedIn) {
    return (
      <View style={[styles.root, { backgroundColor: colors.bg }]}>
        <Stack.Title large>我的订阅</Stack.Title>
        <Stack.Header blurEffect="systemMaterial" style={{ shadowColor: 'transparent' }} />
        <View style={styles.empty}>
          <Text style={[T.headline, { color: colors.text }]}>请先登录</Text>
          <Press haptic onPress={() => router.push('/login' as any)} style={styles.loginBtn}>
            <Text style={[T.subhead, styles.loginText]}>去登录</Text>
          </Press>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]}>
      <Stack.Title large>我的订阅</Stack.Title>
      <Stack.Header blurEffect="systemMaterial" style={{ shadowColor: 'transparent' }} />
      <FlashList
        data={items}
        keyExtractor={(it) => String(it.id)}
        contentContainerStyle={styles.listContent}
        estimatedItemSize={102}
        overrideItemLayout={rowLayout}
        drawDistance={250}
        windowSize={9}
        initialNumToRender={10}
        maxToRenderPerBatch={12}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { feedBackMedium(); load(true); }} tintColor={colors.textSecondary} />}
        ListEmptyComponent={
          loading ? null : (
            <View style={styles.empty}>
              <Text style={[T.headline, { color: colors.text }]}>暂无订阅</Text>
            </View>
          )
        }
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
  empty: { alignItems: 'center', paddingTop: 120, gap: 12 },
  loginBtn: { backgroundColor: ACCENT, borderRadius: 18, paddingHorizontal: 26, paddingVertical: 9 },
  loginText: { color: '#FFFFFF', fontWeight: '600' },
});
