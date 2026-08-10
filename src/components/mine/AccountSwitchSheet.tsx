import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import type { EdgeInsets } from 'react-native-safe-area-context';
import type { Account } from '@/stores/auth';
import { type ThemeColors } from '@/components/SwiftUIHost';
import { Press } from '@/components/motion';
import { type TypeScale } from '@/components/type-scale';
import { biliCover } from '@/utils/image-url';
import { NativeBottomSheet } from '@/components/NativeBottomSheet';

export function AccountSwitchSheet({
  visible,
  accounts,
  currentAccountIndex,
  colors,
  T,
  insets,
  onClose,
  onSwitch,
  onRemove,
  onAdd,
}: {
  visible: boolean;
  accounts: Account[];
  currentAccountIndex: number;
  colors: ThemeColors;
  T: TypeScale;
  insets: EdgeInsets;
  onClose: () => void;
  onSwitch: (index: number) => void;
  onRemove: (index: number) => void;
  onAdd: () => void;
}) {
  return (
    <NativeBottomSheet visible={visible} onClose={onClose} detents={['medium', 'large']} dragIndicator="visible" background={colors.bg}>
      <View style={{ flex: 1 }}>
        <View style={[styles.header, { borderBottomColor: colors.separator }]}>
          <Text style={[T.subhead, styles.title, { color: colors.text }]}>切换账号</Text>
          <Press haptic scaleTo={0.88} onPress={onClose} style={styles.close}>
            <Ionicons name="close" size={20} color={colors.textSecondary} />
          </Press>
        </View>
        <ScrollView contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 24 }]}>
          {accounts.map((account, index) => {
            const isCurrent = index === currentAccountIndex;
            return (
              <View key={String(account.mid)} style={[styles.accountRow, { borderBottomColor: colors.separator }]}>
                <Press haptic scaleTo={0.97} onPress={() => onSwitch(index)} style={styles.accountMain}>
                  <ExpoImage
                    source={account.face ? { uri: biliCover(account.face, 128, 128) } : require('../../../assets/noface.jpeg')}
                    style={styles.avatar}
                    contentFit="cover"
                  />
                  <View style={styles.accountInfo}>
                    <Text style={[T.subhead, { color: colors.text }]} numberOfLines={1}>
                      {account.name || '未设置昵称'}
                    </Text>
                    <Text style={[T.caption2, { color: colors.textSecondary }]}>
                      {`UID: ${account.mid}`}
                    </Text>
                  </View>
                </Press>
                {isCurrent ? (
                  <Ionicons name="checkmark-circle" size={22} color={colors.accent} />
                ) : (
                  <Press
                    haptic
                    scaleTo={0.85}
                    hitSlop={10}
                    onPress={() => onRemove(index)}
                    style={styles.deleteButton}>
                    <Ionicons name="trash-outline" size={19} color={colors.textTertiary} />
                  </Press>
                )}
              </View>
            );
          })}
          <Press
            haptic
            scaleTo={0.97}
            onPress={onAdd}
            style={[styles.addAccountRow, { borderBottomColor: colors.separator }]}>
            <View style={[styles.addAccountIcon, { backgroundColor: colors.fill2 }]}>
              <Ionicons name="add" size={20} color={colors.accent} />
            </View>
            <Text style={[T.subhead, { color: colors.accent }]}>添加账号</Text>
          </Press>
        </ScrollView>
      </View>
    </NativeBottomSheet>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  title: { fontWeight: '700' },
  close: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  list: { paddingHorizontal: 16, paddingTop: 4 },
  accountRow: { flexDirection: 'row', alignItems: 'center', gap: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  accountMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  avatar: { width: 42, height: 42, borderRadius: 21 },
  accountInfo: { flex: 1, gap: 2 },
  deleteButton: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  addAccountRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  addAccountIcon: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
});
