import { useState, useCallback, useEffect, useRef } from 'react';
import { Alert, View, Text, StyleSheet } from 'react-native';
import type { FlashListRef } from '@shopify/flash-list';
import { Host, ProgressView } from '@expo/ui/swift-ui';
import { useLocalSearchParams, Stack, useRouter } from 'expo-router';
import { useThemeColors } from '@/components/SwiftUIHost';
import { useType } from '@/components/type-scale';
import { DynamicDetailBody } from '@/components/dynamics/DynamicDetailBody';
import { type DynDetail, type VoteInfoData, type ReserveCard } from '@/components/dynamics/dynamic-types';
import { type ReplyItem } from '@/components/CommentSection';
import { dynamicsApi } from '@/api/dynamics';
import { replyApi } from '@/api/reply';
import { createNativeRequestCancelToken, type NativeRequestCancelToken } from '@/utils/request-cancel';
import { useAuthStore } from '@/stores/auth';
import { useSettingsStore } from '@/stores/settings';
import { feedBack, feedBackSuccess } from '@/utils/feedback';
import { showToast } from '@/utils/toast';

const DYNAMIC_REPORT_REASONS = [
  { code: 1, label: '色情低俗' },
  { code: 2, label: '垃圾广告' },
  { code: 3, label: '违法违规' },
  { code: 4, label: '人身攻击' },
];

