import { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, Switch, ScrollView, ActivityIndicator, Share } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Image as ExpoImage } from 'expo-image';
import * as Clipboard from 'expo-clipboard';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors, ACCENT } from '@/components/SwiftUIHost';
import { msgApi } from '@/api/msg';
import { useAuthStore } from '@/stores/auth';
import { Press, Reveal } from '@/components/motion';
import { useType } from '@/components/type-scale';
import { RADII, continuous, shadow } from '@/theme/tokens';
import { feedBackSuccess } from '@/utils/feedback';
import { showToast } from '@/utils/toast';
import { biliCover } from '@/utils/image-url';

export default function WhisperLinkSettingScreen() {
  const router = useRouter();
  const { uid } = useLocalSearchParams<{ uid?: string }>();
  const colors = useThemeColors();
  const T = useType();
  const { userInfo } = useAuthStore();
  const talkerId = parseInt(uid || '0', 10) || 0;
  const myMid = userInfo?.mid || 0;
  const sessionLink = talkerId > 0 ? `https://message.bilibili.com/#/whisper/${talkerId}` : '';

  const [name, setName] = useState('私信链接设置');
  const [face, setFace] = useState('');
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
        setName(acc.name || '私信链接设置');
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
        setIsMuted(dndRes?.data?.uid_settings?.[0]?.setting === 1);
      } catch {}
    }
    setLoading(false);
  }, [talkerId, myMid]);

  useEffect(() => {
    const t = setTimeout(() => { load(); }, 0);
    return () => clearTimeout(t);
  }, [load]);

  const runToggle = useCallback(async (action: () => Promise<any>, successText: string): Promise<boolean> => {
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

  const toggleMute = useCallback(() => {
    const next = !isMuted;
    runToggle(async () => msgApi.setMsgDnd({ uid: myMid, setting: next ? 1 : 0, dnd_uid: talkerId }), next ? '已开启免打扰' : '已关闭免打扰')
      .then((ok) => { if (ok) setIsMuted(next); });
  }, [isMuted, runToggle, myMid, talkerId]);

  const togglePush = useCallback(() => {
    const next = !pushEnabled;
    runToggle(async () => msgApi.setPushSs({ setting: next ? 0 : 1, talker_uid: talkerId }), next ? '已开启推送' : '已关闭推送')
      .then((ok) => { if (ok) setPushEnabled(next); });
  }, [pushEnabled, runToggle, talkerId]);

  const copyLink = useCallback(async () => {
    if (!sessionLink) return;
    await Clipboard.setStringAsync(sessionLink);
    feedBackSuccess();
    showToast('已复制会话链接');
  }, [sessionLink]);

  const shareLink = useCallback(() => {
    if (!sessionLink) return;
    Share.share({ message: sessionLink, title: '私信链接' }).catch(() => showToast('分享失败'));
  }, [sessionLink]);

  if (!talkerId) {
    return (
      <View style={[styles.root, { backgroundColor: colors.bg }]}>
        <Stack.Title large>私信链接设置</Stack.Title>
        <Stack.Header blurEffect="systemMaterial" style={{ shadowColor: 'transparent' }} />
        <View style={styles.emptyWrap}>
          <Text style={[T.headline, { color: colors.text }]}>缺少会话参数</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]}>
      <Stack.Title large>私信链接设置</Stack.Title>
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

        <Reveal delay={50} distance={10}>
          <View style={[styles.linkCard, { backgroundColor: colors.card, ...shadow('sm', colors.isDark) }]}>
            <Text style={[T.caption1, styles.linkLabel, { color: colors.textSecondary }]}>当前会话链接</Text>
            <Text style={[T.footnote, styles.linkText, { color: colors.text }]} numberOfLines={3} selectable>
              {sessionLink}
            </Text>
            <View style={styles.linkActions}>
              <Press haptic scaleTo={0.95} onPress={copyLink} style={[styles.linkBtn, { backgroundColor: colors.fill2 }]}>
                <Ionicons name="copy-outline" size={15} color={colors.text} />
                <Text style={[T.footnote, { color: colors.text, fontWeight: '600' }]}>复制</Text>
              </Press>
              <Press haptic scaleTo={0.95} onPress={shareLink} style={[styles.linkBtn, { backgroundColor: ACCENT }]}>
                <Ionicons name="share-outline" size={15} color="#FFFFFF" />
                <Text style={[T.footnote, { color: '#FFFFFF', fontWeight: '600' }]}>分享</Text>
              </Press>
            </View>
          </View>
        </Reveal>

        <Reveal delay={100} distance={10}>
          <View style={[styles.sectionCard, { backgroundColor: colors.card, ...shadow('sm', colors.isDark) }]}>
            {showPushSetting ? (
              <>
                <ToggleRow
                  icon="notifications-outline"
                  label="接收消息推送"
                  value={pushEnabled}
                  disabled={loading || busy}
                  onValueChange={togglePush}
                  colors={colors}
                  T={T}
                />
                <View style={[styles.divider, { backgroundColor: colors.separator }]} />
              </>
            ) : null}
            <ToggleRow
              icon="notifications-off-outline"
              label="消息免打扰"
              value={isMuted}
              disabled={loading || busy}
              onValueChange={toggleMute}
              colors={colors}
              T={T}
            />
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

function ToggleRow({
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
      <Switch
        value={value}
        disabled={disabled}
        onValueChange={onValueChange}
        trackColor={{ false: colors.fill3, true: ACCENT }}
        thumbColor="#FFFFFF"
      />
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
  linkCard: { borderRadius: RADII.lg, padding: 16, gap: 10, ...continuous },
  linkLabel: { fontWeight: '600' },
  linkText: { lineHeight: 20 },
  linkActions: { flexDirection: 'row', gap: 10, marginTop: 4 },
  linkBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingVertical: 9, borderRadius: RADII.circle, ...continuous },
  sectionCard: { borderRadius: RADII.lg, paddingHorizontal: 14, overflow: 'hidden', ...continuous },
  divider: { height: StyleSheet.hairlineWidth, marginLeft: 42 },
  actionRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13, minHeight: 52 },
  actionIcon: { width: 30, height: 30, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  actionLabel: { flex: 1, fontWeight: '500' },
  emptyWrap: { alignItems: 'center', paddingTop: 120 },
  loadingWrap: { position: 'absolute', top: 12, left: 0, right: 0, alignItems: 'center' },
});
