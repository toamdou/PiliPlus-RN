/**
 * ContactScreen —— 联系人选择页（对齐 Flutter lib/pages/contact）。
 *
 * 用途：
 *  1. mode=select：转发/分享前的选人（粉丝 + 互关），勾选后通过模块级事件回传选中 uid 列表；
 *  2. mode=share：站内分享选人（contact/share.tsx 强制此模式），选人后直接调用 shareApi
 *     给每个接收者发一条 msg_type=3 的分享卡私信，再返回。
 *
 * 接口：全部复用现有接口——
 *  - 互关：userApi.followings（关注）∩ userApi.fans（粉丝）交集计算；
 *  - 粉丝：userApi.fans；
 *  - 搜索：userApi.followSearch（仅搜索关注列表，粉丝搜索标注缺失）。
 *
 * 选中结果回传（避免改动 src/stores/**）：
 *   import { onContactSelected } from '@/app/contact';
 *   useEffect(() => onContactSelected((r) => { /* r.uids … *\/ return () => {}; }), []);
 *   router.push('/contact' as any);
 */
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, TextInput, ActivityIndicator, type TextInput as TextInputRef } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Image as ExpoImage } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors, useAccent } from '@/components/SwiftUIHost';
import { useType } from '@/components/type-scale';
import { Press } from '@/components/motion';
import { userApi } from '@/api/user';
import { shareApi, type ShareCard, type ShareCardType } from '@/api/share';
import { useAuthStore } from '@/stores/auth';
import { showToast } from '@/utils/toast';
import { RADII, continuous } from '@/theme/tokens';
import { biliCover } from '@/utils/image-url';
import { LoginGate } from '@/components/LoginGate';

export interface ContactUser {
  mid: number;
  uname: string;
  face: string;
  sign: string;
}

export interface ContactSelection {
  uids: number[];
  users: ContactUser[];
}

/** 模块级选中结果回传（页面 back 前触发） */
let contactResultListener: ((r: ContactSelection) => void) | null = null;
export function onContactSelected(listener: (r: ContactSelection) => void): () => void {
  contactResultListener = listener;
  return () => {
    if (contactResultListener === listener) contactResultListener = null;
  };
}

type ContactTab = 'mutual' | 'fans';
const TAB_OPTIONS: { key: ContactTab; label: string }[] = [
  { key: 'mutual', label: '互关' },
  { key: 'fans', label: '粉丝' },
];

/** 单次拉取关注的页码上限（互关为交集计算，避免全量分页） */
const MAX_PAGES = 6;
const PAGE_SIZE = 50;

/* ===== 用户行（memo） ===== */
const ContactRow = memo(function ContactRow({
  item,
  checked,
  colors,
  T,
  onToggle,
}: {
  item: ContactUser;
  checked: boolean;
  colors: ReturnType<typeof useThemeColors>;
  T: ReturnType<typeof useType>;
  onToggle: (item: ContactUser) => void;
}) {
  const accent = useAccent();
  return (
    <Press
      haptic
      scaleTo={0.98}
      onPress={() => onToggle(item)}
      style={[styles.row, { borderBottomColor: colors.separator, borderBottomWidth: StyleSheet.hairlineWidth }]}>
      <ExpoImage
        source={{ uri: biliCover(item.face, 96, 96) }}
        recyclingKey={item.face}
        cachePolicy="memory-disk"
        style={[styles.avatar, { backgroundColor: colors.fill2 }]}
        contentFit="cover"
      />
      <View style={styles.info}>
        <Text style={[T.subhead, styles.name, { color: colors.text }]} numberOfLines={1}>{item.uname}</Text>
        <Text style={[T.caption1, styles.sign, { color: colors.textSecondary }]} numberOfLines={1}>{item.sign || '这个人很懒'}</Text>
      </View>
      <Ionicons
        name={checked ? 'checkmark-circle' : 'ellipse-outline'}
        size={22}
        color={checked ? accent : colors.quaternaryLabel}
      />
    </Press>
  );
});

