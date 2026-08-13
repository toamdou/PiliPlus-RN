import { useCallback, useEffect, useRef, useState } from 'react';
import { videoApi } from '@/api/video';
import { liveApi } from '@/api/live';
import { pgcApi } from '@/api/pgc';
import { useSettingsStore } from '@/stores/settings';
import { filterRecommendVideos, filterZoneVideos } from '@/utils/recommend-filter';
import { av2bv } from '@/utils/id-utils';
import { feedBackSelection } from '@/utils/feedback';
import { parseChineseNumber } from '@/utils/format';
import { biliCover, COVER_W } from '@/utils/image-url';
import { createNativeRequestCancelToken, type NativeRequestCancelToken } from '@/utils/request-cancel';
import { getRecommendCache, setRecommendCache } from 'pili-native-core';
import { type VideoItem } from '@/components/video/VideoCard';
import {
  PARTITIONS,
  type Category,
} from '@/components/home/home-feed-constants';

const RECOMMEND_CACHE_SAVE_INTERVAL = 2000;
const RECOMMEND_CACHE_LIMIT = 50;
/* feed 数组上限：无限滚动后仅保留最近 ~400 条，防止 JS 侧 item 数组无限增长
   （FlashList 的 keyIndex 映射与 diff 成本随之上升，参照直播弹幕 MAX_ITEMS=50 的做法）。
   注意 keyExtractor 保持稳定——只截断，不重排剩余项。 */
const MAX_FEED_ITEMS = 400;

function parsePgcSeasonId(url: string): number {
  const match = (url || '').match(/ss(\d+)/);
  return match ? parseInt(match[1], 10) : 0;
}

