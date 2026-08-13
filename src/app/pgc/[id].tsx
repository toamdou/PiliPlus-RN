import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  AppState, View, Text, StyleSheet, ActionSheetIOS, Share,
} from 'react-native';
import { Host, ProgressView, Picker, Text as SwiftText } from '@expo/ui/swift-ui';
import { pickerStyle, tag } from '@expo/ui/swift-ui/modifiers';
import { FlashListRef } from '@shopify/flash-list';
import { useLocalSearchParams, Stack, useRouter, useScrollToTop, useIsFocused } from 'expo-router';
import type { Href } from 'expo-router';
import { PiliPlayer } from 'pili-player';
import { useThemeColors } from '@/components/SwiftUIHost';
import { useType } from '@/components/type-scale';
import { PgcPlayer } from '@/components/pgc/PgcPlayer';
import { PgcEpisodeGrid } from '@/components/pgc/PgcEpisodeGrid';
import { PgcInfoHeader } from '@/components/pgc/PgcInfoHeader';
import PgcReviewSection from '@/components/pgc/PgcReviewSection';
import ErrorState from '@/components/ErrorState';
import type { Episode, SeasonDetail } from '@/components/pgc/pgc-types';
import { pgcApi } from '@/api/pgc';
import { videoApi } from '@/api/video';
import { useAuthStore } from '@/stores/auth';
import { useSettingsStore } from '@/stores/settings';
import { feedBack } from '@/utils/feedback';
import { showToast } from '@/utils/toast';
import { getBestPlayUrl, getPlayerConfig, PLAYER_HEADERS } from '@/utils/player-utils';

