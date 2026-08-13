import { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, RefreshControl, ActivityIndicator, Alert } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useLocalSearchParams, Stack, useRouter, useScrollToTop, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors } from '@/components/SwiftUIHost';
import { useType } from '@/components/type-scale';
import { feedBackSuccess, feedBackSelection, feedBackMedium } from '@/utils/feedback';
import { RADII, continuous, shadow } from '@/theme/tokens';
import { favApi } from '@/api/fav';
import { usePagedList } from '@/hooks/use-paged-list';
import { formatCount } from '@/utils/format';
import { useAuthStore } from '@/stores/auth';
import { showToast } from '@/utils/toast';
import { fixedItemLayout } from '@/utils/list-layout';
import { FavResourceRow, type FavResource } from '@/components/fav/FavResourceRow';
import { FavDetailHeader } from '@/components/fav/FavDetailHeader';
import { FavDetailControls } from '@/components/fav/FavDetailControls';
import { FavMultiBar } from '@/components/fav/FavMultiBar';
import { FavFolderPicker, type FavFolderTarget } from '@/components/fav/FavFolderPicker';
import { FavDetailSkeleton } from '@/components/fav/FavDetailSkeleton';

const rowLayout = fixedItemLayout(112);

interface FolderInfo {
  id: number | string;
  title: string;
  media_count: number;
  cover: string;
  intro: string;
  attr?: number;
}

type FavoriteFolderId = number | string;

function resolveFolderId(raw?: string): FavoriteFolderId | null {
  if (!raw) return null;
  return /^\d+$/.test(raw) ? Number(raw) : raw;
}

