/**
 * member 空间各 tab 共享件：
 *  - MemberTabProps：各 tab 列表组件统一入参（mid / ProfileHeader / 滚动 ref）；
 *  - TabEmpty：空态（图标 + 文案，对齐主文件 emptyWrap 布局）；
 *  - TabError：错误态（图标 + 文案 + 重试，配合 usePagedList 的 error/refresh）。
 */
import type React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { useThemeColors, ACCENT } from '@/components/SwiftUIHost';
import { useType } from '@/components/type-scale';
import { Press } from '@/components/motion';
import { RADII, continuous } from '@/theme/tokens';

type IoniconName = ComponentProps<typeof Ionicons>['name'];

export interface MemberTabProps {
  mid: number;
  header: React.ReactElement;
  listRef: React.RefObject<any>;
}

export function TabEmpty({ icon, text }: { icon: IoniconName; text: string }): React.JSX.Element {
  const colors = useThemeColors();
  const T = useType();
  return (
    <View style={styles.wrap}>
      <Ionicons name={icon} size={34} color={colors.textTertiary} />
      <Text style={[T.footnote, styles.text, { color: colors.textSecondary }]}>{text}</Text>
    </View>
  );
}

export function TabError({ message, onRetry }: { message: string; onRetry: () => void }): React.JSX.Element {
  const colors = useThemeColors();
  const T = useType();
  return (
    <View style={styles.wrap}>
      <Ionicons name="cloud-offline-outline" size={34} color={colors.textTertiary} />
      <Text style={[T.footnote, styles.text, { color: colors.textSecondary }]}>{message}</Text>
      <Press haptic scaleTo={0.94} onPress={onRetry} style={styles.retryBtn}>
        <Text style={[T.subhead, styles.retryText]}>重试</Text>
      </Press>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', paddingTop: 50, gap: 8 },
  text: {},
  retryBtn: {
    marginTop: 8,
    backgroundColor: ACCENT,
    borderRadius: RADII.lg,
    paddingHorizontal: 28,
    paddingVertical: 8,
    ...continuous,
  },
  retryText: { color: '#FFFFFF', fontWeight: '600' },
});
