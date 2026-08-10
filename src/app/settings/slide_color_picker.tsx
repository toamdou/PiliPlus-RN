import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { Stack } from 'expo-router';
import { Slider } from '@expo/ui';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors } from '@/components/SwiftUIHost';
import { useType } from '@/components/type-scale';
import { Press } from '@/components/motion';
import { useSettingsStore } from '@/stores/settings';
import { RADII, continuous } from '@/theme/tokens';
import { feedBackSelection, feedBackSuccess } from '@/utils/feedback';
import { showToast } from '@/utils/toast';

interface Rgb {
  r: number;
  g: number;
  b: number;
}

function hexToRgb(hex: string): Rgb {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return { r: 255, g: 255, b: 255 };
  const n = parseInt(match[1], 16);
  return { r: (n >> 16) & 0xff, g: (n >> 8) & 0xff, b: n & 0xff };
}

function rgbToHex(rgb: Rgb): string {
  const n = (1 << 24) | (rgb.r << 16) | (rgb.g << 8) | rgb.b;
  return `#${n.toString(16).slice(1).toUpperCase()}`;
}

const QUICK_COLORS = ['#FFFFFF', '#FFFF00', '#FF7299', '#FF3B30', '#00D400', '#00A0DC', '#A0D8EF', '#FE0302'];

export default function SlideColorPickerScreen() {
  const s = useSettingsStore();
  const colors = useThemeColors();
  const T = useType();
  const [rgb, setRgb] = useState<Rgb>(() => hexToRgb(s.danmakuColor));
  const [hex, setHex] = useState(() => s.danmakuColor.replace('#', '').toUpperCase());
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    },
    [],
  );

  const scheduleSave = (next: Rgb) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => s.set({ danmakuColor: rgbToHex(next) }), 250);
  };

  const applyHex = (text: string) => {
    const clean = text.replace(/[^0-9a-fA-F]/g, '').slice(0, 6).toUpperCase();
    setHex(clean);
    if (clean.length === 6) {
      const next = hexToRgb(clean);
      setRgb(next);
      scheduleSave(next);
    }
  };

  const updateChannel = (channel: keyof Rgb, value: number) => {
    const next = { ...rgb, [channel]: Math.round(value) };
    setRgb(next);
    setHex(rgbToHex(next).slice(1));
    scheduleSave(next);
  };

  const flush = () => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    s.set({ danmakuColor: rgbToHex(rgb) });
    feedBackSuccess();
    showToast('已保存');
  };

  const reset = () => {
    const next = { r: 255, g: 255, b: 255 };
    setRgb(next);
    setHex('FFFFFF');
    s.set({ danmakuColor: '#FFFFFF' });
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]}>
      <Stack.Title>弹幕颜色</Stack.Title>
      <Stack.Header blurEffect="systemMaterial" style={{ shadowColor: 'transparent' }} />
      <View style={styles.content}>
        <View style={[styles.preview, { backgroundColor: rgbToHex(rgb) }]} />
        <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
          <View style={[styles.hexRow, { borderBottomColor: colors.separator }]}>
            <Text style={[T.body, styles.hexPrefix, { color: colors.text }]}>#</Text>
            <TextInput
              value={hex}
              onChangeText={applyHex}
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={6}
              placeholder="FFFFFF"
              placeholderTextColor={colors.textTertiary}
              style={[T.body, styles.hexInput, { color: colors.text }]}
            />
            <Text style={[T.caption1, { color: colors.textSecondary }]}>RGB</Text>
          </View>

          <ChannelSlider
            label="R"
            value={rgb.r}
            color="#FF3B30"
            onChange={(v) => updateChannel('r', v)}
            colors={colors}
            T={T}
          />
          <ChannelSlider
            label="G"
            value={rgb.g}
            color="#34C759"
            onChange={(v) => updateChannel('g', v)}
            colors={colors}
            T={T}
          />
          <ChannelSlider
            label="B"
            value={rgb.b}
            color="#007AFF"
            onChange={(v) => updateChannel('b', v)}
            colors={colors}
            T={T}
          />
        </View>

        <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
          <View style={styles.quickRow}>
            {QUICK_COLORS.map((color) => {
              const selected = rgbToHex(rgb).toUpperCase() === color.toUpperCase();
              return (
                <Press
                  key={color}
                  haptic="selection"
                  scaleTo={0.88}
                  onPress={() => {
                    const next = hexToRgb(color);
                    setRgb(next);
                    setHex(color.slice(1));
                    scheduleSave(next);
                    feedBackSelection();
                  }}
                  style={[
                    styles.quickSwatch,
                    { backgroundColor: color, borderColor: selected ? colors.text : colors.border },
                  ]}>
                  {selected && <Ionicons name="checkmark" size={16} color="#FFFFFF" />}
                </Press>
              );
            })}
          </View>
        </View>

        <View style={styles.opsRow}>
          <Press
            haptic
            scaleTo={0.97}
            onPress={reset}
            style={[styles.opBtn, { backgroundColor: colors.fill2 }]}>
            <Ionicons name="refresh" size={16} color={colors.textSecondary} />
            <Text style={[T.subhead, styles.opText, { color: colors.textSecondary }]}>重置</Text>
          </Press>
          <Press
            haptic="medium"
            scaleTo={0.97}
            onPress={flush}
            style={[styles.opBtn, styles.saveBtn, { backgroundColor: colors.accent }]}>
            <Ionicons name="checkmark" size={16} color="#FFFFFF" />
            <Text style={[T.subhead, styles.opText, styles.saveText]}>保存</Text>
          </Press>
        </View>
      </View>
    </View>
  );
}

function ChannelSlider({
  label,
  value,
  color,
  onChange,
  colors,
  T,
}: {
  label: string;
  value: number;
  color: string;
  onChange: (value: number) => void;
  colors: ReturnType<typeof useThemeColors>;
  T: ReturnType<typeof useType>;
}) {
  return (
    <View style={[styles.channelRow, { borderTopColor: colors.separator }]}>
      <Text style={[T.subhead, styles.channelLabel, { color }]}>{label}</Text>
      <View style={styles.sliderWrap}>
        <Slider
          value={value}
          min={0}
          max={255}
          step={1}
          onValueChange={onChange}
        />
      </View>
      <Text style={[T.caption1, styles.channelValue, { color: colors.textSecondary }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: 16, paddingBottom: 32, gap: 14 },
  preview: {
    height: 96,
    borderRadius: RADII.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(0,0,0,0.12)',
    ...continuous,
  },
  section: {
    borderRadius: RADII.lg,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    ...continuous,
  },
  hexRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  hexPrefix: { fontWeight: '700', marginRight: 2 },
  hexInput: { flex: 1, fontWeight: '600' },
  channelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  channelLabel: { width: 16, fontWeight: '700' },
  sliderWrap: { flex: 1 },
  channelValue: { width: 34, textAlign: 'right' },
  quickRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    padding: 16,
  },
  quickSwatch: {
    width: 38,
    height: 38,
    borderRadius: RADII.circle,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  opsRow: { flexDirection: 'row', gap: 10 },
  opBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: RADII.lg,
    paddingVertical: 13,
    ...continuous,
  },
  saveBtn: { marginTop: 0 },
  opText: { fontWeight: '600' },
  saveText: { color: '#FFFFFF' },
});
