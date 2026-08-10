import { useEffect, useState } from 'react';
import { Alert } from 'react-native';
import { Stack } from 'expo-router';
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
import { disabled, font, foregroundStyle, pickerStyle, tag, tint } from '@expo/ui/swift-ui/modifiers';
import { useSettingsStore } from '@/stores/settings';
import { SettingsPromptSheet } from '../../components/settings/SettingsPromptSheet';
import {
  getCapabilitiesAsync,
  isModuleAvailable,
  type EnhancementCapabilities,
} from 'pili-video-enhance';

const QUALITIES = [
  { label: '4K', value: 120 },
  { label: '1080P60', value: 116 },
  { label: '1080P+', value: 112 },
  { label: '1080P', value: 80 },
  { label: '720P', value: 64 },
  { label: '480P', value: 32 },
  { label: '360P', value: 16 },
];

const AUDIO_QUALITIES = [
  { label: 'Hi-Res无损', value: 30251 },
  { label: '杜比全景声', value: 30250 },
  { label: '192K', value: 30280 },
  { label: '132K', value: 30232 },
  { label: '64K', value: 30216 },
];

const LIVE_QUALITIES = [
  { label: '原画', value: 10000 },
  { label: '蓝光(HEVC)', value: 40000 },
  { label: '蓝光', value: 400 },
  { label: '超清', value: 250 },
  { label: '高清', value: 150 },
  { label: '流畅', value: 80 },
];

const CDN_SERVICES = [
  { label: '阿里', value: 'ali' },
  { label: '腾讯', value: 'tx' },
  { label: '华为', value: 'hw' },
  { label: '百度', value: 'bd' },
  { label: '默认', value: 'default' },
];

const CODECS = [
  { label: 'H.264 (AVC)', value: 'avc' },
  { label: 'H.265 (HEVC)', value: 'hevc' },
  { label: 'AV1', value: 'av1' },
];

const BUFFER_SIZES = [16, 32, 64, 128, 256];
const BUFFER_SECS = [30, 60, 90, 120, 180];

function idx<T>(arr: readonly T[], pred: (v: T) => boolean): number {
  const i = arr.findIndex(pred);
  return i < 0 ? 0 : i;
}

type EnhanceSettingKey = 'enableSuperResolution' | 'enableFrameInterpolation' | 'enableSdrToHdr';
type EnhanceCapabilityKey = 'superResolution' | 'frameInterpolation' | 'sdrToHdr';

function isEnhancementDisabled(
  capabilities: EnhancementCapabilities | null,
  ready: boolean,
  key: EnhanceCapabilityKey,
): boolean {
  return !ready || capabilities === null || !capabilities[key].available;
}

function enhancementReason(
  capabilities: EnhancementCapabilities | null,
  key: EnhanceCapabilityKey,
): string | null {
  if (capabilities === null) {
    return null;
  }
  const support = capabilities[key];
  if (support.available) {
    return null;
  }
  switch (support.reason) {
    case 'unsupported-os':
      return '需要 iOS 26 或更高版本';
    case 'unsupported-chip':
      return '当前芯片不支持';
    case 'unsupported-display':
      return '当前屏幕不支持';
    case 'unsupported-codec':
      return '当前视频编码不支持';
    case 'drm-unsupported':
      return 'DRM 内容不支持该功能';
    case 'expo-go':
      return '需要 development build';
    case 'unknown':
      return '当前设备不支持';
    default:
      return '需要 iOS 26 或支持的设备';
  }
}

