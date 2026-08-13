import { useState, useEffect, useRef } from 'react';
import {
  View, StyleSheet, KeyboardAvoidingView, Alert, Share, AppState,
} from 'react-native';
import { Host, ProgressView } from '@expo/ui/swift-ui';
import { useLocalSearchParams, Stack, useRouter } from 'expo-router';
import type { Href } from 'expo-router';
import { PiliPlayer } from 'pili-player';
import { useThemeColors } from '@/components/SwiftUIHost';
import { LiveDanmakuList, type LiveDanmakuListHandle } from '@/components/live/LiveDanmakuList';
import { LiveInfoPanel } from '@/components/live/LiveInfoPanel';
import type { LiveInfo, LiveEvent } from '@/components/live/LiveInfoPanel';
import { LiveChatInput } from '@/components/live/LiveChatInput';
import { RoomMenuSheet } from '@/components/live/RoomMenuSheet';
import type { RoomArea } from '@/components/live/RoomMenuSheet';
import { buildLiveUrl, buildQualityList, getBestLiveAudioUrl } from '@/components/live/live-protocol';
import type { QualityItem } from '@/components/live/live-protocol';
import { useLiveSocket } from '@/hooks/use-live-socket';
import { liveApi } from '@/api/live';
import { userApi } from '@/api/user';
import { showToast } from '@/utils/toast';
import { feedBack, feedBackSuccess } from '@/utils/feedback';
import { parseChineseNumber } from '@/utils/format';
import { useSettingsStore } from '@/stores/settings';
import { useAuthStore } from '@/stores/auth';
import { startAudioPlayback, releaseAudioPlayer } from '@/utils/audio-player';
import { PLAYER_HEADERS, liveQualityStreamingLimits } from '@/utils/player-utils';
import { useNetwork } from '@/utils/network';
import { beginAudioTransitionTaskAsync, endAudioTransitionTaskAsync } from 'pili-audio';
import {
  createNativeRequestCancelToken,
  type NativeRequestCancelToken,
} from '@/utils/request-cancel';
// 06-L1：加载失败错误态（共享组件 ErrorState，默认导出）
import ErrorState from '@/components/ErrorState';

