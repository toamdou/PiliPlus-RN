/**
 * notes —— 视频笔记列表页（对齐 Flutter lib/pages/video/note/view.dart）。
 *
 * 结构：
 *  - 顶部自定义栏：返回 + "笔记(N)" 标题 + 关闭；
 *  - 中部 ScrollView 笔记列表（下拉刷新 + 触底加载更多，pn/ps 分页对齐 Flutter）；
 *  - 底部固定"开始记笔记"按钮 → 打开 H5 记笔记页。
 *
 * 每条笔记：作者头像 / 作者名 / 发布时间 / 摘要 / "查看全部"，
 * 点击整条 → 打开对应专栏（走统一 openLink：站内/WebBrowser/外部浏览器按设置）。
 */
import { useState, useCallback, memo } from 'react';
import { View, Text, StyleSheet, RefreshControl, ActivityIndicator } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Stack, useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image as ExpoImage } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors, ACCENT } from '@/components/SwiftUIHost';
import { Press } from '@/components/motion';
import { useType } from '@/components/type-scale';
import { RADII, continuous } from '@/theme/tokens';
import { videoApi } from '@/api/video';
import { usePagedList } from '@/hooks/use-paged-list';
import { feedBackSuccess, openLink } from '@/utils/feedback';
import { biliCover } from '@/utils/image-url';

interface NoteAuthor {
  mid: number;
  name: string;
  face: string;
  level: number;
}

interface NoteItem {
  cvid: number;
  summary: string;
  pubtime: string;
  author: NoteAuthor;
}

/* ===== 单条笔记 ===== */
const NoteRow = memo(function NoteRow({
  item,
  index,
  colors,
  T,
}: {
  item: NoteItem;
  index: number;
  colors: ReturnType<typeof useThemeColors>;
  T: ReturnType<typeof useType>;
}) {
  const openArticle = () => {
    openLink(`https://www.bilibili.com/read/cv${item.cvid}`);
  };
  return (
    <View>
      <Press
        haptic
        scaleTo={0.98}
        onPress={openArticle}
        style={styles.noteRow}>
        <ExpoImage
          source={{ uri: biliCover(item.author.face, 68, 68) }}
          recyclingKey={item.author.face}
          cachePolicy="memory-disk"
          style={[styles.avatar, { backgroundColor: colors.fill2 }]}
          contentFit="cover"
        />
        <View style={styles.noteBody}>
          <Text style={[T.footnote, { color: colors.textSecondary, fontWeight: '600' }]} numberOfLines={1}>
            {item.author.name}
          </Text>
          {item.pubtime ? (
            <Text style={[T.caption1, { color: colors.textTertiary, marginTop: 3 }]}>{item.pubtime}</Text>
          ) : null}
          {item.summary ? (
            <>
              <Text style={[T.subhead, { color: colors.text, marginTop: 6, lineHeight: 22 }]}>{item.summary}</Text>
              <Press haptic scaleTo={1} onPress={openArticle} style={{ alignSelf: 'flex-start', marginTop: 2 }}>
                <Text style={[T.subhead, { color: ACCENT, fontWeight: '600' }]}>查看全部</Text>
              </Press>
            </>
          ) : null}
        </View>
      </Press>
    </View>
  );
});

