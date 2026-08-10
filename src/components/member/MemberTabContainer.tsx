import { memo, useCallback, type ReactElement, type RefObject } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Host, ProgressView } from '@expo/ui/swift-ui';
import { FlashList } from '@shopify/flash-list';
import { Link } from 'expo-router';
import { Image as ExpoImage } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { Press } from '@/components/motion';
import { useType } from '@/components/type-scale';
import { useThemeColors } from '@/components/SwiftUIHost';
import { formatCount } from '@/utils/format';
import { fixedItemLayout } from '@/utils/list-layout';
import { RADII, continuous, shadow } from '@/theme/tokens';
import { TabError } from '@/components/member/tab-states';
import OpusTab from '@/app/member/opus-tab';
import ArticleTab from '@/app/member/article-tab';
import AudioTab from '@/app/member/audio-tab';
import CheeseTab from '@/app/member/cheese-tab';
import ShopTab from '@/app/member/shop-tab';
import GuardTab from '@/app/member/guard-tab';
import { MemberFolderTab } from '@/components/member/MemberFolderTab';
import type { DynItem, MemberTab, VideoItem } from './types';
import { biliCover } from '@/utils/image-url';

const videoLayout = fixedItemLayout(118);

const MemberVideoRow = memo(function MemberVideoRow({
  item,
  index: _index,
  colors,
  T,
}: {
  item: VideoItem;
  index: number;
  colors: ReturnType<typeof useThemeColors>;
  T: ReturnType<typeof useType>;
}) {
  return (
    <>
      <Link href={{ pathname: '/video/[id]', params: { id: item.bvid } }} asChild>
        <Press
          haptic
          scaleTo={0.98}
          style={StyleSheet.flatten([
            styles.videoRow,
            {
              backgroundColor: colors.isDark ? 'rgba(28,28,30,0.7)' : 'rgba(255,255,255,0.7)',
              ...shadow('md', colors.isDark),
            },
          ])}>
          <View style={styles.videoCoverWrap}>
            <ExpoImage
              source={{ uri: biliCover(item.pic, 320, 200) }}
              recyclingKey={item.pic}
              cachePolicy="memory-disk"
              style={[styles.videoCover, { backgroundColor: colors.fill2 }]}
              contentFit="cover"
            />
            <View style={styles.lengthBadge}>
              <Text style={styles.lengthText}>{item.length}</Text>
            </View>
          </View>
          <View style={styles.videoInfo}>
            <Text style={[T.subhead, styles.videoTitle, { color: colors.text }]} numberOfLines={2}>{item.title}</Text>
            <View style={styles.videoMeta}>
              <Ionicons name="play" size={12} color={colors.textTertiary} />
              <Text style={[T.caption1, styles.videoMetaText, { color: colors.textTertiary }]}>{formatCount(item.play)}播放</Text>
            </View>
          </View>
        </Press>
      </Link>
    </>
  );
});

const MemberCoinRow = memo(function MemberCoinRow({
  item,
  index: _index,
  colors,
  T,
}: {
  item: VideoItem;
  index: number;
  colors: ReturnType<typeof useThemeColors>;
  T: ReturnType<typeof useType>;
}) {
  return (
    <>
      <Link href={{ pathname: '/video/[id]', params: { id: item.bvid } }} asChild>
        <Press
          haptic
          scaleTo={0.98}
          style={StyleSheet.flatten([
            styles.videoRow,
            {
              backgroundColor: colors.isDark ? 'rgba(28,28,30,0.7)' : 'rgba(255,255,255,0.7)',
              ...shadow('md', colors.isDark),
            },
          ])}>
          <View style={styles.videoCoverWrap}>
            <ExpoImage
              source={{ uri: biliCover(item.pic, 320, 200) }}
              recyclingKey={item.pic}
              cachePolicy="memory-disk"
              style={[styles.videoCover, { backgroundColor: colors.fill2 }]}
              contentFit="cover"
            />
            {item.length ? (
              <View style={styles.lengthBadge}>
                <Text style={styles.lengthText}>{item.length}</Text>
              </View>
            ) : null}
          </View>
          <View style={styles.videoInfo}>
            <Text style={[T.subhead, styles.videoTitle, { color: colors.text }]} numberOfLines={2}>{item.title}</Text>
            <View style={styles.videoMeta}>
              <Ionicons name="play" size={12} color={colors.textTertiary} />
              <Text style={[T.caption1, styles.videoMetaText, { color: colors.textTertiary }]}>{formatCount(item.play)}播放</Text>
            </View>
          </View>
        </Press>
      </Link>
    </>
  );
});

