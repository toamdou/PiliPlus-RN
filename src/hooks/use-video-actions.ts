import { useCallback, type Dispatch, type SetStateAction } from 'react';
import { Alert, Share } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { REPORT_REASONS, videoApi } from '@/api/video';
import { userApi } from '@/api/user';
import type { VideoInfo } from '@/hooks/use-video-comments';
import { useAuthStore } from '@/stores/auth';
import { feedBack, feedBackSuccess } from '@/utils/feedback';
import { showToast } from '@/utils/toast';

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

  const handleCoin = useCallback(async () => {
    if (!info || !useAuthStore.getState().isLoggedIn || coined) return;
    feedBackSuccess();
    setCoined(true);
    await videoApi.coin({ aid: info.aid, multiply: 1 }).catch(() => setCoined(false));
  }, [coined, info, setCoined]);

  const handleFav = useCallback(async () => {
    if (!info || !useAuthStore.getState().isLoggedIn) return;
    feedBackSuccess();
    const newFav = !faved;
    setFaved(newFav);
    await videoApi.favVideo({
      rid: info.aid,
      type: 2,
      add_media_ids: newFav ? '0' : '',
      del_media_ids: newFav ? '' : '0',
    }).catch(() => setFaved(!newFav));
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
    handleFav,
    handleFollow,
    handleShare,
    handleCopyLink,
    handleViewLater,
    handleReportVideo,
  };
}
