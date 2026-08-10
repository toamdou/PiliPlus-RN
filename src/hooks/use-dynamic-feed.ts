import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { dynamicsApi } from '@/api/dynamics';
import { useSettingsStore } from '@/stores/settings';
import { filterDynGoods } from '@/utils/recommend-filter';
import { useDynamicPoll } from '@/utils/dynamic-polling';
import { showToast } from '@/utils/toast';
import type { DynamicItem, PortalData } from '@/components/dynamics/feed-types';
import { createNativeRequestCancelToken, type NativeRequestCancelToken } from '@/utils/request-cancel';

export function useDynamicFeed(isLoggedIn: boolean) {
  const [items, setItems] = useState<DynamicItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [portal, setPortal] = useState<PortalData | null>(null);
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
      const s = useSettingsStore.getState();
      /* 动态类型过滤（对齐 Flutter feed/all?type=video 等）：0=全部 1=投稿 2=番剧 3=专栏 */
      const typeMap: Record<number, { type?: string; type_list?: string }> = {
        0: { type_list: '268435455' },
        1: { type: 'video' },
        2: { type: 'pgc' },
        3: { type: 'article' },
      };
      const params: Record<string, any> = { ...(typeMap[s.defaultDynamicType] || { type_list: '268435455' }) };
      if (s.dynamicsShowAllFollowedUp) {
        params.features = 'itemOpusStyle,listOnlyfans,relationAll';
      }
      if (!isRefresh && offsetRef.current) params.offset = offsetRef.current;
      const res = await dynamicsApi.feedAll(params, { cancelToken });
      if (res?.data?.items) {
        const newItems = filterDynGoods<DynamicItem>(res.data.items);
        if (isRefresh) setItems(newItems);
        else setItems((prev) => [...prev, ...newItems]);
        offsetRef.current = res.data.offset || '';
        useDynamicPoll.getState().markRead();
      }
    } catch (e) {
      if (cancelToken.aborted) return;
      console.error('fetchDynamics error:', e);
    } finally {
      if (cancelTokenRef.current === cancelToken) cancelTokenRef.current = null;
      if (!cancelToken.aborted) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

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
    portal,
    refreshPortal,
    fetchDynamics,
    loadMore,
  };
}
