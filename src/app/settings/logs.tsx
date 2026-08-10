import { useEffect, useState } from 'react';
import { Stack } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { Host } from '@/components/SwiftUIHost';
import {
  List,
  Section,
  Button,
  Text,
  VStack,
} from '@expo/ui/swift-ui';
import {
  tint,
  font,
  foregroundStyle,
} from '@expo/ui/swift-ui/modifiers';
import { getLogs, clearLogs as clearNativeLogs } from 'pili-native-core';
import { showToast } from '@/utils/toast';

export default function LogsScreen() {
  const [logs, setLogs] = useState<string[]>([]);

  useEffect(() => {
    getLogs().then(setLogs).catch(() => {});
  }, []);

  const copyLogs = async () => {
    await Clipboard.setStringAsync(logs.length > 0 ? logs.join('\n') : '（暂无日志）');
    showToast('已复制');
  };

  const clearLogs = async () => {
    await clearNativeLogs();
    setLogs([]);
    showToast('已清空');
  };

  return (
    <>
      <Stack.Title>应用日志</Stack.Title>
      <Stack.Header blurEffect="systemMaterial" style={{ shadowColor: 'transparent' }} />
      <Host style={{ flex: 1 }} useViewportSizeMeasurement>
        <List modifiers={[tint('#FB7299')]}>
          <Section title="日志">
            {logs.length > 0 ? (
              logs.map((line, index) => (
                <Text key={`${index}-${line.slice(0, 12)}`} modifiers={[font({ design: 'monospaced', size: 13 })]}>
                  {line}
                </Text>
              ))
            ) : (
              <VStack spacing={6}>
                <Text modifiers={[font({ size: 15, weight: 'semibold' })]}>暂无日志</Text>
                <Text
                  modifiers={[
                    font({ size: 13 }),
                    foregroundStyle({ type: 'hierarchical', style: 'secondary' }),
                  ]}>
                  当前暂无日志
                </Text>
              </VStack>
            )}
          </Section>
          <Section title="操作">
            <Button label="复制日志" systemImage="doc.on.doc" onPress={copyLogs} />
            <Button label="清空日志" systemImage="trash" role="destructive" onPress={clearLogs} />
          </Section>
        </List>
      </Host>
    </>
  );
}
