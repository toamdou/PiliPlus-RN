import { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, Share } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Image as ExpoImage } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors, ACCENT } from '@/components/SwiftUIHost';
import { useType } from '@/components/type-scale';
import { Press } from '@/components/motion';
import { musicApi } from '@/api/music';
import { formatCount } from '@/utils/format';
import { biliCover } from '@/utils/image-url';

interface MusicDetail {
  title: string;
  cover: string;
  author: string;
  play: number;
  collect: number;
  comment: number;
  commentOid?: number;
  commentType?: number;
  intro?: string;
}

export default function MusicDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const colors = useThemeColors();
  const T = useType();
  const [detail, setDetail] = useState<MusicDetail | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await musicApi.bgmDetail({ id: String(id || '') });
      const d = res?.data?.detail || res?.data;
      if (d) {
        setDetail({
          title: d.title || d.song_title || '',
          cover: d.cover || d.pic || '',
          author: d.author || d.singer_name || '',
          play: d.statistic?.play ?? d.play ?? 0,
          collect: d.statistic?.collect ?? d.collect ?? 0,
          comment: d.statistic?.comment ?? d.comment ?? 0,
          commentOid: d.music_comment?.oid ?? d.comment_oid ?? 0,
          commentType: d.music_comment?.page_type ?? d.comment_type ?? 47,
          intro: d.intro || d.desc || '',
        });
      }
    } catch {
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    const t = setTimeout(load, 0);
    return () => clearTimeout(t);
  }, [load]);

  const share = async () => {
    try {
      await Share.share({ message: `${detail?.title || '音乐'} - ${detail?.author || ''}` });
    } catch {}
  };

  if (loading) {
    return (
      <View style={[styles.root, { backgroundColor: colors.bg }]}>
        <Stack.Title large>音乐详情</Stack.Title>
        <Stack.Header blurEffect="systemMaterial" style={{ shadowColor: 'transparent' }} />
      </View>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]}>
      <Stack.Title large>{detail?.title || '音乐详情'}</Stack.Title>
      <Stack.Header blurEffect="systemMaterial" style={{ shadowColor: 'transparent' }} />
      <ScrollView contentContainerStyle={styles.content}>
        {detail?.cover ? (
          <ExpoImage source={{ uri: biliCover(detail.cover, 400, 400) }} recyclingKey={detail.cover} cachePolicy="memory-disk" style={[styles.cover, { backgroundColor: colors.fill2 }]} contentFit="cover" />
        ) : null}
        <Text style={[T.headline, styles.title, { color: colors.text }]}>{detail?.title || '未找到音乐信息'}</Text>
        {detail?.author ? <Text style={[T.subhead, { color: colors.textSecondary }]}>{detail.author}</Text> : null}
        <View style={styles.stats}>
          <View style={styles.stat}><Ionicons name="play" size={14} color={colors.textTertiary} /><Text style={[T.caption1, { color: colors.textTertiary }]}>{formatCount(detail?.play ?? 0)}</Text></View>
          <View style={styles.stat}><Ionicons name="heart-outline" size={14} color={colors.textTertiary} /><Text style={[T.caption1, { color: colors.textTertiary }]}>{formatCount(detail?.collect ?? 0)}</Text></View>
          <View style={styles.stat}><Ionicons name="chatbubble-outline" size={14} color={colors.textTertiary} /><Text style={[T.caption1, { color: colors.textTertiary }]}>{formatCount(detail?.comment ?? 0)}</Text></View>
        </View>
        {detail?.intro ? <Text style={[T.footnote, styles.intro, { color: colors.textSecondary }]}>{detail.intro}</Text> : null}
        <View style={styles.actions}>
          <Press haptic scaleTo={0.94} onPress={() => router.push({ pathname: '/audio/[id]', params: { id: String(id) } } as any)} style={[styles.btn, { backgroundColor: ACCENT }]}>
            <Ionicons name="play" size={16} color="#FFFFFF" />
            <Text style={[T.subhead, styles.btnText]}>播放</Text>
          </Press>
          <Press haptic scaleTo={0.94} onPress={share} style={[styles.btn, { backgroundColor: colors.fill2 }]}>
            <Text style={[T.subhead, { color: colors.text }]}>分享</Text>
          </Press>
          <Press
            haptic
            scaleTo={0.94}
            onPress={() => router.push({ pathname: '/main_reply/[oid]', params: { oid: String(detail?.commentOid || id), type: String(detail?.commentType || 47), title: detail?.title || '评论' } } as any)}
            style={[styles.btn, { backgroundColor: colors.fill2 }]}>
            <Ionicons name="chatbubble-outline" size={16} color={colors.text} />
            <Text style={[T.subhead, { color: colors.text }]}>评论</Text>
          </Press>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: 20, alignItems: 'center', gap: 14 },
  cover: { width: 240, height: 240, borderRadius: 18 },
  title: { fontWeight: '700', textAlign: 'center' },
  stats: { flexDirection: 'row', gap: 18 },
  stat: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  intro: { textAlign: 'center', lineHeight: 20 },
  actions: { flexDirection: 'row', gap: 12, marginTop: 10 },
  btn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 20, paddingVertical: 11, borderRadius: 16 },
  btnText: { color: '#FFFFFF', fontWeight: '600' },
});
