import { useCallback, useMemo, useState } from 'react';
import { Stack, useRouter } from 'expo-router';
import { Host } from '@/components/SwiftUIHost';
import {
  List,
  Section,
  Button,
  Label,
  Text,
  HStack,
  VStack,
  Spacer,
  RNHostView,
  ConfirmationDialog,
  TextField,
  Image,
  useNativeState,
} from '@expo/ui/swift-ui';
import {
  font,
  foregroundStyle,
  tint,
  glassEffect,
  cornerRadius,
  submitLabel,
  autocorrectionDisabled,
} from '@expo/ui/swift-ui/modifiers';
import { useAuthStore } from '@/stores/auth';
import { Image as ExpoImage } from 'expo-image';
import { biliCover } from '@/utils/image-url';
import { SETTINGS_REGISTRY } from '@/constants/settings-registry';

/** 设置分类定义 */
const SETTING_CATEGORIES = [
  {
    key: 'recommend',
    title: '推荐设置',
    subtitle: '推荐来源、刷新保留、过滤器',
    icon: 'sparkles',
    color: '#FF9500',
  },
  {
    key: 'video',
    title: '视频 / 画质',
    subtitle: '画质、音质、解码、缓冲、CDN',
    icon: 'film',
    color: '#007AFF',
  },
  {
    key: 'playback',
    title: '播放设置',
    subtitle: '手势、全屏、后台播放、字幕',
    icon: 'play.circle',
    color: '#34C759',
  },
  {
    key: 'danmaku',
    title: '弹幕设置',
    subtitle: '透明度、字号、速度、行高',
    icon: 'text.bubble',
    color: '#AF52DE',
  },
  {
    key: 'appearance',
    title: '外观设置',
    subtitle: '主题、字号、内容显示、动态',
    icon: 'paintbrush',
    color: '#FF2D55',
  },
  {
    key: 'extra',
    title: '其他设置',
    subtitle: '搜索、AI、评论、震动、更新',
    icon: 'gearshape.2',
    color: '#8E8E93',
  },
  {
    key: 'network',
    title: '网络设置',
    subtitle: 'HTTP/2、代理、重试、缓存',
    icon: 'network',
    color: '#5856D6',
  },
  {
    key: 'privacy',
    title: '隐私设置',
    subtitle: '黑名单、账号模式',
    icon: 'hand.raised',
    color: '#FF3B30',
  },
] as const;

/** 独立设置子页（保持设置主页可直接进入，不侵入现有分类页） */
const EXTRA_SETTING_PAGES = [
  { key: 'play_speed', title: '倍速设置', icon: 'gauge.with.dots.needle.67percent', color: '#34C759', page: '/settings/play_speed' },
  { key: 'fullscreen_sc', title: '全屏SC大小', icon: 'textformat.size', color: '#34C759', page: '/settings/fullscreen_sc' },
  { key: 'color_select', title: '主题色', icon: 'paintpalette', color: '#FF2D55', page: '/settings/color_select' },
  { key: 'font_size', title: '字体大小', icon: 'textformat.size', color: '#FF2D55', page: '/settings/font_size' },
  { key: 'bar_set', title: '首页标签页 / Navbar', icon: 'rectangle.3.group', color: '#FF2D55', page: '/settings/bar_set' },
  { key: 'slide_color_picker', title: '弹幕颜色', icon: 'paintpalette', color: '#AF52DE', page: '/settings/slide_color_picker' },
  { key: 'sponsor_block', title: '空降助手', icon: 'shield.checkered', color: '#8E8E93', page: '/settings/sponsor_block' },
  { key: 'webdav', title: 'WebDAV 设置', icon: 'externaldrive', color: '#8E8E93', page: '/settings/webdav' },
  { key: 'logs', title: '应用日志', icon: 'doc.text', color: '#8E8E93', page: '/settings/logs' },
  { key: 'space_setting', title: '空间设置', icon: 'person.crop.circle', color: '#FF3B30', page: '/space_setting' },
  { key: 'create_vote', title: '发起投票', icon: 'checklist', color: '#AF52DE', page: '/create_vote' },
] as const;

