import { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, Alert } from 'react-native';
import { Stack, useRouter, useLocalSearchParams } from 'expo-router';
import { Image as ExpoImage } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors } from '@/components/SwiftUIHost';
import { IoSToggle } from '@/components/IoSToggle';
import { msgApi } from '@/api/msg';
import { useAuthStore } from '@/stores/auth';
import { Press, Reveal } from '@/components/motion';
import { useType } from '@/components/type-scale';
import { RADII, continuous, shadow } from '@/theme/tokens';
import { feedBackSuccess } from '@/utils/feedback';
import { showToast } from '@/utils/toast';
import { biliCover } from '@/utils/image-url';

export default function WhisperSettingsScreen() {
  const router = useRouter();
  const { uid } = useLocalSearchParams<{ uid: string }>();
  const colors = useThemeColors();
  const T = useType();
  const { userInfo } = useAuthStore();
  const talkerId = parseInt(uid || '0', 10) || 0;
  const myMid = userInfo?.mid || 0;

  const [name, setName] = useState('私信设置');
  const [face, setFace] = useState('');
  const [isPinned, setIsPinned] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [pushEnabled, setPushEnabled] = useState(true);
  const [showPushSetting, setShowPushSetting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!talkerId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const accRes = await msgApi.accountList({ uids: String(talkerId) });
      const acc = accRes?.data?.[0];
      if (acc) {
        setName(acc.name || '私信设置');
        setFace(acc.face || '');
      }
    } catch {}
    try {
      const ssRes = await msgApi.getSessionSs({ talker_uid: talkerId });
      const ss = ssRes?.data;
      if (ss) {
        setShowPushSetting(ss.show_push_setting === 1);
        setPushEnabled(ss.push_setting !== 1);
      }
    } catch {}
    if (myMid > 0) {
      try {
        const dndRes = await msgApi.getMsgDnd({ own_uid: myMid, uids_str: String(talkerId) });
        const setting = dndRes?.data?.uid_settings?.[0]?.setting;
        setIsMuted(setting === 1);
      } catch {}
    }
    try {
      const sessionsRes = await msgApi.sessions({ size: 100 });
      const found = (sessionsRes?.data?.session_list || []).find((s: any) => Number(s.talker_id) === talkerId);
      setIsPinned(found?.is_top === 1 || found?.is_pinned === true || (found?.top_time || 0) > 0);
    } catch {}
    setLoading(false);
  }, [talkerId, myMid]);

  useEffect(() => {
    const t = setTimeout(() => { load(); }, 0);
    return () => clearTimeout(t);
  }, [load]);

  const runAction = useCallback(async (action: () => Promise<any>, successText: string): Promise<boolean> => {
    if (busy) return false;
    setBusy(true);
    try {
      const res = await action();
      if (res?.code === 0 || res?.code === undefined) {
        feedBackSuccess();
        showToast(successText);
        return true;
      } else {
        showToast(res?.message || '操作失败');
        return false;
      }
    } catch {
      showToast('操作失败');
      return false;
    } finally {
      setBusy(false);
    }
  }, [busy]);

  const togglePin = useCallback(() => {
    const next = !isPinned;
    runAction(async () => msgApi.setTop({ talker_id: talkerId, op_type: next ? 1 : 0 }), next ? '已置顶' : '已取消置顶')
      .then((ok) => { if (ok) setIsPinned(next); });
  }, [isPinned, runAction, talkerId]);

  const toggleMute = useCallback(() => {
    const next = !isMuted;
    runAction(async () => msgApi.setMsgDnd({ uid: myMid, setting: next ? 1 : 0, dnd_uid: talkerId }), next ? '已开启免打扰' : '已关闭免打扰')
      .then((ok) => { if (ok) setIsMuted(next); });
  }, [isMuted, runAction, myMid, talkerId]);

  const togglePush = useCallback(() => {
    const next = !pushEnabled;
    runAction(async () => msgApi.setPushSs({ setting: next ? 0 : 1, talker_uid: talkerId }), next ? '已开启推送' : '已关闭推送')
      .then((ok) => { if (ok) setPushEnabled(next); });
  }, [pushEnabled, runAction, talkerId]);

  const markRead = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      const res = await msgApi.sessionMsg({ talker_id: talkerId, size: 1 });
      const first = res?.data?.messages?.[0];
      if (first?.msg_seqno) {
        await msgApi.ackSession({ talker_id: talkerId, ack_seqno: first.msg_seqno });
        feedBackSuccess();
        showToast('已标记为已读');
      }
    } catch {
      showToast('操作失败');
    } finally {
      setBusy(false);
    }
  }, [busy, talkerId]);

  const deleteSession = useCallback(() => {
    Alert.alert('删除会话', '删除后将清空该会话的本地记录，确定继续吗？', [
      { text: '取消', style: 'cancel' },
      {
        text: '删除',
        style: 'destructive',
        onPress: async () => {
          try {
            const res = await msgApi.removeSession({ talker_id: talkerId });
            if (res?.code === 0 || res?.code === undefined) {
              feedBackSuccess();
              showToast('已删除会话');
              router.back();
            } else {
              showToast(res?.message || '删除失败');
            }
          } catch {
            showToast('删除失败');
          }
        },
      },
    ]);
  }, [router, talkerId]);

  const goLinkSetting = useCallback(() => {
    router.push({ pathname: '/whisper_link_setting', params: { uid: String(talkerId) } } as any);
  }, [router, talkerId]);

  if (!talkerId) {
    return (
      <View style={[styles.root, { backgroundColor: colors.bg }]}>
        <Stack.Title large>会话设置</Stack.Title>
        <Stack.Header blurEffect="systemMaterial" style={{ shadowColor: 'transparent' }} />
        <View style={styles.emptyWrap}>
          <Text style={[T.headline, { color: colors.text }]}>缺少会话参数</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]}>
      <Stack.Title large>会话设置</Stack.Title>
      <Stack.Header blurEffect="systemMaterial" style={{ shadowColor: 'transparent' }} />
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <Reveal distance={10}>
          <View style={[styles.userCard, { backgroundColor: colors.card, ...shadow('md', colors.isDark) }]}>
            <ExpoImage source={{ uri: biliCover((face || ''), 96, 96) }} recyclingKey={face} cachePolicy="memory-disk" style={[styles.avatar, { backgroundColor: colors.fill2 }]} contentFit="cover" />
            <View style={styles.userInfo}>
              <Text style={[T.subhead, styles.userName, { color: colors.text }]} numberOfLines={1}>{name}</Text>
              <Text style={[T.caption1, { color: colors.textSecondary }]}>UID: {talkerId}</Text>
            </View>
            <Press haptic scaleTo={0.9} onPress={() => router.push(`/member/${talkerId}` as any)} style={[styles.iconBtn, { backgroundColor: colors.fill2 }]}>
              <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} />
            </Press>
          </View>
        </Reveal>

        <Reveal delay={60} distance={10}>
          <View style={[styles.sectionCard, { backgroundColor: colors.card, ...shadow('sm', colors.isDark) }]}>
            <SettingRow
              icon="pin-outline"
              label="置顶聊天"
              value={isPinned}
              disabled={loading || busy}
              onValueChange={togglePin}
              colors={colors}
              T={T}
            />
            <View style={[styles.divider, { backgroundColor: colors.separator }]} />
            <SettingRow
              icon="notifications-off-outline"
              label="消息免打扰"
              value={isMuted}
              disabled={loading || busy}
              onValueChange={toggleMute}
              colors={colors}
              T={T}
            />
            {showPushSetting ? (
              <>
                <View style={[styles.divider, { backgroundColor: colors.separator }]} />
                <SettingRow
                  icon="notifications-outline"
                  label="接收消息推送"
                  value={pushEnabled}
                  disabled={loading || busy}
                  onValueChange={togglePush}
                  colors={colors}
                  T={T}
                />
              </>
            ) : null}
            <View style={[styles.divider, { backgroundColor: colors.separator }]} />
            <Press haptic scaleTo={0.97} onPress={goLinkSetting} style={styles.actionRow}>
              <View style={[styles.actionIcon, { backgroundColor: colors.fill2 }]}>
                <Ionicons name="link-outline" size={17} color={colors.text} />
              </View>
              <Text style={[T.subhead, styles.actionLabel, { color: colors.text }]}>私信链接设置</Text>
              <Ionicons name="chevron-forward" size={16} color={colors.quaternaryLabel} />
            </Press>
          </View>
        </Reveal>

        <Reveal delay={120} distance={10}>
          <View style={[styles.sectionCard, { backgroundColor: colors.card, ...shadow('sm', colors.isDark) }]}>
            <Press haptic scaleTo={0.97} onPress={markRead} disabled={busy} style={styles.actionRow}>
              <View style={[styles.actionIcon, { backgroundColor: colors.fill2 }]}>
                <Ionicons name="checkmark-done-outline" size={17} color={colors.text} />
              </View>
              <Text style={[T.subhead, styles.actionLabel, { color: colors.text }]}>标记为已读</Text>
              {busy ? <ActivityIndicator size="small" color={colors.textTertiary} /> : null}
            </Press>
            <View style={[styles.divider, { backgroundColor: colors.separator }]} />
            <Press haptic scaleTo={0.97} onPress={deleteSession} style={styles.actionRow}>
              <View style={[styles.actionIcon, { backgroundColor: 'rgba(255,59,48,0.12)' }]}>
                <Ionicons name="trash-outline" size={17} color="#FF3B30" />
              </View>
              <Text style={[T.subhead, styles.actionLabel, { color: '#FF3B30' }]}>删除会话</Text>
            </Press>
          </View>
        </Reveal>
      </ScrollView>
      {loading && (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="small" color={colors.textTertiary} />
        </View>
      )}
    </View>
  );
}

