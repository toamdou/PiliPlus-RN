import { memo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Link } from 'expo-router';
import { Image as ExpoImage } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors, ACCENT } from '@/components/SwiftUIHost';
import { Press } from '@/components/motion';
import { useType } from '@/components/type-scale';
import { formatCount, formatTime } from '@/utils/format';
import { RADII, continuous, shadow } from '@/theme/tokens';
import { biliCover } from '@/utils/image-url';
import { DynamicMedia } from './DynamicMedia';

export interface TopicTop {
  topic_item?: {
    id: number;
    name: string;
    view: number;
    discuss: number;
    fav: number;
    like: number;
    description?: string;
    is_fav?: boolean;
    is_like?: boolean;
  };
  topic_creator?: { uid: number; name: string; face: string };
}

export interface TopicSortConf {
  all_sort_by?: { sort_by?: number; sort_name?: string }[];
}

export interface TopicFeedList {
  has_more?: boolean;
  offset?: string;
  items?: TopicCardItem[];
  topic_sort_by_conf?: TopicSortConf;
}

export interface TopicDynPic {
  src?: string;
  url?: string;
}

export interface TopicDynArchive {
  bvid?: string;
  aid?: number;
  id?: number;
  season_id?: number;
  cover?: string;
  title?: string;
  duration_text?: string;
  stat?: { play?: number | string };
  badge?: { text?: string };
  jump_url?: string;
}

export interface TopicDynLive {
  id?: number;
  room_id?: number;
  live_status?: number;
  cover?: string;
  title?: string;
  area_name?: string;
  badge?: { text?: string };
}

export interface TopicDynMusic {
  id?: number;
  cover?: string;
  title?: string;
  label?: string;
}

export interface TopicDynCommon {
  title?: string;
  title_prefix?: string;
  desc?: string;
  cover?: string;
  jump_url?: string;
}

export interface TopicDynMedialist {
  id?: number;
  cover?: string;
  title?: string;
  sub_title?: string;
  badge?: { text?: string };
  jump_url?: string;
}

export interface TopicDynVote {
  vote_id: number;
  title?: string;
  join_num?: number;
}

export interface TopicDynMajor {
  type?: string;
  archive?: TopicDynArchive;
  ugc_season?: TopicDynArchive;
  pgc?: TopicDynArchive;
  courses?: TopicDynArchive;
  draw?: { items?: TopicDynPic[] };
  opus?: { title?: string; summary?: { text?: string }; pics?: TopicDynPic[] };
  live?: TopicDynLive;
  live_rcmd?: TopicDynLive;
  music?: TopicDynMusic;
  common?: TopicDynCommon;
  upower_common?: TopicDynCommon;
  medialist?: TopicDynMedialist;
  none?: { tips?: string };
  vote?: TopicDynVote;
}

export interface TopicCardItem {
  dynamic_card_item?: {
    id_str: string;
    type: string;
    modules: {
      module_author?: { name?: string; face?: string; pub_ts?: number; mid?: number };
      module_dynamic?: {
        desc?: { text?: string };
        topic?: { id: number; name: string };
        major?: TopicDynMajor;
        additional?: { type?: string; vote?: TopicDynVote };
      };
      module_stat?: { like?: { count: number }; comment?: { count: number }; forward?: { count: number } };
      module_tag?: { text?: string };
      module_collection?: { title?: string };
      module_content?: { text?: { nodes?: { word?: { words?: string }; rich?: { text?: string; orig_text?: string } }[] }; heading?: { nodes?: { word?: { words?: string }; rich?: { text?: string; orig_text?: string } }[] }; pic?: { url?: string } }[];
    };
  };
  fold_card_item?: { fold_count?: number; fold_desc?: string };
  topic_type?: string;
}

export type TopicDyn = NonNullable<TopicCardItem['dynamic_card_item']>;

/* ===== 话题动态媒体（按类型分发） ===== */
export const TopicMedia = memo(function TopicMedia({
  dyn,
  colors,
}: {
  dyn: TopicDyn;
  colors: ReturnType<typeof useThemeColors>;
}) {
  return <DynamicMedia item={dyn} variant="topic" colors={colors} />;
});

/* ===== 话题动态行：折叠行 / 动态卡片（memo + 稳定 renderItem） ===== */
export const TopicFoldRow = memo(function TopicFoldRow({
  item,
  colors,
  T,
  onPress,
}: {
  item: TopicCardItem;
  colors: ReturnType<typeof useThemeColors>;
  T: ReturnType<typeof useType>;
  onPress: () => void;
}) {
  return (
    <Press
      haptic
      onPress={onPress}
      style={[styles.foldRow, { backgroundColor: colors.fill2 }]}>
      <Text style={[T.footnote, { color: colors.textSecondary }]} numberOfLines={1}>
        {item.fold_card_item?.fold_desc || '展开折叠内容'}
      </Text>
      <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
    </Press>
  );
});

export const TopicCardRow = memo(function TopicCardRow({
  item,
  colors,
  T,
}: {
  item: TopicCardItem;
  colors: ReturnType<typeof useThemeColors>;
  T: ReturnType<typeof useType>;
}) {
  const dyn = item.dynamic_card_item;
  if (!dyn) return null;
  const author = dyn.modules?.module_author;
  const md = dyn.modules?.module_dynamic;
  const desc = md?.desc?.text || md?.major?.opus?.summary?.text || md?.major?.opus?.title || '';
  return (
    <Link href={{ pathname: '/dynamics/[id]', params: { id: dyn.id_str } }} asChild>
      <Press
        haptic
        scaleTo={0.98}
        style={[styles.card, { backgroundColor: colors.card, ...shadow('md', colors.isDark) }]}>
        <View style={styles.cardHeader}>
          <ExpoImage
            source={{ uri: biliCover((author?.face || ''), 80, 80) }}
            recyclingKey={author?.face || ''}
            cachePolicy="memory-disk"
            style={[styles.avatar, { backgroundColor: colors.fill2 }]}
            contentFit="cover"
          />
          <View style={styles.cardAuthorInfo}>
            <Text style={[T.subhead, styles.cardAuthorName, { color: colors.text }]} numberOfLines={1}>
              {author?.name || ''}
            </Text>
            <Text style={[T.caption1, { color: colors.textTertiary }]}>{formatTime(author?.pub_ts || 0)}</Text>
          </View>
        </View>
        {desc ? (
          <Text style={[T.subhead, styles.desc, { color: colors.text }]} numberOfLines={5}>
            {desc}
          </Text>
        ) : null}
        <TopicMedia dyn={dyn} colors={colors} />
      </Press>
    </Link>
  );
});

const styles = StyleSheet.create({
  /* 卡片 */
  card: { borderRadius: RADII.card, padding: 14, ...continuous },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar: { width: 40, height: 40, borderRadius: 20 },
  cardAuthorInfo: { flex: 1, gap: 2 },
  cardAuthorName: { fontWeight: '600' },
  desc: { marginTop: 10 },
  /* 折叠行 */
  foldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    borderRadius: RADII.sm,
    paddingVertical: 12,
    ...continuous,
  },
});
