import { useState, useEffect, useCallback, useRef, memo } from 'react';
import { View, Text, StyleSheet, RefreshControl, Alert, LayoutAnimation } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Stack, useRouter, Link, useScrollToTop } from 'expo-router';
import { Image as ExpoImage } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useReducedMotion } from 'react-native-reanimated';
import { useThemeColors, ACCENT } from '@/components/SwiftUIHost';
import { favApi } from '@/api/fav';
import { videoApi } from '@/api/video';
import { usePagedList } from '@/hooks/use-paged-list';
import { formatDuration } from '@/utils/format';
import { useAuthStore } from '@/stores/auth';
import { Press } from '@/components/motion';
import { useType } from '@/components/type-scale';
import { RADII, continuous } from '@/theme/tokens';
import { feedBackMedium, feedBackSuccess } from '@/utils/feedback';
import { showToast } from '@/utils/toast';
import { fixedItemLayout } from '@/utils/list-layout';
import { biliCover } from '@/utils/image-url';
import { SkeletonMediaRow } from '@/components/Skeleton';
import EmptyState from '@/components/EmptyState';
import { setMediaQueueCache } from '@/hooks/use-video-controller';

const rowLayout = fixedItemLayout(82);

/* 行删除收缩动画（05-C3 列表删除规范：高度收缩 250ms + opacity 后再移除数据）。
   FlashList 2.0.2 无 removingItem prop（该接口为 1.x 旧版），
   改用 LayoutAnimation.configureNext 触发 RN 布局动画 + FlashList 的
   prepareForLayoutAnimationRender() 关闭回收池避免动画错位。 */
function animateRowDelete(reduced: boolean) {
  if (reduced) return; // 系统"减弱动态效果"时跳过动画，直接移除
  LayoutAnimation.configureNext({
    duration: 250,
    create: { type: 'easeInEaseOut', property: 'opacity' },
    update: { type: 'easeInEaseOut' },
    delete: { type: 'easeInEaseOut', property: 'opacity' },
  });
}

interface ToViewItem {
  aid: number;
  bvid: string;
  title: string;
  pic: string;
  duration: number;
  owner: { name: string; mid: number };
  add_at: number;
}

/* ===== 行 ===== */
const LaterRow = memo(function LaterRow({
  item,
  index: _index,
  colors,
  onRemove,
}: {
  item: ToViewItem;
  index: number;
  colors: ReturnType<typeof useThemeColors>;
  onRemove?: (item: ToViewItem) => void;
}) {
  const T = useType();
  return (
    <>
      <Link href={{ pathname: '/video/[id]', params: { id: item.bvid } } as any} asChild>
      <Press haptic scaleTo={0.98} style={styles.row}>
        <View style={styles.coverWrap}>
          <ExpoImage
            source={{ uri: biliCover(item.pic, 320, 200) }}
            recyclingKey={item.pic}
            cachePolicy="memory-disk"
            style={[styles.cover, { backgroundColor: colors.fill2 }]}
            contentFit="cover"
          />
          <View style={styles.durationBadge}>
            <Text style={styles.durationText}>{formatDuration(item.duration)}</Text>
          </View>
        </View>
        <View style={styles.rowInfo}>
          <Text style={[T.subhead, styles.title, { color: colors.text }]} numberOfLines={2}>{item.title}</Text>
          <Text style={[T.caption1, styles.author, { color: colors.textSecondary }]} numberOfLines={1}>{item.owner.name}</Text>
        </View>
        {onRemove ? (
          <Press haptic scaleTo={0.9} onPress={() => onRemove(item)} style={styles.removeBtn}>
            <Ionicons name="close" size={16} color={colors.textTertiary} />
          </Press>
        ) : null}
      </Press>
      </Link>
    </>
  );
});

