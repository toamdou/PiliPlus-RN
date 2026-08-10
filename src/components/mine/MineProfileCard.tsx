import { StyleSheet, Text, View } from 'react-native';
import { Link } from 'expo-router';
import { Image as ExpoImage } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { ACCENT, type ThemeColors } from '@/components/SwiftUIHost';
import { Press, Reveal } from '@/components/motion';
import { type TypeScale } from '@/components/type-scale';
import { RADII, shadow, continuous } from '@/theme/tokens';
import { biliCover } from '@/utils/image-url';
import type { UserInfo } from '@/stores/auth';

export function MineProfileCard({
  isLoggedIn,
  userInfo,
  isVip,
  colors,
  T,
}: {
  isLoggedIn: boolean;
  userInfo: UserInfo | null;
  isVip: boolean;
  colors: ThemeColors;
  T: TypeScale;
}) {
  return (
    <Reveal delay={0}>
      <Link href={(isLoggedIn ? { pathname: '/settings' } : { pathname: '/login' }) as any} asChild>
        <Press
          haptic
          scaleTo={0.98}
          style={StyleSheet.flatten([
            styles.profileCard,
            {
              backgroundColor: colors.card,
              ...shadow('md', colors.isDark),
              borderWidth: StyleSheet.hairlineWidth,
              borderColor: colors.cardBorder,
            },
          ])}>
          {isLoggedIn && userInfo ? (
            <View style={styles.profileInner}>
              <View style={styles.avatarWrap}>
                <ExpoImage
                  source={userInfo.face ? { uri: biliCover(userInfo.face, 128, 128) } : require('../../../assets/noface.jpeg')}
                  style={styles.avatar}
                  contentFit="cover"
                />
                <View style={[styles.levelBadge, { backgroundColor: ACCENT }]}>
                  <Text style={styles.levelText}>{`LV${userInfo.level}`}</Text>
                </View>
              </View>
              <View style={styles.profileTextWrap}>
                <View style={styles.nameRow}>
                  <Text style={[T.title3, styles.userName, { color: colors.text }]} numberOfLines={1}>
                    {userInfo.name}
                  </Text>
                  {isVip && (
                    <View style={styles.vipBadge}>
                      <Ionicons name="ribbon" size={11} color="#FFFFFF" />
                      <Text style={styles.vipText}>大会员</Text>
                    </View>
                  )}
                </View>
                <Text style={[T.footnote, styles.userSign, { color: colors.textSecondary }]} numberOfLines={2}>
                  {userInfo.sign || '这个人很懒，什么都没有写'}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.quaternaryLabel} />
            </View>
          ) : (
            <View style={styles.profileInner}>
              <View style={[styles.avatarPlaceholder, { backgroundColor: colors.fill2 }]}>
                <Ionicons name="person" size={34} color={colors.textTertiary} />
              </View>
              <View style={styles.profileTextWrap}>
                <Text style={[T.title3, styles.loginTitle, { color: colors.text }]}>点击登录</Text>
                <Text style={[T.footnote, styles.userSign, { color: colors.textSecondary }]}>
                  登录后畅享完整功能
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.quaternaryLabel} />
            </View>
          )}
        </Press>
      </Link>
    </Reveal>
  );
}

const styles = StyleSheet.create({
  profileCard: {
    borderRadius: RADII.card,
    ...continuous,
  },
  profileInner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 18,
    gap: 14,
  },
  avatarWrap: { position: 'relative' },
  avatar: {
    width: 66,
    height: 66,
    borderRadius: 33,
    backgroundColor: '#E5E5EA',
  },
  avatarPlaceholder: {
    width: 66,
    height: 66,
    borderRadius: 33,
    justifyContent: 'center',
    alignItems: 'center',
  },
  levelBadge: {
    position: 'absolute',
    bottom: -2,
    right: -4,
    borderRadius: 8,
    paddingHorizontal: 5,
    paddingVertical: 1.5,
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },
  levelText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  profileTextWrap: { flex: 1, gap: 4 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  userName: { fontWeight: '700', flexShrink: 1 },
  vipBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FB7299',
    borderRadius: 6,
    paddingHorizontal: 5,
    paddingVertical: 1.5,
    gap: 2,
  },
  vipText: { color: '#FFFFFF', fontSize: 9, fontWeight: '700' },
  loginTitle: { fontWeight: '700' },
  userSign: {},
});
