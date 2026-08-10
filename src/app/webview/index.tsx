import { useCallback } from 'react';
import { View, Text, StyleSheet, Share } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { PiliWebView } from 'pili-webview';
import * as Clipboard from 'expo-clipboard';
import * as Linking from 'expo-linking';
import { useThemeColors } from '@/components/SwiftUIHost';
import { useType } from '@/components/type-scale';
import { Press } from '@/components/motion';
import { openBiliLink } from '@/utils/feedback';
import { showToast } from '@/utils/toast';

export default function WebviewScreen() {
  const params = useLocalSearchParams<{ url: string; title?: string }>();
  const colors = useThemeColors();
  const T = useType();
  const url = String(params.url || 'about:blank');
  const title = String(params.title || '网页');

  const copy = useCallback(async () => {
    await Clipboard.setStringAsync(url);
    showToast('已复制链接');
  }, [url]);

  const share = useCallback(async () => {
    try {
      await Share.share({ message: `${title}\n${url}` });
    } catch {}
  }, [title, url]);

  const openExternal = useCallback(() => {
    Linking.openURL(url).catch(() => showToast('无法打开链接'));
  }, [url]);

  const handleLink = useCallback((event: { nativeEvent: { url: string } }) => {
    void openBiliLink(event.nativeEvent.url);
  }, []);

  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]}>
      <Stack.Title large>{title}</Stack.Title>
      <Stack.Header blurEffect="systemMaterial" style={{ shadowColor: 'transparent' }} />
      <View style={styles.toolbar}>
        <Press haptic scaleTo={0.92} onPress={copy} style={[styles.btn, { backgroundColor: colors.fill2 }]}>
          <Text style={[T.footnote, { color: colors.text }]}>复制</Text>
        </Press>
        <Press haptic scaleTo={0.92} onPress={share} style={[styles.btn, { backgroundColor: colors.fill2 }]}>
          <Text style={[T.footnote, { color: colors.text }]}>分享</Text>
        </Press>
        <Press haptic scaleTo={0.92} onPress={openExternal} style={[styles.btn, { backgroundColor: colors.fill2 }]}>
          <Text style={[T.footnote, { color: colors.text }]}>外开</Text>
        </Press>
      </View>
      <PiliWebView
        source={{ uri: url }}
        style={styles.web}
        onOpenInternalLink={handleLink}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  toolbar: { flexDirection: 'row', gap: 10, paddingHorizontal: 14, paddingVertical: 10 },
  btn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 14 },
  web: { flex: 1, marginTop: 8 },
});
