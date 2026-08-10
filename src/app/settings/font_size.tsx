import { useState } from 'react';
import { Stack } from 'expo-router';
import { Host } from '@/components/SwiftUIHost';
import { List, Section, Slider, Text, Button } from '@expo/ui/swift-ui';
import { tint, font, foregroundStyle } from '@expo/ui/swift-ui/modifiers';
import { useSettingsStore } from '@/stores/settings';

export default function FontSizeSettingsScreen() {
  const s = useSettingsStore();
  const [size, setSize] = useState(s.fontSize);

  const persist = () => {
    const next = Math.round(size * 2) / 2;
    setSize(next);
    s.set({ fontSize: next });
  };

  return (
    <>
      <Stack.Title>字体大小</Stack.Title>
      <Stack.Header blurEffect="systemMaterial" style={{ shadowColor: 'transparent' }} />
      <Host style={{ flex: 1 }} useViewportSizeMeasurement>
        <List modifiers={[tint('#FB7299')]}>
          <Section
            title="全局字体缩放"
            footer={
              <Text modifiers={[font({ size: 12 }), foregroundStyle({ type: 'hierarchical', style: 'secondary' })]}>
                当前 {size}px，默认 14px
              </Text>
            }>
            <Slider
              label="字体大小"
              value={size}
              min={12}
              max={20}
              step={0.5}
              onValueChange={setSize}
              onEditingChanged={(editing) => {
                if (!editing) persist();
              }}
            />
          </Section>
          <Section title="预览">
            <Text modifiers={[font({ size })]}>字号会随全局设置缩放</Text>
            <Text
              modifiers={[
                font({ size: size * 0.85, weight: 'semibold' }),
                foregroundStyle({ type: 'hierarchical', style: 'secondary' }),
              ]}>
              次要文字
            </Text>
          </Section>
          <Section>
            <Button
              label="重置为默认"
              onPress={() => {
                setSize(14);
                s.set({ fontSize: 14 });
              }}
            />
          </Section>
        </List>
      </Host>
    </>
  );
}
