import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Image as ExpoImage } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { Press, Reveal } from '@/components/motion';
import { useType } from '@/components/type-scale';
import { useThemeColors, ACCENT } from '@/components/SwiftUIHost';
import { BILI } from '@/theme/bili-colors';
import { formatCount } from '@/utils/format';
import { useSettingsStore } from '@/stores/settings';
import { RADII, continuous, shadow } from '@/theme/tokens';
import { biliCover } from '@/utils/image-url';
import type { MemberInfo } from './types';

interface MemberHeaderCardProps {
  mid: string;
  info: MemberInfo | null;
  stat: { following: number; follower: number } | null;
  isFollowed: boolean;
  isOwner: boolean;
  onToggleFollow: () => void;
}

export function MemberHeaderCard({
  mid,
  info,
  stat,
  isFollowed,
  isOwner,
  onToggleFollow,
}: MemberHeaderCardProps) {
  const router = useRouter();
  const colors = useThemeColors();
  const T = useType();
  const showMedal = useSettingsStore((s) => s.showMedal);
  const showDecorate = useSettingsStore((s) => s.showDecorate);
  const isVip = info?.vip?.status === 1;
  /* 批次5 P3：头像挂件（pendant）——来自空间接口，仅当字段存在且展示装饰开启时渲染 */
  const pendantUrl = info?.pendant?.image || '';

  return (
    <Reveal delay={0}>
      <View style={[styles.profileCard, { backgroundColor: colors.card, ...shadow('md', colors.isDark) }]}>
        <View style={styles.profileTop}>
          <View style={styles.avatarWrap}>
            <ExpoImage
              source={{ uri: biliCover(info?.face || '', 256, 256) }}
              style={[styles.avatar, { backgroundColor: colors.fill2 }]}
              contentFit="cover"
            />
            {/* 头像挂件装饰层：叠在头像右上角位，尺寸 token 化；字段缺失/接口不含则不渲染 */}
            {showDecorate && pendantUrl ? (
              <ExpoImage
                source={{ uri: biliCover(pendantUrl, 160, 160) }}
                style={styles.avatarPendant}
                contentFit="contain"
                pointerEvents="none"
              />
            ) : null}
          </View>
          <View style={styles.nameWrap}>
            <Text style={[T.title3, styles.name, { color: colors.text }]} numberOfLines={1}>{info?.name}</Text>
            <View style={styles.badgeRow}>
              <View style={[styles.lvBadge, { backgroundColor: ACCENT }]}>
                <Text style={styles.lvText}>{`LV${info?.level}`}</Text>
              </View>
              {showMedal && isVip ? (
                <View style={styles.vipBadge}>
                  <Ionicons name="ribbon" size={10} color="#FFFFFF" />
                  <Text style={styles.vipText}>大会员</Text>
                </View>
              ) : null}
            </View>
          </View>
        </View>
        {showDecorate && info?.official.title ? (
          <View style={styles.officialRow}>
            {/* 官方认证星标：运营星级 token（原 #FF9500 硬编码 → BILI.star） */}
            <Ionicons name="checkmark-done-circle" size={13} color={BILI.star} />
            <Text style={[T.caption1, styles.officialText, { color: BILI.star }]} numberOfLines={1}>{info.official.title}</Text>
          </View>
        ) : null}
        <Text style={[T.footnote, styles.sign, { color: colors.textSecondary }]} numberOfLines={3}>
          {info?.sign || '这个人很懒，什么都没有写'}
        </Text>
        <View style={[styles.statRow, { borderTopColor: colors.separator }]}>
          <Press haptic scaleTo={0.9} onPress={() => router.push(`/follow?vmid=${mid}&type=following` as any)} style={styles.statCell}>
            <Text style={[T.headline, styles.statValue, { color: colors.text }]}>{formatCount(stat?.following || 0)}</Text>
            <Text style={[T.caption1, styles.statLabel, { color: colors.textSecondary }]}>关注</Text>
          </Press>
          <View style={[styles.statDivider, { backgroundColor: colors.separator }]} />
          <Press haptic scaleTo={0.9} onPress={() => router.push(`/follow?vmid=${mid}&type=fans` as any)} style={styles.statCell}>
            <Text style={[T.headline, styles.statValue, { color: colors.text }]}>{formatCount(stat?.follower || 0)}</Text>
            <Text style={[T.caption1, styles.statLabel, { color: colors.textSecondary }]}>粉丝</Text>
          </Press>
          <View style={[styles.statDivider, { backgroundColor: colors.separator }]} />
          <View style={styles.statCell}>
            <Press
              haptic
              scaleTo={0.94}
              onPress={onToggleFollow}
              style={[styles.followBtn, isFollowed ? { backgroundColor: colors.fill2 } : { backgroundColor: ACCENT }]}>
              <Ionicons name={isFollowed ? 'checkmark' : 'person-add'} size={15} color={isFollowed ? colors.textSecondary : '#FFFFFF'} />
              <Text style={[T.footnote, styles.followText, { color: isFollowed ? colors.textSecondary : '#FFFFFF' }]}>
                {isFollowed ? '已关注' : '关注'}
              </Text>
            </Press>
          </View>
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.entryScroll}
          contentContainerStyle={styles.entryRow}>
          {[
            { label: 'TA 的收藏', icon: 'star-outline' as const, href: `/member_favorite/${mid}` },
            { label: 'TA 的追番', icon: 'tv-outline' as const, href: `/member_pgc/${mid}` },
            { label: '网页投稿', icon: 'globe-outline' as const, href: `/member_video_web/${mid}` },
            { label: '合集/系列', icon: 'albums-outline' as const, href: `/member_ss_web/${mid}` },
            { label: 'TA 的专栏', icon: 'document-text-outline' as const, href: `/article_list/${mid}` },
            { label: '舰队', icon: 'shield-outline' as const, href: `/member_guard/${mid}` },
            { label: '充电榜', icon: 'flash-outline' as const, href: `/upower_rank/${mid}` },
            { label: '共同关注', icon: 'people-outline' as const, href: `/same_following/${mid}` },
            ...(isOwner ? [{ label: '关注我的', icon: 'person-add-outline' as const, href: '/followed' }] : []),
          ].map((entry) => (
            <Press
              key={entry.label}
              haptic
              scaleTo={0.94}
              onPress={() => router.push(entry.href as any)}
              style={[styles.entryChip, { backgroundColor: colors.fill2 }]}>
              <Ionicons name={entry.icon} size={14} color={ACCENT} />
              <Text style={[T.caption1, styles.entryChipText, { color: colors.textSecondary }]}>{entry.label}</Text>
            </Press>
          ))}
        </ScrollView>
      </View>
    </Reveal>
  );
}

