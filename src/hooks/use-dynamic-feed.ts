import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { dynamicsApi } from '@/api/dynamics';
import { useSettingsStore } from '@/stores/settings';
import { filterDynGoods } from '@/utils/recommend-filter';
import { useDynamicPoll } from '@/utils/dynamic-polling';
import { showToast } from '@/utils/toast';
import type { DynamicItem, PortalData } from '@/components/dynamics/feed-types';
import { createNativeRequestCancelToken, type NativeRequestCancelToken } from '@/utils/request-cancel';

/* feed 数组上限：无限滚动加载更早动态时仅保留最近 ~400 条，防止 JS 侧 item 数组
   无限增长（FlashList 的 keyIndex 映射与 diff 成本随之上升，参照直播弹幕 MAX_ITEMS=50）。
   只截断尾部、不重排，keyExtractor（id_str）保持稳定。 */
const MAX_FEED_ITEMS = 400;

/* 动态类型过滤（对齐 Flutter feed/all?type=video 等，与设置页 defaultDynamicType 同一枚举）：
   0=全部(不过滤) 1=投稿(archive) 2=番剧/影视(pgc/ugc_season) 3=专栏(article)。
   type_list 268435455 为全部类型位掩码。batch-5 P1：由动态页顶部 4 Tab 动态切换。 */
export const DYNAMIC_TYPE_TABS: { label: string; value: number }[] = [
  { label: '全部', value: 0 },
  { label: '投稿', value: 1 },
  { label: '番剧', value: 2 },
  { label: '专栏', value: 3 },
];

const typeMap: Record<number, { type?: string; type_list?: string }> = {
  0: { type_list: '268435455' },
  1: { type: 'video' },
  2: { type: 'pgc' },
  3: { type: 'article' },
};

export function useDynamicFeed(isLoggedIn: boolean, dynTypeIdx = 0) {
  const [items, setItems] = useState<DynamicItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [portal, setPortal] = useState<PortalData | null>(null);
  /* 首屏/刷新失败标记：供页面在"列表为空"时渲染 ErrorState（06-D1） */
  const [error, setError] = useState(false);
  const offsetRef = useRef('');
  const loadingMoreRef = useRef(false);
  const cancelTokenRef = useRef<NativeRequestCancelToken | null>(null);

  /* ===== G3a：UP 面板（正在直播 + 关注 UP）——每次聚焦刷新，登录后渲染 =====
     聚焦刷新静默失败（仅 console.error、保留旧面板数据），避免弱网下切回本 tab 反复 toast；
     失败提示只走手动下拉刷新入口（refreshPortal） */
  useFocusEffect(
    useCallback(() => {
      if (!isLoggedIn) return;
      useDynamicPoll.getState().markRead();
      let alive = true;
      const cancelToken = createNativeRequestCancelToken();
      dynamicsApi
        .portal({ cancelToken })
        .then((res: any) => {
          if (alive && res?.data) setPortal(res.data);
        })
        .catch((e: unknown) => {
          if (cancelToken.aborted) return;
          console.error('fetch portal error:', e);
        });
      return () => {
        alive = false;
        cancelToken.abort();
      };
    }, [isLoggedIn]),
  );

  /* 手动刷新入口：失败才提示用户（聚焦刷新不 toast，见上方 useFocusEffect） */
  const refreshPortal = useCallback(async () => {
    cancelTokenRef.current?.abort();
    const cancelToken = createNativeRequestCancelToken();
    cancelTokenRef.current = cancelToken;
    try {
      const res = await dynamicsApi.portal({ cancelToken });
      if (res?.data) setPortal(res.data);
    } catch (e) {
      if (cancelToken.aborted) return;
      console.error('refresh portal error:', e);
      showToast('面板数据获取失败');
    } finally {
      if (cancelTokenRef.current === cancelToken) cancelTokenRef.current = null;
    }
  }, []);

  const fetchDynamics = useCallback(async (isRefresh = false) => {
    const cancelToken = createNativeRequestCancelToken();
    cancelTokenRef.current?.abort();
    cancelTokenRef.current = cancelToken;
    try {
      if (isRefresh) setRefreshing(true);
      /* 每次发起请求先清掉上一次的失败标记，避免重试期间残留旧错误遮罩 */
      setError(false);
      /* 动态类型过滤：dynTypeIdx 由页面顶部 4 Tab 驱动（0=全部 1=投稿 2=番剧 3=专栏）；
         与设置页 defaultDynamicType 同枚举，切 Tab 即重新拉取对应接口参数 */
      const params: Record<string, any> = { ...(typeMap[dynTypeIdx] || typeMap[0]) };
      const s = useSettingsStore.getState();
      if (s.dynamicsShowAllFollowedUp) {
        params.features = 'itemOpusStyle,listOnlyfans,relationAll';
      }
      if (!isRefresh && offsetRef.current) params.offset = offsetRef.current;
      const res = await dynamicsApi.feedAll(params, { cancelToken });
      if (res?.data?.items) {
        const newItems = filterDynGoods<DynamicItem>(res.data.items);
        if (isRefresh) setItems(newItems);
        else setItems((prev) => [...prev, ...newItems].slice(-MAX_FEED_ITEMS));
        offsetRef.current = res.data.offset || '';
        useDynamicPoll.getState().markRead();
      }
    } catch (e) {
      if (cancelToken.aborted) return;
      setError(true);
      console.error('fetchDynamics error:', e);
    } finally {
      if (cancelTokenRef.current === cancelToken) cancelTokenRef.current = null;
      if (!cancelToken.aborted) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [dynTypeIdx]);

  useEffect(() => () => {
    cancelTokenRef.current?.abort();
  }, []);

  useEffect(() => {
    /* 延迟一拍再拉取/收尾：避免 effect 内同步 setState（react-hooks/set-state-in-effect） */
    const timer = setTimeout(() => {
      if (isLoggedIn) fetchDynamics(true);
      else setLoading(false);
    }, 0);
    return () => clearTimeout(timer);
  }, [isLoggedIn, fetchDynamics]);

  const loadMore = useCallback(() => {
    if (loading || refreshing || loadingMoreRef.current || !isLoggedIn) return;
    loadingMoreRef.current = true;
    void fetchDynamics(false).finally(() => {
      loadingMoreRef.current = false;
    });
  }, [loading, refreshing, isLoggedIn, fetchDynamics]);

  return {
    items,
    loading,
    refreshing,
    error,
    portal,
    refreshPortal,
    fetchDynamics,
    loadMore,
  };
}