export default function LiveRoomScreen() {
  const { roomId } = useLocalSearchParams<{ roomId: string }>();
  const router = useRouter();
  const colors = useThemeColors();
  const [info, setInfo] = useState<LiveInfo | null>(null);
  const [playUrl, setPlayUrl] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [menuVisible, setMenuVisible] = useState(false);
  const [roomArea, setRoomArea] = useState<RoomArea | null>(null);
  const [superChats, setSuperChats] = useState<any[]>([]);
  const [topFans, setTopFans] = useState<any[]>([]);
  const [emoticons, setEmoticons] = useState<any[]>([]);
  const [input, setInput] = useState('');
  const [qualityList, setQualityList] = useState<QualityItem[]>([]);
  const [currentQn, setCurrentQn] = useState(10000);
  const [followed, setFollowed] = useState(false);
  const [liked, setLiked] = useState(false);
  const [liveEvents, setLiveEvents] = useState<LiveEvent[]>([]);
  const [showEmojiPanel, setShowEmojiPanel] = useState(false);
  const [emojiPackageIdx, setEmojiPackageIdx] = useState(0);
  const [liveAudioMode, setLiveAudioMode] = useState(false);
  const liveAudioModeRef = useRef(false);
  const liveAudioSwitchInFlightRef = useRef(false);
  const dmIdRef = useRef(0);
  const dmRef = useRef<LiveDanmakuListHandle>(null);
  const pendingDmRef = useRef<{ uname: string; msg: string }[]>([]);
  const dmFlushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wasLivePlayingRef = useRef(false);
  const loadRoomRef = useRef<() => void>(() => {});
  const loadSeqRef = useRef(0);
  const roomCancelRef = useRef<NativeRequestCancelToken | null>(null);
  const danmakuEnabled = useSettingsStore((s) => s.danmakuEnabled);
  const superChatType = useSettingsStore((s) => s.superChatType);
  const isLoggedIn = useAuthStore((s) => s.isLoggedIn);
  const userMid = useAuthStore((s) => s.userInfo?.mid || 0);

  const liveSocket = useLiveSocket({
    onMessagesBatch: (messages) => {
      for (const message of messages) {
        handleWsCommand(message.data);
      }
    },
    onError: (error) => {
      console.error('live socket error:', error);
    },
    keepAliveInBackground: liveAudioMode,
  });
  const { connect, setKeepAliveInBackground } = liveSocket;

  useEffect(() => {
    liveAudioModeRef.current = liveAudioMode;
  }, [liveAudioMode]);

  useEffect(() => {
    return () => {
      loadSeqRef.current += 1;
      roomCancelRef.current?.abort();
      if (dmFlushTimerRef.current) {
        clearTimeout(dmFlushTimerRef.current);
        dmFlushTimerRef.current = null;
      }
    };
  }, []);

  const player = PiliPlayer.shared;

  useEffect(() => {
    if (!playUrl) return;
    let cancelled = false;
    (async () => {
      try {
        await player.replaceAsync({
          uri: playUrl,
          headers: { ...PLAYER_HEADERS },
        });
        if (cancelled) return;
        player.setTimeUpdateInterval(0);
        player.setBufferConfig(0);
        player.setLiveMode(true);
        const st = useSettingsStore.getState();
        const qn = useNetwork.getState().isWifi ? st.liveQuality : st.cellularLiveQuality;
        const limits = liveQualityStreamingLimits(qn);
        player.setStreamingLimits(limits.maxWidth, limits.maxHeight, limits.peakBitRate);
        player.setVolume(Math.min(Math.max((st.playerVolume ?? 100) / 100, 0), 1));
        if (!liveAudioModeRef.current) player.play();
      } catch (e) {
        console.error('live player load error:', e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [playUrl, player]);

  // 04-3.8：退出直播间必须复位共享会话参数，否则 liveMode/bufferConfig/
  // timeUpdateInterval(0)/loop 残留，下载播放页等点播场景会沿用直播小缓冲策略导致卡顿。
  useEffect(() => {
    return () => {
      try {
        player.pause();
        player.setLiveMode(false);
        player.setLoop(false); // 直播本就不需要 loop（原实现 setLoop(true) 对直播无意义）
        player.setTimeUpdateInterval(0.5); // 点播默认进度刷新间隔
      } catch {}
      releaseAudioPlayer();
    };
  }, [player]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'background') {
        if (liveAudioModeRef.current) return;
        if (!player.playing) return;
        const settings = useSettingsStore.getState();
        if (settings.enableBackgroundPlay && settings.continuePlayInBackground && playUrl) {
          void startLiveAudioRef.current();
          return;
        }
        wasLivePlayingRef.current = true;
        player.pause();
      } else if (state === 'inactive') {
        if (liveAudioModeRef.current) return;
        if (!player.playing) return;
        wasLivePlayingRef.current = true;
        player.pause();
      } else if (wasLivePlayingRef.current) {
        wasLivePlayingRef.current = false;
        if (playUrl && !liveAudioModeRef.current) player.play();
      }
    });
    return () => sub.remove();
  }, [playUrl, player]);

  const startLiveAudioRef = useRef(startLiveAudio);
  useEffect(() => {
    startLiveAudioRef.current = startLiveAudio;
  });

  async function startLiveAudio() {
    if (!playUrl || !info) {
      showToast('暂无直播源');
      return;
    }
    if (liveAudioModeRef.current || liveAudioSwitchInFlightRef.current) return;
    setKeepAliveInBackground(true);
    liveAudioSwitchInFlightRef.current = true;
    const transitionToken = await beginAudioTransitionTaskAsync();
    try {
      const res = await liveApi.roomInfo({
        room_id: parseInt(roomId),
        qn: currentQn,
        onlyAudio: true,
      });
      const playurl = res?.data?.playurl_info?.playurl;
      const audioUrl = getBestLiveAudioUrl(
        playurl,
        useSettingsStore.getState().liveCdnUrl,
        currentQn,
      ) || playUrl;
      if (!audioUrl) {
        showToast('未获取到音频流');
        return;
      }
      player.pause();
      await startAudioPlayback(
        audioUrl,
        {
          bvid: `live_${roomId}`,
          title: info.title || `${info.anchor.name || ''} 的直播`,
          cover: info.cover || info.anchor.face || '',
        },
        0,
        audioUrl === playUrl,
        true,
      );
      setLiveAudioMode(true);
      showToast('已进入后台听直播');
    } catch (e) {
      console.error('live audio start error:', e);
      setKeepAliveInBackground(false);
      showToast('进入听直播失败');
    } finally {
      await endAudioTransitionTaskAsync(transitionToken).catch(() => {});
      liveAudioSwitchInFlightRef.current = false;
    }
  }

  async function stopLiveAudio() {
    if (!liveAudioModeRef.current) return;
    setKeepAliveInBackground(false);
    await releaseAudioPlayer();
    setLiveAudioMode(false);
    if (playUrl) player.play();
  }

  function toggleLiveAudio() {
    if (liveAudioModeRef.current) void stopLiveAudio();
    else void startLiveAudio();
  }

  async function loadRoom() {
    const seq = ++loadSeqRef.current;
    roomCancelRef.current?.abort();
    const cancelToken = createNativeRequestCancelToken();
    roomCancelRef.current = cancelToken;
    setLoading(true);
    setLoadError(null);
    try {
      const s = useSettingsStore.getState();
      const rid = parseInt(roomId);
      const qn = useNetwork.getState().isWifi ? s.liveQuality : s.cellularLiveQuality;
      const res = await liveApi.roomInfo({ room_id: rid, qn }, { cancelToken });
      if (seq !== loadSeqRef.current) return;
      if (res?.data) {
        const d = res.data;
        setInfo({
          room_id: d.room_id, uid: d.uid, title: d.title, cover: d.cover,
          live_status: d.live_status, online: d.online,
          anchor: { name: d.anchor_info?.base_info?.uname || '', face: d.anchor_info?.base_info?.face || '' },
        });
        const playurl = d.playurl_info?.playurl;
        if (playurl) {
          const ql = buildQualityList(playurl);
          const current = playurl?.stream?.[0]?.format?.[0]?.codec?.[0]?.current_qn || qn || ql[0]?.quality;
          if (ql.length > 0) setQualityList(ql);
          if (current) setCurrentQn(current);
          const url = buildLiveUrl(playurl, s.liveCdnUrl, current);
          if (url) setPlayUrl(url);
        }
        if (isLoggedIn && d.uid) {
          userApi.relation({ fid: d.uid }, { cancelToken }).then((r: any) => {
            if (seq !== loadSeqRef.current) return;
            const attr = r?.data?.attribute || 0;
            setFollowed(attr === 2 || attr === 6);
          }).catch((e) => {
            console.error('live relation error:', e);
          });
        }
        if (s.danmakuEnabled && seq === loadSeqRef.current) void connectDm(rid, seq, cancelToken);

        // 直播间当前分区（供设置菜单"分区切换"定位）
        liveApi.roomInfoH5({ room_id: rid }, { cancelToken }).then((res: any) => {
          if (seq !== loadSeqRef.current) return;
          const ri = res?.data?.room_info;
          if (ri) {
            setRoomArea({
              areaId: ri.area_v2_id || 0,
              parentId: ri.parent_area_id || 0,
              areaName: ri.area_name || '',
              parentName: ri.parent_area_name || '',
            });
          }
        }).catch((e: any) => {
          console.error('roomInfoH5 error:', e);
        });

        // 进入直播间上报 + 弹幕预获取（对齐 Flutter controller.dart#L393-L400）
        liveApi.roomEntryAction({ room_id: rid }, { cancelToken }).catch((e) => {
          console.error('roomEntryAction error:', e);
        });
        liveApi.dmPrefetch({ roomid: rid }, { cancelToken }).then((res: any) => {
          if (seq !== loadSeqRef.current) return;
          const rawList = res?.data?.room || res?.data?.dm_list;
          if (Array.isArray(rawList)) {
            const history = rawList.map((d: any) => ({
              id: d.id_str || d.id || dmIdRef.current++,
              uname: d.uname || '',
              msg: d.text || d.content || d.msg || '',
            }));
            dmRef.current?.seed(history);
          }
        }).catch((e) => {
          console.error('dmPrefetch error:', e);
        });

        // 并行加载 SuperChat + 贡献榜（对齐 Flutter controller.dart#L408）
        // 仅在 SC 未隐藏时加载（superChatType: 0=普通, 1=紧凑, 2=隐藏）
        const scPromise = useSettingsStore.getState().superChatType !== 2
          ? liveApi.superChatMsg({ room_id: rid }, { cancelToken })
          : Promise.reject(new Error('sc hidden'));
        Promise.allSettled([
          scPromise,
          liveApi.contributionRank({ room_id: rid, ruid: d.uid, page: 1 }, { cancelToken }),
        ]).then(([scRes, rankRes]) => {
          if (seq !== loadSeqRef.current) return;
          if (scRes.status === 'fulfilled' && scRes.value?.data?.list) {
            setSuperChats(scRes.value.data.list);
          }
          if (rankRes.status === 'fulfilled' && rankRes.value?.data?.item) {
            setTopFans(rankRes.value.data.item.slice(0, 10));
          }
        });

        // 直播表情（对齐 Flutter 表情包面板）
        liveApi.emoticons(rid, { cancelToken }).then((res: any) => {
          if (seq !== loadSeqRef.current) return;
          const packages = Array.isArray(res?.data) ? res.data : res?.data?.packages;
          if (Array.isArray(packages)) setEmoticons(packages);
        }).catch((e) => {
          console.error('emoticons error:', e);
        });
      }
    } catch (e) {
      // 06-L1：加载失败不再只 console.error 渲染空壳页——设置错误态并交给 ErrorState 展示
      if (cancelToken.aborted) return;
      console.error('loadRoom error:', e);
      if (seq === loadSeqRef.current) {
        setLoadError(e instanceof Error ? e.message : '直播间加载失败');
      }
    } finally {
      if (seq === loadSeqRef.current) setLoading(false);
    }
  }

  function pushLiveEvent(type: LiveEvent['type'], uname: string, text: string) {
    setLiveEvents((prev) => [...prev.slice(-14), { id: dmIdRef.current++, type, uname, text }]);
  }

  function queueDm(uname: string, msg: string) {
    pendingDmRef.current.push({ uname, msg });
    if (dmFlushTimerRef.current) return;
    dmFlushTimerRef.current = setTimeout(() => {
      dmFlushTimerRef.current = null;
      const batch = pendingDmRef.current;
      pendingDmRef.current = [];
      dmRef.current?.pushBatch(batch);
    }, 0);
  }

  function handleWsCommand(obj: any) {
    if (!obj?.cmd) return;
    switch (obj.cmd) {
      case 'DANMU_MSG': {
        const msg = obj.info?.[1] || '';
        const uname = obj.info?.[2]?.[1] || '';
        queueDm(uname, msg);
        break;
      }
      case 'SUPER_CHAT_MESSAGE': {
        const d = obj.data;
        if (d?.id) {
          setSuperChats((prev) => [d, ...prev].slice(0, 30));
        }
        break;
      }
      case 'SEND_GIFT': {
        const d = obj.data;
        pushLiveEvent(
          'gift',
          d?.uname || d?.data?.uname || '',
          `${d?.giftName || d?.gift_name || '礼物'} ×${d?.num || d?.data?.num || 1}`,
        );
        break;
      }
      case 'GUARD_BUY': {
        const d = obj.data;
        pushLiveEvent(
          'guard',
          d?.username || d?.uname || d?.data?.username || '',
          `开通 ${d?.giftName || d?.gift_name || '舰长'}`,
        );
        break;
      }
      case 'INTERACT_WORD': {
        const d = obj.data;
        const uname = d?.uname || d?.data?.uname || '';
        if (uname) {
          pushLiveEvent('interact', uname, d.msg_type === 1 ? '进入直播间' : '关注主播');
        }
        break;
      }
      case 'WATCHED_CHANGE': {
        const count = parseChineseNumber(obj.data?.text_large);
        if (count > 0) setInfo((prev) => (prev ? { ...prev, online: count } : prev));
        break;
      }
      case 'ONLINE_RANK_COUNT': {
        const count = parseInt(obj.data?.count, 10);
        if (!Number.isNaN(count)) setInfo((prev) => (prev ? { ...prev, online: count } : prev));
        break;
      }
      case 'ROOM_CHANGE': {
        if (obj.data?.title) setInfo((prev) => (prev ? { ...prev, title: obj.data.title } : prev));
        break;
      }
    }
  }

  async function connectDm(rid: number, seq: number, cancelToken?: NativeRequestCancelToken) {
    try {
      let host = 'broadcastlv.chat.bilibili.com';
      let wssPort = 443;
      let token = '';
      try {
        const tokenRes: any = await liveApi.dmToken({ id: rid }, { cancelToken });
        const d = tokenRes?.data;
        token = d?.token || '';
        const first = d?.host_list?.[0];
        if (first?.host) {
          host = first.host;
          wssPort = first.wss_port || 443;
        }
      } catch (e) {
        if (cancelToken?.aborted) return;
        console.warn('dmToken error, fallback host:', e);
      }
      if (cancelToken?.aborted) return;
      if (seq !== loadSeqRef.current) return;
      await connect({
        url: `wss://${host}:${wssPort}/sub`,
        heartbeatIntervalMs: 30000,
        maxReconnectDelayMs: 30000,
        join: {
          roomId: Number(roomId),
          token,
          uid: 0,
          platform: 'web',
          protover: 1,
        },
      });
    } catch (e) {
      console.error('connectDm error:', e);
    }
  }

  useEffect(() => {
    loadRoomRef.current = loadRoom;
  });

  useEffect(() => {
    const timer = setTimeout(() => {
      if (roomId) loadRoomRef.current();
    }, 0);
    return () => {
      clearTimeout(timer);
    };
  }, [roomId]);

  async function sendDm() {
    const text = input.trim();
    if (!text) return;
    try {
      await liveApi.sendMsg({ roomid: parseInt(roomId), msg: text });
      setInput('');
      setShowEmojiPanel(false);
      feedBackSuccess();
    } catch (e) {
      console.error('sendDm error:', e);
    }
  }

  async function changeQuality(qn: number) {
    if (qn === currentQn) return;
    roomCancelRef.current?.abort();
    const cancelToken = createNativeRequestCancelToken();
    roomCancelRef.current = cancelToken;
    setCurrentQn(qn);
    try {
      const s = useSettingsStore.getState();
      const res = await liveApi.roomInfo({ room_id: parseInt(roomId), qn }, { cancelToken });
      const playurl = res?.data?.playurl_info?.playurl;
      if (playurl) {
        const url = buildLiveUrl(playurl, s.liveCdnUrl, qn);
        if (url) setPlayUrl(url);
        const ql = buildQualityList(playurl);
        if (ql.length > 0) setQualityList(ql);
      }
    } catch (e) {
      if (cancelToken.aborted) return;
      console.error('changeQuality error:', e);
      showToast('画质切换失败');
    }
  }

  async function toggleFollow() {
    if (!isLoggedIn || !info) {
      router.push('/login' as Href);
      return;
    }
    const next = !followed;
    setFollowed(next);
    feedBack();
    try {
      const res = await userApi.modifyRelation({ fid: info.uid, act: next ? 1 : 2 });
      if (res?.code !== 0) {
        setFollowed(!next);
        showToast(res?.message || '操作失败');
      }
    } catch (e) {
      console.error('toggleFollow error:', e);
      setFollowed(!next);
      showToast('操作失败');
    }
  }

  async function handleLike() {
    if (!isLoggedIn || !info) {
      router.push('/login' as Href);
      return;
    }
    const next = !liked;
    setLiked(next);
    feedBack();
    try {
      const res = await liveApi.likeReportV3({
        room_id: parseInt(roomId),
        anchor_id: info.uid,
        uid: userMid,
        click_time: 1,
      });
      if (res?.code !== 0) {
        setLiked(!next);
        showToast(res?.message || '点赞失败');
      }
    } catch (e) {
      console.error('likeReport error:', e);
      setLiked(!next);
      showToast('点赞失败');
    }
  }

  function handleShare() {
    Share.share({ message: `https://live.bilibili.com/${roomId}` }).catch((e) => {
      console.error('share live error:', e);
    });
  }

  async function submitReport(reason: string) {
    if (!isLoggedIn) {
      router.push('/login' as Href);
      return;
    }
    try {
      const res = await liveApi.feedbackDislike({
        room_id: parseInt(roomId),
        id: parseInt(roomId),
        id_type: 'room',
        page: 1,
      });
      if (res?.code === 0) {
        showToast('已提交举报');
      } else {
        showToast(res?.message || `提交失败（${reason}）`);
      }
    } catch (e) {
      console.error('live report error:', e);
      showToast('提交失败');
    }
  }

  function handleReport() {
    Alert.alert('举报直播间', '请选择举报原因', [
      { text: '色情低俗', onPress: () => submitReport('色情低俗') },
      { text: '垃圾广告', onPress: () => submitReport('垃圾广告') },
      { text: '违法违规', onPress: () => submitReport('违法违规') },
      { text: '人身攻击', onPress: () => submitReport('人身攻击') },
      { text: '取消', style: 'cancel' },
    ]);
  }

  // 06-L1：加载失败渲染错误态 + 重试按钮（ErrorState 为共享组件，重试走 loadRoom）
  if (loadError && !loading) {
    return (
      <View style={[styles.root, { backgroundColor: colors.bg }]}>
        <Stack.Screen options={{ headerShown: false }} />
        <ErrorState
          title="直播间加载失败"
          message={loadError}
          onRetry={() => loadRoom()}
          retryLabel="重试"
        />
      </View>
    );
  }

  if (loading) {
    return (
      <View style={[styles.loadingWrap, { backgroundColor: colors.bg }]}>
        <Host matchContents><ProgressView /></Host>
      </View>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]}>
      <Stack.Screen options={{ headerShown: false }} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
        <LiveInfoPanel
          info={info}
          playUrl={playUrl}
          player={player}
          followed={followed}
          liked={liked}
          topFans={topFans}
          liveEvents={liveEvents}
          superChats={superChats}
          superChatType={superChatType}
          onFollow={toggleFollow}
          onLike={handleLike}
          onShare={handleShare}
          onReport={handleReport}
          onOpenMenu={() => setMenuVisible(true)}
          liveAudioMode={liveAudioMode}
          onToggleLiveAudio={toggleLiveAudio}
        />

        {/* 弹幕列表（实心卡片承载内容）*/}
        {danmakuEnabled ? (
          <LiveDanmakuList ref={dmRef} />
        ) : (
          <View style={{ flex: 1 }} />
        )}

        <LiveChatInput
          input={input}
          onInputChange={setInput}
          onSend={sendDm}
          onEmojiPick={(name) => setInput((prev) => prev + name)}
          emoticons={emoticons}
          emojiPackageIdx={emojiPackageIdx}
          onEmojiPackageChange={setEmojiPackageIdx}
          showEmojiPanel={showEmojiPanel}
          onToggleEmojiPanel={() => setShowEmojiPanel((v) => !v)}
        />
      </KeyboardAvoidingView>

      {/* 设置菜单（分区切换 / 弹幕屏蔽管理） */}
      <RoomMenuSheet
        visible={menuVisible}
        onClose={() => setMenuVisible(false)}
        roomArea={roomArea}
        qualityList={qualityList}
        currentQn={currentQn}
        onQualityChange={changeQuality}
        onDmBlock={() => {
          setMenuVisible(false);
          router.push(`/live_dm_block?roomId=${roomId}` as Href);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  loadingWrap: { flex: 1, justifyContent: 'center', alignItems: 'center' },
});
