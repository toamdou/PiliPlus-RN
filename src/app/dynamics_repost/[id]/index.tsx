import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Image as ExpoImage } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemeColors, ACCENT } from '@/components/SwiftUIHost';
import { Press } from '@/components/motion';
import { useType } from '@/components/type-scale';
import { dynamicsApi } from '@/api/dynamics';
import { useAuthStore } from '@/stores/auth';
import { LoginGate } from '@/components/LoginGate';
import { formatTime } from '@/utils/format';
import { showToast } from '@/utils/toast';
import { feedBackSuccess } from '@/utils/feedback';
import { RADII, continuous, shadow } from '@/theme/tokens';
import { biliCover } from '@/utils/image-url';

interface RepostSource {
  id_str: string;
  type?: string;
  modules?: {
    module_author?: { name?: string; face?: string; pub_ts?: number };
    module_dynamic?: {
      desc?: { text?: string };
      major?: {
        opus?: { title?: string; summary?: { text?: string }; pics?: { src?: string; url?: string }[] };
        draw?: { items?: { src?: string; url?: string }[] };
      };
    };
  };
}

const MAX_TEXT = 500;

export default function DynamicsRepostScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const T = useType();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const isLoggedIn = useAuthStore((s) => s.isLoggedIn);
  const [source, setSource] = useState<RepostSource | null>(null);
  const [loading, setLoading] = useState(true);
  const [sourceError, setSourceError] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [privatePub, setPrivatePub] = useState(0);
  const [publishing, setPublishing] = useState(false);
  const loadedRef = useRef(false);

  const loadSource = useCallback(async () => {
    if (!id || loadedRef.current) return;
    loadedRef.current = true;
    try {
      const res = await dynamicsApi.detail({ id });
      if (res?.data?.item) setSource(res.data.item);
      else setSourceError(res?.message || '动态加载失败');
    } catch (e) {
      console.error('load repost source error:', e);
      setSourceError('动态加载失败');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    const t = setTimeout(() => {
      void loadSource();
    }, 0);
    return () => clearTimeout(t);
  }, [loadSource]);

  const publish = useCallback(async () => {
    if (!id) return;
    if (!text.trim()) {
      showToast('请输入转发内容');
      return;
    }
    setPublishing(true);
    try {
      const res = await dynamicsApi.repost({
        dyn_id: id,
        content: text,
        private_pub: privatePub,
      });
      if (res?.code !== 0) {
        showToast(res?.message || '转发失败');
        return;
      }
      feedBackSuccess();
      showToast('转发成功');
      router.back();
    } catch (e) {
      console.error('repost dynamic error:', e);
      showToast('转发失败，请重试');
    } finally {
      setPublishing(false);
    }
  }, [id, text, privatePub, router]);

  if (!isLoggedIn) {
    return (
      <View style={[styles.root, { backgroundColor: colors.bg }]}>
        <Stack.Title large>转发动态</Stack.Title>
        <Stack.Header blurEffect="systemMaterial" style={{ shadowColor: 'transparent' }} />
        <LoginGate />
      </View>
    );
  }

  const author = source?.modules?.module_author;
  const major = source?.modules?.module_dynamic?.major;
  const desc = source?.modules?.module_dynamic?.desc?.text || major?.opus?.summary?.text || major?.opus?.title || '';
  const pic = major?.opus?.pics?.[0]?.src || major?.opus?.pics?.[0]?.url || major?.draw?.items?.[0]?.src || major?.draw?.items?.[0]?.url || '';

  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]}>
      <Stack.Title large>转发动态</Stack.Title>
      <Stack.Header blurEffect="systemMaterial" style={{ shadowColor: 'transparent' }} />
      <ScrollView
        style={styles.content}
        contentContainerStyle={{ paddingBottom: insets.bottom + 96 }}
        keyboardShouldPersistTaps="handled">
        {loading ? (
          <ActivityIndicator size="small" color={colors.textTertiary} style={styles.loading} />
        ) : sourceError && !source ? (
          <View style={[styles.sourceCard, { backgroundColor: colors.card, ...shadow('sm', colors.isDark) }]}>
            <Ionicons name="alert-circle-outline" size={18} color={colors.textTertiary} />
            <Text style={[T.footnote, styles.sourceError, { color: colors.textSecondary }]}>{sourceError}</Text>
          </View>
        ) : source ? (
          <View style={[styles.sourceCard, { backgroundColor: colors.card, ...shadow('sm', colors.isDark) }]}>
            <View style={styles.sourceHead}>
              <ExpoImage
                source={{ uri: biliCover((author?.face || ''), 64, 64) }}
                recyclingKey={author?.face || ''}
                cachePolicy="memory-disk"
                style={[styles.sourceAvatar, { backgroundColor: colors.fill2 }]}
                contentFit="cover"
              />
              <View style={styles.sourceInfo}>
                <Text style={[T.subhead, { color: colors.text }]} numberOfLines={1}>{author?.name || '动态作者'}</Text>
                <Text style={[T.caption2, { color: colors.textTertiary }]}>{formatTime(author?.pub_ts || 0)}</Text>
              </View>
            </View>
            {desc ? (
              <Text style={[T.footnote, styles.sourceDesc, { color: colors.textSecondary }]} numberOfLines={4}>{desc}</Text>
            ) : null}
            {pic ? (
              <ExpoImage
                source={{ uri: biliCover(pic, 240, 150) }}
                recyclingKey={pic}
                cachePolicy="memory-disk"
                style={[styles.sourcePic, { backgroundColor: colors.fill2 }]}
                contentFit="cover"
              />
            ) : null}
          </View>
        ) : null}

        <TextInput
          style={[styles.textInput, T.body, { color: colors.text }]}
          placeholder="说说转发理由..."
          placeholderTextColor={colors.textTertiary}
          multiline
          maxLength={MAX_TEXT}
          value={text}
          onChangeText={setText}
          autoFocus
        />
        <Text style={[T.caption2, styles.counter, { color: colors.textTertiary }]}>{text.length}/{MAX_TEXT}</Text>

        <Text style={[T.caption1, styles.sectionLabel, { color: colors.textTertiary }]}>公开范围</Text>
        <View style={[styles.segmented, { backgroundColor: colors.fill3 }]}>
          {[
            { value: 0, label: '所有人可见', icon: 'globe-outline' as const },
            { value: 1, label: '仅自己可见', icon: 'lock-closed-outline' as const },
          ].map((opt) => {
            const active = privatePub === opt.value;
            return (
              <Press
                key={opt.value}
                haptic
                scaleTo={0.96}
                onPress={() => setPrivatePub(opt.value)}
                style={[styles.segItem, active && styles.segItemActive]}>
                <Ionicons name={opt.icon} size={14} color={active ? '#FFFFFF' : colors.textSecondary} />
                <Text style={[T.caption1, { color: active ? '#FFFFFF' : colors.textSecondary, fontWeight: active ? '600' : '400' }]}>
                  {opt.label}
                </Text>
              </Press>
            );
          })}
        </View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
        <Press
          haptic
          scaleTo={0.95}
          disabled={publishing}
          onPress={publish}
          style={[styles.publishBtn, { opacity: publishing ? 0.6 : 1 }]}>
          {publishing ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <>
              <Ionicons name="arrow-redo" size={16} color="#FFFFFF" />
              <Text style={styles.publishText}>转发</Text>
            </>
          )}
        </Press>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { flex: 1, paddingHorizontal: 16, paddingTop: 12 },
  loading: { marginTop: 40 },
  sourceCard: {
    borderRadius: RADII.card,
    padding: 14,
    gap: 10,
    ...continuous,
  },
  sourceHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  sourceAvatar: { width: 38, height: 38, borderRadius: 19 },
  sourceInfo: { flex: 1, gap: 2 },
  sourceDesc: { lineHeight: 19 },
  sourcePic: { width: '100%', height: 150, borderRadius: RADII.md, ...continuous },
  sourceError: { flex: 1 },
  textInput: { minHeight: 120, textAlignVertical: 'top', marginTop: 16 },
  counter: { textAlign: 'right', marginTop: 4 },
  sectionLabel: { marginTop: 18, marginBottom: 8, fontWeight: '600' },
  segmented: {
    flexDirection: 'row',
    borderRadius: RADII.lg,
    padding: 3,
    gap: 3,
    ...continuous,
  },
  segItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 9,
    borderRadius: RADII.md,
  },
  segItemActive: { backgroundColor: ACCENT },
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 16 },
  publishBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: ACCENT,
    borderRadius: RADII.md,
    paddingVertical: 12,
    ...continuous,
  },
  publishText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
});
