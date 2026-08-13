import { useState, useCallback, useRef, memo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Stack, useRouter, useLocalSearchParams, useScrollToTop } from 'expo-router';
import { Image as ExpoImage } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors, ACCENT } from '@/components/SwiftUIHost';
import { useType } from '@/components/type-scale';
import { Press } from '@/components/motion';
import { favApi } from '@/api/fav';
import { formatCount } from '@/utils/format';
import { isDefaultFav, takeFavSortCache } from '@/utils/fav-utils';
import { RADII, continuous } from '@/theme/tokens';
import { feedBackSelection, feedBackSuccess } from '@/utils/feedback';
import { showToast } from '@/utils/toast';
import { fixedItemLayout } from '@/utils/list-layout';
import { biliCover } from '@/utils/image-url';
import EmptyState from '@/components/EmptyState';

const rowLayout = fixedItemLayout(76);

interface SortFolder {
  id: number | string;
  title: string;
  media_count: number;
  cover: string;
  attr?: number;
}

/* ===== 排序行（memo：行内闭包只在该行重渲染时重建） ===== */
const SortFolderRow = memo(function SortFolderRow({
  item,
  index,
  listLength,
  colors,
  T,
  onMove,
}: {
  item: SortFolder;
  index: number;
  listLength: number;
  colors: ReturnType<typeof useThemeColors>;
  T: ReturnType<typeof useType>;
  onMove: (index: number, dir: -1 | 1) => void;
}) {
  const locked = isDefaultFav(item.attr) || index === 0;
  return (
    <View style={styles.row}>
      <View style={styles.coverWrap}>
        {item.cover ? (
          <ExpoImage
            source={{ uri: biliCover(item.cover, 112, 112) }}
            recyclingKey={item.cover}
            cachePolicy="memory-disk"
            style={[styles.cover, { backgroundColor: colors.fill2 }]}
            contentFit="cover"
          />
        ) : (
          <View style={[styles.cover, styles.coverEmpty, { backgroundColor: colors.fill2 }]}>
            <Ionicons name="folder-outline" size={22} color={colors.textTertiary} />
          </View>
        )}
      </View>
      <View style={styles.info}>
        <Text style={[T.subhead, styles.title, { color: colors.text }]} numberOfLines={1}>{item.title}</Text>
        <Text style={[T.caption1, { color: colors.textSecondary }]}>{`${formatCount(item.media_count)} 个内容`}</Text>
      </View>
      <View style={styles.ops}>
        <Press
          haptic
          scaleTo={0.9}
          disabled={locked}
          onPress={() => onMove(index, -1)}
          style={[styles.moveBtn, { backgroundColor: colors.fill2, opacity: locked || index === 0 ? 0.35 : 1 }]}>
          <Ionicons name="chevron-up" size={15} color={colors.textSecondary} />
        </Press>
        <Press
          haptic
          scaleTo={0.9}
          disabled={locked}
          onPress={() => onMove(index, 1)}
          style={[styles.moveBtn, { backgroundColor: colors.fill2, opacity: locked || index === listLength - 1 ? 0.35 : 1 }]}>
          <Ionicons name="chevron-down" size={15} color={colors.textSecondary} />
        </Press>
        <Ionicons name="reorder-three-outline" size={20} color={colors.quaternaryLabel} />
      </View>
    </View>
  );
});

export default function FavFolderSortScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const T = useType();
  const { data } = useLocalSearchParams<{ data?: string }>();

  const [list, setList] = useState<SortFolder[]>(() => {
    const cached = takeFavSortCache();
    if (cached) return cached.map((item) => ({ ...item }));
    if (!data) return [];
    try {
      const parsed = JSON.parse(data);
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      console.error('favFolderSort parse params error:', e);
      return [];
    }
  });
  const [saving, setSaving] = useState(false);
  const listRef = useRef<any>(null);
  useScrollToTop(listRef);

  const move = useCallback((index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= list.length) return;
    if (index === 0 || target === 0 || isDefaultFav(list[index]?.attr) || isDefaultFav(list[target]?.attr)) {
      showToast('默认收藏夹不支持排序');
      return;
    }
    feedBackSelection();
    setList((prev) => {
      const next = [...prev];
      const [item] = next.splice(index, 1);
      next.splice(target, 0, item);
      return next;
    });
  }, [list]);

  const doSave = async () => {
    setSaving(true);
    try {
      const res = await favApi.sortFolder({ sort: list.map((f) => f.id).join(',') });
      if (res?.code !== 0) {
        showToast(res?.message || '排序失败');
        return;
      }
      feedBackSuccess();
      showToast('排序完成');
      router.back();
    } catch (e) {
      console.error('favFolderSort save error:', e);
      showToast('排序失败，请重试');
    } finally {
      setSaving(false);
    }
  };

  const renderRow = useCallback(
    ({ item, index }: { item: SortFolder; index: number }) => (
      <SortFolderRow item={item} index={index} listLength={list.length} colors={colors} T={T} onMove={move} />
    ),
    [list.length, colors, T, move],
  );

  const ItemSeparator = useCallback(
    () => <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.separator, marginLeft: 72 }} />,
    [colors.separator],
  );

  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]}>
      <Stack.Title large>收藏夹排序</Stack.Title>
      <Stack.Header blurEffect="systemMaterial" style={{ shadowColor: 'transparent' }} />
      <FlashList
        ref={listRef}
        data={list}
        keyExtractor={(it) => String(it.id)}
        contentContainerStyle={[styles.listContent, list.length > 0 && { backgroundColor: colors.card, borderRadius: RADII.lg, marginHorizontal: 14, marginTop: 12, ...continuous }]}
        showsVerticalScrollIndicator={false}
        estimatedItemSize={76}
        overrideItemLayout={rowLayout}
        drawDistance={250}
        overrideProps={{ initialDrawBatchSize: 10 }}
        ItemSeparatorComponent={ItemSeparator}
        ListEmptyComponent={
          <EmptyState
            icon="folder-open-outline"
            title="没有可排序的收藏夹"
            subtitle="请从收藏页进入本页"
          />
        }
        renderItem={renderRow}
      />
      <Press
        haptic="medium"
        scaleTo={0.97}
        onPress={doSave}
        disabled={saving || list.length === 0}
        style={[styles.saveBtn, { backgroundColor: (saving || list.length === 0) ? '#B8B8BC' : ACCENT, marginBottom: 20 }]}>
        <Ionicons name="checkmark" size={18} color="#FFFFFF" />
        <Text style={[T.subhead, styles.saveText]}>{saving ? '保存中…' : '完成'}</Text>
      </Press>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  listContent: { paddingHorizontal: 16, paddingBottom: 16 },
  /* 行 */
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  coverWrap: { position: 'relative' },
  cover: { width: 56, height: 56, borderRadius: RADII.sm, ...continuous },
  coverEmpty: { justifyContent: 'center', alignItems: 'center' },
  info: { flex: 1, gap: 3 },
  title: { fontWeight: '600' },
  ops: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  moveBtn: { width: 30, height: 30, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  /* 保存按钮 */
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginHorizontal: 16,
    marginTop: 4,
    borderRadius: RADII.lg,
    paddingVertical: 14,
    ...continuous,
  },
  saveText: { color: '#FFFFFF', fontWeight: '600' },
});
