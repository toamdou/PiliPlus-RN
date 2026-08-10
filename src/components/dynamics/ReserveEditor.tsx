import { View, Text, TextInput, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors, ACCENT } from '@/components/SwiftUIHost';
import { Press } from '@/components/motion';
import { useType } from '@/components/type-scale';
import { formatDate } from '@/utils/format';
import { RADII, continuous, shadow } from '@/theme/tokens';

export interface ReserveDraft {
  title: string;
  ts: number;
}

const RESERVE_HOURS = [10, 12, 14, 16, 18, 20, 22];
const RESERVE_MINUTES = [0, 30];

function dayLabel(offset: number): string {
  if (offset === 0) return '今天';
  if (offset === 1) return '明天';
  if (offset === 2) return '后天';
  return `${offset}天后`;
}

export function defaultReserveTs(): number {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(20, 0, 0, 0);
  return Math.floor(d.getTime() / 1000);
}

function reserveDayOffset(ts: number): number {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const target = new Date(ts * 1000);
  const day = new Date(target.getFullYear(), target.getMonth(), target.getDate()).getTime();
  return Math.round((day - start) / 86400000);
}

export function ReserveEditor({
  draft,
  open,
  onToggle,
  onTitleChange,
  onDayChange,
  onClockChange,
  onRemove,
}: {
  draft: ReserveDraft | null;
  open: boolean;
  onToggle: () => void;
  onTitleChange: (v: string) => void;
  onDayChange: (offset: number) => void;
  onClockChange: (hour: number, minute: number) => void;
  onRemove: () => void;
}) {
  const colors = useThemeColors();
  const T = useType();
  if (!draft) return null;
  const reserveClock = new Date(draft.ts * 1000);

  return (
    <>
      {!open ? (
        <View style={styles.attachedRow}>
          <Press onPress={onToggle} style={styles.attachedMain}>
            <Ionicons name="calendar" size={14} color={ACCENT} />
            <Text style={[T.footnote, styles.attachedText, { color: colors.text }]} numberOfLines={1}>
              {draft.title.trim() || '直播预约（未填写标题）'}
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
            <Ionicons name="calendar" size={15} color={ACCENT} />
            <Text style={[T.subhead, styles.panelHeaderText, { color: colors.text }]}>直播预约</Text>
            <Press hitSlop={8} onPress={onToggle} style={styles.panelHeaderClose}>
              <Ionicons name="chevron-up" size={18} color={colors.textTertiary} />
            </Press>
          </View>
          <TextInput
            style={[styles.fieldInput, { color: colors.text }]}
            placeholder="预约标题"
            placeholderTextColor={colors.textTertiary}
            value={draft.title}
            onChangeText={onTitleChange}
            maxLength={30}
          />
          <Text style={[T.caption1, { color: colors.textTertiary, marginTop: 10 }]}>直播日期</Text>
          <View style={styles.dayRow}>
            {[0, 1, 2, 3, 4, 5, 6].map((o) => (
              <Press
                key={o}
                onPress={() => onDayChange(o)}
                style={[styles.dayChip, reserveDayOffset(draft.ts) === o && styles.dayChipActive]}>
                <Text style={[T.caption1, { color: reserveDayOffset(draft.ts) === o ? '#FFFFFF' : colors.textSecondary }]}>
                  {dayLabel(o)}
                </Text>
              </Press>
            ))}
          </View>
          <Text style={[T.caption1, { color: colors.textTertiary, marginTop: 10 }]}>开始时间</Text>
          <View style={styles.dayRow}>
            {RESERVE_HOURS.map((h) => (
              <Press
                key={h}
                onPress={() => onClockChange(h, reserveClock.getMinutes())}
                style={[styles.dayChip, reserveClock.getHours() === h && styles.dayChipActive]}>
                <Text style={[T.caption1, { color: reserveClock.getHours() === h ? '#FFFFFF' : colors.textSecondary }]}>{h}:00</Text>
              </Press>
            ))}
            {RESERVE_MINUTES.map((m) => (
              <Press
                key={`m${m}`}
                onPress={() => onClockChange(reserveClock.getHours(), m)}
                style={[styles.dayChip, reserveClock.getMinutes() === m && styles.dayChipActive]}>
                <Text style={[T.caption1, { color: reserveClock.getMinutes() === m ? '#FFFFFF' : colors.textSecondary }]}>
                  {String(reserveClock.getMinutes() === m ? reserveClock.getMinutes() : m).padStart(2, '0')}分
                </Text>
              </Press>
            ))}
          </View>
          <Text style={[T.caption1, { color: colors.textSecondary, marginTop: 10 }]}>
            {formatDate(draft.ts)} 开播
          </Text>
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
