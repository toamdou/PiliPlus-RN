import { View, Text, StyleSheet, ActivityIndicator, TextInput, ActionSheetIOS, Alert, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { ScrollView as RNGHScrollView } from 'react-native-gesture-handler';
import { memo, useCallback, useEffect, useMemo, useRef, useState, type ComponentProps, type ComponentRef, type RefObject } from 'react';
import { FlashList, type ViewToken } from '@shopify/flash-list';
import { Image as ExpoImage } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as Clipboard from 'expo-clipboard';
import Animated, { useSharedValue, useAnimatedStyle, withSpring, withTiming, withSequence, useReducedMotion } from 'react-native-reanimated';
import { useThemeColors, ACCENT } from '@/components/SwiftUIHost';
import { MOTION, Press } from '@/components/motion';
import { useType } from '@/components/type-scale';
import { RADII, continuous } from '@/theme/tokens';
import EmptyState from '@/components/EmptyState';
import ErrorState from '@/components/ErrorState';
import { formatCount, formatTime } from '@/utils/format';
import { biliCover, biliPreview } from '@/utils/image-url';
import { replyApi } from '@/api/reply';
import { dynamicsApi } from '@/api/dynamics';
import { useAuthStore } from '@/stores/auth';
import { useSettingsStore } from '@/stores/settings';
import { showToast } from '@/utils/toast';
import { feedBackSuccess, feedBackSelection } from '@/utils/feedback';
import { storage } from '@/utils/storage';
import EmotePicker from '@/components/emote/EmotePicker';
import { EmoteText } from '@/components/emote/EmoteText';
import { getEmoteMap, type EmoteMap } from '@/api/emote';
import {
  createNativeRequestCancelToken,
  type NativeRequestCancelToken,
} from '@/utils/request-cancel';

export interface ReplyItem {
  rpid: number;
  /** B站回复对象自带评论区主体 id/type，未登录 main 响应同样携带 */
  oid?: number;
  type?: number;
  mid?: number;
  root?: number;
  parent?: number;
  member: { mid?: number; uname: string; avatar: string; level_info?: { current_level: number } };
  content: { message: string; pictures?: { img_src: string; img_width?: number; img_height?: number }[] };
  like: number;
  /** 0=无 1=已赞 2=已踩 */
  action?: number;
  ctime: number;
  rcount: number;
  replies?: ReplyItem[];
  /** web 端控制字段：笔记标识 / IP属地 / UP主置顶 / UP主觉得很赞 */
  reply_control?: { is_note?: boolean; location?: string; is_up_top?: boolean; up_like?: number };
  up_action?: { like?: boolean; reply?: boolean };
}

/**
 * 默认展开的子回复条数（对齐 Flutter：优先显示前几条回复，更多则显示“显示更多”按钮）。
 * rcount <= PREVIEW_REPLIES 时全部显示；rcount > PREVIEW_REPLIES 时显示前 N 条 + 按钮。
 */
export const PREVIEW_REPLIES = 3;

function replyDraftKey(type: number, oid: number): string {
  return `replyDraft:${type}:${oid}`;
}

/** 等级徽章配色（对齐 B 站 Lv0-Lv6 色阶） */
const LEVEL_COLORS = ['#BFBFBF', '#BFBFBF', '#95DDC7', '#7EC5FF', '#FFB37A', '#FF8C4D', '#FF5C5C'];

/** 排序分段滑块弹簧（05-C3：spring(ratio 0.85, k=350)——damping = 0.85 × 2√350 ≈ 31.8，物理分支） */
const SORT_SLIDER_SPRING = { damping: +(0.85 * 2 * Math.sqrt(350)).toFixed(2), stiffness: 350, mass: 1 } as const;

interface ReplyPatch {
  like?: number;
  action?: number;
  removed?: boolean;
  top?: boolean;
}

type ReplyPatchMap = Record<number, ReplyPatch>;

function applyPatch(reply: ReplyItem, patches: ReplyPatchMap): ReplyItem {
  const p = patches[reply.rpid];
  const base = p
    ? {
        ...reply,
        like: p.like ?? reply.like,
        action: p.action ?? reply.action,
        reply_control: p.top
          ? { ...(reply.reply_control || {}), is_up_top: true }
          : reply.reply_control,
      }
    : reply;
  return {
    ...base,
    replies: base.replies?.map((sr) => applyPatch(sr, patches)),
  };
}

function parseVoteId(message: string): number | null {
  const m = /\{vote:(\d+)\}/.exec(message);
  return m ? Number(m[1]) : null;
}

function cleanVoteText(message: string): string {
  return message.replace(/\{vote:\d+\}/g, '').trim();
}

interface VoteState {
  vote_id: number;
  title?: string;
  join_num?: number;
  choice_cnt?: number;
  my_votes?: number[];
  status?: number;
  options?: { opt_idx?: number; opt_desc?: string; cnt?: number; img_url?: string }[];
}

/* ===== 点赞/踩图标（05-C3 动效规范：spring 1→1.25→1 + 颜色交叉淡入 150ms + haptic light） ===== */
/**
 * ActionThumb —— 共享的"点赞/踩"图标按钮。
 * 实心/描边两个 Ionicons 叠放，激活态进度驱动 opacity 交叉淡入（withTiming 150ms）；
 * 按下时图标做 withSpring(damping 16, k=260) 缩放爆发（MOTION.springBouncy），
 * 按压触觉由 Press 的 haptic（light）提供。系统"减弱动态效果"时跳过缩放、直接落色。
 */
export const ActionThumb = memo(function ActionThumb({
  active,
  size,
  colors,
  iconActive,
  iconIdle,
  label,
  onPress,
}: {
  /** 是否激活（已赞/已踩） */
  active: boolean;
  /** 图标尺寸 pt */
  size: number;
  colors: ReturnType<typeof useThemeColors>;
  /** 激活态图标（实心，如 thumbs-up） */
  iconActive: ComponentProps<typeof Ionicons>['name'];
  /** 未激活图标（描边，如 thumbs-up-outline） */
  iconIdle: ComponentProps<typeof Ionicons>['name'];
  /** 可选计数文案（如点赞数） */
  label?: string;
  onPress: () => void;
}) {
  const T = useType();
  const reducedMotion = useReducedMotion();
  const scale = useSharedValue(1);
  // 颜色交叉淡入进度：1=激活色（accent），0=未激活色（tertiary）
  const fade = useSharedValue(active ? 1 : 0);

  useEffect(() => {
    // 状态变化时 150ms 交叉淡入（对齐 C3：图标颜色交叉淡入 150ms）
    fade.set(reducedMotion ? (active ? 1 : 0) : withTiming(active ? 1 : 0, { duration: MOTION.duration.quick }));
  }, [active, reducedMotion, fade]);

  const handlePress = () => {
    if (!reducedMotion) {
      // 1 → 1.25 → 1 弹簧爆发（damping 16 / k=260），UI 线程串行播放
      scale.set(withSequence(
        withSpring(1.25, MOTION.springBouncy),
        withSpring(1, MOTION.springBouncy),
      ));
    }
    onPress();
  };

  const popStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));
  const activeStyle = useAnimatedStyle(() => ({ opacity: fade.value }));
  const idleStyle = useAnimatedStyle(() => ({ opacity: 1 - fade.value }));

  return (
    <Press haptic scaleTo={0.9} onPress={handlePress} style={styles.thumbWrap}>
      <Animated.View style={[popStyle, { width: size, height: size, alignItems: 'center', justifyContent: 'center' }]}>
        <Animated.View style={[StyleSheet.absoluteFill, styles.thumbLayer, idleStyle]}>
          <Ionicons name={iconIdle} size={size} color={colors.textTertiary} />
        </Animated.View>
        <Animated.View style={[StyleSheet.absoluteFill, styles.thumbLayer, activeStyle]}>
          <Ionicons name={iconActive} size={size} color={colors.accent} />
        </Animated.View>
      </Animated.View>
      {label != null ? (
        <Text style={[T.caption1, { color: active ? colors.accent : colors.textTertiary, fontWeight: active ? '600' : '400' }]}>{label}</Text>
      ) : null}
    </Press>
  );
});

