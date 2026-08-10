import { useCallback, useEffect, useState } from 'react';
import { Stack, useRouter } from 'expo-router';
import { Host } from '@/components/SwiftUIHost';
import {
  List,
  Section,
  Toggle,
  Button,
  Text,
  VStack,
  ProgressView,
} from '@expo/ui/swift-ui';
import {
  tint,
  font,
  foregroundStyle,
} from '@expo/ui/swift-ui/modifiers';
import { userApi, type SpaceSettingModel } from '@/api/user';
import { useAuthStore } from '@/stores/auth';
import { showToast } from '@/utils/toast';

const SECTION_TITLES = ['公开内容', '身份与勋章', '投稿列表'];

export default function SpaceSettingScreen() {
  const router = useRouter();
  const { isLoggedIn, userInfo } = useAuthStore();
  const [sections, setSections] = useState<SpaceSettingModel[][]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!isLoggedIn || !userInfo) return;
    setLoading(true);
    setError('');
    try {
      const res = await userApi.spaceSetting({ mid: userInfo.mid });
      if (res?.code !== 0 || !res.data?.privacy) {
        setError(res?.message || '获取空间设置失败');
        return;
      }
      setSections([res.data.privacy.list1, res.data.privacy.list2, res.data.privacy.list3]);
    } catch {
      setError('网络错误');
    } finally {
      setLoading(false);
    }
  }, [isLoggedIn, userInfo]);

  useEffect(() => {
    if (!isLoggedIn || !userInfo) return;
    const t = setTimeout(() => { void load(); }, 0);
    return () => clearTimeout(t);
  }, [isLoggedIn, userInfo, load]);

  const updateItem = async (sectionIdx: number, itemIdx: number, on: boolean) => {
    const item = sections[sectionIdx]?.[itemIdx];
    if (!item) return;
    const oldValue = item.value;
    const nextValue = item.isReverse ? (on ? 0 : 1) : (on ? 1 : 0);
    setSections((prev) =>
      prev.map((section, si) =>
        section.map((it, ii) =>
          si === sectionIdx && ii === itemIdx ? { ...it, value: nextValue } : it,
        ),
      ),
    );
    try {
      const res = await userApi.spaceSettingMod({ [item.key]: nextValue });
      if (res?.code !== 0) {
        setSections((prev) =>
          prev.map((section, si) =>
            section.map((it, ii) =>
              si === sectionIdx && ii === itemIdx ? { ...it, value: oldValue } : it,
            ),
          ),
        );
        showToast(res?.message || '保存失败');
      } else {
        showToast('已保存');
      }
    } catch {
      setSections((prev) =>
        prev.map((section, si) =>
          section.map((it, ii) =>
            si === sectionIdx && ii === itemIdx ? { ...it, value: oldValue } : it,
          ),
        ),
      );
      showToast('保存失败');
    }
  };

  return (
    <>
      <Stack.Title>空间设置</Stack.Title>
      <Stack.Header blurEffect="systemMaterial" style={{ shadowColor: 'transparent' }} />
      <Host style={{ flex: 1 }} useViewportSizeMeasurement>
        <List modifiers={[tint('#FB7299')]}>
          {!isLoggedIn ? (
            <Section title="空间隐私">
              <VStack spacing={8}>
                <Text modifiers={[font({ size: 15 })]}>需要登录后查看空间隐私设置</Text>
                <Button label="去登录" onPress={() => router.push('/login' as any)} />
              </VStack>
            </Section>
          ) : loading ? (
            <Section>
              <ProgressView />
            </Section>
          ) : error ? (
            <Section title="空间隐私">
              <VStack spacing={8}>
                <Text
                  modifiers={[
                    font({ size: 14 }),
                    foregroundStyle({ type: 'hierarchical', style: 'secondary' }),
                  ]}>
                  {error}
                </Text>
                <Button label="重试" onPress={load} />
              </VStack>
            </Section>
          ) : sections.length === 0 ? (
            <Section>
              <Text modifiers={[font({ size: 15 })]}>暂无可用设置</Text>
            </Section>
          ) : (
            sections.map((section, sectionIdx) => (
              <Section key={SECTION_TITLES[sectionIdx] ?? `section-${sectionIdx}`} title={SECTION_TITLES[sectionIdx]}>
                {section.map((item, itemIdx) => (
                  <Toggle
                    key={item.key}
                    label={item.name}
                    isOn={item.isReverse ? item.value === 0 : item.value === 1}
                    onIsOnChange={(v) => void updateItem(sectionIdx, itemIdx, v)}
                  />
                ))}
              </Section>
            ))
          )}
        </List>
      </Host>
    </>
  );
}