const MemberDynRow = memo(function MemberDynRow({
  item,
  index: _index,
  colors,
  T,
}: {
  item: DynItem;
  index: number;
  colors: ReturnType<typeof useThemeColors>;
  T: ReturnType<typeof useType>;
}) {
  return (
    <>
      <Link href={{ pathname: '/dynamics/[id]', params: { id: item.id } }} asChild>
        <Press
          haptic
          scaleTo={0.98}
          style={[styles.dynCard, { backgroundColor: colors.card }]}>
          <Text style={[T.footnote, { color: colors.textSecondary, marginBottom: 6 }]}>{item.time}</Text>
          {item.text ? <Text style={[T.subhead, { color: colors.text, lineHeight: 21 }]}>{item.text}</Text> : null}
          {item.pics.length > 0 && (
            <View style={styles.dynPics}>
              {item.pics.slice(0, 3).map((p, i) => (
                <ExpoImage
                  key={i}
                  source={{ uri: biliCover(p, 400, 400) }}
                  recyclingKey={p}
                  cachePolicy="memory-disk"
                  style={[styles.dynPic, { backgroundColor: colors.fill2 }]}
                  contentFit="cover"
                />
              ))}
            </View>
          )}
        </Press>
      </Link>
    </>
  );
});

export interface MemberTabContainerProps {
  activeTab: MemberTab;
  header: ReactElement;
  listRef: RefObject<any>;
  mid: number;
  videos: VideoItem[];
  dynamics: DynItem[];
  coinVideos: VideoItem[];
  videosLoadingMore: boolean;
  dynLoadingMore: boolean;
  videosError: string | null;
  dynLoading: boolean;
  dynError: string | null;
  coinsLoading: boolean;
  coinsError: string | null;
  onLoadMoreVideos: () => void;
  onLoadMoreDynamics: () => void;
  onRetryVideos: () => void;
  onRetryDynamics: () => void;
  onRetryCoins: () => void;
}