/* ===== 投票卡片（评论区 {vote:123} 富文本，对齐 Flutter showVoteDialog 入口） ===== */
export const VoteCard = memo(function VoteCard({
  voteId,
  colors,
  T,
}: {
  voteId: number;
  colors: ReturnType<typeof useThemeColors>;
  T: ReturnType<typeof useType>;
}) {
  const [vote, setVote] = useState<VoteState | null>(null);
  const [voting, setVoting] = useState(false);

  useEffect(() => {
    let alive = true;
    dynamicsApi.voteInfo({ vote_id: voteId }).then((res: any) => {
      if (!alive) return;
      const data = res?.data?.vote_info || res?.data;
      if (data) setVote(data);
    }).catch(() => {});
    return () => { alive = false; };
  }, [voteId]);

  const doVote = useCallback(async (optIdx: number) => {
    if (!vote || voting || (vote.my_votes || []).length >= (vote.choice_cnt || 1)) return;
    setVoting(true);
    try {
      const res = await dynamicsApi.doVote({ vote_id: voteId, votes: [optIdx], status: 0 });
      if (res?.code === 0) {
        const data = res?.data?.vote_info || res?.data;
        if (data) {
          setVote(data);
        } else {
          setVote({
            ...vote,
            my_votes: [optIdx],
            join_num: (vote.join_num || 0) + 1,
            options: vote.options?.map((o) =>
              o.opt_idx === optIdx ? { ...o, cnt: (o.cnt || 0) + 1 } : o,
            ),
          });
        }
        feedBackSuccess();
      } else {
        showToast(res?.message || '投票失败');
      }
    } catch {
      showToast('投票失败');
    } finally {
      setVoting(false);
    }
  }, [vote, voting, voteId]);

  if (!vote) {
    return (
      <View style={[styles.voteCard, { backgroundColor: colors.fill2 }]}>
        <ActivityIndicator size="small" color={colors.textTertiary} />
      </View>
    );
  }

  const options = vote.options || [];
  const total = options.reduce((sum, o) => sum + (o.cnt || 0), 0);
  const myVotes = vote.my_votes || [];
  const done = myVotes.length >= (vote.choice_cnt || 1) || vote.status === 2;

  return (
    <View style={[styles.voteCard, { backgroundColor: colors.fill2 }]}>
      <View style={styles.voteHead}>
        <Ionicons name="bar-chart" size={16} color={ACCENT} />
        <Text style={[T.footnote, styles.voteTitle, { color: colors.text }]} numberOfLines={2}>
          {vote.title || '投票'}
        </Text>
        <Text style={[T.caption2, { color: colors.textTertiary }]}>
          {formatCount(vote.join_num || total)}人参与
        </Text>
      </View>
      {options.map((o) => {
        const idx = o.opt_idx ?? 0;
        const selected = myVotes.includes(idx);
        const pct = total > 0 ? Math.round(((o.cnt || 0) / total) * 100) : 0;
        return (
          <Press
            key={idx}
            haptic
            scaleTo={0.98}
            disabled={done || voting}
            onPress={() => doVote(idx)}
            style={[styles.voteOption, { borderColor: selected ? ACCENT : colors.separator }]}>
            <View style={[styles.voteOptionFill, { width: `${pct}%`, backgroundColor: selected ? 'rgba(251,114,153,0.18)' : 'rgba(120,120,128,0.12)' }]} />
            <View style={styles.voteOptionRow}>
              <Text style={[T.footnote, styles.voteOptionText, { color: colors.text }]} numberOfLines={1}>
                {o.opt_desc || `选项${idx + 1}`}
              </Text>
              <Text style={[T.caption2, { color: selected ? ACCENT : colors.textTertiary, fontWeight: selected ? '700' : '400' }]}>
                {done ? `${pct}%` : `${formatCount(o.cnt || 0)}`}
              </Text>
            </View>
          </Press>
        );
      })}
    </View>
  );
});

