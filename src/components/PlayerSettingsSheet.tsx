/**
 * PlayerSettingsSheet —— 播放器设置底部弹出面板。
 * 功能：倍速 / 画质 / 弹幕设置 / 播放顺序 / CDN / 音量 / 定时关闭 / 播放地址 / 播放信息 / 举报
 *
 * 整改条目：
 *  1.3 定时关闭由原生 DispatchSourceTimer 真正暂停播放（剩余分钟显示 + 事件提示）
 *  1.4 音量改原生 SwiftUI Slider
 *  4.4 使用 @expo/ui SwiftUI BottomSheet + RNHostView + FlashList
 *  2.6 举报 / 播放信息统一 Alert.alert（替代 SwiftUI ConfirmationDialog / SwiftAlert）
 */
import { useState, useEffect, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, Switch, Alert } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Slider } from '@expo/ui/swift-ui';
import { NativeBottomSheet } from '@/components/NativeBottomSheet';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import { copyText } from 'pili-native-core';
import { ACCENT, useThemeColors } from '@/components/SwiftUIHost';
import { useSettingsStore } from '@/stores/settings';
import { showToast } from '@/utils/toast';
import { formatPlayerTime } from '@/utils/player-utils';
import {
  startSleepTimer,
  cancelSleepTimer,
  addSleepTimerFiredListener,
} from 'pili-native-core';
import { addSleepRemainingChangedListener, getSleepRemainingMs } from 'pili-audio';
import { danmakuApi } from '@/api/danmaku';
import { videoApi, REPORT_REASONS } from '@/api/video';
import { Press } from './motion';
import { useType } from './type-scale';
import { RADII, continuous, shadow } from '@/theme/tokens';

const SPEEDS = [0.5, 0.75, 1.0, 1.25, 1.5, 2.0];
const REPEAT_MODES = [
  { label: '播完暂停', value: 0 },
  { label: '单曲循环', value: 1 },
  { label: '列表循环', value: 2 },
];
const CDN_OPTIONS = [
  { label: '默认', value: 'default' },
  { label: '阿里', value: 'ali' },
  { label: '腾讯', value: 'tx' },
  { label: '华为', value: 'hw' },
  { label: '百度', value: 'bd' },
];
const SLEEP_OPTIONS = [
  { label: '不开启', value: 0 },
  { label: '10分钟', value: 10 },
  { label: '20分钟', value: 20 },
  { label: '30分钟', value: 30 },
  { label: '45分钟', value: 45 },
  { label: '60分钟', value: 60 },
];

type Section = 'main' | 'speed' | 'quality' | 'danmaku' | 'cdn' | 'volume' | 'sleep' | 'dmList' | 'subtitle' | 'codec';

type SheetListItem =
  | { key: string; kind: 'section' }
  | { key: string; kind: 'dm'; id: number; time: number; text: string }
  | { key: string; kind: 'subtitle-close' }
  | { key: string; kind: 'subtitle'; id: number; lanDoc: string; url: string };

interface Props {
  visible: boolean;
  onClose: () => void;
  currentSpeed: number;
  onSpeedChange: (speed: number) => void;
  onReload?: () => void;
  qualityList?: { quality: number; new_description: string }[];
  currentQn?: number;
  onQualityChange?: (qn: number) => void;
  onVolumeChange?: (v: number) => void;
  playUrl?: string;
  videoInfo?: any;
  cid?: number;
  onSubtitleSelect?: (url: string) => void;
  onSubtitleClose?: () => void;
}

