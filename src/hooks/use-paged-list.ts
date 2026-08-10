/**
 * usePagedList —— 统一页码分页 hook。
 *
 * 收敛各页面手写的 isRefresh / loadingMoreRef / cursorRef 分页样板：
 *  - pageRef 内部管理当前页码（refresh 回 initialPage、loadMore 递增）；
 *  - busyRef 防重入：首次加载 / 下拉刷新 / 加载更多互相排斥；
 *  - hasMore=false 后 loadMore 直接终止；
 *  - enabled=false（未登录等场景）不发任何请求；
 *  - 首次加载失败置 error 并停止 loading，其余失败交由 onError。
 *
 * 用法：
 *   const { items, loading, refreshing, loadingMore, hasMore, error, refresh, loadMore, setItems }
 *     = usePagedList<T>({ fetchPage: (page) => api.list({ page }), enabled: isLoggedIn });
 */
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react';
import {
  createNativeRequestCancelToken,
  type NativeRequestCancelToken,
} from '@/utils/request-cancel';

export interface PagedPage<T> {
  items: T[];
  hasMore: boolean;
}

export interface UsePagedListOptions<T> {
  /** 拉取第 page 页数据（page 从 initialPage 起） */
  fetchPage: (page: number, cancelToken?: NativeRequestCancelToken) => Promise<PagedPage<T>>;
  /** 起始页码，默认 1 */
  initialPage?: number;
  /** false 时不发请求（用于未登录等场景），默认 true */
  enabled?: boolean;
  /** 请求失败回调，默认 console.error */
  onError?: (e: unknown) => void;
}

export interface UsePagedListResult<T> {
  items: T[];
  loading: boolean; // 首次加载中
  refreshing: boolean; // 下拉刷新中
  loadingMore: boolean; // 加载更多中
  hasMore: boolean;
  error: string | null;
  refresh: () => void; // 回 initialPage（下拉刷新）
  loadMore: () => void; // 下一页（onEndReached）
  setItems: Dispatch<SetStateAction<T[]>>; // 乐观更新等
}

const defaultOnError = (e: unknown) => {
  console.error('usePagedList error:', e);
};

export function usePagedList<T>(options: UsePagedListOptions<T>): UsePagedListResult<T> {
  /* initialPage/enabled 在组件层使用；fetchPage/onError 经 optsRef 由 run 读取 */
  const { initialPage = 1, enabled = true } = options;

  const [items, setItems] = useState<T[]>([]);
  const [loadingState, setLoadingState] = useState(enabled);
  const [refreshingState, setRefreshingState] = useState(false);
  const [loadingMoreState, setLoadingMoreState] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /* options 经 ref 透传（effect 内同步，非渲染期写）：
     消费方内联箭头函数不会造成额外重渲染/重复请求 */
  const optsRef = useRef(options);
  useEffect(() => {
    optsRef.current = options;
  });

  const pageRef = useRef(initialPage);
  const hasMoreRef = useRef(true);
  const busyRef = useRef(false);
  const activeTokenRef = useRef<NativeRequestCancelToken | null>(null);

  const run = useCallback(async (mode: 'first' | 'refresh' | 'more') => {
    const { fetchPage, initialPage = 1, enabled = true, onError = defaultOnError } = optsRef.current;
    if (!enabled || busyRef.current) return;
    if (mode === 'more' && !hasMoreRef.current) return;

    const page = mode === 'more' ? pageRef.current + 1 : initialPage;
    pageRef.current = page;
    busyRef.current = true;
    activeTokenRef.current?.abort();
    const cancelToken = createNativeRequestCancelToken();
    activeTokenRef.current = cancelToken;
    setError(null);
    if (mode === 'first') setLoadingState(true);
    else if (mode === 'refresh') setRefreshingState(true);
    else setLoadingMoreState(true);

    try {
      const res = await fetchPage(page, cancelToken);
      hasMoreRef.current = res.hasMore;
      setHasMore(res.hasMore);
      if (mode === 'more') setItems((prev) => [...prev, ...res.items]);
      else setItems(res.items);
    } catch (e) {
      if (cancelToken.aborted) return;
      onError(e);
      if (mode === 'more') pageRef.current -= 1; // 失败回滚页码，下次重试同页
      else if (mode === 'first') setError('加载失败，请重试');
    } finally {
      if (activeTokenRef.current === cancelToken) activeTokenRef.current = null;
      busyRef.current = false;
      setLoadingState(false);
      setRefreshingState(false);
      setLoadingMoreState(false);
    }
  }, []);

  /* 首次加载：enabled 变 true 时触发。延迟一拍再执行，避免 effect 内同步 setState
     （react-hooks/set-state-in-effect）；清理时取消未执行的调度 */
  useEffect(() => {
    if (!enabled) {
      activeTokenRef.current?.abort();
      return;
    }
    const timer = setTimeout(() => run('first'), 0);
    return () => clearTimeout(timer);
  }, [enabled, run]);

  /* 卸载时中止在途原生请求，避免离开页面后继续下载/回写状态 */
  useEffect(() => () => {
    activeTokenRef.current?.abort();
  }, []);

  /* enabled=false（未登录等）时各加载态恒为 false，不显示骨架/加载指示 */
  const loading = enabled ? loadingState : false;
  const refreshing = enabled ? refreshingState : false;
  const loadingMore = enabled ? loadingMoreState : false;

  const refresh = useCallback(() => {
    run('refresh');
  }, [run]);

  const loadMore = useCallback(() => {
    run('more');
  }, [run]);

  return { items, loading, refreshing, loadingMore, hasMore, error, refresh, loadMore, setItems };
}
