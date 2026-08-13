import { useCallback, useEffect, useRef, useState, memo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  withSequence,
  useReducedMotion,
  interpolateColor,
} from 'react-native-reanimated';
import { Press } from '@/components/motion';
import { NativeBottomSheet } from '@/components/NativeBottomSheet';
import { FavFolderPicker, type FavFolderTarget } from '@/components/fav/FavFolderPicker';
import { useThemeColors } from '@/components/SwiftUIHost';
import { BILI } from '@/theme/bili-colors';
import { RADII, shadow, continuous } from '@/theme/tokens';
import { feedBack, feedBackSuccess } from '@/utils/feedback';
import { showToast } from '@/utils/toast';
import { favApi } from '@/api/fav';
import { useAuthStore } from '@/stores/auth';
import { getLatestTripleHandler } from '@/hooks/use-video-actions';
import type { useType } from '@/components/type-scale';
import { formatCount } from '@/utils/format';

/** 图标状态切换爆发动效（05-C3）：spring(damping 16, k=260) scale 1→1.25→1 + 颜色交叉淡入 150ms + haptic light */
const AnimatedIonicons = Animated.createAnimatedComponent(Ionicons);

/** 投币面板选项（批次5 P0 pay_coins：投 1 个币 / 投 2 个币） */
const COIN_OPTIONS = [1, 2] as const;

function ActionItem({
  T,
  iconActive,
  iconInactive,
  active,
  activeColor,
  inactiveColor,
  activeTextColor,
  textColor,
  label,
  onPress,
  onLongPress,
}: {
  T: ReturnType<typeof useType>;
  iconActive: keyof typeof Ionicons.glyphMap;
  iconInactive: keyof typeof Ionicons.glyphMap;
  active: boolean;
  activeColor: string;
  inactiveColor: string;
  activeTextColor: string;
  textColor: string;
  label: string;
  onPress: () => void;
  onLongPress?: () => void;
}) {
  const reducedMotion = useReducedMotion();
  const scale = useSharedValue(1);
  const progress = useSharedValue(active ? 1 : 0);
  const prevActive = useRef(active);

  useEffect(() => {
    if (reducedMotion) {
      /* 减弱动态效果：只切颜色，不做缩放爆发 */
      progress.set(active ? 1 : 0);
      return;
    }
    /* 颜色交叉淡入 150ms */
    progress.set(withTiming(active ? 1 : 0, { duration: 150 }));
    /* 激活瞬间：spring 爆发 1→1.25→1（damping 16, k=260）+ haptic light */
    if (active && !prevActive.current) {
      scale.set(
        withSequence(
          withSpring(1.25, { damping: 16, stiffness: 260 }),
          withSpring(1, { damping: 16, stiffness: 260 }),
        ),
      );
      feedBack();
    }
    prevActive.current = active;
  }, [active, reducedMotion]);

  const iconStyle = useAnimatedStyle(() => ({
    color: interpolateColor(progress.value, [0, 1], [inactiveColor, activeColor]),
  }));
  const countStyle = useAnimatedStyle(() => ({
    color: interpolateColor(progress.value, [0, 1], [textColor, activeTextColor]),
  }));
  const burstStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Press
      haptic
      scaleTo={0.92}
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={450}
      style={styles.actionBtn}>
      <Animated.View style={burstStyle}>
        <AnimatedIonicons name={active ? iconActive : iconInactive} size={20} style={iconStyle} />
      </Animated.View>
      <Animated.Text style={[T.caption2, styles.actionCount, countStyle]}>{label}</Animated.Text>
    </Press>
  );
}

