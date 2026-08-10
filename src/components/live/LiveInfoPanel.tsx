import {
  View, Text, StyleSheet, ScrollView, useWindowDimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Image as ExpoImage } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PiliPlayerView, type PiliPlayer } from 'pili-player';
import { useThemeColors, ACCENT } from '@/components/SwiftUIHost';
import { Glass } from '@/components/Glass';
import { Press } from '@/components/motion';
import { useType } from '@/components/type-scale';
import { useSettingsStore } from '@/stores/settings';
import { formatCount } from '@/utils/format';
import { biliCover } from '@/utils/image-url';
import { RADII, continuous, shadow } from '@/theme/tokens';
import { FullscreenScOverlay } from './FullscreenScOverlay';

export interface LiveInfo {
  room_id: number; uid: number; title: string; cover: string;
  live_status: number; online: number;
  anchor: { name: string; face: string };
}

export interface LiveEvent {
  id: number;
  type: 'gift' | 'guard' | 'interact';
  uname: string;
  text: string;
}

export function LiveInfoPanel({
  info,
  playUrl,
  player,
  followed,
  liked,
  topFans,
  liveEvents,
  superChats,
  superChatType,
  onFollow,
  onLike,
  onShare,
  onReport,
  onOpenMenu,
  liveAudioMode,
  onToggleLiveAudio,
}: {
  info: LiveInfo | null;
  playUrl: string;
  player: PiliPlayer | null;
  followed: boolean;
  liked: boolean;
  topFans: any[];
  liveEvents: LiveEvent[];
  superChats: any[];
  superChatType: number;
  onFollow: () => void;
  onLike: () => void;
  onShare: () => void;
  onReport: () => void;
  onOpenMenu: () => void;
  liveAudioMode: boolean;
  onToggleLiveAudio: () => void;
}) {
  const colors = useThemeColors();
  const T = useType();
  const { width: windowWidth } = useWindowDimensions();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const fullScreenScScale = useSettingsStore((s) => s.fullScreenScScale);

  return (
    <>
      {/* 播放器 */}
      <View style={[styles.playerWrap, { width: windowWidth }]}>
        {playUrl ? (
          <PiliPlayerView player={player} style={styles.player} videoGravity="contain" />
        ) : (
          <View style={[styles.player, styles.playerPlaceholder, { backgroundColor: '#1c1c1e' }]}>
            <Text style={[T.footnote, styles.placeholderText]}>{info?.live_status === 1 ? '加载中…' : '主播未开播'}</Text>
          </View>
        )}
        <FullscreenScOverlay superChats={superChats} scale={fullScreenScScale} />
        {/* 悬浮玻璃返回钮（浮于媒体之上，正当玻璃场景）*/}
        <Press haptic scaleTo={0.86} onPress={() => router.back()} style={[styles.backBtn, { top: insets.top + 8 }]}>
          <Glass variant="prominent" style={StyleSheet.absoluteFill} />
          <Ionicons name="chevron-back" size={19} color={colors.isDark ? '#FFFFFF' : '#111111'} />
        </Press>
        {/* 后台听直播：切到音频流，锁屏后可继续播放 */}
        <Press
          haptic
          scaleTo={0.86}
          disabled={!playUrl}
          onPress={onToggleLiveAudio}
          accessibilityRole="button"
          accessibilityLabel={liveAudioMode ? '退出后台听直播' : '后台听直播'}
          style={[
            styles.listenBtn,
            { top: insets.top + 8, opacity: playUrl ? 1 : 0.45 },
            liveAudioMode && { backgroundColor: ACCENT },
          ]}>
          <Glass variant="prominent" style={StyleSheet.absoluteFill} />
          <Ionicons
            name={liveAudioMode ? 'headset' : 'headset-outline'}
            size={19}
            color={liveAudioMode ? '#FFFFFF' : colors.isDark ? '#FFFFFF' : '#111111'}
          />
        </Press>
      </View>

      {/* 主播信息卡（实心抬升表面）*/}
      <View style={[styles.anchorCard, { backgroundColor: colors.card }, shadow('md', colors.isDark)]}>
        <View style={styles.anchorTopRow}>
          <ExpoImage source={{ uri: biliCover(info?.anchor.face || '', 96, 96) }} style={[styles.anchorAvatar, { backgroundColor: colors.fill2 }]} contentFit="cover" />
          <View style={styles.anchorInfo}>
            <Text style={[T.subhead, styles.anchorName, { color: colors.text }]} numberOfLines={1}>{info?.anchor.name}</Text>
            <Text style={[T.caption1, styles.roomTitle, { color: colors.textSecondary }]} numberOfLines={1}>{info?.title}</Text>
          </View>
          <View style={styles.onlinePill}>
            <Ionicons name="flame" size={12} color="#FFFFFF" />
            <Text style={styles.onlineText}>{`${formatCount(info?.online || 0)} 人气`}</Text>
          </View>
          {/* 设置菜单入口：分区切换 + 弹幕屏蔽管理 + 画质 */}
          <Press haptic scaleTo={0.88} onPress={onOpenMenu} style={styles.menuBtn}>
            <Ionicons name="ellipsis-horizontal" size={18} color={colors.textSecondary} />
          </Press>
        </View>
        <View style={styles.anchorActions}>
          <Press haptic scaleTo={0.92} onPress={onFollow} style={styles.anchorActionBtn}>
            <Ionicons name={followed ? 'checkmark' : 'add'} size={16} color={followed ? colors.textSecondary : ACCENT} />
            <Text style={[T.caption2, styles.anchorActionText, { color: followed ? colors.textSecondary : ACCENT }]}>
              {followed ? '已关注' : '关注'}
            </Text>
          </Press>
          <Press haptic scaleTo={0.92} onPress={onLike} style={styles.anchorActionBtn}>
            <Ionicons name={liked ? 'heart' : 'heart-outline'} size={16} color={liked ? ACCENT : colors.textSecondary} />
            <Text style={[T.caption2, styles.anchorActionText, { color: liked ? ACCENT : colors.textSecondary }]}>点赞</Text>
          </Press>
          <Press haptic scaleTo={0.92} onPress={onShare} style={styles.anchorActionBtn}>
            <Ionicons name="share-outline" size={16} color={colors.textSecondary} />
            <Text style={[T.caption2, styles.anchorActionText, { color: colors.textSecondary }]}>分享</Text>
          </Press>
          <Press haptic scaleTo={0.92} onPress={onReport} style={styles.anchorActionBtn}>
            <Ionicons name="flag-outline" size={16} color={colors.textSecondary} />
            <Text style={[T.caption2, styles.anchorActionText, { color: colors.textSecondary }]}>举报</Text>
          </Press>
        </View>
      </View>

      {/* 贡献榜 */}
      {topFans.length > 0 && (
        <View style={[styles.topFansCard, { backgroundColor: colors.card }, shadow('sm', colors.isDark)]}>
          <Text style={[T.subhead, styles.sectionLabel, { color: colors.text }]}>贡献榜</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.topFansContent}>
            {topFans.map((f: any, i: number) => (
              <Press
                key={f.uid || i}
                haptic
                scaleTo={0.94}
                onPress={() => { if (f.uid) router.push(`/member/${f.uid}` as any); }}
                style={styles.topFanItem}>
                <View style={styles.topFanRankWrap}>
                  <ExpoImage source={{ uri: biliCover((f.face || ''), 96, 96) }} recyclingKey={f.face || ''} style={[styles.topFanAvatar, { backgroundColor: colors.fill2 }]} contentFit="cover" />
                  <Text style={[styles.topFanRank, { color: i < 3 ? '#FF9500' : colors.textTertiary }]}>{i + 1}</Text>
                </View>
                <Text style={[T.caption2, styles.topFanName, { color: colors.textSecondary }]} numberOfLines={1}>{f.name || `UID ${f.uid || ''}`}</Text>
                <Text style={[T.caption2, { color: ACCENT, fontWeight: '600' }]} numberOfLines={1}>{formatCount(f.score || 0)}</Text>
              </Press>
            ))}
          </ScrollView>
        </View>
      )}

      {/* 实时礼物 / 舰长 / 进场 */}
      {liveEvents.length > 0 && (
        <View style={[styles.eventCard, { backgroundColor: colors.card }, shadow('sm', colors.isDark)]}>
          {liveEvents.slice(-5).reverse().map((e) => (
            <View key={e.id} style={styles.eventRow}>
              <Ionicons
                name={e.type === 'gift' ? 'gift-outline' : e.type === 'guard' ? 'shield-checkmark-outline' : 'enter-outline'}
                size={13}
                color={e.type === 'guard' ? '#FFD700' : ACCENT}
              />
              <Text style={[T.caption2, styles.eventText, { color: colors.textSecondary }]} numberOfLines={1}>
                <Text style={{ color: colors.text, fontWeight: '600' }}>{e.uname}</Text>
                {` ${e.text}`}
              </Text>
            </View>
          ))}
        </View>
      )}

      {/* SuperChat 消息（superChatType: 0=普通, 1=紧凑, 2=隐藏） */}
      {superChatType !== 2 && superChats.length > 0 && (
        <View style={{ paddingHorizontal: 12, paddingBottom: 8 }}>
          {superChats.slice(0, superChatType === 1 ? 2 : 3).map((sc: any) => (
            <View key={sc.id} style={{ backgroundColor: sc.background_color || 'rgba(255,182,0,0.15)', borderRadius: 8, padding: superChatType === 1 ? 6 : 8, marginBottom: superChatType === 1 ? 4 : 6 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <ExpoImage source={{ uri: biliCover(sc.user_info?.face || '', 48, 48) }} recyclingKey={sc.user_info?.face || ''} style={{ width: 24, height: 24, borderRadius: 12 }} />
                <Text style={{ color: colors.text, fontSize: 12, fontWeight: '600' }}>{sc.user_info?.uname}</Text>
                <Text style={{ color: ACCENT, fontSize: 12, fontWeight: '700', marginLeft: 'auto' }}>¥{sc.price}</Text>
              </View>
              {sc.message ? <Text style={{ color: colors.text, fontSize: 13, marginTop: 4 }}>{sc.message}</Text> : null}
            </View>
          ))}
        </View>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  /* 播放器 */
  playerWrap: { aspectRatio: 16 / 9, backgroundColor: '#000' },
  player: { width: '100%', height: '100%' },
  playerPlaceholder: { justifyContent: 'center', alignItems: 'center' },
  placeholderText: { color: '#8E8E93' },
  backBtn: { position: 'absolute', left: 12, width: 38, height: 38, borderRadius: 19, justifyContent: 'center', alignItems: 'center', overflow: 'hidden' },
  listenBtn: { position: 'absolute', right: 12, width: 38, height: 38, borderRadius: 19, justifyContent: 'center', alignItems: 'center', overflow: 'hidden' },
  /* 主播卡 */
  anchorCard: {
    gap: 10, marginHorizontal: 14, marginTop: 12, padding: 12, borderRadius: RADII.lg,
    ...continuous,
  },
  anchorTopRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  anchorAvatar: { width: 42, height: 42, borderRadius: 21 },
  anchorInfo: { flex: 1, gap: 2 },
  anchorName: { fontWeight: '700' },
  roomTitle: {},
  onlinePill: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: ACCENT, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4 },
  onlineText: { color: '#FFFFFF', fontSize: 11.5, fontWeight: '700' },
  menuBtn: { width: 32, height: 32, borderRadius: 16, justifyContent: 'center', alignItems: 'center' },
  anchorActions: {
    flexDirection: 'row',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(120,120,128,0.16)',
    paddingTop: 8,
    marginTop: 2,
  },
  anchorActionBtn: { flex: 1, alignItems: 'center', gap: 3, paddingVertical: 4 },
  anchorActionText: { fontWeight: '600' },
  /* 贡献榜 / 实时互动 */
  topFansCard: {
    marginHorizontal: 14, marginTop: 10, paddingHorizontal: 12, paddingTop: 10, paddingBottom: 6,
    borderRadius: RADII.lg, ...continuous,
  },
  sectionLabel: { fontWeight: '700', marginBottom: 8 },
  topFansContent: { gap: 14, paddingRight: 6 },
  topFanItem: { width: 56, alignItems: 'center', gap: 3 },
  topFanRankWrap: { position: 'relative' },
  topFanAvatar: { width: 40, height: 40, borderRadius: 20 },
  topFanRank: { position: 'absolute', right: -4, bottom: -2, fontSize: 10, fontWeight: '800' },
  topFanName: { maxWidth: 56 },
  eventCard: {
    marginHorizontal: 14, marginTop: 10, paddingHorizontal: 12, paddingVertical: 8,
    borderRadius: RADII.lg, gap: 6, ...continuous,
  },
  eventRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  eventText: { flex: 1 },
});
