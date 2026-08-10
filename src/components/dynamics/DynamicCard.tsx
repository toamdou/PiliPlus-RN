import { memo, useCallback } from 'react';
import { View, Text, StyleSheet, ActionSheetIOS } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors } from '@/components/SwiftUIHost';
import { Press } from '@/components/motion';
import { useType } from '@/components/type-scale';
import { formatTime } from '@/utils/format';
import { feedBackMedium } from '@/utils/feedback';
import { useSettingsStore } from '@/stores/settings';
import { useAuthStore } from '@/stores/auth';
import { RADII, continuous, shadow } from '@/theme/tokens';
import type { DynamicCardAction, DynamicItem } from './feed-types';
import { DynamicActionBar } from './DynamicActionBar';
import { DynamicCardBody } from './DynamicCardBody';
import { dynArchiveFromMajor } from './dynamic-types';
import { biliCover } from '@/utils/image-url';

export interface DynamicCardProps {
  item: DynamicItem;
  colors: ReturnType<typeof useThemeColors>;
  compact?: boolean;
  onPress: (item: DynamicItem) => void;
  onAction: (item: DynamicItem, action: DynamicCardAction) => void;
}

export const DynamicCard = memo(function DynamicCard({
  item,
  colors,
  compact = false,
  onPress,
  onAction,
}: DynamicCardProps) {
  const T = useType();
  const author = item.modules?.module_author;
  const dynamic = item.modules?.module_dynamic;
  const stat = item.modules?.module_stat;
  const major = dynamic?.major;
  const archive = dynArchiveFromMajor(major);
  const showInteraction = useSettingsStore((s) => s.showDynInteraction);
  const currentMid = useAuthStore((s) => s.userInfo?.mid);
  const videoInfo = archive;
  const hasVideo = !!(videoInfo?.bvid || videoInfo?.aid);
  const cover = videoInfo?.cover || major?.live?.cover || major?.live_rcmd?.cover || major?.music?.cover || major?.common?.cover || major?.upower_common?.cover || major?.medialist?.cover;
  const isOwn = !!currentMid && author?.mid === currentMid;
  const isPinned = author?.isPinned === true;
  const isPrivate = author?.privatePub === 1;

  const handleLongPress = useCallback(() => {
    feedBackMedium();
    const actions: { label: string; onPress: () => void }[] = [
      { label: '转发', onPress: () => onAction(item, 'repost') },
      ...(isOwn
        ? [
            { label: '编辑', onPress: () => onAction(item, 'edit') },
            { label: isPinned ? '取消置顶' : '置顶', onPress: () => onAction(item, isPinned ? 'rmTop' : 'setTop') },
            { label: isPrivate ? '设为公开' : '设为私密', onPress: () => onAction(item, isPrivate ? 'public' : 'private') },
            { label: '删除', onPress: () => onAction(item, 'delete') },
          ]
        : [{ label: '举报', onPress: () => onAction(item, 'report') }]),
      ...(hasVideo
        ? [{ label: '稍后再看', onPress: () => onAction(item, 'later') }]
        : []),
      { label: '复制链接', onPress: () => onAction(item, 'copy') },
      { label: '分享', onPress: () => onAction(item, 'share') },
      ...(cover
        ? [{ label: '保存封面', onPress: () => onAction(item, 'cover') }]
        : []),
    ];
    ActionSheetIOS.showActionSheetWithOptions(
      {
        title: '动态操作',
        options: [...actions.map((a) => a.label), '取消'],
        cancelButtonIndex: actions.length,
      },
      (index) => {
        if (index >= 0 && index < actions.length) actions[index].onPress();
      },
    );
  }, [hasVideo, cover, item, onAction, isOwn, isPinned, isPrivate]);

  return (
    <Press
      haptic
      scaleTo={0.98}
      onPress={() => onPress(item)}
      onLongPress={handleLongPress}
      style={[
        styles.card,
        compact && styles.cardCompact,
        { backgroundColor: colors.isDark ? 'rgba(28,28,30,0.7)' : 'rgba(255,255,255,0.7)' },
        continuous,
        shadow('md', colors.isDark),
      ]}>
      {/* 作者头部 */}
      <View style={styles.cardHeader}>
        <ExpoImage
          source={{ uri: biliCover((author?.face || ''), 84, 84) }}
          /* recyclingKey：FlashList 回收单元格时防止旧视频作者头像残留 */
          recyclingKey={author?.face || ''}
          cachePolicy="memory-disk"
          style={[styles.avatar, { backgroundColor: colors.fill2 }]}
          contentFit="cover"
        />
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={[T.subhead, styles.authorName, { color: colors.text }]} numberOfLines={1}>
            {author?.name}
          </Text>
          <Text style={[T.caption1, styles.pubTime, { color: colors.textTertiary }]}>
            {formatTime(author?.pub_ts || 0)}
          </Text>
        </View>
        <Ionicons name="ellipsis-horizontal" size={17} color={colors.quaternaryLabel} />
      </View>

      <DynamicCardBody item={item} colors={colors} compact={compact} />

      {showInteraction ? <DynamicActionBar stat={stat} colors={colors} /> : null}
    </Press>
  );
});

const styles = StyleSheet.create({
  /* §5.11/5.12 卡片：continuous 圆角 + tokens.shadow + overflow hidden 裁切半透明底衬 */
  card: {
    borderRadius: RADII.card,
    padding: 16,
    overflow: 'hidden',
  },
  cardCompact: {
    padding: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
  },
  avatar: { width: 42, height: 42, borderRadius: 21 },
  authorName: { fontWeight: '600' },
  pubTime: {},
});