export default function VideoSettingsScreen() {
  const s = useSettingsStore();

  const [capabilities, setCapabilities] = useState<EnhancementCapabilities | null>(null);
  const [capabilitiesReady, setCapabilitiesReady] = useState(() => !isModuleAvailable());
  const [pendingEnhanceKey, setPendingEnhanceKey] = useState<EnhanceSettingKey | null>(null);
  const [showCdnPrompt, setShowCdnPrompt] = useState(false);

  const [qualityIdx, setQualityIdx] = useState(() => idx(QUALITIES, (q) => q.value === s.defaultQuality));
  const [cellQualityIdx, setCellQualityIdx] = useState(() => idx(QUALITIES, (q) => q.value === s.cellularQuality));
  const [audioQaIdx, setAudioQaIdx] = useState(() => idx(AUDIO_QUALITIES, (q) => q.value === s.defaultAudioQa));
  const [cellAudioQaIdx, setCellAudioQaIdx] = useState(() => idx(AUDIO_QUALITIES, (q) => q.value === s.cellularAudioQa));
  const [liveQaIdx, setLiveQaIdx] = useState(() => idx(LIVE_QUALITIES, (q) => q.value === s.liveQuality));
  const [cellLiveQaIdx, setCellLiveQaIdx] = useState(() => idx(LIVE_QUALITIES, (q) => q.value === s.cellularLiveQuality));
  const [cdnIdx, setCdnIdx] = useState(() => idx(CDN_SERVICES, (c) => c.value === s.cdnService));
  const [codecIdx, setCodecIdx] = useState(() => idx(CODECS, (c) => c.value === s.preferCodec));
  const [bufSizeIdx, setBufSizeIdx] = useState(() => idx(BUFFER_SIZES, (v) => v === s.bufferSize));
  const [bufSecIdx, setBufSecIdx] = useState(() => idx(BUFFER_SECS, (v) => v === s.bufferSec));

  useEffect(() => {
    if (!isModuleAvailable()) {
      return;
    }
    let active = true;
    getCapabilitiesAsync()
      .then((caps) => {
        if (!active) return;
        setCapabilities(caps);
        setCapabilitiesReady(true);
      })
      .catch(() => {
        if (!active) return;
        setCapabilities(null);
        setCapabilitiesReady(true);
      });
    return () => {
      active = false;
    };
  }, []);

  const updateEnhancement = (key: EnhanceSettingKey, value: boolean) => {
    if (key === 'enableSuperResolution') {
      s.set({ enableSuperResolution: value });
    } else if (key === 'enableFrameInterpolation') {
      s.set({ enableFrameInterpolation: value });
    } else {
      s.set({ enableSdrToHdr: value });
    }
  };

  const handleEnhanceToggle = (key: EnhanceSettingKey, isOn: boolean) => {
    if (!isOn) {
      setPendingEnhanceKey(null);
      updateEnhancement(key, false);
      return;
    }
    setPendingEnhanceKey(key);
    Alert.alert(
      '开启原生画质增强',
      '开启后耗电与发热增加，低电量或高温时可能自动降级。',
      [
        { text: '取消', style: 'cancel', onPress: () => setPendingEnhanceKey(null) },
        {
          text: '开启',
          onPress: () => {
            updateEnhancement(key, true);
            setPendingEnhanceKey(null);
          },
        },
      ],
    );
  };

  return (
    <>
      <Stack.Title>视频 / 画质</Stack.Title>
      <Stack.Header blurEffect="systemMaterial" style={{ shadowColor: 'transparent' }} />
      <Host style={{ flex: 1 }} useViewportSizeMeasurement>
        <List modifiers={[tint('#FB7299')]}>
          <Section title="解码">
            <Toggle label="开启硬解（暂不支持）" systemImage="bolt" isOn={s.enableHA} onIsOnChange={(v) => s.set({ enableHA: v })} modifiers={[disabled(true)]} />
            <Toggle label="免登录1080P" systemImage="lock.open" isOn={s.p1080} onIsOnChange={(v) => s.set({ p1080: v })} />
            <Picker label="首选解码格式" systemImage="film.stack" selection={codecIdx}
              onSelectionChange={(v) => { const i = Number(v); setCodecIdx(i); s.set({ preferCodec: CODECS[i].value }); }}
              modifiers={[pickerStyle('menu')]}>
              {CODECS.map((c, i) => <Text key={c.value} modifiers={[tag(i)]}>{c.label}</Text>)}
            </Picker>
          </Section>

          <Section title="原生画质增强">
            <Toggle
              label="超分辨率"
              systemImage="arrow.up.left.and.arrow.down.right"
              isOn={pendingEnhanceKey === 'enableSuperResolution' || s.enableSuperResolution}
              onIsOnChange={(v) => handleEnhanceToggle('enableSuperResolution', v)}
              modifiers={isEnhancementDisabled(capabilities, capabilitiesReady, 'superResolution') ? [disabled(true)] : []}
            />
            {capabilities !== null && !capabilities.superResolution.available && (
              <Text modifiers={[font({ textStyle: 'footnote' }), foregroundStyle({ type: 'hierarchical', style: 'secondary' })]}>
                {enhancementReason(capabilities, 'superResolution')}
              </Text>
            )}
            <Toggle
              label="补帧"
              systemImage="film.stack"
              isOn={pendingEnhanceKey === 'enableFrameInterpolation' || s.enableFrameInterpolation}
              onIsOnChange={(v) => handleEnhanceToggle('enableFrameInterpolation', v)}
              modifiers={isEnhancementDisabled(capabilities, capabilitiesReady, 'frameInterpolation') ? [disabled(true)] : []}
            />
            {capabilities !== null && !capabilities.frameInterpolation.available && (
              <Text modifiers={[font({ textStyle: 'footnote' }), foregroundStyle({ type: 'hierarchical', style: 'secondary' })]}>
                {enhancementReason(capabilities, 'frameInterpolation')}
              </Text>
            )}
            <Toggle
              label="SDR→HDR 映射"
              systemImage="sun.max.trianglebadge.exclamationmark"
              isOn={pendingEnhanceKey === 'enableSdrToHdr' || s.enableSdrToHdr}
              onIsOnChange={(v) => handleEnhanceToggle('enableSdrToHdr', v)}
              modifiers={isEnhancementDisabled(capabilities, capabilitiesReady, 'sdrToHdr') ? [disabled(true)] : []}
            />
            {capabilities !== null && !capabilities.sdrToHdr.available && (
              <Text modifiers={[font({ textStyle: 'footnote' }), foregroundStyle({ type: 'hierarchical', style: 'secondary' })]}>
                {enhancementReason(capabilities, 'sdrToHdr')}
              </Text>
            )}
            {capabilitiesReady && capabilities === null && (
              <Text modifiers={[font({ textStyle: 'footnote' }), foregroundStyle({ type: 'hierarchical', style: 'secondary' })]}>
                需要 development build
              </Text>
            )}
          </Section>

          <Section title="视频画质">
            <Picker label="默认画质" systemImage="film" selection={qualityIdx}
              onSelectionChange={(v) => { const i = Number(v); setQualityIdx(i); s.set({ defaultQuality: QUALITIES[i].value }); }}
              modifiers={[pickerStyle('menu')]}>
              {QUALITIES.map((q, i) => <Text key={q.value} modifiers={[tag(i)]}>{q.label}</Text>)}
            </Picker>
            <Picker label="蜂窝网络画质" systemImage="antenna.radiowaves.left.and.right" selection={cellQualityIdx}
              onSelectionChange={(v) => { const i = Number(v); setCellQualityIdx(i); s.set({ cellularQuality: QUALITIES[i].value }); }}
              modifiers={[pickerStyle('menu')]}>
              {QUALITIES.map((q, i) => <Text key={q.value} modifiers={[tag(i)]}>{q.label}</Text>)}
            </Picker>
          </Section>

          <Section title="音频">
            <Picker label="默认音质（暂不支持）" systemImage="music.note" selection={audioQaIdx}
              onSelectionChange={(v) => { const i = Number(v); setAudioQaIdx(i); s.set({ defaultAudioQa: AUDIO_QUALITIES[i].value }); }}
              modifiers={[pickerStyle('menu'), disabled(true)]}>
              {AUDIO_QUALITIES.map((q, i) => <Text key={q.value} modifiers={[tag(i)]}>{q.label}</Text>)}
            </Picker>
            <Picker label="蜂窝网络音质（暂不支持）" systemImage="music.note.list" selection={cellAudioQaIdx}
              onSelectionChange={(v) => { const i = Number(v); setCellAudioQaIdx(i); s.set({ cellularAudioQa: AUDIO_QUALITIES[i].value }); }}
              modifiers={[pickerStyle('menu'), disabled(true)]}>
              {AUDIO_QUALITIES.map((q, i) => <Text key={q.value} modifiers={[tag(i)]}>{q.label}</Text>)}
            </Picker>
            <Toggle label="音频不跟随CDN（暂不支持）" systemImage="music.quarternote.3" isOn={s.disableAudioCDN} onIsOnChange={(v) => s.set({ disableAudioCDN: v })} modifiers={[disabled(true)]} />
          </Section>

          <Section title="直播">
            <Picker label="直播默认画质" systemImage="dot.radiowaves.left.and.right" selection={liveQaIdx}
              onSelectionChange={(v) => { const i = Number(v); setLiveQaIdx(i); s.set({ liveQuality: LIVE_QUALITIES[i].value }); }}
              modifiers={[pickerStyle('menu')]}>
              {LIVE_QUALITIES.map((q, i) => <Text key={q.value} modifiers={[tag(i)]}>{q.label}</Text>)}
            </Picker>
            <Picker label="蜂窝直播画质" systemImage="cellularbars" selection={cellLiveQaIdx}
              onSelectionChange={(v) => { const i = Number(v); setCellLiveQaIdx(i); s.set({ cellularLiveQuality: LIVE_QUALITIES[i].value }); }}
              modifiers={[pickerStyle('menu')]}>
              {LIVE_QUALITIES.map((q, i) => <Text key={q.value} modifiers={[tag(i)]}>{q.label}</Text>)}
            </Picker>
            <Button onPress={() => setShowCdnPrompt(true)}>
              <Label title={`直播CDN：${s.liveCdnUrl || '默认'}`} systemImage="cloud" />
            </Button>
          </Section>

          <Section title="CDN 与缓冲">
            <Picker label="CDN 设置" systemImage="server.rack" selection={cdnIdx}
              onSelectionChange={(v) => { const i = Number(v); setCdnIdx(i); s.set({ cdnService: CDN_SERVICES[i].value }); }}
              modifiers={[pickerStyle('menu')]}>
              {CDN_SERVICES.map((c, i) => <Text key={c.value} modifiers={[tag(i)]}>{c.label}</Text>)}
            </Picker>
            <Toggle label="CDN 测速（暂不支持）" systemImage="speedometer" isOn={s.cdnSpeedTest} onIsOnChange={(v) => s.set({ cdnSpeedTest: v })} modifiers={[disabled(true)]} />
            <Picker label="缓冲大小" systemImage="internaldrive" selection={bufSizeIdx}
              onSelectionChange={(v) => { const i = Number(v); setBufSizeIdx(i); s.set({ bufferSize: BUFFER_SIZES[i] }); }}
              modifiers={[pickerStyle('menu')]}>
              {BUFFER_SIZES.map((b, i) => <Text key={b} modifiers={[tag(i)]}>{`${b}MB`}</Text>)}
            </Picker>
            <Picker label="缓冲时长" systemImage="clock" selection={bufSecIdx}
              onSelectionChange={(v) => { const i = Number(v); setBufSecIdx(i); s.set({ bufferSec: BUFFER_SECS[i] }); }}
              modifiers={[pickerStyle('menu')]}>
              {BUFFER_SECS.map((b, i) => <Text key={b} modifiers={[tag(i)]}>{`${b}s`}</Text>)}
            </Picker>
          </Section>
        </List>
      </Host>
      <SettingsPromptSheet
        visible={showCdnPrompt}
        title="直播CDN Host"
        message="输入自定义直播CDN host，留空使用默认"
        initialValue={s.liveCdnUrl}
        onCancel={() => setShowCdnPrompt(false)}
        onConfirm={(text) => { s.set({ liveCdnUrl: text }); setShowCdnPrompt(false); }}
      />
    </>
  );
}