export default function NotesScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const T = useType();
  const insets = useSafeAreaInsets();
  const { oid, title } = useLocalSearchParams<{ oid: string; title?: string }>();
  const oidNum = Number(oid) || 0;

  const [total, setTotal] = useState(-1);
  const { items: notes, loading, refreshing, loadingMore, hasMore, error, refresh, loadMore } = usePagedList<NoteItem>({
    enabled: oidNum > 0,
    fetchPage: async (page, cancelToken) => {
      const res = await videoApi.noteList({ oid: oidNum, pn: page, ps: 10 }, { cancelToken });
      const list: any[] = res?.data?.list || [];
      const mapped: NoteItem[] = list.map((i) => ({
        cvid: i.cvid,
        summary: i.summary || '',
        pubtime: i.pubtime || '',
        author: {
          mid: i.author?.mid || 0,
          name: i.author?.name || '',
          face: i.author?.face || '',
          level: i.author?.level || 0,
        },
      }));
      const pageTotal = res?.data?.page?.total ?? -1;
      setTotal(pageTotal);
      return {
        items: mapped,
        hasMore: pageTotal === -1 ? mapped.length >= 10 : page * 10 < pageTotal,
      };
    },
    onError: (e) => {
      console.error('load notes error:', e);
    },
  });

  const onRefresh = useCallback(() => {
    feedBackSuccess();
    refresh();
  }, [refresh]);

  const onLoadMore = useCallback(() => {
    loadMore();
  }, [loadMore]);

  const openNoteEditor = () => {
    openLink(`https://www.bilibili.com/h5/note-app?oid=${oidNum}&pagefrom=ugcvideo`);
  };

  const renderNote = useCallback(
    ({ item, index }: { item: NoteItem; index: number }) => (
      <NoteRow item={item} index={index} colors={colors} T={T} />
    ),
    [colors, T],
  );

  const NoteSeparator = useCallback(
    () => <View style={[styles.separator, { backgroundColor: colors.separator }]} />,
    [colors.separator],
  );

  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]}>
      <Stack.Screen options={{ headerShown: false, title: title || '笔记' }} />

      {/* 顶部自定义栏 */}
      <View
        style={[
          styles.header,
          { paddingTop: insets.top + 6, backgroundColor: colors.bg, borderBottomColor: colors.separator },
        ]}>
        <Press haptic scaleTo={0.88} onPress={() => router.back()} style={styles.headerBtn}>
          <Ionicons name="chevron-back" size={22} color={ACCENT} />
        </Press>
        <Text style={[T.headline, { color: colors.text, flex: 1, textAlign: 'center' }]} numberOfLines={1}>
          {total === -1 ? '笔记' : `笔记(${total})`}
        </Text>
        <Press haptic scaleTo={0.88} onPress={() => router.back()} style={styles.headerBtn}>
          <Ionicons name="close" size={20} color={colors.textSecondary} />
        </Press>
      </View>

      {/* 笔记列表 */}
      <FlashList
        style={{ flex: 1 }}
        data={notes}
        keyExtractor={(it) => String(it.cvid)}
        contentContainerStyle={[styles.listContent, notes.length > 0 && { backgroundColor: colors.card, borderRadius: RADII.card, overflow: 'hidden', ...continuous }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.textSecondary} />}
        onEndReached={onLoadMore}
        onEndReachedThreshold={0.3}
        estimatedItemSize={160}
        windowSize={9}
        initialNumToRender={10}
        maxToRenderPerBatch={12}
        drawDistance={250}
        overrideProps={{ initialDrawBatchSize: 10 }}
        ListEmptyComponent={
          loading ? (
            <View style={styles.stateWrap}>
              <ActivityIndicator size="large" color={colors.textTertiary} />
            </View>
          ) : error ? (
            <View style={styles.stateWrap}>
              <Ionicons name="alert-circle-outline" size={40} color={colors.textTertiary} />
              <Text style={[T.footnote, { color: '#FF6B6B', marginTop: 10 }]}>{error}</Text>
              <Press haptic scaleTo={0.97} onPress={refresh} style={[styles.retryBtn, { backgroundColor: colors.fill1 }]}>
                <Text style={[T.footnote, { color: ACCENT, fontWeight: '600' }]}>重试</Text>
              </Press>
            </View>
          ) : (
            <View style={styles.stateWrap}>
              <View style={[styles.emptyIconBox, { backgroundColor: colors.fill2 }]}>
                <Ionicons name="document-text-outline" size={38} color={colors.textTertiary} />
              </View>
              <Text style={[T.headline, { color: colors.text, marginTop: 14, fontWeight: '600' }]}>暂无笔记</Text>
              <Text style={[T.footnote, { color: colors.textSecondary, marginTop: 6 }]}>快来记录第一条笔记吧</Text>
            </View>
          )
        }
        ListFooterComponent={
          !hasMore && notes.length > 0 ? (
            <Text style={[T.caption1, { color: colors.textTertiary, textAlign: 'center', paddingVertical: 14 }]}>
              没有更多了
            </Text>
          ) : null
        }
        ItemSeparatorComponent={NoteSeparator}
        renderItem={renderNote}
      />

      {/* 底部固定按钮 */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + 6, backgroundColor: colors.bg, borderTopColor: colors.separator }]}>
        <Press haptic scaleTo={0.97} onPress={openNoteEditor} style={[styles.startBtn, continuous]}>
          <Ionicons name="create-outline" size={17} color="#FFFFFF" />
          <Text style={[T.subhead, { color: '#FFFFFF', fontWeight: '600' }]}>开始记笔记</Text>
        </Press>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  /* 顶栏 */
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: 8,
    paddingHorizontal: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerBtn: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
  /* 列表 */
  listContent: { paddingHorizontal: 14, paddingTop: 12, paddingBottom: 40 },
  card: {
    borderRadius: RADII.card,
    ...continuous,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
    overflow: 'hidden',
  },
  noteRow: { flexDirection: 'row', padding: 14, gap: 12 },
  separator: { height: StyleSheet.hairlineWidth, marginLeft: 60 },
  avatar: { width: 34, height: 34, borderRadius: RADII.circle },
  noteBody: { flex: 1 },
  /* 状态 */
  stateWrap: { alignItems: 'center', justifyContent: 'center', paddingTop: 90, paddingHorizontal: 40 },
  retryBtn: { marginTop: 12, paddingHorizontal: 16, paddingVertical: 6, borderRadius: RADII.sm, ...continuous },
  emptyIconBox: { width: 84, height: 84, borderRadius: 42, justifyContent: 'center', alignItems: 'center' },
  /* 底栏 */
  footer: {
    paddingHorizontal: 12,
    paddingTop: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  startBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: ACCENT,
    borderRadius: RADII.md,
    paddingVertical: 12,
  },
});