export default function DynamicDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const colors = useThemeColors();
  const T = useType();
  const isLoggedIn = useAuthStore((s) => s.isLoggedIn);
  const userInfo = useAuthStore((s) => s.userInfo);
  const replySortType = useSettingsStore((s) => s.replySortType);
  const showDynActionBar = useSettingsStore((s) => s.showDynActionBar);
  const showDynInteraction = useSettingsStore((s) => s.showDynInteraction);
  const showDynDispute = useSettingsStore((s) => s.showDynDispute);
  const [detail, setDetail] = useState<DynDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [liked, setLiked] = useState(false);
  const [voteInfo, setVoteInfo] = useState<VoteInfoData | null>(null);
  const [voteLoading, setVoteLoading] = useState(false);
  const [voteEnded, setVoteEnded] = useState(false);
  const [selections, setSelections] = useState<number[]>([]);
  const [voting, setVoting] = useState(false);
  const [reserve, setReserve] = useState<ReserveCard | null>(null);
  const [reserveBusy, setReserveBusy] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [replies, setReplies] = useState<ReplyItem[]>([]);
  const [commentLoaded, setCommentLoaded] = useState(false);
  const [commentError, setCommentError] = useState<string | null>(null);
  const [commentHasMore, setCommentHasMore] = useState(false);
  const [commentLoading, setCommentLoading] = useState(false);
  const commentPageRef = useRef(0);
  const commentCursorRef = useRef('{"offset":""}');
  const commentCancelRef = useRef<NativeRequestCancelToken | null>(null);
  const scrollRef = useRef<FlashListRef<any>>(null);

  useEffect(() => () => {
    commentCancelRef.current?.abort();
  }, []);

  const loadComments = useCallback(async (isMore = false) => {
    if (!detail || commentLoading) return;
    setCommentLoading(true);
    const cancelToken = createNativeRequestCancelToken();
    commentCancelRef.current?.abort();
    commentCancelRef.current = cancelToken;
    try {
      const mode = replySortType === 1 ? 2 : 3;
      const oid = Number(detail.basic?.comment_id_str || detail.id_str) || 0;
      const type = detail.basic?.comment_type || 17;
      if (!oid) {
        setCommentError('评论主体信息缺失');
        return;
      }
      const res = isLoggedIn
        ? await replyApi.main({ oid, type, mode, pn: commentPageRef.current + 1 }, { cancelToken })
        : await replyApi.main({ oid, type, mode, pagination_str: commentCursorRef.current }, { cancelToken });
      if (res?.code !== 0) {
        setCommentError(res?.message || '评论加载失败');
        return;
      }
      const list = (res?.data?.replies as ReplyItem[] | undefined) || [];
      if (isMore) setReplies((prev) => [...prev, ...list]);
      else setReplies(list);
      if (res?.data?.page?.num) commentPageRef.current = res.data.page.num;
      if (res?.data?.cursor?.pagination_str) commentCursorRef.current = res.data.cursor.pagination_str;
      const page = res?.data?.page;
      const hasMoreByPage = page != null ? (page.num || 0) * (page.size || 20) < (page.count || 0) : true;
      setCommentHasMore(list.length > 0 && res?.data?.cursor?.is_end !== true && hasMoreByPage);
      setCommentError(null);
    } catch (e) {
      if (cancelToken.aborted) return;
      console.error('load dynamic comments error:', e);
      setCommentError('评论加载失败');
    } finally {
      if (commentCancelRef.current === cancelToken) commentCancelRef.current = null;
      if (!cancelToken.aborted) {
        setCommentLoading(false);
        setCommentLoaded(true);
      }
    }
  }, [detail, commentLoading, isLoggedIn, replySortType]);

  const openComments = useCallback(() => {
    setShowComments(true);
    if (!commentLoaded) void loadComments();
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 120);
  }, [commentLoaded, loadComments]);

  const loadVote = useCallback(async (voteId: number) => {
    setVoteLoading(true);
    try {
      const res = await dynamicsApi.voteInfo({ vote_id: voteId });
      const data = res?.data;
      if (data?.vote_info) {
        const myVotes: number[] = data.my_votes ?? data.vote_info.my_votes ?? [];
        setVoteInfo({ ...data.vote_info, options: data.vote_info.options ?? [], my_votes: myVotes });
        setSelections(myVotes);
        setVoteEnded((data.vote_info.end_time ?? 0) * 1000 <= Date.now());
      } else {
        setVoteInfo(null);
      }
    } catch (e) {
      console.error('load vote error:', e);
      showToast('投票信息加载失败');
    } finally {
      setVoteLoading(false);
    }
  }, []);

  const loadDetail = useCallback(async () => {
    try {
      const res = await dynamicsApi.detail({ id });
      if (res?.data?.item) {
        const item = res.data.item;
        setDetail(item);
        setLiked(item.modules?.module_stat?.like?.status || false);
        const md = item.modules?.module_dynamic;
        const add = md?.additional;
        if (add?.type === 'ADDITIONAL_TYPE_RESERVE' && add.reserve) {
          setReserve(add.reserve);
        } else {
          setReserve(null);
        }
        const voteId = add?.vote?.vote_id ?? md?.major?.vote?.vote_id;
        if (voteId) {
          void loadVote(voteId);
        } else {
          setVoteInfo(null);
        }
      }
    } catch (e) {
      console.error('load detail error:', e);
      showToast('动态加载失败');
    } finally {
      setLoading(false);
    }
  }, [id, loadVote]);

  useEffect(() => {
    if (id) {
      const t = setTimeout(() => {
        void loadDetail();
      }, 0);
      return () => clearTimeout(t);
    }
  }, [id, loadDetail]);

  async function handleLike() {
    if (!detail || !isLoggedIn) return;
    feedBack();
    const newLiked = !liked;
    setLiked(newLiked);
    await dynamicsApi
      .thumb({ dyn_id_str: detail.id_str, up: newLiked ? 1 : 0 })
      .catch((e) => {
        console.error('thumb error:', e);
        showToast('操作失败，请重试');
        setLiked(!newLiked);
      });
  }

  /* ===== 投票 ===== */
  const voted = (voteInfo?.my_votes?.length ?? 0) > 0;
  const showVotePct = !!voteInfo && (voted || voteEnded);
  const totalCnt = voteInfo?.options?.reduce((sum, o) => sum + (o.cnt ?? 0), 0) ?? 0;
  const maxChoice = voteInfo?.choice_cnt && voteInfo.choice_cnt > 0 ? voteInfo.choice_cnt : 1;

  const toggleVoteOption = (optIdx: number) => {
    if (!voteInfo || voted || voteEnded) return;
    setSelections((prev) => {
      if (prev.includes(optIdx)) return prev.filter((x) => x !== optIdx);
      if (prev.length >= maxChoice) return [...prev.slice(1), optIdx];
      return [...prev, optIdx];
    });
  };

  const submitVote = async () => {
    if (!detail || !voteInfo || !voteInfo.vote_id || selections.length === 0 || voting) return;
    setVoting(true);
    try {
      const res = await dynamicsApi.doVote({
        vote_id: voteInfo.vote_id,
        votes: selections,
        voter_uid: userInfo?.mid ?? 0,
        dynamic_id: Number(detail.id_str) || 0,
      });
      if (res?.code !== 0) {
        showToast(res?.message || '投票失败');
        return;
      }
      const vi = res?.data?.vote_info;
      if (vi) {
        setVoteInfo({ ...vi, options: vi.options ?? [] });
        setSelections(vi.my_votes ?? selections);
        setVoteEnded((vi.end_time ?? 0) * 1000 <= Date.now());
      }
      feedBackSuccess();
    } catch (e) {
      console.error('do vote error:', e);
      showToast('投票失败，请重试');
    } finally {
      setVoting(false);
    }
  };

  /* ===== 预约 ===== */
  const reserveBtn = reserve?.button;
  const isReserved = reserveBtn?.status === reserveBtn?.type;
  const reserveBtnText =
    reserveBtn?.jump_text ??
    (isReserved ? reserveBtn?.check_text ?? '已预约' : reserveBtn?.uncheck_text ?? '预约');
  const reserveBtnDisabled = reserveBusy || reserveBtn?.disable === 1;

  const handleReserve = async () => {
    if (!detail || !reserve || !reserveBtn || reserveBtnDisabled) return;
    if (!isLoggedIn) {
      showToast('请先登录');
      return;
    }
    setReserveBusy(true);
    try {
      const res = await dynamicsApi.dynReserve({
        reserve_id: reserve.rid ?? 0,
        cur_btn_status: reserveBtn.status ?? 0,
        dynamic_id_str: detail.id_str,
        ...(reserve.reserve_total != null ? { reserve_total: reserve.reserve_total } : {}),
      });
      if (res?.code !== 0) {
        showToast(res?.message || '操作失败');
        return;
      }
      const data = res?.data;
      if (data) {
        setReserve((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            reserve_total: data.reserve_update ?? prev.reserve_total,
            button: { ...(prev.button ?? {}), status: data.final_btn_status ?? prev.button?.status },
            ...(data.desc_update ? { desc2: { text: data.desc_update } } : {}),
          };
        });
        feedBackSuccess();
      }
    } catch (e) {
      console.error('reserve error:', e);
      showToast('操作失败，请重试');
    } finally {
      setReserveBusy(false);
    }
  };

  const author = detail?.modules?.module_author;
  const isOwn = !!userInfo?.mid && author?.mid === userInfo.mid;
  const isPinned = author?.isPinned === true;
  const isPrivate = author?.privatePub === 1;
  const stat = detail?.modules?.module_stat;
  const dynamic = detail?.modules?.module_dynamic;
  const major = dynamic?.major;
  const desc = dynamic?.desc?.text || major?.opus?.summary?.text || major?.opus?.title || '';
  const orig = detail?.orig;
  const topic = dynamic?.topic;
  const detailTitle = author?.name ? `${author.name} 的动态` : '动态详情';

  const openActions = () => {
    if (!detail) return;
    const actions: { text: string; style?: 'destructive' | 'cancel'; onPress: () => void }[] = [];
    if (isOwn) {
      actions.push({
        text: '编辑',
        onPress: () => router.push({ pathname: '/dynamics/create', params: { editId: detail.id_str, text: desc } } as any),
      });
      actions.push({
        text: isPinned ? '取消置顶' : '置顶',
        onPress: () => {
          void (isPinned
            ? dynamicsApi.rmTop({ dyn_str: detail.id_str })
            : dynamicsApi.setTop({ dyn_str: detail.id_str }))
            .then((res: any) => {
              if (res?.code === 0) {
                setDetail((prev) => prev ? { ...prev, modules: { ...prev.modules, module_author: { ...prev.modules?.module_author, isPinned: !isPinned } } } : prev);
                showToast(isPinned ? '已取消置顶' : '已置顶');
              } else {
                showToast(res?.message || '操作失败');
              }
            })
            .catch(() => showToast('操作失败'));
        },
      });
      actions.push({
        text: isPrivate ? '设为公开' : '设为私密',
        onPress: () => {
          void dynamicsApi.privatePubSetting({ dyn_id: detail.id_str, private_pub: isPrivate ? 0 : 1 })
            .then((res: any) => {
              if (res?.code === 0) {
                setDetail((prev) => prev ? { ...prev, modules: { ...prev.modules, module_author: { ...prev.modules?.module_author, privatePub: isPrivate ? 0 : 1 } } } : prev);
                showToast(isPrivate ? '已设为公开' : '已设为私密');
              } else {
                showToast(res?.message || '操作失败');
              }
            })
            .catch(() => showToast('操作失败'));
        },
      });
      actions.push({
        text: '删除',
        style: 'destructive',
        onPress: () => {
          Alert.alert('删除动态', '删除后无法恢复，确定继续吗？', [
            { text: '取消', style: 'cancel' },
            {
              text: '删除',
              style: 'destructive',
              onPress: async () => {
                try {
                  const res = await dynamicsApi.remove({ dyn_id_str: detail.id_str });
                  if (res?.code === 0) {
                    showToast('已删除');
                    router.back();
                  } else {
                    showToast(res?.message || '删除失败');
                  }
                } catch {
                  showToast('删除失败，请重试');
                }
              },
            },
          ]);
        },
      });
    } else {
      actions.push({
        text: '举报',
        onPress: () => {
          Alert.alert('举报动态', undefined, [
            ...DYNAMIC_REPORT_REASONS.map((r) => ({
              text: r.label,
              onPress: async () => {
                try {
                  const res = await dynamicsApi.report({ dynamic_id: detail.id_str, reason: r.code });
                  showToast(res?.code === 0 ? '举报已提交' : res?.message || '举报失败');
                } catch {
                  showToast('举报失败，请重试');
                }
              },
            })),
            { text: '取消', style: 'cancel' },
          ]);
        },
      });
    }
    actions.push({ text: '转发', onPress: () => router.push(`/dynamics_repost/${detail.id_str}` as any) });
    actions.push({
      text: '保存/分享',
      onPress: () => router.push({
        pathname: '/save_panel',
        params: { title: detailTitle, url: `https://t.bilibili.com/${detail.id_str}` },
      } as any),
    });
    actions.push({ text: '取消', style: 'cancel', onPress: () => {} });
    Alert.alert('动态操作', undefined, actions);
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]}>
      <Stack.Screen options={{ title: detailTitle, headerShown: true, headerLargeTitle: false }} />
      {detailTitle ? <Stack.Title large>{detailTitle}</Stack.Title> : null}
      <Stack.Header blurEffect="systemMaterial" style={{ shadowColor: 'transparent' }} />
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button icon="ellipsis" accessibilityLabel="动态操作" onPress={openActions} />
      </Stack.Toolbar>
      {loading ? (
        <View style={styles.loadingWrap}>
          <Host matchContents><ProgressView /></Host>
        </View>
      ) : detail ? (
        <DynamicDetailBody
          scrollRef={scrollRef}
          detail={detail}
          author={author}
          stat={stat}
          desc={desc}
          orig={orig}
          topic={topic}
          liked={liked}
          onLike={handleLike}
          onOpenComments={openComments}
          onForward={() => router.push(`/dynamics_repost/${detail.id_str}` as any)}
          onShare={() => router.push({
            pathname: '/save_panel',
            params: { title: detailTitle, url: `https://t.bilibili.com/${detail.id_str}` },
          } as any)}
          voteInfo={voteInfo}
          voteLoading={voteLoading}
          voted={voted}
          voteEnded={voteEnded}
          showVotePct={showVotePct}
          totalCnt={totalCnt}
          maxChoice={maxChoice}
          selections={selections}
          voting={voting}
          onToggleOption={toggleVoteOption}
          onSubmitVote={submitVote}
          reserve={reserve}
          reserveBtnText={reserveBtnText}
          reserveBtnDisabled={reserveBtnDisabled}
          onReserve={handleReserve}
          showActionBar={showDynActionBar}
          showInteraction={showDynInteraction}
          showDispute={showDynDispute}
          showComments={showComments}
          commentLoading={commentLoading}
          commentError={commentError}
          replies={replies}
          commentHasMore={commentHasMore}
          commentLoaded={commentLoaded}
          commentCount={stat?.comment?.count || 0}
          onLoadMoreComments={() => loadComments(true)}
          onRetryComments={() => loadComments()}
        />
      ) : (
        <View style={styles.loadingWrap}>
          <Text style={[T.footnote, styles.empty, { color: colors.textTertiary }]}>加载失败</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  loadingWrap: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  empty: { textAlign: 'center', marginTop: 30 },
});
