import { useState, useEffect, useRef, useCallback, useMemo, memo } from 'react';
import {
  View, Text, StyleSheet, RefreshControl, ActivityIndicator,
} from 'react-native';
import {
  Host,
  BottomSheet,
  Group,
  Picker,
  Text as SwiftText,
  Button as SwiftButton,
  HStack,
  VStack,
  Spacer,
  Image as SwiftImage,
  TextField as SwiftTextField,
  useNativeState,
} from '@expo/ui/swift-ui';
import {
  presentationDetents,
  presentationDragIndicator,
  pickerStyle,
  tag,
  buttonStyle,
  controlSize,
  font,
  foregroundStyle,
  frame,
  padding,
  background,
  cornerRadius,
  disabled,
  tint,
  labelStyle,
  lineLimit,
} from '@expo/ui/swift-ui/modifiers';
import { FlashList, FlashListRef } from '@shopify/flash-list';
import { Stack, useRouter, useScrollToTop } from 'expo-router';
import type { Href } from 'expo-router';
import { Image as ExpoImage } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemeColors, ACCENT } from '@/components/SwiftUIHost';
import { Press } from '@/components/motion';
import { useType } from '@/components/type-scale';
import { pgcApi } from '@/api/pgc';
import { formatCount } from '@/utils/format';
import { useAuthStore } from '@/stores/auth';
import { useSettingsStore } from '@/stores/settings';
import { feedBack, feedBackSuccess, feedBackMedium, openInAppBrowser } from '@/utils/feedback';
import { usePagedList } from '@/hooks/use-paged-list';
import type { NativeRequestCancelToken } from '@/utils/request-cancel';
import { SkeletonRow } from '@/components/Skeleton';
import { showToast } from '@/utils/toast';
import { RADII, continuous } from '@/theme/tokens';
import type { ReviewItem } from './pgc-types';
import { biliCover } from '@/utils/image-url';

/* ===== 点评项（短评：星级 + 内容 + 点赞；长评：标题 + 内容，点击打开专栏） ===== */
const ReviewRow = memo(function ReviewRow({ item, isLong, onLike, colors }: {
  item: ReviewItem;
  isLong: boolean;
  onLike: (item: ReviewItem) => void;
  colors: ReturnType<typeof useThemeColors>;
}) {
  const T = useType();
  const stars = Math.floor(item.score / 2);
  return (
    <View style={styles.reviewRow}>
      <View style={styles.reviewHead}>
        <ExpoImage
          source={{ uri: biliCover(item.author.avatar, 96, 96) }}
          recyclingKey={item.author.avatar}
          cachePolicy="memory-disk"
          style={[styles.reviewAvatar, { backgroundColor: colors.fill2 }]}
          contentFit="cover"
        />
        <View style={styles.reviewHeadInfo}>
          <Text style={[T.footnote, { color: colors.text, fontWeight: '600' }]} numberOfLines={1}>{item.author.uname || `UID ${item.author.mid}`}</Text>
          <View style={styles.reviewMetaRow}>
            {isLong ? (
              <Text style={[T.caption2, { color: colors.textTertiary }]} numberOfLines={1}>{item.push_time_str || ''}</Text>
            ) : (
              <>
                <View style={styles.starRow}>
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Ionicons key={i} name={i < stars ? 'star' : 'star-outline'} size={12} color={i < stars ? '#FF9500' : colors.textTertiary} />
                  ))}
                </View>
                {item.push_time_str ? (
                  <Text style={[T.caption2, { color: colors.textTertiary }]} numberOfLines={1}>{item.push_time_str}</Text>
                ) : null}
              </>
            )}
          </View>
        </View>
      </View>
      {isLong && item.title ? (
        <Text style={[T.subhead, styles.reviewTitle, { color: colors.text }]} numberOfLines={2}>{item.title}</Text>
      ) : null}
      <Text style={[T.footnote, styles.reviewContent, { color: colors.textSecondary }]}>{item.content}</Text>
      {!isLong ? (
        <View style={styles.reviewLikeRow}>
          <Press haptic scaleTo={0.88} onPress={() => onLike(item)} style={styles.likeBtn}>
            <Ionicons name={item.liked ? 'thumbs-up' : 'thumbs-up-outline'} size={13} color={item.liked ? ACCENT : colors.textTertiary} />
            <Text style={[T.caption2, styles.likeCount, { color: item.liked ? ACCENT : colors.textTertiary }]}>
              {item.likes > 0 ? formatCount(item.likes) : '赞'}
            </Text>
          </Press>
        </View>
      ) : null}
    </View>
  );
});

