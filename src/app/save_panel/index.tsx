import { View, Text, StyleSheet, Share } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { useThemeColors, ACCENT } from '@/components/SwiftUIHost';
import { useType } from '@/components/type-scale';
import { Press } from '@/components/motion';
import { showToast } from '@/utils/toast';

export default function SavePanelScreen() {
  const params = useLocalSearchParams<{ title?: string; url?: string }>();
  const colors = useThemeColors();
  const T = useType();
  const title = String(params.title || '分享内容');
  const url = String(params.url || '');

  const copy = async () => {
    await Clipboard.setStringAsync(url || title);
    showToast('已复制');
  };

  const share = async () => {
    try {
      await Share.share({ message: url ? `${title}\n${url}` : title });
    } catch {}
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]}>
      <Stack.Title large>保存与分享</Stack.Title>
      <Stack.Header blurEffect="systemMaterial" style={{ shadowColor: 'transparent' }} />
      <View style={[styles.card, { backgroundColor: colors.card }]}>
        <Text style={[T.headline, { color: colors.text, fontWeight: '600' }]} numberOfLines={3}>{title}</Text>
        {url ? <Text style={[T.footnote, { color: colors.textTertiary, marginTop: 8 }]} numberOfLines={2}>{url}</Text> : null}
        <View style={styles.actions}>
          <Press haptic scaleTo={0.94} onPress={copy} style={[styles.btn, { backgroundColor: colors.fill2 }]}>
            <Text style={[T.subhead, { color: colors.text }]}>复制</Text>
          </Press>
          <Press haptic scaleTo={0.94} onPress={share} style={[styles.btn, { backgroundColor: ACCENT }]}>
            <Text style={[T.subhead, styles.shareText]}>系统分享</Text>
          </Press>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  card: { margin: 14, borderRadius: 16, padding: 18, gap: 12 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 12 },
  btn: { flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: 14 },
  shareText: { color: '#FFFFFF', fontWeight: '600' },
});
