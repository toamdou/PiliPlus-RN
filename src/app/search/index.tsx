import { useState, useEffect, useCallback, useRef } from 'react';
import { Stack, useRouter, useFocusEffect } from 'expo-router';
import {
  View,
  ScrollView,
  StyleSheet,
  Text as RNText,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Glass } from '@/components/Glass';
import { searchApi } from '@/api/search';
import { useSearchSuggestions } from '@/hooks/use-search-suggestions';
import { clearSearchHistory, loadSearchHistory } from '@/utils/search-history';
import { useSettingsStore } from '@/stores/settings';
import { useThemeColors } from '@/components/SwiftUIHost';
import { Press } from '@/components/motion';
import { useType } from '@/components/type-scale';
import { BILI } from '@/theme/bili-colors';
import { RADII, continuous, shadow } from '@/theme/tokens';
import { feedBackSelection } from '@/utils/feedback';
import { createNativeRequestCancelToken, type NativeRequestCancelToken } from '@/utils/request-cancel';

interface HotItem {
  keyword: string;
  icon?: string;
}

interface RcmdItem {
  keyword: string;
  icon?: string;
  showLiveIcon?: boolean;
  recommendReason?: string;
}

export default function SearchScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const T = useType();
  const enableHotKey = useSettingsStore((s) => s.enableHotKey);
  const enableSearchWord = useSettingsStore((s) => s.enableSearchWord);
  const enableSearchRcmd = useSettingsStore((s) => s.enableSearchRcmd);
  const searchSuggestion = useSettingsStore((s) => s.searchSuggestion);

  const [keyword, setKeyword] = useState('');
  const [hotList, setHotList] = useState<HotItem[]>([]);
  const [defaultWord, setDefaultWord] = useState('');
  const [history, setHistory] = useState<string[]>([]);
  const [rcmdList, setRcmdList] = useState<RcmdItem[]>([]);
  const [rcmdLoading, setRcmdLoading] = useState(false);
  const { suggestions, showSuggest, dismissSuggestions } = useSearchSuggestions(keyword, searchSuggestion);
  const discoverCancelRef = useRef<NativeRequestCancelToken | null>(null);

  useEffect(() => {
    discoverCancelRef.current?.abort();
    const token = createNativeRequestCancelToken();
    discoverCancelRef.current = token;
    if (enableHotKey) loadTrending(token);
    if (enableSearchWord) loadDefaultWord(token);
    return () => {
      token.abort();
      if (discoverCancelRef.current === token) discoverCancelRef.current = null;
    };
  }, [enableHotKey, enableSearchWord]);

  /* 搜索发现（app 端 search/recommend，区别于热搜榜） */
  useEffect(() => {
    if (!enableSearchRcmd) {
      const clearTimer = setTimeout(() => setRcmdList([]), 0);
      return () => clearTimeout(clearTimer);
    }
    let cancelled = false;
    const token = createNativeRequestCancelToken();
    const timer = setTimeout(async () => {
      setRcmdLoading(true);
      try {
        const res = await searchApi.recommend({ cancelToken: token });
        if (!cancelled && res?.data?.list) {
          const list: RcmdItem[] = res.data.list
            .map((i: any) => ({
              keyword: i.keyword || '',
              icon: i.icon || '',
              showLiveIcon: i.show_live_icon === true,
              recommendReason: (i.recommend_reason || '').replace('·', ' '),
            }))
            .filter((i: RcmdItem) => i.keyword);
          setRcmdList(list);
        }
      } catch (e) {
        if (token.aborted) return;
        console.error('search recommend error:', e);
      } finally {
        if (!cancelled) setRcmdLoading(false);
      }
    }, 0);
    return () => {
      cancelled = true;
      token.abort();
      clearTimeout(timer);
    };
  }, [enableSearchRcmd]);

  /* 每次页面获得焦点时重新加载历史（从结果页返回时历史已更新） */
  useFocusEffect(useCallback(() => {
    if (useSettingsStore.getState().recordSearchHistory !== false) loadHistory();
  }, []));

  /* 热门榜（/x/v2/search/trending/ranking）：带排名的真实榜单，不再随机打乱 */
  async function loadTrending(cancelToken?: NativeRequestCancelToken) {
    try {
      const res = await searchApi.trending(cancelToken ? { cancelToken } : undefined);
      if (res?.data?.list) {
        const all = res.data.list.map((i: any) => ({
          keyword: i.keyword || i.show_name || '',
          icon: i.icon
            ? i.icon.includes('new') ? '新' : i.icon.includes('hot') ? '热' : ''
            : '',
        })).filter((i: HotItem) => i.keyword);
        setHotList(all.slice(0, 20));
      }
    } catch (e) {
      if (cancelToken?.aborted) return;
      console.error('search trending error:', e);
    }
  }

  /* 搜索默认词：未输入时展示在输入框占位与热词区，点击即搜 */
  async function loadDefaultWord(cancelToken?: NativeRequestCancelToken) {
    try {
      const res = await searchApi.defaultWord(cancelToken ? { cancelToken } : undefined);
      const word = res?.data?.name || res?.data?.show_name || '';
      if (word) setDefaultWord(word);
    } catch (e) {
      if (cancelToken?.aborted) return;
      console.error('search defaultWord error:', e);
    }
  }

  async function loadHistory() {
    setHistory(await loadSearchHistory());
  }

  /** 提交搜索 → push 到结果页（原生栈管理返回手势） */
  function goSearch(kw: string) {
    const q = kw.trim();
    if (!q) return;
    dismissSuggestions();
    router.push({ pathname: '/search/results', params: { keyword: q } } as any);
  }

  return (
    <>
      <Stack.Screen options={{ headerBackVisible: false }} />
      <Stack.SearchBar
        placeholder={enableSearchWord && defaultWord ? `搜索 ${defaultWord}` : '搜索'}
        autoFocus
        autoCapitalize="none"
        onChangeText={(e: any) => setKeyword(typeof e === 'string' ? e : e?.nativeEvent?.text ?? '')}
        onSearchButtonPress={(e: any) => goSearch(typeof e === 'string' ? e : e?.nativeEvent?.text ?? keyword)}
        onCancelButtonPress={() => router.back()}
        tintColor={colors.accent}
        textColor={colors.text}
        hintTextColor={colors.textTertiary}
        headerIconColor={colors.textSecondary}
      />

      <View style={[styles.container, { backgroundColor: colors.bg }]}>
        {/* 搜索建议浮层（S3：绝对定位浮层，不参与文档流、不推挤下方热搜/历史内容） */}
        {showSuggest && suggestions.length > 0 && (
          <View style={styles.suggestOverlay} pointerEvents="box-none">
            <Glass variant="regular" style={[styles.suggestCard, continuous, shadow('glass', colors.isDark)]}>
              {suggestions.map((s, i) => (
                <Press
                  key={i}
                  haptic
                  scaleTo={0.97}
                  style={styles.suggestItem}
                  onPress={() => goSearch(s.value)}>
                  <Ionicons name="search" size={14} color={colors.textTertiary} />
                  <RNText style={[T.subhead, { color: colors.text, flex: 1 }]} numberOfLines={1}>
                    {s.value}
                  </RNText>
                </Press>
              ))}
            </Glass>
          </View>
        )}

        <ScrollView style={styles.body} showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 16, gap: 18, paddingTop: 12, paddingBottom: 100 }}>
          {/* 大家都在搜 */}
          {enableHotKey && hotList.length > 0 && (
            <View style={[styles.sectionCard, { backgroundColor: colors.card }, continuous]}>
              <View style={styles.sectionHeader}>
                <View style={styles.sectionTitleRow}>
                  <Ionicons name="flame" size={17} color="#FF9500" />
                  <RNText style={[T.headline, styles.sectionTitle, { color: colors.text }]}>大家都在搜</RNText>
                </View>
                <Press haptic scaleTo={0.9} onPress={() => loadTrending(discoverCancelRef.current ?? undefined)} style={styles.refreshBtn}>
                  <Ionicons name="refresh-outline" size={14} color={colors.textSecondary} />
                  <RNText style={[T.footnote, { color: colors.textSecondary, marginLeft: 3 }]}>换一换</RNText>
                </Press>
                <Press
                  haptic
                  scaleTo={0.9}
                  onPress={() => router.push('/search_trending' as any)}
                  style={styles.refreshBtn}>
                  <Ionicons name="chevron-forward" size={14} color={colors.textSecondary} />
                  <RNText style={[T.footnote, { color: colors.textSecondary, marginLeft: 2 }]}>完整榜</RNText>
                </Press>
              </View>
              {/* 默认词：点击直接搜索 */}
              {enableSearchWord && defaultWord && (
                <Press
                  haptic
                  scaleTo={0.94}
                  style={[styles.defaultWordChip, { backgroundColor: colors.fill2 }, continuous]}
                  onPress={() => goSearch(defaultWord)}>
                  <Ionicons name="sparkles" size={12} color={colors.accent} />
                  <RNText style={[T.footnote, styles.defaultWordText, { color: colors.text }]} numberOfLines={1}>
                    {defaultWord}
                  </RNText>
                  <View style={[styles.defaultWordTag, { backgroundColor: BILI.pinkDim }]}>
                    <RNText style={[T.caption2, styles.defaultWordTagText, { color: colors.accent }]}>默认词</RNText>
                  </View>
                </Press>
              )}
              <View style={styles.hotGrid}>
                {hotList.map((item, i) => (
                  <Press
                    key={i}
                    haptic
                    scaleTo={0.97}
                    style={styles.hotItem}
                    onPress={() => goSearch(item.keyword)}>
                    <RNText style={[T.subhead, styles.hotRank, { color: i < 3 ? colors.accent : colors.textTertiary }]}>
                      {i + 1}
                    </RNText>
                    <RNText style={[T.subhead, styles.hotText, { color: colors.text }]} numberOfLines={1}>
                      {item.keyword}
                    </RNText>
                    {item.icon ? (
                      <View style={[styles.hotTag, { backgroundColor: item.icon === '热' ? BILI.hot : BILI.new }]}>
                        <RNText style={[T.caption2, styles.hotTagText]}>{item.icon}</RNText>
                      </View>
                    ) : null}
                  </Press>
                ))}
              </View>
            </View>
          )}

          {/* 搜索历史 */}
          {history.length > 0 && (
            <View style={[styles.sectionCard, { backgroundColor: colors.card }, continuous]}>
              <View style={styles.sectionHeader}>
                <View style={styles.sectionTitleRow}>
                  <Ionicons name="time-outline" size={16} color={colors.textSecondary} />
                  <RNText style={[T.headline, styles.sectionTitle, { color: colors.text }]}>搜索历史</RNText>
                </View>
                <Press
                  scaleTo={0.9}
                  onPress={() => { feedBackSelection(); setHistory([]); void clearSearchHistory(); }}>
                  <Ionicons name="trash-outline" size={15} color={colors.textTertiary} />
                </Press>
              </View>
              <View style={styles.historyFlow}>
                {history.map((h, i) => (
                  <Press
                    key={i}
                    haptic
                    scaleTo={0.94}
                    style={[styles.historyChip, { backgroundColor: colors.fill2 }, continuous]}
                    onPress={() => goSearch(h)}>
                    <RNText style={[T.footnote, styles.historyText, { color: colors.text }]}>{h}</RNText>
                  </Press>
                ))}
              </View>
            </View>
          )}

          {/* 搜索发现 */}
          {enableSearchRcmd && rcmdList.length > 0 && (
            <View style={[styles.sectionCard, { backgroundColor: colors.card }, continuous]}>
              <View style={styles.sectionHeader}>
                <View style={styles.sectionTitleRow}>
                  <Ionicons name="compass-outline" size={17} color={colors.accent} />
                  <RNText style={[T.headline, styles.sectionTitle, { color: colors.text }]}>搜索发现</RNText>
                </View>
                {rcmdLoading ? (
                  <RNText style={[T.footnote, { color: colors.textTertiary }]}>加载中…</RNText>
                ) : null}
              </View>
              <View style={styles.hotGrid}>
                {rcmdList.slice(0, 20).map((item, i) => (
                  <Press
                    key={`${item.keyword}-${i}`}
                    haptic
                    scaleTo={0.97}
                    style={styles.hotItem}
                    onPress={() => goSearch(item.keyword)}>
                    <RNText style={[T.subhead, styles.hotText, { color: colors.text }]} numberOfLines={1}>
                      {item.keyword}
                    </RNText>
                    {item.icon ? (
                      <View style={[styles.hotTag, { backgroundColor: item.icon.includes('hot') ? BILI.hot : BILI.new }]}>
                        <RNText style={[T.caption2, styles.hotTagText]}>{item.icon.includes('new') ? '新' : item.icon.includes('hot') ? '热' : ''}</RNText>
                      </View>
                    ) : item.showLiveIcon ? (
                      <View style={[styles.hotTag, { backgroundColor: BILI.hot }]}>
                        <RNText style={[T.caption2, styles.hotTagText]}>直播</RNText>
                      </View>
                    ) : item.recommendReason ? (
                      <RNText style={[T.caption2, { color: colors.textTertiary, flexShrink: 1 }]} numberOfLines={1}>
                        {item.recommendReason}
                      </RNText>
                    ) : null}
                  </Press>
                ))}
              </View>
            </View>
          )}
        </ScrollView>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  body: { flex: 1 },
  sectionCard: {
    borderRadius: RADII.card,
    padding: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(120,120,128,0.12)',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  sectionTitle: { fontWeight: '700', letterSpacing: -0.2 },
  refreshBtn: { flexDirection: 'row', alignItems: 'center', padding: 4 },
  defaultWordChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: RADII.circle,
    paddingHorizontal: 12,
    paddingVertical: 7,
    marginBottom: 10,
    alignSelf: 'flex-start',
    maxWidth: '100%',
  },
  defaultWordText: { flexShrink: 1, fontWeight: '500' },
  /* 默认词 tag 圆角收敛 RADII.xs（05-B5，原 4 硬编码）；文字颜色动态跟随主题色 */
  defaultWordTag: { borderRadius: RADII.xs, paddingHorizontal: 4, paddingVertical: 1 },
  defaultWordTagText: { fontWeight: '700' },
  hotGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  hotItem: {
    width: '50%',
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 9,
    paddingRight: 12,
    gap: 6,
  },
  hotRank: { fontWeight: '600', width: 18, textAlign: 'center' },
  hotText: { flexShrink: 1 },
  /* 热榜徽章：圆角 RADII.xs、字号走 T.caption2（05-B5，原圆角 3/字号 10/9 硬编码） */
  hotTag: { paddingHorizontal: 4, paddingVertical: 1, borderRadius: RADII.xs },
  hotTagText: { color: '#FFFFFF', fontWeight: '700' },
  historyFlow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  historyChip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: RADII.sm },
  historyText: {},
  /* 搜索建议 */
  /* S3：绝对定位浮层——悬浮于内容之上，不参与文档流、不推挤下方热搜/历史 */
  suggestOverlay: {
    position: 'absolute',
    top: 6,
    left: 0,
    right: 0,
    zIndex: 30,
  },
  suggestCard: {
    marginHorizontal: 14,
    borderRadius: RADII.md,
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  suggestItem: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 10 },
});
