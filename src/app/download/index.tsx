import { useState, useCallback, useEffect } from 'react';
import { View, Text, StyleSheet, RefreshControl, Alert } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Stack, useRouter, useFocusEffect } from 'expo-router';
import { Image as ExpoImage } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors, ACCENT } from '@/components/SwiftUIHost';
import { useType } from '@/components/type-scale';
import { Press } from '@/components/motion';
import {
  getDownloads,
  removeDownload,
  removeDownloads,
  clearDownloads,
  exportDownloadsToClipboard,
  subscribeDownloadsChanged,
  type DownloadItem,
} from '@/utils/download';
import { showToast } from '@/utils/toast';
import { fixedItemLayout } from '@/utils/list-layout';
import { biliCover } from '@/utils/image-url';

const rowLayout = fixedItemLayout(102);

export default function DownloadScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const T = useType();
  const [items, setItems] = useState<DownloadItem[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    try {
      setItems(await getDownloads());
    } finally {
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load(true);
    }, [load]),
  );

  useEffect(() => subscribeDownloadsChanged(() => { void load(false); }), [load]);

  const enterSelect = useCallback(() => {
    setSelected(new Set());
    setSelectMode(true);
  }, []);

  const exitSelect = useCallback(() => {
    setSelectMode(false);
    setSelected(new Set());
  }, []);

  const toggleSelect = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback(() => {
    setSelected((prev) => {
      if (items.length > 0 && prev.size === items.length) return new Set<string>();
      return new Set(items.map((it) => it.id));
    });
  }, [items]);

  const deleteSelected = useCallback(() => {
    if (selected.size === 0) {
      showToast('请先选择下载');
      return;
    }
    const ids = Array.from(selected);
    Alert.alert('删除所选', `确定删除选中的 ${ids.length} 个下载吗？`, [
      { text: '取消', style: 'cancel' },
      {
        text: '删除',
        style: 'destructive',
        onPress: async () => {
          await removeDownloads(ids);
          setItems(await getDownloads());
          setSelected(new Set());
          setSelectMode(false);
        },
      },
    ]);
  }, [selected]);

  const exportSelected = useCallback(async () => {
    const targets = selected.size > 0 ? items.filter((it) => selected.has(it.id)) : items;
    if (targets.length === 0) {
      showToast('没有可导出的下载');
      return;
    }
    try {
      await exportDownloadsToClipboard(targets);
      showToast('已导出到剪贴板');
    } catch {
      showToast('导出失败');
    }
  }, [items, selected]);

  const playSelected = useCallback(() => {
    const targets = selected.size > 0 ? items.filter((it) => selected.has(it.id)) : items;
    const first = targets.find((it) => it.status === 'done' && it.path);
    if (!first) {
      showToast('没有可播放的本地文件');
      return;
    }
    router.push({ pathname: '/download/player', params: { uri: first.path, title: first.title } } as any);
  }, [items, router, selected]);

  const del = useCallback((item: DownloadItem) => {
    Alert.alert('删除下载', `确定删除“${item.title}”吗？`, [
      { text: '取消', style: 'cancel' },
      {
        text: '删除',
        style: 'destructive',
        onPress: async () => {
          await removeDownload(item.id);
          setItems(await getDownloads());
        },
      },
    ]);
  }, []);

  const clearAll = useCallback(() => {
    Alert.alert('清空下载', '确定清空全部下载吗？', [
      { text: '取消', style: 'cancel' },
      {
        text: '清空',
        style: 'destructive',
        onPress: async () => {
          await clearDownloads();
          setItems([]);
        },
      },
    ]);
  }, []);

  const play = useCallback((item: DownloadItem) => {
    if (item.status !== 'done' || !item.path) {
      showToast('文件未下载完成');
      return;
    }
    router.push({ pathname: '/download/player', params: { uri: item.path, title: item.title } } as any);
  }, [router]);

  const renderRow = useCallback(
    ({ item }: { item: DownloadItem }) => {
      const isSelected = selected.has(item.id);
      return (
        <View>
          <Press
            haptic
            scaleTo={0.98}
            onPress={() => (selectMode ? toggleSelect(item.id) : play(item))}
            style={[
              styles.row,
              { backgroundColor: isSelected ? 'rgba(251,114,153,0.10)' : colors.card },
            ]}>
            {selectMode && (
              <View
                style={[
                  styles.checkCircle,
                  {
                    borderColor: isSelected ? ACCENT : colors.textTertiary,
                    backgroundColor: isSelected ? ACCENT : 'transparent',
                  },
                ]}>
                {isSelected ? <Ionicons name="checkmark" size={12} color="#FFFFFF" /> : null}
              </View>
            )}
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
              </View>
            </View>
            {!selectMode && (
              <Press haptic scaleTo={0.88} onPress={() => del(item)} style={styles.delBtn}>
                <Ionicons name="trash-outline" size={16} color={colors.textTertiary} />
              </Press>
            )}
          </Press>
        </View>
      );
    },
    [colors, T, del, play, selectMode, selected, toggleSelect],
  );

  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]}>
      <Stack.Title large>离线缓存</Stack.Title>
      <Stack.Header blurEffect="systemMaterial" style={{ shadowColor: 'transparent' }} />
      <View style={styles.headerRow}>
        <Text style={[T.caption1, { color: colors.textTertiary }]}>
          {selectMode ? `已选 ${selected.size} / ${items.length}` : `${items.length} 个下载`}
        </Text>
        <View style={styles.headerActions}>
          {selectMode ? (
            <>
              <Press haptic scaleTo={0.92} onPress={toggleSelectAll} style={[styles.clearBtn, { backgroundColor: colors.fill2 }]}>
                <Text style={[T.footnote, { color: colors.text }]}>
                  {selected.size === items.length && items.length > 0 ? '取消全选' : '全选'}
                </Text>
              </Press>
              <Press haptic scaleTo={0.92} onPress={exitSelect} style={[styles.clearBtn, { backgroundColor: colors.fill2 }]}>
                <Text style={[T.footnote, { color: colors.text }]}>取消</Text>
              </Press>
            </>
          ) : (
            <>
              <Press haptic scaleTo={0.92} onPress={enterSelect} style={[styles.clearBtn, { backgroundColor: colors.fill2 }]}>
                <Text style={[T.footnote, { color: colors.text }]}>选择</Text>
              </Press>
              <Press haptic scaleTo={0.92} onPress={clearAll} style={[styles.clearBtn, { backgroundColor: colors.fill2 }]}>
                <Text style={[T.footnote, { color: colors.text }]}>清空</Text>
              </Press>
            </>
          )}
        </View>
      </View>
      {selectMode && (
        <View style={styles.actionRow}>
          <Press haptic scaleTo={0.94} onPress={playSelected} style={[styles.actionBtn, { backgroundColor: colors.fill2 }]}>
            <Ionicons name="play" size={15} color={colors.text} />
            <Text style={[T.footnote, { color: colors.text }]}>播放全部</Text>
          </Press>
          <Press haptic scaleTo={0.94} onPress={exportSelected} style={[styles.actionBtn, { backgroundColor: colors.fill2 }]}>
            <Ionicons name="copy-outline" size={15} color={colors.text} />
            <Text style={[T.footnote, { color: colors.text }]}>导出</Text>
          </Press>
          <Press haptic scaleTo={0.94} onPress={deleteSelected} style={[styles.actionBtn, { backgroundColor: 'rgba(255,59,48,0.12)' }]}>
            <Ionicons name="trash-outline" size={15} color="#FF3B30" />
            <Text style={[T.footnote, { color: '#FF3B30', fontWeight: '600' }]}>删除</Text>
          </Press>
        </View>
      )}
      <FlashList
        data={items}
        keyExtractor={(it) => it.id}
        contentContainerStyle={styles.listContent}
        estimatedItemSize={102}
        overrideItemLayout={rowLayout}
        windowSize={9}
        initialNumToRender={10}
        maxToRenderPerBatch={12}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={colors.textSecondary} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="download-outline" size={38} color={colors.textTertiary} />
            <Text style={[T.headline, { color: colors.text }]}>暂无缓存</Text>
            <Text style={[T.footnote, { color: colors.textSecondary }]}>在视频页选择下载后，文件会显示在这里</Text>
          </View>
        }
        renderItem={renderRow}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingTop: 10 },
  headerActions: { flexDirection: 'row', gap: 8 },
  actionRow: { flexDirection: 'row', gap: 10, paddingHorizontal: 14, paddingTop: 10 },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 14 },
  clearBtn: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 12 },
  listContent: { paddingHorizontal: 14, paddingTop: 10, paddingBottom: 40, gap: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10, borderRadius: 14 },
  checkCircle: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  cover: { width: 132, height: 82, borderRadius: 10 },
  info: { flex: 1, gap: 6 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  delBtn: { padding: 8 },
  empty: { alignItems: 'center', paddingTop: 120, gap: 10 },
});
