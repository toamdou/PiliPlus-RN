import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import type { SearchBarCommands } from 'react-native-screens';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import type { Href } from 'expo-router';
import { searchApi } from '@/api/search';
import { useSearchSuggestions } from '@/hooks/use-search-suggestions';
import { addSearchHistory } from '@/utils/search-history';
import { useSettingsStore } from '@/stores/settings';
import { useThemeColors, ACCENT } from '@/components/SwiftUIHost';
import { normalizeHttpUrl, stripHtml } from '@/utils/format';
import { createNativeRequestCancelToken, type NativeRequestCancelToken } from '@/utils/request-cancel';
import { SearchResultList, type SearchResult } from '@/components/search/SearchResultList';
import { SearchTypeTabs, SEARCH_TYPES, ORDER_VALUES, ORDERS } from '@/components/search/SearchTypeTabs';
import { SearchSuggestionRow } from '@/components/search/SearchSuggestionRow';

const IS_IOS_26 =
  Platform.OS === 'ios' && parseInt(String(Platform.Version), 10) >= 26;

export default function SearchResultsScreen() {
  const router = useRouter();
  const { keyword: paramKeyword } = useLocalSearchParams<{ keyword: string }>();
  const colors = useThemeColors();
  const searchSuggestion = useSettingsStore((s) => s.searchSuggestion);

  const [keyword, setKeyword] = useState(paramKeyword || '');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [page, setPage] = useState(1);
  const [categoryIdx, setCategoryIdx] = useState(0);
  const [orderIdx, setOrderIdx] = useState(0);
  const { suggestions, showSuggest, dismissSuggestions } = useSearchSuggestions(keyword, searchSuggestion);
  const searchBarRef = useRef<SearchBarCommands>(null);
  const cancelTokenRef = useRef<NativeRequestCancelToken | null>(null);

  useEffect(() => () => {
    cancelTokenRef.current?.abort();
    cancelTokenRef.current = null;
  }, []);

  /* 原生搜索框没有受控 value，进入结果页后用 command 同步参数关键词 */
  useEffect(() => {
    const timer = setTimeout(() => searchBarRef.current?.setText(paramKeyword || ''), 0);
    return () => clearTimeout(timer);
  }, [paramKeyword]);

  const doSearch = useCallback(
    async (kw: string, p = 1, catIdx = categoryIdx, ordIdx = orderIdx) => {
      if (!kw.trim()) return;
      setSearching(true);
      setKeyword(kw);
      dismissSuggestions();
      const token = createNativeRequestCancelToken();
      cancelTokenRef.current?.abort();
      cancelTokenRef.current = token;
      try {
        if (SEARCH_TYPES[catIdx] === 'live_room') {
          /* 直播间：走 web 搜索 type 体系（search_type=live，WBI 签名），
             对齐 Flutter LiveSearch 的字段映射（roomid/uname/title/online/cover） */
          const liveRes = await searchApi.byType({
            keyword: kw,
            search_type: 'live_room',
            page: p,
          }, { cancelToken: token });
          if (liveRes?.data?.result) {
            const mapped: SearchResult[] = liveRes.data.result.map((i: any) => ({
              bvid: '',
              title: stripHtml(i.title || i.uname || ''),
              pic: normalizeHttpUrl(i.cover || i.user_cover || i.face || ''),
              duration: '',
              author: i.uname || '',
              play: i.online || 0,
              danmaku: 0,
              pubdate: 0,
              avatar: normalizeHttpUrl(i.uface || i.face || ''),
              isLive: true,
              roomid: i.roomid || 0,
            }));
            if (p === 1) setResults(mapped);
            else setResults((prev) => [...prev, ...mapped]);
            setPage(p);
          } else if (p === 1) setResults([]);
        } else if (SEARCH_TYPES[catIdx] === 'article') {
          const res = await searchApi.byType({
            keyword: kw,
            search_type: 'article',
            page: p,
            order: ORDER_VALUES[ordIdx],
          }, { cancelToken: token });
          if (res?.data?.result) {
            const mapped: SearchResult[] = res.data.result.map((i: any) => ({
              bvid: '',
              title: stripHtml(i.title || ''),
              pic: normalizeHttpUrl(i.pic || ''),
              duration: '',
              author: i.author || '',
              play: i.read || i.play || 0,
              danmaku: i.review || 0,
              pubdate: i.pubdate || i.senddate || 0,
              articleId: i.id || 0,
              isArticle: true,
              mid: i.mid || 0,
            }));
            if (p === 1) setResults(mapped);
            else setResults((prev) => [...prev, ...mapped]);
            setPage(p);
          } else if (p === 1) setResults([]);
        } else {
          const res = await searchApi.byType({
            keyword: kw,
            search_type: SEARCH_TYPES[catIdx],
            page: p,
            order: ORDER_VALUES[ordIdx],
          }, { cancelToken: token });
          if (res?.data?.result) {
            const isPgcType = SEARCH_TYPES[catIdx] === 'media_bangumi' || SEARCH_TYPES[catIdx] === 'media_ft';
            const mapped: SearchResult[] = res.data.result.map((i: any) => {
              const pic = normalizeHttpUrl(i.pic || i.cover || '');
              const mediaScore = i.media_score?.score;
              const rawScore = typeof mediaScore === 'number'
                ? mediaScore
                : typeof mediaScore === 'string' && !Number.isNaN(parseFloat(mediaScore))
                  ? parseFloat(mediaScore)
                  : typeof i.score === 'number'
                    ? i.score
                    : typeof i.score === 'string' && !Number.isNaN(parseFloat(i.score))
                      ? parseFloat(i.score)
                      : undefined;
              if (isPgcType) {
                return {
                  bvid: '',
                  title: stripHtml(i.title || ''),
                  pic,
                  duration: i.index_show || i.new_ep?.index_show || '',
                  author: i.author || (i.styles || []).join('/') || '',
                  play: i.play || 0,
                  danmaku: i.danmaku || 0,
                  pubdate: i.pubdate || i.senddate || 0,
                  isPgc: true,
                  seasonId: i.season_id || 0,
                  mediaId: i.media_id || 0,
                  epId: i.ep_id || 0,
                  score: rawScore,
                  area: Array.isArray(i.areas)
                    ? i.areas.map((a: any) => a?.name || a).join('/')
                    : String(i.areas || ''),
                  year: i.year
                    ? String(i.year)
                    : i.pub_date
                      ? String(i.pub_date)
                      : i.pubtime
                        ? String(new Date(i.pubtime * 1000).getFullYear())
                        : '',
                };
              }
              return {
                bvid: i.bvid || '',
                title: stripHtml(i.title || ''),
                pic,
                duration: i.duration || '',
                author: i.author || i.uname || '',
                play: i.play || 0,
                danmaku: i.danmaku || 0,
                pubdate: i.pubdate || i.senddate || 0,
                avatar: normalizeHttpUrl(i.upic || i.face || ''),
                fans: i.fans || 0,
                mid: i.mid || 0,
              };
            });
            if (p === 1) setResults(mapped);
            else setResults((prev) => [...prev, ...mapped]);
            setPage(p);
          } else if (p === 1) setResults([]);
        }
        if (p === 1 && useSettingsStore.getState().recordSearchHistory !== false) {
          void addSearchHistory(kw);
        }
      } catch {
        if (!token.aborted && p === 1) setResults([]);
      } finally {
        if (cancelTokenRef.current === token) cancelTokenRef.current = null;
        if (!token.aborted) setSearching(false);
      }
    },
    [categoryIdx, orderIdx, dismissSuggestions],
  );

  /* 首次进入自动搜索 */
  useEffect(() => {
    const timer = setTimeout(() => {
      if (paramKeyword) doSearch(paramKeyword, 1, 0, 0);
    }, 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function onCategoryChange(idx: number) {
    setCategoryIdx(idx);
    if (keyword.trim()) doSearch(keyword, 1, idx, orderIdx);
  }

  function onOrderChange(idx: number) {
    setOrderIdx(idx);
    if (keyword.trim()) doSearch(keyword, 1, categoryIdx, idx);
  }

  const handleOpenUser = useCallback((item: SearchResult) => {
    if (item.mid) router.push(`/member/${item.mid}` as Href);
  }, [router]);

  const handleOpenMedia = useCallback((item: SearchResult) => {
    if (item.isLive && item.roomid) {
      router.push(`/live/${item.roomid}` as Href);
    } else if (item.isArticle && item.articleId) {
      router.push(`/article/${item.articleId}` as Href);
    } else if (item.isPgc && item.seasonId) {
      router.push(`/pgc/${item.seasonId}` as Href);
    } else if (item.bvid) {
      router.push(`/video/${item.bvid}` as Href);
    }
  }, [router]);

  return (
    <>
      <Stack.Screen options={{ headerShown: true }} />
      <Stack.SearchBar
        ref={searchBarRef}
        placeholder="搜索"
        autoCapitalize="none"
        onChangeText={(e: any) => setKeyword(typeof e === 'string' ? e : e?.nativeEvent?.text ?? '')}
        onSearchButtonPress={(e: any) => doSearch(typeof e === 'string' ? e : e?.nativeEvent?.text ?? keyword)}
        onCancelButtonPress={() => router.back()}
        tintColor={ACCENT}
        textColor={colors.text}
        hintTextColor={colors.textTertiary}
        headerIconColor={colors.textSecondary}
      />
      {IS_IOS_26 ? (
        <Stack.Toolbar>
          <Stack.Toolbar.SearchBarSlot
            separateBackground
          />
          <Stack.Toolbar.Spacer />
          <Stack.Toolbar.Menu icon="slider.horizontal.3" accessibilityLabel="排序">
            {ORDERS.map((label, i) => (
              <Stack.Toolbar.MenuAction key={label} onPress={() => onOrderChange(i)}>
                {label}
              </Stack.Toolbar.MenuAction>
            ))}
          </Stack.Toolbar.Menu>
        </Stack.Toolbar>
      ) : null}

      <View style={[styles.container, { backgroundColor: colors.bg }]}>
        <SearchTypeTabs
          categoryIdx={categoryIdx}
          orderIdx={orderIdx}
          onCategoryChange={onCategoryChange}
          onOrderChange={onOrderChange}
        />

        <SearchSuggestionRow
          suggestions={suggestions}
          visible={showSuggest}
          onSelect={(value) => doSearch(value)}
        />

        <SearchResultList
          results={results}
          searching={searching}
          categoryIdx={categoryIdx}
          onEndReached={() => { if (!searching && results.length > 0) doSearch(keyword, page + 1); }}
          onOpenUser={handleOpenUser}
          onOpenMedia={handleOpenMedia}
        />
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
});