function SettingRow({
  icon,
  label,
  value,
  disabled,
  onValueChange,
  colors,
  T,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: boolean;
  disabled: boolean;
  onValueChange: () => void;
  colors: ReturnType<typeof useThemeColors>;
  T: ReturnType<typeof useType>;
}) {
  return (
    <Press haptic scaleTo={0.97} onPress={disabled ? undefined : onValueChange} style={styles.actionRow}>
      <View style={[styles.actionIcon, { backgroundColor: colors.fill2 }]}>
        <Ionicons name={icon} size={17} color={colors.text} />
      </View>
      <Text style={[T.subhead, styles.actionLabel, { color: colors.text }]}>{label}</Text>
      <IoSToggle value={value} disabled={disabled} onValueChange={onValueChange} />
    </Press>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scrollContent: { padding: 14, gap: 14, paddingBottom: 50 },
  userCard: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: RADII.lg, ...continuous },
  avatar: { width: 52, height: 52, borderRadius: 26 },
  userInfo: { flex: 1, gap: 3 },
  userName: { fontWeight: '700' },
  iconBtn: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  sectionCard: { borderRadius: RADII.lg, paddingHorizontal: 14, overflow: 'hidden', ...continuous },
  divider: { height: StyleSheet.hairlineWidth, marginLeft: 42 },
  actionRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13, minHeight: 52 },
  actionIcon: { width: 30, height: 30, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  actionLabel: { flex: 1, fontWeight: '500' },
  emptyWrap: { alignItems: 'center', paddingTop: 120 },
  loadingWrap: { position: 'absolute', top: 12, left: 0, right: 0, alignItems: 'center' },
});
