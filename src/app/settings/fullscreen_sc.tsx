import { useState } from 'react';
import { Stack } from 'expo-router';
import { Host } from '@/components/SwiftUIHost';
import { List, Section, Slider, Text, Button } from '@expo/ui/swift-ui';
import { tint, font, foregroundStyle } from '@expo/ui/swift-ui/modifiers';
import { useSettingsStore } from '@/stores/settings';

export default function FullscreenScSettingsScreen() {
  const s = useSettingsStore();
  const [scale, setScale] = useState(s.fullScreenScScale);

  return (
    <>
      <Stack.Title>全屏 SC 大小</Stack.Title>
      <Stack.Header blurEffect="systemMaterial" style={{ shadowColor: 'transparent' }} />
      <Host style={{ flex: 1 }} useViewportSizeMeasurement>
        <List modifiers={[tint('#FB7299')]}>
          <Section
            title="SuperChat 宽度"
            footer={
              <Text modifiers={[font({ size: 12 }), foregroundStyle({ type: 'hierarchical', style: 'secondary' })]}>
                当前 {scale}%
              </Text>
            }>
            <Slider
              label="全屏 SC 大小"
              value={scale}
              min={50}
              max={200}
              step={5}
              onValueChange={setScale}
              onEditingChanged={(editing) => {
                if (!editing) s.set({ fullScreenScScale: scale });
              }}
            />
          </Section>
          <Section>
            <Button
              label="重置"
              onPress={() => {
                setScale(100);
                s.set({ fullScreenScScale: 100 });
              }}
            />
          </Section>
        </List>
      </Host>
    </>
  );
}
