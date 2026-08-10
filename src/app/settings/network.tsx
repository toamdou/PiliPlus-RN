import { useEffect, useState } from 'react';
import { Alert } from 'react-native';
import { Stack } from 'expo-router';
import { Host } from '@/components/SwiftUIHost';
import { SettingsPromptSheet } from '../../components/settings/SettingsPromptSheet';
import {
  List,
  Section,
  Toggle,
  Picker,
  Text,
  Button,
  Label,
} from '@expo/ui/swift-ui';
import { pickerStyle, tag, font, tint } from '@expo/ui/swift-ui/modifiers';
import { useSettingsStore } from '@/stores/settings';
import { Image } from 'expo-image';
import { showToast } from '@/utils/toast';
import { clearAppCaches } from '@/utils/clear-cache';

const RETRY_COUNTS = [0, 1, 2, 3, 4, 5, 6, 8];
const RETRY_DELAYS = [100, 200, 300, 500, 800, 1000];
const CACHE_SIZES = [128, 256, 512, 1024, 2048, 4096];

function idx<T>(arr: readonly T[], pred: (v: T) => boolean): number {
  const i = arr.findIndex(pred);
  return i < 0 ? 0 : i;
}

export default function NetworkSettingsScreen() {
  const s = useSettingsStore();
  const [prompt, setPrompt] = useState<'host' | 'port' | null>(null);

  const [retryCountIdx, setRetryCountIdx] = useState(() => idx(RETRY_COUNTS, (v) => v === s.retryCount));
  const [retryDelayIdx, setRetryDelayIdx] = useState(() => idx(RETRY_DELAYS, (v) => v === s.retryDelay));
  const [cacheSizeIdx, setCacheSizeIdx] = useState(() => idx(CACHE_SIZES, (v) => v === s.maxCacheSize));

  /* expo-image 提供运行时 configureCache；设置变化时立即更新磁盘上限，不再只依赖启动时配置 */
  useEffect(() => {
    Image.configureCache({ maxDiskSize: s.maxCacheSize * 1024 * 1024 });
  }, [s.maxCacheSize]);

  /* 清除缓存：图片磁盘/内存缓存 + 应用 cache 目录（对齐 Flutter clearCacheDir） */
  const clearCache = async () => {
    try {
      await clearAppCaches();
      showToast('已清除缓存');
    } catch (e) {
      console.error('clear cache error:', e);
      showToast('清除缓存失败');
    }
  };

  const handleClearCache = () => {
    Alert.alert('清除缓存', '将清除图片缓存和缓存目录，是否继续？', [
      { text: '取消', style: 'cancel' },
      { text: '清除', style: 'destructive', onPress: () => { void clearCache(); } },
    ]);
  };

  return (
    <>
      <Stack.Title>网络设置</Stack.Title>
      <Stack.Header blurEffect="systemMaterial" style={{ shadowColor: 'transparent' }} />
      <Host style={{ flex: 1 }} useViewportSizeMeasurement>
        <List modifiers={[tint('#FB7299')]}>
          <Section title="连接">
            <Toggle label="HTTP/1.1流水线（iOS原生）" systemImage="network" isOn={s.enableHttp2} onIsOnChange={(v) => s.set({ enableHttp2: v })} />
            <Toggle label="禁用SSL证书验证（iOS原生）" systemImage="lock.shield" isOn={s.badCertificateCallback} onIsOnChange={(v) => s.set({ badCertificateCallback: v })} />
            <Picker label="连接重试次数" systemImage="arrow.triangle.2.circlepath" selection={retryCountIdx}
              onSelectionChange={(v) => { const i = Number(v); setRetryCountIdx(i); s.set({ retryCount: RETRY_COUNTS[i] }); }}
              modifiers={[pickerStyle('menu')]}>
              {RETRY_COUNTS.map((r, i) => <Text key={r} modifiers={[tag(i)]}>{r === 0 ? '禁用' : `${r}次`}</Text>)}
            </Picker>
            <Picker label="连接重试间隔" systemImage="hourglass" selection={retryDelayIdx}
              onSelectionChange={(v) => { const i = Number(v); setRetryDelayIdx(i); s.set({ retryDelay: RETRY_DELAYS[i] }); }}
              modifiers={[pickerStyle('menu')]}>
              {RETRY_DELAYS.map((d, i) => <Text key={d} modifiers={[tag(i)]}>{`${d}ms`}</Text>)}
            </Picker>
          </Section>

          <Section title="代理" footer={<Text modifiers={[font({ size: 12 })]}>代理设置由 iOS 原生 URLSession 即时生效</Text>}>
            <Toggle label="启用代理" systemImage="airplane" isOn={s.enableSystemProxy} onIsOnChange={(v) => s.set({ enableSystemProxy: v })} />
            {s.enableSystemProxy && (
              <>
                <Button onPress={() => setPrompt('host')}>
                  <Label title={`代理Host: ${s.systemProxyHost || '未设置'}`} systemImage="network" />
                </Button>
                <Button onPress={() => setPrompt('port')}>
                  <Label title={`代理Port: ${s.systemProxyPort || '未设置'}`} systemImage="number.circle" />
                </Button>
              </>
            )}
          </Section>

          <Section title="缓存">
            <Picker label="最大缓存大小" systemImage="externaldrive" selection={cacheSizeIdx}
              onSelectionChange={(v) => { const i = Number(v); setCacheSizeIdx(i); s.set({ maxCacheSize: CACHE_SIZES[i] }); }}
              modifiers={[pickerStyle('menu')]}>
              {CACHE_SIZES.map((c, i) => <Text key={c} modifiers={[tag(i)]}>{c >= 1024 ? `${c / 1024}GB` : `${c}MB`}</Text>)}
            </Picker>
            <Button role="destructive" onPress={handleClearCache}>
              <Label title="清除缓存" systemImage="trash" />
            </Button>
          </Section>
        </List>
      </Host>
      <SettingsPromptSheet
        visible={prompt === 'host'}
        title="代理Host"
        message="输入代理服务器地址，留空使用默认"
        initialValue={s.systemProxyHost}
        onCancel={() => setPrompt(null)}
        onConfirm={(text) => { s.set({ systemProxyHost: text.trim() }); setPrompt(null); }}
      />
      <SettingsPromptSheet
        visible={prompt === 'port'}
        title="代理Port"
        message="输入代理服务器端口，留空使用默认"
        initialValue={s.systemProxyPort}
        onCancel={() => setPrompt(null)}
        onConfirm={(text) => { s.set({ systemProxyPort: text.trim() }); setPrompt(null); }}
      />
    </>
  );
}