/* ===== 点评面板（写短评：星级 + 内容，对齐 Flutter PgcReviewPostPanel） ===== */
function ReviewPostPanel({ visible, seasonTitle, onClose, onSubmit, publishing }: {
  visible: boolean;
  seasonTitle: string;
  onClose: () => void;
  onSubmit: (score: number, content: string) => void;
  publishing?: boolean;
}) {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const [score, setScore] = useState(0);
  const [content, setContent] = useState('');
  const contentText = useNativeState('');

  useEffect(() => {
    if (!visible) return;
    const timer = setTimeout(() => {
      setScore(0);
      setContent('');
      contentText.set('');
    }, 0);
    return () => clearTimeout(timer);
  }, [contentText, visible]);

  const scoreLabel = ['轻触评分', '很差', '较差', '还行', '很好', '佳作'];
  const canPost = score > 0 && content.trim().length > 0;

  return (
    <Host>
      <BottomSheet
        isPresented={visible}
        onIsPresentedChange={(v) => { if (!v) onClose(); }}>
        <Group modifiers={[
          presentationDetents(['medium']),
          presentationDragIndicator('hidden'),
        ]}>
          {/* 短评面板控件均为 SwiftUI 原生视图，不再用 RNHostView 包裹整个 sheet */}
          <VStack spacing={12} alignment="leading" modifiers={[
            padding({ horizontal: 16, top: 6, bottom: insets.bottom + 12 }),
          ]}>
            <HStack spacing={8} alignment="center">
              <SwiftText
                modifiers={[
                  font({ size: 15, weight: 'semibold' }),
                  foregroundStyle(colors.text),
                  lineLimit(1),
                ]}>
                {seasonTitle || '写短评'}
              </SwiftText>
              <Spacer />
              <SwiftButton
                label="关闭"
                systemImage="xmark"
                onPress={onClose}
                modifiers={[
                  buttonStyle('borderless'),
                  labelStyle('iconOnly'),
                  tint(colors.textSecondary),
                ]}
              />
            </HStack>
            <HStack spacing={2} alignment="center" modifiers={[
              frame({ maxWidth: 9999, alignment: 'center' }),
            ]}>
              {Array.from({ length: 5 }).map((_, i) => (
                <SwiftButton
                  key={i}
                  onPress={() => setScore(i + 1)}
                  modifiers={[buttonStyle('borderless')]}>
                  <SwiftImage
                    systemName={i < score ? 'star.fill' : 'star'}
                    size={34}
                    color={i < score ? '#FF9500' : colors.textTertiary}
                  />
                </SwiftButton>
              ))}
              <SwiftText
                modifiers={[
                  font({ size: 12, weight: 'semibold' }),
                  foregroundStyle(score > 0 ? '#FF9500' : colors.textTertiary),
                ]}>
                {scoreLabel[score]}
              </SwiftText>
            </HStack>
            <VStack spacing={6} modifiers={[frame({ maxWidth: 9999 })]}>
              <SwiftTextField
                placeholder="说说你的观感吧…"
                text={contentText}
                onTextChange={setContent}
                axis="vertical"
                maxLength={100}
                modifiers={[
                  background(colors.fill2),
                  cornerRadius(RADII.md),
                  padding({ all: 12 }),
                  font({ size: 14.5, weight: 'regular' }),
                  frame({ minHeight: 90, maxWidth: 9999 }),
                ]}
              />
              <HStack>
                <Spacer />
                <SwiftText
                  modifiers={[
                    font({ size: 12 }),
                    foregroundStyle(colors.textTertiary),
                  ]}>
                  {content.length}/100
                </SwiftText>
              </HStack>
            </VStack>
            <SwiftButton
              label={publishing ? '发布中…' : '发布'}
              onPress={() => onSubmit(score, content)}
              modifiers={[
                buttonStyle('borderedProminent'),
                controlSize('large'),
                tint(canPost && !publishing ? ACCENT : colors.fill3),
                disabled(!canPost || publishing),
                frame({ maxWidth: 9999 }),
              ]}
            />
          </VStack>
        </Group>
      </BottomSheet>
    </Host>
  );
}

