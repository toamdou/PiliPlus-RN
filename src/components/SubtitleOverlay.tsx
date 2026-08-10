import { memo, useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, Alert } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Ionicons } from '@expo/vector-icons';
import { useSettingsStore } from '@/stores/settings';
import { Press } from '@/components/motion';
import { useThemeColors } from '@/components/SwiftUIHost';
import { showToast } from '@/utils/toast';
import { PiliPlayer } from 'pili-player';
import {
  bindPlayer,
  PiliSubtitleOverlay,
} from 'pili-danmaku';

interface SubtitleItem {
  from: number;
  to: number;
  content: string;
}

interface Props {
  subtitles: SubtitleItem[];
  visible: boolean;
  isFullscreen?: boolean;
}

function isValidSubtitleItem(value: unknown): value is SubtitleItem {
  if (typeof value !== 'object' || value == null) return false;
  const item = value as Record<string, unknown>;
  return (
    Number.isFinite(item.from) &&
    Number.isFinite(item.to) &&
    typeof item.content === 'string'
  );
}

export const SubtitleOverlay = memo(function SubtitleOverlay({ subtitles, visible, isFullscreen }: Props) {
  const [localSubtitles, setLocalSubtitles] = useState<SubtitleItem[] | null>(null);
  const s = useSettingsStore();
  const colors = useThemeColors();
  const effectiveSubtitles = localSubtitles ?? subtitles;

  // 原生路径绑定共享 AVPlayer 作为字幕时钟源，时间由原生时钟驱动。
  useEffect(() => {
    bindPlayer(PiliPlayer.shared.getSharedPlayerId());
  }, []);

  const exportToClipboard = useCallback(async () => {
    if (effectiveSubtitles.length === 0) {
      showToast('没有可导出的字幕');
      return;
    }
    try {
      await Clipboard.setStringAsync(JSON.stringify(effectiveSubtitles, null, 2));
      showToast(`已导出 ${effectiveSubtitles.length} 条字幕 JSON`);
    } catch {
      showToast('导出失败');
    }
  }, [effectiveSubtitles]);

  const importFromClipboard = useCallback(async () => {
    try {
      const text = await Clipboard.getStringAsync();
      const parsed: unknown = JSON.parse(text || '[]');
      if (!Array.isArray(parsed)) throw new Error('剪贴板内容不是字幕数组');
      const items = parsed.filter(isValidSubtitleItem).map((item) => ({
        from: Number(item.from),
        to: Number(item.to),
        content: String(item.content),
      }));
      if (items.length === 0) throw new Error('未找到有效字幕');
      setLocalSubtitles(items);
      showToast(`已导入 ${items.length} 条字幕`);
    } catch (e) {
      showToast(`导入失败：${e instanceof Error ? e.message : String(e)}`);
    }
  }, []);

  const handleMenu = useCallback(() => {
    Alert.alert('本地字幕', undefined, [
      { text: '从剪贴板导入', onPress: () => { void importFromClipboard(); } },
      { text: '导出字幕 JSON', onPress: () => { void exportToClipboard(); } },
      ...(localSubtitles ? [{ text: '恢复在线字幕', onPress: () => setLocalSubtitles(null) }] : []),
      { text: '取消', style: 'cancel' },
    ]);
  }, [exportToClipboard, importFromClipboard, localSubtitles]);

  const menuButton = visible && effectiveSubtitles.length > 0 ? (
    <Press
      haptic="selection"
      onPress={handleMenu}
      accessibilityRole="button"
      accessibilityLabel="字幕导入导出"
      style={[styles.menuBtn, { backgroundColor: colors.card }]}>
      <Ionicons name="document-text-outline" size={14} color={colors.textSecondary} />
      <Text style={[styles.menuBtnText, { color: colors.textSecondary }]}>字幕</Text>
    </Press>
  ) : null;

  const fontSizeScale = (isFullscreen ? (s.subtitleFontScaleFS || 1.5) : (s.subtitleFontScale || 1.0));
  const strokeWidth = s.subtitleStrokeWidth ?? 2;
  const bgOpacity = s.subtitleBgOpacity ?? 0.67;
  const paddingH = s.subtitlePaddingH ?? 24;
  const paddingB = s.subtitlePaddingB ?? 24;
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <PiliSubtitleOverlay
        style={StyleSheet.absoluteFill}
        subtitles={effectiveSubtitles}
        visible={visible}
        fontSizeScale={fontSizeScale}
        strokeWidth={strokeWidth}
        fontWeight={s.subtitleFontWeight ?? 5}
        paddingHorizontal={paddingH}
        paddingBottom={paddingB}
        backgroundOpacity={bgOpacity}
        pointerEvents="none"
      />
      {menuButton}
    </View>
  );
});

const styles = StyleSheet.create({
  menuBtn: {
    alignSelf: 'flex-end',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 8,
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 15,
  },
  menuBtnText: {
    fontSize: 12,
    fontWeight: '600',
  },
});
