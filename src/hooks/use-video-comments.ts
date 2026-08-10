/* eslint-disable react-hooks/exhaustive-deps */
import { useState, useRef, useEffect, useCallback } from 'react';
import { ActionSheetIOS } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { showToast } from '@/utils/toast';
import { REPORT_REASONS } from '@/api/video';
import { replyApi } from '@/api/reply';
import { useAuthStore } from '@/stores/auth';
import { useSettingsStore } from '@/stores/settings';
import { filterReplyBanWords } from '@/utils/recommend-filter';
import { feedBack, feedBackSelection } from '@/utils/feedback';
import { createNativeRequestCancelToken, type NativeRequestCancelToken } from '@/utils/request-cancel';
import { getDocumentsDirectoryPath, writeTextFile } from 'pili-native-core';
import type { ReplyItem } from '@/components/CommentSection';


/** 楼中楼预加载并发上限：只预加载可视区，避免热门视频评论页请求风暴 */
const SUB_PRELOAD_MAX_CONCURRENT = 2;
/** 首次加载时只预加载首屏范围内的评论条数 */
const SUB_PRELOAD_INITIAL_VISIBLE = 6;
/** 展开楼中楼时单次最多补齐的页数（接口 ps=20，一页最多 20 条） */
const SUB_FILL_MAX_PAGES = 5;

/** /x/v2/reply/reply 响应的分页信息（data.page） */
interface SubReplyPageInfo {
  num?: number;
  size?: number;
  count?: number;
  is_end?: boolean;
}

/** 把一页楼中楼合并进对应评论（按 rpid 去重；服务端 page.count 更小时修正 rcount，避免出现“加载更多”死按钮） */
function mergeSubReplies(prev: ReplyItem[], rpid: number, arr: ReplyItem[], count?: number): ReplyItem[] {
  return prev.map((c) => {
    if (c.rpid !== rpid) return c;
    const existing = c.replies ?? [];
    const seen = new Set(existing.map((x) => x.rpid));
    const added = arr.filter((x) => !seen.has(x.rpid));
    return {
      ...c,
      replies: [...existing, ...added],
      rcount: count != null ? count : c.rcount,
    };
  });
}

