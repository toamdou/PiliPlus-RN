import { useState, useEffect, useRef, useCallback, memo } from 'react';
import {
  View, Text, TextInput, StyleSheet,
  KeyboardAvoidingView, Keyboard, ActivityIndicator,
  ActionSheetIOS, Alert,
} from 'react-native';
import { FlashList, FlashListRef } from '@shopify/flash-list';
import { useLocalSearchParams, Stack } from 'expo-router';
import { Image as ExpoImage } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import * as Clipboard from 'expo-clipboard';
import { Ionicons } from '@expo/vector-icons';
import Animated, { useSharedValue, useAnimatedStyle, withSpring, useReducedMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemeColors } from '@/components/SwiftUIHost';
import { Press, MOTION } from '@/components/motion';
import { useType } from '@/components/type-scale';
import { msgApi } from '@/api/msg';
import { post, tClient } from '@/api/client';
import { Api } from '@/api/endpoints';
import { getCSRF } from '@/utils/cookie';
import { EmotePicker } from '@/components/emote/EmotePicker';
import { formatTime } from '@/utils/format';
import { biliCover } from '@/utils/image-url';
import { feedBackSuccess, feedBackError } from '@/utils/feedback';
import { showToast } from '@/utils/toast';
import { useAuthStore } from '@/stores/auth';
import { RADII, continuous } from '@/theme/tokens';
import { createNativeRequestCancelToken, type NativeRequestCancelToken } from '@/utils/request-cancel';

interface Msg {
  msg_seqno: number; sender_uid: number; content: string; timestamp: number; msg_type: number;
  text?: string;
  imageUrls?: string[];
  picUrl?: string;
  imageWidth?: number;
  imageHeight?: number;
  isOptimistic?: boolean;
}

function parseMessage(content: string, msgType: number): {
  text: string; imageUrls: string[]; picUrl?: string; imageWidth?: number; imageHeight?: number;
} {
  if (msgType === 2) {
    try {
      const parsed = JSON.parse(content);
      const urls = Array.isArray(parsed?.image_urls)
        ? parsed.image_urls.filter((u: unknown): u is string => typeof u === 'string' && !!u)
        : parsed?.url
          ? [parsed.url]
          : [];
      return {
        text: '',
        imageUrls: urls,
        picUrl: parsed?.url,
        imageWidth: Number(parsed?.width) || undefined,
        imageHeight: Number(parsed?.height) || undefined,
      };
    } catch {
      return { text: '', imageUrls: [] };
    }
  }
  if (msgType === 5) return { text: '[已撤回]', imageUrls: [] };
  try {
    const parsed = JSON.parse(content);
    return { text: parsed?.content || content, imageUrls: [] };
  } catch {
    return { text: content, imageUrls: [] };
  }
}

