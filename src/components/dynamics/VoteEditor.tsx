import { View, Text, TextInput, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors, ACCENT } from '@/components/SwiftUIHost';
import { Press } from '@/components/motion';
import { useType } from '@/components/type-scale';
import { RADII, continuous, shadow } from '@/theme/tokens';

export interface VoteDraft {
  title: string;
  options: string[];
  choiceCnt: number;
  days: number;
}

export const MIN_VOTE_OPTIONS = 2;
export const MAX_VOTE_OPTIONS = 10;
const VOTE_DAYS = [1, 3, 7, 15, 30, 90];

export function VoteEditor({
  draft,
  open,
  multiChoice,
  onToggle,
  onTitleChange,
  onOptionChange,
  onAddOption,
  onRemoveOption,
  onChoiceChange,
  onDaysChange,
  onRemove,
}: {
  draft: VoteDraft | null;
  open: boolean;
  multiChoice: boolean;
  onToggle: () => void;
  onTitleChange: (v: string) => void;
  onOptionChange: (i: number, v: string) => void;
  onAddOption: () => void;
  onRemoveOption: (i: number) => void;
  onChoiceChange: (multi: boolean) => void;
  onDaysChange: (days: number) => void;
  onRemove: () => void;
}) {
  const colors = useThemeColors();
  const T = useType();
  if (!draft) return null;

  return (
    <>
      {!open ? (
        <View style={styles.attachedRow}>
          <Press onPress={onToggle} style={styles.attachedMain}>
            <Ionicons name="bar-chart" size={14} color={ACCENT} />
            <Text style={[T.footnote, styles.attachedText, { color: colors.text }]} numberOfLines={1}>
              {draft.title.trim() || '投票（未填写标题）'}
            </Text>
          </Press>
          <Press hitSlop={8} onPress={onRemove}>
            <Ionicons name="close-circle" size={18} color={colors.textTertiary} />
          </Press>
        </View>
      ) : null}

      {open ? (
        <View style={[styles.panel, { backgroundColor: colors.card, ...shadow('sm', colors.isDark) }]}>
          <View style={styles.panelHeader}>
            <Ionicons name="bar-chart" size={16} color={ACCENT} />
            <Text style={[T.subhead, styles.panelHeaderText, { color: colors.text }]}>投票</Text>
            <Press hitSlop={8} onPress={onToggle} style={styles.panelHeaderClose}>
              <Ionicons name="chevron-up" size={18} color={colors.textTertiary} />
            </Press>
          </View>
          <TextInput
            style={[styles.fieldInput, { color: colors.text }]}
            placeholder="投票标题"
            placeholderTextColor={colors.textTertiary}
            value={draft.title}
            onChangeText={onTitleChange}
            maxLength={32}
          />
          {draft.options.map((opt, i) => (
            <View key={i} style={styles.optionRow}>
              <Text style={[T.caption1, styles.optionLabel, { color: colors.textTertiary }]}>选项{i + 1}</Text>
              <TextInput
                style={[styles.fieldInput, styles.optionInput, { color: colors.text }]}
                placeholder={`选项${i + 1}，最多20字`}
                placeholderTextColor={colors.textTertiary}
                value={opt}
                onChangeText={(v) => onOptionChange(i, v)}
                maxLength={20}
              />
              {draft.options.length > MIN_VOTE_OPTIONS ? (
                <Press hitSlop={8} onPress={() => onRemoveOption(i)}>
                  <Ionicons name="close-circle" size={18} color={colors.textTertiary} />
                </Press>
              ) : null}
            </View>
          ))}
          <View style={styles.panelActions}>
            <Press haptic onPress={onAddOption} style={[styles.chipBtn, { borderColor: colors.separator }]}>
              <Ionicons name="add" size={14} color={colors.textSecondary} />
              <Text style={[T.caption1, { color: colors.textSecondary }]}>添加选项</Text>
            </Press>
            <View style={[styles.segmented, { backgroundColor: colors.fill3 }]}>
              <Press onPress={() => onChoiceChange(false)} style={[styles.segItem, !multiChoice && styles.segItemActive]}>
                <Text style={[T.caption1, { color: multiChoice ? colors.textSecondary : '#FFFFFF' }]}>单选</Text>
              </Press>
              <Press onPress={() => onChoiceChange(true)} style={[styles.segItem, multiChoice && styles.segItemActive]}>
                <Text style={[T.caption1, { color: multiChoice ? '#FFFFFF' : colors.textSecondary }]}>多选</Text>
              </Press>
            </View>
          </View>
          <View style={styles.dayRow}>
            <Text style={[T.caption1, { color: colors.textTertiary }]}>截止</Text>
            {VOTE_DAYS.map((d) => (
              <Press key={d} onPress={() => onDaysChange(d)} style={[styles.dayChip, draft.days === d && styles.dayChipActive]}>
                <Text style={[T.caption1, { color: draft.days === d ? '#FFFFFF' : colors.textSecondary }]}>{d}天</Text>
              </Press>
            ))}
          </View>
        </View>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  panel: {
    borderRadius: RADII.md,
    padding: 12,
    marginTop: 12,
    ...continuous,
  },
  panelHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  panelHeaderText: { fontWeight: '600' },
  panelHeaderClose: { marginLeft: 'auto' },
  fieldInput: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(120,120,128,0.3)',
    paddingVertical: 8,
    fontSize: 15,
  },
  attachedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 12,
    backgroundColor: 'rgba(120,120,128,0.1)',
    borderRadius: RADII.sm,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  attachedMain: { flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 },
  attachedText: { flex: 1, fontWeight: '500' },
  optionRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  optionLabel: { width: 42 },
  optionInput: { flex: 1 },
  panelActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 },
  chipBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderRadius: RADII.circle,
    paddingHorizontal: 12,
    paddingVertical: 6,
    ...continuous,
  },
  segmented: {
    flexDirection: 'row',
    borderRadius: RADII.circle,
    padding: 2,
    ...continuous,
  },
  segItem: { paddingHorizontal: 18, paddingVertical: 5, borderRadius: RADII.circle },
  segItemActive: { backgroundColor: ACCENT },
  dayRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  dayChip: {
    borderRadius: RADII.circle,
    borderWidth: 1,
    borderColor: 'rgba(120,120,128,0.3)',
    paddingHorizontal: 11,
    paddingVertical: 5,
    ...continuous,
  },
  dayChipActive: { backgroundColor: ACCENT, borderColor: ACCENT },
});
