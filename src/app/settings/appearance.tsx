import { Stack } from 'expo-router';
import { Host } from '@/components/SwiftUIHost';
import {
  List,
  Section,
  Toggle,
  Picker,
  Text,
} from '@expo/ui/swift-ui';
import { disabled, pickerStyle, tag, font, tint } from '@expo/ui/swift-ui/modifiers';
import { useSettingsStore } from '@/stores/settings';

const THEMES = [
  { label: '跟随系统', value: 'system' },
  { label: '浅色', value: 'light' },
  { label: '深色', value: 'dark' },
] as const;

const FONT_SIZES = [12, 13, 14, 15, 16, 18, 20];

const REPLY_LIMITS = [0, 3, 4, 5, 6, 8, 10];

const REPLY_SORTS = [
  { label: '按热度', value: 0 },
  { label: '按时间', value: 1 },
];

const DYN_TYPES = [
  { label: '全部', value: 0 },
  { label: '投稿', value: 1 },
  { label: '番剧', value: 2 },
  { label: '专栏', value: 3 },
];

const MEMBER_TABS = [
  { label: '投稿', value: 0 },
  { label: '动态', value: 1 },
  { label: '合集', value: 2 },
  { label: '专栏', value: 3 },
  { label: '音频', value: 4 },
];

const DYN_BADGE_MODES = [
  { label: '隐藏', value: 0 },
  { label: '数字', value: 1 },
  { label: '红点', value: 2 },
];

const PIC_QUALITIES = [60, 70, 80, 90, 100];

const PREVIEW_QUALITIES = [70, 80, 90, 100];

const MSG_BADGE_MODES = [
  { label: '隐藏', value: 0 },
  { label: '数字', value: 1 },
  { label: '红点', value: 2 },
];

const HOME_PAGES = [
  { label: '首页', value: 0 },
  { label: '动态', value: 1 },
  { label: '我的', value: 2 },
] as const;

const FEED_LAYOUTS = [
  { label: '单列沉浸', value: 'immersive' },
  { label: '双列紧凑', value: 'compact' },
] as const;

const MSG_UNREAD_TYPES = [
  { label: '私信', value: 0 },
  { label: '回复我的', value: 1 },
  { label: '@我', value: 2 },
  { label: '收到的赞', value: 3 },
];

const TAB_BAR_LABELS: Record<string, string> = {
  recommend: '推荐',
  hot: '热门',
  bangumi: '番剧',
  live: '直播',
  rank: '分区',
  cinema: '影视',
};

const NAV_BAR_LABELS: Record<string, string> = {
  home: '首页',
  dynamics: '动态',
  mine: '我的',
};

function idx<T>(arr: readonly T[], pred: (v: T) => boolean): number {
  const i = arr.findIndex(pred);
  return i < 0 ? 0 : i;
}

