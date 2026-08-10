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
  Spacer,
  Image,
} from '@expo/ui/swift-ui';
import {
  disabled,
  pickerStyle,
  tag,
  tint,
  font,
  foregroundStyle,
  keyboardType,
  autocorrectionDisabled,
  onSubmit,
} from '@expo/ui/swift-ui/modifiers';
import { useSettingsStore } from '@/stores/settings';
import { showToast } from '@/utils/toast';

const DEFAULT_SPEED_LIST = [0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0, 3.0];

function speedIdx(list: number[], value: number): number {
  const i = list.indexOf(value);
  return i < 0 ? 0 : i;
}

export default function PlaySpeedSettingsScreen() {
  const s = useSettingsStore();
  const [input, setInput] = useState('');

  const addSpeed = () => {
    const value = Number(input.trim());
    if (!Number.isFinite(value) || value <= 0) {
      showToast('请输入有效倍速');
      return;
    }
    const rounded = Math.round(value * 100) / 100;
    if (s.speedList.includes(rounded)) {
      showToast('该倍速已存在');
      return;
    }
    s.set({ speedList: [...s.speedList, rounded].sort((a, b) => a - b) });
    setInput('');
  };

  const removeSpeed = (speed: number) => {
    if (speed === 1.0 || speed === s.defaultPlaySpeed || speed === s.longPressSpeedDefault) {
      showToast('不能删除默认倍速');
      return;
    }
    s.set({ speedList: s.speedList.filter((v) => v !== speed) });
  };

  const resetSpeeds = () => {
    s.set({
      speedList: DEFAULT_SPEED_LIST,
      defaultPlaySpeed: 1.0,
      longPressSpeedDefault: 3.0,
      enableAutoLongPressSpeed: true,
    });
    showToast('已重置');
  };

  const defaultIdx = speedIdx(s.speedList, s.defaultPlaySpeed);
  const longPressIdx = speedIdx(s.speedList, s.longPressSpeedDefault);

  return (
    <>
      <Stack.Title>倍速设置</Stack.Title>
      <Stack.Header blurEffect="systemMaterial" style={{ shadowColor: 'transparent' }} />
      <Host style={{ flex: 1 }} useViewportSizeMeasurement>
        <List modifiers={[tint('#FB7299')]}>
          <Section title="默认倍速">
            <Picker
              label="默认播放倍速"
              systemImage="gauge.with.dots.needle.67percent"
              selection={defaultIdx}
              onSelectionChange={(v) => {
                const i = Number(v);
                const speed = s.speedList[i] ?? 1.0;
                s.set({ defaultPlaySpeed: speed });
              }}
              modifiers={[pickerStyle('menu')]}>
              {s.speedList.map((sp, i) => (
                <Text key={sp} modifiers={[tag(i)]}>{`${sp}x`}</Text>
              ))}
            </Picker>
            <Toggle
              label="动态长按倍速"
              systemImage="hand.point.up.left"
              isOn={s.enableAutoLongPressSpeed}
              onIsOnChange={(v) => s.set({ enableAutoLongPressSpeed: v })}
            />
            <Picker
              label="默认长按倍速"
              systemImage="gauge.with.dots.needle.100percent"
              selection={longPressIdx}
              onSelectionChange={(v) => {
                const i = Number(v);
                const speed = s.speedList[i] ?? 3.0;
                s.set({ longPressSpeedDefault: speed });
              }}
              modifiers={[pickerStyle('menu'), disabled(s.enableAutoLongPressSpeed)]}>
              {s.speedList.map((sp, i) => (
                <Text key={sp} modifiers={[tag(i)]}>{`${sp}x`}</Text>
              ))}
            </Picker>
          </Section>

          <Section title="添加倍速">
            <HStack spacing={8}>
              <TextField
                placeholder="自定义倍速"
                onTextChange={setInput}
                modifiers={[
                  keyboardType('decimal-pad'),
                  autocorrectionDisabled(),
                  onSubmit(addSpeed),
                ]}
              />
              <Button label="添加" onPress={addSpeed} />
            </HStack>
          </Section>

          <Section title="倍速列表" footer={<Text modifiers={[font({ size: 12 })]}>默认倍速不可删除</Text>}>
            {s.speedList.map((sp) => (
              <HStack key={sp} spacing={12}>
                <Text modifiers={[font({ size: 16 })]}>{`${sp}x`}</Text>
                {sp === s.defaultPlaySpeed && (
                  <Text
                    modifiers={[
                      font({ size: 12 }),
                      foregroundStyle({ type: 'hierarchical', style: 'secondary' }),
                    ]}>
                    默认
                  </Text>
                )}
                {sp === s.longPressSpeedDefault && (
                  <Text
                    modifiers={[
                      font({ size: 12 }),
                      foregroundStyle({ type: 'hierarchical', style: 'secondary' }),
                    ]}>
                    长按
                  </Text>
                )}
                <Spacer />
                <Button onPress={() => removeSpeed(sp)}>
                  <Image systemName="trash" size={16} color="#FF3B30" />
                </Button>
              </HStack>
            ))}
          </Section>

          <Section>
            <Button role="destructive" label="重置倍速列表" onPress={resetSpeeds} />
          </Section>
        </List>
      </Host>
    </>
  );
}