/* ===== 评论区（memo 隔离：仅在 replies/expandedReplies 等 props 变化时重渲染，与弹幕 tick 解耦）===== */
export const CommentSection = memo(function CommentSection({
  replies,
  expandedReplies,
  hasMoreReplies,
  loadingMore,
  commentsError,
  commentsLoaded,
  colors,
  T,
  replyLengthLimit,
  upMid,
  sortType,
  onSortChange,
  scrollRef,
  onScroll,
  scrollEventThrottle,
  onToggleSub,
  onLoadMoreSub,
  onPreloadSubReplies,
  onLoadMore,
  onOpenViewer,
  onOpenReplyDetail,
  onLongPress,
  onRetry,
  oid,
  type,
}: {
  replies: ReplyItem[];
  expandedReplies: Set<number>;
  hasMoreReplies: boolean;
  loadingMore?: boolean;
  commentsError: string | null;
  commentsLoaded: boolean;
  colors: ReturnType<typeof useThemeColors>;
  T: ReturnType<typeof useType>;
  replyLengthLimit: number;
  /** UP主 mid：用于渲染 UP 徽章（对齐 Flutter：replyItem.mid == upMid） */
  upMid?: number;
  /** 排序（对齐 Flutter replySortType：0=最热 1=最新） */
  sortType: number;
  onSortChange: (sort: number) => void;
  /** RNGH ScrollView ref：供外层 tab 水平滑动手势 simultaneousWithExternalGesture 引用 */
  scrollRef?: RefObject<ComponentRef<typeof RNGHScrollView> | null>;
  onScroll?: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
  scrollEventThrottle?: number;
  onToggleSub: (rpid: number) => void;
  onLoadMoreSub: (rpid: number) => void;
  /** 可视区评论进入视口时预加载楼中楼（由父级限流，避免全量并发请求） */
  onPreloadSubReplies?: (oid: number, items: ReplyItem[]) => void;
  onLoadMore: () => void;
  onOpenViewer: (images: string[], idx: number) => void;
  onOpenReplyDetail: (rpid: number) => void;
  onLongPress: (reply: ReplyItem) => void;
  onRetry: () => void;
  /** 评论区主体（缺省时从回复项自带 oid/type 推导） */
  oid?: number;
  type?: number;
}) {
  const viewHeightRef = useRef(0);
  const contentHeightRef = useRef(0);
  const draftKeyRef = useRef<string | null>(null);
  const myMid = useAuthStore((s) => s.userInfo?.mid);
  const isLoggedIn = useAuthStore((s) => s.isLoggedIn);
  const saveReply = useSettingsStore((s) => s.saveReply);
  const enableWordRe = useSettingsStore((s) => s.enableWordRe);

  const subjectOid = oid ?? replies.find((r) => r.oid)?.oid ?? 0;
  const subjectType = type ?? replies.find((r) => r.type)?.type ?? 1;

  const [patches, setPatches] = useState<ReplyPatchMap>({});
  const [added, setAdded] = useState<ReplyItem[]>([]);
  const [searchMode, setSearchMode] = useState(false);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [searchResults, setSearchResults] = useState<ReplyItem[]>([]);
  const [searching, setSearching] = useState(false);
  const [composer, setComposer] = useState('');
  const [composing, setComposing] = useState(false);
  const [replyingTo, setReplyingTo] = useState<{ rpid: number; root: number; parent: number; name: string } | null>(null);
  const [replyText, setReplyText] = useState('');
  const [replyImage, setReplyImage] = useState<string | null>(null);
  const [sendingReply, setSendingReply] = useState(false);
  /* ===== 表情面板（emote 体系：全站缺口批次5 P0） ===== */
  const [showEmote, setShowEmote] = useState(false);
  const [emoteMap, setEmoteMap] = useState<EmoteMap | null>(null);

  // 表情映射表：模块级缓存拉取一次，接口不可用时自动回退内置兜底（[tv_doge] 等）
  useEffect(() => {
    let alive = true;
    getEmoteMap()
      .then((m) => { if (alive) setEmoteMap(m); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  /* ===== 排序分段滑块（05-C3：滑块 translate spring(0.85, k=350)，禁背景色瞬切） ===== */
  const reducedMotion = useReducedMotion();
  const sortTabs = useRef<{ x: number; width: number }[]>([]);
  const lastSortTapRef = useRef<number | null>(null);
  const sortSliderX = useSharedValue(0);
  const sortSliderW = useSharedValue(0);
  const sortSliderStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: sortSliderX.value }],
    width: sortSliderW.value,
  }));

  /** 滑块移动到指定 tab（animate=true 走弹簧；false 直接落位，用于首帧/外部排序变更/减弱动态） */
  const moveSortSlider = useCallback((idx: number, animate: boolean) => {
    const layout = sortTabs.current[idx];
    if (!layout) return;
    const targetX = layout.x;
    const targetW = Math.max(layout.width, 40);
    if (animate && !reducedMotion) {
      sortSliderX.set(withSpring(targetX, SORT_SLIDER_SPRING));
      sortSliderW.set(withSpring(targetW, SORT_SLIDER_SPRING));
    } else {
      sortSliderX.set(targetX);
      sortSliderW.set(targetW);
    }
  }, [reducedMotion, sortSliderX, sortSliderW]);

  const handleSortTap = useCallback((idx: number) => {
    if (sortType === idx) return;
    lastSortTapRef.current = idx;
    moveSortSlider(idx, true);
    onSortChange(idx);
  }, [sortType, moveSortSlider, onSortChange]);

  /** 记录分段按钮布局；激活 tab 首次布局时直接落位（无弹跳） */
  const registerSortTab = useCallback((idx: number, x: number, width: number) => {
    sortTabs.current[idx] = { x, width };
    if (sortType === idx) {
      sortSliderX.set(x);
      sortSliderW.set(Math.max(width, 40));
    }
  }, [sortType, sortSliderX, sortSliderW]);

  useEffect(() => {
    // 外部排序变更（如切 P 页后父级恢复排序）时滑块落位；用户点击路径已由 moveSortSlider(true) 处理
    if (lastSortTapRef.current !== sortType) moveSortSlider(sortType, false);
    lastSortTapRef.current = null;
  }, [sortType, moveSortSlider]);

  useEffect(() => {
    if (!saveReply || !subjectOid) return;
    const key = replyDraftKey(subjectType, subjectOid);
    let alive = true;
    storage.getJSON<{ text?: string }>(key).then((draft) => {
      if (alive && draftKeyRef.current !== key) {
        draftKeyRef.current = key;
        setComposer(draft?.text ?? '');
      }
    }).catch(() => {});
    return () => { alive = false; };
  }, [saveReply, subjectOid, subjectType]);

  const draftSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const draftPendingRef = useRef('');
  const searchCancelRef = useRef<NativeRequestCancelToken | null>(null);
  const uploadCancelRef = useRef<NativeRequestCancelToken | null>(null);

  useEffect(() => () => {
    searchCancelRef.current?.abort();
    uploadCancelRef.current?.abort();
  }, []);

  const handleComposerChange = useCallback((text: string) => {
    setComposer(text);
    if (!saveReply || !subjectOid) return;
    draftPendingRef.current = text.trim() ? text : '';
    if (draftSaveTimerRef.current) clearTimeout(draftSaveTimerRef.current);
    draftSaveTimerRef.current = setTimeout(() => {
      draftSaveTimerRef.current = null;
      const key = replyDraftKey(subjectType, subjectOid);
      if (draftPendingRef.current) {
        storage.setJSON(key, { text: draftPendingRef.current });
      } else {
        storage.remove(key);
      }
    }, 500);
  }, [saveReply, subjectOid, subjectType]);

  // 表情面板选中：把 [xxx] 文本码拼进输入框
  const handleEmoteSelect = useCallback((code: string) => {
    if (replyingTo) {
      // 正在回复楼中楼：拼进楼中楼输入框
      setReplyText((prev) => prev + code);
    } else {
      // 主评论输入框：拼进草稿文本（同步触发草稿保存）
      setComposer((prev) => {
        const next = prev + code;
        handleComposerChange(next);
        return next;
      });
    }
  }, [replyingTo, handleComposerChange]);

  useEffect(() => {
    return () => {
      if (!draftSaveTimerRef.current) return;
      clearTimeout(draftSaveTimerRef.current);
      const key = replyDraftKey(subjectType, subjectOid);
      if (draftPendingRef.current) {
        void storage.setJSON(key, { text: draftPendingRef.current });
      } else {
        void storage.remove(key);
      }
    };
  }, [subjectOid, subjectType]);

  const displayReplies = useMemo(() => {
    if (searchMode) return searchResults.map((r) => applyPatch(r, patches));
    const base = replies.filter((r) => !patches[r.rpid]?.removed).map((r) => applyPatch(r, patches));
    return [...base, ...added.map((r) => applyPatch(r, patches))];
  }, [replies, patches, added, searchMode, searchResults]);

  const ensureSubject = useCallback(() => {
    if (!isLoggedIn) {
      showToast('请先登录');
      return false;
    }
    if (!subjectOid) {
      showToast('评论主体信息缺失');
      return false;
    }
    return true;
  }, [isLoggedIn, subjectOid]);

  const patchReply = useCallback((rpid: number, patch: ReplyPatch) => {
    setPatches((prev) => ({ ...prev, [rpid]: { ...prev[rpid], ...patch } }));
  }, []);

  const toggleLike = useCallback(async (reply: ReplyItem) => {
    if (!ensureSubject()) return;
    const nextAction = reply.action === 1 ? 2 : 1;
    const delta = nextAction === 1 ? 1 : -1;
    patchReply(reply.rpid, { like: Math.max(0, reply.like + delta), action: nextAction === 1 ? 1 : 0 });
    try {
      const res = await replyApi.like({ oid: subjectOid, type: subjectType, rpid: reply.rpid, action: nextAction });
      if (res?.code !== 0) {
        patchReply(reply.rpid, { like: reply.like, action: reply.action });
        showToast(res?.message || '操作失败');
      } else {
        feedBackSuccess();
      }
    } catch {
      patchReply(reply.rpid, { like: reply.like, action: reply.action });
      showToast('操作失败');
    }
  }, [ensureSubject, subjectOid, subjectType, patchReply]);

  const toggleHate = useCallback(async (reply: ReplyItem) => {
    if (!ensureSubject()) return;
    const nextAction = reply.action === 2 ? 2 : 1;
    patchReply(reply.rpid, { action: nextAction === 1 ? 2 : 0 });
    try {
      const res = await replyApi.hate({ oid: subjectOid, type: subjectType, rpid: reply.rpid, action: nextAction });
      if (res?.code !== 0) {
        patchReply(reply.rpid, { action: reply.action });
        showToast(res?.message || '操作失败');
      } else {
        feedBackSuccess();
      }
    } catch {
      patchReply(reply.rpid, { action: reply.action });
      showToast('操作失败');
    }
  }, [ensureSubject, subjectOid, subjectType, patchReply]);

  const doDelete = useCallback((reply: ReplyItem) => {
    if (!ensureSubject()) return;
    Alert.alert('删除评论', '删除后不可恢复，确定删除吗？', [
      { text: '取消', style: 'cancel' },
      {
        text: '删除',
        style: 'destructive',
        onPress: async () => {
          try {
            const res = await replyApi.del({ oid: subjectOid, type: subjectType, rpid: reply.rpid });
            if (res?.code === 0) {
              patchReply(reply.rpid, { removed: true });
              feedBackSuccess();
              showToast('已删除');
            } else {
              showToast(res?.message || '删除失败');
            }
          } catch {
            showToast('删除失败');
          }
        },
      },
    ]);
  }, [ensureSubject, subjectOid, subjectType, patchReply]);

  const doTop = useCallback((reply: ReplyItem) => {
    if (!ensureSubject()) return;
    const isTop = reply.reply_control?.is_up_top === true;
    const action = isTop ? 0 : 1;
    Alert.alert(isTop ? '取消置顶' : '置顶评论', isTop ? '确定取消该评论的置顶吗？' : '确定将该评论置顶吗？', [
      { text: '取消', style: 'cancel' },
      {
        text: isTop ? '取消置顶' : '置顶',
        onPress: async () => {
          try {
            const res = await replyApi.top({ oid: subjectOid, type: subjectType, rpid: reply.rpid, action });
            if (res?.code === 0) {
              patchReply(reply.rpid, { top: !isTop });
              feedBackSuccess();
              showToast(isTop ? '已取消置顶' : '已置顶');
            } else {
              showToast(res?.message || '操作失败');
            }
          } catch {
            showToast('操作失败');
          }
        },
      },
    ]);
  }, [ensureSubject, subjectOid, subjectType, patchReply]);

  const openManage = useCallback((reply: ReplyItem) => {
    feedBackSelection();
    const actions: { label: string; destructive?: boolean; onPress: () => void }[] = [];
    const isUp = upMid != null && reply.member.mid === upMid;
    if (isUp) {
      actions.push({ label: reply.reply_control?.is_up_top ? '取消置顶' : '置顶', onPress: () => doTop(reply) });
    }
    if (myMid != null && reply.mid === myMid) {
      actions.push({ label: '删除', destructive: true, onPress: () => doDelete(reply) });
    }
    actions.push({
      label: '复制',
      onPress: () => {
        Clipboard.setStringAsync(reply.content.message).then(() => showToast('已复制')).catch(() => {});
      },
    });
    const destructiveIndex = actions.findIndex((a) => a.destructive);
    ActionSheetIOS.showActionSheetWithOptions(
      {
        title: reply.member.uname,
        options: [...actions.map((a) => a.label), '取消'],
        cancelButtonIndex: actions.length,
        destructiveButtonIndex: destructiveIndex >= 0 ? destructiveIndex : undefined,
      },
      (index) => {
        if (index >= 0 && index < actions.length) actions[index].onPress();
      },
    );
  }, [upMid, myMid, doTop, doDelete]);

  const uploadPicked = useCallback(async (uri: string) => {
    uploadCancelRef.current?.abort();
    const cancelToken = createNativeRequestCancelToken();
    uploadCancelRef.current = cancelToken;
    const ext = uri.split('.').pop()?.toLowerCase() || 'jpg';
    const mime = ext === 'png' ? 'image/png' : ext === 'gif' ? 'image/gif' : 'image/jpeg';
    try {
      const res = await dynamicsApi.uploadBfs({
        file: { uri, name: `reply_${Date.now()}.${ext}`, type: mime },
        category: 'reply',
        biz: 'reply',
      }, cancelToken);
      return res?.data?.image_url || '';
    } finally {
      if (uploadCancelRef.current === cancelToken) uploadCancelRef.current = null;
    }
  }, []);

  const pickImage = useCallback(async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'] as any,
        quality: 0.82,
      });
      if (!result.canceled && result.assets[0]?.uri) {
        const url = await uploadPicked(result.assets[0].uri);
        if (url) {
          setReplyImage(url);
          showToast('图片已选择');
        } else {
          showToast('图片上传失败');
        }
      }
    } catch {
      showToast('图片选择失败');
    }
  }, [uploadPicked]);

  const sendComment = useCallback(async () => {
    const text = composer.trim();
    if (!ensureSubject() || !text) return;
    setComposing(true);
    try {
      const res = await replyApi.add({ oid: subjectOid, type: subjectType, message: text });
      if (res?.code !== 0) {
        showToast(res?.message || '发送失败');
        return;
      }
      const created = res?.data?.reply as ReplyItem | undefined;
      if (created) {
        setAdded((prev) => [created, ...prev]);
      } else {
        setAdded((prev) => [{
          rpid: Date.now(),
          oid: subjectOid,
          type: subjectType,
          mid: myMid,
          member: { mid: myMid, uname: '我', avatar: '' },
          content: { message: text },
          like: 0,
          ctime: Math.floor(Date.now() / 1000),
          rcount: 0,
        }, ...prev]);
      }
      setComposer('');
      if (saveReply) storage.remove(replyDraftKey(subjectType, subjectOid));
      feedBackSuccess();
      showToast('发送成功');
    } catch {
      showToast('发送失败');
    } finally {
      setComposing(false);
    }
  }, [composer, ensureSubject, subjectOid, subjectType, myMid, saveReply]);

  const sendSubReply = useCallback(async (target: { rpid: number; root: number; parent: number }) => {
    const text = replyText.trim();
    if (!ensureSubject() || !text) return;
    setSendingReply(true);
    try {
      const pictures = replyImage
        ? JSON.stringify([{ img_src: replyImage, img_width: 0, img_height: 0 }])
        : undefined;
      const res = await replyApi.add({
        oid: subjectOid,
        type: subjectType,
        root: target.root,
        parent: target.parent,
        message: text,
        pictures,
      });
      if (res?.code !== 0) {
        showToast(res?.message || '发送失败');
        return;
      }
      const created = res?.data?.reply as ReplyItem | undefined;
      if (created) {
        setAdded((prev) => [created, ...prev]);
      }
      setReplyText('');
      setReplyImage(null);
      setReplyingTo(null);
      feedBackSuccess();
      showToast('发送成功');
    } catch {
      showToast('发送失败');
    } finally {
      setSendingReply(false);
    }
  }, [replyText, replyImage, ensureSubject, subjectOid, subjectType]);

  const doSearch = useCallback(async () => {
    const keyword = searchKeyword.trim();
    if (!keyword) return;
    if (!subjectOid) {
      showToast('评论主体信息缺失');
      return;
    }
    searchCancelRef.current?.abort();
    const cancelToken = createNativeRequestCancelToken();
    searchCancelRef.current = cancelToken;
    setSearching(true);
    try {
      const res = await replyApi.search({ oid: subjectOid, type: subjectType, keyword, pn: 1, ps: 20 }, { cancelToken });
      const arr = (res?.data?.replies || res?.data?.list || (Array.isArray(res?.data) ? res.data : [])) as ReplyItem[];
      setSearchResults(arr || []);
      setSearchMode(true);
    } catch {
      if (!cancelToken.aborted) showToast('搜索失败');
    } finally {
      if (searchCancelRef.current === cancelToken) searchCancelRef.current = null;
      setSearching(false);
    }
  }, [searchKeyword, subjectOid, subjectType]);

  const clearSearch = useCallback(() => {
    setSearchMode(false);
    setSearchResults([]);
    setSearchKeyword('');
  }, []);

  const startReply = useCallback((target: { rpid: number; root: number; parent: number; name: string }) => {
    setReplyText('');
    setReplyImage(null);
    setReplyingTo(target);
  }, []);

  // 内容不足以撑满视口时自动补齐下一页（对齐 Flutter 懒加载：首屏填满为止持续拉取）
  const maybeLoadMore = useCallback(() => {
    if (commentsLoaded && hasMoreReplies && !loadingMore && !searchMode && viewHeightRef.current > 0 && (displayReplies.length === 0 || contentHeightRef.current <= viewHeightRef.current + 60)) {
      onLoadMore();
    }
  }, [commentsLoaded, hasMoreReplies, loadingMore, displayReplies.length, onLoadMore, searchMode]);

  const preloadVisibleReplies = useCallback(
    ({ viewableItems }: { viewableItems: ViewToken<ReplyItem>[] }) => {
      onPreloadSubReplies?.(subjectOid, viewableItems.map((v) => v.item));
    },
    [onPreloadSubReplies, subjectOid],
  );

  const triggerIfNearBottom = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const { layoutMeasurement, contentOffset, contentSize } = e.nativeEvent;
      if (contentSize.height > 0 && layoutMeasurement.height + contentOffset.y >= contentSize.height - 300 && hasMoreReplies && !loadingMore && !searchMode) {
        onLoadMore();
      }
    },
    [hasMoreReplies, loadingMore, onLoadMore, searchMode],
  );

  const renderScroll = useCallback(
    (props: any) => {
      const { ref: internalRef, ...scrollProps } = props;
      return (
        <RNGHScrollView
          ref={(node) => {
            if (scrollRef) scrollRef.current = node;
            if (typeof internalRef === 'function') internalRef(node);
            else if (internalRef) internalRef.current = node;
          }}
          {...scrollProps}
        />
      );
    },
    [scrollRef],
  );

  const renderReply = useCallback(
    ({ item, index }: { item: ReplyItem; index: number }) => (
      <ReplyRow
        reply={item}
        last={index < displayReplies.length - 1}
        expandedReplies={expandedReplies}
        colors={colors}
        T={T}
        replyLengthLimit={replyLengthLimit}
        upMid={upMid}
        myMid={myMid}
        subjectOid={subjectOid}
        subjectType={subjectType}
        replyingTo={replyingTo}
        replyText={replyText}
        replyImage={replyImage}
        sendingReply={sendingReply}
        emoteMap={emoteMap}
        emoteActive={showEmote}
        onEmoteToggle={setShowEmote}
        onToggleSub={onToggleSub}
        onLoadMoreSub={onLoadMoreSub}
        onOpenViewer={onOpenViewer}
        onOpenReplyDetail={onOpenReplyDetail}
        onLongPress={onLongPress}
        onLike={toggleLike}
        onHate={toggleHate}
        onReply={startReply}
        onManage={openManage}
        onReplyTextChange={setReplyText}
        onPickImage={pickImage}
        onSendReply={sendSubReply}
      />
    ),
    [displayReplies.length, expandedReplies, colors, T, replyLengthLimit, upMid, myMid, subjectOid, subjectType, replyingTo, replyText, replyImage, sendingReply, emoteMap, showEmote, onToggleSub, onLoadMoreSub, onOpenViewer, onOpenReplyDetail, onLongPress, toggleLike, toggleHate, openManage, startReply, pickImage, sendSubReply],
  );

  const ItemSeparator = useCallback(
    () => <View style={[styles.replySeparator, { backgroundColor: colors.separator }]} />,
    [colors.separator],
  );

  const ListHeader = (
    <View style={styles.headerBlock}>
      <View style={styles.sortRow}>
        <Text style={[T.subhead, { color: colors.text, fontWeight: '700' }]}>
          {searchMode ? `“${searchKeyword}” 的搜索结果` : (sortType === 1 ? '最新评论' : '最热评论')}
        </Text>
        {searchMode ? (
          <Press haptic scaleTo={0.94} onPress={clearSearch} style={[styles.sortSegBtn, { backgroundColor: colors.fill2 }]}>
            <Text style={[T.footnote, { color: ACCENT, fontWeight: '600' }]}>返回全部</Text>
          </Press>
        ) : (
          <View style={[styles.sortSegment, { backgroundColor: colors.fill2 }]}>
            {/* 弹簧滑块（05-C3）：选中态由滑块表达，按钮不再瞬切背景色 */}
            <Animated.View
              pointerEvents="none"
              style={[styles.sortSlider, { backgroundColor: colors.card }, sortSliderStyle]}
            />
            <Press
              haptic
              scaleTo={0.94}
              onPress={() => handleSortTap(0)}
              onLayout={(e) => registerSortTab(0, e.nativeEvent.layout.x, e.nativeEvent.layout.width)}
              style={styles.sortSegBtn}>
              <Text style={[T.footnote, { color: sortType !== 1 ? colors.text : colors.textTertiary, fontWeight: sortType !== 1 ? '600' : '400' }]}>最热</Text>
            </Press>
            <Press
              haptic
              scaleTo={0.94}
              onPress={() => handleSortTap(1)}
              onLayout={(e) => registerSortTab(1, e.nativeEvent.layout.x, e.nativeEvent.layout.width)}
              style={styles.sortSegBtn}>
              <Text style={[T.footnote, { color: sortType === 1 ? colors.text : colors.textTertiary, fontWeight: sortType === 1 ? '600' : '400' }]}>最新</Text>
            </Press>
          </View>
        )}
      </View>

      {/* 评论搜索 */}
      {enableWordRe && (
        <View style={[styles.searchRow, { backgroundColor: colors.fill2 }]}>
          <Ionicons name="search" size={15} color={colors.textTertiary} />
          <TextInput
            value={searchKeyword}
            onChangeText={setSearchKeyword}
            onSubmitEditing={doSearch}
            placeholder="搜索评论区"
            placeholderTextColor={colors.textTertiary}
            style={[T.footnote, styles.searchInput, { color: colors.text }]}
            returnKeyType="search"
          />
          {searching ? (
            <ActivityIndicator size="small" color={colors.textTertiary} />
          ) : (
            <Press haptic scaleTo={0.9} onPress={doSearch} disabled={!searchKeyword.trim()}>
              <Ionicons name="arrow-forward-circle" size={20} color={searchKeyword.trim() ? ACCENT : colors.textTertiary} />
            </Press>
          )}
        </View>
      )}

      {/* 发表主评论 */}
      {isLoggedIn && (
        <View style={[styles.composerRow, { backgroundColor: colors.fill2 }]}>
          <TextInput
            value={composer}
            onChangeText={handleComposerChange}
            placeholder="发一条友善的评论"
            placeholderTextColor={colors.textTertiary}
            style={[T.footnote, styles.searchInput, { color: colors.text }]}
            multiline
            maxLength={1000}
          />
          <Press
            haptic
            scaleTo={0.9}
            onPress={() => setShowEmote((v) => !v)}
            style={[styles.composerIconBtn, showEmote && { backgroundColor: 'rgba(251,114,153,0.12)' }]}>
            <Ionicons name="happy-outline" size={19} color={showEmote ? ACCENT : colors.textTertiary} />
          </Press>
          <Press
            haptic
            scaleTo={0.92}
            disabled={!composer.trim() || composing}
            onPress={sendComment}
            style={[styles.composerSend, { backgroundColor: composer.trim() && !composing ? ACCENT : colors.fill3 }]}>
            {composing ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Ionicons name="arrow-up" size={18} color={composer.trim() ? '#FFFFFF' : colors.textTertiary} />}
          </Press>
        </View>
      )}

      {/* 表情面板（内联面板，契约 EmotePicker({visible,onSelect(code),onClose})） */}
      <EmotePicker
        visible={showEmote}
        onSelect={handleEmoteSelect}
        onClose={() => setShowEmote(false)}
      />
    </View>
  );

  return (
    <FlashList
      style={{ flex: 1 }}
      renderScrollComponent={renderScroll}
      data={displayReplies}
      keyExtractor={(r, idx) => (r.rpid ? `r-${r.rpid}` : `add-${idx}`)}
      contentContainerStyle={[styles.scrollContent, displayReplies.length > 0 && styles.card, displayReplies.length > 0 && { backgroundColor: colors.card }]}
      showsVerticalScrollIndicator={false}
      scrollEventThrottle={scrollEventThrottle}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="interactive"
      onScroll={onScroll}
      onLayout={(e) => { viewHeightRef.current = e.nativeEvent.layout.height; maybeLoadMore(); }}
      onContentSizeChange={(_w, h) => { contentHeightRef.current = h; maybeLoadMore(); }}
      onScrollEndDrag={triggerIfNearBottom}
      onMomentumScrollEnd={triggerIfNearBottom}
      onEndReached={onLoadMore}
      onEndReachedThreshold={0.3}
      onViewableItemsChanged={preloadVisibleReplies}
      viewabilityConfig={{ itemVisiblePercentThreshold: 40, minimumViewTime: 100 }}
      estimatedItemSize={180}
      windowSize={9}
      initialNumToRender={10}
      maxToRenderPerBatch={12}
      drawDistance={250}
      overrideProps={{ initialDrawBatchSize: 10 }}
      ListHeaderComponent={ListHeader}
      ItemSeparatorComponent={ItemSeparator}
      ListEmptyComponent={
        commentsError ? (
          /* #39：错误态统一走共享 ErrorState（品牌胶囊重试按钮） */
          <ErrorState title="评论加载失败" message={commentsError} onRetry={onRetry} />
        ) : searchMode ? (
          <EmptyState icon="search-outline" title="没有找到相关评论" subtitle="换个关键词试试" />
        ) : (
          <EmptyState
            icon="chatbox-ellipses-outline"
            title={commentsLoaded ? '暂无评论' : '加载中…'}
            subtitle={commentsLoaded ? '来抢沙发，发第一条友善的评论' : '评论加载中，请稍候'}
          />
        )
      }
      ListFooterComponent={
        hasMoreReplies && !searchMode ? (
          <View style={styles.loadMoreRow}>
            <ActivityIndicator size="small" color={colors.textTertiary} />
            <Text style={[T.footnote, { color: colors.textTertiary }]}>正在加载更多评论</Text>
          </View>
        ) : commentsLoaded && displayReplies.length > 0 ? (
          <Text style={[T.footnote, { color: colors.textTertiary, textAlign: 'center', paddingVertical: 6 }]}>没有更多评论了</Text>
        ) : null
      }
      renderItem={renderReply}
    />
  );
});

