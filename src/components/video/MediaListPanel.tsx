import { useCallback } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Image as ExpoImage } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { Press } from '@/components/motion';
import { NativeBottomSheet } from '@/components/NativeBottomSheet';
import { RADII, continuous } from '@/theme/tokens';
import { biliCover } from '@/utils/image-url';
import { formatDuration } from '@/utils/format';
import type { useThemeColors } from '@/components/SwiftUIHost';
import type { useType } from '@/components/type-scale';
import type { MediaListItem } from '@/hooks/use-video-controller';

/* =====================================================================================
 * MediaListPanel —— 播放列表 medialist 队列面板（02-2.2「播放全部」连播队列）。
 * SwiftUI BottomSheet 弹层模式（detents medium/large + dragIndicator），视觉走 token。
 * 数据源：
 *   - 稍后再看「播放全部」（use-video-controller 模块缓存 queue 经 queue=1 参数接管）
 *   - UGC 合集连播（seasonEpisodes 平铺）
 * 交互：
 *   - 当前播放项高亮（accent 胶囊「正在播放」+ 进度条，进度来自控制器 timeUpdate 镜像）
 *   - 点击任意项走 onSelect（复用 switchEpisode：同视频切 P / 跨视频 push 并携带队列）
 *   - 底部「上一集 / 下一集」切上一项/下一项（循环取模）
 * ===================================================================================== */