export function PlayerSettingsSheet({
  visible, onClose, currentSpeed, onSpeedChange, onReload,
  qualityList = [], currentQn = 0, onQualityChange, onVolumeChange,
  playUrl = '', videoInfo, cid = 0, onSubtitleSelect, onSubtitleClose,
}: Props) {
  const colors = useThemeColors();
  const T = useType();
  const s = useSettingsStore();
  const [section, setSection] = useState<Section>('main');
  const [prevVisible, setPrevVisible] = useState(visible);
  if (visible !== prevVisible) {
    setPrevVisible(visible);
    if (visible) setSection('main');
  }
  const [volume, setVolume] = useState(100);
  const [sleepRemainMin, setSleepRemainMin] = useState(0); // 1.3 剩余分钟
  const [dmListData, setDmListData] = useState<{ id: number; text: string; time: number }[]>([]);
  const [dmListLoading, setDmListLoading] = useState(false);
  const [subtitles, setSubtitles] = useState<{ id: number; lan_doc: string; subtitle_url: string }[]>([]);

  // 1.3 剩余时间改由原生事件/主动拉取驱动，不再使用 JS setInterval
  useEffect(() => {
    if (!visible) return;
    const remove = addSleepRemainingChangedListener(({ remainingMs }) => {
      setSleepRemainMin(remainingMs > 0 ? Math.max(1, Math.ceil(remainingMs / 60000)) : 0);
    });
    void getSleepRemainingMs().then((ms) => {
      if (ms > 0) setSleepRemainMin(Math.max(1, Math.ceil(ms / 60000)));
    }).catch(() => {});
    return remove;
  }, [visible]);

  useEffect(() => {
    const remove = addSleepTimerFiredListener(() => {
      setSleepRemainMin(0);
      showToast('定时关闭：播放已停止');
    });
    return () => {
      if (remove) remove();
    };
  }, []);

  const handleCdnChange = (val: string) => {
    s.set({ cdnService: val });
    onReload?.();
  };

  // 1.3 定时关闭：原生计时器暂停播放，JS 仅负责剩余分钟显示
  const handleSleep = (min: number) => {
    if (min > 0) {
      setSleepRemainMin(min);
      void startSleepTimer(min * 60)
        .then(() => getSleepRemainingMs())
        .then((ms) => {
          if (ms > 0) setSleepRemainMin(Math.max(1, Math.ceil(ms / 60000)));
        })
        .catch(() => {});
      showToast(`${min}分钟后自动关闭`);
    } else {
      void cancelSleepTimer().catch(() => {});
      setSleepRemainMin(0);
    }
    setSection('main');
  };

  const loadDmList = useCallback(async () => {
    if (!cid || dmListData.length > 0) { setSection('dmList'); return; }
    setDmListLoading(true);
    setSection('dmList');
    try {
      const res = await danmakuApi.list({ oid: cid, type: 1 });
      if (res?.data?.danmaku) {
        setDmListData(res.data.danmaku.slice(0, 200));
      }
    } catch { /* 静默 */ }
    setDmListLoading(false);
  }, [cid, dmListData.length]);

  const loadSubtitles = useCallback(async () => {
    setSection('subtitle');
    if (subtitles.length > 0 || !videoInfo) return;
    try {
      const res = await videoApi.playInfo({ aid: videoInfo.aid, cid: cid || videoInfo.cid, bvid: videoInfo.bvid });
      if (res?.data?.subtitle?.subtitles) {
        setSubtitles(res.data.subtitle.subtitles);
      }
    } catch { /* 静默 */ }
  }, [videoInfo, cid, subtitles.length]);

  // 举报处理（reason_id 码对齐视频举报接口的 1-4 约定）
  const handleReport = async (reasonId: number) => {
    const aid = videoInfo?.aid as number | undefined;
    if (!aid) {
      showToast('举报失败：缺少视频信息');
      return;
    }
    try {
      const res = await videoApi.report({ rid: aid, type: 1, reason_id: reasonId });
      if (res?.code === 0) showToast('举报已提交');
      else showToast(res?.message || '举报失败');
    } catch (e) {
      console.error('report video error:', e);
      showToast('举报失败');
    }
  };

  // 举报 / 播放信息走系统 Alert
  const showReport = () => {
    Alert.alert('举报视频', '请选择举报原因', [
      ...REPORT_REASONS.map((r) => ({ text: r.label, onPress: () => handleReport(r.code) })),
      { text: '取消', style: 'cancel' },
    ]);
  };
  const showInfo = () => {
    Alert.alert(
      '播放信息',
      `标题：${videoInfo?.title || '-'}\nUP主：${videoInfo?.owner?.name || '-'}\nBV号：${videoInfo?.bvid || '-'}\nCID：${cid}\n画质：${currentQn}`,
      [{ text: '确定' }],
    );
  };

  const listData: SheetListItem[] = useMemo(() => {
    if (section === 'dmList') {
      return dmListData.map((dm) => ({
        key: `dm-${dm.id}`,
        kind: 'dm',
        id: dm.id,
        time: dm.time,
        text: dm.text,
      }));
    }
    if (section === 'subtitle') {
      if (subtitles.length === 0) return [];
      return [
        { key: 'subtitle-close', kind: 'subtitle-close' },
        ...subtitles.map((st) => ({
          key: `subtitle-${st.id}`,
          kind: 'subtitle' as const,
          id: st.id,
          lanDoc: st.lan_doc,
          url: st.subtitle_url,
        })),
      ];
    }
    return [{ key: `section-${section}`, kind: 'section' }];
  }, [section, dmListData, subtitles]);

  /* ===== 渲染 ===== */
  const sheetContent = (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <FlashList
        style={{ flex: 1, backgroundColor: colors.bg }}
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: 34 }}
        showsVerticalScrollIndicator={false}
        data={listData}
        keyExtractor={(item) => item.key}
        estimatedItemSize={420}
        windowSize={7}
        initialNumToRender={8}
        maxToRenderPerBatch={10}
        drawDistance={300}
        ListHeaderComponent={section === 'dmList' || section === 'subtitle' ? (
          <BackHeader title={section === 'dmList' ? '弹幕列表' : '字幕设置'} colors={colors} T={T} onBack={() => setSection('main')} />
        ) : null}
        ListEmptyComponent={
          section === 'dmList' ? (
            dmListLoading ? (
              <Text style={[T.footnote, { color: colors.textTertiary, textAlign: 'center', paddingVertical: 20 }]}>加载中…</Text>
            ) : (
              <Text style={[T.footnote, { color: colors.textTertiary, textAlign: 'center', paddingVertical: 20 }]}>暂无弹幕数据</Text>
            )
          ) : section === 'subtitle' ? (
            <Text style={[T.footnote, { color: colors.textTertiary, textAlign: 'center', paddingVertical: 20 }]}>该视频无可用字幕</Text>
          ) : null
        }
        renderItem={({ item }) => {
          if (item.kind === 'dm') {
            return (
              <View style={[styles.dmListRow, { borderBottomColor: colors.separator, borderBottomWidth: StyleSheet.hairlineWidth }]}>
                <Text style={[T.caption2, { color: colors.textTertiary, width: 44 }]}>
                  {formatPlayerTime(item.time)}
                </Text>
                <Text style={[T.footnote, { color: colors.text, flex: 1 }]} numberOfLines={1}>{item.text}</Text>
              </View>
            );
          }
          if (item.kind === 'subtitle-close') {
            return (
              <Press style={[styles.row, { borderBottomColor: colors.separator, borderBottomWidth: StyleSheet.hairlineWidth }]}
                onPress={() => { onSubtitleClose?.(); setSection('main'); }}>
                <Text style={[T.subhead, { color: colors.text }]}>关闭字幕</Text>
              </Press>
            );
          }
          if (item.kind === 'subtitle') {
            return (
              <Press style={[styles.row, { borderBottomColor: colors.separator, borderBottomWidth: StyleSheet.hairlineWidth }]}
                onPress={() => { onSubtitleSelect?.(item.url); setSection('main'); }}>
                <Text style={[T.subhead, { color: colors.text }]}>{item.lanDoc}</Text>
                <Ionicons name="chevron-forward" size={14} color={colors.textTertiary} />
              </Press>
            );
          }
          return (
            <>

                {/* ===== 主菜单 ===== */}
                {section === 'main' && (
                  <View style={styles.content}>
                    {/* 倍速 */}
                    <Press style={[styles.row, styles.rowBorder, { borderBottomColor: colors.separator }]}
                      onPress={() => setSection('speed')}>
                      <Text style={[T.subhead, styles.rowLabel, { color: colors.text }]}>倍速</Text>
                      <Text style={[T.footnote, { color: colors.textTertiary }]}>{currentSpeed}x</Text>
                      <Ionicons name="chevron-forward" size={14} color={colors.textTertiary} />
                    </Press>
                    {/* 画质 */}
                    <Press style={[styles.row, styles.rowBorder, { borderBottomColor: colors.separator }]}
                      onPress={() => setSection('quality')}>
                      <Text style={[T.subhead, styles.rowLabel, { color: colors.text }]}>画质</Text>
                      <Text style={[T.footnote, { color: colors.textTertiary }]}>
                        {qualityList.find((q) => q.quality === currentQn)?.new_description || '自动'}
                      </Text>
                      <Ionicons name="chevron-forward" size={14} color={colors.textTertiary} />
                    </Press>
                    {/* 弹幕设置 */}
                    <Press style={[styles.row, styles.rowBorder, { borderBottomColor: colors.separator }]}
                      onPress={() => setSection('danmaku')}>
                      <Text style={[T.subhead, styles.rowLabel, { color: colors.text }]}>弹幕设置</Text>
                      <Ionicons name="chevron-forward" size={14} color={colors.textTertiary} />
                    </Press>
                    {/* CDN */}
                    <Press style={[styles.row, styles.rowBorder, { borderBottomColor: colors.separator }]}
                      onPress={() => setSection('cdn')}>
                      <Text style={[T.subhead, styles.rowLabel, { color: colors.text }]}>CDN 服务</Text>
                      <Text style={[T.footnote, { color: colors.textTertiary }]}>
                        {CDN_OPTIONS.find((c) => c.value === s.cdnService)?.label || '默认'}
                      </Text>
                      <Ionicons name="chevron-forward" size={14} color={colors.textTertiary} />
                    </Press>
                    {/* 解码格式 */}
                    <Press style={[styles.row, styles.rowBorder, { borderBottomColor: colors.separator }]}
                      onPress={() => setSection('codec')}>
                      <Text style={[T.subhead, styles.rowLabel, { color: colors.text }]}>解码格式</Text>
                      <Text style={[T.footnote, { color: colors.textTertiary }]}>
                        {s.preferCodec === 'hevc' ? 'HEVC' : s.preferCodec === 'av1' ? 'AV1' : 'AVC'}
                      </Text>
                      <Ionicons name="chevron-forward" size={14} color={colors.textTertiary} />
                    </Press>
                    {/* 音量 */}
                    <Press style={[styles.row, styles.rowBorder, { borderBottomColor: colors.separator }]}
                      onPress={() => setSection('volume')}>
                      <Text style={[T.subhead, styles.rowLabel, { color: colors.text }]}>音量</Text>
                      <Text style={[T.footnote, { color: colors.textTertiary }]}>{volume}%</Text>
                      <Ionicons name="chevron-forward" size={14} color={colors.textTertiary} />
                    </Press>
                    {/* 1.3 定时关闭（显示剩余分钟） */}
                    <Press style={[styles.row, styles.rowBorder, { borderBottomColor: colors.separator }]}
                      onPress={() => setSection('sleep')}>
                      <Text style={[T.subhead, styles.rowLabel, { color: colors.text }]}>定时关闭</Text>
                      <Text style={[T.footnote, { color: sleepRemainMin > 0 ? ACCENT : colors.textTertiary }]}>
                        {sleepRemainMin > 0 ? `剩余${sleepRemainMin}分钟` : '未开启'}
                      </Text>
                      <Ionicons name="chevron-forward" size={14} color={colors.textTertiary} />
                    </Press>
                    {/* 播放顺序 */}
                    <View style={[styles.row, styles.rowBorder, { borderBottomColor: colors.separator }]}>
                      <Text style={[T.subhead, styles.rowLabel, { color: colors.text }]}>播放顺序</Text>
                      <View style={styles.chipRow}>
                        {REPEAT_MODES.map((m) => (
                          <Press key={m.value} haptic scaleTo={0.9}
                            onPress={() => s.set({ playRepeat: m.value })}
                            style={[styles.chip, { backgroundColor: s.playRepeat === m.value ? ACCENT : colors.fill2, ...continuous }]}>
                            <Text style={[T.caption1, { color: s.playRepeat === m.value ? '#FFF' : colors.textSecondary }]}>{m.label}</Text>
                          </Press>
                        ))}
                      </View>
                    </View>
                    {/* 字幕 */}
                    <Press style={[styles.row, styles.rowBorder, { borderBottomColor: colors.separator }]}
                      onPress={loadSubtitles}>
                      <Text style={[T.subhead, styles.rowLabel, { color: colors.text }]}>字幕</Text>
                      <Ionicons name="chevron-forward" size={14} color={colors.textTertiary} />
                    </Press>
                    {/* 弹幕列表 */}
                    <Press style={[styles.row, styles.rowBorder, { borderBottomColor: colors.separator }]}
                      onPress={loadDmList}>
                      <Text style={[T.subhead, styles.rowLabel, { color: colors.text }]}>弹幕列表</Text>
                      <Ionicons name="chevron-forward" size={14} color={colors.textTertiary} />
                    </Press>
                    {/* SponsorBlock */}
                    <View style={[styles.row, styles.rowBorder, { borderBottomColor: colors.separator }]}>
                      <Text style={[T.subhead, styles.rowLabel, { color: colors.text }]}>SponsorBlock</Text>
                      <Switch
                        value={s.enableSponsorBlock}
                        onValueChange={(v) => s.set({ enableSponsorBlock: v })}
                        trackColor={{ true: ACCENT, false: colors.fill2 }}
                        thumbColor="#FFFFFF"
                        ios_backgroundColor={colors.fill2}
                      />
                    </View>

                    {/* 操作网格 */}
                    <View style={[styles.actionGrid, { marginTop: 16 }]}>
                      <ActionCell icon="link-outline" label="复制地址" colors={colors} T={T}
                        onPress={async () => { await copyText(playUrl); showToast('已复制播放地址'); }} />
                      <ActionCell icon="information-circle-outline" label="播放信息" colors={colors} T={T}
                        onPress={showInfo} />
                      <ActionCell icon="flag-outline" label="举报" colors={colors} T={T}
                        onPress={showReport} />
                    </View>
                  </View>
                )}

                {/* ===== 倍速 ===== */}
                {section === 'speed' && (
                  <View style={styles.content}>
                    <BackHeader title="倍速" colors={colors} T={T} onBack={() => setSection('main')} />
                    <View style={styles.grid}>
                      {SPEEDS.map((sp) => (
                        <Press key={sp} haptic scaleTo={0.9}
                          onPress={() => { onSpeedChange(sp); setSection('main'); }}
                          style={[styles.gridBtn, { backgroundColor: currentSpeed === sp ? ACCENT : colors.fill2, ...continuous }]}>
                          <Text style={[T.subhead, { color: currentSpeed === sp ? '#FFF' : colors.text, fontWeight: '600' }]}>{sp}x</Text>
                        </Press>
                      ))}
                    </View>
                  </View>
                )}

                {/* ===== 画质 ===== */}
                {section === 'quality' && (
                  <View style={styles.content}>
                    <BackHeader title="画质" colors={colors} T={T} onBack={() => setSection('main')} />
                    <View style={styles.grid}>
                      {qualityList.map((q) => (
                        <Press key={q.quality} haptic scaleTo={0.9}
                          onPress={() => { onQualityChange?.(q.quality); setSection('main'); }}
                          style={[styles.gridBtn, { backgroundColor: currentQn === q.quality ? ACCENT : colors.fill2, ...continuous }]}>
                          <Text style={[T.caption1, { color: currentQn === q.quality ? '#FFF' : colors.text }]} numberOfLines={1}>{q.new_description}</Text>
                        </Press>
                      ))}
                    </View>
                  </View>
                )}

                {/* ===== 弹幕设置 ===== */}
                {section === 'danmaku' && (
                  <View style={styles.content}>
                    <BackHeader title="弹幕设置" colors={colors} T={T} onBack={() => setSection('main')} />
                    <View style={[styles.row, styles.rowBorder, { borderBottomColor: colors.separator }]}>
                      <Text style={[T.subhead, styles.rowLabel, { color: colors.text }]}>弹幕开关</Text>
                      <Switch
                        value={s.danmakuEnabled}
                        onValueChange={(v) => s.set({ danmakuEnabled: v })}
                        trackColor={{ true: ACCENT, false: colors.fill2 }}
                        thumbColor="#FFFFFF"
                        ios_backgroundColor={colors.fill2}
                      />
                    </View>
                    <View style={[styles.row, styles.rowBorder, { borderBottomColor: colors.separator }]}>
                      <Text style={[T.subhead, styles.rowLabel, { color: colors.text }]}>合并相似</Text>
                      <Switch
                        value={s.mergeDanmaku}
                        onValueChange={(v) => s.set({ mergeDanmaku: v })}
                        trackColor={{ true: ACCENT, false: colors.fill2 }}
                        thumbColor="#FFFFFF"
                        ios_backgroundColor={colors.fill2}
                      />
                    </View>
                    <ChipRow label="字号" options={[12, 14, 16, 18, 20, 24]} current={s.danmakuFontSize}
                      onSelect={(v) => s.set({ danmakuFontSize: v })} colors={colors} T={T}
                      format={(v) => `${v}`} />
                    <ChipRow label="速度" options={[2, 4, 6, 8, 10]} current={s.danmakuSpeed}
                      onSelect={(v) => s.set({ danmakuSpeed: v })} colors={colors} T={T}
                      format={(v) => `${v}s`} />
                    <ChipRow label="透明度" options={[20, 40, 60, 80, 100]} current={Math.round(s.danmakuOpacity * 100)}
                      onSelect={(v) => s.set({ danmakuOpacity: v / 100 })} colors={colors} T={T}
                      format={(v) => `${v}%`} last />
                  </View>
                )}

                {/* ===== CDN ===== */}
                {section === 'cdn' && (
                  <View style={styles.content}>
                    <BackHeader title="CDN 服务" colors={colors} T={T} onBack={() => setSection('main')} />
                    <View style={styles.grid}>
                      {CDN_OPTIONS.map((c) => (
                        <Press key={c.value} haptic scaleTo={0.9}
                          onPress={() => { handleCdnChange(c.value); setSection('main'); showToast(`CDN 已切换为 ${c.label}，正在重载`); }}
                          style={[styles.gridBtn, { backgroundColor: s.cdnService === c.value ? ACCENT : colors.fill2, ...continuous }]}>
                          <Text style={[T.subhead, { color: s.cdnService === c.value ? '#FFF' : colors.text }]}>{c.label}</Text>
                        </Press>
                      ))}
                    </View>
                  </View>
                )}

                {/* ===== 解码格式 ===== */}
                {section === 'codec' && (
                  <View style={styles.content}>
                    <BackHeader title="解码格式" colors={colors} T={T} onBack={() => setSection('main')} />
                    <View style={styles.grid}>
                      {[
                        { label: 'AVC (H.264)', value: 'avc', desc: '兼容性最好' },
                        { label: 'HEVC (H.265)', value: 'hevc', desc: '省流量' },
                        { label: 'AV1', value: 'av1', desc: '最新编码' },
                      ].map((c) => (
                        <Press key={c.value} haptic scaleTo={0.9}
                          onPress={() => { s.set({ preferCodec: c.value }); onReload?.(); setSection('main'); showToast(`已切换为 ${c.label}`); }}
                          style={[styles.gridBtn, { backgroundColor: s.preferCodec === c.value ? ACCENT : colors.fill2, ...continuous }]}>
                          <Text style={[T.subhead, { color: s.preferCodec === c.value ? '#FFF' : colors.text, fontWeight: '600' }]}>{c.label}</Text>
                          <Text style={[T.caption2, { color: s.preferCodec === c.value ? 'rgba(255,255,255,0.7)' : colors.textTertiary, marginTop: 2 }]}>{c.desc}</Text>
                        </Press>
                      ))}
                    </View>
                  </View>
                )}

                {/* ===== 1.4 音量（可拖滑杆） ===== */}
                {section === 'volume' && (
                  <View style={styles.content}>
                    <BackHeader title="音量" colors={colors} T={T} onBack={() => setSection('main')} />
                    <View style={styles.volumeRow}>
                      <Ionicons name="volume-low" size={18} color={colors.textSecondary} />
                      <View style={styles.volumeSliderWrap}>
                        <Slider
                          value={volume / 100}
                          min={0}
                          max={1}
                          step={0.01}
                          onValueChange={(v) => {
                            const next = Math.min(Math.max(v, 0), 1);
                            setVolume(Math.round(next * 100));
                            onVolumeChange?.(next);
                          }}
                        />
                      </View>
                      <Ionicons name="volume-high" size={18} color={colors.textSecondary} />
                    </View>
                    <Text style={[T.footnote, { color: colors.textTertiary, textAlign: 'center' }]}>{volume}%</Text>
                    {/* 快捷预设 */}
                    <View style={[styles.chipRow, { justifyContent: 'center', marginTop: 12 }]}>
                      {[0, 25, 50, 75, 100].map((v) => (
                        <Press key={v} haptic scaleTo={0.9}
                          onPress={() => { setVolume(v); onVolumeChange?.(v / 100); }}
                          style={[styles.chip, { backgroundColor: volume === v ? ACCENT : colors.fill2, ...continuous }]}>
                          <Text style={[T.caption1, { color: volume === v ? '#FFF' : colors.textSecondary }]}>{v}%</Text>
                        </Press>
                      ))}
                    </View>
                  </View>
                )}

                {/* ===== 定时关闭 ===== */}
                {section === 'sleep' && (
                  <View style={styles.content}>
                    <BackHeader title="定时关闭" colors={colors} T={T} onBack={() => setSection('main')} />
                    <View style={styles.grid}>
                      {SLEEP_OPTIONS.map((opt) => (
                        <Press key={opt.value} haptic scaleTo={0.9}
                          onPress={() => handleSleep(opt.value)}
                          style={[styles.gridBtn, { backgroundColor: sleepRemainMin === opt.value && opt.value > 0 ? ACCENT : colors.fill2, ...continuous }]}>
                          <Text style={[T.caption1, { color: sleepRemainMin === opt.value && opt.value > 0 ? '#FFF' : colors.text }]}>{opt.label}</Text>
                        </Press>
                      ))}
                    </View>
                  </View>
                )}
            </>
          );
        }}
      >
      </FlashList>
    </GestureHandlerRootView>
  );

  return (
    <NativeBottomSheet
      visible={visible}
      onClose={onClose}
      detents={['medium', 'large']}
      background={colors.bg}
    >
      <View style={styles.nativeSheet}>
        {sheetContent}
      </View>
    </NativeBottomSheet>
  );
}