export function useRcmdFeed() {
  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  /* 首屏/换一批请求失败标记：供页面在"列表为空"时渲染 ErrorState（06-H1） */
  const [error, setError] = useState(false);
  const [activeCategory, setActiveCategory] = useState<Category>('推荐');
  const [activePartitionIdx, setActivePartitionIdx] = useState(0);
  const hotPageRef = useRef(0);
  const loadingMoreRef = useRef(false);
  const lastCacheSaveRef = useRef(0);
  const cacheSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingCacheSaveRef = useRef<VideoItem[]>([]);
  const freshIdxRef = useRef(0);
  const cancelTokenRef = useRef<NativeRequestCancelToken | null>(null);
  /* 刷新标记位置：新一批内容的条数（= 标记 item 在列表中的索引），null 表示无标记 */
  const [, setLastRefreshAt] = useState<number | null>(null);

  const flushRecommendCache = useCallback(() => {
    if (cacheSaveTimerRef.current) {
      clearTimeout(cacheSaveTimerRef.current);
      cacheSaveTimerRef.current = null;
    }
    const items = pendingCacheSaveRef.current;
    if (items.length === 0) return;
    pendingCacheSaveRef.current = [];
    lastCacheSaveRef.current = Date.now();
    void setRecommendCache(JSON.stringify(items.slice(0, RECOMMEND_CACHE_LIMIT)));
  }, []);

  const scheduleRecommendCacheSave = useCallback((items: VideoItem[]) => {
    pendingCacheSaveRef.current = items.slice(0, RECOMMEND_CACHE_LIMIT);
    const elapsed = Date.now() - lastCacheSaveRef.current;
    if (elapsed >= RECOMMEND_CACHE_SAVE_INTERVAL) {
      flushRecommendCache();
    } else if (!cacheSaveTimerRef.current) {
      cacheSaveTimerRef.current = setTimeout(
        flushRecommendCache,
        RECOMMEND_CACHE_SAVE_INTERVAL - elapsed,
      );
    }
  }, [flushRecommendCache]);

  useEffect(() => () => {
    cancelTokenRef.current?.abort();
    cancelTokenRef.current = null;
    if (cacheSaveTimerRef.current) {
      clearTimeout(cacheSaveTimerRef.current);
      cacheSaveTimerRef.current = null;
    }
    const items = pendingCacheSaveRef.current;
    if (items.length > 0) {
      pendingCacheSaveRef.current = [];
      void setRecommendCache(JSON.stringify(items.slice(0, RECOMMEND_CACHE_LIMIT)));
    }
  }, []);

  const fetchVideos = useCallback(
    async (isRefresh = false) => {
      const token = createNativeRequestCancelToken();
      cancelTokenRef.current?.abort();
      cancelTokenRef.current = token;
      /* 每次发起请求先清掉上一次的失败标记，避免"换分类/重试"期间残留旧错误遮罩 */
      setError(false);
      try {
        if (isRefresh) setRefreshing(true);
        else setLoadingMore(true);

        const s = useSettingsStore.getState();
        let items: VideoItem[] = [];

        if (activeCategory === '推荐') {
          if (isRefresh && s.enableSaveLastData) {
            const rawCache = await getRecommendCache();
            const saved = rawCache ? JSON.parse(rawCache) as VideoItem[] : null;
            if (saved && saved.length > 0) {
              setVideos(saved);
              setLoading(false);
            }
          }

          const freshIdx = freshIdxRef.current;
          const res = s.appRcmd
            ? await videoApi.recommendApp({ fresh_idx: freshIdx }, { cancelToken: token })
            : await videoApi.recommendWeb({ fresh_idx: freshIdx }, { cancelToken: token });
          if (res?.data?.items) {
            items = res.data.items
              .filter((i: any) => i.goto === 'av' || i.card_goto === 'av')
              .map((i: any) => {
                const aid = i.player_args?.aid || parseInt(i.param || '0');
                return {
                  aid,
                  bvid: i.bvid || (aid ? av2bv(aid) : ''),
                  title: i.title || '',
                  pic: i.cover || '',
                  duration: i.player_args?.duration || 0,
                  owner: { name: i.args?.up_name || '', face: '', mid: i.args?.up_id || 0 },
                  stat: {
                    view: parseChineseNumber(i.cover_left_text_1),
                    danmaku: parseChineseNumber(i.cover_left_text_2),
                  },
                  rcmd_reason: i.rcmd_reason || undefined,
                  dislike_reasons: ((i.three_point_v2 || []).find((e: any) => e.type === 'dislike')?.reasons || []).map((r: any) => ({ id: r.id, name: r.name })),
                };
              });
          } else if (res?.data?.item) {
            items = res.data.item
              .filter((i: any) => i.goto === 'av')
              .map((i: any) => {
                const aid = i.id || 0;
                return {
                  aid,
                  bvid: i.bvid || (aid ? av2bv(aid) : ''),
                  title: i.title || '',
                  pic: i.pic || '',
                  duration: i.duration || 0,
                  owner: { name: i.owner?.name || '', face: i.owner?.face || '', mid: i.owner?.mid || 0 },
                  stat: { view: i.stat?.view || 0, danmaku: i.stat?.danmaku || 0 },
                  rcmd_reason: i.rcmd_reason?.content || undefined,
                };
              });
          }
          items = filterRecommendVideos(items);
          items = items.map((i) => ({ ...i, pic: biliCover(i.pic, COVER_W[s.feedLayout]) }));

          if (isRefresh) {
            if (s.enableSaveLastData) {
              const history = videos.filter((v) => !v.__marker);
              if (history.length > 0) {
                setLastRefreshAt(s.savedRcmdTip ? items.length : null);
                setVideos(
                  [
                    ...items,
                    ...(s.savedRcmdTip ? [{ __marker: true } as VideoItem] : []),
                    ...history,
                  ].slice(0, MAX_FEED_ITEMS),
                );
              } else {
                setLastRefreshAt(null);
                setVideos(items);
              }
            } else {
              setLastRefreshAt(null);
              setVideos(items);
            }
          } else {
            setVideos((prev) => [...prev, ...items].slice(-MAX_FEED_ITEMS));
          }
          freshIdxRef.current++;
          if (s.enableSaveLastData && items.length > 0) {
            scheduleRecommendCacheSave(items);
          }
        } else {
          if (activeCategory === '热门') {
            const nextPage = isRefresh ? 1 : hotPageRef.current + 1;
            const res = await videoApi.hot({ pn: nextPage, ps: 20 }, { cancelToken: token });
            if (res?.data?.list) {
              items = res.data.list.map((i: any) => {
                const aid = i.aid || 0;
                return {
                  aid,
                  bvid: i.bvid || (aid ? av2bv(aid) : ''),
                  title: i.title || '',
                  pic: i.pic || '',
                  duration: i.duration || 0,
                  owner: { name: i.owner?.name || '', face: i.owner?.face || '', mid: i.owner?.mid || 0 },
                  stat: { view: i.stat?.view || 0, danmaku: i.stat?.danmaku || 0 },
                  goto: 'av' as const,
                };
              });
            }
            hotPageRef.current = nextPage;
          } else {
            if (!isRefresh) return;

            if (activeCategory === '直播') {
              const res = await liveApi.feedIndex({ page: 1 }, { cancelToken: token });
              const list = res?.data?.data?.card_list || [];
              if (Array.isArray(list) && list.length > 0) {
                items = list.map((i: any) => ({
                  aid: 0,
                  bvid: '',
                  title: i.title || i.uname || '',
                  pic: i.system_cover || i.cover || i.face || '',
                  duration: 0,
                  owner: { name: i.uname || '', face: i.face || '', mid: i.uid || 0 },
                  stat: { view: parseChineseNumber(i.watched_show?.text_large), danmaku: 0 },
                  goto: 'live' as const,
                  live: { roomid: i.roomid || i.id || 0, area: i.area_name || '' },
                }));
              }
            } else if (activeCategory === '分区') {
              const chip = PARTITIONS[activePartitionIdx];
              let raw: any[] = [];
              if (chip.rid != null) {
                const res = await videoApi.ranking({ rid: chip.rid }, { cancelToken: token });
                raw = res?.data?.list || [];
              } else if (chip.seasonType === 1) {
                const res = await videoApi.pgcRank({ season_type: chip.seasonType }, { cancelToken: token });
                raw = res?.result?.list || [];
              } else {
                const res = await videoApi.pgcSeasonRank({ season_type: chip.seasonType ?? 0 }, { cancelToken: token });
                raw = res?.data?.list || [];
              }
              items = raw.map((i: any, index: number) => {
                if (chip.rid != null) {
                  const aid = i.aid || 0;
                  const item: VideoItem = {
                    aid,
                    bvid: i.bvid || (aid ? av2bv(aid) : ''),
                    title: i.title || '',
                    pic: i.pic || '',
                    duration: i.duration || 0,
                    owner: { name: i.owner?.name || '', face: i.owner?.face || '', mid: i.owner?.mid || 0 },
                    stat: { view: i.stat?.view || 0, danmaku: i.stat?.danmaku || 0 },
                    goto: 'av' as const,
                  };
                  return { ...item, rank: index + 1 } as VideoItem & { rank: number };
                }
                const seasonId = parsePgcSeasonId(i.url || i.goto_url || '');
                const pgcItem: VideoItem = {
                  aid: 0,
                  bvid: '',
                  title: i.title || '',
                  pic: i.cover || '',
                  duration: 0,
                  owner: { name: i.new_ep?.index_show || '', face: '', mid: 0 },
                  stat: { view: i.stat?.view || 0, danmaku: 0 },
                  goto: 'pgc' as const,
                  pgc: { season_id: seasonId },
                };
                return { ...pgcItem, rank: index + 1 } as VideoItem & { rank: number };
              });
            } else if (activeCategory === '番剧' || activeCategory === '影视') {
              const res = await pgcApi.indexResult({
                st: 1,
                order: 3,
                season_version: -1,
                spoken_language_type: -1,
                area: -1,
                is_finish: -1,
                copyright: -1,
                season_status: -1,
                season_month: -1,
                year: -1,
                style_id: -1,
                sort: 0,
                season_type: 1,
                type: 1,
                index_type: activeCategory === '影视' ? 102 : undefined,
                page: 1,
              }, { cancelToken: token });
              const list = res?.data?.data?.list || [];
              if (Array.isArray(list) && list.length > 0) {
                items = list.map((i: any) => ({
                  aid: 0,
                  bvid: '',
                  title: i.title || '',
                  pic: i.cover || '',
                  duration: 0,
                  owner: { name: i.index_show || i.badge || '', face: '', mid: 0 },
                  stat: { view: 0, danmaku: 0 },
                  goto: 'pgc' as const,
                  pgc: { season_id: i.season_id || 0 },
                }));
              }
            }
          }

          if (activeCategory === '热门' || activeCategory === '分区') {
            items = filterZoneVideos(items);
          }
          items = items.map((i) => ({ ...i, pic: biliCover(i.pic, COVER_W[s.feedLayout]) }));
          if (activeCategory === '热门' && !isRefresh) {
            setVideos((prev) => [...prev, ...items].slice(-MAX_FEED_ITEMS));
          } else {
            setVideos(items);
          }
        }
      } catch (e) {
        if (!token.aborted) {
          setError(true);
          console.error('fetchVideos error:', e);
        }
      } finally {
        if (cancelTokenRef.current === token) cancelTokenRef.current = null;
        if (!token.aborted) {
          setLoading(false);
          setRefreshing(false);
          setLoadingMore(false);
        }
      }
    },
    [activeCategory, activePartitionIdx],
  );

  useEffect(() => {
    const t = setTimeout(() => {
      setVideos([]);
      setLastRefreshAt(null);
      freshIdxRef.current = 0;
      fetchVideos(true);
    }, 0);
    return () => clearTimeout(t);
  }, [activeCategory, fetchVideos]);

  const selectCategory = useCallback((cat: Category) => {
    if (cat === activeCategory) return;
    feedBackSelection();
    hotPageRef.current = 0;
    setActiveCategory(cat);
  }, [activeCategory]);

  const handleDisliked = useCallback((aid: number) => {
    setVideos((prev) => prev.filter((v) => v.aid !== aid));
  }, []);

  const handleEndReached = useCallback(() => {
    if (activeCategory !== '推荐' && activeCategory !== '热门') return;
    if (!loading && !refreshing && !loadingMoreRef.current) {
      loadingMoreRef.current = true;
      fetchVideos(false).finally(() => {
        loadingMoreRef.current = false;
      });
    }
  }, [loading, refreshing, fetchVideos, activeCategory]);

  return {
    videos,
    loading,
    refreshing,
    loadingMore,
    error,
    activeCategory,
    activePartitionIdx,
    selectCategory,
    setActivePartitionIdx,
    fetchVideos,
    handleEndReached,
    handleDisliked,
  };
}
