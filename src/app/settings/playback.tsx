import { useState } from 'react';
import { Stack } from 'expo-router';
import { Host } from '@/components/SwiftUIHost';
import {
  List,
  Section,
  Toggle,
  Picker,
  Text,
} from '@expo/ui/swift-ui';
import { pickerStyle, tag, tint } from '@expo/ui/swift-ui/modifiers';
import { useSettingsStore } from '@/stores/settings';
import { PiliPlayer } from 'pili-player';

const FAST_DURATIONS = [5, 10, 15];
const SLIDE_DURATIONS = [25, 50, 90, 100];

const FULLSCREEN_MODES = [
  { label: '横向全屏', value: 0 },
  { label: '竖向全屏', value: 1 },
  { label: '不改变方向', value: 2 },
];

const PROGRESS_BEHAVIORS = [
  { label: '始终显示', value: 0 },
  { label: '仅全屏显示', value: 1 },
  { label: '始终隐藏', value: 2 },
];

const PLAY_REPEATS = [
  { label: '顺序播放', value: 0 },
  { label: '单曲循环', value: 1 },
  { label: '列表循环', value: 2 },
  { label: '随机播放', value: 3 },
];

const SUBTITLE_PREFS = [
  { label: '不自动启用', value: 0 },
  { label: '优先选择第一个字幕(含AI)', value: 1 },
  { label: '跳过AI字幕,优先CC字幕', value: 2 },
  { label: '自动(静音含AI/非静音跳AI)', value: 3 },
];

const PLAY_SPEEDS = [0.5, 0.75, 1.0, 1.25, 1.5, 2.0];
const LONG_PRESS_SPEEDS = [2.0, 3.0, 4.0, 5.0];
const PLAYER_VOLUMES = [50, 75, 100, 125, 150, 200, 300];

const SC_TYPES = [
  { label: '普通', value: 0 },
  { label: '紧凑', value: 1 },
  { label: '隐藏', value: 2 },
];

const SC_SCALES = [75, 100, 125, 150];

function idx<T>(arr: readonly T[], pred: (v: T) => boolean): number {
  const i = arr.findIndex(pred);
  return i < 0 ? 0 : i;
}