/* ===== 子组件 ===== */
function BackHeader({ title, colors, T, onBack }: { title: string; colors: any; T: any; onBack: () => void }) {
  return (
    <Press style={styles.backBtn} onPress={onBack}>
      <Ionicons name="chevron-back" size={18} color={colors.text} />
      <Text style={[T.subhead, { color: colors.text, fontWeight: '600' }]}>{title}</Text>
    </Press>
  );
}

function ChipRow({ label, options, current, onSelect, colors, T, format, last }: {
  label: string; options: number[]; current: number; onSelect: (v: number) => void;
  colors: any; T: any; format: (v: number) => string; last?: boolean;
}) {
  return (
    <View style={[styles.row, !last && { borderBottomColor: colors.separator, borderBottomWidth: StyleSheet.hairlineWidth }]}>
      <Text style={[T.subhead, styles.rowLabel, { color: colors.text }]}>{label}</Text>
      <View style={styles.chipRow}>
        {options.map((v) => (
          <Press key={v} haptic scaleTo={0.9} onPress={() => onSelect(v)}
            style={[styles.chip, { backgroundColor: current === v ? ACCENT : colors.fill2, ...continuous }]}>
            <Text style={[T.caption1, { color: current === v ? '#FFF' : colors.textSecondary }]}>{format(v)}</Text>
          </Press>
        ))}
      </View>
    </View>
  );
}