/* ===== 聊天气泡（memo：时间升序列表回收时跳过稳定行重渲染） ===== */
const BubbleRow = memo(function BubbleRow({
  item,
  showTime,
  isMine,
  talkerFace,
  colors,
  T,
  onLongPress,
}: {
  item: Msg;
  showTime: boolean;
  isMine: boolean;
  talkerFace: string;
  colors: ReturnType<typeof useThemeColors>;
  T: ReturnType<typeof useType>;
  onLongPress?: (item: Msg) => void;
}) {
  const images = item.imageUrls || (item.msg_type === 2 && item.picUrl ? [item.picUrl] : []);
  /* 新消息入场：translateY + spring（05-B15/05-C3）；减弱动态效果时直接呈现最终态 */
  const reducedMotion = useReducedMotion();
  const entry = useSharedValue(reducedMotion ? 1 : 0);
  useEffect(() => {
    if (reducedMotion) return;
    entry.set(withSpring(1, MOTION.spring));
  }, [reducedMotion, entry]);
  const entryStyle = useAnimatedStyle(() => ({
    opacity: entry.value,
    transform: [{ translateY: (1 - entry.value) * 12 }],
  }));
  return (
    <Animated.View style={entryStyle}>
      {showTime ? (
        <Text style={[T.caption2, styles.timeDivider, { color: colors.textTertiary }]}>{formatTime(item.timestamp)}</Text>
      ) : null}
      <View style={[styles.bubbleRow, isMine ? styles.bubbleRowMine : styles.bubbleRowTheir]}>
        {!isMine ? (
          <ExpoImage
            source={{ uri: biliCover(talkerFace, 56, 56) }}
            recyclingKey={talkerFace}
            cachePolicy="memory-disk"
            style={[styles.miniAvatar, { backgroundColor: colors.fill2 }]}
            contentFit="cover"
          />
        ) : null}
        {/* 气泡：四角 RADII.lg，尾巴角（同侧下角 4-6pt）由 bubbleMine/bubbleTheir 覆盖。
            长按弹出消息菜单（撤回/复制/举报）——Press 透传 onLongPress，不干扰点击区域 */}
        <Press
          haptic="medium"
          delayLongPress={350}
          scaleTo={0.97}
          onLongPress={() => onLongPress?.(item)}
          style={[styles.bubble, isMine ? styles.bubbleMine : styles.bubbleTheir, { backgroundColor: isMine ? colors.accent : colors.fill2 }]}>
          {images.length > 0 ? (
            <View style={styles.imageBubble}>
              {images.map((uri, i) => (
                <ExpoImage
                  key={`${uri}-${i}`}
                  source={{ uri: uri.startsWith('http') ? biliCover(uri, 420, 316) : uri }}
                  recyclingKey={uri}
                  cachePolicy="memory-disk"
                  style={[styles.bubbleImage, { backgroundColor: colors.fill3 }]}
                  contentFit="cover"
                />
              ))}
            </View>
          ) : item.text || item.content ? (
            <Text style={[T.subhead, styles.bubbleText, { color: isMine ? '#FFFFFF' : colors.text }]}>{item.text || item.content}</Text>
          ) : (
            <View style={styles.imageFallback}>
              <Ionicons name="image-outline" size={22} color={isMine ? 'rgba(255,255,255,0.8)' : colors.textTertiary} />
              <Text style={[T.caption2, { color: isMine ? 'rgba(255,255,255,0.8)' : colors.textTertiary }]}>图片消息</Text>
            </View>
          )}
        </Press>
      </View>
    </Animated.View>
  );
});