export function MemberTabContainer({
  activeTab,
  header,
  listRef,
  mid,
  videos,
  dynamics,
  coinVideos,
  videosLoadingMore,
  dynLoadingMore,
  videosError,
  dynLoading,
  dynError,
  coinsLoading,
  coinsError,
  onLoadMoreVideos,
  onLoadMoreDynamics,
  onRetryVideos,
  onRetryDynamics,
  onRetryCoins,
}: MemberTabContainerProps) {
  const colors = useThemeColors();
  const T = useType();

  const renderVideo = useCallback(
    ({ item, index }: { item: VideoItem; index: number }) => (
      <MemberVideoRow item={item} index={index} colors={colors} T={T} />
    ),
    [colors, T],
  );

  const renderCoinVideo = useCallback(
    ({ item, index }: { item: VideoItem; index: number }) => (
      <MemberCoinRow item={item} index={index} colors={colors} T={T} />
    ),
    [colors, T],
  );

  const renderDyn = useCallback(
    ({ item, index }: { item: DynItem; index: number }) => (
      <MemberDynRow item={item} index={index} colors={colors} T={T} />
    ),
    [colors, T],
  );

  if (activeTab === 'videos') {
    return (
      <FlashList
        ref={listRef}
        data={videos}
        keyExtractor={(it) => it.bvid}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={header}
        onEndReached={onLoadMoreVideos}
        onEndReachedThreshold={0.4}
        estimatedItemSize={118}
        overrideItemLayout={videoLayout}
        windowSize={9}
        initialNumToRender={10}
        maxToRenderPerBatch={12}
        drawDistance={250}
        overrideProps={{ initialDrawBatchSize: 10 }}
        ListFooterComponent={
          videosLoadingMore ? (
            <View style={{ marginVertical: 18, alignItems: 'center' }}>
              <Host matchContents><ProgressView /></Host>
            </View>
          ) : null
        }
        ListEmptyComponent={
          videosError ? (
            <TabError message={videosError} onRetry={onRetryVideos} />
          ) : (
            <View style={styles.emptyWrap}>
              <Ionicons name="videocam-outline" size={34} color={colors.textTertiary} />
              <Text style={[T.footnote, styles.emptyText, { color: colors.textSecondary }]}>暂无投稿</Text>
            </View>
          )
        }
        renderItem={renderVideo}
        ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
      />
    );
  }

  if (activeTab === 'dynamics') {
    return (
      <FlashList
        ref={listRef}
        data={dynamics}
        keyExtractor={(it) => it.id}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={header}
        onEndReached={onLoadMoreDynamics}
        onEndReachedThreshold={0.4}
        estimatedItemSize={160}
        windowSize={9}
        initialNumToRender={10}
        maxToRenderPerBatch={12}
        drawDistance={250}
        overrideProps={{ initialDrawBatchSize: 10 }}
        ListFooterComponent={
          dynLoadingMore ? (
            <View style={{ marginVertical: 18, alignItems: 'center' }}>
              <Host matchContents><ProgressView /></Host>
            </View>
          ) : null
        }
        ListEmptyComponent={
          dynLoading ? (
            <View style={{ marginTop: 50, alignItems: 'center' }}>
              <Host matchContents><ProgressView /></Host>
            </View>
          ) : dynError ? (
            <TabError message={dynError} onRetry={onRetryDynamics} />
          ) : (
            <View style={styles.emptyWrap}>
              <Ionicons name="pulse-outline" size={34} color={colors.textTertiary} />
              <Text style={[T.footnote, styles.emptyText, { color: colors.textSecondary }]}>暂无动态</Text>
            </View>
          )
        }
        renderItem={renderDyn}
        ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
      />
    );
  }

  if (activeTab === 'coins') {
    return (
      <FlashList
        ref={listRef}
        data={coinVideos}
        keyExtractor={(it) => it.bvid}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={header}
        estimatedItemSize={118}
        overrideItemLayout={videoLayout}
        windowSize={9}
        initialNumToRender={10}
        maxToRenderPerBatch={12}
        drawDistance={250}
        overrideProps={{ initialDrawBatchSize: 10 }}
        ListEmptyComponent={
          coinsLoading ? (
            <View style={{ marginTop: 50, alignItems: 'center' }}>
              <Host matchContents><ProgressView /></Host>
            </View>
          ) : coinsError ? (
            <TabError message={coinsError} onRetry={onRetryCoins} />
          ) : (
            <View style={styles.emptyWrap}>
              <Ionicons name="logo-bitcoin" size={34} color={colors.textTertiary} />
              <Text style={[T.footnote, styles.emptyText, { color: colors.textSecondary }]}>最近没有投币</Text>
            </View>
          )
        }
        renderItem={renderCoinVideo}
        ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
      />
    );
  }

  if (activeTab === 'opus') return <OpusTab mid={mid} header={header} listRef={listRef} />;
  if (activeTab === 'article') return <ArticleTab mid={mid} header={header} listRef={listRef} />;
  if (activeTab === 'audio') return <AudioTab mid={mid} header={header} listRef={listRef} />;
  if (activeTab === 'cheese') return <CheeseTab mid={mid} header={header} listRef={listRef} />;
  if (activeTab === 'shop') return <ShopTab mid={mid} header={header} listRef={listRef} />;
  if (activeTab === 'favorite') return <MemberFolderTab key="favorite" kind="favorite" mid={mid} header={header} listRef={listRef} />;
  if (activeTab === 'bangumi') return <MemberFolderTab key="pgc" kind="pgc" mid={mid} header={header} listRef={listRef} />;
  if (activeTab === 'collection') return <MemberFolderTab key="collection" kind="collection" mid={mid} header={header} listRef={listRef} />;
  return <GuardTab mid={mid} header={header} listRef={listRef} />;
}

const styles = StyleSheet.create({
  listContent: { paddingHorizontal: 14, paddingTop: 12, paddingBottom: 40 },
  dynCard: { borderRadius: RADII.md, padding: 14, ...continuous },
  dynPics: { flexDirection: 'row', gap: 6, marginTop: 10 },
  dynPic: { width: 100, height: 100, borderRadius: 8 },
  videoRow: { flexDirection: 'row', gap: 12, borderRadius: RADII.card, padding: 12, overflow: 'hidden', ...continuous },
  videoCoverWrap: { position: 'relative' },
  videoCover: { width: 150, height: 94, borderRadius: RADII.md, ...continuous },
  lengthBadge: { position: 'absolute', bottom: 6, right: 6, backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  lengthText: { color: '#FFFFFF', fontSize: 10.5, fontWeight: '600' },
  videoInfo: { flex: 1, justifyContent: 'space-between', paddingVertical: 2 },
  videoTitle: { fontWeight: '600' },
  videoMeta: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  videoMetaText: {},
  emptyWrap: { alignItems: 'center', paddingTop: 50, gap: 8 },
  emptyText: {},
});
