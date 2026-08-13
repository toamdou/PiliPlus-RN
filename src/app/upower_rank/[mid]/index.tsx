import { memo, useCallback, useRef, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Stack, Link, useLocalSearchParams, useScrollToTop } from 'expo-router';
import { Image as ExpoImage } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors, ACCENT } from '@/components/SwiftUIHost';
import { Press } from '@/components/motion';
import { useType } from '@/components/type-scale';
import { SkeletonRow } from '@/components/Skeleton';
import { userApi } from '@/api/user';
import { usePagedList } from '@/hooks/use-paged-list';
import type { NativeRequestCancelToken } from '@/utils/request-cancel';
import { showToast } from '@/utils/toast';
import { feedBackMedium } from '@/utils/feedback';
import { RADII, continuous, shadow } from '@/theme/tokens';
import { fixedItemLayout } from '@/utils/list-layout';
import { biliCover } from '@/utils/image-url';

const rowLayout = fixedItemLayout(64);

interface RankItem {
  mid: number;
  nickname: string;
  avatar: string;
  day: number;
}

interface LevelTab {
  privilegeType: number;
  name: string;
  memberTotal: number;
}

const RANK_COLORS = ['#FDAD13', '#8AACE1', '#DFA777'];

const RankRow = memo(function RankRow({
  item,
  rank,
  colors,
  T,
}: {
  item: RankItem;
  rank: number;
  colors: ReturnType<typeof useThemeColors>;
  T: ReturnType<typeof useType>;
}) {
  return (
    <View>
      <Link href={{ pathname: '/member/[mid]', params: { mid: String(item.mid) } }} asChild>
        <Press haptic scaleTo={0.98} style={[styles.row, { backgroundColor: colors.card, ...shadow('sm', colors.isDark) }]}>
          <Text style={[T.headline, styles.rank, { color: RANK_COLORS[rank] || colors.textTertiary }]}>{rank + 1}</Text>
          <ExpoImage
            source={{ uri: biliCover((item.avatar || ''), 96, 96) }}
            recyclingKey={item.avatar || ''}
            cachePolicy="memory-disk"
            style={[styles.avatar, { backgroundColor: colors.fill2 }]}
            contentFit="cover"
          />
          <View style={styles.info}>
            <Text style={[T.subhead, styles.name, { color: colors.text }]} numberOfLines={1}>{item.nickname || '用户'}</Text>
            <Text style={[T.caption2, { color: colors.textTertiary }]}>UID {item.mid}</Text>
          </View>
          <View style={[styles.dayTag, { backgroundColor: 'rgba(251,114,153,0.1)' }]}>
            <Ionicons name="flash" size={11} color={ACCENT} />
            <Text style={[T.caption1, styles.dayText, { color: ACCENT }]}>{item.day || 0} 天</Text>
          </View>
        </Press>
      </Link>
    </View>
  );
});

