/**
 * 专栏页（批次5 专栏阅读器 P3/L）：WebView 壳 → 原生阅读器。
 *
 * 数据链路（03-§3.4#4 补齐）：
 *  - /x/article/view（WBI）→ title / author / content / opus 段落 / images / publish_time；
 *  - /x/article/viewinfo（WBI）→ stats{like,favorite,reply} + favorite 收藏态。
 * 动作：点赞走动态点赞（dyn_id_str，复用 dynamicsApi.thumb）；收藏走 /x/article/favorites/add|del；
 * 评论跳 /main_reply（type=12 专栏评论）；保存分享保留 save_panel 既有能力。
 *
 * 兼容：id 形如完整 URL（https://…）时回退原 WebView 打开方式。
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Host, ProgressView } from '@expo/ui/swift-ui';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { articleApi } from '@/api/article';
import { dynamicsApi } from '@/api/dynamics';
import { videoApi } from '@/api/video';
import { useThemeColors } from '@/components/SwiftUIHost';
import { ArticleReader } from '@/components/article/ArticleReader';
import { ArticleActionBar, type ArticleStats } from '@/components/article/ArticleActionBar';
import ErrorState from '@/components/ErrorState';
import { showToast } from '@/utils/toast';
import { feedBackSuccess } from '@/utils/feedback';
import { useAuthStore } from '@/stores/auth';

interface ArticleViewData {
  title?: string;
  content?: string;
  dyn_id_str?: string;
  publish_time?: number;
  type?: number;
  origin_image_urls?: string[];
  author?: { mid?: number; name?: string; face?: string };
  opus?: { content?: any[] };
  ops?: any[];
}

export default function ArticleScreen() {
  const params = useLocalSearchParams<{ id: string; title?: string }>();
  const router = useRouter();
  const colors = useThemeColors();
  const rawId = String(params.id || '');
  const isLoggedIn = useAuthStore((s) => s.isLoggedIn);

  /* 完整 URL（外部跳转历史兼容）时回退 WebView 打开 */
  const isUrl = /^https?:/.test(rawId);
  const cvid = isUrl ? '' : String(parseInt(rawId, 10) || '');

  const [article, setArticle] = useState<ArticleViewData | null>(null);
  const [stats, setStats] = useState<ArticleStats>({ like: 0, favorite: 0, reply: 0 });
  const [loading, setLoading] = useState(!isUrl && !cvid ? false : true);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    if (!cvid) return;
    setLoaded(false);
    setError(null);
    setLoading(true);
    try {
      const [viewRes, infoRes] = await Promise.all([
        articleApi.view({ id: cvid }),
        articleApi.viewInfo({ id: cvid }).catch(() => null),
      ]);
      if (viewRes?.code !== 0) {
        setError(viewRes?.message || '文章加载失败');
        return;
      }
      const d: ArticleViewData = viewRes.data || {};
      setArticle(d);
      const st = infoRes?.data?.stats;
      setStats({
        like: st?.like ?? 0,
        favorite: st?.favorite ?? 0,
        reply: st?.reply ?? 0,
      });
      setLoaded(true);
      /* 历史上报（对齐 Flutter：aid=cvid, type=5 专栏；登录且非匿名才上报） */
      const auth = useAuthStore.getState();
      if (auth.isLoggedIn && !auth.anonymousMode) {
        try {
          await videoApi.historyReport({ aid: Number(cvid), cid: Number(cvid), progress: 0 });
        } catch {}
      }
    } catch {
      setError('加载失败，请检查网络');
    } finally {
      setLoading(false);
    }
  }, [cvid]);

  useEffect(() => {
    if (isUrl) return;
    const t = setTimeout(load, 0);
    return () => clearTimeout(t);
  }, [load, isUrl]);

  /* 点赞：走动态点赞（dyn_id_str 缺失时提示——接口依赖动态体系）。乐观更新 + 失败回滚。 */
  const [liked, setLiked] = useState(false);
  const toggleLike = useCallback(async () => {
    if (!isLoggedIn) {
      showToast('请先登录');
      return;
    }
    const dynId = article?.dyn_id_str;
    if (!dynId) {
      showToast('暂无点赞入口（缺少 dyn_id）');
      return;
    }
    const next = !liked;
    setLiked(next);
    setStats((prev) => ({ ...prev, like: Math.max(0, prev.like + (next ? 1 : -1)) }));
    try {
      const res = await dynamicsApi.thumb({ dyn_id_str: dynId, up: next ? 1 : 2 });
      if (res?.code !== 0) throw new Error(res?.message || '操作失败');
      if (next) feedBackSuccess();
    } catch {
      setLiked(!next);
      setStats((prev) => ({ ...prev, like: Math.max(0, prev.like + (next ? -1 : 1)) }));
      showToast('操作失败，请重试');
    }
  }, [article?.dyn_id_str, isLoggedIn, liked]);

  /* 收藏：/x/article/favorites/add|del，乐观更新 + 回滚 */
  const [faved, setFaved] = useState(false);
  const toggleFav = useCallback(async () => {
    if (!isLoggedIn) {
      showToast('请先登录');
      return;
    }
    const next = !faved;
    setFaved(next);
    setStats((prev) => ({ ...prev, favorite: Math.max(0, prev.favorite + (next ? 1 : -1)) }));
    try {
      const res = next
        ? await articleApi.addFav({ id: cvid })
        : await articleApi.delFav({ id: cvid });
      if (res?.code !== 0) throw new Error(res?.message || '操作失败');
      showToast(next ? '收藏成功' : '已取消收藏');
    } catch {
      setFaved(!next);
      setStats((prev) => ({ ...prev, favorite: Math.max(0, prev.favorite + (next ? -1 : 1)) }));
      showToast('操作失败，请重试');
    }
  }, [cvid, faved, isLoggedIn]);

  /* 评论：跳 main_reply（type=12 专栏评论，oid=cvid） */
  const openComment = useCallback(() => {
    if (!cvid) return;
    router.push({ pathname: '/main_reply/[oid]', params: { oid: cvid, type: '12', title: article?.title || '评论' } } as any);
  }, [article?.title, cvid, router]);

  /* 保存分享：保留既有 save_panel 能力 */
  const openSavePanel = useCallback(() => {
    const url = `https://www.bilibili.com/read/cv${cvid}`;
    router.push({ pathname: '/save_panel', params: { title: article?.title || params.title || '专栏文章', url } } as any);
  }, [article?.title, cvid, params.title, router]);

  const title = article?.title || params.title || '专栏文章';
  const paragraphs = useMemo(() => article?.opus?.content, [article?.opus?.content]);

  /* 完整 URL 参数：回退 WebView 壳（历史兼容） */
  if (isUrl) {
    return (
      <View style={[styles.root, { backgroundColor: colors.bg }]}>
        <Stack.Title large>{params.title || '专栏文章'}</Stack.Title>
        <Stack.Header blurEffect="systemMaterial" style={{ shadowColor: 'transparent' }} />
        <ErrorState
          title="外部链接专栏"
          message="该链接来自外部跳转，请在浏览器中打开阅读"
          retryLabel="前往浏览器"
          onRetry={() => router.push({ pathname: '/webview', params: { url: rawId, title } } as any)}
        />
      </View>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]}>
      <Stack.Screen options={{ headerShown: true }} />
      <Stack.Title large>{loading ? '专栏文章' : title}</Stack.Title>
      <Stack.Header blurEffect="systemMaterial" style={{ shadowColor: 'transparent' }} />

      {loading && !loaded ? (
        <View style={styles.loadingWrap}>
          <Host matchContents><ProgressView /></Host>
        </View>
      ) : error ? (
        <ErrorState title="加载失败" message={error} onRetry={load} />
      ) : article ? (
        <View style={styles.body}>
          <ArticleReader
            title={title}
            author={article.author}
            publishTime={article.publish_time}
            content={article.content}
            paragraphs={paragraphs}
            images={article.origin_image_urls}
            onOpenLink={(href) => {
              if (href) router.push({ pathname: '/webview', params: { url: href, title: '链接' } } as any);
            }}
          />
          <View style={styles.actionWrap}>
            <ArticleActionBar
              stats={stats}
              liked={liked}
              faved={faved}
              onLike={toggleLike}
              onFav={toggleFav}
              onComment={openComment}
              onShare={openSavePanel}
            />
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  body: { flex: 1 },
  actionWrap: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingBottom: 8 },
});