const ReplyRow = memo(function ReplyRow({
  reply,
  last,
  expandedReplies,
  colors,
  T,
  replyLengthLimit,
  upMid,
  myMid,
  subjectOid,
  subjectType,
  replyingTo,
  replyText,
  replyImage,
  sendingReply,
  emoteMap,
  emoteActive,
  onEmoteToggle,
  onToggleSub,
  onLoadMoreSub,
  onOpenViewer,
  onOpenReplyDetail,
  onLongPress,
  onLike,
  onHate,
  onReply,
  onManage,
  onReplyTextChange,
  onPickImage,
  onSendReply,
}: {
  reply: ReplyItem;
  last: boolean;
  expandedReplies: Set<number>;
  colors: ReturnType<typeof useThemeColors>;
  T: ReturnType<typeof useType>;
  replyLengthLimit: number;
  upMid?: number;
  myMid?: number;
  subjectOid: number;
  subjectType: number;
  replyingTo: { rpid: number; root: number; parent: number; name: string } | null;
  replyText: string;
  replyImage: string | null;
  sendingReply: boolean;
  /** 表情映射表（[xxx] → url），用于评论文本内表情渲染 */
  emoteMap: EmoteMap | null;
  /** 表情面板是否打开（楼中楼回复框的 emote 按钮高亮态） */
  emoteActive: boolean;
  /** 打开/关闭表情面板（楼中楼回复框的 emote 按钮） */
  onEmoteToggle: (show: boolean) => void;
  onToggleSub: (rpid: number) => void;
  onLoadMoreSub: (rpid: number) => void;
  onOpenViewer: (images: string[], idx: number) => void;
  onOpenReplyDetail: (rpid: number) => void;
  onLongPress: (reply: ReplyItem) => void;
  onLike: (reply: ReplyItem) => void;
  onHate: (reply: ReplyItem) => void;
  onReply: (target: { rpid: number; root: number; parent: number; name: string }) => void;
  onManage: (reply: ReplyItem) => void;
  onReplyTextChange: (text: string) => void;
  onPickImage: () => void;
  onSendReply: (target: { rpid: number; root: number; parent: number }) => void;
}) {
  const r = reply;
  const subCount = r.replies?.length || 0;
  const subExpanded = expandedReplies.has(r.rpid);
  const showBox = subCount > 0 && r.rcount > 0;
  const showMoreBtn = !subExpanded && r.rcount > PREVIEW_REPLIES;
  const showLoadMoreBtn = showBox && subExpanded && subCount < r.rcount;
  const previewed = showBox && !subExpanded ? r.replies!.slice(0, PREVIEW_REPLIES) : r.replies;
  const level = r.member.level_info?.current_level ?? 0;
  const levelColor = LEVEL_COLORS[Math.min(Math.max(level, 0), LEVEL_COLORS.length - 1)];
  const isUp = upMid != null && r.member.mid === upMid;
  const location = r.reply_control?.location;
  const isTop = r.reply_control?.is_up_top === true;
  const voteId = parseVoteId(r.content.message);
  const displayMessage = voteId != null ? cleanVoteText(r.content.message) : r.content.message;

  const isReplying = replyingTo?.rpid === r.rpid;

  /* ===== "展开全文"（05-B4/06-V8：replyLengthLimit 行截断需有展开入口，收起态仍可收回） ===== */
  const [msgExpanded, setMsgExpanded] = useState(false);
  const [msgTruncated, setMsgTruncated] = useState(false);
  const [msgMeasured, setMsgMeasured] = useState(false);
  // 隐藏的"全文测量"文本：与可见文案同宽同行高，一次性测量真实行数，用于判断是否被截断
  const fullMsg = `${isTop ? '[置顶] ' : ''}${r.reply_control?.is_note && !displayMessage.startsWith('[笔记]') ? '[笔记] ' : ''}${displayMessage}`;
  // FlashList 回收复用时行实例被复用：按 rpid 重置测量/展开状态，避免串数据
  useEffect(() => {
    setMsgMeasured(false);
    setMsgTruncated(false);
    setMsgExpanded(false);
  }, [r.rpid]);

  return (
    <Press scaleTo={1} onPress={() => {}} onLongPress={() => onLongPress(r)} style={[styles.replyRow, last && { borderBottomColor: colors.separator, borderBottomWidth: StyleSheet.hairlineWidth }]}>
      <ExpoImage
        source={{ uri: biliCover(r.member.avatar, 72, 72) }}
        recyclingKey={r.member.avatar}
        cachePolicy="memory-disk"
        style={[styles.replyAvatar, { backgroundColor: colors.fill2 }]}
        contentFit="cover"
      />
      <View style={styles.replyBody}>
        <View style={styles.replyNameRow}>
          <Text style={[T.subhead, styles.replyName, { color: colors.textSecondary, fontWeight: '600' }]} numberOfLines={1}>{r.member.uname}</Text>
          {level > 0 && (
            <View style={[styles.levelChip, { borderColor: levelColor }]}>
              <Text style={[T.caption2, styles.levelText, { color: levelColor, fontWeight: '700' }]}>{`Lv${level}`}</Text>
            </View>
          )}
          {isUp && (
            <View style={[styles.upChip, { backgroundColor: ACCENT }]}>
              <Text style={[T.caption2, styles.upChipText, { fontWeight: '700' }]}>UP</Text>
            </View>
          )}
        </View>
        {location ? <Text style={[T.caption1, styles.replyLoc, { color: colors.textTertiary }]}>{` • ${location}`}</Text> : null}
        <EmoteText
          text={displayMessage}
          emotes={emoteMap}
          style={[T.subhead, { color: colors.text }]}
          numberOfLines={replyLengthLimit > 0 && !msgExpanded ? replyLengthLimit : undefined}
          prefix={
            isTop || (r.reply_control?.is_note && !displayMessage.startsWith('[笔记]')) ? (
              <Text style={{ color: ACCENT, fontWeight: isTop ? '700' : '600' }}>
                {isTop ? '[置顶] ' : ''}
                {r.reply_control?.is_note && !displayMessage.startsWith('[笔记]') ? '[笔记] ' : ''}
              </Text>
            ) : undefined
          }
        />
        {/* 全文行数测量（隐藏）：仅首帧执行一次，判定是否需"展开" */}
        {replyLengthLimit > 0 && !msgExpanded && !msgMeasured ? (
          <Text
            pointerEvents="none"
            style={[T.subhead, styles.msgMeasure]}
            onTextLayout={(e) => {
              setMsgMeasured(true);
              setMsgTruncated(e.nativeEvent.lines.length > replyLengthLimit);
            }}>
            {fullMsg}
          </Text>
        ) : null}
        {msgTruncated && !msgExpanded ? (
          <Press haptic scaleTo={0.95} onPress={() => setMsgExpanded(true)} style={styles.msgExpand}>
            <Text style={[T.footnote, { color: ACCENT, fontWeight: '600' }]}>展开</Text>
          </Press>
        ) : msgExpanded ? (
          <Press haptic scaleTo={0.95} onPress={() => setMsgExpanded(false)} style={styles.msgExpand}>
            <Text style={[T.footnote, { color: colors.textTertiary }]}>收起</Text>
          </Press>
        ) : null}
        {voteId != null && <VoteCard voteId={voteId} colors={colors} T={T} />}
        {r.content.pictures && r.content.pictures.length > 0 && (
          <View style={styles.replyPics}>
            {r.content.pictures.slice(0, 3).map((p, pi) => (
              <Press key={pi} scaleTo={0.94} onPress={() => onOpenViewer(r.content.pictures!.map((x) => biliPreview(x.img_src)), pi)}>
                <ExpoImage
                  source={{ uri: biliCover(p.img_src, 160, 160) }}
                  recyclingKey={p.img_src}
                  cachePolicy="memory-disk"
                  style={[styles.replyPic, { backgroundColor: colors.fill2 }]}
                  contentFit="cover"
                />
              </Press>
            ))}
          </View>
        )}
        <View style={styles.replyMeta}>
          <Text style={[T.caption1, styles.replyTime, { color: colors.textTertiary }]}>{formatTime(r.ctime)}</Text>
          {r.reply_control?.is_note ? (
            <View style={[styles.noteChip, { backgroundColor: 'rgba(251,114,153,0.1)' }]}>
              <Ionicons name="document-text-outline" size={11} color={ACCENT} />
              <Text style={[T.caption1, { color: ACCENT }]}>笔记</Text>
            </View>
          ) : null}
          {r.reply_control?.up_like ? (
            <Text style={[T.caption1, { color: colors.accent, fontWeight: '600' }]}>UP主觉得很赞</Text>
          ) : null}
          <ActionThumb
            active={r.action === 1}
            size={12}
            colors={colors}
            iconActive="thumbs-up"
            iconIdle="thumbs-up-outline"
            label={formatCount(r.like)}
            onPress={() => onLike(r)}
          />
          <ActionThumb
            active={r.action === 2}
            size={12}
            colors={colors}
            iconActive="thumbs-down"
            iconIdle="thumbs-down-outline"
            onPress={() => onHate(r)}
          />
          <Press haptic scaleTo={0.9} onPress={() => onReply({ rpid: r.rpid, root: r.rpid, parent: r.rpid, name: r.member.uname })}>
            <Ionicons name="chatbox-ellipses-outline" size={13} color={colors.textTertiary} />
          </Press>
          <Press haptic scaleTo={0.9} onPress={() => onManage(r)}>
            <Ionicons name="ellipsis-horizontal" size={14} color={colors.textTertiary} />
          </Press>
          {subExpanded && r.rcount > 0 ? (
            <Press haptic scaleTo={0.95} onPress={() => onToggleSub(r.rpid)}>
              <Text style={[T.caption1, styles.replyReply, { color: ACCENT }]}>{`收起回复 ▲`}</Text>
            </Press>
          ) : null}
        </View>
        {isReplying && (
          <View style={[styles.inlineReplyBox, { backgroundColor: colors.fill2 }]}>
            <Text style={[T.caption2, { color: colors.textTertiary }]} numberOfLines={1}>
              {`回复 @${replyingTo!.name}`}
            </Text>
            <View style={styles.inlineReplyRow}>
              <TextInput
                value={replyText}
                onChangeText={onReplyTextChange}
                placeholder="回复…"
                placeholderTextColor={colors.textTertiary}
                style={[T.footnote, styles.inlineReplyInput, { color: colors.text }]}
                multiline
                maxLength={500}
              />
              <Press haptic scaleTo={0.9} onPress={onPickImage} style={styles.inlineIconBtn}>
                <Ionicons name="image-outline" size={18} color={replyImage ? ACCENT : colors.textTertiary} />
              </Press>
              <Press haptic scaleTo={0.9} onPress={() => onEmoteToggle(!emoteActive)} style={styles.inlineIconBtn}>
                <Ionicons name="happy-outline" size={18} color={emoteActive ? ACCENT : colors.textTertiary} />
              </Press>
              <Press
                haptic
                scaleTo={0.9}
                disabled={!replyText.trim() || sendingReply}
                onPress={() => onSendReply(replyingTo!)}
                style={[styles.inlineIconBtn, { backgroundColor: replyText.trim() && !sendingReply ? ACCENT : colors.fill3 }]}>
                {sendingReply ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Ionicons name="arrow-up" size={16} color={replyText.trim() ? '#FFFFFF' : colors.textTertiary} />}
              </Press>
            </View>
            {replyImage ? (
              <ExpoImage source={{ uri: replyImage }} style={styles.inlineReplyPic} contentFit="cover" />
            ) : null}
          </View>
        )}
        {showBox && (
          <View style={[styles.subReplyBox, { backgroundColor: colors.fill1 }]}>
            {previewed!.map((sr) => {
              const srVote = parseVoteId(sr.content.message);
              const srMsg = srVote != null ? cleanVoteText(sr.content.message) : sr.content.message;
              const srReplying = replyingTo?.rpid === sr.rpid;
              return (
                <View key={sr.rpid} style={styles.subReplyRow}>
                  <EmoteText
                    text={srMsg}
                    emotes={emoteMap}
                    style={[T.body, { color: colors.text }]}
                    prefix={<Text style={{ color: ACCENT, fontWeight: '600' }}>{`${sr.member.uname}：`}</Text>}
                  />
                  {srVote != null && <VoteCard voteId={srVote} colors={colors} T={T} />}
                  {sr.content.pictures && sr.content.pictures.length > 0 && (
                    <View style={styles.subReplyPics}>
                      {sr.content.pictures.slice(0, 3).map((p, pi) => (
                        <Press key={pi} scaleTo={0.94} onPress={() => onOpenViewer(sr.content.pictures!.map((x) => biliPreview(x.img_src)), pi)}>
                          <ExpoImage source={{ uri: biliCover(p.img_src, 120, 120) }} recyclingKey={p.img_src} cachePolicy="memory-disk" style={[styles.subReplyPic, { backgroundColor: colors.fill2 }]} contentFit="cover" />
                        </Press>
                      ))}
                    </View>
                  )}
                  <View style={styles.subReplyOps}>
                    <ActionThumb
                      active={sr.action === 1}
                      size={11}
                      colors={colors}
                      iconActive="thumbs-up"
                      iconIdle="thumbs-up-outline"
                      onPress={() => onLike(sr)}
                    />
                    <ActionThumb
                      active={sr.action === 2}
                      size={11}
                      colors={colors}
                      iconActive="thumbs-down"
                      iconIdle="thumbs-down-outline"
                      onPress={() => onHate(sr)}
                    />
                    <Press haptic scaleTo={0.9} onPress={() => onReply({ rpid: sr.rpid, root: r.rpid, parent: sr.rpid, name: sr.member.uname })}>
                      <Ionicons name="chatbox-ellipses-outline" size={12} color={colors.textTertiary} />
                    </Press>
                    <Press haptic scaleTo={0.9} onPress={() => onManage(sr)}>
                      <Ionicons name="ellipsis-horizontal" size={13} color={colors.textTertiary} />
                    </Press>
                  </View>
                  {srReplying && (
                    <View style={[styles.inlineReplyBox, { backgroundColor: colors.fill2 }]}>
                      <Text style={[T.caption2, { color: colors.textTertiary }]} numberOfLines={1}>{`回复 @${replyingTo!.name}`}</Text>
                      <View style={styles.inlineReplyRow}>
                        <TextInput
                          value={replyText}
                          onChangeText={onReplyTextChange}
                          placeholder="回复…"
                          placeholderTextColor={colors.textTertiary}
                          style={[T.footnote, styles.inlineReplyInput, { color: colors.text }]}
                          multiline
                          maxLength={500}
                        />
                        <Press haptic scaleTo={0.9} onPress={onPickImage} style={styles.inlineIconBtn}>
                          <Ionicons name="image-outline" size={18} color={replyImage ? ACCENT : colors.textTertiary} />
                        </Press>
                        <Press haptic scaleTo={0.9} onPress={() => onEmoteToggle(!emoteActive)} style={styles.inlineIconBtn}>
                          <Ionicons name="happy-outline" size={18} color={emoteActive ? ACCENT : colors.textTertiary} />
                        </Press>
                        <Press
                          haptic
                          scaleTo={0.9}
                          disabled={!replyText.trim() || sendingReply}
                          onPress={() => onSendReply(replyingTo!)}
                          style={[styles.inlineIconBtn, { backgroundColor: replyText.trim() && !sendingReply ? ACCENT : colors.fill3 }]}>
                          {sendingReply ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Ionicons name="arrow-up" size={16} color={replyText.trim() ? '#FFFFFF' : colors.textTertiary} />}
                        </Press>
                      </View>
                    </View>
                  )}
                </View>
              );
            })}
            {showMoreBtn && (
              <Press haptic scaleTo={0.95} onPress={() => onOpenReplyDetail(r.rpid)} style={styles.subReplyMore}>
                <Text style={[T.footnote, { color: ACCENT, fontWeight: '600' }]}>{`查看全部 ${r.rcount} 条回复`}</Text>
              </Press>
            )}
            {showLoadMoreBtn && (
              <Press haptic scaleTo={0.95} onPress={() => onLoadMoreSub(r.rpid)} style={styles.subReplyMore}>
                <Text style={[T.footnote, { color: ACCENT, fontWeight: '600' }]}>{`加载更多 ${r.rcount - subCount} 条回复`}</Text>
              </Press>
            )}
          </View>
        )}
        {!showBox && showMoreBtn && (
          <Press haptic scaleTo={0.95} onPress={() => onOpenReplyDetail(r.rpid)} style={styles.subReplyMore}>
            <Text style={[T.footnote, { color: ACCENT, fontWeight: '600' }]}>{`查看全部 ${r.rcount} 条回复`}</Text>
          </Press>
        )}
      </View>
    </Press>
  );
});

