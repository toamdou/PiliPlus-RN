import { useCallback, useEffect, useState } from 'react';
import { Stack, useRouter } from 'expo-router';
import Constants from 'expo-constants';
import * as Clipboard from 'expo-clipboard';
import { Host } from '@/components/SwiftUIHost';
import {
  List,
  Section,
  Button,
  Label,
  Text,
  VStack,
} from '@expo/ui/swift-ui';
import {
  tint,
  font,
  foregroundStyle,
} from '@expo/ui/swift-ui/modifiers';
import { formatFileSize } from '@/utils/format';
import { showToast } from '@/utils/toast';
import { openLink } from '@/utils/feedback';
import { clearAppCaches } from '@/utils/clear-cache';
import { getCacheSizeBytes } from 'pili-native-core';

const SOURCE_URL = 'https://github.com/bggRGjQaUbCoE/PiliPlus';
const SDK_LINE = 'Expo SDK 57 · React Native 0.86 · React 19.2';

export default function AboutScreen() {
  const router = useRouter();
  const version = Constants.expoConfig?.version || '1.0.0';
  const nativeVersion = Constants.nativeApplicationVersion || '';
  const buildVersion = Constants.nativeBuildVersion || '';
  const [cacheSize, setCacheSize] = useState(0);

  const refreshCacheSize = useCallback(async () => {
    try {
      setCacheSize(await getCacheSizeBytes());
    } catch {
      setCacheSize(0);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => void refreshCacheSize(), 0);
    return () => clearTimeout(timer);
  }, [refreshCacheSize]);

  const handleClearCache = useCallback(async () => {
    try {
      await clearAppCaches();
      await refreshCacheSize();
      showToast('已清除缓存');
    } catch (e) {
      console.error('clear cache error:', e);
      showToast('清除缓存失败');
    }
  }, [refreshCacheSize]);

  const copyVersion = useCallback(async () => {
    const lines = [
      `PiliPlus RN ${version}`,
      `Native ${[nativeVersion, buildVersion].filter(Boolean).join(' / ') || 'dev build'}`,
      SDK_LINE,
    ];
    await Clipboard.setStringAsync(lines.join('\n'));
    showToast('已复制版本信息');
  }, [buildVersion, nativeVersion, version]);

  return (
    <>
      <Stack.Screen options={{ title: '关于', headerBackButtonDisplayMode: 'minimal' }} />
      <Stack.Header blurEffect="systemMaterial" style={{ shadowColor: 'transparent' }} />
      <Host style={{ flex: 1 }} useViewportSizeMeasurement>
        <List modifiers={[tint('#FB7299')]}>
          <Section>
            <VStack spacing={8} modifiers={[]}>
              <Text modifiers={[font({ size: 22, weight: 'bold' })]}>PiliPlus</Text>
              <Text
                modifiers={[
                  font({ size: 13 }),
                  foregroundStyle({ type: 'hierarchical', style: 'secondary' }),
                ]}>
                Bilibili 第三方客户端 · React Native 版
              </Text>
            </VStack>
          </Section>

          <Section title="构建信息">
            <Button onPress={copyVersion}>
              <Label title={`当前版本 ${version}`} systemImage="info.circle" />
            </Button>
            <Button onPress={copyVersion}>
              <Label
                title={[nativeVersion, buildVersion].filter(Boolean).join(' / ') || '开发构建'}
                systemImage="hammer"
              />
            </Button>
            <Button onPress={copyVersion}>
              <Label title={SDK_LINE} systemImage="cpu" />
            </Button>
          </Section>

          <Section title="存储">
            <Button role="destructive" onPress={handleClearCache}>
              <Label title={`清除缓存${cacheSize > 0 ? ` ${formatFileSize(cacheSize)}` : ''}`} systemImage="trash" />
            </Button>
          </Section>

          <Section title="更多">
            <Button onPress={() => router.push('/settings/logs' as any)}>
              <Label title="应用日志" systemImage="doc.text" />
            </Button>
            <Button onPress={() => openLink(SOURCE_URL)}>
              <Label title="源代码" systemImage="chevron.left.forwardslash.chevron.right" />
            </Button>
            <Button onPress={() => openLink(`${SOURCE_URL}/issues`)}>
              <Label title="问题反馈" systemImage="exclamationmark.bubble" />
            </Button>
          </Section>
        </List>
      </Host>
    </>
  );
}
