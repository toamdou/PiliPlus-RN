import { useState } from 'react';
import { Stack, useRouter } from 'expo-router';
import { Host } from '@/components/SwiftUIHost';
import {
  List,
  Section,
  Toggle,
  Picker,
  Text,
  Button,
  Label,
} from '@expo/ui/swift-ui';
import { pickerStyle, tag, tint } from '@expo/ui/swift-ui/modifiers';
import { useSettingsStore } from '@/stores/settings';

const DM_OPACITIES = [0.3, 0.5, 0.7, 0.9, 1];
const DM_FONT_SIZES = [12, 14, 15, 16, 18, 20];
const DM_SPEEDS = [5, 8, 10, 12, 15];
const DM_LINE_HEIGHTS = [1.2, 1.4, 1.6, 1.8, 2.0];

function idx<T>(arr: readonly T[], pred: (v: T) => boolean): number {
  const i = arr.findIndex(pred);
  return i < 0 ? 0 : i;
}

export default function DanmakuSettingsScreen() {
  const s = useSettingsStore();
  const router = useRouter();

  const [dmOpIdx, setDmOpIdx] = useState(() => idx(DM_OPACITIES, (v) => v === s.danmakuOpacity));
  const [dmFontIdx, setDmFontIdx] = useState(() => idx(DM_FONT_SIZES, (v) => v === s.danmakuFontSize));
  const [dmSpeedIdx, setDmSpeedIdx] = useState(() => idx(DM_SPEEDS, (v) => v === s.danmakuSpeed));
  const [dmLhIdx, setDmLhIdx] = useState(() => idx(DM_LINE_HEIGHTS, (v) => v === s.danmakuLineHeight));

  return (
    <>
      <Stack.Title>弹幕设置</Stack.Title>
      <Stack.Header blurEffect="systemMaterial" style={{ shadowColor: 'transparent' }} />
      <Host style={{ flex: 1 }} useViewportSizeMeasurement>
        <List modifiers={[tint('#FB7299')]}>
          <Section title="弹幕显示">
            <Toggle label="显示弹幕" systemImage="text.bubble" isOn={s.danmakuEnabled} onIsOnChange={(v) => s.set({ danmakuEnabled: v })} />
            <Toggle label="启用点击弹幕" systemImage="hand.point.up.left" isOn={s.enableTapDm} onIsOnChange={(v) => s.set({ enableTapDm: v })} />
            <Toggle label="显示会员彩色弹幕" systemImage="rainbow" isOn={s.showVipDanmaku} onIsOnChange={(v) => s.set({ showVipDanmaku: v })} />
            <Toggle label="合并弹幕" systemImage="arrow.triangle.merge" isOn={s.mergeDanmaku} onIsOnChange={(v) => s.set({ mergeDanmaku: v })} />
            <Toggle label="显示高能进度条" systemImage="chart.line.uptrend.xyaxis" isOn={s.showDmChart} onIsOnChange={(v) => s.set({ showDmChart: v })} />
          </Section>

          <Section title="弹幕样式">
            <Picker label="弹幕透明度" systemImage="circle.lefthalf.filled" selection={dmOpIdx}
              onSelectionChange={(v) => { const i = Number(v); setDmOpIdx(i); s.set({ danmakuOpacity: DM_OPACITIES[i] }); }}
              modifiers={[pickerStyle('menu')]}>
              {DM_OPACITIES.map((o, i) => <Text key={o} modifiers={[tag(i)]}>{`${Math.round(o * 100)}%`}</Text>)}
            </Picker>
            <Picker label="弹幕字号" systemImage="textformat" selection={dmFontIdx}
              onSelectionChange={(v) => { const i = Number(v); setDmFontIdx(i); s.set({ danmakuFontSize: DM_FONT_SIZES[i] }); }}
              modifiers={[pickerStyle('menu')]}>
              {DM_FONT_SIZES.map((v2, i) => <Text key={v2} modifiers={[tag(i)]}>{`${v2}`}</Text>)}
            </Picker>
            <Picker label="弹幕速度" systemImage="gauge.with.dots.needle.50percent" selection={dmSpeedIdx}
              onSelectionChange={(v) => { const i = Number(v); setDmSpeedIdx(i); s.set({ danmakuSpeed: DM_SPEEDS[i] }); }}
              modifiers={[pickerStyle('menu')]}>
              {DM_SPEEDS.map((sp, i) => <Text key={sp} modifiers={[tag(i)]}>{`${sp}s`}</Text>)}
            </Picker>
            <Picker label="弹幕行高" systemImage="line.3.horizontal" selection={dmLhIdx}
              onSelectionChange={(v) => { const i = Number(v); setDmLhIdx(i); s.set({ danmakuLineHeight: DM_LINE_HEIGHTS[i] }); }}
              modifiers={[pickerStyle('menu')]}>
              {DM_LINE_HEIGHTS.map((h, i) => <Text key={h} modifiers={[tag(i)]}>{`${h}`}</Text>)}
            </Picker>
          </Section>

          <Section>
            <Button onPress={() => router.push('/danmaku_block' as any)}>
              <Label title="弹幕屏蔽管理" systemImage="hand.raised.slash" />
            </Button>
          </Section>
        </List>
      </Host>
    </>
  );
}