export default function AppearanceSettingsScreen() {
  const s = useSettingsStore();

  const themeIdx = idx(THEMES, (t) => t.value === s.theme);
  const fontIdx = idx(FONT_SIZES, (v) => v === s.fontSize);
  const replyLimitIdx = idx(REPLY_LIMITS, (v) => v === s.replyLengthLimit);
  const replySortIdx = idx(REPLY_SORTS, (v) => v.value === s.replySortType);
  const dynTypeIdx = idx(DYN_TYPES, (v) => v.value === s.defaultDynamicType);
  const memberTabIdx = idx(MEMBER_TABS, (v) => v.value === s.memberTab);
  const dynBadgeIdx = idx(DYN_BADGE_MODES, (v) => v.value === s.dynamicBadgeMode);
  const picQualityIdx = idx(PIC_QUALITIES, (v) => v === s.picQuality);
  const previewQualityIdx = idx(PREVIEW_QUALITIES, (v) => v === s.previewQuality);
  const msgBadgeIdx = idx(MSG_BADGE_MODES, (v) => v.value === s.msgBadgeMode);
  const msgUnReadTypeIdx = 0;
  const homePageIdx = idx(HOME_PAGES, (v) => v.value === s.defaultHomePage);
  const feedLayoutIdx = idx(FEED_LAYOUTS, (f) => f.value === s.feedLayout);

  const toggleUnReadType = (value: number) => {
    const cur = s.msgUnReadTypes;
    s.set({
      msgUnReadTypes: cur.includes(value)
        ? cur.filter((t) => t !== value)
        : [...cur, value].sort((a, b) => a - b),
    });
  };

  const unReadTypeSummary = s.msgUnReadTypes.length
    ? s.msgUnReadTypes.map((t) => MSG_UNREAD_TYPES.find((o) => o.value === t)?.label ?? `${t}`).join('、')
    : '无';
  const tabBarSummary = s.tabBarSort.map((k) => TAB_BAR_LABELS[k] ?? k).join('、');
  const navBarSummary = s.navBarSort.map((k) => NAV_BAR_LABELS[k] ?? k).join('、');

  return (
    <>
      <Stack.Title>外观设置</Stack.Title>
      <Stack.Header blurEffect="systemMaterial" style={{ shadowColor: 'transparent' }} />
      <Host style={{ flex: 1 }} useViewportSizeMeasurement>
        <List modifiers={[tint('#FB7299')]}>
          <Section title="主题与字号">
            <Picker label="主题模式" systemImage="paintbrush" selection={themeIdx}
              onSelectionChange={(v) => { const i = Number(v); s.set({ theme: THEMES[i].value }); }}
              modifiers={[pickerStyle('menu')]}>
              {THEMES.map((t, i) => <Text key={t.value} modifiers={[tag(i)]}>{t.label}</Text>)}
            </Picker>
            <Picker label="字体大小" systemImage="textformat.size" selection={fontIdx}
              onSelectionChange={(v) => { const i = Number(v); s.set({ fontSize: FONT_SIZES[i] }); }}
              modifiers={[pickerStyle('menu')]}>
              {FONT_SIZES.map((v, i) => <Text key={v} modifiers={[tag(i)]}>{`${v}px`}</Text>)}
            </Picker>
            <Toggle label="动态取色" systemImage="wand.and.stars" isOn={s.enableDynamicColor} onIsOnChange={(v) => s.set({ enableDynamicColor: v })} />
            <Toggle label="纯黑主题" systemImage="moon.fill" isOn={s.isPureBlackTheme} onIsOnChange={(v) => s.set({ isPureBlackTheme: v })} />
            <Toggle label="视频页深色主题" systemImage="moon.circle" isOn={s.darkVideoPage} onIsOnChange={(v) => s.set({ darkVideoPage: v })} />
          </Section>

          <Section title="首页布局">
            <Picker label="Feed 布局模式" systemImage="rectangle.grid.1x2" selection={feedLayoutIdx}
              onSelectionChange={(v) => { const i = Number(v); s.set({ feedLayout: FEED_LAYOUTS[i].value }); }}
              modifiers={[pickerStyle('menu')]}>
              {FEED_LAYOUTS.map((f, i) => <Text key={f.value} modifiers={[tag(i)]}>{f.label}</Text>)}
            </Picker>
            <Toggle label="首页顶栏收起" systemImage="chevron.up" isOn={s.hideTopBar} onIsOnChange={(v) => s.set({ hideTopBar: v })} />
            <Toggle label="首页底栏收起" systemImage="chevron.down" isOn={s.hideBottomBar} onIsOnChange={(v) => s.set({ hideBottomBar: v })} />
          </Section>

          <Section title="图片质量">
            <Picker label="图片质量" systemImage="photo" selection={picQualityIdx}
              onSelectionChange={(v) => { const i = Number(v); s.set({ picQuality: PIC_QUALITIES[i] }); }}
              modifiers={[pickerStyle('menu')]}>
              {PIC_QUALITIES.map((v, i) => <Text key={v} modifiers={[tag(i)]}>{`${v}%`}</Text>)}
            </Picker>
            <Picker label="查看大图质量" systemImage="photo.on.rectangle.angled" selection={previewQualityIdx}
              onSelectionChange={(v) => { const i = Number(v); s.set({ previewQuality: PREVIEW_QUALITIES[i] }); }}
              modifiers={[pickerStyle('menu')]}>
              {PREVIEW_QUALITIES.map((v, i) => <Text key={v} modifiers={[tag(i)]}>{`${v}%`}</Text>)}
            </Picker>
          </Section>

          <Section title="视频页显示">
            <Toggle label="显示视频分段信息" systemImage="list.number" isOn={s.showViewPoints} onIsOnChange={(v) => s.set({ showViewPoints: v })} />
            <Toggle label="显示相关视频" systemImage="square.stack.3d.down.forward" isOn={s.showRelatedVideo} onIsOnChange={(v) => s.set({ showRelatedVideo: v })} />
            <Toggle label="显示视频评论" systemImage="bubble.left.and.text.bubble.right" isOn={s.showVideoReply} onIsOnChange={(v) => s.set({ showVideoReply: v })} />
            <Toggle label="显示番剧评论" systemImage="tv.and.hifispeaker.fill" isOn={s.showBangumiReply} onIsOnChange={(v) => s.set({ showBangumiReply: v })} />
            <Toggle label="默认展开视频简介" systemImage="chevron.down" isOn={s.alwaysExpandIntro} onIsOnChange={(v) => s.set({ alwaysExpandIntro: v })} />
            <Toggle label="播放页移除安全边距" systemImage="arrow.up.and.down.and.arrow.left.and.right" isOn={s.removeSafeArea} onIsOnChange={(v) => s.set({ removeSafeArea: v })} />
            <Toggle label="显示警告/争议信息" systemImage="exclamationmark.triangle" isOn={s.showArgueMsg} onIsOnChange={(v) => s.set({ showArgueMsg: v })} />
            <Toggle label="倒序播放从首集开始" systemImage="arrow.up.to.line" isOn={s.reverseFromFirst} onIsOnChange={(v) => s.set({ reverseFromFirst: v })} />
            <Toggle label="显示继续播放分P提示" systemImage="play.rectangle.on.rectangle" isOn={s.continuePlayingPart} onIsOnChange={(v) => s.set({ continuePlayingPart: v })} />
            <Toggle label="快速收藏（暂不支持）" systemImage="bookmark" isOn={s.enableQuickFav} onIsOnChange={(v) => s.set({ enableQuickFav: v })} modifiers={[disabled(true)]} />
            <Toggle label="默认展示评论区" systemImage="text.bubble.fill" isOn={s.defaultShowComment} onIsOnChange={(v) => s.set({ defaultShowComment: v })} />
          </Section>

          <Section title="评论区">
            <Picker label="评论折叠行数" systemImage="text.line.first.and.arrowtriangle.forward" selection={replyLimitIdx}
              onSelectionChange={(v) => { const i = Number(v); s.set({ replyLengthLimit: REPLY_LIMITS[i] }); }}
              modifiers={[pickerStyle('menu')]}>
              {REPLY_LIMITS.map((r, i) => <Text key={r} modifiers={[tag(i)]}>{r === 0 ? '不折叠' : `${r}行`}</Text>)}
            </Picker>
            <Picker label="评论展示" systemImage="arrow.up.arrow.down" selection={replySortIdx}
              onSelectionChange={(v) => { const i = Number(v); s.set({ replySortType: REPLY_SORTS[i].value }); }}
              modifiers={[pickerStyle('menu')]}>
              {REPLY_SORTS.map((r, i) => <Text key={r.value} modifiers={[tag(i)]}>{r.label}</Text>)}
            </Picker>
            <Toggle label="评论区搜索关键词" systemImage="magnifyingglass" isOn={s.enableWordRe} onIsOnChange={(v) => s.set({ enableWordRe: v })} />
            <Toggle label="展示头像/评论装饰" systemImage="person.crop.circle.badge.checkmark" isOn={s.showDecorate} onIsOnChange={(v) => s.set({ showDecorate: v })} />
            <Toggle label="显示粉丝勋章" systemImage="medal" isOn={s.showMedal} onIsOnChange={(v) => s.set({ showMedal: v })} />
          </Section>

          <Section title="动态">
            <Toggle label="检查未读动态" systemImage="bell.badge" isOn={s.checkDynamic} onIsOnChange={(v) => s.set({ checkDynamic: v })} />
            <Picker label="动态未读标记" systemImage="circlebadge.fill" selection={dynBadgeIdx}
              onSelectionChange={(v) => { const i = Number(v); s.set({ dynamicBadgeMode: DYN_BADGE_MODES[i].value }); }}
              modifiers={[pickerStyle('menu')]}>
              {DYN_BADGE_MODES.map((m, i) => <Text key={m.value} modifiers={[tag(i)]}>{m.label}</Text>)}
            </Picker>
            <Toggle label="屏蔽带货动态" systemImage="cart.badge.minus" isOn={s.antiGoodsDyn} onIsOnChange={(v) => s.set({ antiGoodsDyn: v })} />
            <Toggle label="屏蔽带货评论" systemImage="cart.badge.minus" isOn={s.antiGoodsReply} onIsOnChange={(v) => s.set({ antiGoodsReply: v })} />
            <Toggle label="发评反诈（暂不支持）" systemImage="shield.checkered" isOn={s.enableCommAntifraud} onIsOnChange={(v) => s.set({ enableCommAntifraud: v })} modifiers={[disabled(true)]} />
            <Toggle label="发布动态反诈（暂不支持）" systemImage="shield.lefthalf.filled" isOn={s.enableCreateDynAntifraud} onIsOnChange={(v) => s.set({ enableCreateDynAntifraud: v })} modifiers={[disabled(true)]} />
            <Toggle label="动态页瀑布流" systemImage="square.grid.2x2" isOn={s.dynamicsWaterfallFlow} onIsOnChange={(v) => s.set({ dynamicsWaterfallFlow: v })} />
            <Toggle label="显示所有已关注UP" systemImage="person.3" isOn={s.dynamicsShowAllFollowedUp} onIsOnChange={(v) => s.set({ dynamicsShowAllFollowedUp: v })} />
            <Toggle label="展开正在直播UP列表" systemImage="livephoto" isOn={s.expandDynLivePanel} onIsOnChange={(v) => s.set({ expandDynLivePanel: v })} />
            <Toggle label="显示动态争议信息" systemImage="exclamationmark.bubble" isOn={s.showDynDispute} onIsOnChange={(v) => s.set({ showDynDispute: v })} />
            <Toggle label="动态/专栏底部操作栏" systemImage="ellipsis.rectangle" isOn={s.showDynActionBar} onIsOnChange={(v) => s.set({ showDynActionBar: v })} />
            <Toggle label="显示动态互动内容" systemImage="quote.opening" isOn={s.showDynInteraction} onIsOnChange={(v) => s.set({ showDynInteraction: v })} />
            <Picker label="动态展示" systemImage="list.bullet.rectangle" selection={dynTypeIdx}
              onSelectionChange={(v) => { const i = Number(v); s.set({ defaultDynamicType: DYN_TYPES[i].value }); }}
              modifiers={[pickerStyle('menu')]}>
              {DYN_TYPES.map((d, i) => <Text key={d.value} modifiers={[tag(i)]}>{d.label}</Text>)}
            </Picker>
          </Section>

          <Section title="用户页">
            <Picker label="用户页默认TAB" systemImage="sidebar.left" selection={memberTabIdx}
              onSelectionChange={(v) => { const i = Number(v); s.set({ memberTab: MEMBER_TABS[i].value }); }}
              modifiers={[pickerStyle('menu')]}>
              {MEMBER_TABS.map((m, i) => <Text key={m.value} modifiers={[tag(i)]}>{m.label}</Text>)}
            </Picker>
            <Toggle label="显示UP主页小店TAB" systemImage="bag" isOn={s.showMemberShop} onIsOnChange={(v) => s.set({ showMemberShop: v })} />
            <Toggle label="展示追番时间表" systemImage="calendar" isOn={s.showPgcTimeline} onIsOnChange={(v) => s.set({ showPgcTimeline: v })} />
          </Section>

          <Section title="消息" footer={<Text modifiers={[font({ size: 12 })]}>未读类型已包含：{unReadTypeSummary}，点选类型可增删</Text>}>
            <Picker label="消息未读标记" systemImage="bell.badge" selection={msgBadgeIdx}
              onSelectionChange={(v) => { const i = Number(v); s.set({ msgBadgeMode: MSG_BADGE_MODES[i].value }); }}
              modifiers={[pickerStyle('menu')]}>
              {MSG_BADGE_MODES.map((m, i) => <Text key={m.value} modifiers={[tag(i)]}>{m.label}</Text>)}
            </Picker>
            <Picker label="消息未读类型" systemImage="envelope.badge" selection={msgUnReadTypeIdx}
              onSelectionChange={(v) => { const i = Number(v); toggleUnReadType(MSG_UNREAD_TYPES[i].value); }}
              modifiers={[pickerStyle('menu')]}>
              {MSG_UNREAD_TYPES.map((t, i) => <Text key={t.value} modifiers={[tag(i)]}>{t.label}</Text>)}
            </Picker>
          </Section>

          <Section title="导航">
            <Picker label="默认启动页" systemImage="house" selection={homePageIdx}
              onSelectionChange={(v) => { const i = Number(v); s.set({ defaultHomePage: HOME_PAGES[i].value }); }}
              modifiers={[pickerStyle('menu')]}>
              {HOME_PAGES.map((h, i) => <Text key={h.value} modifiers={[tag(i)]}>{h.label}</Text>)}
            </Picker>
            <Text modifiers={[font({ size: 15 })]}>首页标签页：{tabBarSummary}（暂不支持）</Text>
            <Text modifiers={[font({ size: 15 })]}>Navbar：{navBarSummary}（暂不支持）</Text>
          </Section>
        </List>
      </Host>
    </>
  );
}