export function MediaListPanel({
  visible,
  onClose,
  queue,
  title,
  currentBvid,
  currentCid,
  currentTime,
  duration,
  onSelect,
  onPlayNext,
  onPlayPrev,
  colors,
  T,
}: {
  visible: boolean;
  onClose: () => void;
  queue: MediaListItem[];
  title: string;
  currentBvid: string;
  currentCid: number;
  currentTime: number;
  duration: number;
  onSelect: (ep: { bvid?: string; cid?: number }) => void;
  onPlayNext: () => void;
  onPlayPrev: () => void;
  colors: ReturnType<typeof useThemeColors>;
  T: ReturnType<typeof useType>;
}) {
  const renderItem = useCallback(
    ({ item, index }: { item: MediaListItem; index: number }) => {
      // 当前项判定：合集队列按 bvid+cid；稍后再看队列（cid=0）按 bvid
      const isCurrent = item.cid
        ? item.bvid === currentBvid && item.cid === currentCid
        : item.bvid === currentBvid;
      const ratio = isCurrent && duration > 0 ? Math.min(1, currentTime / duration) : 0;
      return (
        <Press
          haptic
          scaleTo={0.97}
          onPress={() => onSelect(item)}
          style={[styles.mlRow, { borderBottomColor: colors.separator }]}>
          <ExpoImage
            source={{ uri: biliCover(item.pic || '', 160, 100) }}
            recyclingKey={item.pic || `${item.bvid}-${item.cid}`}
            style={[styles.mlCover, { backgroundColor: colors.fill2 }]}
            contentFit="cover"
          />
          <View style={styles.mlInfo}>
            <Text
              style={[
                T.footnote,
                styles.mlTitle,
                { color: isCurrent ? colors.accent : colors.text, fontWeight: isCurrent ? '600' : '400' },
              ]}
              numberOfLines={2}>
              {item.title}
            </Text>
            <View style={styles.mlMetaRow}>
              {isCurrent ? (
                <>
                  <View style={[styles.playingPill, { backgroundColor: colors.accent }]}>
                    <Ionicons name="play" size={9} color="#FFFFFF" />
                    <Text style={styles.playingText}>正在播放</Text>
                  </View>
                  {item.duration ? (
                    <Text style={[T.caption2, { color: colors.textTertiary }]}>{formatDuration(item.duration)}</Text>
                  ) : null}
                </>
              ) : (
                <Text style={[T.caption2, { color: colors.textTertiary }]}>{`第 ${index + 1} 项`}</Text>
              )}
            </View>
            {isCurrent && duration > 0 ? (
              <View style={[styles.mlProgressTrack, { backgroundColor: colors.fill3 }]}>
                <View
                  style={[
                    styles.mlProgressFill,
                    { backgroundColor: colors.accent, width: `${Math.max(2, Math.round(ratio * 100))}%` },
                  ]}
                />
              </View>
            ) : null}
          </View>
        </Press>
      );
    },
    [colors, T, currentBvid, currentCid, currentTime, duration, onSelect],
  );

  return (
    <NativeBottomSheet
      visible={visible}
      onClose={onClose}
      detents={['medium', 'large']}
      background={colors.bg}>
      <View style={styles.mlSheet}>
        {/* 顶部工具条：标题 + 关闭 */}
        <View style={[styles.mlToolbar, { borderBottomColor: colors.separator }]}>
          <Text style={[T.subhead, styles.mlToolbarTitle, { color: colors.text }]}>
            {`${title} (${queue.length})`}
          </Text>
          <Press haptic scaleTo={0.92} onPress={onClose} style={[styles.mlCloseBtn, { backgroundColor: colors.fill2 }]}>
            <Ionicons name="close" size={14} color={colors.textSecondary} />
          </Press>
        </View>
        <FlashList
          data={queue}
          keyExtractor={(item, i) => `ml-${item.bvid}-${item.cid || i}`}
          renderItem={renderItem}
          contentContainerStyle={styles.mlList}
          showsVerticalScrollIndicator={false}
          estimatedItemSize={64}
          drawDistance={250}
          overrideProps={{ initialDrawBatchSize: 12 }}
        />
        {/* 底部：上一集 / 下一集（循环切换，队列不足 2 项时禁用） */}
        <View style={[styles.mlFooter, { borderTopColor: colors.separator }]}>
          <Press
            haptic
            scaleTo={0.94}
            onPress={onPlayPrev}
            disabled={queue.length < 2}
            style={[styles.mlNavBtn, { backgroundColor: queue.length < 2 ? colors.fill3 : colors.fill2 }]}>
            <Ionicons name="play-skip-back" size={14} color={queue.length < 2 ? colors.textTertiary : colors.text} />
            <Text style={[T.footnote, { color: queue.length < 2 ? colors.textTertiary : colors.text, fontWeight: '600' }]}>
              上一集
            </Text>
          </Press>
          <Press
            haptic
            scaleTo={0.94}
            onPress={onPlayNext}
            disabled={queue.length < 2}
            style={[styles.mlNavBtn, { backgroundColor: queue.length < 2 ? colors.fill3 : colors.fill2 }]}>
            <Text style={[T.footnote, { color: queue.length < 2 ? colors.textTertiary : colors.text, fontWeight: '600' }]}>
              下一集
            </Text>
            <Ionicons name="play-skip-forward" size={14} color={queue.length < 2 ? colors.textTertiary : colors.text} />
          </Press>
        </View>
      </View>
    </NativeBottomSheet>
  );
}

const styles = StyleSheet.create({
  mlSheet: { flex: 1 },
  mlToolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  mlToolbarTitle: { fontWeight: '700' },
  mlCloseBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mlList: { paddingHorizontal: 20, paddingTop: 6, paddingBottom: 16 },
  mlRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  mlCover: { width: 92, height: 58, borderRadius: RADII.thumb, ...continuous },
  mlInfo: { flex: 1, gap: 4 },
  mlTitle: { lineHeight: 17 },
  mlMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  playingPill: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 7, paddingVertical: 2, borderRadius: RADII.xs },
  playingText: { color: '#FFFFFF', fontSize: 10, fontWeight: '700' },
  mlProgressTrack: { height: 3, borderRadius: 1.5, overflow: 'hidden', marginTop: 2 },
  mlProgressFill: { height: 3, borderRadius: 1.5 },
  mlFooter: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  mlNavBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: RADII.sm,
  },
});