export default function WhisperDetailScreen() {
  const { uid } = useLocalSearchParams<{ uid: string }>();
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const userInfo = useAuthStore((s) => s.userInfo);
  const myMid = userInfo?.mid || 0;
  const T = useType();

  const [talkerName, setTalkerName] = useState('私信');
  const [talkerFace, setTalkerFace] = useState('');
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [pickingImage, setPickingImage] = useState(false);
  const [showEmote, setShowEmote] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const listRef = useRef<FlashListRef<Msg>>(null);
  const messagesRef = useRef<Msg[]>([]);
  const loadingOlderRef = useRef(false);
  const beginSeqnoRef = useRef<number | undefined>(undefined);
  const messagesCancelRef = useRef<NativeRequestCancelToken | null>(null);
  const uploadCancelRef = useRef<NativeRequestCancelToken | null>(null);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  const loadTalker = useCallback(async () => {
    const cancelToken = messagesCancelRef.current ?? createNativeRequestCancelToken();
    messagesCancelRef.current = cancelToken;
    try {
      const res = await msgApi.accountList({ uids: uid }, { cancelToken });
      const acc = res?.data?.[0];
      if (acc) { setTalkerName(acc.name || '私信'); setTalkerFace(acc.face || ''); }
    } catch {}
  }, [uid]);

  const loadMessages = useCallback(async (loadOlder = false) => {
    messagesCancelRef.current?.abort();
    const cancelToken = createNativeRequestCancelToken();
    messagesCancelRef.current = cancelToken;
    if (loadOlder) {
      if (loadingOlderRef.current) return;
      if (beginSeqnoRef.current == null) {
        setHasMore(false);
        return;
      }
      loadingOlderRef.current = true;
      setLoadingOlder(true);
    } else {
      setLoading(true);
    }
    try {
      const res = await msgApi.sessionMsg(
        loadOlder && beginSeqnoRef.current != null
          ? { talker_id: parseInt(uid), begin_seqno: beginSeqnoRef.current }
          : { talker_id: parseInt(uid) },
        { cancelToken },
      );
      const raw = res?.data?.messages || [];
      const mapped: Msg[] = raw.map((m: any) => ({
        msg_seqno: m.msg_seqno, sender_uid: m.sender_uid,
        ...parseMessage(m.content, m.msg_type), timestamp: m.timestamp, msg_type: m.msg_type,
      }));
      if (loadOlder) {
        const seen = new Set(messagesRef.current.map((m) => m.msg_seqno));
        const older = mapped.filter((m) => !seen.has(m.msg_seqno));
        /* 接口按新到旧返回，倒转后从顶部（最旧）开始渲染，列表尾部保持最新消息 */
        const olderAsc = [...older].reverse();
        setMessages((prev) => [...olderAsc, ...prev]);
        const oldest = olderAsc[0] ?? mapped[mapped.length - 1];
        if (oldest) beginSeqnoRef.current = oldest.msg_seqno;
        const nextHasMore = res?.data?.has_more !== false && older.length > 0;
        setHasMore(nextHasMore);
      } else {
        /* 接口按新到旧返回；聊天列表改为顶部最旧、底部最新 */
        const asc = [...mapped].reverse();
        setMessages(asc);
        const newest = mapped[0];
        if (newest) msgApi.ackSession({ talker_id: parseInt(uid), ack_seqno: newest.msg_seqno }).catch(() => {});
        beginSeqnoRef.current = asc[0]?.msg_seqno;
        setHasMore(res?.data?.has_more !== false && mapped.length > 0);
      }
    } catch {
      if (cancelToken.aborted) return;
    } finally {
      if (messagesCancelRef.current === cancelToken) messagesCancelRef.current = null;
      if (loadOlder) {
        loadingOlderRef.current = false;
        setLoadingOlder(false);
      } else {
        setLoading(false);
      }
    }
  }, [uid]);

  useEffect(() => {
    const t = setTimeout(() => {
      if (uid) { loadTalker(); loadMessages(); }
    }, 0);
    return () => clearTimeout(t);
  }, [uid, loadTalker, loadMessages]);

  useEffect(() => () => {
    messagesCancelRef.current?.abort();
    uploadCancelRef.current?.abort();
  }, []);

  async function sendMsg() {
    const text = input.trim();
    if (!text || sending) return;
    setSending(true);
    const seq = Date.now();
    const optimistic: Msg = {
      msg_seqno: seq, sender_uid: myMid, content: text, text,
      timestamp: Math.floor(Date.now() / 1000), msg_type: 1, isOptimistic: true,
    };
    setMessages((prev) => [...prev, optimistic]);
    setInput('');
    requestAnimationFrame(() => {
      listRef.current?.scrollToEnd({ animated: true });
    });
    try {
      await msgApi.sendMsg({ receiver_id: parseInt(uid), content: JSON.stringify({ content: text }) });
      feedBackSuccess();
    } catch (e) {
      console.error('send msg error:', e);
      setMessages((prev) => prev.filter((m) => m.msg_seqno !== seq));
      setInput(text);
      feedBackError();
    } finally { setSending(false); }
  }

  async function pickAndSendImage() {
    if (sending || pickingImage) return;
    setPickingImage(true);
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'] as any,
        quality: 0.82,
        selectionLimit: 1,
      });
      if (result.canceled || !result.assets?.[0]?.uri) return;
      const asset = result.assets[0];
      const uri = asset.uri;
      const ext = uri.split('.').pop()?.toLowerCase() || 'jpg';
      const mime = ext === 'png' ? 'image/png' : ext === 'gif' ? 'image/gif' : 'image/jpeg';
      const seq = Date.now();
      const optimistic: Msg = {
        msg_seqno: seq, sender_uid: myMid, content: '', timestamp: Math.floor(Date.now() / 1000),
        msg_type: 2, imageUrls: [uri], picUrl: uri,
        imageWidth: asset.width, imageHeight: asset.height, isOptimistic: true,
      };
      setMessages((prev) => [...prev, optimistic]);
      requestAnimationFrame(() => {
        listRef.current?.scrollToEnd({ animated: true });
      });
      setSending(true);
      uploadCancelRef.current?.abort();
      const cancelToken = createNativeRequestCancelToken();
      uploadCancelRef.current = cancelToken;
      try {
        const upload = await msgApi.uploadBfs({
          file: { uri, name: `im_${seq}.${ext}`, type: mime },
          biz: 'im',
        }, cancelToken);
        const imageUrl = upload?.data?.image_url || upload?.data?.url || '';
        if (!imageUrl) throw new Error('upload response missing image_url');
        const picMsg = {
          url: imageUrl,
          height: Number(upload?.data?.image_height) || asset.height || 0,
          width: Number(upload?.data?.image_width) || asset.width || 0,
          imageType: ext === 'png' ? 'png' : ext === 'gif' ? 'gif' : 'jpg',
          original: 1,
          size: Number(upload?.data?.img_size) || 0,
        };
        await msgApi.sendMsg({ receiver_id: parseInt(uid), content: JSON.stringify(picMsg), msg_type: 2 });
        setMessages((prev) => prev.map((m) => (
          m.msg_seqno === seq ? { ...m, imageUrls: [imageUrl], picUrl: imageUrl } : m
        )));
        feedBackSuccess();
      } catch (e) {
        console.error('send image error:', e);
        setMessages((prev) => prev.filter((m) => m.msg_seqno !== seq));
        feedBackError();
      } finally {
        if (uploadCancelRef.current === cancelToken) uploadCancelRef.current = null;
        setSending(false);
      }
    } catch (e) {
      console.error('pick image error:', e);
      showToast('图片选择失败');
    } finally {
      setPickingImage(false);
    }
  }

  /* ===== 长按消息菜单：撤回 / 复制 / 举报（02-feature-parity whisper_detail） ===== */
  /* 举报原因（对齐 B 站 im report 常见 reason_id） */
  const REPORT_REASONS = [
    { label: '垃圾广告', value: 4 },
    { label: '色情低俗', value: 7 },
    { label: '违法信息', value: 1 },
    { label: '人身攻击', value: 6 },
    { label: '其他', value: 0 },
  ];

  /* 撤回自己的消息：本地乐观置为 [已撤回]，服务端失败则回滚 */
  const recallMessage = useCallback(async (item: Msg) => {
    try {
      const res = await post(tClient, '/web_im/v1/web_im/recall_msg', null, {
        talker_id: parseInt(uid, 10),
        msg_seqno: item.msg_seqno,
        session_type: 1,
        build: 0,
        mobi_app: 'web',
        csrf: getCSRF() ?? '',
        csrf_token: getCSRF() ?? '',
      });
      if (res?.code === 0 || res?.code === undefined) {
        setMessages((prev) => prev.map((m) =>
          m.msg_seqno === item.msg_seqno
            ? { ...m, msg_type: 5, content: '', text: '[已撤回]', imageUrls: [], picUrl: '' }
            : m,
        ));
        feedBackSuccess();
        showToast('已撤回');
      } else {
        showToast(res?.message || '撤回失败');
      }
    } catch {
      showToast('撤回失败');
    }
  }, [uid]);

  const copyText = useCallback(async (text: string) => {
    await Clipboard.setStringAsync(text);
    feedBackSuccess();
    showToast('已复制');
  }, []);

  const copyImageUrl = useCallback(async (url: string) => {
    await Clipboard.setStringAsync(url);
    feedBackSuccess();
    showToast('图片链接已复制');
  }, []);

  const reportMessage = useCallback((item: Msg) => {
    const text = item.text || item.content || '';
    Alert.alert('举报该消息', '请选择举报原因', [
      ...REPORT_REASONS.map((r) => ({
        text: r.label,
        onPress: async () => {
          try {
            const res = await post(tClient, Api.imMsgReport, null, {
              talker_id: parseInt(uid, 10),
              seqno: item.msg_seqno,
              reason_id: r.value,
              content: text,
              csrf: getCSRF() ?? '',
              csrf_token: getCSRF() ?? '',
            });
            showToast(res?.code === 0 ? '举报已提交' : res?.message || '举报失败');
          } catch {
            showToast('举报失败，请重试');
          }
        },
      })),
      { text: '取消', style: 'cancel' },
    ]);
  }, [uid]);

  /* 长按气泡 → ActionSheet 菜单（对齐 SwiftUI ContextMenu/ActionSheet 既有模式） */
  const handleLongPress = useCallback((item: Msg) => {
    const isMine = item.sender_uid === myMid;
    const isRecalled = item.msg_type === 5;
    const isPending = !!item.isOptimistic;
    const text = item.text || item.content || '';
    const imageUrl = item.imageUrls?.[0] || item.picUrl || '';
    const actions: { label: string; onPress: () => void }[] = [];
    if (isMine && !isRecalled && !isPending) {
      actions.push({ label: '撤回', onPress: () => recallMessage(item) });
    }
    if (text) {
      actions.push({ label: '复制', onPress: () => copyText(text) });
    } else if (imageUrl) {
      actions.push({ label: '复制图片链接', onPress: () => copyImageUrl(imageUrl) });
    }
    actions.push({ label: '举报', onPress: () => reportMessage(item) });
    ActionSheetIOS.showActionSheetWithOptions(
      {
        title: isMine ? '我的消息' : '消息',
        message: text || (imageUrl ? '图片消息' : ''),
        options: [...actions.map((a) => a.label), '取消'],
        cancelButtonIndex: actions.length,
      },
      (idx) => {
        if (idx >= 0 && idx < actions.length) actions[idx].onPress();
      },
    );
  }, [myMid, recallMessage, copyText, copyImageUrl, reportMessage]);

  /* 气泡（renderItem memo：FlashList v2 按引用相等性跳过单元格重渲染） */
  const renderBubble = useCallback(
    ({ item, index }: { item: Msg; index: number }) => {
      const isMine = item.sender_uid === myMid;
      const prev = messages[index - 1]; // 上一索引是更早消息
      const showTime = !prev || item.timestamp - prev.timestamp > 300;
      return (
        <BubbleRow item={item} showTime={showTime} isMine={isMine} talkerFace={talkerFace} colors={colors} T={T} onLongPress={handleLongPress} />
      );
    },
    [colors, talkerFace, myMid, T, messages, handleLongPress],
  );

  /* renderItem memo：FlashList v2 按引用相等性跳过单元格重渲染 */
  const renderItem = useCallback(
    ({ item, index }: { item: Msg; index: number }) => renderBubble({ item, index }),
    [renderBubble],
  );

  const loadOlder = useCallback(() => {
    if (hasMore && !loading && !loadingOlder) loadMessages(true);
  }, [hasMore, loading, loadingOlder, loadMessages]);

  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]}>
      <Stack.Screen options={{ title: talkerName, headerShown: true, headerLargeTitle: false }} />
      {talkerName && <Stack.Title large>{talkerName}</Stack.Title>}
      <Stack.Header blurEffect="systemMaterial" style={{ shadowColor: 'transparent' }} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding" keyboardVerticalOffset={0}>
        {loading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator size="small" color={colors.textTertiary} />
          </View>
        ) : (
          /* 时间升序聊天列表：顶部最旧、底部最新，初始从底部渲染；
             onStartReached 在滚动到顶部时加载更早消息，
             maintainVisibleContentPosition 保持预加载时的可见位置 */
          <FlashList
            ref={listRef}
            data={messages}
            keyExtractor={(it) => String(it.msg_seqno)}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            maintainVisibleContentPosition={{
              startRenderingFromBottom: true,
              autoscrollToTopThreshold: 40,
              autoscrollToBottomThreshold: 0.1,
              animateAutoScrollToBottom: true,
            }}
            estimatedItemSize={160}
            drawDistance={250}
            overrideProps={{ initialDrawBatchSize: 10 }}
            onStartReached={loadOlder}
            onStartReachedThreshold={0.3}
            renderItem={renderItem}
            ListHeaderComponent={
              hasMore ? (
                <Press haptic scaleTo={0.96} onPress={loadOlder} style={styles.loadOlderBtn}>
                  {loadingOlder
                    ? <ActivityIndicator size="small" color={colors.textTertiary} />
                    : <Text style={[T.caption1, { color: colors.textSecondary }]}>加载更早消息</Text>}
                </Press>
              ) : null
            }
            ListEmptyComponent={
              <View style={styles.emptyWrap}>
                <Text style={[T.footnote, styles.emptyText, { color: colors.textTertiary }]}>暂无消息，发送第一条吧</Text>
              </View>
            }
          />
        )}

        {/* 输入栏（实心抬升表面：输入焦点区需清晰，不用玻璃）*/}
        <View style={[styles.inputBar, { backgroundColor: colors.card, borderTopColor: colors.separator, paddingBottom: insets.bottom + 8 }]}>
          <Press
            haptic
            scaleTo={0.9}
            disabled={sending || pickingImage}
            onPress={pickAndSendImage}
            style={[styles.imageBtn, { backgroundColor: colors.fill2 }]}>
            <Ionicons name="image-outline" size={21} color={sending || pickingImage ? colors.textTertiary : colors.textSecondary} />
          </Press>
          {/* 表情面板按钮（EmotePicker 由并行代理 N2 实现，此处按契约接线） */}
          <Press
            haptic
            scaleTo={0.9}
            disabled={sending}
            onPress={() => {
              Keyboard.dismiss();
              setShowEmote((v) => !v);
            }}
            style={[styles.imageBtn, { backgroundColor: showEmote ? colors.accent : colors.fill2 }]}>
            <Ionicons name="happy-outline" size={21} color={showEmote ? '#FFFFFF' : colors.textSecondary} />
          </Press>
          <View style={[styles.inputField, { backgroundColor: colors.fill2 }]}>
            <TextInput
              value={input}
              onChangeText={setInput}
              placeholder="发送消息…"
              placeholderTextColor={colors.textTertiary}
              style={[T.body, styles.textInput, { color: colors.text }]}
              multiline
              maxLength={500}
            />
          </View>
          <Press
            haptic
            scaleTo={0.9}
            disabled={!input.trim() || sending}
            onPress={sendMsg}
            style={[styles.sendBtn, { backgroundColor: input.trim() ? colors.accent : colors.fill2 }]}>
            <Ionicons name="arrow-up" size={20} color={input.trim() ? '#FFFFFF' : colors.textTertiary} />
          </Press>
        </View>
      </KeyboardAvoidingView>

      {/* 表情面板：onSelect 把 [xxx] 文本码拼进输入框（契约 EmotePicker({visible,onSelect(code),onClose})） */}
      <EmotePicker
        visible={showEmote}
        onSelect={(code) => setInput((v) => v + code)}
        onClose={() => setShowEmote(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  loadingWrap: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  listContent: { paddingHorizontal: 14, paddingVertical: 16 },
  /* 时间分隔 */
  timeDivider: { textAlign: 'center', marginVertical: 12 },
  /* 气泡行 */
  bubbleRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginBottom: 8 },
  bubbleRowMine: { justifyContent: 'flex-end' },
  bubbleRowTheir: { justifyContent: 'flex-start' },
  miniAvatar: { width: 28, height: 28, borderRadius: 14 },
  bubble: { maxWidth: '74%', paddingHorizontal: 14, paddingVertical: 9, borderRadius: RADII.lg, ...continuous },
  /* 尾巴角：同侧下角收小（iMessage 式，05-B15），另三角保持 RADII.lg */
  bubbleMine: { borderBottomRightRadius: 5, ...continuous },
  bubbleTheir: { borderBottomLeftRadius: 5, ...continuous },
  bubbleText: { lineHeight: 20.5 },
  imageBubble: { gap: 6, maxWidth: 210 },
  bubbleImage: { width: 210, height: 158, borderRadius: RADII.sm },
  imageFallback: { alignItems: 'center', gap: 4, paddingVertical: 4, minWidth: 96 },
  loadOlderBtn: { alignSelf: 'center', paddingVertical: 10, paddingHorizontal: 18, marginVertical: 8 },
  /* 空态 */
  emptyWrap: { alignItems: 'center', paddingTop: 60 },
  emptyText: {},
  /* 输入栏 */
  inputBar: { flexDirection: 'row', alignItems: 'flex-end', gap: 10, paddingHorizontal: 12, paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth },
  inputField: { flex: 1, borderRadius: RADII.lg, paddingHorizontal: 14, paddingVertical: 4, maxHeight: 100, justifyContent: 'center', ...continuous },
  /* 输入框字号跟随全局字阶（05-B15，原 fontSize 15 硬编码 → T.body） */
  textInput: { maxHeight: 92 },
  imageBtn: { width: 36, height: 36, borderRadius: RADII.circle, justifyContent: 'center', alignItems: 'center', marginBottom: 2, ...continuous },
  sendBtn: { width: 36, height: 36, borderRadius: RADII.circle, justifyContent: 'center', alignItems: 'center', marginBottom: 2, ...continuous },
});