/** 从两种评论响应里取总评论数；取不到时返回 null（继续用 cursor/page 判断） */
function getReplyTotal(data: any): number | null {
  const n = Number(data?.subject_control?.count ?? data?.page?.count);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export interface VideoInfo {
  aid: number; bvid: string; cid: number; title: string; desc: string;
  pic: string; duration: number; pubdate: number;
  owner: { mid: number; name: string; face: string };
  stat: { view: number; danmaku: number; like: number; coin: number; favorite: number; share: number; reply: number };
  pages: { cid: number; part: string; page: number }[];
  req_user?: { like: number; coin: number; favorite: number };
  argue_msg?: string;
  view_points?: { title: string; from: number; to: number }[];
}

export function useVideoComments(info: VideoInfo | null) {
  const [replies, setReplies] = useState<ReplyItem[]>([]);
  const [, setReplyPage] = useState(1);
  const replyCursorRef = useRef(0); // 已登录 /x/v2/reply 的当前页码（下次 pn = cursor + 1）
  const replyPaginationRef = useRef<string>('{"offset":""}'); // 未登录 /main 端点的 cursor.pagination_str
  const [hasMoreReplies, setHasMoreReplies] = useState(true);
  const [expandedReplies, setExpandedReplies] = useState<Set<number>>(new Set());
  const repliesRef = useRef<ReplyItem[]>([]); // replies 镜像（异步回调读取最新值，避免闭包过期）
  const subReplyPageRef = useRef<Map<number, number>>(new Map()); // 每条评论已加载的楼中楼页数
  const subLoadingRef = useRef<Set<number>>(new Set()); // 楼中楼拉取防重入
  const subPreloadQueueRef = useRef<number[]>([]); // 可视区待预加载队列
  const subPreloadAttemptedRef = useRef<Set<number>>(new Set()); // 已尝试过预加载的 rpid，失败不重复打
  const subPreloadActiveRef = useRef(0); // 正在执行的预加载请求数
  const subPreloadDrainingRef = useRef(false); // 队列消费者互斥锁
  const [commentsLoaded, setCommentsLoaded] = useState(false);
  const [commentsError, setCommentsError] = useState<string | null>(null);
  const [commentsLoadingMore, setCommentsLoadingMore] = useState(false);
  const commentsLoadingMoreRef = useRef(false);
  const [commentSort, setCommentSort] = useState(() => useSettingsStore.getState().replySortType);
  const [copyDialog, setCopyDialog] = useState<{ title: string; text: string } | null>(null);
  const [viewerImages, setViewerImages] = useState<string[]>([]);
  const [viewerVisible, setViewerVisible] = useState(false);
  const [viewerIdx, setViewerIdx] = useState(0);
  const [replyDetail, setReplyDetail] = useState<{ rpid: number; rcount: number; replies: ReplyItem[] } | null>(null);
  const mainCancelRef = useRef<NativeRequestCancelToken | null>(null);
  const preloadCancelRef = useRef<NativeRequestCancelToken | null>(null);

  /* 卸载时中止主评论/楼中楼在途请求，避免离开页面后继续下载和回写状态 */
  useEffect(() => () => {
    mainCancelRef.current?.abort();
    preloadCancelRef.current?.abort();
  }, []);

  /* ===== replies 镜像（楼中楼补齐回调读取） ===== */
  useEffect(() => { repliesRef.current = replies; }, [replies]);

  async function loadCommentsFor(aid: number) {
    if (commentsLoaded) return;
    const token = mainCancelRef.current ?? createNativeRequestCancelToken();
    mainCancelRef.current = token;
    const s = useSettingsStore.getState();
    const mode = s.replySortType === 1 ? 2 : 3;
    console.log('[loadCommentsFor] aid:', aid, 'mode:', mode);
    subPreloadQueueRef.current = [];
    subPreloadAttemptedRef.current.clear();
    setCommentsError(null);
    try {
      const replyRes = await replyApi.main({ oid: aid, type: 1, mode, next: 0 }, { cancelToken: token });
      console.log('[loadCommentsFor] replyRes code:', replyRes?.code, 'message:', replyRes?.message);
      if (replyRes?.code !== 0) {
        const errMsg = replyRes?.message || `API 返回错误码: ${replyRes?.code}`;
        console.error('[loadCommentsFor] API error:', errMsg);
        setCommentsError(errMsg);
        setCommentsLoaded(true);
        return;
      }
      if (replyRes?.data?.replies) {
        let list = filterReplyBanWords<ReplyItem>(replyRes.data.replies);
        if (s.reverseFromFirst) list = [...list].reverse();
        console.log('[loadCommentsFor] loaded', list.length, 'comments');
        setReplies(list);
        // 优先用总评论数判断（修复 /main 只返回少量热门评论但总数很多时不再加载的问题）；
        // 取不到时兼容两种响应格式：cursor（/main 端点）和 page（/reply 端点）
        const totalReplies = getReplyTotal(replyRes.data);
        if (totalReplies != null) {
          setHasMoreReplies(list.length < totalReplies);
        } else if (replyRes.data.cursor) {
          setHasMoreReplies(replyRes.data.cursor.is_end !== true);
        } else if (replyRes.data.page) {
          const { num, count } = replyRes.data.page;
          setHasMoreReplies(num * 20 < count);
        } else {
          setHasMoreReplies(false);
        }
        // 游标统一维护：已登录用页码（下次 pn=cursor+1），未登录用 pagination_str（/main 端点）
        replyCursorRef.current = replyRes.data.page?.num ?? 1;
        replyPaginationRef.current = replyRes.data.cursor?.pagination_str || '{"offset":""}';
        setCommentsLoaded(true);
        // 预加载楼中楼（对齐 Flutter：评论下方直接显示前几条回复）；fire-and-forget，内部并发控制、失败静默
        if (s.showVideoReply) {
          preloadSubReplies(aid, list.slice(0, SUB_PRELOAD_INITIAL_VISIBLE));
        }
      } else {
        console.warn('[loadCommentsFor] no replies in response, data:', JSON.stringify(replyRes?.data)?.slice(0, 200));
        setCommentsLoaded(true);
      }
    } catch (e: any) {
      if (token.aborted) return;
      const errMsg = e?.message || String(e);
      console.error('[loadCommentsFor] exception:', errMsg);
      setCommentsError(`评论加载失败: ${errMsg}`);
      setCommentsLoaded(true);
    }
  }

  /* 预加载楼中楼：只处理传入的可视区评论，按小并发队列逐个拉取第 1 页 */
  const drainSubPreloadQueue = useCallback(async (aid: number) => {
    if (subPreloadDrainingRef.current) return;
    subPreloadDrainingRef.current = true;
    const queue = subPreloadQueueRef.current;
    try {
      const token = preloadCancelRef.current ?? createNativeRequestCancelToken();
      preloadCancelRef.current = token;
      while (queue.length > 0 || subPreloadActiveRef.current > 0) {
        while (queue.length > 0 && subPreloadActiveRef.current < SUB_PRELOAD_MAX_CONCURRENT) {
          const rpid = queue.shift();
          if (rpid == null) continue;
          subPreloadActiveRef.current += 1;
          void (async () => {
            try {
              const res = await replyApi.reply({ oid: aid, type: 1, root: rpid, pn: 1 }, { cancelToken: token });
              const arr = res?.data?.replies as ReplyItem[] | undefined;
              const pageInfo = res?.data?.page as SubReplyPageInfo | undefined;
              if (arr?.length) {
                setReplies((prev) => mergeSubReplies(prev, rpid, arr, pageInfo?.count));
                subReplyPageRef.current.set(rpid, 1);
              }
            } catch {}
            finally {
              subPreloadActiveRef.current -= 1;
            }
          })();
        }
        if (queue.length === 0 && subPreloadActiveRef.current === 0) break;
        await new Promise((resolve) => setTimeout(resolve, 80));
      }
    } finally {
      subPreloadDrainingRef.current = false;
    }
  }, []);

  const preloadSubReplies = useCallback((aid: number, list: ReplyItem[]) => {
    if (!aid || !Array.isArray(list) || list.length === 0) return;
    const queue = subPreloadQueueRef.current;
    const attempted = subPreloadAttemptedRef.current;
    const loading = subLoadingRef.current;
    for (const r of list) {
      if (!r?.rpid || (r.rcount || 0) <= 0 || r.replies?.length) continue;
      if (loading.has(r.rpid) || attempted.has(r.rpid) || queue.includes(r.rpid)) continue;
      attempted.add(r.rpid);
      queue.push(r.rpid);
    }
    void drainSubPreloadQueue(aid);
  }, [drainSubPreloadQueue]);

  async function loadComments() {
    if (!info) return;
    await loadCommentsFor(info.aid);
  }

  const loadMoreReplies = useCallback(async () => {
    if (!info || !hasMoreReplies || commentsLoadingMoreRef.current) return;
    mainCancelRef.current?.abort();
    const token = createNativeRequestCancelToken();
    mainCancelRef.current = token;
    commentsLoadingMoreRef.current = true;
    setCommentsLoadingMore(true);
    const s = useSettingsStore.getState();
    const mode = s.replySortType === 1 ? 2 : 3;
    const isLoggedIn = useAuthStore.getState().isLoggedIn;
    console.log('[loadMoreReplies] next cursor/page:', replyCursorRef.current);
    try {
      // 已登录用 pn 参数（旧端点 /x/v2/reply），未登录用 pagination_str 游标（/main 端点）
      const params = isLoggedIn
        ? { oid: info.aid, type: 1, mode, pn: replyCursorRef.current + 1 }
        : { oid: info.aid, type: 1, mode, pagination_str: replyPaginationRef.current };
      const res = await replyApi.main(params, { cancelToken: token });
      if (res?.code !== 0) {
        console.error('[loadMoreReplies] API error:', res?.message);
        setHasMoreReplies(false);
        return;
      }
      if (res?.data?.replies?.length) {
        const list = filterReplyBanWords<ReplyItem>(res.data.replies);
        console.log('[loadMoreReplies] loaded', list.length, 'more comments');
        const seen = new Set(repliesRef.current.map((r) => r.rpid));
        const added = list.filter((r) => !seen.has(r.rpid));
        if (added.length === 0) {
          setHasMoreReplies(false);
          return;
        }
        setReplies([...repliesRef.current, ...added]);
        setReplyPage((p) => p + 1);
        preloadSubReplies(info.aid, added.slice(0, SUB_PRELOAD_INITIAL_VISIBLE)); // 新追加的评论只预加载可视区
        // 兼容两种分页格式；有总评论数时优先按总数判断
        const totalReplies = getReplyTotal(res.data);
        if (totalReplies != null) {
          const after = repliesRef.current.length + added.length;
          setHasMoreReplies(after < totalReplies);
        } else if (res.data.cursor) {
          setHasMoreReplies(res.data.cursor.is_end !== true);
        } else if (res.data.page) {
          const { num, count } = res.data.page;
          setHasMoreReplies(num * 20 < count);
        } else {
          setHasMoreReplies(false);
        }
        replyCursorRef.current = res.data.page?.num ?? replyCursorRef.current + 1;
        if (res.data.cursor?.pagination_str) replyPaginationRef.current = res.data.cursor.pagination_str;
      } else {
        setHasMoreReplies(false);
      }
    } catch (e: any) {
      if (token.aborted) return;
      console.error('[loadMoreReplies] exception:', e?.message || e);
    } finally {
      commentsLoadingMoreRef.current = false;
      setCommentsLoadingMore(false);
    }
  }, [info, hasMoreReplies]);

  /* 展开楼中楼时补齐数据：无数据拉第 1 页；已拉回的条数 < rcount 则逐页补齐（防重入、单次页数上限） */
  const fillSubReplies = useCallback(async (rpid: number) => {
    if (!info) return;
    const loading = subLoadingRef.current;
    if (loading.has(rpid)) return;
    loading.add(rpid);
    try {
      const pages = subReplyPageRef.current;
      let page = pages.get(rpid) ?? 0;
      let cur = repliesRef.current.find((r) => r.rpid === rpid);
      let total = cur?.rcount ?? 0;
      let loaded = cur?.replies?.length ?? 0;
      const maxPage = page + SUB_FILL_MAX_PAGES;
      while (page < maxPage && loaded < total) {
        const token = preloadCancelRef.current ?? createNativeRequestCancelToken();
        preloadCancelRef.current = token;
        const res = await replyApi.reply({ oid: info.aid, type: 1, root: rpid, pn: page + 1 }, { cancelToken: token });
        const arr = res?.data?.replies as ReplyItem[] | undefined;
        const pageInfo = res?.data?.page as SubReplyPageInfo | undefined;
        if (!arr?.length) break;
        page += 1;
        pages.set(rpid, page);
        if (pageInfo?.count != null) total = pageInfo.count;
        loaded += arr.length;
        setReplies((prev) => mergeSubReplies(prev, rpid, arr, pageInfo?.count));
        // 末页判定：is_end 标记 / num*size 覆盖 count / 单页不足 ps（20）
        const done = pageInfo?.is_end
          || (pageInfo != null && (pageInfo.num ?? 0) * (pageInfo.size ?? 0) >= (pageInfo.count ?? 0))
          || arr.length < 20;
        if (done) break;
      }
    } catch {}
    finally {
      loading.delete(rpid);
    }
  }, [info]);

  /* 展开/收起楼中楼：预加载已完成的直接切换展开态；未拉全的交给 fillSubReplies 补齐 */
  const toggleSubReplies = useCallback((rpid: number) => {
    const newSet = new Set(expandedReplies);
    const isExpanded = newSet.has(rpid);
    if (isExpanded) {
      newSet.delete(rpid);
    } else {
      newSet.add(rpid);
      if (info) fillSubReplies(rpid); // fire-and-forget：已预加载则直接展开，否则拉取并补齐
    }
    setExpandedReplies(newSet);
  }, [expandedReplies, info, fillSubReplies]);

  /* 保存评论到本地文件（对齐 Flutter SavePanel.toSavePanel：评论内容 + 楼中楼导出为 txt） */
  const saveCommentToFile = useCallback(async (reply: ReplyItem) => {
    try {
      const lines = [
        `视频：${info?.title || ''}`,
        `评论人：${reply.member.uname}`,
        `时间：${new Date(reply.ctime * 1000).toLocaleString()}`,
        `内容：${reply.content.message}`,
      ];
      if (reply.replies?.length) {
        lines.push('', `回复（共 ${reply.rcount || reply.replies.length} 条）：`);
        reply.replies.forEach((sr) => lines.push(`  ${sr.member.uname}：${sr.content.message}`));
      }
      const documentsPath = await getDocumentsDirectoryPath();
      const filePath = `${documentsPath}/comment_${reply.rpid}_${Date.now()}.txt`;
      const ok = await writeTextFile(filePath, lines.join('\n'));
      if (!ok) throw new Error('write comment file failed');
      showToast('评论已保存');
    } catch (e) {
      console.error('save comment error:', e);
      showToast('保存失败');
    }
  }, [info]);

  /* 评论长按菜单（对齐 Flutter morePanel 顺序：举报 / 复制全部 / 自由复制 / 保存评论） */
  const submitReplyReport = useCallback((reply: ReplyItem, reason: number) => {
    if (!info) return;
    replyApi.report({ oid: info.aid, rpid: reply.rpid, reason }).then((res) => {
      if (res?.code === 0) showToast('举报已提交');
      else showToast(res?.message || '举报失败');
    }).catch((e) => {
      console.error('report reply error:', e);
      showToast('举报失败');
    });
  }, [info]);

  const openReportReasons = useCallback((reply: ReplyItem) => {
    if (!info) return;
    ActionSheetIOS.showActionSheetWithOptions(
      {
        title: '举报评论',
        options: [...REPORT_REASONS.map((r) => r.label), '取消'],
        cancelButtonIndex: REPORT_REASONS.length,
      },
      (index) => {
        if (index >= 0 && index < REPORT_REASONS.length) {
          submitReplyReport(reply, REPORT_REASONS[index].code);
        }
      },
    );
  }, [info, submitReplyReport]);

  const handleReplyLongPress = useCallback((reply: ReplyItem) => {
    feedBackSelection();
    const actions = [
      { label: '举报', onPress: () => openReportReasons(reply) },
      {
        label: '复制全部',
        onPress: async () => {
          try {
            await Clipboard.setStringAsync(reply.content.message);
            showToast('已复制');
          } catch {
            showToast('复制失败');
          }
        },
      },
      { label: '自由复制', onPress: () => setCopyDialog({ title: reply.member.uname, text: reply.content.message }) },
      { label: '保存评论', onPress: () => saveCommentToFile(reply) },
    ];
    ActionSheetIOS.showActionSheetWithOptions(
      {
        title: reply.member.uname,
        message: reply.content.message.slice(0, 100),
        options: [...actions.map((a) => a.label), '取消'],
        cancelButtonIndex: actions.length,
        destructiveButtonIndex: 0,
      },
      (index) => {
        if (index >= 0 && index < actions.length) actions[index].onPress();
      },
    );
  }, [openReportReasons, saveCommentToFile]);

  /* 评论区稳定回调（供 CommentSection memo 隔离使用） */
  const openCommentViewer = useCallback((imgs: string[], idx: number) => {
    setViewerImages(imgs);
    setViewerIdx(idx);
    setViewerVisible(true);
  }, []);
  /* 打开楼中楼全部回复页（对齐 Flutter reply_reply 页：底部弹起 + 分页加载） */
  const openReplyDetail = useCallback((rpid: number) => {
    const c = repliesRef.current.find((r) => r.rpid === rpid);
    if (!c) return;
    setReplyDetail({ rpid, rcount: c.rcount || 0, replies: c.replies || [] });
  }, []);
  const retryComments = useCallback(() => {
    setCommentsLoaded(false);
    setCommentsError(null);
    if (info) loadCommentsFor(info.aid);
  }, [info]);

  /* 切换评论排序（对齐 Flutter header_control：左侧文字随切换键变动；重置列表后按新排序重新拉取） */
  const changeCommentSort = useCallback((sort: number) => {
    if (sort === commentSort) return;
    feedBack();
    setCommentSort(sort);
    useSettingsStore.getState().set({ replySortType: sort });
    setReplies([]);
    repliesRef.current = [];
    setExpandedReplies(new Set());
    setHasMoreReplies(true);
    setCommentsLoaded(false);
    setCommentsError(null);
    replyCursorRef.current = 0;
    replyPaginationRef.current = '{"offset":""}';
    subReplyPageRef.current.clear();
    subPreloadQueueRef.current = [];
    subPreloadAttemptedRef.current.clear();
    if (info) loadCommentsFor(info.aid);
  }, [commentSort, info]);

  return {
    replies,
    expandedReplies,
    hasMoreReplies,
    commentsLoaded,
    commentsError,
    commentsLoadingMore,
    commentSort,
    copyDialog,
    setCopyDialog,
    viewerImages,
    viewerIdx,
    viewerVisible,
    setViewerVisible,
    replyDetail,
    setReplyDetail,
    loadComments,
    loadCommentsFor,
    loadMoreReplies,
    preloadSubReplies,
    toggleSubReplies,
    fillSubReplies,
    changeCommentSort,
    openCommentViewer,
    openReplyDetail,
    handleReplyLongPress,
    retryComments,
  };

}

