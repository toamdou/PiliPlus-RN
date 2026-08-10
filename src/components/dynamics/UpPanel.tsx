import { memo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors, ACCENT } from '@/components/SwiftUIHost';
import { Press } from '@/components/motion';
import { useType } from '@/components/type-scale';
import { useSettingsStore } from '@/stores/settings';
import { RADII, continuous, shadow } from '@/theme/tokens';
import type { PortalData } from './feed-types';
import { biliCover } from '@/utils/image-url';

/* ===== UP 面板主播单元格 ===== */
const UpItemCell = memo(function UpItemCell({
  face,
  name,
  title,
  live,
  hasUpdate,
  onPress,
}: {
  face: string;
  name: string;
  title?: string;
  live?: boolean;
  hasUpdate?: boolean;
  onPress: () => void;
}) {
  const T = useType();
  const colors = useThemeColors();
  return (
    <Press haptic scaleTo={0.9} onPress={onPress} style={styles.upItemCell}>
      <View style={styles.upAvatarWrap}>
        <ExpoImage
          source={{ uri: biliCover(face, 88, 88) }}
          recyclingKey={face}
          cachePolicy="memory-disk"
          style={[styles.upAvatar, { backgroundColor: colors.fill2 }]}
          contentFit="cover"
        />
        {live ? (
          <View style={[styles.upLiveDot, { borderColor: colors.card }]} />
        ) : hasUpdate ? (
          <View style={[styles.upUpdateDot, { borderColor: colors.card }]} />
        ) : null}
      </View>
      <Text style={[T.caption2, styles.upName, { color: colors.text }]} numberOfLines={1}>
        {name}
      </Text>
      {live ? (
        <Text style={[T.caption2, styles.upTitle, { color: colors.textTertiary }]} numberOfLines={1}>
          {title}
        </Text>
      ) : null}
    </Press>
  );
});

/* ===== 顶部 UP 面板：正在直播 + 关注 UP（对齐 Flutter up_panel 布局） ===== */
export const UpPanel = memo(function UpPanel({
  portal,
  colors,
  onOpenLiveFollow,
  onOpenLive,
  onOpenMember,
}: {
  portal: PortalData;
  colors: ReturnType<typeof useThemeColors>;
  onOpenLiveFollow: () => void;
  onOpenLive: (roomId: number) => void;
  onOpenMember: (mid: number) => void;
}) {
  const T = useType();
  const [expanded, setExpanded] = useState(() => useSettingsStore.getState().expandDynLivePanel);
  const liveItems = portal.live_users?.items ?? [];
  const upItems = portal.up_list?.items ?? [];
  const liveCount = portal.live_users?.count ?? liveItems.length;
  if (liveItems.length === 0 && upItems.length === 0) return null;
  return (
    <View
      style={[styles.upPanel, { backgroundColor: colors.isDark ? 'rgba(28,28,30,0.7)' : 'rgba(255,255,255,0.7)' }, continuous, shadow('md', colors.isDark)]}>
      {/* 头部 Live(n)：点击展开/收起，右侧箭头进入直播关注页 */}
      <View style={styles.upPanelHeader}>
        <Press
          haptic="selection"
          scaleTo={0.96}
          onPress={() => setExpanded((v) => !v)}
          style={styles.upPanelToggle}>
          <View style={styles.liveDotWrap}>
            <View style={styles.upLiveHeaderDot} />
            <Text style={[T.subhead, styles.upPanelHeaderText, { color: colors.text }]}>
              Live({liveCount})
            </Text>
            <Ionicons
              name={expanded ? 'chevron-up' : 'chevron-down'}
              size={14}
              color={colors.textTertiary}
            />
          </View>
        </Press>
        <Press
          haptic
          scaleTo={0.9}
          onPress={onOpenLiveFollow}
          accessibilityRole="button"
          accessibilityLabel="直播关注列表"
          style={styles.upPanelMore}>
          <Ionicons name="chevron-forward" size={15} color={colors.textTertiary} />
        </Press>
      </View>
      {/* 横向滚动主播区：正在直播（红点 + 房间标题）＋ 关注 UP（更新红点） */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.upPanelList}>
        {expanded &&
          liveItems.map((item) => (
            <UpItemCell
              key={`live-${item.mid}`}
              face={item.face}
              name={item.uname}
              title={item.title}
              live
              onPress={() => onOpenLive(item.room_id)}
            />
          ))}
        {upItems.map((item) => (
          <UpItemCell
            key={`up-${item.mid}`}
            face={item.face}
            name={item.uname}
            hasUpdate={item.has_update}
            onPress={() => onOpenMember(item.mid)}
          />
        ))}
      </ScrollView>
    </View>
  );
});

const styles = StyleSheet.create({
  upPanel: {
    marginBottom: 16,
    borderRadius: RADII.card,
    overflow: 'hidden',
    paddingTop: 2,
  },
  upPanelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    height: 42,
  },
  upPanelToggle: {
    flex: 1,
    height: '100%',
    justifyContent: 'center',
  },
  upPanelMore: {
    width: 32,
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  liveDotWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  upLiveHeaderDot: {
    width: 9,
    height: 9,
    borderRadius: 4.5,
    backgroundColor: '#FF4D6A',
  },
  upPanelHeaderText: { fontWeight: '600' },
  upPanelList: {
    paddingHorizontal: 10,
    paddingBottom: 12,
  },
  upItemCell: {
    width: 74,
    alignItems: 'center',
    paddingVertical: 4,
    gap: 3,
  },
  upAvatarWrap: { position: 'relative' },
  upAvatar: { width: 44, height: 44, borderRadius: 22 },
  /* 正在直播红点（头像右上角） */
  upLiveDot: {
    position: 'absolute',
    top: -1,
    right: -1,
    width: 13,
    height: 13,
    borderRadius: 6.5,
    backgroundColor: '#FF4D6A',
    borderWidth: 2,
  },
  /* 关注 UP 更新红点（有更新时） */
  upUpdateDot: {
    position: 'absolute',
    top: 0,
    right: 1,
    width: 11,
    height: 11,
    borderRadius: 5.5,
    backgroundColor: ACCENT,
    borderWidth: 2,
  },
  upName: { fontWeight: '500' },
  upTitle: { fontSize: 10, lineHeight: 12, maxWidth: 66 },
});
