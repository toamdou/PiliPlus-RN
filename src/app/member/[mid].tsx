import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { Host, ProgressView } from '@expo/ui/swift-ui';
import { Stack, useLocalSearchParams, useRouter, useScrollToTop } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors } from '@/components/SwiftUIHost';
import { userApi } from '@/api/user';
import { usePagedList } from '@/hooks/use-paged-list';
import { formatDuration } from '@/utils/format';
import { av2bv } from '@/utils/id-utils';
import { useAuthStore } from '@/stores/auth';
import { useSettingsStore } from '@/stores/settings';
import { feedBack } from '@/utils/feedback';
import { showToast } from '@/utils/toast';
import { Press } from '@/components/motion';
import { RADII, continuous } from '@/theme/tokens';
import { TabError } from '@/components/member/tab-states';
import { MemberHeaderCard } from '@/components/member/MemberHeaderCard';
import { MemberTabBar, TABS } from '@/components/member/MemberTabBar';
import { MemberTabContainer } from '@/components/member/MemberTabContainer';
import type { DynItem, MemberInfo, MemberTab, VideoItem } from '@/components/member/types';

const SPACE_TAB_MAP: Record<string, MemberTab> = {
  home: 'videos',
  dynamic: 'dynamics',
  contribute: 'videos',
  like: 'like',
  favorite: 'favorite',
  bangumi: 'bangumi',
  cheese: 'cheese',
  shop: 'shop',
};

/** 举报 UP 主原因（reason 文案直传 spaceBaseUrl/ajax/report/add） */
const REPORT_REASONS = [
  '涉政违法',
  '色情低俗',
  '垃圾广告',
  '人身攻击',
  '违法违规',
];

