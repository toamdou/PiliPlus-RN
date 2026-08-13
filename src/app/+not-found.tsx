/**
 * +not-found —— expo-router 兜底路由（审计 06-C2/N6）。
 *
 * 共享播放器单例 + 拼接型 href（/pgc/${x}、/member/${x} 等）可能 push 到不存在的路由，
 * 没有本兜底页时 expo-router 会直接抛 "No route named X" 异常（dev 红屏 / release 未捕获）。
 * 提供返回首页按钮，避免用户卡死在错误页。
 */
import { View, Text, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors, ACCENT } from '@/components/SwiftUIHost';
import { Press } from '@/components/motion';
import { useType } from '@/components/type-scale';
import { RADII, continuous } from '@/theme/tokens';

export default function NotFoundScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const T = useType();
  const insets = useSafeAreaInsets();

  const goHome = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.bg, paddingTop: insets.top + 80 }]}>
      <View style={[styles.iconWrap, { backgroundColor: colors.fill2 }]}>
        <Ionicons name="compass-outline" size={44} color={colors.textTertiary} />
      </View>
      <Text style={[T.title2, { color: colors.text, marginTop: 20 }]}>页面走丢了</Text>
      <Text style={[T.footnote, { color: colors.textSecondary, marginTop: 8, textAlign: 'center' }]}>
        你访问的页面不存在或已下架
      </Text>
      <Press
        haptic
        scaleTo={0.94}
        onPress={goHome}
        style={[styles.homeBtn, { backgroundColor: ACCENT, borderRadius: RADII.circle, ...continuous }]}>
        <Ionicons name="home-outline" size={18} color="#FFFFFF" />
        <Text style={[T.subhead, { color: '#FFFFFF', fontWeight: '600', marginLeft: 6 }]}>返回首页</Text>
      </Press>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  iconWrap: {
    width: 88,
    height: 88,
    borderRadius: RADII.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  homeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 12,
    marginTop: 28,
  },
});
