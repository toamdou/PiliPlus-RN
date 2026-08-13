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
import { disabled, pickerStyle, tag, tint } from '@expo/ui/swift-ui/modifiers';
import { useSettingsStore } from '@/stores/settings';

const DM_OPACITIES = [0.3, 0.5, 0.7, 0.9, 1];
const DM_FONT_SIZES = [12, 14, 15, 16, 18, 20];
const DM_SPEEDS = [5, 8, 10, 12, 15];
const DM_LINE_HEIGHTS = [1.2, 1.4, 1.6, 1.8, 2.0];
// 批次5 P1（02-2.3）：显示区域可选档位（占弹幕层高度的比例，对齐 Flutter 10%~100%）
const DM_AREAS = [0.25, 0.5, 0.75, 1];
// 批次5 P1：描边粗细档位（0=不描边，走软阴影兜底）
const DM_STROKE_WIDTHS = [0, 0.5, 1, 1.5, 2, 3];
// 批次5 P1：静态弹幕（顶部/底部）停留秒数
const DM_STATIC_DURATIONS = [2, 3, 4, 5, 6, 8];
// 批次5 P1：智能云屏蔽级别（0~11，对齐 Flutter danmakuWeight；解析器暂未提取 weight 字段）
const DM_CLOUD_LEVELS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];

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
  // 批次5 P1（02-2.3）：补齐项选中索引
  const [dmAreaIdx, setDmAreaIdx] = useState(() => idx(DM_AREAS, (v) => v === s.dmArea));
  const [dmStrokeIdx, setDmStrokeIdx] = useState(() => idx(DM_STROKE_WIDTHS, (v) => v === s.dmStrokeWidth));
  const [dmStaticIdx, setDmStaticIdx] = useState(() => idx(DM_STATIC_DURATIONS, (v) => v === s.dmStaticDuration));
  const [dmCloudIdx, setDmCloudIdx] = useState(() => idx(DM_CLOUD_LEVELS, (v) => v === s.dmCloudLevel));

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
            {/* 批次5 P1（02-2.3）：显示区域——原生 PiliDanmakuOverlayView 按比例收敛轨道高度 */}
            <Picker label="显示区域" systemImage="rectangle.split.2x1" selection={dmAreaIdx}
              onSelectionChange={(v) => { const i = Number(v); setDmAreaIdx(i); s.set({ dmArea: DM_AREAS[i] }); }}
              modifiers={[pickerStyle('menu')]}>
              {DM_AREAS.map((a, i) => <Text key={a} modifiers={[tag(i)]}>{`${Math.round(a * 100)}%`}</Text>)}
            </Picker>
            {/* 批次5 P1：描边粗细——原生 CATextLayer strokeWidth 真描边，0=不描边走软阴影 */}
            <Picker label="描边粗细" systemImage="circle.dashed" selection={dmStrokeIdx}
              onSelectionChange={(v) => { const i = Number(v); setDmStrokeIdx(i); s.set({ dmStrokeWidth: DM_STROKE_WIDTHS[i] }); }}
              modifiers={[pickerStyle('menu')]}>
              {DM_STROKE_WIDTHS.map((w, i) => <Text key={w} modifiers={[tag(i)]}>{w === 0 ? '无' : `${w}`}</Text>)}
            </Picker>
            {/* 批次5 P1：静态弹幕时长——顶部/底部停留秒数（preparer staticDuration 直通） */}
            <Picker label="静态弹幕时长" systemImage="stopwatch" selection={dmStaticIdx}
              onSelectionChange={(v) => { const i = Number(v); setDmStaticIdx(i); s.set({ dmStaticDuration: DM_STATIC_DURATIONS[i] }); }}
              modifiers={[pickerStyle('menu')]}>
              {DM_STATIC_DURATIONS.map((d, i) => <Text key={d} modifiers={[tag(i)]}>{`${d}s`}</Text>)}
            </Picker>
          </Section>

          <Section title="弹幕屏蔽">
            {/* 批次5 P1：按类型屏蔽——原生 spawn 阶段直接跳过被屏蔽类型（滚动/顶部/底部） */}
            <Toggle label="屏蔽滚动弹幕" systemImage="arrow.right" isOn={s.dmBlockScroll} onIsOnChange={(v) => s.set({ dmBlockScroll: v })} />
            <Toggle label="屏蔽顶部弹幕" systemImage="arrow.up" isOn={s.dmBlockTop} onIsOnChange={(v) => s.set({ dmBlockTop: v })} />
            <Toggle label="屏蔽底部弹幕" systemImage="arrow.down" isOn={s.dmBlockBottom} onIsOnChange={(v) => s.set({ dmBlockBottom: v })} />
            {/* 批次5 P1：彩色屏蔽=强制转白（对齐 Flutter blockColorful），不隐藏弹幕 */}
            <Toggle label="屏蔽彩色弹幕" systemImage="paintpalette" isOn={s.dmBlockColorful} onIsOnChange={(v) => s.set({ dmBlockColorful: v })} />
            {/* 批次5 P1：智能云屏蔽级别——API/解析器暂未暴露 weight 字段，保留字段并标注暂不支持 */}
            <Picker label="智能云屏蔽级别（暂不支持）" systemImage="cloud" selection={dmCloudIdx}
              onSelectionChange={(v) => { const i = Number(v); setDmCloudIdx(i); s.set({ dmCloudLevel: DM_CLOUD_LEVELS[i] }); }}
              modifiers={[pickerStyle('menu'), disabled(true)]}>
              {DM_CLOUD_LEVELS.map((l, i) => <Text key={l} modifiers={[tag(i)]}>{`${l}级`}</Text>)}
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
