import { useState, useCallback, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, RefreshControl, ActivityIndicator } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Stack, useRouter, useScrollToTop, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Host, useThemeColors, ACCENT } from '@/components/SwiftUIHost';
import { ConfirmationDialog, Button as SwiftButton, Text as SwiftText } from '@expo/ui/swift-ui';
import { SkeletonCard } from '@/components/Skeleton';
import { FolderCard, CARD_GAP, CARD_W, COVER_H, type FavEntry } from '@/components/fav/FolderCard';
import { FavEntryRow } from '@/components/fav/FavResourceRow';
import { FavTabs, TABS, TAB_INDEX } from '@/components/fav/FavTabs';
import { FavToolbar } from '@/components/fav/FavToolbar';
import { favApi } from '@/api/fav';
import { usePagedList } from '@/hooks/use-paged-list';
import { isDefaultFav, setFavSortCache } from '@/utils/fav-utils';
import { useAuthStore } from '@/stores/auth';
import { Press } from '@/components/motion';
import { useType } from '@/components/type-scale';
import { feedBackMedium, feedBackSelection, feedBackSuccess, openInAppBrowser } from '@/utils/feedback';
import { stripHtml } from '@/utils/format';
import { showToast } from '@/utils/toast';

export default function FavScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const T = useType();
  const { isLoggedIn, userInfo } = useAuthStore();
  const params = useLocalSearchParams<{ tab?: string }>();
  const initialTab = TAB_INDEX[params.tab || ''] ?? 0;
  const [tabIdx, setTabIdx] = useState(initialTab);
  const tab = TABS[tabIdx].key;
  const listRef = useRef<any>(null);
  useScrollToTop(listRef);
  const [manageTarget, setManageTarget] = useState<FavEntry | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<FavEntry | null>(null);

  const { items, loading, refreshing, loadingMore, refresh, loadMore, setItems } = usePagedList<FavEntry>({
    enabled: isLoggedIn && !!userInfo,
    fetchPage: async (page, cancelToken) => {
      const uid = userInfo?.mid || 0;
      if (!uid) return { items: [] as FavEntry[], hasMore: false };
      let res: any;
      let mapped: FavEntry[] = [];
      let hasMore = true;
      switch (tab) {
        case 'video':
          res = await favApi.folderList({ up_mid: uid, pn: page, ps: 20 }, { cancelToken });
          mapped = (res?.data?.list || []).map((f: any) => ({
            id: String(f.id),
            title: f.title,
            cover: f.cover || '',
            subtitle: `${f.media_count || 0} 个内容`,
            href: `/fav/${f.id}`,
            hrefType: 'route',
            attr: f.attr,
            mediaCount: f.media_count || 0,
          }));
          hasMore = res?.data?.has_more !== false;
          break;
        case 'bangumi':
        case 'cinema':
          res = await favApi.pgcFollow({ type: tab === 'bangumi' ? 1 : 2, pn: page, ps: 20 }, { cancelToken });
          mapped = (res?.data?.list || []).map((f: any) => ({
            id: String(f.season_id),
            title: f.title,
            cover: f.cover || '',
            subtitle: f.progress || f.new_ep?.desc || (f.is_finish ? '已完结' : '连载中'),
            href: `/pgc/${f.season_id}`,
            hrefType: 'route',
          }));
          hasMore = mapped.length >= 20;
          break;
        case 'article':
          res = await favApi.favArticle({ page, page_size: 20 }, { cancelToken });
          mapped = (res?.data?.items || []).map((f: any) => ({
            id: String(f.opus_id || ''),
            title: stripHtml(f.content) || '专栏',
            cover: f.cover?.urls?.[0] || '',
            subtitle: `${f.author?.name || ''} · ${f.pub_time || ''}`,
            href: '',
            hrefType: 'web',
            webUrl: `https://www.bilibili.com/opus/${f.opus_id}`,
          }));
          hasMore = res?.data?.has_more !== false;
          break;
        case 'note':
          res = await favApi.userNoteList({ pn: page, ps: 10 }, { cancelToken });
          mapped = (res?.data?.list || []).map((f: any) => ({
            id: String(f.cvid || f.note_id || ''),
            title: f.title || f.summary || '笔记',
            cover: f.pic || '',
            subtitle: f.message || '',
            href: '',
            hrefType: 'web',
            webUrl: f.web_url ? f.web_url : `https://www.bilibili.com/read/cv${f.cvid}`,
          }));
          hasMore = mapped.length >= 10;
          break;
        case 'topic':
          res = await favApi.favTopic({ pn: page, page_size: 24 }, { cancelToken });
          mapped = (res?.data?.topic_list?.topic_items || []).map((f: any) => ({
            id: String(f.id),
            title: f.name || '话题',
            cover: '',
            subtitle: '收藏的话题',
            href: `/dynamics_topic/${f.id}`,
            hrefType: 'route',
          }));
          hasMore = mapped.length >= 24;
          break;
        case 'cheese':
          res = await favApi.favPugv({ mid: uid, pn: page, ps: 20 }, { cancelToken });
          mapped = (res?.data?.items || []).map((f: any) => ({
            id: String(f.season_id),
            title: f.title || '课堂',
            cover: f.cover || '',
            subtitle: f.status || '',
            href: `/pgc/${f.season_id}`,
            hrefType: 'route',
          }));
          hasMore = mapped.length >= 20;
          break;
        case 'sub':
          res = await favApi.subFolder({ up_mid: uid, pn: page, ps: 20 }, { cancelToken });
          mapped = (res?.data?.list || []).map((f: any) => ({
            id: String(f.id),
            title: f.title,
            cover: f.cover || '',
            subtitle: `${f.media_count || 0} 个内容`,
            href: `/fav/${f.id}`,
            hrefType: 'route',
            attr: f.attr,
            mediaCount: f.media_count || 0,
          }));
          hasMore = res?.data?.has_more !== false;
          break;
      }
      return { items: mapped, hasMore };
    },
    onError: (e) => {
      console.error('fav load error:', e);
      showToast('收藏加载失败');
    },
  });

  const firstFocusRef = useRef(true);
  const firstTabRef = useRef(true);

  useFocusEffect(useCallback(() => {
    if (firstFocusRef.current) {
      firstFocusRef.current = false;
      return;
    }
    if (isLoggedIn && userInfo) refresh();
  }, [isLoggedIn, userInfo, refresh]));

  useEffect(() => {
    if (firstTabRef.current) {
      firstTabRef.current = false;
      return;
    }
    const t = setTimeout(() => {
      if (isLoggedIn && userInfo) refresh();
    }, 0);
    return () => clearTimeout(t);
  }, [tab, isLoggedIn, userInfo, refresh]);

  const goSort = useCallback(() => {
    if (items.length === 0) return;
    setFavSortCache(
      items.map((it) => ({
        id: String(it.id),
        title: it.title,
        media_count: it.mediaCount || 0,
        cover: it.cover || '',
        attr: it.attr,
      })),
    );
    router.push('/fav_folder_sort' as any);
  }, [router, items]);

  const openManage = useCallback((item: FavEntry) => {
    if (isDefaultFav(item.attr)) {
      showToast('默认收藏夹不支持管理');
      return;
    }
    setManageTarget(item);
  }, []);

  const doDeleteFolder = useCallback(async (item: FavEntry) => {
    try {
      const res = await favApi.deleteFolder({ media_ids: item.id });
      if (res?.code !== 0) {
        showToast(res?.message || '删除失败');
        return;
      }
      setItems((prev) => prev.filter((f) => f.id !== item.id));
      feedBackSuccess();
      showToast('已删除');
    } catch {
      showToast('删除失败，请重试');
    }
  }, []);

  const openWeb = useCallback((url: string) => {
    openInAppBrowser(url).catch(() => showToast('无法打开链接'));
  }, []);

  const isGrid = tab === 'video' || tab === 'sub';
  const renderItem = useCallback(
    ({ item, index }: { item: FavEntry; index: number }) => (
      isGrid
        ? <FolderCard item={item} index={index} colors={colors} onManage={tab === 'video' ? openManage : undefined} />
        : <FavEntryRow item={item} index={index} colors={colors} onOpenWeb={openWeb} />
    ),
    [isGrid, colors, openManage, openWeb, tab],
  );

  const ItemSeparator = useCallback(() => <View style={{ height: isGrid ? 16 : StyleSheet.hairlineWidth }} />, [isGrid]);

  if (!isLoggedIn) {
    return (
      <View style={[styles.root, { backgroundColor: colors.bg }]}>
        <Stack.Title large>我的收藏</Stack.Title>
        <Stack.Header blurEffect="systemMaterial" style={{ shadowColor: 'transparent' }} />
        <View style={styles.emptyWrap}>
          <View style={[styles.emptyIconBox, { backgroundColor: colors.fill2 }]}>
            <Ionicons name="person-circle-outline" size={40} color={colors.textTertiary} />
          </View>
          <Text style={[T.headline, styles.emptyTitle, { color: colors.text }]}>请先登录</Text>
          <Text style={[T.footnote, styles.emptySub, { color: colors.textSecondary }]}>登录后查看我的收藏</Text>
          <Press haptic scaleTo={0.94} onPress={() => router.push('/login' as any)} style={styles.loginBtn}>
            <Text style={[T.subhead, styles.loginBtnText]}>去登录</Text>
          </Press>
        </View>
      </View>
    );
  }

  const screen = (
    <View style={[styles.root, { backgroundColor: colors.bg }]}>
      <Stack.Title large>我的收藏</Stack.Title>
      <Stack.Header blurEffect="systemMaterial" style={{ shadowColor: 'transparent' }} />
      <FavTabs tabIdx={tabIdx} onChange={setTabIdx} colors={colors} T={T} />
      {tab === 'video' && (
        <FavToolbar
          colors={colors}
          T={T}
          onSearch={() => router.push('/fav_search' as any)}
          onCreate={() => router.push('/fav_create' as any)}
          onSort={() => { feedBackSelection(); goSort(); }}
        />
      )}
      <FlashList
        key={isGrid ? 'grid' : 'list'}
        ref={listRef}
        data={items}
        keyExtractor={(it, idx) => `${tab}-${it.id}-${idx}`}
        numColumns={isGrid ? 2 : 1}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        estimatedItemSize={isGrid ? 200 : 92}
        windowSize={9}
        initialNumToRender={10}
        maxToRenderPerBatch={12}
        drawDistance={250}
        overrideProps={{ initialDrawBatchSize: 10 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { feedBackMedium(); refresh(); }} tintColor={colors.textSecondary} />}
        onEndReached={loadMore}
        onEndReachedThreshold={0.4}
        ListFooterComponent={loadingMore ? <ActivityIndicator size="small" color={colors.textTertiary} style={{ marginVertical: 14 }} /> : null}
        ListEmptyComponent={
          loading ? null : (
            <View style={styles.emptyWrap}>
              <View style={[styles.emptyIconBox, { backgroundColor: colors.fill2 }]}>
                <Ionicons name="folder-open-outline" size={38} color={colors.textTertiary} />
              </View>
              <Text style={[T.headline, styles.emptyTitle, { color: colors.text }]}>暂无内容</Text>
              <Text style={[T.footnote, styles.emptySub, { color: colors.textSecondary }]}>这里还没有收藏内容</Text>
            </View>
          )
        }
        renderItem={renderItem}
        ItemSeparatorComponent={ItemSeparator}
      />
      {loading && items.length === 0 && (
        <View style={styles.skeletonOverlay}>
          {isGrid ? (
            <View style={{ flexDirection: 'row', gap: CARD_GAP }}>
              <View style={{ width: CARD_W }}><SkeletonCard height={COVER_H} /></View>
              <View style={{ width: CARD_W }}><SkeletonCard height={COVER_H} /></View>
            </View>
          ) : (
            <>
              <SkeletonCard height={88} />
              <SkeletonCard height={88} />
            </>
          )}
        </View>
      )}
    </View>
  );

  return (
    <Host style={{ flex: 1 }} useViewportSizeMeasurement>
      {screen}
      <ConfirmationDialog
        title={manageTarget ? `管理「${manageTarget.title}」` : '管理收藏夹'}
        isPresented={!!manageTarget}
        onIsPresentedChange={(v) => { if (!v) setManageTarget(null); }}
        titleVisibility="visible">
        <ConfirmationDialog.Trigger>
          <SwiftButton label="" onPress={() => {}} />
        </ConfirmationDialog.Trigger>
        <ConfirmationDialog.Actions>
          <SwiftButton
            label="改名"
            onPress={() => { const t = manageTarget; setManageTarget(null); if (t) router.push(`/fav_create?mediaId=${t.id}` as any); }}
          />
          <SwiftButton
            label="排序"
            onPress={() => { setManageTarget(null); goSort(); }}
          />
          <SwiftButton
            label="删除"
            role="destructive"
            onPress={() => { setDeleteTarget(manageTarget); setManageTarget(null); }}
          />
          <SwiftButton label="取消" role="cancel" />
        </ConfirmationDialog.Actions>
        <ConfirmationDialog.Message>
          <SwiftText>长按收藏夹可快速管理；排序进入排序页面。</SwiftText>
        </ConfirmationDialog.Message>
      </ConfirmationDialog>
      <ConfirmationDialog
        title="删除收藏夹"
        isPresented={!!deleteTarget}
        onIsPresentedChange={(v) => { if (!v) setDeleteTarget(null); }}
        titleVisibility="visible">
        <ConfirmationDialog.Trigger>
          <SwiftButton label="" onPress={() => {}} />
        </ConfirmationDialog.Trigger>
        <ConfirmationDialog.Actions>
          <SwiftButton
            label="删除"
            role="destructive"
            onPress={() => { const t = deleteTarget; setDeleteTarget(null); if (t) doDeleteFolder(t); }}
          />
          <SwiftButton label="取消" role="cancel" />
        </ConfirmationDialog.Actions>
        <ConfirmationDialog.Message>
          <SwiftText>{deleteTarget ? `确定删除「${deleteTarget.title}」？收藏夹内的视频不会被删除。` : ''}</SwiftText>
        </ConfirmationDialog.Message>
      </ConfirmationDialog>
    </Host>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  listContent: { paddingHorizontal: 14, paddingTop: 12, paddingBottom: 40 },
  emptyWrap: { alignItems: 'center', justifyContent: 'center', paddingTop: 110, paddingHorizontal: 40, gap: 8 },
  emptyIconBox: { width: 84, height: 84, borderRadius: 42, justifyContent: 'center', alignItems: 'center', marginBottom: 8 },
  emptyTitle: { fontWeight: '600' },
  emptySub: { textAlign: 'center' },
  loginBtn: { marginTop: 14, backgroundColor: ACCENT, borderRadius: 20, paddingHorizontal: 30, paddingVertical: 10 },
  loginBtnText: { color: '#FFFFFF', fontWeight: '600' },
  skeletonOverlay: { position: 'absolute', top: 0, left: 0, right: 0, paddingHorizontal: 14, paddingTop: 12, gap: 16 },
});