/* ===== 点评区块（短评/长评 双列表 + 发表入口） ===== */
export default function PgcReviewSection({ mediaId, seasonTitle }: { mediaId: number; seasonTitle: string }) {
  const colors = useThemeColors();
  const T = useType();
  const router = useRouter();
  const { isLoggedIn } = useAuthStore();
  const showBangumiReply = useSettingsStore((s) => s.showBangumiReply);
  const [subTab, setSubTab] = useState<'short' | 'long'>('short');
  const [showPost, setShowPost] = useState(false);
  const listRef = useRef<FlashListRef<ReviewItem>>(null);
  useScrollToTop(listRef);

  const shortNext = useRef<string | null>(null);
  const longNext = useRef<string | null>(null);

  const mapItems = (list: any[]): ReviewItem[] => (list || []).map((i: any) => ({
    review_id: i.review_id || 0,
    author: { mid: i.author?.mid || 0, uname: i.author?.uname || '', avatar: i.author?.avatar || '' },
    title: i.title || '',
    content: i.content || '',
    push_time_str: i.push_time_str || '',
    score: i.score || 0,
    likes: i.stat?.likes || 0,
    liked: i.stat?.liked === 1,
    article_id: i.article_id || 0,
  }));

  /* 短评：cursor 翻页（服务端忽略 pn，走 next 游标，对齐 Flutter cursor 分页） */
  const fetchShort = useCallback(async (page: number, cancelToken?: NativeRequestCancelToken) => {
    const params: { media_id: number; pn?: number; ps?: number; cursor?: string } = { media_id: mediaId, pn: page, ps: 20 };
    if (shortNext.current) params.cursor = shortNext.current;
    const res = await pgcApi.reviewShort(params, cancelToken ? { cancelToken } : undefined);
    shortNext.current = res?.data?.next || null;
    return { items: mapItems(res?.data?.list), hasMore: !!res?.data?.next };
  }, [mediaId]);

  const onShortError = useCallback((e: unknown) => {
    console.error('短评加载失败:', e);
    showToast('短评加载失败');
  }, []);

  const { items: shortItems, loading: shortLoading, refreshing: shortRefreshing, loadingMore: shortLoadingMore, error: shortError, refresh: shortRefresh, loadMore: shortLoadMore, setItems: setShortItems } = usePagedList<ReviewItem>({
    fetchPage: fetchShort,
    onError: onShortError,
    enabled: subTab === 'short',
  });

  const handleShortRefresh = useCallback(() => {
    feedBackMedium();
    shortNext.current = null;
    shortRefresh();
  }, [shortRefresh]);

  /* 长评 */
  const fetchLong = useCallback(async (page: number, cancelToken?: NativeRequestCancelToken) => {
    const params: { media_id: number; pn?: number; ps?: number; cursor?: string } = { media_id: mediaId, pn: page, ps: 20 };
    if (longNext.current) params.cursor = longNext.current;
    const res = await pgcApi.reviewLong(params, cancelToken ? { cancelToken } : undefined);
    longNext.current = res?.data?.next || null;
    return { items: mapItems(res?.data?.list), hasMore: !!res?.data?.next };
  }, [mediaId]);

  const onLongError = useCallback((e: unknown) => {
    console.error('长评加载失败:', e);
    showToast('长评加载失败');
  }, []);

  const { items: longItems, loading: longLoading, refreshing: longRefreshing, loadingMore: longLoadingMore, error: longError, refresh: longRefresh, loadMore: longLoadMore } = usePagedList<ReviewItem>({
    fetchPage: fetchLong,
    onError: onLongError,
    enabled: subTab === 'long',
  });

  const handleLongRefresh = useCallback(() => {
    feedBackMedium();
    longNext.current = null;
    longRefresh();
  }, [longRefresh]);

  const isLong = subTab === 'long';
  const items = isLong ? longItems : shortItems;
  const loading = isLong ? longLoading : shortLoading;
  const refreshing = isLong ? longRefreshing : shortRefreshing;
  const loadingMore = isLong ? longLoadingMore : shortLoadingMore;
  const error = isLong ? longError : shortError;
  const handleRefresh = isLong ? handleLongRefresh : handleShortRefresh;
  const loadMore = isLong ? longLoadMore : shortLoadMore;

  useEffect(() => {
    listRef.current?.scrollToOffset({ offset: 0, animated: false });
  }, [subTab]);

  /* 点赞短评（乐观更新 + 回滚；B 站业务错误以 HTTP 200 + code!=0 返回，需显式检查） */
  const toggleLike = useCallback((item: ReviewItem) => {
    if (!isLoggedIn) { router.push('/login' as Href); return; }
    feedBack();
    const newLiked = !item.liked;
    setShortItems((prev) => prev.map((it) => (
      it.review_id === item.review_id ? { ...it, liked: newLiked, likes: it.likes + (newLiked ? 1 : -1) } : it
    )));
    const revert = () => setShortItems((prev) => prev.map((it) => (
      it.review_id === item.review_id ? { ...it, liked: item.liked, likes: item.likes } : it
    )));
    const likeParams = { media_id: mediaId, review_id: item.review_id };
    pgcApi.reviewLike(likeParams).then((res: any) => {
      if (res?.code !== 0) {
        console.error('点赞短评失败:', res?.code, res?.message);
        showToast(res?.message || '点赞失败');
        revert();
      }
    }).catch((e) => {
      console.error('点赞短评失败:', e);
      showToast('点赞失败');
      revert();
    });
  }, [isLoggedIn, router, mediaId, setShortItems]);

  /* 发表短评（score 传 2 倍值，对齐 Flutter _score * 2；publishing 防双击重复发帖） */
  const [publishing, setPublishing] = useState(false);
  const submitReview = useCallback(async (score: number, content: string) => {
    if (!isLoggedIn) { router.push('/login' as Href); return; }
    if (publishing) return;
    setPublishing(true);
    try {
      const postParams = { media_id: mediaId, content, score: score * 2 };
      const res = await pgcApi.reviewPost(postParams);
      if (res?.code !== 0) {
        console.error('发布短评失败:', res?.code, res?.message);
        showToast(res?.message || '发布失败，请重试');
        return; // 业务失败：不关面板、不刷新
      }
      setShowPost(false);
      feedBackSuccess();
      showToast('点评成功');
      shortNext.current = null;
      shortRefresh();
    } catch (e) {
      console.error('发布短评失败:', e);
      showToast('发布失败，请重试');
    } finally {
      setPublishing(false);
    }
  }, [isLoggedIn, router, mediaId, shortRefresh, publishing]);

  const openWriteLong = useCallback(() => {
    openInAppBrowser(
      `https://member.bilibili.com/article-text/mobile?theme=${colors.isDark ? 1 : 0}&media_id=${mediaId}`,
    ).catch((e) => {
      console.error('打开写长评失败:', e);
    });
  }, [colors.isDark, mediaId]);

  const openArticle = useCallback((articleId: number) => {
    openInAppBrowser(`https://www.bilibili.com/read/cv${articleId}`)
      .catch((e) => {
        console.error('打开长评失败:', e);
      });
  }, []);

  const renderReview = useCallback(
    ({ item, index }: { item: ReviewItem; index: number }) => (
      <>
        <Press
          haptic={false}
          disabled={!isLong || item.article_id <= 0}
          onPress={() => openArticle(item.article_id)}
          style={[styles.reviewCell, index > 0 && { borderTopColor: colors.separator, borderTopWidth: StyleSheet.hairlineWidth }]}>
          <ReviewRow item={item} isLong={isLong} onLike={toggleLike} colors={colors} />
        </Press>
      </>
    ),
    [isLong, colors, openArticle, toggleLike],
  );

  const ListHeader = useMemo(
    () => (
      <View>
        <View style={styles.reviewToolbar}>
          <Host matchContents>
            <Picker
              label=""
              selection={isLong ? 1 : 0}
              onSelectionChange={(v) => setSubTab(Number(v) === 0 ? 'short' : 'long')}
              modifiers={[pickerStyle('segmented')]}>
              <SwiftText modifiers={[tag(0)]}>短评</SwiftText>
              <SwiftText modifiers={[tag(1)]}>长评</SwiftText>
            </Picker>
          </Host>
          <Press haptic scaleTo={0.9} onPress={isLong ? openWriteLong : () => setShowPost(true)} style={[styles.writeBtn, { backgroundColor: colors.fill2 }]}>
            <Ionicons name="create-outline" size={14} color={ACCENT} />
            <Text style={[T.footnote, styles.writeBtnText, { color: colors.textSecondary }]}>{isLong ? '写长评' : '写短评'}</Text>
          </Press>
        </View>
        <Text style={[T.caption1, styles.reviewHint, { color: colors.textTertiary }]}>
          {isLong ? '长评按评分排序，点击可查看全文' : '轻触点赞，写下你的评分'}
        </Text>
      </View>
    ),
    [isLong, colors, T, openWriteLong, setSubTab],
  );

  if (!showBangumiReply) return null;

  return (
    <View style={{ flex: 1 }}>
      <FlashList
        ref={listRef}
        data={items}
        keyExtractor={(it, idx) => String(it.review_id || idx)}
        contentContainerStyle={styles.reviewListContent}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.textSecondary} />}
        onEndReached={loadMore}
        onEndReachedThreshold={0.4}
        estimatedItemSize={160}
        windowSize={9}
        initialNumToRender={10}
        maxToRenderPerBatch={12}
        drawDistance={250}
        overrideProps={{ initialDrawBatchSize: 10 }}
        ListHeaderComponent={ListHeader}
        ListEmptyComponent={
          loading ? (
            <View style={styles.reviewSkeleton}>
              <SkeletonRow height={44} />
              <SkeletonRow height={44} />
              <SkeletonRow height={44} />
              <SkeletonRow height={44} />
            </View>
          ) : error ? (
            <View style={styles.emptyWrap}>
              <View style={[styles.emptyIconBox, { backgroundColor: colors.fill2 }]}>
                <Ionicons name="cloud-offline-outline" size={38} color={colors.textTertiary} />
              </View>
              <Text style={[T.headline, styles.emptyTitle, { color: colors.text }]}>加载失败</Text>
              <Text style={[T.footnote, styles.emptySub, { color: colors.textSecondary }]}>网络开小差了，试试重新加载</Text>
              <Press haptic scaleTo={0.94} onPress={handleRefresh} style={styles.retryBtn}>
                <Text style={[T.subhead, styles.retryBtnText]}>重新加载</Text>
              </Press>
            </View>
          ) : (
            <View style={styles.emptyWrap}>
              <View style={[styles.emptyIconBox, { backgroundColor: colors.fill2 }]}>
                <Ionicons name="chatbubble-ellipses-outline" size={38} color={colors.textTertiary} />
              </View>
              <Text style={[T.headline, styles.emptyTitle, { color: colors.text }]}>暂无点评</Text>
              <Text style={[T.footnote, styles.emptySub, { color: colors.textSecondary }]}>
                {isLong ? '还没有长评，来写第一篇吧' : '还没有短评，来写第一篇吧'}
              </Text>
            </View>
          )
        }
        ListFooterComponent={
          loadingMore ? (
            <ActivityIndicator size="small" color={colors.textTertiary} style={{ marginVertical: 16 }} />
          ) : null
        }
        renderItem={renderReview}
      />

      <ReviewPostPanel
        visible={showPost}
        seasonTitle={seasonTitle}
        onClose={() => setShowPost(false)}
        onSubmit={submitReview}
        publishing={publishing}
      />
      <Stack.Toolbar>
        <Stack.Toolbar.Button
          icon="pencil"
          accessibilityLabel={isLong ? '写长评' : '写短评'}
          onPress={isLong ? openWriteLong : () => setShowPost(true)}
        />
      </Stack.Toolbar>
    </View>
  );
}

