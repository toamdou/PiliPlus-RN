import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Ionicons } from '@expo/vector-icons';
import { type ThemeColors } from '@/components/SwiftUIHost';
import { Press } from '@/components/motion';
import { type TypeScale } from '@/components/type-scale';
import { fixedItemLayout } from '@/utils/list-layout';
import { NativeBottomSheet } from '@/components/NativeBottomSheet';
import { showToast } from '@/utils/toast';
import { RADII, continuous } from '@/theme/tokens';

const rowLayout = fixedItemLayout(58);

export interface FavFolderTarget {
  id: number;
  title: string;
  media_count: number;
}

export type FavFolderPickerKind = 'copy' | 'move' | 'fav';

export function FavFolderPicker({
  visible,
  kind,
  targets,
  colors,
  T,
  onClose,
  onPick,
  onCreate,
}: {
  visible: boolean;
  kind: FavFolderPickerKind;
  targets: FavFolderTarget[];
  colors: ThemeColors;
  T: TypeScale;
  onClose: () => void;
  onPick: (id: number) => void;
  /**
   * 面板内新建收藏夹（仅 fav 模式展示"新建收藏夹"入口）。
   * 返回新建收藏夹的 id；成功后面板自动选中该夹并关闭（对齐 Flutter fav_panel 创建后直接选中的交互）。
   */
  onCreate?: (title: string) => Promise<number | null>;
}) {
  /* 面板内新建收藏夹：展开输入 → 调用 onCreate → 自动选中 */
  const [creating, setCreating] = useState(false);
  const [createTitle, setCreateTitle] = useState('');
  const [showCreate, setShowCreate] = useState(false);

  const title = kind === 'copy' ? '复制到收藏夹' : kind === 'move' ? '移动到收藏夹' : '收藏到收藏夹';
  const canCreate = kind === 'fav' && typeof onCreate === 'function';

  const handleCreate = async () => {
    const name = createTitle.trim();
    if (!name) {
      showToast('名称不能为空');
      return;
    }
    setCreating(true);
    try {
      const newId = await onCreate!(name);
      if (newId != null) {
        setCreateTitle('');
        setShowCreate(false);
        onPick(newId);
      }
    } finally {
      setCreating(false);
    }
  };

  const closeCreate = () => {
    setShowCreate(false);
    setCreateTitle('');
  };

  return (
    <NativeBottomSheet visible={visible} onClose={onClose} detents={['medium']} dragIndicator="visible" background={colors.bg}>
      <View style={{ flex: 1 }}>
        <View style={[styles.modalHeader, { borderBottomColor: colors.separator }]}>
          <Text style={[T.subhead, styles.modalTitle, { color: colors.text }]}>{title}</Text>
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
              <Text style={[T.footnote, { color: colors.textTertiary }]}>
                {canCreate ? '还没有收藏夹，点下方新建一个吧' : '没有其他收藏夹'}
              </Text>
            </View>
          }
          ListFooterComponent={
            canCreate ? (
              showCreate ? (
                /* 新建收藏夹输入态：名称 + 取消/创建并收藏 */
                <View style={styles.createWrap}>
                  <TextInput
                    style={[T.subhead, styles.createInput, { backgroundColor: colors.fill2, color: colors.text }]}
                    placeholder="输入收藏夹名称"
                    placeholderTextColor={colors.textTertiary}
                    value={createTitle}
                    onChangeText={setCreateTitle}
                    maxLength={20}
                    autoFocus
                    returnKeyType="done"
                    onSubmitEditing={handleCreate}
                  />
                  <View style={styles.createActions}>
                    <Press haptic scaleTo={0.95} onPress={closeCreate} style={styles.createCancelBtn}>
                      <Text style={[T.subhead, { color: colors.textSecondary, fontWeight: '600' }]}>取消</Text>
                    </Press>
                    <Press
                      haptic="medium"
                      scaleTo={0.95}
                      onPress={handleCreate}
                      disabled={creating}
                      style={[styles.createConfirmBtn, { backgroundColor: colors.accent }]}>
                      <Text style={[T.subhead, { color: '#FFFFFF', fontWeight: '600' }]}>{creating ? '创建中…' : '创建并收藏'}</Text>
                    </Press>
                  </View>
                </View>
              ) : (
                <Press haptic scaleTo={0.96} onPress={() => { setCreateTitle(''); setShowCreate(true); }} style={styles.createRow}>
                  <View style={[styles.pickIcon, { backgroundColor: colors.fill2 }]}>
                    <Ionicons name="add" size={18} color={colors.accent} />
                  </View>
                  <Text style={[T.subhead, styles.createRowText, { color: colors.accent }]}>新建收藏夹</Text>
                </Press>
              )
            ) : undefined
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
  /* 面板内新建收藏夹（fav_panel：视频页长按收藏按钮 → 选择面板 → 新建） */
  createRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, marginTop: 8 },
  createRowText: { fontWeight: '600' },
  createWrap: { marginTop: 12, gap: 10, paddingBottom: 8 },
  createInput: { height: 42, borderRadius: 12, paddingHorizontal: 12, ...continuous },
  createActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 18 },
  createCancelBtn: { paddingVertical: 8, paddingHorizontal: 6 },
  createConfirmBtn: { paddingVertical: 8, paddingHorizontal: 16, borderRadius: RADII.sm, alignItems: 'center' },
});
