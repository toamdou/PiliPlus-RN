import { useCallback, useEffect, type Dispatch, type SetStateAction } from 'react';
import { Alert, Share } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { REPORT_REASONS, videoApi } from '@/api/video';
import { userApi } from '@/api/user';
import type { VideoInfo } from '@/hooks/use-video-comments';
import { useAuthStore } from '@/stores/auth';
import { feedBack, feedBackSuccess } from '@/utils/feedback';
import { showToast } from '@/utils/toast';

/**
 * 动作注册表（批次5 P0）：VideoActionBar 的长按三连等新交互无法经由
 * VideoIntroSection 的既有 props 透传（该文件由并行代理独占），
 * 这里提供一个模块级最新动作注册点，组件层按需取用、闭包始终新鲜。
 */
let latestTripleHandler: (() => void) | undefined;

export function setLatestTripleHandler(fn?: () => void) {
  latestTripleHandler = fn;
}

export function getLatestTripleHandler() {
  return latestTripleHandler;
}

export interface VideoActionsOptions {
  info: VideoInfo | null;
  liked: boolean;
  coined: boolean;
  faved: boolean;
  followed: boolean;
  setLiked: Dispatch<SetStateAction<boolean>>;
  setCoined: Dispatch<SetStateAction<boolean>>;
  setFaved: Dispatch<SetStateAction<boolean>>;
  setDisliked: Dispatch<SetStateAction<boolean>>;
  setFollowed: Dispatch<SetStateAction<boolean>>;
}

export function useVideoActions(options: VideoActionsOptions) {
  const {
    info,
    liked,
    coined,
    faved,
    followed,
    setLiked,
    setCoined,
    setFaved,
    setDisliked,
    setFollowed,
  } = options;

  const handleLike = useCallback(async () => {
    if (!info || !useAuthStore.getState().isLoggedIn) return;
    feedBackSuccess();
    const newLike = !liked;
    setLiked(newLike);
    if (newLike) setDisliked(false);
    await videoApi.like({ aid: info.aid, like: newLike ? 1 : 2 }).catch(() => setLiked(!newLike));
  }, [info, liked, setDisliked, setLiked]);

  /**
   * 投币（批次5 P0 pay_coins）：multiply 支持 1/2 币。
   * 单击投币按钮弹出币数面板后调用本函数（默认 1 币），与既有视频页投币行为兼容。
   */
  const handleCoin = useCallback(async (multiply = 1) => {
    if (!info || !useAuthStore.getState().isLoggedIn || coined) return;
    feedBackSuccess();
    setCoined(true);
    const res = await videoApi.coin({ aid: info.aid, multiply }).catch(() => null);
    if (res?.code === 0) {
      showToast(`已投 ${multiply} 个币`);
    } else {
      setCoined(false);
      showToast(res?.message || '投币失败');
    }
  }, [coined, info, setCoined]);

  /**
   * 一键三连（批次5 P0 pay_coins）：长按投币按钮触发，
   * 走既有 ugcTriple endpoint（02-feature-parity 2.3 已备未接 UI），
   * 成功后点赞/投币/收藏三态同步置真。
   */
  const handleTriple = useCallback(async () => {
    if (!info || !useAuthStore.getState().isLoggedIn) return;
    feedBackSuccess();
    try {
      const res = await videoApi.triple({ aid: info.aid, bvid: info.bvid });
      if (res?.code === 0) {
        setLiked(true);
        setCoined(true);
        setFaved(true);
        setDisliked(false);
        showToast('三连成功');
      } else {
        showToast(res?.message || '操作失败');
      }
    } catch {
      showToast('操作失败');
    }
  }, [info, setLiked, setCoined, setFaved, setDisliked]);

  /* 注册最新一键三连处理器，供 VideoActionBar 长按投币按钮取用（闭包保持新鲜） */
  useEffect(() => {
    setLatestTripleHandler(handleTriple);
    return () => setLatestTripleHandler(undefined);
  }, [handleTriple]);

  /**
   * 收藏（批次5 P0 fav_panel）：
   *  - folderId 为空 → 切换默认收藏夹（原单击语义，不变）；
   *  - folderId 有值 → 收藏到指定收藏夹（长按收藏按钮 → FavFolderPicker 选择）。
   * 返回是否成功。
   */
  const handleFav = useCallback(async (folderId?: number): Promise<boolean> => {
    if (!info || !useAuthStore.getState().isLoggedIn) return false;
    feedBackSuccess();
    if (folderId == null) {
      const newFav = !faved;
      setFaved(newFav);
      const res = await videoApi.favVideo({
        rid: info.aid,
        type: 2,
        add_media_ids: newFav ? '0' : '',
        del_media_ids: newFav ? '' : '0',
      }).catch(() => null);
      if (res?.code !== 0) {
        setFaved(!newFav);
        return false;
      }
      return true;
    }
    /* 收藏到指定收藏夹 */
    setFaved(true);
    const res = await videoApi.favVideo({
      rid: info.aid,
      type: 2,
      add_media_ids: String(folderId),
      del_media_ids: '',
    }).catch(() => null);
    if (res?.code === 0) {
      showToast('已收藏');
      return true;
    }
    setFaved(false);
    showToast(res?.message || '收藏失败');
    return false;
  }, [faved, info, setFaved]);

  const handleFollow = useCallback(async () => {
    if (!info || !useAuthStore.getState().isLoggedIn) return;
    feedBackSuccess();
    const newFollowed = !followed;
    setFollowed(newFollowed);
    await userApi
      .modifyRelation({ fid: info.owner.mid, act: newFollowed ? 1 : 2 })
      .catch(() => setFollowed(!newFollowed));
  }, [followed, info, setFollowed]);

  const handleShare = useCallback(() => {
    if (!info) return;
    feedBack();
    Share.share({
      title: info.title,
      message: `https://www.bilibili.com/video/${info.bvid}`,
    }).catch(() => {});
  }, [info]);

  const handleCopyLink = useCallback(async () => {
    feedBack();
    if (!info) return;
    try {
      await Clipboard.setStringAsync(`https://www.bilibili.com/video/${info.bvid}`);
      showToast('已复制视频链接');
    } catch (e) {
      console.error('copy link error:', e);
      showToast('复制失败');
    }
  }, [info]);

  const handleViewLater = useCallback(async () => {
    if (!info || !useAuthStore.getState().isLoggedIn) {
      showToast('请先登录');
      return;
    }
    feedBack();
    const res = await videoApi.toViewLater({ aid: info.aid }).catch(() => null);
    showToast(res?.code === 0 ? '已添加稍后再看' : '操作失败');
  }, [info]);

  const handleReportVideo = useCallback(() => {
    if (!info) return;
    Alert.alert('举报视频', '请选择举报原因', [
      ...REPORT_REASONS.map((r) => ({
        text: r.label,
        onPress: () => {
          videoApi.report({ rid: info.aid, type: 1, reason_id: r.code }).then((res) => {
            if (res?.code === 0) showToast('举报已提交');
            else showToast(res?.message || '举报失败');
          }).catch((e) => {
            console.error('report video error:', e);
            showToast('举报失败');
          });
        },
      })),
      { text: '取消', style: 'cancel' },
    ]);
  }, [info]);

  return {
    handleLike,
    handleCoin,
    handleTriple,
    handleFav,
    handleFollow,
    handleShare,
    handleCopyLink,
    handleViewLater,
    handleReportVideo,
  };
}