export default function PlaybackSettingsScreen() {
  const s = useSettingsStore();

  const [fastDurIdx, setFastDurIdx] = useState(() => idx(FAST_DURATIONS, (v) => v === s.fastForBackwardDuration));
  const [slideDurIdx, setSlideDurIdx] = useState(() => idx(SLIDE_DURATIONS, (v) => v === s.sliderDuration));
  const [fsModeIdx, setFsModeIdx] = useState(() => idx(FULLSCREEN_MODES, (v) => v.value === s.fullScreenMode));
  const [progBehIdx, setProgBehIdx] = useState(() => idx(PROGRESS_BEHAVIORS, (v) => v.value === s.btmProgressBehavior));
  const [playRepeatIdx, setPlayRepeatIdx] = useState(() => idx(PLAY_REPEATS, (v) => v.value === s.playRepeat));
  const [subtitleIdx, setSubtitleIdx] = useState(() => idx(SUBTITLE_PREFS, (v) => v.value === s.subtitlePreference));
  const [playSpeedIdx, setPlaySpeedIdx] = useState(() => idx(PLAY_SPEEDS, (v) => v === s.defaultPlaySpeed));
  const [longPressSpeedIdx, setLongPressSpeedIdx] = useState(() => idx(LONG_PRESS_SPEEDS, (v) => v === s.longPressSpeedDefault));
  const [scTypeIdx, setScTypeIdx] = useState(() => idx(SC_TYPES, (v) => v.value === s.superChatType));
  const [scScaleIdx, setScScaleIdx] = useState(() => idx(SC_SCALES, (v) => v === s.fullScreenScScale));
  const [volumeIdx, setVolumeIdx] = useState(() => idx(PLAYER_VOLUMES, (v) => v === s.playerVolume));

  return (
    <>
      <Stack.Title>播放设置</Stack.Title>
      <Stack.Header blurEffect="systemMaterial" style={{ shadowColor: 'transparent' }} />
      <Host style={{ flex: 1 }} useViewportSizeMeasurement>
        <List modifiers={[tint('#FB7299')]}>
          <Section title="播放控制">
            <Toggle label="自动播放" systemImage="play.circle" isOn={s.autoPlay} onIsOnChange={(v) => s.set({ autoPlay: v })} />
            <Toggle label="仅WiFi下播放" systemImage="wifi" isOn={s.playOnWifi} onIsOnChange={(v) => s.set({ playOnWifi: v })} />
            <Toggle label="后台播放" systemImage="moon.circle" isOn={s.continuePlayInBackground} onIsOnChange={(v) => s.set({ continuePlayInBackground: v })} />
            <Picker label="播放顺序" systemImage="repeat" selection={playRepeatIdx}
              onSelectionChange={(v) => { const i = Number(v); setPlayRepeatIdx(i); s.set({ playRepeat: PLAY_REPEATS[i].value }); }}
              modifiers={[pickerStyle('menu')]}>
              {PLAY_REPEATS.map((r, i) => <Text key={r.value} modifiers={[tag(i)]}>{r.label}</Text>)}
            </Picker>
            <Toggle label="显示观看人数" systemImage="person.2" isOn={s.enableOnlineTotal} onIsOnChange={(v) => s.set({ enableOnlineTotal: v })} />
            <Toggle label="上报播放进度" systemImage="icloud.and.arrow.up" isOn={s.enableHeartbeat} onIsOnChange={(v) => s.set({ enableHeartbeat: v })} />
            <Toggle label="滑动跳转预览缩略图" systemImage="film.stack" isOn={s.showSeekPreview} onIsOnChange={(v) => s.set({ showSeekPreview: v })} />
            <Toggle label="后台音频服务" systemImage="speaker.wave.2" isOn={s.enableBackgroundPlay} onIsOnChange={(v) => s.set({ enableBackgroundPlay: v })} />
            <Picker label="播放器音量" systemImage="speaker.wave.3" selection={volumeIdx}
              onSelectionChange={(v) => { const i = Number(v); setVolumeIdx(i); s.set({ playerVolume: PLAYER_VOLUMES[i] }); }}
              modifiers={[pickerStyle('menu')]}>
              {PLAYER_VOLUMES.map((vol, i) => <Text key={vol} modifiers={[tag(i)]}>{`${vol}%`}</Text>)}
            </Picker>
            <Toggle label="延长控件显示时间" systemImage="timer" isOn={s.enableLongShowControl} onIsOnChange={(v) => s.set({ enableLongShowControl: v })} />
            <Toggle label="播放器设置仅对当前生效" systemImage="arrow.counterclockwise" isOn={s.tempPlayerConf} onIsOnChange={(v) => s.set({ tempPlayerConf: v })} />
          </Section>

          <Section title="倍速">
            <Picker label="默认播放倍速" systemImage="gauge.with.dots.needle.67percent" selection={playSpeedIdx}
              onSelectionChange={(v) => { const i = Number(v); setPlaySpeedIdx(i); s.set({ defaultPlaySpeed: PLAY_SPEEDS[i] }); }}
              modifiers={[pickerStyle('menu')]}>
              {PLAY_SPEEDS.map((sp, i) => <Text key={sp} modifiers={[tag(i)]}>{`${sp}x`}</Text>)}
            </Picker>
            <Toggle label="长按倍速播放" systemImage="hand.point.up.left" isOn={s.enableAutoLongPressSpeed} onIsOnChange={(v) => s.set({ enableAutoLongPressSpeed: v })} />
            <Picker label="长按倍速值" systemImage="gauge.with.dots.needle.100percent" selection={longPressSpeedIdx}
              onSelectionChange={(v) => { const i = Number(v); setLongPressSpeedIdx(i); s.set({ longPressSpeedDefault: LONG_PRESS_SPEEDS[i] }); }}
              modifiers={[pickerStyle('menu')]}>
              {LONG_PRESS_SPEEDS.map((sp, i) => <Text key={sp} modifiers={[tag(i)]}>{`${sp}x`}</Text>)}
            </Picker>
          </Section>

          <Section title="手势操作">
            <Toggle label="双击快退/快进" systemImage="hand.tap" isOn={s.enableQuickDouble} onIsOnChange={(v) => s.set({ enableQuickDouble: v })} />
            <Picker label="双击快进时长" systemImage="forward" selection={fastDurIdx}
              onSelectionChange={(v) => { const i = Number(v); setFastDurIdx(i); s.set({ fastForBackwardDuration: FAST_DURATIONS[i] }); }}
              modifiers={[pickerStyle('menu')]}>
              {FAST_DURATIONS.map((d, i) => <Text key={d} modifiers={[tag(i)]}>{`${d}s`}</Text>)}
            </Picker>
            <Toggle label="滑动调节亮度/音量" systemImage="sun.max" isOn={s.enableSlideVolumeBrightness} onIsOnChange={(v) => s.set({ enableSlideVolumeBrightness: v })} />
            <Toggle label="中间滑动进入/退出全屏" systemImage="arrow.up.and.down" isOn={s.enableSlideFS} onIsOnChange={(v) => s.set({ enableSlideFS: v })} />
            <Picker label="滑动快进时长" systemImage="hand.draw" selection={slideDurIdx}
              onSelectionChange={(v) => { const i = Number(v); setSlideDurIdx(i); s.set({ sliderDuration: SLIDE_DURATIONS[i] }); }}
              modifiers={[pickerStyle('menu')]}>
              {SLIDE_DURATIONS.map((d, i) => <Text key={d} modifiers={[tag(i)]}>{`${d}%`}</Text>)}
            </Picker>
            <Toggle label="双指缩小视频" systemImage="arrow.down.right.and.arrow.up.left.circle" isOn={s.enableShrinkVideoSize} onIsOnChange={(v) => s.set({ enableShrinkVideoSize: v })} />
            <Toggle label="滑动快进使用相对时长" systemImage="arrow.left.and.right" isOn={s.useRelativeSlide} onIsOnChange={(v) => s.set({ useRelativeSlide: v })} />
          </Section>

          <Section title="全屏">
            <Toggle label="竖屏扩大展示" systemImage="arrow.up.backward.and.arrow.down.forward" isOn={s.enableVerticalExpand} onIsOnChange={(v) => s.set({ enableVerticalExpand: v })} />
            <Toggle label="自动全屏" systemImage="arrow.up.left.and.arrow.down.right" isOn={s.enableAutoEnter} onIsOnChange={(v) => s.set({ enableAutoEnter: v })} />
            <Toggle label="自动退出全屏" systemImage="arrow.down.right.and.arrow.up.left" isOn={s.enableAutoExit} onIsOnChange={(v) => s.set({ enableAutoExit: v })} />
            <Toggle label="重力感应自动旋转" systemImage="gyroscope" isOn={s.autoRotate} onIsOnChange={(v) => s.set({ autoRotate: v })} />
            <Toggle label="全屏手势反向" systemImage="arrow.triangle.swap" isOn={s.fullScreenGestureReverse} onIsOnChange={(v) => s.set({ fullScreenGestureReverse: v })} />
            <Picker label="默认全屏方向" systemImage="rotate.right" selection={fsModeIdx}
              onSelectionChange={(v) => { const i = Number(v); setFsModeIdx(i); s.set({ fullScreenMode: FULLSCREEN_MODES[i].value }); }}
              modifiers={[pickerStyle('menu')]}>
              {FULLSCREEN_MODES.map((m, i) => <Text key={m.value} modifiers={[tag(i)]}>{m.label}</Text>)}
            </Picker>
            <Toggle label="全屏显示操作按钮" systemImage="ellipsis.circle" isOn={s.showFSActionItem} onIsOnChange={(v) => s.set({ showFSActionItem: v })} />
            <Toggle label="全屏显示锁定按钮" systemImage="lock" isOn={s.showFSLockBtn} onIsOnChange={(v) => s.set({ showFSLockBtn: v })} />
            <Toggle label="全屏显示截图按钮" systemImage="camera" isOn={s.showFsScreenshotBtn} onIsOnChange={(v) => s.set({ showFsScreenshotBtn: v })} />
            <Toggle label="全屏显示电池电量" systemImage="battery.75" isOn={s.showBatteryLevel} onIsOnChange={(v) => s.set({ showBatteryLevel: v })} />
          </Section>

          <Section title="画中画">
            <Toggle label="后台画中画" systemImage="pip" isOn={s.enablePiP}
              onIsOnChange={(v) => {
                s.set({ enablePiP: v });
                // 同步原生：进入后台自动拉起系统 PiP 小窗的开关。
                // 真机验收：需在工程开启 com.apple.developer.avfoundation.picture-in-picture entitlement。
                PiliPlayer.shared.setPiPEnabled(v);
              }} />
            <Toggle label="画中画不加载弹幕" systemImage="captions.bubble" isOn={s.enablePiPNoDanmaku}
              onIsOnChange={(v) => s.set({ enablePiPNoDanmaku: v })} />
          </Section>

          <Section title="SuperChat">
            <Picker label="SuperChat显示类型" systemImage="text.bubble" selection={scTypeIdx}
              onSelectionChange={(v) => { const i = Number(v); setScTypeIdx(i); s.set({ superChatType: SC_TYPES[i].value }); }}
              modifiers={[pickerStyle('menu')]}>
              {SC_TYPES.map((t, i) => <Text key={t.value} modifiers={[tag(i)]}>{t.label}</Text>)}
            </Picker>
            <Picker label="全屏SC大小" systemImage="textformat.size" selection={scScaleIdx}
              onSelectionChange={(v) => { const i = Number(v); setScScaleIdx(i); s.set({ fullScreenScScale: SC_SCALES[i] }); }}
              modifiers={[pickerStyle('menu')]}>
              {SC_SCALES.map((sc, i) => <Text key={sc} modifiers={[tag(i)]}>{`${sc}%`}</Text>)}
            </Picker>
          </Section>

          <Section title="字幕与进度条">
            <Picker label="自动启用字幕" systemImage="captions.bubble" selection={subtitleIdx}
              onSelectionChange={(v) => { const i = Number(v); setSubtitleIdx(i); s.set({ subtitlePreference: SUBTITLE_PREFS[i].value }); }}
              modifiers={[pickerStyle('menu')]}>
              {SUBTITLE_PREFS.map((p, i) => <Text key={p.value} modifiers={[tag(i)]}>{p.label}</Text>)}
            </Picker>
            <Picker label="底部进度条" systemImage="minus" selection={progBehIdx}
              onSelectionChange={(v) => { const i = Number(v); setProgBehIdx(i); s.set({ btmProgressBehavior: PROGRESS_BEHAVIORS[i].value }); }}
              modifiers={[pickerStyle('menu')]}>
              {PROGRESS_BEHAVIORS.map((b, i) => <Text key={b.value} modifiers={[tag(i)]}>{b.label}</Text>)}
            </Picker>
          </Section>
        </List>
      </Host>
    </>
  );
}
