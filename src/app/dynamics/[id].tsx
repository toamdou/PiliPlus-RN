import { useState, useCallback, useEffect, useRef } from 'react';
import {
  Alert,
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Pressable,
  type GestureResponderEvent,
} from 'react-native';
import type { FlashListRef } from '@shopify/flash-list';
import { Host, ProgressView } from '@expo/ui/swift-ui';
import { useLocalSearchParams, Stack, useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Image as ExpoImage } from 'expo-image';
import { PiliPlayer, PiliPlayerView } from 'pili-player';
import { useThemeColors, ACCENT } from '@/components/SwiftUIHost';
import { useType } from '@/components/type-scale';
import { Press } from '@/components/motion';
import { DynamicDetailBody } from '@/components/dynamics/DynamicDetailBody';
import { type DynDetail, type VoteInfoData, type ReserveCard, dynArchive } from '@/components/dynamics/dynamic-types';
import { type ReplyItem } from '@/components/CommentSection';
import { dynamicsApi } from '@/api/dynamics';
import { videoApi } from '@/api/video';
import { replyApi } from '@/api/reply';
import { createNativeRequestCancelToken, type NativeRequestCancelToken } from '@/utils/request-cancel';
import { useAuthStore } from '@/stores/auth';
import { useSettingsStore } from '@/stores/settings';
import { feedBack, feedBackSuccess } from '@/utils/feedback';
import { showToast } from '@/utils/toast';
import { av2bv } from '@/utils/id-utils';
import { PLAYER_HEADERS, getBestPlayUrl } from '@/utils/player-utils';
import { formatDuration } from '@/utils/format';
import { biliCover } from '@/utils/image-url';
import { RADII, shadow } from '@/theme/tokens';

const DYNAMIC_REPORT_REASONS = [
  { code: 1, label: '色情低俗' },
  { code: 2, label: '垃圾广告' },
  { code: 3, label: '违法违规' },
  { code: 4, label: '人身攻击' },
];

/* ===== 动态详情内联播放器（batch-5 P1）=====
 * 仅对带 bvid/cid 的视频类动态（DYNAMIC_TYPE_AV / UGC_SEASON / PGC 等）渲染。
 *
 * 播放器实例策略：页面内独立 `new PiliPlayer()` 实例（非共享单例直接引用），
 * 避免与视频详情页/直播页的 PiliPlayer.shared 归属逻辑纠缠；退出页面时
 * `replaceAsync(null)` 主动清空源（对齐审计 N1：卸载只 pause 不重置源会
 * 导致"返回上一级显示最后一帧/黑屏、点播放播出上一屏内容"）。
 *
 * 原生 PiliPlayerSession 本身是单例，JS 侧多实例共享同一 AVPlayer——因此
 * 进入播放时即对共享播放器源产生占用：本页在失焦时暂停、返回时校验
 * `sourceUri !== 本页 playUrl` 则重新 replaceAsync 恢复（等价于 N1 的焦点校验），
 * 但不动 stores/player.ts，避免与视频页的 claimSource 逻辑互相覆盖。 */