export default function MemberScreen() {
  const { mid } = useLocalSearchParams<{ mid: string }>();
  const router = useRouter();
  const colors = useThemeColors();
  const { userInfo, isLoggedIn } = useAuthStore();
  const [info, setInfo] = useState<MemberInfo | null>(null);
  const [stat, setStat] = useState<{ following: number; follower: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [isFollowed, setIsFollowed] = useState(false);
  const [spaceTabs, setSpaceTabs] = useState<{ key: MemberTab; label: string }[] | null>(null);
  /* 用户页默认TAB（memberTab: 0投稿 1动态 2合集 3专栏 4音频），超出范围回退投稿 */
  const [activeTab, setActiveTab] = useState<MemberTab>(() => {
    const map: MemberTab[] = ['videos', 'dynamics', 'opus', 'article', 'audio'];
    return map[useSettingsStore.getState().memberTab] || 'videos';
  });
  const [coinVideos, setCoinVideos] = useState<VideoItem[]>([]);
  const [coinsLoading, setCoinsLoading] = useState(false);
  const [coinsError, setCoinsError] = useState<string | null>(null);
  const [likeVideos, setLikeVideos] = useState<VideoItem[]>([]);
  const [likesLoading, setLikesLoading] = useState(false);
  const [likesError, setLikesError] = useState<string | null>(null);
  const [pageError, setPageError] = useState<string | null>(null);
  /* 动态分页游标（对齐 Flutter MemberDynamicsController.offset） */
  const dynOffsetRef = useRef('');
  const listRef = useRef<any>(null);
  useScrollToTop(listRef);

  const { items: videos, loadingMore: videosLoadingMore, error: videosError, refresh: videosRefresh, loadMore: videosLoadMore, setItems: setVideos } = usePagedList<VideoItem>({
    enabled: !!mid && !loading && !pageError,
    fetchPage: async (page, cancelToken) => {
      const res = await userApi.archive({ mid: parseInt(mid), pn: page }, { cancelToken });
      const vlist = res?.data?.list?.vlist ?? [];
      return {
        items: vlist.map((v: any) => ({
          bvid: v.bvid, title: v.title, pic: v.pic, play: v.play, created: v.created, length: v.length,
        })),
        hasMore: vlist.length >= 30,
      };
    },
    onError: (e) => {
      console.error('loadVideos error:', e);
    },
  });

  const { items: dynamics, loading: dynLoading, loadingMore: dynLoadingMore, error: dynError, refresh: dynRefresh, loadMore: dynLoadMore, setItems: setDynamics } = usePagedList<DynItem>({
    enabled: activeTab === 'dynamics' && !!mid && !loading && !pageError,
    fetchPage: async (page, cancelToken) => {
      const res = await userApi.dynamics({
        host_mid: parseInt(mid),
        offset: page === 1 ? '' : dynOffsetRef.current,
      }, { cancelToken });
      const data = res?.data;
      const items = (data?.items ?? []).map((d: any) => {
        const modules = d.modules || {};
        const author = modules.module_author?.name || '';
        const time = modules.module_author?.pub_time || '';
        const dynamic = modules.module_dynamic || {};
        const text = dynamic.desc?.text || '';
        const pics = (dynamic.major?.opus?.pics || dynamic.major?.draw?.items || []).map((p: any) => p.src || p.url || '');
        return { id: d.id_str || String(d.id), type: d.type || '', text, pics, author, time };
      });
      dynOffsetRef.current = data?.offset || '-1';
      return {
        items,
        hasMore: data?.has_more !== false && dynOffsetRef.current !== '-1' && items.length > 0,
      };
    },
    onError: (e) => {
      console.error('loadDynamics error:', e);
    },
  });

  /* 提取可读错误文案（对齐 Flutter Error 分支：优先接口 message） */
  function errMsg(e: unknown): string {
    const err = e as any;
    return err?.response?.data?.message || err?.message || '加载失败，请重试';
  }

  /* 投币接口不返回 bvid：对齐 Flutter VideoCardVMemberHome，用 param(aid) av2bv 转换，兜底从 uri 提取 BV 号 */
  function coinBvid(v: any): string {
    const aid = Number(v?.param);
    if (Number.isFinite(aid) && aid > 0) return av2bv(aid);
    const m = /BV[0-9A-Za-z]+/.exec(v?.uri || '');
    return m ? m[0] : '';
  }

  /* 最近投币（对齐 Flutter coinArc：data.item 列表，cover/duration/ctime 字段） */
  async function loadCoins() {
    setCoinsLoading(true);
    setCoinsError(null);
    try {
      const res = await userApi.coinArc({ mid: parseInt(mid) });
      const list = res?.data?.item || [];
      setCoinVideos(list.map((v: any) => ({
        bvid: coinBvid(v),
        title: v.title || '',
        pic: v.cover || '',
        play: v.play || 0,
        created: v.ctime || 0,
        length: v.duration ? formatDuration(v.duration) : '',
      })));
    } catch (e) {
      console.error('loadCoins error:', e);
      setCoinsError(errMsg(e));
    } finally {
      setCoinsLoading(false);
    }
  }

  /* 点赞接口不返回 bvid：与投币一致，用 aid（v.aid 或 v.param）av2bv 转换，兜底从 uri 提取 BV 号 */
  function likeBvid(v: any): string {
    const aid = Number(v?.aid ?? v?.param);
    if (Number.isFinite(aid) && aid > 0) return av2bv(aid);
    const m = /BV[0-9A-Za-z]+/.exec(v?.uri || '');
    return m ? m[0] : '';
  }

  /* 最近点赞（member_like_arc，对齐 Flutter lib/pages/member_like_arc：
     app 接口 /x/v2/space/likearc，data.list 列表，aid/pic/duration/ctime 字段） */
  async function loadLikes() {
    setLikesLoading(true);
    setLikesError(null);
    try {
      const res = await userApi.likeArc({ mid: parseInt(mid) });
      const list = res?.data?.list || res?.data?.item || [];
      setLikeVideos(list.map((v: any) => ({
        bvid: likeBvid(v),
        title: v.title || '',
        pic: v.pic || v.cover || '',
        play: v.play || 0,
        created: v.ctime || 0,
        length: v.duration ? formatDuration(v.duration) : '',
      })));
    } catch (e) {
      console.error('loadLikes error:', e);
      setLikesError(errMsg(e));
    } finally {
      setLikesLoading(false);
    }
  }

  async function loadMember() {
    setLoading(true);
    setPageError(null);
    /* mid 变化时重置各 tab 数据与分页游标，避免旧用户数据残留 */
    setInfo(null);
    setStat(null);
    setCoinVideos([]);
    setCoinsError(null);
    setLikeVideos([]);
    setLikesError(null);
    setIsFollowed(false);
    setSpaceTabs(null);
    dynOffsetRef.current = '';
    setVideos([]);
    setDynamics([]);
    try {
      const midNum = parseInt(mid);
      /* 统计接口失败不影响整页（Flutter 各请求独立） */
      const [infoRes, statRes] = await Promise.all([
        userApi.memberInfo({ mid: midNum }),
        userApi.stat({ vmid: midNum }).catch(() => null),
      ]);
      if (infoRes?.data) setInfo(infoRes.data);
      if (statRes?.data) setStat(statRes.data);
      const spaceRes = await userApi.spaceApp({ vmid: midNum }).catch(() => null);
      const spaceData = spaceRes?.data;
      if (spaceData) {
        const seen = new Set<MemberTab>();
        const mapped: { key: MemberTab; label: string }[] = (spaceData.tab2 || [])
          .map((t: any) => ({
            key: SPACE_TAB_MAP[t?.param as string],
            label: t?.title || '',
          }))
          .filter((t: { key?: MemberTab; label: string }): t is { key: MemberTab; label: string } => {
            if (!t.key || seen.has(t.key)) return false;
            seen.add(t.key);
            return true;
          });
        const collection = !!(spaceData.ugc_season?.item?.length || spaceData.series?.item?.length);
        if (collection) {
          mapped.push({ key: 'collection', label: '合集' });
        }
        const fallback = useSettingsStore.getState().showMemberShop
          ? TABS
          : TABS.filter((t) => t.key !== 'shop');
        const filteredFallback = fallback.filter((t) => t.key !== 'collection' || collection);
        const keys = new Set(mapped.map((t) => t.key));
        const combined = [...mapped, ...filteredFallback.filter((t) => !keys.has(t.key))];
        setSpaceTabs(combined);
        setActiveTab((prev) => (combined.some((t) => t.key === prev) ? prev : combined[0]?.key ?? 'videos'));
      }
      if (isLoggedIn) {
        userApi.relation({ fid: midNum })
          .then((relRes) => {
            if (relRes?.data) setIsFollowed(relRes.data.attribute === 2 || relRes.data.attribute === 6);
          })
          .catch(() => {});
      }
    } catch (e) {
      console.error('loadMember error:', e);
      setPageError(errMsg(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!mid) return;
    const timer = setTimeout(() => loadMember(), 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mid]);

  useEffect(() => {
    if (!(activeTab === 'coins' && coinVideos.length === 0 && mid)) return;
    const timer = setTimeout(() => loadCoins(), 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, loading]);

  useEffect(() => {
    if (!(activeTab === 'like' && likeVideos.length === 0 && mid)) return;
    const timer = setTimeout(() => loadLikes(), 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, loading]);

  const toggleFollow = useCallback(async () => {
    if (!isLoggedIn) { router.push('/login' as any); return; }
    feedBack();
    const newFollow = !isFollowed;
    setIsFollowed(newFollow);
    await userApi.modifyRelation({ fid: parseInt(mid), act: newFollow ? 1 : 2 }).catch(() => setIsFollowed(!newFollow));
  }, [isLoggedIn, isFollowed, mid, router]);

  /* ===== 批次5 P2：空间头部右上角菜单（分享UP主/拉黑/举报/私信入口） =====
   * 对齐 Flutter member 头部更多菜单；分享走系统分享（站外）或站内分享选人面板（/contact/share）。 */
  const handleShareUp = useCallback(() => {
    if (!info?.name) { showToast('UP 主信息未加载'); return; }
    router.push({
      pathname: '/contact/share',
      params: {
        cardType: 'space',
        cardId: String(mid),
        cardTitle: `UP主：${info.name}`,
        cardCover: info.face || '',
        cardUri: `https://space.bilibili.com/${mid}`,
        cardUpperMid: String(mid),
        cardUpperName: info.name,
      },
    } as any);
  }, [info, mid, router]);

  /** 系统分享（站外复制/转发兜底） */
  const handleSystemShare = useCallback(() => {
    const name = info?.name || `UP主 ${mid}`;
    void Share.share({ message: `【${name}】https://space.bilibili.com/${mid}` }).catch(() => {});
  }, [info, mid]);

  /** 拉黑（对齐 blacklist：modifyRelation act=5 拉黑 / act=6 解除，csrftoken 由 userApi 统一补） */
  const handleBlack = useCallback(() => {
    if (!isLoggedIn) { router.push('/login' as any); return; }
    Alert.alert('拉黑该用户', '拉黑后将不再看到 TA 的内容，可在设置-黑名单中解除。确定继续吗？', [
      { text: '取消', style: 'cancel' },
      {
        text: '拉黑',
        style: 'destructive',
        onPress: async () => {
          try {
            const res = await userApi.modifyRelation({ fid: parseInt(mid), act: 5, re_src: 11 });
            if (res?.code === 0) showToast('已拉黑');
            else showToast(res?.message || '拉黑失败');
          } catch {
            showToast('拉黑失败，请重试');
          }
        },
      },
    ]);
  }, [isLoggedIn, mid, router]);

  /** 举报（对齐 Flutter report 分支；reason 文案直传 spaceBaseUrl/ajax/report/add） */
  const handleReport = useCallback(() => {
    if (!isLoggedIn) { router.push('/login' as any); return; }
    Alert.alert('举报该用户', '请选择举报原因', [
      ...REPORT_REASONS.map((reason) => ({
        text: reason,
        onPress: async () => {
          try {
            const res = await userApi.reportMember({ mid: parseInt(mid), reason });
            showToast(res?.code === 0 ? '举报已提交' : res?.message || '举报失败');
          } catch {
            showToast('举报失败，请重试');
          }
        },
      })),
      { text: '取消', style: 'cancel' },
    ]);
  }, [isLoggedIn, mid, router]);

  /** 私信入口（跳 /whisper/[uid]） */
  const handleWhisper = useCallback(() => {
    if (!isLoggedIn) { router.push('/login' as any); return; }
    router.push({ pathname: '/whisper/[uid]', params: { uid: String(mid) } } as any);
  }, [isLoggedIn, mid, router]);

  /* 显示UP主页小店TAB（showMemberShop=false 时隐藏商店 tab） */
  const showMemberShop = useSettingsStore((s2) => s2.showMemberShop);
  const isOwner = userInfo?.mid === parseInt(mid, 10);

  /* 头部右上角菜单按钮（SwiftUI Stack.Toolbar.Menu 既有模式，仅非本人空间展示） */
  const headerMenu = useMemo(() => {
    if (loading || pageError || isOwner) return null;
    return (
      <Stack.Toolbar>
        <Stack.Toolbar.Menu icon="ellipsis.circle" accessibilityLabel="更多">
          <Stack.Toolbar.MenuAction onPress={handleShareUp}>分享 UP 主（站内）</Stack.Toolbar.MenuAction>
          <Stack.Toolbar.MenuAction onPress={handleSystemShare}>分享 UP 主（系统）</Stack.Toolbar.MenuAction>
          <Stack.Toolbar.MenuAction onPress={handleWhisper}>发私信</Stack.Toolbar.MenuAction>
          <Stack.Toolbar.MenuAction destructive onPress={handleBlack}>拉黑</Stack.Toolbar.MenuAction>
          <Stack.Toolbar.MenuAction destructive onPress={handleReport}>举报</Stack.Toolbar.MenuAction>
        </Stack.Toolbar.Menu>
      </Stack.Toolbar>
    );
  }, [loading, pageError, isOwner, handleShareUp, handleSystemShare, handleWhisper, handleBlack, handleReport]);

  const tabs = useMemo(() => {
    if (spaceTabs && spaceTabs.length > 0) return spaceTabs;
    return showMemberShop ? TABS : TABS.filter((t) => t.key !== 'shop');
  }, [showMemberShop, spaceTabs]);

  const header = useMemo(
    () => (
      <View style={styles.headerWrap}>
        <MemberHeaderCard
          mid={mid}
          info={info}
          stat={stat}
          isFollowed={isFollowed}
          isOwner={isOwner}
          onToggleFollow={toggleFollow}
        />
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.entryScroll}
          contentContainerStyle={styles.entryRow}>
          <Press
            haptic
            scaleTo={0.94}
            onPress={() => router.push(`/member_search/${mid}` as any)}
            style={[styles.entryChip, { backgroundColor: colors.fill2 }]}>
            <Ionicons name="search" size={14} color={colors.accent} />
            <Text style={[styles.entryChipText, { color: colors.textSecondary }]}>用户搜索</Text>
          </Press>
          <Press
            haptic
            scaleTo={0.94}
            onPress={() => router.push(`/member_comic/${mid}` as any)}
            style={[styles.entryChip, { backgroundColor: colors.fill2 }]}>
            <Ionicons name="book-outline" size={14} color={colors.accent} />
            <Text style={[styles.entryChipText, { color: colors.textSecondary }]}>漫画</Text>
          </Press>
        </ScrollView>
        <MemberTabBar tabs={tabs} activeTab={activeTab} onTabChange={setActiveTab} />
      </View>
    ),
    [activeTab, colors, info, isFollowed, isOwner, mid, router, stat, tabs, toggleFollow],
  );

  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]}>
      {/* 用户明确不需要文字显示用户名（large title 会遮挡资料卡），仅保留 card 内展示 */}
      <Stack.Header blurEffect="systemMaterial" style={{ shadowColor: 'transparent' }} />
      {headerMenu}
      {loading ? (
        <View style={styles.loadingWrap}>
          <Host matchContents><ProgressView /></Host>
        </View>
      ) : pageError ? (
        <View style={styles.loadingWrap}>
          <TabError message={pageError} onRetry={loadMember} />
        </View>
      ) : (
        <MemberTabContainer
          activeTab={activeTab}
          header={header}
          listRef={listRef}
          mid={parseInt(mid)}
          videos={videos}
          dynamics={dynamics}
          coinVideos={coinVideos}
          likeVideos={likeVideos}
          videosLoadingMore={videosLoadingMore}
          dynLoadingMore={dynLoadingMore}
          videosError={videosError}
          dynLoading={dynLoading}
          dynError={dynError}
          coinsLoading={coinsLoading}
          coinsError={coinsError}
          likesLoading={likesLoading}
          likesError={likesError}
          onLoadMoreVideos={videosLoadMore}
          onLoadMoreDynamics={dynLoadMore}
          onRetryVideos={videosRefresh}
          onRetryDynamics={dynRefresh}
          onRetryCoins={loadCoins}
          onRetryLikes={loadLikes}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  loadingWrap: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  headerWrap: { marginBottom: 6 },
  entryScroll: { marginTop: 12, marginHorizontal: -4 },
  entryRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 4 },
  entryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: RADII.circle,
    paddingHorizontal: 12,
    paddingVertical: 7,
    ...continuous,
  },
  entryChipText: { fontWeight: '500' },
});
