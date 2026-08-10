import { View, Text, StyleSheet } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors } from '@/components/SwiftUIHost';
import { Press } from '@/components/motion';
import { useType } from '@/components/type-scale';
import { biliCover } from '@/utils/image-url';
import { formatCount } from '@/utils/format';
import { RADII, continuous, shadow } from '@/theme/tokens';

export interface MentionUser {
  uid: string;
  name: string;
  face?: string;
  fans?: number;
}

export function MentionPicker({
  keyword,
  users,
  onSelect,
}: {
  keyword: string | null;
  users: MentionUser[];
  onSelect: (user: MentionUser) => void;
}) {
  const colors = useThemeColors();
  const T = useType();
  if (keyword === null) return null;

  return (
    <View style={[styles.panel, { backgroundColor: colors.card, ...shadow('sm', colors.isDark) }]}>
      {users.length === 0 ? (
        <Text style={[T.caption1, styles.panelEmpty, { color: colors.textTertiary }]}>
          正在搜索用户...
        </Text>
      ) : (
        users.map((u) => (
          <Press key={u.uid} haptic scaleTo={0.98} onPress={() => onSelect(u)} style={styles.mentionRow}>
            <ExpoImage source={{ uri: biliCover(u.face || '', 76, 76) }} recyclingKey={u.face || ''} style={[styles.mentionAvatar, { backgroundColor: colors.fill2 }]} contentFit="cover" />
            <View style={styles.mentionInfo}>
              <Text style={[T.subhead, { color: colors.text }]} numberOfLines={1}>{u.name}</Text>
              {u.fans != null ? (
                <Text style={[T.caption2, { color: colors.textTertiary }]}>{formatCount(u.fans)}粉丝</Text>
              ) : null}
            </View>
            <Ionicons name="arrow-up-circle-outline" size={18} color={colors.textTertiary} />
          </Press>
        ))
      )}
    </View>
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
  mentionRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  mentionAvatar: { width: 38, height: 38, borderRadius: 19 },
  mentionInfo: { flex: 1, gap: 1 },
});