export default function LaterScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const T = useType();
  const reducedMotion = useReducedMotion();
  const { isLoggedIn } = useAuthStore();
  const [viewed, setViewed] = useState<number | undefined>(undefined);
  const [keyword, setKeyword] = useState('');
  // FlashList v2 是函数组件、无实例类型；useScrollToTop 只需可滚动对象的 ref
  const listRef = useRef<any>(null);
  useScrollToTop(listRef);
  const firstFilterRef = useRef(true);

  const { items, loading, refreshing, refresh, setItems } = usePagedList<ToViewItem>({
    enabled: isLoggedIn,
    fetchPage: async (_page, cancelToken) => {
      const res = await favApi.toViewList({ viewed, key: keyword || undefined }, { cancelToken });
      return {
        items: (res?.data?.list || []).map((i: any) => ({
          aid: i.aid,
          bvid: i.bvid,
          title: i.title,
          pic: i.pic,
          duration: i.duration,
          owner: { name: i.owner?.name || '', mid: i.owner?.mid || 0 },
          add_at: i.add_at,
        })),
        hasMore: false,
      };
    },
    onError: () => {},
  });

  useEffect(() => {
    if (firstFilterRef.current) {
      firstFilterRef.current = false;
      return;
    }
    const t = setTimeout(() => refresh(), 0);
    return () => clearTimeout(t);
  }, [viewed, keyword, refresh]);

  const removeItem = useCallback(async (item: ToViewItem) => {
    try {
      await favApi.delToView({ resources: String(item.aid) });
      // 收缩动画：先配置 250ms 高度+透明度布局动画，并关闭回收池，再移除数据
      animateRowDelete(reducedMotion);
      listRef.current?.prepareForLayoutAnimationRender?.();
      setItems((prev) => prev.filter((x) => x.aid !== item.aid));
      feedBackSuccess();
    } catch {
      showToast('删除失败');
    }
  }, [setItems, reducedMotion]);

  /* 清空失效（02-2.3 稍后再看分开操作）：逐项校验 videoApi.view 有效性，失效条目批量移除 */
  const clearInvalid = useCallback(() => {
    if (items.length === 0) return;
    Alert.alert('清空失效', `将逐项校验 ${items.length} 个视频，移除已失效（已删除/无法访问）的条目？`, [
      { text: '取消', style: 'cancel' },
      {
        text: '清空失效',
        style: 'destructive',
        onPress: async () => {
          try {
            const invalid: ToViewItem[] = [];
            const CHUNK = 3; // 并发校验上限，避免瞬时打爆接口
            for (let i = 0; i < items.length; i += CHUNK) {
              const chunk = items.slice(i, i + CHUNK);
              const results = await Promise.all(
                chunk.map((it) =>
                  videoApi.view({ bvid: it.bvid })
                    .then((r) => r?.code === 0)
                    .catch(() => false),
                ),
              );
              results.forEach((ok, j) => {
                if (!ok) invalid.push(chunk[j]);
              });
            }
            if (invalid.length === 0) {
              showToast('没有失效条目');
              return;
            }
            await favApi.delToView({ resources: invalid.map((x) => String(x.aid)).join(',') });
            animateRowDelete(reducedMotion);
            listRef.current?.prepareForLayoutAnimationRender?.();
            setItems((prev) => prev.filter((x) => !invalid.some((v) => v.aid === x.aid)));
            feedBackSuccess();
            showToast(`已移除 ${invalid.length} 个失效条目`);
          } catch {
            showToast('清空失效失败');
          }
        },
      },
    ]);
  }, [items, setItems, reducedMotion]);

  /* 清空看完（02-2.3 稍后再看分开操作）：拉取已看完列表，批量移除 */
  const clearViewed = useCallback(() => {
    if (items.length === 0) return;
    Alert.alert('清空看完', '将移除稍后再看中已看完的视频？', [
      { text: '取消', style: 'cancel' },
      {
        text: '清空看完',
        style: 'destructive',
        onPress: async () => {
          try {
            const res = await favApi.toViewList({ viewed: 1, ps: 50 });
            const watched = ((res?.data?.list || []) as any[]).map((i) => i.aid).filter((a: any) => typeof a === 'number');
            if (watched.length === 0) {
              showToast('没有已看完的条目');
              return;
            }
            await favApi.delToView({ resources: watched.join(',') });
            animateRowDelete(reducedMotion);
            listRef.current?.prepareForLayoutAnimationRender?.();
            setItems((prev) => prev.filter((x) => !watched.includes(x.aid)));
            feedBackSuccess();
            showToast(`已移除 ${watched.length} 个已看完条目`);
          } catch {
            showToast('清空看完失败');
          }
        },
      },
    ]);
  }, [setItems, reducedMotion]);

  /* 播放全部：写入连播队列缓存并携带 queue=1 push，视频页接管后自动连播（02-2.2 medialist） */
  const playAll = useCallback(() => {
    if (items.length === 0) return;
    setMediaQueueCache(
      items.map((it) => ({
        aid: it.aid,
        bvid: it.bvid,
        cid: 0,
        title: it.title,
        pic: it.pic,
        duration: it.duration,
      })),
      '稍后再看',
    );
    router.push({ pathname: '/video/[id]', params: { id: items[0].bvid, queue: '1' } } as any);
  }, [items, router]);

  const renderRow = useCallback(
    ({ item, index }: { item: ToViewItem; index: number }) => (
      <LaterRow item={item} index={index} colors={colors} onRemove={removeItem} />
    ),
    [colors, removeItem],
  );

  const ItemSeparator = useCallback(() => <View style={{ height: 12 }} />, []);


  /* 未登录空态（共享 EmptyState + 去登录 children） */
  if (!isLoggedIn) {
    return (
      <View style={[styles.root, { backgroundColor: colors.bg }]}>
        <Stack.Title large>稍后再看</Stack.Title>
        <Stack.Header blurEffect="systemMaterial" style={{ shadowColor: 'transparent' }} />
        <EmptyState icon="person-circle-outline" title="请先登录" subtitle="登录后查看稍后再看列表">
          <Press haptic scaleTo={0.94} onPress={() => router.push('/login' as any)} style={styles.loginBtn}>
            <Text style={[T.subhead, styles.loginBtnText]}>去登录</Text>
          </Press>
        </EmptyState>
      </View>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]}>
      <Stack.Title large>稍后再看</Stack.Title>
      <Stack.Header blurEffect="systemMaterial" style={{ shadowColor: 'transparent' }} />
      <Stack.SearchBar
        placeholder="搜索稍后再看"
        autoCapitalize="none"
        onChangeText={(e: any) => setKeyword(typeof e === 'string' ? e : e?.nativeEvent?.text ?? '')}
        tintColor={ACCENT}
        textColor={colors.text}
        hintTextColor={colors.textTertiary}
        headerIconColor={colors.textSecondary}
      />
      <View style={styles.toolbar}>
        <View style={styles.chipRow}>
          {[{ label: '全部', value: undefined }, { label: '未看完', value: 0 }, { label: '已看完', value: 1 }].map((c) => (
            <Press
              key={c.label}
              haptic
              scaleTo={0.92}
              onPress={() => setViewed(c.value)}
              style={[styles.chip, { backgroundColor: viewed === c.value ? ACCENT : colors.fill2 }]}>
              <Text style={[T.caption1, { color: viewed === c.value ? '#FFFFFF' : colors.textSecondary }]}>{c.label}</Text>
            </Press>
          ))}
        </View>
        <View style={styles.actionRow}>
          <Press haptic scaleTo={0.94} onPress={playAll} style={[styles.actionBtn, { backgroundColor: colors.fill2 }]}>
            <Ionicons name="play" size={15} color={colors.text} />
            <Text style={[T.footnote, { color: colors.text }]}>播放全部</Text>
          </Press>
          <Press haptic scaleTo={0.94} onPress={() => router.push('/later_search' as any)} style={[styles.actionBtn, { backgroundColor: colors.fill2 }]}>
            <Ionicons name="search" size={15} color={colors.text} />
            <Text style={[T.footnote, { color: colors.text }]}>搜索</Text>
          </Press>
          <Press haptic scaleTo={0.94} onPress={clearInvalid} style={[styles.actionBtn, { backgroundColor: colors.fill2 }]}>
            <Ionicons name="alert-circle-outline" size={15} color={colors.text} />
            <Text style={[T.footnote, { color: colors.text }]}>清空失效</Text>
          </Press>
          <Press haptic scaleTo={0.94} onPress={clearViewed} style={[styles.actionBtn, { backgroundColor: colors.fill2 }]}>
            <Ionicons name="checkmark-circle-outline" size={15} color={colors.text} />
            <Text style={[T.footnote, { color: colors.text }]}>清空看完</Text>
          </Press>
        </View>
      </View>
      <FlashList
        ref={listRef}
        data={items}
        keyExtractor={(it) => it.bvid}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { feedBackMedium(); refresh(); }} tintColor={colors.textSecondary} />}
        estimatedItemSize={82}
        overrideItemLayout={rowLayout}
        drawDistance={250}
        overrideProps={{ initialDrawBatchSize: 10 }}
        ListEmptyComponent={
          loading ? null : (
            /* 空态：共享 EmptyState（收敛 33 处 emptyIconBox 复制粘贴） */
            <EmptyState icon="checkbox-outline" title="稍后再看列表为空" subtitle="把想看的视频加入稍后再看吧" />
          )
        }
        renderItem={renderRow}
        ItemSeparatorComponent={ItemSeparator}
      />
      {loading && items.length === 0 && (
        <View style={styles.skeletonOverlay}>
          <SkeletonMediaRow mediaWidth={132} mediaHeight={82} lines={3} />
          <SkeletonMediaRow mediaWidth={132} mediaHeight={82} lines={3} />
          <SkeletonMediaRow mediaWidth={132} mediaHeight={82} lines={3} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  listContent: { paddingHorizontal: 14, paddingTop: 12, paddingBottom: 40 },
  /* 行 */
  row: { flexDirection: 'row', gap: 12 },
  coverWrap: { position: 'relative' },
  cover: { width: 132, height: 82, borderRadius: RADII.sm, ...continuous },
  durationBadge: { position: 'absolute', bottom: 6, right: 6, backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  durationText: { color: '#FFFFFF', fontSize: 10.5, fontWeight: '600' },
  rowInfo: { flex: 1, justifyContent: 'center', gap: 7 },
  title: { fontWeight: '600' },
  author: {},
  removeBtn: { padding: 8, alignSelf: 'center' },
  toolbar: { paddingHorizontal: 14, paddingTop: 12, gap: 10 },
  chipRow: { flexDirection: 'row', gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 16 },
  actionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 14 },
  /* 登录按钮 */
  loginBtn: { marginTop: 14, backgroundColor: ACCENT, borderRadius: 20, paddingHorizontal: 30, paddingVertical: 10 },
  loginBtnText: { color: '#FFFFFF', fontWeight: '600' },
  /* 骨架 */
  skeletonOverlay: { position: 'absolute', top: 0, left: 0, right: 0, paddingHorizontal: 14, paddingTop: 12, gap: 12 },
});
