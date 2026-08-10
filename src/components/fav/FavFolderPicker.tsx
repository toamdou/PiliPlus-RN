import { StyleSheet, Text, View } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Ionicons } from '@expo/vector-icons';
import { type ThemeColors } from '@/components/SwiftUIHost';
import { Press } from '@/components/motion';
import { type TypeScale } from '@/components/type-scale';
import { fixedItemLayout } from '@/utils/list-layout';
import { NativeBottomSheet } from '@/components/NativeBottomSheet';

const rowLayout = fixedItemLayout(58);

export interface FavFolderTarget {
  id: number;
  title: string;
  media_count: number;
}

export function FavFolderPicker({
  visible,
  kind,
  targets,
  colors,
  T,
  onClose,
  onPick,
}: {
  visible: boolean;
  kind: 'copy' | 'move';
  targets: FavFolderTarget[];
  colors: ThemeColors;
  T: TypeScale;
  onClose: () => void;
  onPick: (id: number) => void;
}) {
  return (
    <NativeBottomSheet visible={visible} onClose={onClose} detents={['medium']} dragIndicator="visible" background={colors.bg}>
      <View style={{ flex: 1 }}>
        <View style={[styles.modalHeader, { borderBottomColor: colors.separator }]}>
          <Text style={[T.subhead, styles.modalTitle, { color: colors.text }]}>
            {kind === 'copy' ? '复制到收藏夹' : '移动到收藏夹'}
          </Text>
          <Press haptic scaleTo={0.88} onPress={onClose} style={styles.modalClose}>
            <Ionicons name="close" size={20} color={colors.textSecondary} />
          </Press>
        </View>
        <FlashList
          data={targets}
          keyExtractor={(f) => String(f.id)}
          style={styles.sheetList}
          contentContainerStyle={styles.modalList}
          estimatedItemSize={58}
          windowSize={9}
          initialNumToRender={10}
          maxToRenderPerBatch={12}
          overrideProps={{ initialDrawBatchSize: 10 }}
          overrideItemLayout={rowLayout}
          renderItem={({ item }) => (
            <Press haptic scaleTo={0.96} onPress={() => onPick(item.id)} style={[styles.pickRow, { borderBottomColor: colors.separator }]}>
              <View style={[styles.pickIcon, { backgroundColor: colors.fill2 }]}>
                <Ionicons name="folder-outline" size={18} color={colors.textSecondary} />
              </View>
              <Text style={[T.subhead, styles.pickTitle, { color: colors.text }]} numberOfLines={1}>{item.title}</Text>
              <Text style={[T.caption1, { color: colors.textTertiary }]}>{`${item.media_count} 个`}</Text>
            </Press>
          )}
          ListEmptyComponent={
            <View style={styles.emptyWrap}>
              <Text style={[T.footnote, { color: colors.textTertiary }]}>没有其他收藏夹</Text>
            </View>
          }
        />
      </View>
    </NativeBottomSheet>
  );
}

const styles = StyleSheet.create({
  sheetList: { flex: 1 },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  modalTitle: { fontWeight: '700' },
  modalClose: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  modalList: { paddingHorizontal: 16, paddingBottom: 30 },
  pickRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  pickIcon: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  pickTitle: { flex: 1 },
  emptyWrap: { alignItems: 'center', justifyContent: 'center', paddingTop: 110, paddingHorizontal: 40, gap: 8 },
});