function DynamicInlinePlayer({
  detail,
  colors,
  T,
  onOpenVideo,
}: {
  detail: DynDetail;
  colors: ReturnType<typeof useThemeColors>;
  T: ReturnType<typeof useType>;
  onOpenVideo: (bvid: string) => void;
}) {
  const archive = dynArchive(detail);
  /* 优先 archive.bvid；部分 ugc_season/pgc 仅带 aid，用 av2bv 反算 bvid */
  const bvid = archive?.bvid || (archive?.aid ? av2bv(archive.aid) : '');
  /* 动态详情接口的 archive 带 cid（类型未声明，防御式读取） */
  const cid = (archive as any)?.cid as number | undefined;

  /* 播放器实例：原生 PiliPlayerSession 是单例，JS 侧 new PiliPlayer() 只是独立封装。
     ref 持有稳定实例，useState 镜像一份供渲染期传给 PiliPlayerView
     （避免 react-hooks/refs：渲染体内不得读 ref）。getPlayer 惰性创建，
     首次点击播放或首次取到播放地址时才实例化。 */
  const playerRef = useRef<PiliPlayer | null>(null);
  const [player, setPlayer] = useState<PiliPlayer | null>(null);
  const [playUrl, setPlayUrl] = useState('');
  const [urlLoading, setUrlLoading] = useState(false);
  const [urlFailed, setUrlFailed] = useState(false);
  const [videoStarted, setVideoStarted] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playFailed, setPlayFailed] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const videoStartedRef = useRef(false);
  useEffect(() => {
    videoStartedRef.current = videoStarted;
  }, [videoStarted]);
  /* 进度条可点按 seek：记录轨道实际宽度用于换算 locationX */
  const trackWidthRef = useRef(0);

  const getPlayer = useCallback(() => {
    if (!playerRef.current) {
      const p = new PiliPlayer();
      p.setRate(1);
      playerRef.current = p;
      setPlayer(p);
    }
    return playerRef.current;
  }, []);

  /* 进详情即预取播放地址（视频详情接口 playUrl，复用视频页同一套取流参数）。
     延迟一拍再拉取：避免 effect 内同步 setState（react-hooks/set-state-in-effect，同仓库惯例） */
  useEffect(() => {
    if (!bvid || !cid) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      setUrlLoading(true);
      setUrlFailed(false);
      videoApi
        .playUrl({ bvid, cid })
        .then((res: any) => {
          if (cancelled) return;
          const url = getBestPlayUrl(res?.data);
          if (url) setPlayUrl(url);
          else setUrlFailed(true);
        })
        .catch(() => {
          if (!cancelled) setUrlFailed(true);
        })
        .finally(() => {
          if (!cancelled) setUrlLoading(false);
        });
    }, 0);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [bvid, cid]);

  /* 播放状态监听：进度 / 播放中 / 就绪取时长 / 播完归零 */
  useEffect(() => {
    if (!playUrl) return;
    const p = getPlayer();
    const timeSub = p.addListener('timeUpdate', (e: any) => {
      if (typeof e.duration === 'number' && e.duration > 0) setDuration(e.duration);
      setCurrentTime(e.currentTime);
    });
    const playingSub = p.addListener('playingChange', (e: any) => {
      setIsPlaying(!!e.isPlaying);
    });
    const statusSub = p.addListener('statusChange', (e: any) => {
      if (e.status === 'readyToPlay' && p.duration > 0) setDuration(p.duration);
      if (e.status === 'error') {
        setPlayFailed(true);
        setIsPlaying(false);
      }
    });
    const endSub = p.addListener('playToEnd', () => {
      setIsPlaying(false);
      p.seekTo(0);
      setCurrentTime(0);
    });
    return () => {
      timeSub.remove();
      playingSub.remove();
      statusSub.remove();
      endSub.remove();
    };
  }, [playUrl, getPlayer]);

  const handlePlay = useCallback(() => {
    if (!playUrl || urlFailed || playFailed) return;
    feedBack();
    const p = getPlayer();
    setPlayFailed(false);
    videoStartedRef.current = true;
    setVideoStarted(true);
    void p
      .replaceAsync({ uri: playUrl, headers: { ...PLAYER_HEADERS } })
      .then(() => {
        p.play();
      })
      .catch(() => {
        setPlayFailed(true);
      });
  }, [playUrl, urlFailed, playFailed, getPlayer]);

  /* 失焦暂停：页面 blur（如 push 视频详情/切后台）即暂停，避免后台出声 */
  useFocusEffect(
    useCallback(() => {
      return () => {
        try {
          playerRef.current?.pause();
        } catch {}
      };
    }, []),
  );
  /* 返回校验源（对齐 N1）：共享 AVPlayer 源可能被其他屏 replaceAsync 劫持，
     重新聚焦时若 sourceUri ≠ 本页源且已点过播放 → 重载并续播 */
  useFocusEffect(
    useCallback(() => {
      const p = playerRef.current;
      if (!p) return;
      if (videoStartedRef.current && playUrl && p.sourceUri !== playUrl) {
        void p
          .replaceAsync({ uri: playUrl, headers: { ...PLAYER_HEADERS } })
          .then(() => {
            p.play();
          })
          .catch(() => {});
      }
      return undefined;
    }, [playUrl]),
  );

  /* 卸载清理：pause + 清空源（N1 语义，释放解码器与前向缓冲） */
  useEffect(() => {
    return () => {
      try {
        playerRef.current?.pause();
        void playerRef.current?.replaceAsync(null).catch(() => {});
      } catch {}
    };
  }, []);

  if (!archive || !bvid || !cid) return null;

  const cover = archive.cover || '';
  const ratio = duration > 0 ? Math.min(Math.max(currentTime / duration, 0), 1) : 0;
  const showSpinner = urlLoading || (videoStarted && !playFailed && !isPlaying && currentTime === 0);

  const handleSeek = (e: GestureResponderEvent) => {
    if (duration <= 0) return;
    const w = trackWidthRef.current || 1;
    const target = Math.min(Math.max((e.nativeEvent.locationX / w) * duration, 0), duration);
    try {
      getPlayer().seekTo(target);
      setCurrentTime(target);
    } catch {}
  };

  return (
    <View style={[styles.inlinePlayerWrap, { backgroundColor: colors.card, ...shadow('md', colors.isDark) }]}>
      {/* 16:9 播放区 */}
      <View style={[styles.inlineStage, { backgroundColor: '#000' }]}>
        {videoStarted && playUrl && player ? (
          <PiliPlayerView player={player} style={StyleSheet.absoluteFill} videoGravity="contain" />
        ) : (
          <View style={StyleSheet.absoluteFill}>
            {cover ? (
              <ExpoImage source={{ uri: biliCover(cover, 1280, 720) }} style={StyleSheet.absoluteFill} contentFit="cover" />
            ) : (
              <View style={[StyleSheet.absoluteFill, { backgroundColor: '#000' }]} />
            )}
            <View style={styles.inlineCoverOverlay} />
          </View>
        )}
        {/* 居中大播放键：未开始 / 暂停 / 播放失败时可点 */}
        {!videoStarted || !isPlaying ? (
          <Press
            haptic
            scaleTo={0.88}
            onPress={handlePlay}
            style={[
              styles.inlinePlayBtn,
              (urlFailed || playFailed || urlLoading) && styles.inlinePlayBtnDisabled,
            ]}>
            {urlLoading && !videoStarted ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Ionicons name="play" size={26} color="#FFFFFF" />
            )}
          </Press>
        ) : null}
        {/* 右上角：跳转视频详情页（完整播放/弹幕/清晰度） */}
        <Press
          haptic
          scaleTo={0.94}
          onPress={() => onOpenVideo(bvid)}
          style={styles.inlineOpenBtn}>
          <Ionicons name="expand-outline" size={16} color="#FFFFFF" />
          <Text style={[T.caption2, styles.inlineOpenText]}>视频页</Text>
        </Press>
        {/* 播放中缓冲指示 */}
        {showSpinner && (
          <View style={styles.inlineBuffering} pointerEvents="none">
            <ActivityIndicator size="small" color="#FFFFFF" />
          </View>
        )}
        {playFailed && (
          <Text style={[T.caption1, styles.inlineErr]}>播放失败，可点击重试</Text>
        )}
        {urlFailed && (
          <Text style={[T.caption1, styles.inlineErr]}>无法获取播放地址</Text>
        )}
      </View>
      {/* 底部信息行：标题 + 时长 */}
      <View style={styles.inlineMeta}>
        <Text style={[T.footnote, styles.inlineTitle, { color: colors.text }]} numberOfLines={1}>
          {archive.title || ''}
        </Text>
        <Text style={[T.caption2, { color: colors.textTertiary }]}>
          {duration > 0 ? formatDuration(currentTime) : formatDuration(0)} / {formatDuration(duration)}
        </Text>
      </View>
      {/* 进度条（可点按 seek）：外层 Pressable 只覆盖轨道区域，
          避免遮挡播放键与右上角"视频页"按钮 */}
      <Pressable
        onPress={handleSeek}
        accessibilityLabel="进度条"
        style={[styles.inlineTrackWrap]}>
        <View
          style={[styles.inlineTrack, { backgroundColor: colors.fill3 }]}
          onLayout={(e) => {
            trackWidthRef.current = e.nativeEvent.layout.width;
          }}>
          <View style={[styles.inlineTrackFill, { width: `${ratio * 100}%` }]} />
        </View>
      </Pressable>
    </View>
  );
}

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

  const handleOpenVideo = useCallback(
    (bvid: string) => {
      router.push({ pathname: '/video/[id]', params: { id: bvid } });
    },
    [router],
  );

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
        <>
          {/* batch-5 P1：视频类动态顶部内联播放器（独立实例，见 DynamicInlinePlayer 注释） */}
          <DynamicInlinePlayer
            detail={detail}
            colors={colors}
            T={T}
            onOpenVideo={handleOpenVideo}
          />
          {/* 内联播放器固定顶部，详情内容在下方独立滚动（FlashList 需有界高度） */}
          <View style={styles.bodyWrap}>
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
          </View>
        </>
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
  /* 详情内容区：内联播放器固定顶部后，FlashList 需有界高度才能独立滚动 */
  bodyWrap: { flex: 1 },
  /* ===== 动态详情内联播放器（batch-5 P1）===== */
  inlinePlayerWrap: {
    borderRadius: RADII.lg,
    overflow: 'hidden',
  },
  /* 16:9 播放区：高 = 宽 * 9/16，由外层 flex 宽度撑起 */
  inlineStage: {
    width: '100%',
    aspectRatio: 16 / 9,
  },
  inlineCoverOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  inlinePlayBtn: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    marginTop: -27,
    marginLeft: -27,
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  inlinePlayBtnDisabled: { opacity: 0.6 },
  inlineOpenBtn: {
    position: 'absolute',
    top: 8,
    right: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: RADII.circle,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  inlineOpenText: { color: '#FFFFFF', fontWeight: '600' },
  inlineBuffering: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    marginTop: -12,
    marginLeft: -12,
  },
  inlineErr: {
    position: 'absolute',
    bottom: 8,
    left: 12,
    color: 'rgba(255,255,255,0.85)',
  },
  inlineMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingTop: 10,
    gap: 10,
  },
  inlineTitle: { flex: 1, fontWeight: '600' },
  inlineTrackWrap: {
    marginHorizontal: 12,
    marginTop: 8,
    marginBottom: 12,
    height: 20,
    justifyContent: 'center',
  },
  inlineTrack: {
    height: 4,
    borderRadius: 2,
    overflow: 'hidden',
  },
  inlineTrackFill: {
    height: 4,
    borderRadius: 2,
    backgroundColor: ACCENT,
  },
});
