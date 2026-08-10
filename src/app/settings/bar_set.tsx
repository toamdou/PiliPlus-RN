import { useState } from 'react';
import { ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors } from '@/components/SwiftUIHost';
import { useType } from '@/components/type-scale';
import { Press } from '@/components/motion';
import { useSettingsStore } from '@/stores/settings';
import { RADII, continuous } from '@/theme/tokens';
import { feedBackSelection, feedBackSuccess } from '@/utils/feedback';
import { showToast } from '@/utils/toast';

interface BarOption {
  key: string;
  label: string;
}

interface BarEditState {
  order: string[];
  enabled: Record<string, boolean>;
}

const TAB_BAR_OPTIONS: BarOption[] = [
  { key: 'recommend', label: '推荐' },
  { key: 'hot', label: '热门' },
  { key: 'bangumi', label: '番剧' },
  { key: 'live', label: '直播' },
  { key: 'rank', label: '分区' },
  { key: 'cinema', label: '影视' },
];

const NAV_BAR_OPTIONS: BarOption[] = [
  { key: 'home', label: '首页' },
  { key: 'dynamics', label: '动态' },
  { key: 'media', label: '媒体' },
  { key: 'mine', label: '我的' },
];

function makeState(saved: string[], options: BarOption[]): BarEditState {
  const order = [...saved, ...options.map((o) => o.key).filter((k) => !saved.includes(k))];
  const enabled: Record<string, boolean> = {};
  for (const option of options) {
    enabled[option.key] = saved.includes(option.key);
  }
  return { order, enabled };
}

function moveItem(order: string[], index: number, dir: -1 | 1): string[] {
  const target = index + dir;
  if (target < 0 || target >= order.length) return order;
  const next = [...order];
  const [item] = next.splice(index, 1);
  next.splice(target, 0, item);
  return next;
}

export default function BarSetScreen() {
  const router = useRouter();
  const s = useSettingsStore();
  const colors = useThemeColors();
  const T = useType();
  const [tabState, setTabState] = useState<BarEditState>(() => makeState(s.tabBarSort, TAB_BAR_OPTIONS));
  const [navState, setNavState] = useState<BarEditState>(() => makeState(s.navBarSort, NAV_BAR_OPTIONS));

  const save = () => {
    feedBackSelection();
    s.set({
      tabBarSort: tabState.order.filter((k) => tabState.enabled[k]),
      navBarSort: navState.order.filter((k) => navState.enabled[k]),
    });
    feedBackSuccess();
    showToast('已保存，重启生效');
    router.back();
  };

  const reset = () => {
    setTabState(makeState(['recommend', 'hot', 'bangumi', 'live'], TAB_BAR_OPTIONS));
    setNavState(makeState(['home', 'dynamics', 'media', 'mine'], NAV_BAR_OPTIONS));
    showToast('已重置，保存后生效');
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]}>
      <Stack.Title>导航栏排序</Stack.Title>
      <Stack.Header blurEffect="systemMaterial" style={{ shadowColor: 'transparent' }} />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <BarSortSection
          title="首页标签页"
          options={TAB_BAR_OPTIONS}
          state={tabState}
          onChange={setTabState}
          colors={colors}
          T={T}
        />
        <BarSortSection
          title="Navbar"
          options={NAV_BAR_OPTIONS}
          state={navState}
          onChange={setNavState}
          colors={colors}
          T={T}
        />
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
            onPress={save}
            style={[styles.opBtn, styles.saveBtn, { backgroundColor: colors.accent }]}>
            <Ionicons name="checkmark" size={16} color="#FFFFFF" />
            <Text style={[T.subhead, styles.opText, styles.saveText]}>保存</Text>
          </Press>
        </View>
      </ScrollView>
    </View>
  );
}

function BarSortSection({
  title,
  options,
  state,
  onChange,
  colors,
  T,
}: {
  title: string;
  options: BarOption[];
  state: BarEditState;
  onChange: (next: BarEditState) => void;
  colors: ReturnType<typeof useThemeColors>;
  T: ReturnType<typeof useType>;
}) {
  return (
    <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
      <Text style={[T.headline, styles.sectionTitle, { color: colors.text }]}>{title}</Text>
      {state.order.map((key, index) => {
        const option = options.find((o) => o.key === key);
        if (!option) return null;
        const enabled = !!state.enabled[key];
        return (
          <View key={key} style={[styles.row, { borderTopColor: colors.separator }]}>
            <Switch
              value={enabled}
              onValueChange={(v) =>
                onChange({ ...state, enabled: { ...state.enabled, [key]: v } })
              }
              trackColor={{ true: colors.accent, false: colors.fill3 }}
            />
            <Ionicons name="reorder-three-outline" size={18} color={colors.quaternaryLabel} />
            <Text
              style={[
                T.body,
                styles.rowLabel,
                { color: enabled ? colors.text : colors.textTertiary },
              ]}
              numberOfLines={1}>
              {option.label}
            </Text>
            <Press
              haptic="selection"
              scaleTo={0.9}
              disabled={index === 0}
              onPress={() =>
                onChange({ ...state, order: moveItem(state.order, index, -1) })
              }
              style={[
                styles.moveBtn,
                { backgroundColor: colors.fill2, opacity: index === 0 ? 0.35 : 1 },
              ]}>
              <Ionicons name="chevron-up" size={15} color={colors.textSecondary} />
            </Press>
            <Press
              haptic="selection"
              scaleTo={0.9}
              disabled={index === state.order.length - 1}
              onPress={() =>
                onChange({ ...state, order: moveItem(state.order, index, 1) })
              }
              style={[
                styles.moveBtn,
                {
                  backgroundColor: colors.fill2,
                  opacity: index === state.order.length - 1 ? 0.35 : 1,
                },
              ]}>
              <Ionicons name="chevron-down" size={15} color={colors.textSecondary} />
            </Press>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: 16, paddingBottom: 32, gap: 14 },
  section: {
    borderRadius: RADII.lg,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    ...continuous,
  },
  sectionTitle: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 10,
    fontWeight: '700',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  rowLabel: { flex: 1, fontWeight: '500' },
  moveBtn: {
    width: 30,
    height: 30,
    borderRadius: 8,
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
