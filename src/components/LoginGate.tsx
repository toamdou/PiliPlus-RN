/**
 * LoginGate —— 未登录空态（图标 + "请先登录" + 去登录按钮）。
 *
 * 消费方按 useAuthStore 的 isLoggedIn 决定是否挂载（与各页面现有"请先登录"
 * 空态一致）；onGoLogin 缺省时 push /login。
 * 纯 RN 实现，不依赖 @expo/ui，可同时用于 SwiftUI Host 页面与普通 RN 页面。
 *
 * 用法：
 *   if (!isLoggedIn) return (
 *     <View style={styles.root}>
 *       <Stack.Title large>…</Stack.Title>
 *       <LoginGate />
 *     </View>
 *   );
 */
import type React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useThemeColors, ACCENT } from '@/components/SwiftUIHost';
import { Press } from '@/components/motion';
import { useType } from '@/components/type-scale';
import { RADII, continuous } from '@/theme/tokens';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

export interface LoginGateProps {
  onGoLogin?: () => void;
  /** 紧凑尺寸：用于弹层/行内等空间受限场景 */
  compact?: boolean;
  title?: string;
  subtitle?: string;
  buttonText?: string;
  icon?: IoniconName;
}

export function LoginGate({
  onGoLogin,
  compact = false,
  title = '请先登录',
  subtitle = '登录后解锁更多功能',
  buttonText = '去登录',
  icon = 'person-circle-outline',
}: LoginGateProps): React.JSX.Element {
  const router = useRouter();
  const colors = useThemeColors();
  const T = useType();

  return (
    <View style={[styles.wrap, compact && styles.wrapCompact]}>
      <View style={[styles.iconBox, compact && styles.iconBoxCompact, { backgroundColor: colors.fill2 }]}>
        <Ionicons name={icon} size={compact ? 28 : 40} color={colors.textTertiary} />
      </View>
      <Text style={[compact ? T.subhead : T.headline, styles.title, { color: colors.text }]}>
        {title}
      </Text>
      <Text style={[compact ? T.caption1 : T.footnote, styles.sub, { color: colors.textSecondary }]}>
        {subtitle}
      </Text>
      <Press
        haptic
        scaleTo={0.94}
        onPress={onGoLogin ?? (() => router.push('/login'))}
        style={[styles.loginBtn, compact && styles.loginBtnCompact]}>
        <Text style={[T.subhead, styles.loginBtnText]}>{buttonText}</Text>
      </Press>
    </View>
  );
}

const styles = StyleSheet.create({
  /* 对齐现有"请先登录"空态（history/dynamics 同款布局） */
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 120,
    paddingHorizontal: 40,
    gap: 8,
  },
  wrapCompact: {
    paddingTop: 64,
    paddingHorizontal: 24,
    gap: 6,
  },
  iconBox: {
    width: 84,
    height: 84,
    borderRadius: 42,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
    ...continuous,
  },
  iconBoxCompact: {
    width: 56,
    height: 56,
    borderRadius: 28,
    marginBottom: 4,
  },
  title: { fontWeight: '600' },
  sub: { textAlign: 'center' },
  loginBtn: {
    marginTop: 14,
    backgroundColor: ACCENT,
    borderRadius: RADII.lg,
    paddingHorizontal: 30,
    paddingVertical: 10,
  },
  loginBtnCompact: {
    marginTop: 10,
    paddingHorizontal: 22,
    paddingVertical: 8,
  },
  loginBtnText: { color: '#FFFFFF', fontWeight: '600' },
});