const styles = StyleSheet.create({
  /* 点评 */
  reviewListContent: { paddingHorizontal: 14, paddingBottom: 40 },
  reviewToolbar: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 12 },
  writeBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 7, borderRadius: RADII.md, ...continuous },
  writeBtnText: { fontWeight: '600' },
  reviewHint: { marginTop: 8, marginBottom: 4 },
  reviewCell: { paddingVertical: 12 },
  reviewRow: { gap: 8 },
  reviewHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  reviewAvatar: { width: 34, height: 34, borderRadius: 17 },
  reviewHeadInfo: { flex: 1, gap: 2 },
  reviewMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  starRow: { flexDirection: 'row', gap: 1.5 },
  reviewTitle: { fontWeight: '700' },
  reviewContent: { lineHeight: 20 },
  reviewLikeRow: { flexDirection: 'row', justifyContent: 'flex-end' },
  likeBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 4, paddingHorizontal: 6 },
  likeCount: { fontWeight: '600' },
  reviewSkeleton: { gap: 14, paddingTop: 16 },
  /* 空态 */
  emptyWrap: { alignItems: 'center', justifyContent: 'center', paddingTop: 80, paddingHorizontal: 40, gap: 8 },
  emptyIconBox: { width: 84, height: 84, borderRadius: 42, justifyContent: 'center', alignItems: 'center', marginBottom: 8, ...continuous },
  emptyTitle: { fontWeight: '600' },
  emptySub: { textAlign: 'center' },
  retryBtn: { marginTop: 14, backgroundColor: ACCENT, borderRadius: RADII.lg, paddingHorizontal: 30, paddingVertical: 10 },
  retryBtnText: { color: '#FFFFFF', fontWeight: '600' },
});