const styles = StyleSheet.create({
  profileCard: { borderRadius: RADII.lg, padding: 18, ...continuous },
  profileTop: { flexDirection: 'row', gap: 14, alignItems: 'center' },
  avatar: { width: 68, height: 68, borderRadius: 34 },
  /* 头像挂件：挂件图以绝对定位叠在头像右上角（尺寸 token 化：挂件约头像 46%，卡片左上偏移留出挂件出框空间） */
  avatarWrap: { width: 68, height: 68, borderRadius: 34, ...continuous },
  avatarPendant: { position: 'absolute', top: -7, right: -7, width: 31, height: 31, zIndex: 2 },
  nameWrap: { flex: 1, gap: 7 },
  name: { fontWeight: '800' },
  badgeRow: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  /* 徽章圆角统一 RADII.xs（05-C1：徽章/tag 收敛 3/4/5/6） */
  lvBadge: { borderRadius: RADII.xs, paddingHorizontal: 6, paddingVertical: 2 },
  lvText: { color: '#FFFFFF', fontSize: 10.5, fontWeight: '700' },
  /* VIP 徽章：品牌粉 token（05-B8，原 #FF6699 硬编码 → BILI.pink，深色模式自动提亮） */
  vipBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: BILI.pink, borderRadius: RADII.xs, paddingHorizontal: 6, paddingVertical: 2 },
  vipText: { color: '#FFFFFF', fontSize: 10.5, fontWeight: '700' },
  officialRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 12 },
  officialText: { flex: 1 },
  sign: { marginTop: 12 },
  statRow: { flexDirection: 'row', alignItems: 'center', marginTop: 16, paddingTop: 14, borderTopWidth: StyleSheet.hairlineWidth },
  entryScroll: { marginTop: 14, marginHorizontal: -18 },
  entryRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 18 },
  entryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: RADII.circle,
    paddingHorizontal: 12,
    paddingVertical: 7,
    ...continuous,
  },
  entryChipText: { fontWeight: '500' },
  statCell: { flex: 1, alignItems: 'center', gap: 3 },
  statValue: { fontWeight: '800' },
  statLabel: {},
  statDivider: { width: StyleSheet.hairlineWidth, height: 28 },
  followBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 18, paddingVertical: 9, borderRadius: RADII.circle, ...continuous },
  followText: { fontWeight: '700' },
});
