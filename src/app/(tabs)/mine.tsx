import { useState, useEffect, useCallback, useRef } from 'react';
import { Alert, Text, View, StyleSheet } from 'react-native';
import { useRouter, useScrollToTop } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemeColors } from '@/components/SwiftUIHost';
import { useAuthStore } from '@/stores/auth';
import { apiClient, get } from '@/api/client';
import { Api } from '@/api/endpoints';
import { useScrollHideTabBar } from '@/hooks/use-scroll-hide-tab-bar';
import { useType } from '@/components/type-scale';
import { feedBackSuccess } from '@/utils/feedback';
import { showToast } from '@/utils/toast';
import { MineProfileCard } from '@/components/mine/MineProfileCard';
import { MineStatCard, type UserStat } from '@/components/mine/MineStatCard';
import { MineMenuSection } from '@/components/mine/MineMenuSection';
import { MineAnonymousCard } from '@/components/mine/MineAnonymousCard';
import { MineLogoutCard } from '@/components/mine/MineLogoutCard';
import { MineLogoutDialog } from '@/components/mine/MineLogoutDialog';
import { AccountSwitchSheet } from '@/components/mine/AccountSwitchSheet';
import { Press, Reveal } from '@/components/motion';
import Animated from 'react-native-reanimated';
import { RADII, continuous, shadow } from '@/theme/tokens';

const SECTION_GAP = 16;

