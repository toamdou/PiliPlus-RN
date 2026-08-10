import { useState } from 'react';
import { Stack } from 'expo-router';
import { Host } from '@/components/SwiftUIHost';
import {
  List,
  Section,
  Toggle,
  Picker,
  Text,
  TextField,
  Button,
  HStack,
} from '@expo/ui/swift-ui';
import {
  disabled,
  pickerStyle,
  tag,
  tint,
  font,
  keyboardType,
  autocorrectionDisabled,
  onSubmit,
} from '@expo/ui/swift-ui/modifiers';
import { useSettingsStore } from '@/stores/settings';
import { showToast } from '@/utils/toast';

const SPONSOR_CATEGORIES = [
  { key: 'sponsor', label: '赞助/恰饭' },
  { key: 'selfpromo', label: '自我推广' },
  { key: 'interaction', label: '互动提醒' },
  { key: 'intro', label: '开场动画' },
  { key: 'outro', label: '片尾' },
  { key: 'preview', label: '预览' },
  { key: 'filler', label: '离题内容' },
  { key: 'music_offtopic', label: '非音乐部分' },
  { key: 'exclusive_access', label: '抢先体验' },
  { key: 'poi_highlight', label: '精彩时刻' },
  { key: 'padding', label: '填充内容' },
] as const;

const SKIP_STRATEGIES = [
  { label: '总是跳过', value: 'alwaysSkip' },
  { label: '跳过一次', value: 'skipOnce' },
  { label: '手动跳过', value: 'skipManually' },
  { label: '仅显示', value: 'showOnly' },
  { label: '禁用', value: 'disable' },
] as const;

function strategyIdx(value: string): number {
  const i = SKIP_STRATEGIES.findIndex((item) => item.value === value);
  return i < 0 ? 1 : i;
}

export default function SponsorBlockSettingsScreen() {
  const s = useSettingsStore();
  const [server, setServer] = useState(s.sponsorBlockServer);

  const saveServer = () => {
    const next = server.trim();
    s.set({ sponsorBlockServer: next || 'https://www.bsbsb.top' });
    showToast('服务端已保存');
  };

  const toggleCategory = (key: string, enabled: boolean) => {
    s.set({
      sponsorBlockCategories: enabled
        ? [...s.sponsorBlockCategories, key]
        : s.sponsorBlockCategories.filter((k) => k !== key),
    });
  };

  const setStrategy = (key: string, value: string) => {
    s.set({ sponsorBlockSkipTypes: { ...s.sponsorBlockSkipTypes, [key]: value } });
  };

  const enabledCategories = SPONSOR_CATEGORIES.filter((cat) =>
    s.sponsorBlockCategories.includes(cat.key),
  );

  return (
    <>
      <Stack.Title>空降助手</Stack.Title>
      <Stack.Header blurEffect="systemMaterial" style={{ shadowColor: 'transparent' }} />
      <Host style={{ flex: 1 }} useViewportSizeMeasurement>
        <List modifiers={[tint('#FB7299')]}>
          <Section title="总开关">
            <Toggle
              label="启用空降助手"
              systemImage="shield.checkered"
              isOn={s.enableSponsorBlock}
              onIsOnChange={(v) => s.set({ enableSponsorBlock: v })}
            />
          </Section>

          <Section title="服务端">
            <HStack spacing={8}>
              <TextField
                placeholder="https://www.bsbsb.top"
                onTextChange={setServer}
                modifiers={[
                  keyboardType('url'),
                  autocorrectionDisabled(),
                  onSubmit(saveServer),
                ]}
              />
              <Button label="保存" onPress={saveServer} />
            </HStack>
            <Text modifiers={[font({ size: 12 })]}>当前：{s.sponsorBlockServer}</Text>
          </Section>

          <Section title="片段类型">
            {SPONSOR_CATEGORIES.map((cat) => {
              const enabled = s.sponsorBlockCategories.includes(cat.key);
              return (
                <Toggle
                  key={cat.key}
                  label={cat.label}
                  systemImage="checklist"
                  isOn={enabled}
                  onIsOnChange={(v) => toggleCategory(cat.key, v)}
                />
              );
            })}
          </Section>

          <Section title="跳过策略">
            {enabledCategories.length === 0 ? (
              <Text modifiers={[font({ size: 14 })]}>请先选择片段类型</Text>
            ) : (
              enabledCategories.map((cat) => (
                <Picker
                  key={cat.key}
                  label={cat.label}
                  selection={strategyIdx(s.sponsorBlockSkipTypes[cat.key])}
                  onSelectionChange={(v) => {
                    const i = Number(v);
                    setStrategy(cat.key, SKIP_STRATEGIES[i]?.value ?? 'skipOnce');
                  }}
                  modifiers={[pickerStyle('menu'), disabled(!s.enableSponsorBlock)]}>
                  {SKIP_STRATEGIES.map((item, i) => (
                    <Text key={item.value} modifiers={[tag(i)]}>{item.label}</Text>
                  ))}
                </Picker>
              ))
            )}
          </Section>
        </List>
      </Host>
    </>
  );
}
