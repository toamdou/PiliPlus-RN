/**
 * VideoCard —— 信息流卡片单元（主页六分类共用）。
 *
 * 卡片宿主链：iOS 上用 Link(asChild) > Link.Trigger + Link.Menu 挂原生 context menu。
 * 历史教训：@expo/ui 的 SwiftUI 宿主链（Host > ContextMenu > RNHostView）放进
 * FlashList item 会导致行距错位与触摸时卡片位移（SwiftUI 尺寸异步回写 + 原生
 * 触摸接管），已整体移除；Link.Menu 走 expo-router 原生菜单，不引入 RNHostView。
 *
 * 布局约定：cell 用"固定行高 + marginBottom"显式给出 Yoga 尺寸，行距稳定；
 * 两种模式卡片总高均固定（immersive 固定高度 / compact 封面 + 文字区动态计算）。
 */
import { memo, useCallback } from 'react';
import { View, StyleSheet, useWindowDimensions } from 'react-native';
import type {} from '@shopify/flash-list';
import { Link } from 'expo-router';
import type { Href } from 'expo-router';
import {
  GlassCard,
  type GlassCardData,
  immersiveHeightFor,
  compactCoverHeightFor,
} from '@/components/GlassCard';
import { useType } from '@/components/type-scale';
import { videoApi } from '@/api/video';
import { useAuthStore } from '@/stores/auth';
import { showToast } from '@/utils/toast';
import { biliCover } from '@/utils/image-url';

/* ---- 布局常量（与重构前一致，供页面骨架屏复用） ---- */
export const COLUMN_GAP = 10;
export const SIDE_PADDING = 12;
const DEFAULT_CARD_WINDOW_WIDTH = 390;
export function cardWidthFor(windowWidth: number): number {
  return (windowWidth - SIDE_PADDING * 2 - COLUMN_GAP) / 2;
}
export const CARD_WIDTH = cardWidthFor(DEFAULT_CARD_WINDOW_WIDTH);
/** 行间距：immersive 16 / compact 14，与重构前视觉一致 */
const ROW_GAP = { immersive: 16, compact: 14 } as const;

export interface VideoItem {
  aid: number;
  bvid: string;
  title: string;
  pic: string;
  duration: number;
  owner: { name: string; face: string; mid: number };
  stat: { view: number; danmaku: number };
  rcmd_reason?: string;
  dislike_reasons?: { id: number; name: string }[];
  goto?: 'av' | 'live' | 'pgc';
  live?: { roomid: number; area: string };
  pgc?: { season_id: number };
  /** 刷新标记：占位 item（新一批内容与历史内容的分界处，"点击刷新换一批"） */
  __marker?: true;
}

/** VideoItem → GlassCard 数据协议映射 */
function mapToCardData(item: VideoItem): GlassCardData {
  return {
    cover: coverThumb(item.pic),
    title: item.title,
    author: item.owner.name,
    playCount: item.stat.view,
    danmakuCount: item.stat.danmaku,
    duration: item.duration,
    category:
      item.rcmd_reason ||
      (item.goto === 'live' ? 'LIVE' : item.goto === 'pgc' ? 'BANGUMI' : undefined),
  };
}

/* 封面缩略：追加 B 站 CDN 缩放参数（对齐 Flutter ImageUtils.thumbnailUrl 的做法）。
   信息流直接解码原图（640~1280px 原始 JPEG）会在滚动时产生明显的解码/内存开销；
   16:9 目标尺寸已覆盖 immersive 全宽与 compact 双列两种布局。 */
function coverThumb(url: string): string {
  return biliCover(url, 640, 360);
}

/** compact 文字区固定高度：padding(10×2) + 标题两行 + gap(4) + UP主行 + 2px 余量（防算小裁切） */
function compactBodyHeight(subheadLineH: number, caption1LineH: number): number {
  return 10 + Math.max(38, subheadLineH * 2) + 4 + caption1LineH + 10 + 2;
}