function ActionCell({ icon, label, colors, T, onPress }: {
  icon: keyof typeof Ionicons.glyphMap; label: string; colors: any; T: any; onPress: () => void;
}) {
  return (
    <Press haptic scaleTo={0.92} onPress={onPress}
      style={[styles.actionCell, { backgroundColor: colors.fill1, ...continuous, ...shadow('sm', colors.isDark) }]}>
      <Ionicons name={icon} size={20} color={colors.textSecondary} />
      <Text style={[T.caption1, { color: colors.text, marginTop: 4 }]} numberOfLines={1}>{label}</Text>
    </Press>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 14 },
  rowBorder: { borderBottomWidth: StyleSheet.hairlineWidth },
  rowLabel: { flex: 1 },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 16 },
  chipRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  chip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: RADII.sm },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  gridBtn: { width: '30%', paddingVertical: 12, borderRadius: RADII.md, alignItems: 'center' },
  actionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  actionCell: {
    width: '30%', paddingVertical: 14, borderRadius: RADII.md,
    alignItems: 'center', justifyContent: 'center',
  },
  /* 1.4 音量滑杆 */
  volumeRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  volumeSliderWrap: { flex: 1, height: 30, justifyContent: 'center' },
  dmListRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 9 },
  nativeSheetFill: { flexGrow: 1, height: 0 },
  nativeSheet: { flex: 1 },
});
