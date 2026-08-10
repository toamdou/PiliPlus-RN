import { StyleSheet, Text as RNText } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Glass } from '@/components/Glass';
import { Press } from '@/components/motion';
import { useThemeColors } from '@/components/SwiftUIHost';
import { useType } from '@/components/type-scale';
import { RADII, continuous, shadow } from '@/theme/tokens';

export interface SuggestItem {
  value: string;
  term?: string;
}

interface SearchSuggestionRowProps {
  suggestions: SuggestItem[];
  visible: boolean;
  onSelect: (value: string) => void;
}

export function SearchSuggestionRow({ suggestions, visible, onSelect }: SearchSuggestionRowProps) {
  const colors = useThemeColors();
  const T = useType();

  if (!visible || suggestions.length === 0) return null;

  return (
    <Glass variant="regular" style={[styles.suggestCard, continuous, shadow('glass', colors.isDark)]}>
      {suggestions.map((s, i) => (
        <Press
          key={i}
          haptic
          scaleTo={0.97}
          style={styles.suggestItem}
          onPress={() => onSelect(s.value)}>
          <Ionicons name="search" size={14} color={colors.textTertiary} />
          <RNText style={[T.subhead, { color: colors.text, flex: 1 }]} numberOfLines={1}>
            {s.value}
          </RNText>
        </Press>
      ))}
    </Glass>
  );
}

const styles = StyleSheet.create({
  suggestCard: {
    marginHorizontal: 14,
    marginTop: 6,
    marginBottom: 4,
    borderRadius: RADII.md,
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  suggestItem: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 10 },
});
