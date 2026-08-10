import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Press } from '@/components/motion';
import { useThemeColors, ACCENT } from '@/components/SwiftUIHost';

interface CreateDynToolbarProps {
  topicActive: boolean;
  mentionActive: boolean;
  voteActive: boolean;
  reserveActive: boolean;
  onPickImages: () => void;
  onToggleTopic: () => void;
  onInsertAt: () => void;
  onToggleVote: () => void;
  onToggleReserve: () => void;
}

export function CreateDynToolbar({
  topicActive,
  mentionActive,
  voteActive,
  reserveActive,
  onPickImages,
  onToggleTopic,
  onInsertAt,
  onToggleVote,
  onToggleReserve,
}: CreateDynToolbarProps) {
  const colors = useThemeColors();

  return (
    <View style={styles.toolbar}>
      <Press haptic onPress={onPickImages} style={styles.toolBtn}>
        <Ionicons name="images-outline" size={22} color={colors.textSecondary} />
      </Press>
      <Press haptic onPress={onToggleTopic} style={styles.toolBtn}>
        <Ionicons name="pricetag-outline" size={22} color={topicActive ? ACCENT : colors.textSecondary} />
      </Press>
      <Press haptic onPress={onInsertAt} style={styles.toolBtn}>
        <Ionicons name="at-outline" size={22} color={mentionActive ? ACCENT : colors.textSecondary} />
      </Press>
      <Press haptic onPress={onToggleVote} style={styles.toolBtn}>
        <Ionicons name="bar-chart-outline" size={22} color={voteActive ? ACCENT : colors.textSecondary} />
      </Press>
      <Press haptic onPress={onToggleReserve} style={styles.toolBtn}>
        <Ionicons name="calendar-outline" size={22} color={reserveActive ? ACCENT : colors.textSecondary} />
      </Press>
    </View>
  );
}

const styles = StyleSheet.create({
  toolbar: { flexDirection: 'row', gap: 20, marginTop: 20 },
  toolBtn: { padding: 8 },
});