export function VideoActionBar({
  colors,
  T,
  info,
  liked,
  coined,
  faved,
  onLike,
  onCoin,
  onFav,
  onShare,
  onMore,
  onCoinLongPress,
}: {
  colors: ReturnType<typeof useThemeColors>;
  T: ReturnType<typeof useType>;
  info: any;
  liked: boolean;
  coined: boolean;
  faved: boolean;
  onLike: () => void;
  /** 投币：multiply 缺省为 1（兼容父层只传无参回调）；批次5 投币面板传入 1/2 */
  onCoin: (multiply?: number) => void;
  /** 收藏：folderId 缺省走默认收藏夹切换；fav_panel 长按选择后传入目标收藏夹 id */
  onFav: (folderId?: number) => void;
  onShare: () => void;
  onMore: () => void;
  /**
   * 长按投币按钮 → 一键三连（批次5 P0 pay_coins）。
   * 未注入时回退到 use-video-actions 注册的最新 handleTriple（闭包保持新鲜）。
   */
  onCoinLongPress?: () => void;
}) {
  /* ===== 投币面板（1/2 币选择） ===== */
  const [coinSheetVisible, setCoinSheetVisible] = useState(false);

  /* 长按投币按钮 → 一键三连：优先用父层注入，未注入则取注册表最新 handler */
  const handleCoinLongPress = useCallback(() => {
    const triple = onCoinLongPress ?? getLatestTripleHandler();
    if (triple) triple();
  }, [onCoinLongPress]);

  /* 单击投币按钮 → 打开币数选择面板；仅当未投过币时弹出 */
  const handleCoinPress = useCallback(() => {
    if (!info || !useAuthStore.getState().isLoggedIn) {
      onCoin();
      return;
    }
    if (coined) {
      feedBackSuccess();
      showToast('已投过币');
      return;
    }
    setCoinSheetVisible(true);
  }, [coined, info, onCoin]);

  /* 选中 1/2 币后投币并关闭面板 */
  const handleCoinPick = useCallback(
    (multiply: number) => {
      setCoinSheetVisible(false);
      onCoin(multiply);
    },
    [onCoin],
  );

  /* ===== 收藏夹选择面板（fav_panel） ===== */
  const [favPickerVisible, setFavPickerVisible] = useState(false);
  const [favTargets, setFavTargets] = useState<FavFolderTarget[]>([]);

  /* 长按收藏按钮 → 拉取收藏夹列表并打开选择面板 */
  const handleFavLongPress = useCallback(async () => {
    if (!info || !useAuthStore.getState().isLoggedIn) {
      showToast('请先登录');
      return;
    }
    feedBack();
    try {
      const res = await favApi.folderAll({ up_mid: info?.owner?.mid || 0 });
      const list: FavFolderTarget[] = (res?.data?.list || [])
        .filter((f: any) => !f?.default) /* 默认收藏夹走单击逻辑，面板内不重复展示 */
        .map((f: any) => ({ id: f.id, title: f.title, media_count: f.media_count || 0 }));
      setFavTargets(list);
      setFavPickerVisible(true);
    } catch {
      showToast('收藏夹列表加载失败');
    }
  }, [info]);

  /* 面板内新建收藏夹（fav_panel：对齐 Flutter 创建后直接选中的交互） */
  const handleFavCreate = useCallback(
    async (title: string): Promise<number | null> => {
      try {
        const res = await favApi.addFolder({ title, intro: '', privacy: 0 });
        if (res?.code === 0 && res?.data?.id != null) {
          feedBackSuccess();
          showToast('收藏夹创建成功');
          return res.data.id;
        }
        showToast(res?.message || '创建失败');
        return null;
      } catch {
        showToast('创建失败');
        return null;
      }
    },
    [],
  );

  return (
    <>
      <View style={[styles.actionBar, { backgroundColor: colors.card }, shadow('md', colors.isDark)]}>
        <ActionItem
          T={T}
          iconActive="thumbs-up"
          iconInactive="thumbs-up-outline"
          active={liked}
          activeColor={colors.accent}
          inactiveColor={colors.textSecondary}
          activeTextColor={colors.accent}
          textColor={colors.textTertiary}
          label={formatCount(info?.stat.like || 0)}
          onPress={onLike}
        />
        <View style={[styles.actionDivider, { backgroundColor: colors.separator }]} />
        <ActionItem
          T={T}
          iconActive="logo-bitcoin"
          iconInactive="logo-bitcoin"
          active={coined}
          activeColor={colors.accent}
          inactiveColor={colors.textSecondary}
          activeTextColor={colors.accent}
          textColor={colors.textTertiary}
          label={formatCount(info?.stat.coin || 0)}
          onPress={handleCoinPress}
          onLongPress={handleCoinLongPress}
        />
        <View style={[styles.actionDivider, { backgroundColor: colors.separator }]} />
        <ActionItem
          T={T}
          iconActive="star"
          iconInactive="star-outline"
          active={faved}
          activeColor={BILI.star}
          inactiveColor={colors.textSecondary}
          activeTextColor={BILI.star}
          textColor={colors.textTertiary}
          label={formatCount(info?.stat.favorite || 0)}
          onPress={onFav}
          onLongPress={handleFavLongPress}
        />
        <View style={[styles.actionDivider, { backgroundColor: colors.separator }]} />
        <Press haptic scaleTo={0.92} onPress={onShare} style={styles.actionBtn}>
          <Ionicons name="share-outline" size={20} color={colors.textSecondary} />
          <Text style={[T.caption2, styles.actionCount, { color: colors.textTertiary }]}>分享</Text>
        </Press>
        <View style={[styles.actionDivider, { backgroundColor: colors.separator }]} />
        <Press haptic scaleTo={0.92} onPress={onMore} style={styles.actionBtn}>
          <Ionicons name="ellipsis-horizontal-circle-outline" size={20} color={colors.textSecondary} />
          <Text style={[T.caption2, styles.actionCount, { color: colors.textTertiary }]}>更多</Text>
        </Press>
      </View>

      {/* 投币面板（批次5 P0 pay_coins）：SwiftUI BottomSheet + 1/2 币选择 */}
      <NativeBottomSheet
        visible={coinSheetVisible}
        onClose={() => setCoinSheetVisible(false)}
        detents={['medium']}
        dragIndicator="visible"
        background={colors.bg}>
        <View style={styles.sheetBody}>
          <Text style={[T.subhead, styles.sheetTitle, { color: colors.text }]}>投币</Text>
          <View style={styles.coinGrid}>
            {COIN_OPTIONS.map((n) => (
              <Press
                key={n}
                haptic="medium"
                scaleTo={0.94}
                onPress={() => handleCoinPick(n)}
                style={[styles.coinBtn, { backgroundColor: colors.fill2 }, continuous]}>
                <Ionicons name="logo-bitcoin" size={22} color={colors.accent} />
                <Text style={[T.subhead, styles.coinBtnText, { color: colors.text, fontWeight: '700' }]}>投 {n} 个币</Text>
                {n === 2 ? (
                  <Text style={[T.caption2, { color: colors.textTertiary }]}>投 2 个币可获得双倍经验</Text>
                ) : null}
              </Press>
            ))}
          </View>
          <Text style={[T.caption1, styles.sheetHint, { color: colors.textTertiary }]}>
            长按投币按钮可一键三连（点赞 + 投币 + 收藏）
          </Text>
        </View>
      </NativeBottomSheet>

      {/* 收藏夹选择面板（批次5 P0 fav_panel）：长按收藏按钮打开，支持面板内新建收藏夹 */}
      <FavFolderPicker
        visible={favPickerVisible}
        kind="fav"
        targets={favTargets}
        colors={colors}
        T={T}
        onClose={() => setFavPickerVisible(false)}
        onCreate={handleFavCreate}
        onPick={(id) => {
          setFavPickerVisible(false);
          onFav(id);
        }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  actionBar: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: RADII.sheet,
    paddingVertical: 14,
    paddingHorizontal: 8,
  },
  actionBtn: { alignItems: 'center', justifyContent: 'center', paddingVertical: 8, gap: 3 },
  actionCount: { fontWeight: '600' },
  actionDivider: { width: StyleSheet.hairlineWidth, height: 26 },
  /* ===== 投币面板 ===== */
  sheetBody: { flex: 1, paddingHorizontal: 20, paddingTop: 18 },
  sheetTitle: { fontWeight: '700', marginBottom: 16 },
  coinGrid: { flexDirection: 'row', gap: 12 },
  coinBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 22,
    borderRadius: RADII.md,
  },
  coinBtnText: { letterSpacing: 0.2 },
  sheetHint: { marginTop: 20, textAlign: 'center', lineHeight: 18 },
});
