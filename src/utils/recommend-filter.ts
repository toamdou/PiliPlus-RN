import { useSettingsStore } from '@/stores/settings';

export interface FilterableVideo {
  title?: string;
  duration?: number;
  stat?: { view?: number; like?: number; danmaku?: number };
  owner?: { mid?: number; name?: string };
  isFollowed?: boolean; // 是否已关注该UP主
  [key: string]: any;
}

/**
 * 根据设置过滤推荐视频列表
 * - minLikeRatio: 点赞率过滤 (like/view >= ratio%)
 * - minDuration: 最短视频时长(秒)
 * - minPlay: 最低播放量
 * - banWordForRecommend: 标题关键词过滤(正则)
 * - exemptFilterForFollowed: 已关注的UP主不受过滤影响
 */
export function filterRecommendVideos<T extends FilterableVideo>(videos: T[]): T[] {
  const s = useSettingsStore.getState();
  let result = videos;

  // 已关注UP主豁免过滤
  const exemptFollowed = s.exemptFilterForFollowed;

  // 点赞率过滤
  if (s.minLikeRatio > 0) {
    result = result.filter((v) => {
      if (exemptFollowed && v.isFollowed) return true;
      const view = v.stat?.view || 0;
      const like = v.stat?.like || 0;
      if (view === 0) return true; // 无播放量数据不过滤
      return (like / view) * 100 >= s.minLikeRatio;
    });
  }

  // 视频时长过滤
  if (s.minDuration > 0) {
    result = result.filter((v) => {
      if (exemptFollowed && v.isFollowed) return true;
      const dur = v.duration || 0;
      return dur === 0 || dur >= s.minDuration;
    });
  }

  // 播放量过滤
  if (s.minPlay > 0) {
    result = result.filter((v) => {
      if (exemptFollowed && v.isFollowed) return true;
      const view = v.stat?.view || 0;
      return view === 0 || view >= s.minPlay;
    });
  }

  // 标题关键词过滤（推荐）
  if (s.banWordForRecommend.trim()) {
    try {
      const reg = new RegExp(s.banWordForRecommend, 'i');
      result = result.filter((v) => {
        if (exemptFollowed && v.isFollowed) return true;
        return !reg.test(v.title || '');
      });
    } catch {
      // 正则无效则不过滤
    }
  }

  return result;
}

/**
 * 分区/热门关键词过滤
 * banWordForZone: 用于热门/分区页面的关键词过滤
 */
export function filterZoneVideos<T extends FilterableVideo>(videos: T[]): T[] {
  const s = useSettingsStore.getState();
  if (!s.banWordForZone.trim()) return videos;
  try {
    const reg = new RegExp(s.banWordForZone, 'i');
    return videos.filter((v) => !reg.test(v.title || ''));
  } catch {
    return videos;
  }
}

/**
 * 过滤相关视频（applyFilterToRelated 控制是否应用推荐过滤到相关视频）
 */
export function filterRelatedVideos<T extends FilterableVideo>(videos: T[]): T[] {
  const s = useSettingsStore.getState();
  if (!s.applyFilterToRelated) return videos;
  return filterRecommendVideos(videos);
}

/**
 * 过滤动态中的带货内容 + 关键词过滤
 * antiGoodsDyn: 过滤带货/广告
 * banWordForDyn: 动态内容关键词过滤
 */
export function filterDynGoods<T extends { modules?: any }>(items: T[]): T[] {
  const s = useSettingsStore.getState();
  let result = items;

  // 带货/广告过滤
  if (s.antiGoodsDyn) {
    result = result.filter((item) => {
      const major = item.modules?.module_dynamic?.major;
      if (!major) return true;
      if (major.type === 'MAJOR_TYPE_GOODS' || major.type === 'MAJOR_TYPE_AD') return false;
      return true;
    });
  }

  // 动态关键词过滤
  if (s.banWordForDyn.trim()) {
    try {
      const reg = new RegExp(s.banWordForDyn, 'i');
      result = result.filter((item) => {
        const desc = item.modules?.module_dynamic?.desc?.text || '';
        const title = item.modules?.module_dynamic?.major?.archive?.title || '';
        return !reg.test(desc) && !reg.test(title);
      });
    } catch {
      // 正则无效不过滤
    }
  }

  return result;
}

/**
 * 评论关键词过滤 + 带货评论过滤
 * banWordForReply: 评论关键词
 * antiGoodsReply: 过滤带货评论
 */
export function filterReplyBanWords<T extends { content?: { message?: string }; up_action?: any }>(replies: T[]): T[] {
  const s = useSettingsStore.getState();
  let result = replies;

  // 关键词过滤
  if (s.banWordForReply.trim()) {
    try {
      const reg = new RegExp(s.banWordForReply, 'i');
      result = result.filter((r) => !reg.test(r.content?.message || ''));
    } catch {
      // 正则无效不过滤
    }
  }

  // 带货评论过滤
  if (s.antiGoodsReply) {
    result = result.filter((r) => {
      const msg = r.content?.message || '';
      // 检测常见带货关键词
      const goodsPatterns = ['优惠券', '折扣码', '点击链接', '购买链接', '淘口令', '复制这条'];
      return !goodsPatterns.some((p) => msg.includes(p));
    });
  }

  return result;
}
