import { useState, useEffect } from 'react';
import { Stack, useRouter } from 'expo-router';
import { Host } from '@/components/SwiftUIHost';
import {
  List,
  Section,
  Button,
  Label,
  Toggle,
  Alert,
  Text,
} from '@expo/ui/swift-ui';
import { tint } from '@expo/ui/swift-ui/modifiers';
import { videoApi } from '@/api/video';
import { favApi } from '@/api/fav';
import { showToast } from '@/utils/toast';

export default function PrivacySettingsScreen() {
  const router = useRouter();
  const [historyPaused, setHistoryPaused] = useState(false);
  const [showAccountInfo, setShowAccountInfo] = useState(false);

  useEffect(() => {
    // 获取当前历史记录暂停状态
    videoApi.historyStatus().then((r) => {
      if (r?.code === 0) setHistoryPaused(r.data === 1);
    }).catch(() => {});
  }, []);

  const toggleHistory = async (v: boolean) => {
    try {
      const res = await favApi.pauseHistory({ switch: v });
      if (res?.code === 0) {
        setHistoryPaused(v);
        showToast(v ? '已暂停历史记录' : '已恢复历史记录');
      } else {
        showToast(res?.message || '操作失败');
      }
    } catch {
      showToast('操作失败');
    }
  };

  return (
    <>
      <Stack.Title>隐私设置</Stack.Title>
      <Stack.Header blurEffect="systemMaterial" style={{ shadowColor: 'transparent' }} />
      <Host style={{ flex: 1 }} useViewportSizeMeasurement>
        <List modifiers={[tint('#FB7299')]}>
          <Section title="历史记录">
            <Toggle
              label="暂停历史记录"
              systemImage="pause.circle"
              isOn={historyPaused}
              onIsOnChange={toggleHistory}
            />
          </Section>

          <Section title="黑名单">
            <Button onPress={() => router.push('/blacklist' as any)}>
              <Label title="黑名单管理" systemImage="hand.raised.fill" />
            </Button>
          </Section>

          <Section title="账号">
            <Button onPress={() => router.push('/login_devices' as any)}>
              <Label title="登录设备" systemImage="iphone" />
            </Button>
            <Button onPress={() => router.push('/login_log' as any)}>
              <Label title="登录记录" systemImage="clock" />
            </Button>
            <Button onPress={() => setShowAccountInfo(true)}>
              <Label title="了解账号模式" systemImage="info.circle" />
            </Button>
          </Section>
          <Alert
            title="账号模式"
            isPresented={showAccountInfo}
            onIsPresentedChange={setShowAccountInfo}>
            <Alert.Actions>
              <Button label="了解" />
            </Alert.Actions>
            <Alert.Message>
              <Text>Web端: 大部分接口&#10;App端: 推荐/热门等&#10;国际端: 部分视频接口</Text>
            </Alert.Message>
          </Alert>
        </List>
      </Host>
    </>
  );
}