const styles = StyleSheet.create({
  scrollContent: { padding: 16, paddingBottom: 80 },
  headerBlock: { gap: 10, marginBottom: 6 },
  sortRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 2, paddingVertical: 2 },
  sortSegment: { flexDirection: 'row', borderRadius: RADII.sm, padding: 2, ...continuous },
  sortSegBtn: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: RADII.md },
  /* 排序分段滑块（05-C3：滑块位移动画替代背景色瞬切；圆角对齐内嵌分段按钮） */
  sortSlider: {
    position: 'absolute',
    top: 2,
    bottom: 2,
    left: 0,
    borderRadius: RADII.md,
    ...continuous,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.12,
    shadowRadius: 2,
    elevation: 1,
  },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: RADII.md, paddingHorizontal: 10, paddingVertical: 2, ...continuous },
  searchInput: { flex: 1, paddingVertical: 7 },
  composerRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, borderRadius: RADII.md, paddingHorizontal: 10, paddingVertical: 4, ...continuous },
  composerSend: { width: 30, height: 30, borderRadius: RADII.circle, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  composerIconBtn: { width: 30, height: 30, borderRadius: RADII.circle, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  card: {
    borderRadius: RADII.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(120,120,128,0.12)',
    ...continuous,
  },
  replySeparator: { height: StyleSheet.hairlineWidth },
  loadMoreRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 8 },
  replyRow: { flexDirection: 'row', gap: 12, paddingVertical: 14 },
  replyAvatar: { width: 36, height: 36, borderRadius: RADII.circle },
  replyBody: { flex: 1, gap: 3 },
  replyNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  replyName: { flexShrink: 1 },
  levelChip: { borderWidth: 1, borderRadius: RADII.xs, paddingHorizontal: 3, paddingVertical: 0.5 },
  levelText: {},
  upChip: { borderRadius: RADII.xs, paddingHorizontal: 4, paddingVertical: 1 },
  upChipText: { color: '#FFFFFF', lineHeight: 12 },
  replyLoc: { marginTop: -1 },
  replyMsg: {},
  replyMeta: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 2, flexWrap: 'wrap' },
  replyTime: {},
  thumbWrap: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  thumbLayer: { alignItems: 'center', justifyContent: 'center' },
  replyReply: { fontWeight: '500' },
  replyPics: { flexDirection: 'row', gap: 6, marginTop: 8 },
  replyPic: { width: 80, height: 80, borderRadius: RADII.thumb, ...continuous },
  inlineReplyBox: { borderRadius: RADII.md, paddingHorizontal: 10, paddingVertical: 8, marginTop: 8, gap: 6, ...continuous },
  inlineReplyRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  inlineReplyInput: { flex: 1, paddingVertical: 4 },
  inlineIconBtn: { width: 28, height: 28, borderRadius: RADII.circle, alignItems: 'center', justifyContent: 'center' },
  inlineReplyPic: { width: 72, height: 72, borderRadius: RADII.thumb, ...continuous },
  subReplyBox: { borderRadius: RADII.md, paddingHorizontal: 12, paddingVertical: 8, marginTop: 8, gap: 6, ...continuous },
  subReplyRow: { paddingVertical: 3 },
  subReplyPics: { flexDirection: 'row', gap: 6, marginTop: 4 },
  subReplyPic: { width: 60, height: 60, borderRadius: RADII.thumb, ...continuous },
  subReplyOps: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 2 },
  subReplyMore: { paddingTop: 4 },
  voteCard: { borderRadius: RADII.md, padding: 10, marginTop: 6, gap: 6, ...continuous },
  voteHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  voteTitle: { flex: 1, fontWeight: '600' },
  voteOption: { borderRadius: RADII.md, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden', paddingHorizontal: 10, paddingVertical: 8, ...continuous },
  voteOptionFill: { position: 'absolute', top: 0, left: 0, bottom: 0 },
  voteOptionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  voteOptionText: { flex: 1 },
  /* "展开/收起"入口：主评论区与投票卡片之间留 2pt 呼吸间距 */
  msgExpand: { alignSelf: 'flex-start', marginTop: 2 },
  /* 全文行数测量（隐藏、零尺寸），仅用于 onTextLayout 判定是否截断 */
  msgMeasure: { position: 'absolute', opacity: 0, left: 0, right: 0 },
  /* 笔记徽章（收敛内联样式：圆角走 token、底色保留品牌粉 dim） */
  noteChip: { flexDirection: 'row', alignItems: 'center', gap: 2, paddingHorizontal: 5, paddingVertical: 1, borderRadius: RADII.xs },
});
