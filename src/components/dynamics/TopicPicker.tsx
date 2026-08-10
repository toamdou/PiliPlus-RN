import { View, Text, TextInput, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors, ACCENT } from '@/components/SwiftUIHost';
import { Press } from '@/components/motion';
import { useType } from '@/components/type-scale';
import { formatCount } from '@/utils/format';
import { RADII, continuous, shadow } from '@/theme/tokens';

export interface TopicItem {
  id: number;
  name: string;
  view?: number;
  discuss?: number;
  description?: string;
}

export function TopicPicker({
  topic,
  open,
  keyword,
  loading,
  topics,
  onKeywordChange,
  onSelect,
  onRemove,
}: {
  topic: TopicItem | null;
  open: boolean;
  keyword: string;
  loading: boolean;
  topics: TopicItem[];
  onKeywordChange: (kw: string) => void;
  onSelect: (topic: TopicItem) => void;
  onRemove: () => void;
}) {
  const colors = useThemeColors();
  const T = useType();

  return (
    <>
      {topic ? (
        <View style={styles.attachedRow}>
          <Ionicons name="pricetag" size={14} color={ACCENT} />
          <Text style={[T.footnote, styles.attachedText, { color: ACCENT }]} numberOfLines={1}>
            {topic.name}
          </Text>
          <Press hitSlop={8} onPress={onRemove}>
            <Ionicons name="close-circle" size={18} color={colors.textTertiary} />
          </Press>
        </View>
      ) : null}

      {open ? (
        <View style={[styles.panel, { backgroundColor: colors.card, ...shadow('sm', colors.isDark) }]}>
          <TextInput
            style={[styles.fieldInput, { color: colors.text }]}
            placeholder="搜索话题"
            placeholderTextColor={colors.textTertiary}
            value={keyword}
            onChangeText={onKeywordChange}
            maxLength={30}
          />
          {loading && topics.length === 0 ? (
            <Text style={[T.caption1, styles.panelEmpty, { color: colors.textTertiary }]}>加载中...</Text>
          ) : topics.length === 0 ? (
            <Text style={[T.caption1, styles.panelEmpty, { color: colors.textTertiary }]}>暂无话题</Text>
          ) : (
            topics.map((t) => (
              <Press key={t.id} haptic scaleTo={0.98} onPress={() => onSelect(t)} style={styles.topicRow}>
                <Ionicons name="pricetag-outline" size={15} color={colors.textSecondary} />
                <Text style={[T.subhead, styles.topicName, { color: colors.text }]} numberOfLines={1}>
                  {t.name}
                </Text>
                <Text style={[T.caption2, { color: colors.textTertiary }]}>{formatCount(t.view ?? 0)}浏览</Text>
              </Press>
            ))
          )}
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
  panelEmpty: { paddingVertical: 12, textAlign: 'center' },
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
  attachedText: { flex: 1, fontWeight: '500' },
  topicRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 9 },
  topicName: { flex: 1, fontWeight: '500' },
});
