import { useState } from 'react';
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
import { disabled, pickerStyle, tag, font, tint } from '@expo/ui/swift-ui/modifiers';
import { useSettingsStore } from '@/stores/settings';

const LIKE_RATIOS = [
  { label: '不过滤', value: 0 },
  { label: '≥1%', value: 1 },
  { label: '≥2%', value: 2 },
  { label: '≥3%', value: 3 },
  { label: '≥4%', value: 4 },
];

const DURATIONS = [
  { label: '不限', value: 0 },
  { label: '≥30s', value: 30 },
  { label: '≥60s', value: 60 },
  { label: '≥90s', value: 90 },
  { label: '≥120s', value: 120 },
];

const PLAY_COUNTS = [
  { label: '不限', value: 0 },
  { label: '≥50', value: 50 },
  { label: '≥100', value: 100 },
  { label: '≥500', value: 500 },
  { label: '≥1000', value: 1000 },
];

function idx<T>(arr: readonly T[], pred: (v: T) => boolean): number {
  const i = arr.findIndex(pred);
  return i < 0 ? 0 : i;
}

export default function RecommendSettingsScreen() {
  const s = useSettingsStore();
  const [prompt, setPrompt] = useState<'title' | 'zone' | null>(null);

  const [likeRatioIdx, setLikeRatioIdx] = useState(() => idx(LIKE_RATIOS, (v) => v.value === s.minLikeRatio));
  const [durIdx, setDurIdx] = useState(() => idx(DURATIONS, (v) => v.value === s.minDuration));
  const [playIdx, setPlayIdx] = useState(() => idx(PLAY_COUNTS, (v) => v.value === s.minPlay));

  return (
    <>
      <Stack.Title>推荐设置</Stack.Title>
      <Stack.Header blurEffect="systemMaterial" style={{ shadowColor: 'transparent' }} />
      <Host style={{ flex: 1 }} useViewportSizeMeasurement>
        <List modifiers={[tint('#FB7299')]}>
          <Section title="推荐来源">
            <Toggle label="使用App端推荐" systemImage="app.badge" isOn={s.appRcmd} onIsOnChange={(v) => s.set({ appRcmd: v })} />
            <Toggle label="保留推荐刷新" systemImage="arrow.clockwise" isOn={s.enableSaveLastData} onIsOnChange={(v) => s.set({ enableSaveLastData: v })} />
            <Toggle label="显示上次看到位置" systemImage="location" isOn={s.savedRcmdTip} onIsOnChange={(v) => s.set({ savedRcmdTip: v })} />
            <Toggle label="显示热门推荐（暂不支持）" systemImage="flame.fill" isOn={s.showHotRcmd} onIsOnChange={(v) => s.set({ showHotRcmd: v })} modifiers={[disabled(true)]} />
          </Section>

          <Section title="内容过滤器" footer={<Text modifiers={[font({ size: 12 })]}>过滤器仅对推荐流生效</Text>}>
            <Picker label="点赞率过滤" systemImage="hand.thumbsup" selection={likeRatioIdx}
              onSelectionChange={(v) => { const i = Number(v); setLikeRatioIdx(i); s.set({ minLikeRatio: LIKE_RATIOS[i].value }); }}
              modifiers={[pickerStyle('menu')]}>
              {LIKE_RATIOS.map((r, i) => <Text key={r.value} modifiers={[tag(i)]}>{r.label}</Text>)}
            </Picker>
            <Picker label="视频时长过滤" systemImage="timer" selection={durIdx}
              onSelectionChange={(v) => { const i = Number(v); setDurIdx(i); s.set({ minDuration: DURATIONS[i].value }); }}
              modifiers={[pickerStyle('menu')]}>
              {DURATIONS.map((d, i) => <Text key={d.value} modifiers={[tag(i)]}>{d.label}</Text>)}
            </Picker>
            <Picker label="播放量过滤" systemImage="play.circle" selection={playIdx}
              onSelectionChange={(v) => { const i = Number(v); setPlayIdx(i); s.set({ minPlay: PLAY_COUNTS[i].value }); }}
              modifiers={[pickerStyle('menu')]}>
              {PLAY_COUNTS.map((p, i) => <Text key={p.value} modifiers={[tag(i)]}>{p.label}</Text>)}
            </Picker>
            <Toggle label="已关注UP豁免过滤" systemImage="heart" isOn={s.exemptFilterForFollowed} onIsOnChange={(v) => s.set({ exemptFilterForFollowed: v })} />
            <Toggle label="过滤器应用于相关视频" systemImage="square.stack.3d.up" isOn={s.applyFilterToRelated} onIsOnChange={(v) => s.set({ applyFilterToRelated: v })} />
            <Button onPress={() => setPrompt('title')}>
              <Label title={`标题关键词过滤${s.banWordForRecommend ? `：${s.banWordForRecommend}` : ''}`} systemImage="text.badge.xmark" />
            </Button>
            <Button onPress={() => setPrompt('zone')}>
              <Label title={`分区关键词过滤${s.banWordForZone ? `：${s.banWordForZone}` : ''}`} systemImage="square.grid.2x2" />
            </Button>
          </Section>
        </List>
      </Host>
      <SettingsPromptSheet
        visible={prompt === 'title'}
        title="标题关键词过滤"
        message="多个关键词用逗号分隔，支持正则表达式"
        initialValue={s.banWordForRecommend}
        onCancel={() => setPrompt(null)}
        onConfirm={(text) => { s.set({ banWordForRecommend: text }); setPrompt(null); }}
      />
      <SettingsPromptSheet
        visible={prompt === 'zone'}
        title="视频分区关键词过滤"
        message="多个关键词用逗号分隔，支持正则表达式"
        initialValue={s.banWordForZone}
        onCancel={() => setPrompt(null)}
        onConfirm={(text) => { s.set({ banWordForZone: text }); setPrompt(null); }}
      />
    </>
  );
}
