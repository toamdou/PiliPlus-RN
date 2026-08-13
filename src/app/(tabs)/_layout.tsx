import { NativeTabs } from 'expo-router/unstable-native-tabs';
import { ThemeProvider, DarkTheme, DefaultTheme } from 'expo-router';
import { DynamicColorIOS, Platform, useColorScheme } from 'react-native';
import { useTabBarStore } from '@/stores/tab-bar';

import { useDynamicPoll } from '@/utils/dynamic-polling';
import { useSettingsStore } from '@/stores/settings';

const ACCENT = '#FB7299';
/** iOS 26+ 原生 UITabBarController 支持 tabBarMinimizeBehavior，由系统处理动画 */
const IS_IOS_26 =
  Platform.OS === 'ios' && parseInt(String(Platform.Version), 10) >= 26;
/** Unread badge background: reuse system notification red (matches theme notification) */
const BADGE_BG = '#FF3B30';

const LightTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    primary: ACCENT,
    text: '#000000',
    background: '#F2F2F7',
    card: '#FFFFFF',
    border: '#E5E5EA',
    notification: '#FF3B30',
  },
};

const DarkThemeOverride = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    primary: ACCENT,
    text: '#FFFFFF',
    background: '#000000',
    card: '#1C1C1E',
    border: '#38383A',
    notification: '#FF3B30',
  },
};

export default function TabsLayout() {
  const colorScheme = useColorScheme();

  /* 3.11: Unread badge for the Feeds tab — value comes from newCount (number of new feeds) in the dynamic-polling store.
     dynamicBadgeMode (settings item): 0=hidden / 1=number / 2=red dot, respecting the user's toggle. */
  const newCount = useDynamicPoll((s) => s.newCount);
  const dynamicBadgeMode = useSettingsStore((s) => s.dynamicBadgeMode);
  const showDynamicBadge = dynamicBadgeMode !== 0 && newCount > 0;
  const dynamicBadgeText =
    dynamicBadgeMode === 2 ? '•' : newCount > 99 ? '99+' : String(newCount);
  /* 首页底栏收起（hideBottomBar=false 时底栏常驻，不随滚动隐藏） */
  const hideBottomBar = useSettingsStore((s) => s.hideBottomBar);
  /* 底栏显隐：
     iOS 26+：由原生 minimizeBehavior="onScrollDown" 处理（液态玻璃 pill 平滑收缩动画）；
     iOS<26：useScrollHideTabBar 按滚动方向写 store → hidden prop 瞬时切换（原生动画缺位）。
     #42a：瞬时的原生切换无法从 JS 侧做 translate（UITabBar 是 UITabBarController 内的
     原生视图，非 React 托管，RNS 对 tabBarHidden 硬编码 animated:NO）——
     因此 JS 侧过渡由 useScrollHideTabBar 返回的 retract 收帘进度承担：消费页（如动态页）
     用它驱动底部玻璃帘与 FAB 的 translate/opacity 弹簧，把"闪没闪回"柔化为平滑收放。 */
  const hidden = useTabBarStore((s) => s.hidden);
  const setHidden = useTabBarStore((s) => s.setHidden);

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkThemeOverride : LightTheme}>
      <NativeTabs
        /* iOS 26+：原生 minimizeBehavior 接管底栏显隐动画（平滑收缩）；
           iOS<26：退回 hidden prop 瞬时切换作为后备。
           hideBottomBar=false 时底栏常驻（never 不随滚动隐藏）。 */
        minimizeBehavior={hideBottomBar ? 'onScrollDown' : 'never'}
        hidden={IS_IOS_26 ? false : hidden}
        /* 2.1: The bottom bar no longer goes transparent when scrolling to the edge — keeps the liquid glass material constant,
           preventing the bottom bar from "melting" into the background when the list reaches the top/bottom. */
        disableTransparentOnScrollEdge
        /* 切换 tab / 轻点当前 tab：底栏复位可见，避免带着上一屏的隐藏状态进入新页面（仅 iOS<26） */
        screenListeners={{
          focus: () => { if (!IS_IOS_26) setHidden(false); },
          tabPress: () => { if (!IS_IOS_26) setHidden(false); },
        }}
        tintColor={ACCENT}
        badgeBackgroundColor={BADGE_BG}
        labelStyle={{
          color: DynamicColorIOS({ dark: '#98989D', light: '#6C6C70' }),
        }}>
        {/* 首页禁用 RNS 的 contentInset 自动覆盖（否则 RNS 会把 FlashList 的
            contentInsetAdjustmentBehavior="never" 强改成 automatic，顶部留白重复）：
            顶部留白由 index.tsx 的 paddingTop 统一接管。 */}
        <NativeTabs.Trigger name="index" disableAutomaticContentInsets>
          <NativeTabs.Trigger.Icon
            sf={{ default: 'house', selected: 'house.fill' }}
          />
          <NativeTabs.Trigger.Label>首页</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="dynamics">
          {/* 动态 Tab 图标：#40a 核查后维持现状——SF Symbols 里
              antenna.radiowaves.left.and.right 无 .fill 面性变体（仅 .circle/.slash 等变体，
              .circle.fill 语义不符），强行换符号会破坏"动态/信号"隐喻一致性；
              选中态仍靠 tintColor 高亮（见 05-ios-design.md A3）。 */}
          <NativeTabs.Trigger.Icon
            sf={{ default: 'antenna.radiowaves.left.and.right', selected: 'antenna.radiowaves.left.and.right' }}
          />
          <NativeTabs.Trigger.Label>动态</NativeTabs.Trigger.Label>
          {/* 3.11: New feeds badge (number / red dot follows dynamicBadgeMode) */}
          {showDynamicBadge && (
            <NativeTabs.Trigger.Badge>{dynamicBadgeText}</NativeTabs.Trigger.Badge>
          )}
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="mine">
          <NativeTabs.Trigger.Icon
            sf={{ default: 'person', selected: 'person.fill' }}
          />
          <NativeTabs.Trigger.Label>我的</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
      </NativeTabs>
    </ThemeProvider>
  );
}