export default function UpowerRankScreen() {
  const { mid } = useLocalSearchParams<{ mid: string }>();
  const colors = useThemeColors();
  const T = useType();
  const listRef = useRef<any>(null);
  useScrollToTop(listRef);
  const midNum = Number(mid);
  const privilegeRef = useRef<number | undefined>(undefined);
  const [tabs, setTabs] = useState<LevelTab[]>([]);
  const [activePrivilege, setActivePrivilege] = useState<number | undefined>(undefined);

  const list = usePagedList<RankItem>({
    enabled: midNum > 0,
    fetchPage: async (page, cancelToken?: NativeRequestCancelToken) => {
      const res = await userApi.upowerRank({
        up_mid: midNum,
        pn: page,
        ...(privilegeRef.current != null ? { privilege_type: privilegeRef.current } : {}),
      }, cancelToken ? { cancelToken } : undefined);
      const data = res?.data;
      if (page === 1) {
        const rawTabs: any[] = data?.level_info ?? [];
        if (rawTabs.length > 1) {
          setTabs(rawTabs.map((t) => ({
            privilegeType: t.privilege_type,
            name: t.name || '',
            memberTotal: t.member_total ?? 0,
          })));
        } else {
          setTabs([]);
        }
      }
      const items: RankItem[] = (data?.rank_info ?? []).map((r: any) => ({
        mid: r.mid ?? 0,
        nickname: r.nickname ?? '',
        avatar: r.avatar ?? '',
        day: r.day ?? 0,
      }));
      return { items, hasMore: false };
    },
    onError: (e) => {
      console.error('upowerRank error:', e);
      showToast('充电排行加载失败');
    },
  });

  const changeTab = useCallback((tab: LevelTab) => {
    if (privilegeRef.current === tab.privilegeType) return;
    privilegeRef.current = tab.privilegeType;
    setActivePrivilege(tab.privilegeType);
    list.refresh();
  }, [list]);

  const backToAll = useCallback(() => {
    if (privilegeRef.current == null) return;
    privilegeRef.current = undefined;
    setActivePrivilege(undefined);
    list.refresh();
  }, [list]);

  const renderItem = useCallback(
    ({ item, index }: { item: RankItem; index: number }) => (
      <RankRow item={item} rank={index} colors={colors} T={T} />
    ),
    [colors, T],
  );

  const ItemSeparator = useCallback(() => <View style={{ height: 10 }} />, []);

  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]}>
      <Stack.Title large>充电排行榜</Stack.Title>
      <Stack.Header blurEffect="systemMaterial" style={{ shadowColor: 'transparent' }} />
      <FlashList
        ref={listRef}
        data={list.items}
        keyExtractor={(it) => String(it.mid)}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        renderItem={renderItem}
        ItemSeparatorComponent={ItemSeparator}
        ListHeaderComponent={
          tabs.length > 1 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabRow}>
              <Press
                haptic
                scaleTo={0.94}
                onPress={backToAll}
                style={[styles.chip, activePrivilege == null ? styles.chipActive : { backgroundColor: colors.fill2 }]}>
                <Text style={[T.caption1, { color: activePrivilege == null ? '#FFFFFF' : colors.textSecondary, fontWeight: activePrivilege == null ? '600' : '400' }]}>
                  全部
                </Text>
              </Press>
              {tabs.map((tab) => {
                const active = activePrivilege === tab.privilegeType;
                return (
                  <Press
                    key={tab.privilegeType}
                    haptic
                    scaleTo={0.94}
                    onPress={() => changeTab(tab)}
                    style={[styles.chip, active ? styles.chipActive : { backgroundColor: colors.fill2 }]}>
                    <Text style={[T.caption1, { color: active ? '#FFFFFF' : colors.textSecondary, fontWeight: active ? '600' : '400' }]}>
                      {`${tab.name || '等级'}(${tab.memberTotal || 0})`}
                    </Text>
                  </Press>
                );
              })}
            </ScrollView>
          ) : null
        }
        ListEmptyComponent={
          list.loading ? (
            <View style={styles.skeletonWrap}>
              <SkeletonRow height={56} />
              <SkeletonRow height={56} />
              <SkeletonRow height={56} />
            </View>
          ) : list.error ? (
            <View style={styles.emptyWrap}>
              <Ionicons name="cloud-offline-outline" size={38} color={colors.textTertiary} />
              <Text style={[T.headline, styles.emptyTitle, { color: colors.text }]}>加载失败</Text>
              <Press haptic scaleTo={0.94} onPress={list.refresh} style={[styles.retryBtn, { backgroundColor: colors.card }]}>
                <Text style={[T.subhead, styles.retryText, { color: ACCENT }]}>重试</Text>
              </Press>
            </View>
          ) : (
            <View style={styles.emptyWrap}>
              <Ionicons name="flash-outline" size={38} color={colors.textTertiary} />
              <Text style={[T.headline, styles.emptyTitle, { color: colors.text }]}>暂无充电排行</Text>
            </View>
          )
        }
        refreshControl={
          <RefreshControl
            refreshing={list.refreshing}
            onRefresh={() => {
              feedBackMedium();
              list.refresh();
            }}
            tintColor={colors.textSecondary}
          />
        }
        ListFooterComponent={
          list.loadingMore ? (
            <ActivityIndicator size="small" color={colors.textTertiary} style={{ marginVertical: 16 }} />
          ) : null
        }
        estimatedItemSize={64}
        overrideItemLayout={rowLayout}
        drawDistance={250}
        overrideProps={{ initialDrawBatchSize: 10 }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  listContent: { padding: 14, paddingBottom: 40 },
  tabRow: { gap: 8, paddingVertical: 2, marginBottom: 10 },
  chip: { borderRadius: RADII.circle, paddingHorizontal: 13, paddingVertical: 6, ...continuous },
  chipActive: { backgroundColor: ACCENT },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: RADII.card,
    padding: 12,
    ...continuous,
  },
  rank: { width: 32, textAlign: 'center', fontWeight: '800', fontStyle: 'italic' },
  avatar: { width: 40, height: 40, borderRadius: 20 },
  info: { flex: 1, gap: 3 },
  name: { fontWeight: '600' },
  dayTag: { flexDirection: 'row', alignItems: 'center', gap: 3, borderRadius: RADII.circle, paddingHorizontal: 9, paddingVertical: 4, ...continuous },
  dayText: { fontWeight: '600' },
  skeletonWrap: { gap: 10 },
  emptyWrap: { alignItems: 'center', paddingTop: 90, gap: 8 },
  emptyTitle: { fontWeight: '600' },
  retryBtn: { marginTop: 10, borderRadius: RADII.lg, paddingHorizontal: 28, paddingVertical: 9, ...continuous },
  retryText: { fontWeight: '600' },
});