export default function ContactScreen({ forcedMode }: { forcedMode?: 'select' | 'share' }) {
  const {
    mode,
    title,
    /* 分享卡参数（mode=share 时使用，对齐 shareApi.ShareCard） */
    cardType,
    cardId,
    cardTitle,
    cardSubtitle,
    cardCover,
    cardUri,
    cardUpperMid,
    cardUpperName,
  } = useLocalSearchParams<{
    mode?: string;
    title?: string;
    /* 分享卡参数（mode=share 时使用，对齐 shareApi.ShareCard） */
    cardType?: string;
    cardId?: string;
    cardTitle?: string;
    cardSubtitle?: string;
    cardCover?: string;
    cardUri?: string;
    cardUpperMid?: string;
    cardUpperName?: string;
  }>();
  const router = useRouter();
  const colors = useThemeColors();
  const accent = useAccent();
  const T = useType();
  const { userInfo, isLoggedIn } = useAuthStore();
  const myMid = userInfo?.mid ?? 0;

  const [tab, setTab] = useState<ContactTab>('mutual');
  /* 互关 = 关注 ∩ 粉丝；粉丝 = 粉丝列表 */
  const [mutual, setMutual] = useState<ContactUser[]>([]);
  const [fans, setFans] = useState<ContactUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [keyword, setKeyword] = useState('');
  const [searchResult, setSearchResult] = useState<ContactUser[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<Record<number, ContactUser>>({});
  const searchInputRef = useRef<TextInputRef>(null);

  const isShareMode = (forcedMode ?? mode) === 'share';

  /* 拉取指定关系列表（最多 MAX_PAGES 页，返回去重后的用户） */
  const fetchRelation = useCallback(async (kind: 'following' | 'fans'): Promise<ContactUser[]> => {
    const out: ContactUser[] = [];
    const seen = new Set<number>();
    for (let page = 1; page <= MAX_PAGES; page += 1) {
      const res = kind === 'following'
        ? await userApi.followings({ vmid: myMid, pn: page, ps: PAGE_SIZE })
        : await userApi.fans({ vmid: myMid, pn: page, ps: PAGE_SIZE });
      const list = res?.data?.list ?? res?.data ?? [];
      let hasMore = false;
      (list as any[]).forEach((u: any) => {
        const mid = Number(u?.mid ?? u?.vmid ?? 0);
        if (mid > 0 && !seen.has(mid)) {
          seen.add(mid);
          out.push({ mid, uname: u?.uname || '', face: u?.face || '', sign: u?.sign || '' });
        }
      });
      hasMore = Array.isArray(list) && list.length >= PAGE_SIZE;
      if (!hasMore) break;
    }
    return out;
  }, [myMid]);

  const load = useCallback(async () => {
    if (!isLoggedIn || !myMid) return;
    setLoading(true);
    setError('');
    try {
      const [followings, fanList] = await Promise.all([
        fetchRelation('following'),
        fetchRelation('fans'),
      ]);
      const fanMap = new Map(fanList.map((u) => [u.mid, u]));
      // 互关：关注列表里同时也是粉丝的用户（以关注侧信息为准）
      setMutual(followings.filter((u) => fanMap.has(u.mid)));
      setFans(fanList);
    } catch (e) {
      console.error('contact load error:', e);
      setError('加载失败，请重试');
    } finally {
      setLoading(false);
    }
  }, [isLoggedIn, myMid, fetchRelation]);

  useEffect(() => {
    const t = setTimeout(load, 0);
    return () => clearTimeout(t);
  }, [load]);

  /* 搜索：优先走关注搜索接口（粉丝搜索接口缺失，标注为本地过滤） */
  const doSearch = useCallback(async () => {
    const kw = keyword.trim();
    if (!kw) {
      setSearchResult(null);
      return;
    }
    if (!myMid) return;
    setSearching(true);
    try {
      const res = await userApi.followSearch({ vmid: myMid, name: kw });
      const list = res?.data?.list ?? [];
      const items: ContactUser[] = (list as any[]).map((u: any) => ({
        mid: Number(u?.mid ?? 0),
        uname: u?.uname || '',
        face: u?.face || '',
        sign: u?.sign || '',
      }));
      // 互关/粉丝 tab 下把搜索结果按归属过滤，保证语义一致
      const belong = tab === 'mutual' ? new Set(mutual.map((u) => u.mid)) : new Set(fans.map((u) => u.mid));
      setSearchResult(items.filter((u) => belong.has(u.mid)));
    } catch {
      // 接口失败时退化为本地过滤（粉丝搜索无专门接口）
      const source = tab === 'mutual' ? mutual : fans;
      const kwl = kw.toLowerCase();
      setSearchResult(source.filter((u) => u.uname.toLowerCase().includes(kwl)));
    } finally {
      setSearching(false);
    }
  }, [keyword, myMid, tab, mutual, fans]);

  const toggle = useCallback((item: ContactUser) => {
    setSelected((prev) => {
      const next = { ...prev };
      if (next[item.mid]) delete next[item.mid];
      else next[item.mid] = item;
      return next;
    });
  }, []);

  const selectedUsers = useMemo(() => Object.values(selected), [selected]);
  const selectedCount = selectedUsers.length;

  /* 站内分享：给选中的用户发分享卡 */
  const doShare = useCallback(async () => {
    if (selectedCount === 0) {
      showToast('请先选择接收用户');
      return;
    }
    const card: ShareCard = {
      type: (String(cardType || 'video') as ShareCardType),
      id: String(cardId || ''),
      title: String(cardTitle || '分享内容'),
      subtitle: cardSubtitle ? String(cardSubtitle) : undefined,
      picture: cardCover ? String(cardCover) : undefined,
      uri: cardUri ? String(cardUri) : undefined,
      upper_mid: cardUpperMid ? Number(cardUpperMid) : undefined,
      upper_name: cardUpperName ? String(cardUpperName) : undefined,
    };
    try {
      const { ok, failed } = await shareApi.sendToUsers(selectedUsers.map((u) => u.mid), card);
      if (ok > 0) showToast(`已分享给 ${ok} 位用户`);
      if (failed.length > 0) showToast(`${failed.length} 位发送失败`);
      router.back();
    } catch (e) {
      console.error('share send error:', e);
      showToast('分享失败，请重试');
    }
  }, [selectedCount, selectedUsers, cardType, cardId, cardTitle, cardSubtitle, cardCover, cardUri, cardUpperMid, cardUpperName, router]);

  /* 确认（select 模式：回传选中结果后返回） */
  const confirmSelect = useCallback(() => {
    if (selectedCount === 0) {
      showToast('请先选择用户');
      return;
    }
    contactResultListener?.({ uids: selectedUsers.map((u) => u.mid), users: selectedUsers });
    router.back();
  }, [selectedCount, selectedUsers, router]);

  const onConfirm = isShareMode ? doShare : confirmSelect;

  const data: ContactUser[] = keyword.trim()
    ? (searchResult ?? [])
    : tab === 'mutual' ? mutual : fans;

  const renderRow = useCallback(
    ({ item }: { item: ContactUser }) => (
      <ContactRow item={item} checked={!!selected[item.mid]} colors={colors} T={T} onToggle={toggle} />
    ),
    [selected, colors, T, toggle],
  );

  if (!isLoggedIn) {
    return (
      <View style={[styles.root, { backgroundColor: colors.bg }]}>
        <Stack.Title large>选择联系人</Stack.Title>
        <Stack.Header blurEffect="systemMaterial" style={{ shadowColor: 'transparent' }} />
        <LoginGate />
      </View>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]}>
      <Stack.Title large>{String(title || (isShareMode ? '分享给用户' : '选择联系人'))}</Stack.Title>
      <Stack.Header blurEffect="systemMaterial" style={{ shadowColor: 'transparent' }} />

      {/* 搜索框 */}
      <View style={[styles.searchBox, { backgroundColor: colors.fill2 }]}>
        <Ionicons name="search" size={15} color={colors.textTertiary} />
        <TextInput
          ref={searchInputRef}
          value={keyword}
          onChangeText={setKeyword}
          onSubmitEditing={() => doSearch()}
          placeholder="搜索联系人（关注列表）"
          placeholderTextColor={colors.textTertiary}
          style={[T.footnote, styles.searchInput, { color: colors.text }]}
          returnKeyType="search"
          clearButtonMode="while-editing"
        />
        {keyword.trim() ? (
          <Press haptic scaleTo={0.9} onPress={doSearch} style={[styles.searchGo, { backgroundColor: accent }]}>
            <Ionicons name="arrow-forward" size={13} color="#FFFFFF" />
          </Press>
        ) : null}
      </View>

      {/* 互关 / 粉丝 Tab */}
      <View style={[styles.tabs, { backgroundColor: colors.fill2 }]}>
        {TAB_OPTIONS.map((opt) => {
          const active = tab === opt.key;
          return (
            <Press
              key={opt.key}
              haptic
              scaleTo={0.94}
              onPress={() => { setTab(opt.key); setSearchResult(null); setKeyword(''); }}
              style={[styles.tab, active && { backgroundColor: accent }]}>
              <Text style={[T.footnote, styles.tabText, { color: active ? '#FFFFFF' : colors.textSecondary }]}>{opt.label}</Text>
            </Press>
          );
        })}
      </View>

      <FlashList
        data={data}
        keyExtractor={(it) => String(it.mid)}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        renderItem={renderRow}
        estimatedItemSize={64}
        drawDistance={250}
        overrideProps={{ initialDrawBatchSize: 20 }}
        ListEmptyComponent={
          loading || searching ? (
            <ActivityIndicator color={colors.textTertiary} style={{ marginVertical: 32 }} />
          ) : error ? (
            <View style={styles.emptyWrap}>
              <Ionicons name="cloud-offline-outline" size={34} color={colors.textTertiary} />
              <Text style={[T.footnote, { color: colors.textTertiary, marginVertical: 8 }]}>{error}</Text>
              <Press haptic scaleTo={0.94} onPress={load} style={[styles.retryBtn, { backgroundColor: colors.fill2 }]}>
                <Text style={[T.subhead, { color: accent }]}>重试</Text>
              </Press>
            </View>
          ) : keyword.trim() ? (
            <Text style={[T.footnote, styles.emptyText, { color: colors.textTertiary }]}>
              未找到匹配的联系人（粉丝搜索无专门接口，仅支持关注列表搜索）
            </Text>
          ) : tab === 'mutual' ? (
            <Text style={[T.footnote, styles.emptyText, { color: colors.textTertiary }]}>暂无互相关注的用户</Text>
          ) : (
            <Text style={[T.footnote, styles.emptyText, { color: colors.textTertiary }]}>暂无粉丝</Text>
          )
        }
      />

      {/* 底部确认栏 */}
      <View style={[styles.bottomBar, { backgroundColor: colors.card, borderTopColor: colors.separator }]}>
        <View style={styles.bottomInfo}>
          <Ionicons name="checkmark-circle" size={16} color={accent} />
          <Text style={[T.footnote, { color: colors.textSecondary }]}>
            已选 {selectedCount} 人
          </Text>
        </View>
        <Press haptic scaleTo={0.96} onPress={onConfirm} style={[styles.confirmBtn, { backgroundColor: selectedCount > 0 ? accent : colors.fill3 }]}>
          <Text style={[T.subhead, styles.confirmText]}>
            {isShareMode ? `分享 (${selectedCount})` : `确定 (${selectedCount})`}
          </Text>
        </Press>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginTop: 8,
    paddingHorizontal: 12,
    borderRadius: RADII.circle,
    ...continuous,
  },
  searchInput: { flex: 1, paddingVertical: 9 },
  searchGo: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  tabs: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginTop: 10,
    marginBottom: 4,
    borderRadius: RADII.circle,
    padding: 3,
    ...continuous,
  },
  tab: { flex: 1, paddingVertical: 7, borderRadius: RADII.circle, alignItems: 'center', ...continuous },
  tabText: { fontWeight: '600' },
  listContent: { paddingHorizontal: 16, paddingBottom: 96 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  avatar: { width: 44, height: 44, borderRadius: 22 },
  info: { flex: 1, gap: 2 },
  name: { fontWeight: '600' },
  sign: {},
  emptyWrap: { alignItems: 'center', paddingTop: 80, gap: 4 },
  emptyText: { textAlign: 'center', paddingVertical: 40 },
  retryBtn: { marginTop: 8, borderRadius: RADII.circle, paddingHorizontal: 24, paddingVertical: 8, ...continuous },
  bottomBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 30,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  bottomInfo: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  confirmBtn: { borderRadius: RADII.circle, paddingHorizontal: 22, paddingVertical: 10, ...continuous },
  confirmText: { color: '#FFFFFF', fontWeight: '600' },
});
