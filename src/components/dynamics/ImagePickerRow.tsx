import { View, StyleSheet } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors } from '@/components/SwiftUIHost';
import { Press } from '@/components/motion';
import { RADII, continuous } from '@/theme/tokens';

export function ImagePickerRow({
  images,
  max,
  onAdd,
  onRemove,
}: {
  images: string[];
  max: number;
  onAdd: () => void;
  onRemove: (index: number) => void;
}) {
  const colors = useThemeColors();
  if (images.length === 0) return null;

  return (
    <View style={styles.imageGrid}>
      {images.map((uri, idx) => (
        <View key={idx} style={styles.imageItem}>
          <ExpoImage source={{ uri }} recyclingKey={uri} style={styles.imageThumb} contentFit="cover" />
          <Press onPress={() => onRemove(idx)} style={styles.imageRemove}>
            <Ionicons name="close-circle" size={20} color="#FF3B30" />
          </Press>
        </View>
      ))}
      {images.length < max ? (
        <Press onPress={onAdd} style={[styles.imageAdd, { borderColor: colors.separator }]}>
          <Ionicons name="add" size={24} color={colors.textTertiary} />
        </Press>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  imageGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 16 },
  imageItem: {
    width: 100,
    height: 100,
    borderRadius: RADII.sm,
    overflow: 'hidden',
    ...continuous,
  },
  imageThumb: { width: '100%', height: '100%' },
  imageRemove: { position: 'absolute', top: 4, right: 4 },
  imageAdd: {
    width: 100,
    height: 100,
    borderRadius: RADII.sm,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
    ...continuous,
  },
});
