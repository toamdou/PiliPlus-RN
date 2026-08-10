import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Stack, useLocalSearchParams } from 'expo-router';
import { Image as ExpoImage } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors, ACCENT } from '@/components/SwiftUIHost';
import { Press } from '@/components/motion';
import { useType } from '@/components/type-scale';
import { appClient, get } from '@/api/client';
import { Api } from '@/api/endpoints';
import { STATISTICS, signAppParamsAsync } from '@/utils/app-sign';
import { showToast } from '@/utils/toast';
import { feedBackMedium, openLink } from '@/utils/feedback';
import { RADII, continuous, shadow } from '@/theme/tokens';
import { fixedItemLayout } from '@/utils/list-layout';
import { biliCover } from '@/utils/image-url';

const rowLayout = fixedItemLayout(142);

interface ComicItem {
  param: string;
  title: string;
  cover: string;
  styles: string;
  label: string;
}

const ComicRow = ({ item, index, colors, T }: {
  item: ComicItem;
  index: number;
  colors: ReturnType<typeof useThemeColors>;
  T: ReturnType<typeof useType>;
}) => (
  <>
    <Press
      haptic
      scaleTo={0.98}
      onPress={() => {
        if (item.param) {
          openLink(`https://manga.bilibili.com/detail/mc${item.param}`);
        } else {
          showToast('无法打开漫画详情');
        }
      }}
      style={[styles.card, { backgroundColor: colors.card, ...shadow('sm', colors.isDark) }]}>
      <View style={styles.coverWrap}>
        <ExpoImage
          source={{ uri: biliCover((item.cover || ''), 240, 320) }}
          recyclingKey={item.cover || ''}
          cachePolicy="memory-disk"
          style={[styles.cover, { backgroundColor: colors.fill2 }]}
          contentFit="cover"
        />
      </View>
      <View style={styles.info}>
        <Text style={[T.subhead, styles.title, { color: colors.text }]} numberOfLines={2}>
          {item.title || '无标题'}
        </Text>
        {item.styles ? (
          <Text style={[T.caption1, { color: colors.textSecondary }]} numberOfLines={1}>{item.styles}</Text>
        ) : null}
        {item.label ? (
          <Text style={[T.caption2, { color: colors.textTertiary }]} numberOfLines={1}>{item.label}</Text>
        ) : null}
      </View>
    </Press>
  </>
);

export default function MemberComicScreen() {
  const { mid } = useLocalSearchParams<{ mid: string }>();
  const colors = useThemeColors();
  const T = useType();
  const midNum = Number(mid);
  const [items, setItems] = useState<ComicItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unsupported, setUnsupported] = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    setUnsupported(false);
    try {
      const signed = await signAppParamsAsync({
        build: 8430300,
        channel: 'master',
        version: '8.43.0',
        c_locale: 'zh_CN',
        s_locale: 'zh_CN',
        mobi_app: 'android',
        platform: 'android',
        statistics: STATISTICS,
        vmid: midNum,
        pn: 1,
        ps: 20,
        qn: 32,
      });
      const res = await get(appClient, Api.spaceComic, signed);
      if (res?.code !== 0) {
        setUnsupported(true);
        setItems([]);
        return;
      }
      const data = res?.data;
      setItems((data?.item ?? []).map((it: any) => ({
        param: String(it?.param ?? ''),
        title: it?.title ?? '',
        cover: it?.cover ?? '',
        styles: it?.styles ?? '',
        label: it?.label ?? '',
      })));
    } catch (e) {
      console.error('member comic error:', e);
      setError('漫画列表加载失败');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [midNum]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void load();
    }, 0);
    return () => clearTimeout(timer);
  }, [load]);

  const renderItem = useCallback(
    ({ item, index }: { item: ComicItem; index: number }) => (
      <ComicRow item={item} index={index} colors={colors} T={T} />
    ),
    [colors, T],
  );

  const ItemSeparator = useCallback(() => <View style={{ height: 10 }} />, []);

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
    if (unsupported) {
      return (
        <View style={styles.emptyWrap}>
          <Ionicons name="book-outline" size={38} color={colors.textTertiary} />
          <Text style={[T.headline, styles.emptyTitle, { color: colors.text }]}>暂不支持漫画列表</Text>
          <Text style={[T.footnote, styles.emptySub, { color: colors.textSecondary }]}>
            当前版本未接入漫画接口，可前往哔哩哔哩漫画查看
          </Text>
          <Press haptic scaleTo={0.94} onPress={() => openLink('https://manga.bilibili.com')} style={styles.openBtn}>
            <Text style={[T.subhead, styles.openBtnText]}>前往哔哩哔哩漫画</Text>
          </Press>
        </View>
      );
    }
    return (
      <View style={styles.emptyWrap}>
        <Ionicons name="book-outline" size={38} color={colors.textTertiary} />
        <Text style={[T.headline, styles.emptyTitle, { color: colors.text }]}>暂无漫画</Text>
      </View>
    );
  }, [loading, error, unsupported, colors, T, load]);

  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]}>
      <Stack.Screen options={{ title: 'TA 的漫画', headerBackButtonDisplayMode: 'minimal' }} />
      <Stack.Header blurEffect="systemMaterial" style={{ shadowColor: 'transparent' }} />
      <FlashList
        data={items}
        keyExtractor={(item, index) => item.param || `comic_${index}`}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
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
        estimatedItemSize={142}
        overrideItemLayout={rowLayout}
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
  card: {
    flexDirection: 'row',
    gap: 12,
    borderRadius: RADII.card,
    padding: 10,
    overflow: 'hidden',
    ...continuous,
  },
  coverWrap: { position: 'relative' },
  cover: { width: 92, height: 122, borderRadius: RADII.sm, ...continuous },
  info: { flex: 1, justifyContent: 'center', gap: 6 },
  title: { fontWeight: '600', lineHeight: 20 },
  emptyWrap: { alignItems: 'center', paddingTop: 80, paddingHorizontal: 32, gap: 8 },
  emptyTitle: { fontWeight: '600' },
  emptySub: { textAlign: 'center', lineHeight: 19 },
  retryBtn: { marginTop: 10, borderRadius: RADII.lg, paddingHorizontal: 28, paddingVertical: 9, ...continuous },
  retryText: { fontWeight: '600' },
  openBtn: { marginTop: 10, backgroundColor: ACCENT, borderRadius: RADII.lg, paddingHorizontal: 24, paddingVertical: 10, ...continuous },
  openBtnText: { color: '#FFFFFF', fontWeight: '600' },
});