/** 卡片 cell 总高（不含行间距），供 FlashList overrideItemLayout 复用同一套尺寸 */
export function cellHeightFor(
  mode: 'immersive' | 'compact',
  subheadLineH: number,
  caption1LineH: number,
  windowWidth = DEFAULT_CARD_WINDOW_WIDTH,
): number {
  return mode === 'compact'
    ? compactCoverHeightFor(windowWidth) + compactBodyHeight(subheadLineH, caption1LineH)
    : immersiveHeightFor(windowWidth);
}

export interface VideoCardProps {
  item: VideoItem;
  mode: 'immersive' | 'compact';
  /** 入场动画延迟（ms） */
  delay?: number;
  /** 长按"不感兴趣"提交成功后的移除回调（参数为视频 aid） */
  onDisliked?: (aid: number) => void;
}

function VideoCardBase({ item, mode, delay = 0, onDisliked }: VideoCardProps) {
  const T = useType();
  const { width: windowWidth } = useWindowDimensions();
  const isCompact = mode === 'compact';

  /* ---- 长按"不感兴趣"：列出接口下发的 dislikeReasons（前若干条）+ 通用"不感兴趣"兜底 ---- */
  const submitDislike = useCallback(async (reasonId: number) => {
    if (!useAuthStore.getState().isLoggedIn) {
      showToast('请先登录');
      return;
    }
    try {
      const res = await videoApi.feedDislike({ id: item.aid, reason_id: reasonId, goto: 'av' });
      if (res?.code === 0) {
        showToast('已减少此类推荐');
        onDisliked?.(item.aid);
      } else {
        showToast(res?.message || '操作失败');
      }
    } catch (e) {
      console.error('[VideoCard] feedDislike error:', e);
      showToast('操作失败');
    }
  }, [item.aid, onDisliked]);

  const cardHref = (
    item.goto === 'live' && item.live
      ? `/live/${item.live.roomid}`
      : item.goto === 'pgc' && item.pgc
        ? `/pgc/${item.pgc.season_id}`
        : `/video/${item.bvid}`
  ) as Href;

  /* 固定行高 + marginBottom：绕开 SwiftUI 尺寸回写导致的 FlashList 行高塌缩/按压跳变；
     marginBottom 计入 FlashList 单元格实测高度，行间距稳定 */
  const cellStyle = isCompact
    ? [
        styles.compactCell,
        {
          width: cardWidthFor(windowWidth),
          height:
            compactCoverHeightFor(windowWidth) +
            compactBodyHeight(T.subhead.lineHeight ?? 20, T.caption1.lineHeight ?? 16),
        },
      ]
    : [styles.immersiveCell, { height: immersiveHeightFor(windowWidth) }];

  return (
    <View style={cellStyle}>
      <Link
        href={cardHref}
        push
        asChild
        accessibilityLabel={item.title}>
        <Link.Trigger>
          <GlassCard
            mode={mode}
            data={mapToCardData(item)}
            onPress={() => {}}
            delay={delay}
          />
        </Link.Trigger>
        {item.aid > 0 ? (
          <Link.Menu title="不感兴趣">
            {item.dislike_reasons?.slice(0, 4).map((r) => (
              <Link.MenuAction key={r.id} onPress={() => submitDislike(r.id)}>
                {r.name}
              </Link.MenuAction>
            ))}
            <Link.MenuAction onPress={() => submitDislike(0)}>
              不感兴趣
            </Link.MenuAction>
          </Link.Menu>
        ) : null}
      </Link>
    </View>
  );
}

export const VideoCard = memo(VideoCardBase);

/* FlashList 2.0.2 的类型声明未包含首页及审计计划在用的 v1 风格调优 props，
   这里做最小合并，保持全站列表配置写法一致（运行时由列表内部版本决定生效项）。 */
declare module '@shopify/flash-list' {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface FlashListProps<TItem> {
    estimatedItemSize?: number;
    windowSize?: number;
    initialNumToRender?: number;
    maxToRenderPerBatch?: number;
  }
}

const styles = StyleSheet.create({
  immersiveCell: {
    width: '100%',
    marginBottom: ROW_GAP.immersive,
  },
  compactCell: {
    width: CARD_WIDTH,
    marginBottom: ROW_GAP.compact,
  },
});