export default function SettingsScreen() {
  const router = useRouter();
  const { isLoggedIn, userInfo, currentAccountIndex, logout, removeAccount } = useAuthStore();
  // 退出登录确认弹窗显隐（SwiftUI ConfirmationDialog 驱动）
  const [showLogout, setShowLogout] = useState(false);

  // ===== 搜索状态 =====
  // useNativeState 驱动 SwiftUI TextField 的双向绑定
  const searchText = useNativeState('');
  // React state 驱动搜索结果列表渲染
  const [query, setQuery] = useState('');

  // onTextChange 不加 'worklet' 指令 → 作为普通 JS 事件异步回调，可直接更新 React state
  const handleSearchChange = useCallback((value: string) => {
    setQuery(value);
  }, []);

  const clearSearch = useCallback(() => {
    searchText.set( '');
    setQuery('');
  }, [searchText]);

  // 搜索过滤逻辑：匹配 label 或 keywords
  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return SETTINGS_REGISTRY.filter(
      (item) =>
        item.label.toLowerCase().includes(q) ||
        item.keywords.some((k) => k.toLowerCase().includes(q)),
    );
  }, [query]);

  // 按分类分组（保持注册表中的分类顺序）
  const groupedResults = useMemo(() => {
    const map = new Map<string, { color: string; items: typeof results }>();
    for (const r of results) {
      const g = map.get(r.category);
      if (g) g.items.push(r);
      else map.set(r.category, { color: r.color, items: [r] });
    }
    return [...map.entries()];
  }, [results]);

  const isSearching = query.trim().length > 0;

  return (
    <>
      <Stack.Screen options={{ title: '设置', headerLargeTitle: false, headerBackButtonDisplayMode: 'minimal' }} />
      <Stack.Header blurEffect="systemMaterial" style={{ shadowColor: 'transparent' }} />
      <Host style={{ flex: 1 }} useViewportSizeMeasurement>
        <List modifiers={[tint('#FB7299')]}>
          {/* ===== 搜索栏（iOS Settings 风格）===== */}
          <Section>
            <HStack spacing={8}>
              <Image systemName="magnifyingglass" size={17} color="#8E8E93" />
              <TextField
                placeholder="搜索设置"
                text={searchText}
                onTextChange={handleSearchChange}
                modifiers={[autocorrectionDisabled(), submitLabel('search')]}
              />
              {query.length > 0 && (
                <Button onPress={clearSearch}>
                  <Image systemName="xmark.circle.fill" size={16} color="#C7C7CC" />
                </Button>
              )}
            </HStack>
          </Section>

          {isSearching ? (
            /* ===== 搜索结果（iOS Settings 搜索结果风格）===== */
            groupedResults.length > 0 ? (
              groupedResults.map(([category, group]) => (
                <Section key={category} title={category}>
                  {group.items.map((item) => (
                    <Button
                      key={item.key}
                      onPress={() => {
                        clearSearch();
                        router.push(item.page as any);
                      }}>
                      <HStack spacing={12}>
                        <Image systemName={item.icon as any} size={20} color={group.color} />
                        <VStack alignment="leading" spacing={2}>
                          <Text modifiers={[font({ size: 16 })]}>{item.label}</Text>
                        </VStack>
                        <Spacer />
                        <Text
                          modifiers={[
                            font({ size: 13 }),
                            foregroundStyle({ type: 'hierarchical', style: 'tertiary' }),
                          ]}>
                          ›
                        </Text>
                      </HStack>
                    </Button>
                  ))}
                </Section>
              ))
            ) : (
              <Section>
                <VStack spacing={8} modifiers={[]}>
                  <Text
                    modifiers={[
                      font({ size: 15 }),
                      foregroundStyle({ type: 'hierarchical', style: 'secondary' }),
                    ]}>
                    未找到匹配的设置项
                  </Text>
                </VStack>
              </Section>
            )
          ) : (
            <>
              {/* ===== 账户信息 ===== */}
              {isLoggedIn && userInfo ? (
                <Section modifiers={[glassEffect({ glass: { variant: 'regular' } }), cornerRadius(16)]}>
                  <Button onPress={() => router.push(`/member/${userInfo.mid}` as any)}>
                    <HStack spacing={14}>
                      <RNHostView matchContents>
                        <ExpoImage
                          source={userInfo.face ? { uri: biliCover(userInfo.face, 112, 112) } : require('../../../assets/noface.jpeg')}
                          style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: '#e5e5ea' }}
                          contentFit="cover"
                        />
                      </RNHostView>
                      <VStack alignment="leading" spacing={3}>
                        <Text modifiers={[font({ size: 18, weight: 'semibold' })]}>
                          {userInfo.name || '未设置昵称'}
                        </Text>
                        <Text
                          modifiers={[
                            font({ size: 13 }),
                            foregroundStyle({ type: 'hierarchical', style: 'secondary' }),
                          ]}>
                          {`UID: ${userInfo.mid}`}
                        </Text>
                      </VStack>
                      <Spacer />
                      <Text
                        modifiers={[
                          font({ size: 16 }),
                          foregroundStyle({ type: 'hierarchical', style: 'tertiary' }),
                        ]}>
                        ›
                      </Text>
                    </HStack>
                  </Button>
                </Section>
              ) : (
                <Section>
                  <Button onPress={() => router.push('/login' as any)}>
                    <Label title="登录 / 注册" systemImage="person.crop.circle" />
                  </Button>
                </Section>
              )}

              {/* ===== 设置分类导航 ===== */}
              <Section>
                {SETTING_CATEGORIES.map((cat) => (
                  <Button
                    key={cat.key}
                    onPress={() => router.push(`/settings/${cat.key}` as any)}>
                    <Label title={cat.title} systemImage={cat.icon} />
                  </Button>
                ))}
              </Section>

              {/* ===== 独立设置子页 ===== */}
              <Section title="更多设置">
                {EXTRA_SETTING_PAGES.map((item) => (
                  <Button
                    key={item.key}
                    onPress={() => router.push(item.page as any)}>
                    <Label title={item.title} systemImage={item.icon} />
                  </Button>
                ))}
              </Section>

              {/* ===== 关于与退出 ===== */}
              <Section>
                <Button onPress={() => router.push('/about' as any)}>
                  <Label title="关于" systemImage="info.circle" />
                </Button>
              </Section>

              {isLoggedIn && (
                <Section>
                  <ConfirmationDialog
                    title="退出登录"
                    isPresented={showLogout}
                    onIsPresentedChange={setShowLogout}
                    titleVisibility="visible">
                    <ConfirmationDialog.Trigger>
                      <Button role="destructive" label="退出登录" onPress={() => setShowLogout(true)} />
                    </ConfirmationDialog.Trigger>
                    <ConfirmationDialog.Actions>
                      <Button
                        label="退出"
                        role="destructive"
                        onPress={() => {
                          if (currentAccountIndex >= 0) removeAccount(currentAccountIndex);
                          else logout();
                          setShowLogout(false);
                        }}
                      />
                      <Button label="取消" role="cancel" />
                    </ConfirmationDialog.Actions>
                    <ConfirmationDialog.Message>
                      <Text>确定要退出当前账号吗？退出后将从本机移除该账号。</Text>
                    </ConfirmationDialog.Message>
                  </ConfirmationDialog>
                </Section>
              )}
            </>
          )}
        </List>
      </Host>
    </>
  );
}
