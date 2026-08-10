import { View, Text, StyleSheet } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useThemeColors, ACCENT } from '@/components/SwiftUIHost';
import { useType } from '@/components/type-scale';
import { Press } from '@/components/motion';

export default function ArticleScreen() {
  const params = useLocalSearchParams<{ id: string; title?: string }>();
  const router = useRouter();
  const colors = useThemeColors();
  const T = useType();
  const id = String(params.id || '');
  const url = /^https?:/.test(id) ? id : `https://www.bilibili.com/read/cv${id}`;
  const title = String(params.title || '专栏文章');

  const openInApp = () => {
    router.push({ pathname: '/webview', params: { url, title } } as any);
  };

  const openSavePanel = () => {
    router.push({ pathname: '/save_panel', params: { title, url } } as any);
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]}>
      <Stack.Title large>{title}</Stack.Title>
      <Stack.Header blurEffect="systemMaterial" style={{ shadowColor: 'transparent' }} />
      <View style={[styles.card, { backgroundColor: colors.card }]}>
        <Text style={[T.headline, styles.title, { color: colors.text }]}>{title}</Text>
        <Text style={[T.footnote, styles.desc, { color: colors.textSecondary }]}>
          使用应用内 WebView 阅读原文，也可将链接保存或分享到其它应用。
        </Text>
        <View style={styles.actions}>
          <Press haptic scaleTo={0.94} onPress={openInApp} style={[styles.btn, { backgroundColor: ACCENT }]}>
            <Text style={[T.subhead, styles.btnText]}>应用内打开</Text>
          </Press>
          <Press haptic scaleTo={0.94} onPress={openSavePanel} style={[styles.btn, { backgroundColor: colors.fill2 }]}>
            <Text style={[T.subhead, { color: colors.text }]}>保存/分享</Text>
          </Press>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  card: { margin: 14, borderRadius: 16, padding: 18, gap: 12 },
  title: { fontWeight: '700' },
  desc: { lineHeight: 20 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 8 },
  btn: { paddingHorizontal: 18, paddingVertical: 10, borderRadius: 14 },
  btnText: { color: '#FFFFFF', fontWeight: '600' },
});
