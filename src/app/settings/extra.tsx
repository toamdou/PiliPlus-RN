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

const PGC_SKIP_TYPES = [
  { label: '不跳过', value: 0 },
  { label: '仅跳过片头', value: 1 },
  { label: '仅跳过片尾', value: 2 },
  { label: '跳过片头片尾', value: 3 },
];

const SB_CATEGORY_PRESETS = [
  { label: '仅跳过赞助广告', value: ['sponsor'] },
  { label: '广告+片头片尾', value: ['sponsor', 'intro', 'outro'] },
  { label: '广告+片头片尾+互动提醒', value: ['sponsor', 'intro', 'outro', 'interaction'] },
  { label: '全部类别', value: ['sponsor', 'intro', 'outro', 'interaction', 'selfpromo', 'preview', 'filler'] },
] as const;

const DYN_PERIODS = [2, 3, 5, 10, 15, 30];

function idx<T>(arr: readonly T[], pred: (v: T) => boolean): number {
  const i = arr.findIndex(pred);
  return i < 0 ? 0 : i;
}

export default function ExtraSettingsScreen() {
  const s = useSettingsStore();
  const [prompt, setPrompt] = useState<'reply' | 'dyn' | null>(null);

  const [pgcSkipIdx, setPgcSkipIdx] = useState(() => idx(PGC_SKIP_TYPES, (v) => v.value === s.pgcSkipType));
  const [dynPeriodIdx, setDynPeriodIdx] = useState(() => idx(DYN_PERIODS, (v) => v === s.dynamicPeriod));
  const [sbCategoryIdx, setSbCategoryIdx] = useState(() => {
    // 根据当前 categories 匹配预设
    const cur = JSON.stringify([...s.sponsorBlockCategories].sort());
    const i = SB_CATEGORY_PRESETS.findIndex(p => JSON.stringify([...p.value].sort()) === cur);
    return i < 0 ? 3 : i;
  });

  return (
    <>
      <Stack.Title>其他设置</Stack.Title>
      <Stack.Header blurEffect="systemMaterial" style={{ shadowColor: 'transparent' }} />
      <Host style={{ flex: 1 }} useViewportSizeMeasurement>
        <List modifiers={[tint('#FB7299')]}>
          <Section title="搜索">
            <Toggle label="搜索建议" systemImage="text.magnifyingglass" isOn={s.searchSuggestion} onIsOnChange={(v) => s.set({ searchSuggestion: v })} />
            <Toggle label="记录搜索历史" systemImage="clock.arrow.circlepath" isOn={s.recordSearchHistory} onIsOnChange={(v) => s.set({ recordSearchHistory: v })} />
            <Toggle label="大家都在搜" systemImage="flame" isOn={s.enableHotKey} onIsOnChange={(v) => s.set({ enableHotKey: v })} />
            <Toggle label="搜索发现" systemImage="safari" isOn={s.enableSearchRcmd} onIsOnChange={(v) => s.set({ enableSearchRcmd: v })} />
            <Toggle label="搜索默认词" systemImage="textformat" isOn={s.enableSearchWord} onIsOnChange={(v) => s.set({ enableSearchWord: v })} />
          </Section>

          <Section title="交互与通知">
            <Toggle label="震动反馈" systemImage="iphone.radiowaves.left.and.right" isOn={s.feedBackEnable} onIsOnChange={(v) => s.set({ feedBackEnable: v })} />
            <Toggle label="禁用收到的赞" systemImage="hand.thumbsup.slash" isOn={s.disableLikeMsg} onIsOnChange={(v) => s.set({ disableLikeMsg: v })} />
            <Toggle label="外部浏览器打开链接" systemImage="arrow.up.right.square" isOn={s.openInBrowser} onIsOnChange={(v) => s.set({ openInBrowser: v })} />
          </Section>

          <Section title="关键词过滤" footer={<Text modifiers={[font({ size: 12 })]}>多个关键词用逗号分隔，支持正则表达式</Text>}>
            <Button onPress={() => setPrompt('reply')}>
              <Label title={`评论关键词过滤${s.banWordForReply ? `：${s.banWordForReply}` : ''}`} systemImage="text.badge.xmark" />
            </Button>
            <Button onPress={() => setPrompt('dyn')}>
              <Label title={`动态关键词过滤${s.banWordForDyn ? `：${s.banWordForDyn}` : ''}`} systemImage="text.badge.xmark" />
            </Button>
          </Section>

          <Section title="AI 与更新">
            <Toggle label="启用AI总结" systemImage="brain.head.profile" isOn={s.enableAi} onIsOnChange={(v) => s.set({ enableAi: v })} />
            <Toggle label="启动时检查更新（暂不支持）" systemImage="arrow.triangle.2.circlepath" isOn={s.autoUpdate} onIsOnChange={(v) => s.set({ autoUpdate: v })} modifiers={[disabled(true)]} />
          </Section>

          <Section title="播放器增强">
            <Toggle label="空降助手" systemImage="shield.checkered" isOn={s.enableSponsorBlock} onIsOnChange={(v) => s.set({ enableSponsorBlock: v })} />
            <Picker label="空降助手跳过类别" systemImage="checklist" selection={sbCategoryIdx}
              onSelectionChange={(v) => { const i = Number(v); setSbCategoryIdx(i); s.set({ sponsorBlockCategories: [...SB_CATEGORY_PRESETS[i].value] }); }}
              modifiers={[pickerStyle('menu')]}>
              {SB_CATEGORY_PRESETS.map((c, i) => <Text key={c.label} modifiers={[tag(i)]}>{c.label}</Text>)}
            </Picker>
            <Picker label="番剧片头/片尾跳过" systemImage="forward.end" selection={pgcSkipIdx}
              onSelectionChange={(v) => { const i = Number(v); setPgcSkipIdx(i); s.set({ pgcSkipType: PGC_SKIP_TYPES[i].value }); }}
              modifiers={[pickerStyle('menu')]}>
              {PGC_SKIP_TYPES.map((t, i) => <Text key={t.value} modifiers={[tag(i)]}>{t.label}</Text>)}
            </Picker>
            <Toggle label="提前初始化播放器（暂不支持）" systemImage="forward.circle" isOn={s.preInitPlayer} onIsOnChange={(v) => s.set({ preInitPlayer: v })} modifiers={[disabled(true)]} />
          </Section>

          <Section title="图片与评论">
            <Toggle label="预览Live Photo（暂不支持）" systemImage="livephoto" isOn={s.enableLivePhoto} onIsOnChange={(v) => s.set({ enableLivePhoto: v })} modifiers={[disabled(true)]} />
            <Toggle label="记录评论" systemImage="text.quote" isOn={s.saveReply} onIsOnChange={(v) => s.set({ saveReply: v })} />
            <Toggle label="静默下载图片" systemImage="arrow.down.circle" isOn={s.silentDownImg} onIsOnChange={(v) => s.set({ silentDownImg: v })} />
            <Toggle label="长按显示图片菜单" systemImage="menucard" isOn={s.enableImgMenu} onIsOnChange={(v) => s.set({ enableImgMenu: v })} />
          </Section>

          <Section title="动态轮询">
            <Picker label="检查未读动态周期" systemImage="timer" selection={dynPeriodIdx}
              onSelectionChange={(v) => { const i = Number(v); setDynPeriodIdx(i); s.set({ dynamicPeriod: DYN_PERIODS[i] }); }}
              modifiers={[pickerStyle('menu')]}>
              {DYN_PERIODS.map((p, i) => <Text key={p} modifiers={[tag(i)]}>{`${p}分钟`}</Text>)}
            </Picker>
          </Section>

          <Section title="字幕">
            <Toggle label="启用拖拽字幕调整边距" systemImage="hand.draw" isOn={s.enableDragSubtitle} onIsOnChange={(v) => s.set({ enableDragSubtitle: v })} />
          </Section>
        </List>
      </Host>
      <SettingsPromptSheet
        visible={prompt === 'reply'}
        title="评论关键词过滤"
        message="多个关键词用逗号分隔，支持正则"
        initialValue={s.banWordForReply}
        onCancel={() => setPrompt(null)}
        onConfirm={(text) => { s.set({ banWordForReply: text }); setPrompt(null); }}
      />
      <SettingsPromptSheet
        visible={prompt === 'dyn'}
        title="动态关键词过滤"
        message="多个关键词用逗号分隔，支持正则"
        initialValue={s.banWordForDyn}
        onCancel={() => setPrompt(null)}
        onConfirm={(text) => { s.set({ banWordForDyn: text }); setPrompt(null); }}
      />
    </>
  );
}