export default function FavDetailScreen() {
  const { fid, title } = useLocalSearchParams<{ fid: string; title?: string }>();
  const folderId = resolveFolderId(fid);
  const router = useRouter();
  const colors = useThemeColors();
  const T = useType();
  const { userInfo } = useAuthStore();
  const [folderInfo, setFolderInfo] = useState<FolderInfo | null>(null);
  const [keyword, setKeyword] = useState('');
  const [order, setOrder] = useState<string>('mtime');
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [pickerVisible, setPickerVisible] = useState(false);
  const [pickerKind, setPickerKind] = useState<'copy' | 'move'>('copy');
  const [folderTargets, setFolderTargets] = useState<FavFolderTarget[]>([]);
  const listRef = useRef<any>(null);
  useScrollToTop(listRef);

  const { items, loading, refreshing, loadingMore, refresh, loadMore, setItems } = usePagedList<FavResource>({
    enabled: folderId != null,
    fetchPage: async (page, cancelToken) => {
      const res = await favApi.resourceList({
        media_id: folderId as number, pn: page, ps: 20, keyword: keyword.trim() || undefined, order,
      }, { cancelToken });
      const mapped: FavResource[] = (res?.data?.medias || []).map((m: any) => ({
        id: m.id,
        title: m.title,
        cover: m.cover,
        duration: m.duration,
        upper: { name: m.upper?.name || '', mid: m.upper?.mid || 0 },
        cnt_info: { play: m.cnt_info?.play || 0, collect: m.cnt_info?.collect || 0, danmaku: m.cnt_info?.danmaku || 0 },
        bvid: m.bvid || '',
        type: m.type || 2,
      }));
      return { items: mapped, hasMore: !!res?.data?.has_more };
    },
    onError: (e) => {
      console.error('fav detail load error:', e);
      showToast('收藏内容加载失败');
    },
  });

  const loadFolderInfo = useCallback(async () => {
    if (folderId == null) return;
    try {
      const res = await favApi.folderInfo({ media_id: folderId as number });
      if (res?.code === 0 && res?.data) {
        setFolderInfo({
          id: res.data.id,
          title: res.data.title,
          media_count: res.data.media_count,
          cover: res.data.cover || '',
          intro: res.data.intro || '',
          attr: res.data.attr,
        });
      }
    } catch {}
  }, [folderId]);

  useFocusEffect(useCallback(() => {
    if (folderId == null) return;
    const t = setTimeout(() => {
      loadFolderInfo();
      refresh();
    }, 0);
    return () => clearTimeout(t);
  }, [folderId, loadFolderInfo, refresh]));

  const submitSearch = useCallback(() => {
    setSelected(new Set());
    refresh();
  }, [refresh]);

  const changeOrder = useCallback((key: string) => {
    feedBackSelection();
    setOrder(key);
  }, []);

  useEffect(() => {
    if (!order) return;
    const t = setTimeout(() => refresh(), 0);
    return () => clearTimeout(t);
  }, [order, refresh]);

  const playAll = useCallback(() => {
    const first = items.find((i) => i.bvid);
    if (!first) { showToast('没有可播放的视频'); return; }
    router.push(`/video/${first.bvid}` as any);
  }, [items, router]);

  const editInfo = useCallback(() => {
    router.push(`/fav_create?mediaId=${fid}` as any);
  }, [router, fid]);

  const cleanInvalid = useCallback(() => {
    if (folderId == null) return;
    Alert.alert('清理失效内容', '将移除收藏夹中已失效的视频，是否继续？', [
      { text: '取消', style: 'cancel' },
      {
        text: '清理',
        onPress: async () => {
          try {
            const res = await favApi.clean({ media_id: folderId as number });
            if (res?.code === 0) {
              feedBackSuccess();
              showToast('已清理');
              refresh();
              loadFolderInfo();
            } else {
              showToast(res?.message || '清理失败');
            }
          } catch {
            showToast('清理失败');
          }
        },
      },
    ]);
  }, [folderId, refresh, loadFolderInfo]);

  const toggleSelect = useCallback((id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const singleRemove = useCallback((item: FavResource) => {
    Alert.alert('取消收藏', `确定将「${item.title}」移出收藏夹吗？`, [
      { text: '取消', style: 'cancel' },
      {
        text: '移出',
        style: 'destructive',
        onPress: async () => {
          try {
            const res = await favApi.batchDeal({ rid: item.id, type: item.type || 2, del_media_ids: String(fid) });
            if (res?.code === 0) {
              setItems((prev) => prev.filter((i) => i.id !== item.id));
              setFolderInfo((prev) => prev ? { ...prev, media_count: Math.max(0, prev.media_count - 1) } : prev);
              feedBackSuccess();
              showToast('已移出');
            } else {
              showToast(res?.message || '操作失败');
            }
          } catch {
            showToast('操作失败');
          }
        },
      },
    ]);
  }, [fid]);

  const deleteSelected = useCallback(async () => {
    if (selected.size === 0) return;
    Alert.alert('批量移出', `确定将选中的 ${selected.size} 个内容移出收藏夹吗？`, [
      { text: '取消', style: 'cancel' },
      {
        text: '移出',
        style: 'destructive',
        onPress: async () => {
          try {
            for (const id of selected) {
              const item = items.find((i) => i.id === id);
              await favApi.batchDeal({ rid: id, type: item?.type || 2, del_media_ids: String(fid) });
            }
            setItems((prev) => prev.filter((i) => !selected.has(i.id)));
            setFolderInfo((prev) => prev ? { ...prev, media_count: Math.max(0, prev.media_count - selected.size) } : prev);
            setSelected(new Set());
            setSelectMode(false);
            feedBackSuccess();
            showToast('已移出');
          } catch {
            showToast('批量移出失败');
          }
        },
      },
    ]);
  }, [selected, items, fid]);

  const openPicker = useCallback(async (kind: 'copy' | 'move') => {
    setPickerKind(kind);
    try {
      const res = await favApi.folderAll({ up_mid: userInfo?.mid || 0 });
      const list: FavFolderTarget[] = (res?.data?.list || [])
        .filter((f: any) => String(f.id) !== String(fid))
        .map((f: any) => ({ id: f.id, title: f.title, media_count: f.media_count || 0 }));
      setFolderTargets(list);
      setPickerVisible(true);
    } catch {
      showToast('收藏夹列表加载失败');
    }
  }, [userInfo, fid]);

  const doCopyMove = useCallback(async (tarId: number) => {
    if (folderId == null) return;
    const resources = items
      .filter((i) => selected.has(i.id))
      .map((i) => (i.bvid ? `bvid:${i.bvid}` : `aid:${i.id}`))
      .join(',');
    if (!resources) return;
    try {
      const res = await favApi.copyOrMove({
        isCopy: pickerKind === 'copy',
        srcMediaId: folderId as number,
        tarMediaId: tarId,
        resources,
      });
      if (res?.code === 0) {
        feedBackSuccess();
        showToast(pickerKind === 'copy' ? '已复制' : '已移动');
        if (pickerKind === 'move') {
          setItems((prev) => prev.filter((i) => !selected.has(i.id)));
          setFolderInfo((prev) => prev ? { ...prev, media_count: Math.max(0, prev.media_count - selected.size) } : prev);
        }
        setSelected(new Set());
        setSelectMode(false);
        setPickerVisible(false);
      } else {
        showToast(res?.message || '操作失败');
      }
    } catch {
      showToast('操作失败');
    }
  }, [items, selected, pickerKind, folderId]);

  const renderRow = useCallback(
    ({ item, index }: { item: FavResource; index: number }) => (
      <FavResourceRow
        item={item}
        index={index}
        colors={colors}
        T={T}
        selectMode={selectMode}
        selected={selected}
        onToggle={toggleSelect}
        onLongPress={singleRemove}
      />
    ),
    [colors, T, selectMode, selected, toggleSelect, singleRemove],
  );

  const ItemSeparator = useCallback(
    () => <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.separator, marginLeft: 152 }} />,
    [colors.separator],
  );

  const listContentStyle = [
    styles.listContent,
    items.length > 0 && { backgroundColor: colors.card, borderRadius: RADII.lg, marginHorizontal: 14, marginTop: 12, ...continuous, ...shadow('sm', colors.isDark) },
  ];

  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]}>
      <Stack.Title large>{folderInfo?.title || String(title || '收藏详情')}</Stack.Title>
      <Stack.Header blurEffect="systemMaterial" style={{ shadowColor: 'transparent' }} />

      <FavDetailHeader
        title={folderInfo?.title || '收藏详情'}
        subtitle={`${formatCount(folderInfo?.media_count ?? items.length)} 个内容${folderInfo?.intro ? ` · ${folderInfo.intro}` : ''}`}
        selectMode={selectMode}
        colors={colors}
        T={T}
        onPlayAll={playAll}
        onEdit={editInfo}
        onClean={cleanInvalid}
        onToggleSelect={() => {
          if (selectMode) {
            setSelected(new Set());
            setSelectMode(false);
          } else {
            setSelectMode(true);
          }
        }}
      />

      <FavDetailControls
        keyword={keyword}
        onKeywordChange={setKeyword}
        onSubmit={submitSearch}
        onClear={() => setKeyword('')}
        order={order}
        onChangeOrder={changeOrder}
        colors={colors}
        T={T}
      />

      <FlashList
        ref={listRef}
        data={items}
        keyExtractor={(it) => String(it.id)}
        contentContainerStyle={listContentStyle}
        showsVerticalScrollIndicator={false}
        onEndReached={loadMore}
        onEndReachedThreshold={0.4}
        estimatedItemSize={112}
        overrideItemLayout={rowLayout}
        drawDistance={250}
        overrideProps={{ initialDrawBatchSize: 10 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { feedBackMedium(); refresh(); }} tintColor={colors.textSecondary} />}
        ItemSeparatorComponent={ItemSeparator}
        ListFooterComponent={
          loadingMore ? <ActivityIndicator size="small" color={colors.textTertiary} style={{ marginVertical: 16 }} /> : null
        }
        ListEmptyComponent={
          loading ? null : (
            <View style={styles.emptyWrap}>
              <View style={[styles.emptyIconBox, { backgroundColor: colors.fill2 }]}>
                <Ionicons name="star-outline" size={38} color={colors.textTertiary} />
              </View>
              <Text style={[T.headline, styles.emptyTitle, { color: colors.text }]}>收藏夹为空</Text>
              <Text style={[T.footnote, styles.emptySub, { color: colors.textSecondary }]}>这里还没有收藏任何视频</Text>
            </View>
          )
        }
        renderItem={renderRow}
      />

      {selectMode && (
        <FavMultiBar
          selectedCount={selected.size}
          totalCount={items.length}
          colors={colors}
          T={T}
          onSelectAll={() => setSelected(new Set(items.map((i) => i.id)))}
          onCopy={() => openPicker('copy')}
          onMove={() => openPicker('move')}
          onDelete={deleteSelected}
          onCancel={() => { setSelectMode(false); setSelected(new Set()); }}
        />
      )}

      {loading && items.length === 0 && <FavDetailSkeleton colors={colors} />}

      <FavFolderPicker
        visible={pickerVisible}
        kind={pickerKind}
        targets={folderTargets}
        colors={colors}
        T={T}
        onClose={() => setPickerVisible(false)}
        onPick={doCopyMove}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  listContent: { paddingHorizontal: 16, paddingBottom: 40 },
  emptyWrap: { alignItems: 'center', justifyContent: 'center', paddingTop: 110, paddingHorizontal: 40, gap: 8 },
  emptyIconBox: { width: 84, height: 84, borderRadius: 42, justifyContent: 'center', alignItems: 'center', marginBottom: 8 },
  emptyTitle: { fontWeight: '600' },
  emptySub: { textAlign: 'center', lineHeight: 18 },
});