export default function MineScreen() {
  const colors = useThemeColors();
  const T = useType();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const isLoggedIn = useAuthStore((s) => s.isLoggedIn);
  const userInfo = useAuthStore((s) => s.userInfo);
  const anonymousMode = useAuthStore((s) => s.anonymousMode);
  const accounts = useAuthStore((s) => s.accounts);
  const currentAccountIndex = useAuthStore((s) => s.currentAccountIndex);
  const setAnonymous = useAuthStore((s) => s.setAnonymous);
  const switchAccount = useAuthStore((s) => s.switchAccount);
  const removeAccount = useAuthStore((s) => s.removeAccount);
  const [stat, setStat] = useState<UserStat | null>(null);
  const [showLogout, setShowLogout] = useState(false);
  const [showAccounts, setShowAccounts] = useState(false);
  const listRef = useRef<any>(null);
  useScrollToTop(listRef);

  useEffect(() => {
    if (isLoggedIn && userInfo) {
      get(apiClient, Api.userStat, { vmid: userInfo.mid })
        .then((res: any) => {
          if (res?.data) setStat(res.data);
        })
        .catch(() => {});
    }
  }, [isLoggedIn, userInfo]);

  const isVip = userInfo?.vipStatus === 1;

  const handleSwitchAccount = useCallback(async (index: number) => {
    if (index < 0 || index >= accounts.length) return;
    const target = accounts[index];
    setShowAccounts(false);
    if (index === currentAccountIndex) return;
    await switchAccount(index);
    feedBackSuccess();
    showToast(`已切换到 ${target.name || '新账号'}`);
  }, [accounts, currentAccountIndex, switchAccount]);

  const confirmRemoveAccount = useCallback((index: number) => {
    const account = accounts[index];
    if (!account) return;
    Alert.alert('删除账号', `确定要从本机删除“${account.name || '该账号'}”吗？删除后需重新登录。`, [
      { text: '取消', style: 'cancel' },
      {
        text: '删除',
        style: 'destructive',
        onPress: () => {
          removeAccount(index).then(() => {
            feedBackSuccess();
            showToast('账号已删除');
          });
        },
      },
    ]);
  }, [accounts, removeAccount]);

  const { onScroll: handleScroll } = useScrollHideTabBar(8, insets.top);

  return (
    <View collapsable={false} style={[styles.root, { backgroundColor: colors.bg }]}>
      <Animated.ScrollView
        ref={listRef}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={[styles.scrollContent, { paddingTop: 14 }]}
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={handleScroll}>
        <MineProfileCard isLoggedIn={isLoggedIn} userInfo={userInfo} isVip={isVip} colors={colors} T={T} />

        {isLoggedIn && (
          <Reveal delay={40}>
            <Press
              haptic
              scaleTo={0.97}
              onPress={() => setShowAccounts(true)}
              style={[
                styles.switchCard,
                {
                  backgroundColor: colors.card,
                  ...shadow('md', colors.isDark),
                  borderWidth: StyleSheet.hairlineWidth,
                  borderColor: colors.cardBorder,
                },
              ]}>
              <View style={styles.switchInner}>
                <View style={[styles.switchIcon, { backgroundColor: colors.fill2 }]}>
                  <Ionicons name="swap-horizontal" size={18} color={colors.accent} />
                </View>
                <View style={styles.switchTextWrap}>
                  <Text style={[T.subhead, styles.switchTitle, { color: colors.text }]}>切换账号</Text>
                  <Text style={[T.caption2, { color: colors.textSecondary }]}>
                    {`已保存 ${accounts.length} 个账号`}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.quaternaryLabel} />
              </View>
            </Press>
          </Reveal>
        )}

        {isLoggedIn && (
          <MineStatCard stat={stat} colors={colors} T={T} />
        )}

        <MineMenuSection
          delay={140}
          colors={colors}
          T={T}
          rows={[
            ...(userInfo
              ? [{ icon: 'albums-outline' as const, color: '#FB7299', label: '我的动态', href: { pathname: '/dynamics/mine' } }]
              : []),
            { icon: 'time-outline', color: '#FF9500', label: '历史记录', href: { pathname: '/history' } },
            { icon: 'download-outline', color: '#007AFF', label: '离线缓存', href: { pathname: '/download' } },
            { icon: 'star', color: '#FFCC00', label: '我的收藏', href: { pathname: '/fav' } },
            { icon: 'checkmark-circle-outline', color: '#34C759', label: '稍后再看', href: { pathname: '/later' } },
          ]}
        />

        <MineMenuSection
          delay={210}
          colors={colors}
          T={T}
          rows={[
            { icon: 'chatbubbles-outline', color: '#007AFF', label: '我的消息', href: { pathname: '/whisper' } },
            { icon: 'person-circle-outline', color: '#FF9F0A', label: '账号资料', href: { pathname: '/edit_profile' } },
            { icon: 'phone-portrait-outline', color: '#5856D6', label: '登录设备', href: { pathname: '/login_devices' } },
            { icon: 'document-text-outline', color: '#8E8E93', label: '登录日志', href: { pathname: '/login_log' } },
            { icon: 'tv-outline', color: '#FB7299', label: '我的追番', href: { pathname: '/pgc_follow' } },
            { icon: 'list-outline', color: '#AF52DE', label: '我的订阅', href: { pathname: '/subscription' } },
            { icon: 'ban-outline', color: '#8E8E93', label: '消息屏蔽词', href: { pathname: '/whisper_block' } },
          ]}
        />

        <MineMenuSection
          delay={235}
          colors={colors}
          T={T}
          rows={[
            { icon: 'trending-up-outline', color: '#FF3B30', label: 'bilibili热搜', href: { pathname: '/search_trending' } },
            { icon: 'radio-outline', color: '#FF2D55', label: '直播搜索', href: { pathname: '/live_search' } },
          ]}
        />

        <MineMenuSection
          delay={250}
          colors={colors}
          T={T}
          rows={[
            { icon: 'chatbubble-ellipses-outline', color: '#FF2D55', label: '我的评论', href: { pathname: '/my_reply' } },
            { icon: 'cash-outline', color: '#FF9500', label: '硬币日志', href: { pathname: '/coin_log' } },
            { icon: 'trending-up-outline', color: '#34C759', label: '经验日志', href: { pathname: '/exp_log' } },
          ]}
        />

        <MineMenuSection
          delay={320}
          colors={colors}
          T={T}
          rows={[
            { icon: 'settings-outline', color: '#8E8E93', label: '设置', href: { pathname: '/settings' } },
          ]}
        />

        <MineMenuSection
          delay={340}
          colors={colors}
          T={T}
          rows={[
            { icon: 'bar-chart-outline', color: '#AF52DE', label: '发起投票', href: { pathname: '/create_vote' } },
            ...(isLoggedIn && userInfo
              ? [{
                  icon: 'book-outline' as const,
                  color: '#FF9500',
                  label: '我的漫画',
                  href: { pathname: '/member_comic/[mid]', params: { mid: String(userInfo.mid) } },
                }]
              : []),
            { icon: 'information-circle-outline', color: '#8E8E93', label: '关于', href: { pathname: '/about' } },
          ]}
        />

        {isLoggedIn && (
          <MineAnonymousCard
            delay={310}
            anonymousMode={anonymousMode}
            colors={colors}
            T={T}
            onToggle={() => {
              const next = !anonymousMode;
              setAnonymous(next);
              feedBackSuccess();
              showToast(next
                ? '已进入无痕模式：搜索/评论/播放不携带身份信息'
                : '已退出无痕模式');
            }}
          />
        )}

        {isLoggedIn && (
          <MineLogoutCard
            colors={colors}
            T={T}
            onPress={() => setShowLogout(true)}
          />
        )}
      </Animated.ScrollView>

      <MineLogoutDialog
        visible={showLogout}
        onChange={setShowLogout}
        onLogout={() => {
          if (currentAccountIndex >= 0) removeAccount(currentAccountIndex);
          setShowLogout(false);
        }}
      />

      <AccountSwitchSheet
        visible={showAccounts}
        accounts={accounts}
        currentAccountIndex={currentAccountIndex}
        colors={colors}
        T={T}
        insets={insets}
        onClose={() => setShowAccounts(false)}
        onSwitch={handleSwitchAccount}
        onRemove={confirmRemoveAccount}
        onAdd={() => {
          setShowAccounts(false);
          router.push('/login' as any);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 48,
    gap: SECTION_GAP,
  },
  switchCard: {
    borderRadius: RADII.card,
    ...continuous,
  },
  switchInner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 13,
    gap: 12,
  },
  switchIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  switchTextWrap: { flex: 1, gap: 2 },
  switchTitle: { fontWeight: '600' },
});
