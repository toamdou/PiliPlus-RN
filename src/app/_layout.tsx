import { Stack, ThemeProvider, DarkTheme, DefaultTheme, usePathname, useRouter } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useRef } from 'react';
import { Appearance, useColorScheme } from 'react-native';
import { Image } from 'expo-image';

import { useAuthStore } from '@/stores/auth';
import { validateApi } from '@/api/validate';
import { useSettingsStore } from '@/stores/settings';
import { useNetwork } from '@/utils/network';
import { useDynamicPoll } from '@/utils/dynamic-polling';
import { Toast } from '@/components/Toast';
import { releaseAudioPlayer } from '@/utils/audio-player';
import { usePlayerStore } from '@/stores/player';

/* 图片内存缓存上限：expo-image 默认无上限（SDWebImage maxMemoryCost=0），
   信息流滚动加载的封面会永久驻留内存导致 RAM 持续增长；
   设置上限后按 LRU 自动淘汰，配合封面 maxWidth 解码降采样控制总占用。
   96MB / 96 张 ≈ 滚动 3-4 屏的封面量 */
Image.configureCache({
  maxMemoryCost: 96 * 1024 * 1024,
  maxMemoryCount: 96,
});

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const authInit = useAuthStore((s) => s.init);
  const settingsInit = useSettingsStore((s) => s.init);
  const theme = useSettingsStore((s) => s.theme);
  const router = useRouter();
  const initialPathRef = useRef(usePathname());
  const networkInit = useNetwork((s) => s.init);
  const dynamicStart = useDynamicPoll((s) => s.start);
  const dynamicStop = useDynamicPoll((s) => s.stop);
  const dynamicResetAccount = useDynamicPoll((s) => s.resetAccount);
  const colorScheme = useColorScheme();

  const RootTheme = colorScheme === 'dark'
    ? { ...DarkTheme, colors: { ...DarkTheme.colors, primary: '#FB7299', background: '#000000', card: '#1C1C1E', text: '#FFFFFF', border: '#38383A' } }
    : { ...DefaultTheme, colors: { ...DefaultTheme.colors, primary: '#FB7299', background: '#F2F2F7', card: '#FFFFFF', text: '#000000', border: '#E5E5EA' } };

  useEffect(() => {
    // cancelled 标志：StrictMode 双挂载时，避免首次挂载的异步任务在 cleanup 后继续执行
    let cancelled = false;
    (async () => {
      try {
        // 首帧即隐藏 splash，认证/设置初始化放到后台继续，避免启动被串行等待拖住。
        try { await SplashScreen.hideAsync(); } catch {}
        // 清理上次 app 被杀时可能残留的原生音频会话
        try { releaseAudioPlayer(); } catch {}
        usePlayerStore.getState().reset();

        await Promise.all([authInit(), settingsInit()]);
        // 默认启动页：仅应用启动落在首页时切换到用户选择的 Tab
        const defaultHomePage = useSettingsStore.getState().defaultHomePage;
        if (!cancelled && (initialPathRef.current === '/' || initialPathRef.current === '')) {
          if (defaultHomePage === 1) router.replace('/dynamics' as any);
          else if (defaultHomePage === 2) router.replace('/mine' as any);
        }
        // 磁盘缓存上限按设置（maxCacheSize，MB）应用，内存上限保持默认
        const maxCacheSize = useSettingsStore.getState().maxCacheSize;
        if (maxCacheSize > 0) {
          Image.configureCache({
            maxDiskSize: maxCacheSize * 1024 * 1024,
          });
        }
      } catch (e) {
        console.error('RootLayout init error:', e);
      }
      if (cancelled) return;
      // 首帧渲染后再初始化网络监听、buvid 激活与动态轮询，避免拖住 splash。
      try {
        networkInit();
        validateApi.activateBuvid();
        await dynamicStart();
      } catch (e) {
        console.error('RootLayout post-frame init error:', e);
      }
    })();
    return () => {
      cancelled = true;
      dynamicStop();
    };
  }, []);

  // 登录态/账号切换后同步动态轮询生命周期，避免登出后后台任务仍被拉起。
  useEffect(() => {
    return useAuthStore.subscribe((state, prev) => {
      if (
        state.isLoggedIn === prev.isLoggedIn &&
        state.currentAccountIndex === prev.currentAccountIndex
      ) {
        return;
      }
      const accountChanged = state.currentAccountIndex !== prev.currentAccountIndex;
      if (!state.isLoggedIn || accountChanged) {
        void (async () => {
          await dynamicStop();
          await dynamicResetAccount();
          if (state.isLoggedIn) await dynamicStart();
        })();
      } else if (state.isLoggedIn) {
        void dynamicStart();
      }
    });
  }, [dynamicResetAccount, dynamicStart, dynamicStop]);

  // 当设置中的主题改变时，强制更新外观
  useEffect(() => {
    if (theme === 'dark') {
      Appearance.setColorScheme('dark');
    } else if (theme === 'light') {
      Appearance.setColorScheme('light');
    } else {
      Appearance.setColorScheme(null as any);
    }
  }, [theme]);

  return (
    <ThemeProvider value={RootTheme}>
      <Stack screenOptions={{ headerShown: true, headerBackButtonDisplayMode: 'minimal' }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="video/[id]" options={{ headerShown: false }} />
        <Stack.Screen name="live/[roomId]" options={{ headerShown: false }} />
      </Stack>
      <Toast />
    </ThemeProvider>
  );
}