function PgcDetailBody({ player }: { player: any }) {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const isFocused = useIsFocused();
  const colors = useThemeColors();
  const T = useType();
  const { isLoggedIn } = useAuthStore();
  const showPgcTimeline = useSettingsStore((s) => s.showPgcTimeline);
  const showBangumiReply = useSettingsStore((s) => s.showBangumiReply);
  const playRepeat = useSettingsStore((s) => s.playRepeat);
  const [detail, setDetail] = useState<SeasonDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [tab, setTab] = useState<'eps' | 'review'>('eps');
  const activeTab = showBangumiReply ? tab : 'eps';
  const [followStatus, setFollowStatus] = useState(0);
  const [liked, setLiked] = useState(false);
  const [coined, setCoined] = useState(false);
  const [faved, setFaved] = useState(false);
  const [activeEpIndex, setActiveEpIndex] = useState(0);
  const [activeEp, setActiveEp] = useState<Episode | null>(null);
  const [playUrl, setPlayUrl] = useState('');
  const [pgcLoading, setPgcLoading] = useState(false);
  const [pgcPlaying, setPgcPlaying] = useState(false);
  const [pgcClips, setPgcClips] = useState<{ start: number; end: number; clipType: string }[]>([]);
  const pgcSeqRef = useRef(0);
  const pgcStartedRef = useRef(false);
  const pgcBackgroundPauseRef = useRef(false);
  const lastGoodPlayUrlRef = useRef('');
  /** 断点续播：readyToPlay 时 seek 到服务端 watch_progress（R1） */
  const pgcResumeSeekRef = useRef(0);
  const listRef = useRef<FlashListRef<Episode>>(null);
  useScrollToTop(listRef);

  const pgcSource = useMemo(() => {
    if (!playUrl) return null;
    return {
      uri: playUrl,
      headers: { ...PLAYER_HEADERS },
    };
  }, [playUrl]);

  // 分享链接：ep 深链时用 season_id 组装 ss 链接，避免 /pgc/ep_<id> 拼出 ssep<id>。
  const shareLink = useMemo(() => {
    const seasonId = detail?.season_id || (/^\d+$/.test(String(id || '')) ? parseInt(String(id), 10) : 0);
    return seasonId ? `https://www.bilibili.com/bangumi/play/ss${seasonId}` : '';
  }, [detail, id]);

  const loadEpPlayUrl = useCallback(async (ep: Episode) => {
    const seq = ++pgcSeqRef.current;
    setPgcLoading(true);
    try {
      // R1（03-R1）：/pgc/player/web/v2/playurl 载荷在 result.video_info，旧代码读 res.data 恒为 undefined 导致番剧必挂；
      // fnval 用 0（durl 合流），保证 iOS AVPlayer 有声可播（04-3.9 有画无声修复）。
      const res = await videoApi.pgcPlayUrl({ cid: ep.cid, bvid: ep.bvid, qn: 0, fnval: 0 });
      if (seq !== pgcSeqRef.current) return;
      const videoInfo = (res as any)?.result?.video_info;
      const url = getBestPlayUrl(videoInfo);
      if (!url) {
        showToast(res?.message || '获取播放地址失败');
        return;
      }
      // 断点续播：watch_progress 在 result.play_view_business_info.user_status 下（对齐 Flutter video.dart:250-255）
      const watchProgress = (res as any)?.result?.play_view_business_info?.user_status?.watch_progress?.current_watch_progress;
      const clips = Array.isArray(videoInfo?.clip_info_list)
        ? (videoInfo.clip_info_list as any[]).map((c: any) => ({
          start: Number(c?.start) || 0,
          end: Number(c?.end) || 0,
          clipType: String(c?.clipType || ''),
        }))
        : [];
      setPgcClips(clips);
      setPlayUrl(url);
      if (typeof watchProgress === 'number' && watchProgress > 0) {
        pgcResumeSeekRef.current = watchProgress;
      }
    } catch {
      if (seq === pgcSeqRef.current) showToast('获取播放地址失败');
    } finally {
      if (seq === pgcSeqRef.current) setPgcLoading(false);
    }
  }, []);

  const loadSeason = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      // N4（06-N4）：通知深链 ep 被映射为 /pgc/ep_<epId>，id 以 "ep" 开头时按 ep_id 取 season 再走原流程。
      const idStr = String(id || '').trim();
      const epMatch = /^ep(\d+)$/i.exec(idStr);
      let res: any;
      if (epMatch) {
        res = await pgcApi.seasonInfo({ ep_id: parseInt(epMatch[1], 10) });
      } else {
        const seasonId = parseInt(idStr, 10);
        if (Number.isNaN(seasonId)) {
          setLoadError(true);
          return;
        }
        res = await pgcApi.seasonInfo({ season_id: seasonId });
      }
      if (res?.result) {
        const d = res.result;
        const eps: Episode[] = (d.episodes || []).map((ep: any) => ({
          id: ep.id, cid: ep.cid, bvid: ep.bvid, title: ep.title, cover: ep.cover, long_title: ep.long_title || '',
          badge: ep.badge || '',
        }));
        setDetail({
          season_id: d.season_id, media_id: d.media_id || 0, title: d.title, cover: d.cover, evaluate: d.evaluate || '',
          rating: { score: d.rating?.score || 0, count: d.rating?.count || 0 },
          stat: { follow: d.stat?.follow || 0, view: d.stat?.view || 0, danmaku: d.stat?.danmaku || 0 },
          styles: d.styles || [],
          season_type: d.type || d.season_type,
          is_finish: d.is_finish === 1 ? 1 : 0,
          new_ep: d.new_ep ? {
            id: d.new_ep.id,
            index_show: d.new_ep.index_show || '',
            cover: d.new_ep.cover || '',
            title: d.new_ep.title || '',
          } : undefined,
          episodes: eps,
        });
        if (eps.length > 0) {
          // ep 深链时优先定位到该集（result.ep_id 由 season?ep_id= 返回）
          const targetIndex = epMatch ? eps.findIndex((ep) => ep.id === d.ep_id) : -1;
          const startIndex = targetIndex >= 0 ? targetIndex : 0;
          setActiveEpIndex(startIndex);
          setActiveEp(eps[startIndex]);
          pgcStartedRef.current = useSettingsStore.getState().autoPlay;
          loadEpPlayUrl(eps[startIndex]);
        }
        setFollowStatus(d.user_status?.follow === 1 ? (d.user_status?.follow_status || 1) : 0);
        setLiked(d.user_status?.like === 1);
        setCoined(d.user_status?.coin === 1);
        setFaved(d.user_status?.fav === 1);
      } else {
        setLoadError(true);
      }
    } catch (e) {
      console.error('loadSeason error:', e);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [id, loadEpPlayUrl]);

  const switchEpisode = useCallback((index: number) => {
    if (!detail || index === activeEpIndex) return;
    const ep = detail.episodes[index];
    if (!ep) return;
    setActiveEpIndex(index);
    setActiveEp(ep);
    pgcStartedRef.current = true;
    player.pause();
    setPgcClips([]);
    setPlayUrl('');
    loadEpPlayUrl(ep);
  }, [detail, activeEpIndex, player, loadEpPlayUrl]);

  const selectEpisodeById = useCallback((epId: number) => {
    const index = detail?.episodes.findIndex((ep) => ep.id === epId);
    if (index == null || index < 0) return;
    switchEpisode(index);
  }, [detail, switchEpisode]);

  const handleEpisodeEnd = useCallback(() => {
    if (!detail || detail.episodes.length <= 1) {
      setPgcPlaying(false);
      return;
    }
    if (playRepeat === 1) {
      player.currentTime = 0;
      player.play();
      return;
    }
    if (playRepeat === 0) {
      setPgcPlaying(false);
      return;
    }
    let next = (activeEpIndex + 1) % detail.episodes.length;
    if (playRepeat === 3) {
      next = Math.floor(Math.random() * detail.episodes.length);
      if (next === activeEpIndex) next = (next + 1) % detail.episodes.length;
    }
    switchEpisode(next);
  }, [detail, playRepeat, activeEpIndex, player, switchEpisode]);

  useEffect(() => {
    const timer = setTimeout(() => { if (id) loadSeason(); }, 0);
    return () => clearTimeout(timer);
  }, [id, loadSeason]);

  useEffect(() => {
    if (!player) return;
    const playSub = player.addListener('playingChange', (e: any) => {
      setPgcPlaying(!!e.isPlaying);
    });
    const statusSub = player.addListener('statusChange', (e: any) => {
      if (e?.status === 'readyToPlay') {
        // R1 断点续播：源就绪后先 seek 到服务端 watch_progress 再播放
        const resume = pgcResumeSeekRef.current;
        if (resume > 0) {
          pgcResumeSeekRef.current = 0;
          try { player.seekTo(resume); } catch {}
        }
        if (pgcStartedRef.current) player.play();
      }
    });
    const endSub = player.addListener('playToEnd', handleEpisodeEnd);
    return () => {
      playSub.remove();
      statusSub.remove();
      endSub.remove();
    };
  }, [player, handleEpisodeEnd]);

  // 页面失去焦点或卸载时暂停共享播放器，避免离开 PGC 后继续出声/常亮。
  useEffect(() => {
    if (!isFocused) player.pause();
  }, [isFocused, player]);

  // 后台守卫：后台暂停，回前台只恢复先前正在播放的会话。
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      const st = useSettingsStore.getState();
      if (state !== 'active') {
        if (st.enableBackgroundPlay && st.continuePlayInBackground) return;
        if (pgcPlaying) {
          pgcBackgroundPauseRef.current = true;
          player.pause();
        }
        return;
      }
      if (pgcBackgroundPauseRef.current) {
        pgcBackgroundPauseRef.current = false;
        if (isFocused) player.play();
      }
    });
    return () => sub.remove();
  }, [pgcPlaying, isFocused, player]);

  useEffect(() => () => {
    try { player.pause(); } catch {}
  }, [player]);

  useEffect(() => {
    if (!playUrl || !player || !pgcSource) return;
    let cancelled = false;
    (async () => {
      try {
        await player.replaceAsync(pgcSource);
        lastGoodPlayUrlRef.current = playUrl;
      } catch {
        if (!cancelled) {
          setPlayUrl(lastGoodPlayUrlRef.current);
          showToast('播放源加载失败');
        }
        return;
      }
      if (cancelled) return;
      if (pgcStartedRef.current) player.play();
    })();
    return () => { cancelled = true; };
  }, [pgcSource, playUrl, player]);

  function toggleFollow() {
    if (!isLoggedIn) { router.push('/login' as Href); return; }
    const actions: { label: string; destructive?: boolean; onPress: () => void }[] = [
      { label: '想看', onPress: () => updateFollowStatus(1) },
      { label: '已追', onPress: () => updateFollowStatus(2) },
      { label: '已看完', onPress: () => updateFollowStatus(3) },
      ...(followStatus > 0
        ? [{ label: '取消追番', destructive: true, onPress: () => updateFollowStatus(0) }]
        : []),
    ];
    const destructiveIndex = actions.findIndex((a) => a.destructive);
    ActionSheetIOS.showActionSheetWithOptions(
      {
        title: '追番状态',
        options: [...actions.map((a) => a.label), '取消'],
        cancelButtonIndex: actions.length,
        destructiveButtonIndex: destructiveIndex >= 0 ? destructiveIndex : undefined,
      },
      (index) => {
        if (index >= 0 && index < actions.length) actions[index].onPress();
      },
    );
  }

  async function updateFollowStatus(status: number) {
    if (!isLoggedIn) { router.push('/login' as Href); return; }
    feedBack();
    const prev = followStatus;
    setFollowStatus(status);
    try {
      const seasonId = parseInt(id);
      if (status === 0) await pgcApi.followDel({ season_id: seasonId });
      else await pgcApi.followUpdate({ season_id: seasonId, status });
      showToast(status === 0 ? '已取消追番' : status === 1 ? '已标记想看' : status === 2 ? '已标记追番' : '已标记看完');
    } catch {
      setFollowStatus(prev);
      showToast('操作失败');
    }
  }

  function getFirstEpId(): number | null {
    return detail?.episodes?.[0]?.id ?? null;
  }

  async function handlePgcLike() {
    if (!isLoggedIn) { router.push('/login' as Href); return; }
    const epId = getFirstEpId();
    if (!epId) return;
    feedBack();
    const newVal = !liked;
    setLiked(newVal);
    try { await pgcApi.communityAction({ ep_id: epId, type: 'like', action: newVal ? 1 : 0 }); } catch {
      setLiked(!newVal);
      showToast('操作失败');
    }
  }

  async function handlePgcCoin() {
    if (!isLoggedIn) { router.push('/login' as Href); return; }
    const epId = getFirstEpId();
    if (!epId || coined) return;
    feedBack();
    setCoined(true);
    try { await pgcApi.communityAction({ ep_id: epId, type: 'coin', action: 1 }); } catch {
      setCoined(false);
      showToast('操作失败');
    }
  }

  async function handlePgcFav() {
    if (!isLoggedIn) { router.push('/login' as Href); return; }
    const epId = getFirstEpId();
    if (!epId) return;
    feedBack();
    const newVal = !faved;
    setFaved(newVal);
    try { await pgcApi.communityAction({ ep_id: epId, type: 'fav', action: newVal ? 1 : 0 }); } catch {
      setFaved(!newVal);
      showToast('操作失败');
    }
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]}>
      {detail?.title && <Stack.Title large>{detail.title}</Stack.Title>}
      <Stack.Header blurEffect="systemMaterial" style={{ shadowColor: 'transparent' }} />
      {activeTab === 'eps' ? (
        <Stack.Toolbar>
          <Stack.Toolbar.Menu icon="bookmark" accessibilityLabel="追番">
            <Stack.Toolbar.MenuAction onPress={() => updateFollowStatus(1)}>想看</Stack.Toolbar.MenuAction>
            <Stack.Toolbar.MenuAction onPress={() => updateFollowStatus(2)}>已追</Stack.Toolbar.MenuAction>
            <Stack.Toolbar.MenuAction onPress={() => updateFollowStatus(3)}>已看完</Stack.Toolbar.MenuAction>
            {followStatus > 0 ? (
              <Stack.Toolbar.MenuAction destructive onPress={() => updateFollowStatus(0)}>取消追番</Stack.Toolbar.MenuAction>
            ) : null}
          </Stack.Toolbar.Menu>
          <Stack.Toolbar.Button icon="hand.thumbsup" accessibilityLabel={liked ? '取消点赞' : '点赞'} onPress={handlePgcLike} />
          <Stack.Toolbar.Button icon="yensign.circle" accessibilityLabel={coined ? '已投币' : '投币'} onPress={handlePgcCoin} />
          <Stack.Toolbar.Button icon="star" accessibilityLabel={faved ? '取消收藏' : '收藏'} onPress={handlePgcFav} />
          <Stack.Toolbar.Button icon="square.and.arrow.up" accessibilityLabel="分享" onPress={() => shareLink && Share.share({ message: shareLink })} />
        </Stack.Toolbar>
      ) : null}

      <PgcPlayer
        activeEp={activeEp}
        playUrl={playUrl}
        pgcLoading={pgcLoading}
        pgcPlaying={pgcPlaying}
        playRepeat={playRepeat}
        player={player}
        pgcClips={pgcClips}
        onTap={() => {
          if (!activeEp) return;
          if (!playUrl) {
            pgcStartedRef.current = true;
            loadEpPlayUrl(activeEp);
          } else if (pgcPlaying) {
            player.pause();
          } else {
            pgcStartedRef.current = true;
            player.play();
          }
        }}
      />

      {detail ? (
        <View style={styles.tabBarWrap}>
          <Host matchContents>
            <Picker
              label=""
              selection={activeTab === 'eps' ? 0 : 1}
              onSelectionChange={(v) => setTab(Number(v) === 0 ? 'eps' : 'review')}
              modifiers={[pickerStyle('segmented')]}>
              <SwiftText modifiers={[tag(0)]}>选集</SwiftText>
              {showBangumiReply && <SwiftText modifiers={[tag(1)]}>点评</SwiftText>}
            </Picker>
          </Host>
        </View>
      ) : null}

      {loading ? (
        <View style={styles.loadingWrap}>
          <Host matchContents><ProgressView /></Host>
        </View>
      ) : detail ? (
        activeTab === 'eps' ? (
          <PgcEpisodeGrid
            episodes={detail.episodes}
            activeIndex={activeEpIndex}
            onSelect={switchEpisode}
            listRef={listRef}
            header={
              <PgcInfoHeader
                detail={detail}
                followStatus={followStatus}
                liked={liked}
                coined={coined}
                faved={faved}
                onToggleFollow={toggleFollow}
                onLike={handlePgcLike}
                onCoin={handlePgcCoin}
                onFav={handlePgcFav}
                onShare={() => shareLink && Share.share({ message: shareLink })}
              />
            }
            showTimeline={showPgcTimeline}
            isFinish={detail.is_finish}
            newEp={detail.new_ep}
            seasonId={detail.season_id}
            seasonType={detail.season_type}
            onSelectEpId={selectEpisodeById}
          />
        ) : (
          <PgcReviewSection
            mediaId={detail.media_id}
            seasonTitle={detail.title}
          />
        )
      ) : loadError ? (
        // G1（06-G1）：加载失败提供错误态 + 重试按钮（全站共享 ErrorState 组件）
        <ErrorState
          title="加载失败"
          message="番剧信息获取失败，请检查网络后重试"
          onRetry={loadSeason}
        />
      ) : (
        <View style={styles.loadingWrap}>
          <Text style={[T.footnote, styles.empty, { color: colors.textTertiary }]}>加载失败</Text>
        </View>
      )}
    </View>
  );
}

export default function PgcDetailScreen() {
  const cfg = getPlayerConfig();
  PiliPlayer.shared.setLoop(cfg.playRepeat === 1);
  PiliPlayer.shared.setMuted(false);
  PiliPlayer.shared.setBufferConfig(cfg.bufferSec);
  PiliPlayer.shared.setLiveMode(false);
  return <PgcDetailBody player={PiliPlayer.shared} />;
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  loadingWrap: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  tabBarWrap: { paddingHorizontal: 14, paddingTop: 12 },
  empty: { textAlign: 'center', marginTop: 30 },
});
