import { HttpString } from './constants';

export const Api = {
  // 推荐视频
  recommendListApp: `${HttpString.appBaseUrl}/x/v2/feed/index`,
  recommendListWeb: '/x/web-interface/wbi/index/top/feed/rcmd',
  feedDislike: `${HttpString.appBaseUrl}/x/feed/dislike`,
  feedDislikeCancel: `${HttpString.appBaseUrl}/x/feed/dislike/cancel`,

  // 热门视频
  hotList: '/x/web-interface/popular',

  // 视频流
  ugcUrl: '/x/player/wbi/playurl',
  pgcUrl: '/pgc/player/web/v2/playurl',

  // 字幕/播放信息
  playInfo: '/x/player/wbi/v2',

  // 视频详情
  videoIntro: '/x/web-interface/view',

  // 点赞
  likeVideo: `${HttpString.appBaseUrl}/x/v2/view/like`,
  pgcLikeCoinFav: '/pgc/season/episode/community',
  dislikeVideo: `${HttpString.appBaseUrl}/x/v2/view/dislike`,

  // 举报视频（B站标准举报接口：type=1 视频，reason_id 举报原因）
  videoReport: '/x/web-interface/report/add',

  // 投币
  coinVideo: `${HttpString.appBaseUrl}/x/v2/view/coin/add`,

  // 收藏
  favResourceList: '/x/v3/fav/resource/list',
  favVideo: '/x/v3/fav/resource/batch-deal',
  unfavAll: '/x/v3/fav/resource/unfav-all',
  copyFav: '/x/v3/fav/resource/copy',
  moveFav: '/x/v3/fav/resource/move',
  cleanFav: '/x/v3/fav/resource/clean',
  sortFav: '/x/v3/fav/resource/sort',
  sortFavFolder: '/x/v3/fav/folder/sort',
  favFolder: '/x/v3/fav/folder/created/list-all',
  userFavFolder: '/x/v3/fav/folder/created/list',
  favFolderInfo: '/x/v3/fav/folder/info',
  addFolder: '/x/v3/fav/folder/add',
  editFolder: '/x/v3/fav/folder/edit',
  deleteFolder: '/x/v3/fav/folder/del',
  favFavFolder: '/x/v3/fav/folder/fav',
  unfavFavFolder: '/x/v3/fav/folder/unfav',

  // 一键三连
  ugcTriple: '/x/web-interface/archive/like/triple',
  pgcTriple: '/pgc/season/episode/like/triple',

  // 稍后再看
  seeYouLater: '/x/v2/history/toview/web',
  toViewLater: '/x/v2/history/toview/add',
  toViewDel: '/x/v2/history/toview/v2/dels',
  toViewClear: '/x/v2/history/toview/clear',

  // 相关视频
  relatedList: '/x/web-interface/archive/related',

  // 关系
  relation: '/x/relation',
  relations: '/x/relation/relations',
  relationMod: '/x/relation/modify',
  followings: '/x/relation/followings',
  followSearch: '/x/relation/followings/search',
  fans: '/x/relation/fans',
  blackLst: '/x/relation/blacks',
  followUpTag: '/x/relation/tags',
  addUsers: '/x/relation/tags/addUsers',
  addSpecial: '/x/relation/tag/special/add',
  delSpecial: '/x/relation/tag/special/del',
  followUpGroup: '/x/relation/tag',
  createFollowTag: '/x/relation/tag/create',
  updateFollowTag: '/x/relation/tag/update',
  delFollowTag: '/x/relation/tag/del',
  sortFollowTag: '/x/relation/tags/update_sort',
  followedUp: '/x/relation/followings/followed_upper',
  sameFollowing: '/x/relation/same/followings',

  // 评论
  replyList: '/x/v2/reply',
  replyMain: '/x/v2/reply/main',
  replyMine: '/x/v2/reply/mine',
  replyReplyList: '/x/v2/reply/reply',
  likeReply: '/x/v2/reply/action',
  hateReply: '/x/v2/reply/hate',
  replyAdd: '/x/v2/reply/add',
  replyDel: '/x/v2/reply/del',
  replyTop: '/x/v2/reply/top',
  replyReport: '/x/v2/reply/report',
  replyInteraction: '/x/v2/reply/subject/interaction-status',
  replySubjectModify: '/x/v2/reply/subject/modify',

  // 用户
  userStat: '/x/relation/stat',
  userInfo: '/x/web-interface/nav',
  userStatOwner: '/x/web-interface/nav/stat',
  memberInfo: '/x/space/wbi/acc/info',
  memberCardInfo: '/x/web-interface/card',
  searchArchive: '/x/space/wbi/arc/search',
  memberDynamic: '/x/polymer/web-dynamic/v1/feed/space',
  dynSearch: '/x/polymer/web-dynamic/v1/feed/space/search',
  space: `${HttpString.appBaseUrl}/x/v2/space`,
  spaceArchive: `${HttpString.appBaseUrl}/x/v2/space/archive/cursor`,
  spaceStory: `${HttpString.appBaseUrl}/x/v2/feed/index/space/story/cursor`,
  spaceChargingArchive: `${HttpString.appBaseUrl}/x/v2/space/archive/charging`,
  spaceSeason: `${HttpString.appBaseUrl}/x/v2/space/season/videos`,
  spaceSeries: `${HttpString.appBaseUrl}/x/v2/space/series`,
  spaceBangumi: `${HttpString.appBaseUrl}/x/v2/space/bangumi`,
  spaceArticle: `${HttpString.appBaseUrl}/x/v2/space/article`,
  spaceFav: '/x/v3/fav/folder/space',
  spaceComic: `${HttpString.appBaseUrl}/x/v2/space/comic`,
  spaceAudio: '/audio/music-service/web/song/upper',
  spaceCheese: '/pugv/app/web/season/page',
  spaceShop: `${HttpString.mallBaseUrl}/community-hub/small_shop/feed/tab/item`,
  spaceOpus: '/x/polymer/web-dynamic/v1/opus/feed/space',
  spaceSetting: '/x/space/setting/app',
  spaceSettingMod: '/x/space/privacy/batch/modify',
  spaceReserve: '/x/space/reserve',
  spaceReserveCancel: '/x/space/reserve/cancel',
  getTopVideoApi: '/x/space/top/arc',
  getRecentCoinVideoApi: '/x/space/coin/video',
  getRecentLikeVideoApi: '/x/space/like/video',
  getMemberSeasonsApi: '/x/polymer/web-space/home/seasons_series',
  getMemberViewApi: '/x/space/upstat',
  seasonArchives: '/x/polymer/web-space/seasons_archives_list',
  seriesArchives: '/x/series/archives',
  seasonSeries: '/x/polymer/web-space/seasons_series_list',
  coinArc: `${HttpString.appBaseUrl}/x/v2/space/coinarc`,
  likeArc: `${HttpString.appBaseUrl}/x/v2/space/likearc`,
  userRealName: '/x/member/app/up/realname',
  reportMember: `${HttpString.spaceBaseUrl}/ajax/report/add`,

  // 动态
  followUp: '/x/polymer/web-dynamic/v1/portal',
  dynUplist: '/x/polymer/web-dynamic/v1/uplist',
  followDynamic: '/x/polymer/web-dynamic/v1/feed/all',
  thumbDynamic: '/x/dynamic/feed/dyn/thumb',
  dynamicDetail: '/x/polymer/web-dynamic/v1/detail',
  getUnreadDynamic: '/x/web-interface/dynamic/entrance',
  dynamicSpmPrefix: `${HttpString.spaceBaseUrl}/1/dynamic`,
  createDynamic: '/x/dynamic/feed/create/dyn',
  createTextDynamic: '/dynamic_svr/v1/dynamic_svr/create',
  removeDynamic: '/x/dynamic/feed/operate/remove',
  uploadBfs: '/x/dynamic/feed/draw/upload_bfs',
  uploadImage: '/x/upload/web/image',
  setTopDyn: '/x/dynamic/feed/space/set_top',
  rmTopDyn: '/x/dynamic/feed/space/rm_top',
  dynReserve: '/x/dynamic/feed/reserve/click',
  dynMention: '/x/polymer/web-dynamic/v1/mention/search',
  dynPic: '/x/polymer/web-dynamic/v1/detail/pic',
  dynTopicRcmd: '/x/topic/web/dynamic/rcmd',
  dynReaction: '/x/polymer/web-dynamic/v1/detail/reaction',
  dynPrivatePubSetting: '/x/dynamic/feed/dyn/private_pub_setting',
  editDyn: '/x/dynamic/feed/edit/dyn',
  dynamicReport: '/x/dynamic/feed/dynamic_report/add',
  opusDetail: '/x/polymer/web-dynamic/v1/opus/detail',

  // 历史记录
  historyList: '/x/web-interface/history/cursor',
  pauseHistory: '/x/v2/history/shadow/set',
  historyStatus: '/x/v2/history/shadow?jsonp=jsonp',
  clearHistory: '/x/v2/history/clear',
  delHistory: '/x/v2/history/delete',
  searchHistory: '/x/web-interface/history/search',
  historyReport: '/x/v2/history/report',

  // 搜索
  searchDefault: '/x/web-interface/wbi/search/default',
  searchSuggest: 'https://s.search.bilibili.com/main/suggest',
  searchByType: '/x/web-interface/wbi/search/type',
  searchTrending: '/x/v2/search/trending/ranking',
  searchRecommend: `${HttpString.appBaseUrl}/x/v2/search/recommend`,

  // 播放进度
  heartBeat: '/x/click-interface/web/heartbeat',
  roomEntryAction: `${HttpString.liveBaseUrl}/xlive/web-room/v1/index/roomEntryAction`,

  // 分P
  ab2c: '/x/player/pagelist',

  // 番剧
  pgcInfo: '/pgc/view/web/season',
  pugvInfo: '/pugv/view/web/season',
  episodeInfo: '/pgc/season/episode/web/info',
  pgcAdd: '/pgc/web/follow/add',
  pgcDel: '/pgc/web/follow/del',
  pgcUpdate: '/pgc/web/follow/status/update',
  favPgc: '/x/space/bangumi/follow/list',
  pgcIndexCondition: '/pgc/season/index/condition',
  pgcIndexResult: '/pgc/season/index/result',
  pgcRank: '/pgc/web/rank/list',
  pgcSeasonRank: '/pgc/season/rank/web/list',
  pgcTimeline: '/pgc/web/timeline',
  pgcReviewL: '/pgc/review/long/list',
  pgcReviewS: '/pgc/review/short/list',
  pgcReviewLike: '/pgc/review/action/like',
  pgcReviewDislike: '/pgc/review/action/dislike',
  pgcReviewPost: '/pgc/review/short/post',
  pgcReviewMod: '/pgc/review/short/modify',
  pgcReviewDel: '/pgc/review/short/del',
  seasonStatus: '/pgc/view/web/season/user/status',
  favPugv: '/pugv/app/web/favorite/page',
  addFavPugv: '/pugv/app/web/favorite/add',
  delFavPugv: '/pugv/app/web/favorite/del',

  // 直播
  liveRoomInfo: `${HttpString.liveBaseUrl}/xlive/web-room/v2/index/getRoomPlayInfo`,
  sendLiveMsg: `${HttpString.liveBaseUrl}/msg/send`,
  liveRoomInfoH5: `${HttpString.liveBaseUrl}/xlive/web-room/v1/index/getH5InfoByRoom`,
  liveRoomDmPrefetch: `${HttpString.liveBaseUrl}/xlive/web-room/v1/dM/gethistory`,
  liveRoomDmToken: `${HttpString.liveBaseUrl}/xlive/web-room/v1/index/getDanmuInfo`,
  liveFeedIndex: `${HttpString.liveBaseUrl}/xlive/app-interface/v2/index/feed`,
  liveFollow: `${HttpString.liveBaseUrl}/xlive/web-ucenter/user/following`,
  liveSecondList: `${HttpString.liveBaseUrl}/xlive/app-interface/v2/second/getList`,
  liveAreaList: `${HttpString.liveBaseUrl}/xlive/app-interface/v2/index/getAreaList`,
  liveRoomAreaList: `${HttpString.liveBaseUrl}/room/v1/Area/getList`,
  getLiveFavTag: `${HttpString.liveBaseUrl}/xlive/app-interface/v2/second/get_fav_tag`,
  setLiveFavTag: `${HttpString.liveBaseUrl}/xlive/app-interface/v2/second/set_fav_tag`,
  liveSearch: `${HttpString.liveBaseUrl}/xlive/app-interface/v2/search_live`,
  getLiveEmoticons: `${HttpString.liveBaseUrl}/xlive/web-ucenter/v2/emoticon/GetEmoticons`,
  getLiveInfoByUser: `${HttpString.liveBaseUrl}/xlive/web-room/v1/index/getInfoByUser`,
  liveSetSilent: `${HttpString.liveBaseUrl}/liveact/user_silent`,
  addShieldKeyword: `${HttpString.liveBaseUrl}/xlive/web-ucenter/v1/banned/AddShieldKeyword`,
  delShieldKeyword: `${HttpString.liveBaseUrl}/xlive/web-ucenter/v1/banned/DelShieldKeyword`,
  liveShieldUser: `${HttpString.liveBaseUrl}/liveact/shield_user`,
  liveLikeReport: `${HttpString.liveBaseUrl}/xlive/app-ucenter/v1/like_info_v3/like/likeReportV3`,
  superChatMsg: `${HttpString.liveBaseUrl}/av/v1/SuperChat/getMessageList`,
  superChatReport: `${HttpString.liveBaseUrl}/av/v1/SuperChat/report`,
  liveDmReport: `${HttpString.liveBaseUrl}/xlive/web-ucenter/v1/dMReport/Report`,
  liveContributionRank: `${HttpString.liveBaseUrl}/xlive/general-interface/v1/rank/queryContributionRank`,
  liveMedalWall: `${HttpString.liveBaseUrl}/xlive/web-ucenter/user/MedalWall`,
  memberGuard: `${HttpString.liveBaseUrl}/xlive/app-ucenter/v1/guard/MainGuardCardAll`,
  liveFeedback: `${HttpString.liveBaseUrl}/xlive/app-interface/v2/index/feedback`,

  // 消息
  msgUnread: `${HttpString.tUrl}/session_svr/v1/session_svr/single_unread`,
  msgFeedUnread: '/x/msgfeed/unread',
  msgFeedReply: '/x/msgfeed/reply',
  msgFeedAt: '/x/msgfeed/at',
  msgFeedLike: '/x/msgfeed/like',
  msgSysNotify: `${HttpString.messageBaseUrl}/x/sys-msg/query_notify_list`,
  msgSysUpdateCursor: `${HttpString.messageBaseUrl}/x/sys-msg/update_cursor`,
  sessionList: `${HttpString.tUrl}/session_svr/v1/session_svr/get_sessions`,
  sessionAccountList: `${HttpString.tUrl}/account/v1/user/cards`,
  sessionMsg: `${HttpString.tUrl}/svr_sync/v1/svr_sync/fetch_session_msgs`,
  ackSessionMsg: `${HttpString.tUrl}/session_svr/v1/session_svr/update_ack`,
  sendMsg: `${HttpString.tUrl}/web_im/v1/web_im/send_msg`,
  removeMsg: '/session_svr/v1/session_svr/remove_session',
  delSysMsg: '/x/sys-msg/del_notify_list',
  delMsgfeed: '/x/msgfeed/del',
  setTop: '/session_svr/v1/session_svr/set_top',
  msgSetNotice: '/x/msgfeed/notice',
  msgLikeDetail: '/x/msgfeed/like_detail',
  setMsgDnd: `${HttpString.tUrl}/link_setting/v1/link_setting/set_msg_dnd`,
  imUserInfos: `${HttpString.tUrl}/x/im/user_infos`,
  getSessionSs: `${HttpString.tUrl}/link_setting/v1/link_setting/get_session_ss`,
  getMsgDnd: `${HttpString.tUrl}/link_setting/v1/link_setting/get_msg_dnd`,
  setPushSs: `${HttpString.tUrl}/link_setting/v1/link_setting/set_push_ss`,
  imMsgReport: `${HttpString.tUrl}/x/bplus/im/report/add`,

  // 弹幕
  shootDanmaku: '/x/v2/dm/post',
  danmakuFilter: '/x/dm/filter/user',
  danmakuFilterAdd: '/x/dm/filter/user/add',
  danmakuFilterDel: '/x/dm/filter/user/del',
  danmakuLike: '/x/v2/dm/thumbup/add',
  danmakuReport: '/x/dm/report/add',
  danmakuRecall: '/x/dm/recall',
  danmakuEditState: '/x/v2/dm/edit/state',

  // 登录
  getCaptcha: `${HttpString.passBaseUrl}/x/passport-login/captcha?source=main_web`,
  smsCode: `${HttpString.passBaseUrl}/x/passport-login/web/sms/send`,
  logInByWebPwd: `${HttpString.passBaseUrl}/x/passport-login/web/login`,
  appSmsCode: `${HttpString.passBaseUrl}/x/passport-login/sms/send`,
  logInByAppSms: `${HttpString.passBaseUrl}/x/passport-login/login/sms`,
  loginByPwdApi: `${HttpString.passBaseUrl}/x/passport-login/oauth2/login`,
  safeCenterGetInfo: `${HttpString.passBaseUrl}/x/safecenter/user/info`,
  preCapture: `${HttpString.passBaseUrl}/x/safecenter/captcha/pre`,
  safeCenterSmsCode: `${HttpString.passBaseUrl}/x/safecenter/common/sms/send`,
  safeCenterSmsVerify: `${HttpString.passBaseUrl}/x/safecenter/login/tel/verify`,
  oauth2AccessToken: `${HttpString.passBaseUrl}/x/passport-login/oauth2/access_token`,
  getWebKey: `${HttpString.passBaseUrl}/x/passport-login/web/key`,
  qrcodeConfirm: `${HttpString.passBaseUrl}/x/passport-tv-login/h5/qrcode/confirm`,
  getTVCode: `${HttpString.passBaseUrl}/x/passport-tv-login/qrcode/auth_code`,
  qrcodePoll: `${HttpString.passBaseUrl}/x/passport-tv-login/qrcode/poll`,
  logout: `${HttpString.passBaseUrl}/login/exit/v2`,
  loginLog: '/x/member/web/login/log',
  loginDevices: `${HttpString.passBaseUrl}/x/safecenter/user_login_devices`,

  // 表情
  myEmote: '/x/emote/user/panel/web',

  // AI总结
  aiConclusion: '/x/web-interface/view/conclusion/get',

  // 排行榜
  getRankApi: '/x/web-interface/ranking/v2',

  // 在线人数
  onlineTotal: '/x/player/online/total',

  // 视频关系
  videoRelation: '/x/web-interface/archive/relation',
  videoTags: '/x/web-interface/view/detail/tag',

  // 笔记
  archiveNoteList: '/x/note/publish/list/archive',
  noteList: '/x/note/list',
  userNoteList: '/x/note/publish/list/user',
  addNote: '/x/note/add',
  delNote: '/x/note/del',
  delPublishNote: '/x/note/publish/del',
  archiveNote: '/x/note/list/archive',

  // 专栏
  favArticle: '/x/polymer/web-dynamic/v1/opus/feed/fav',
  delFavArticle: '/x/article/favorites/del',
  addFavArticle: '/x/article/favorites/add',
  articleList: '/x/article/list/web/articles',

  // 话题
  topicTop: `${HttpString.appBaseUrl}/x/topic/web/details/top`,
  topicFeed: '/x/polymer/web-dynamic/v1/feed/topic',
  topicFold: '/x/topic/web/details/fold',
  topicPubSearch: `${HttpString.appBaseUrl}/x/topic/pub/search`,
  favTopicList: '/x/topic/web/fav/list',
  addFavTopic: '/x/topic/fav/sub/add',
  delFavTopic: '/x/topic/fav/sub/cancel',
  likeTopic: '/x/topic/like',

  // 投票
  voteInfo: '/x/vote/vote_info',
  doVote: '/x/vote/do_vote',
  createVote: '/x/vote/create',
  updateVote: '/x/vote/update',
  followeeVotes: `${HttpString.tUrl}/vote_svr/v1/vote_svr/followee_votes`,

  // 预约
  createReserve: '/x/new-reserve/up/reserve/create',
  updateReserve: '/x/new-reserve/up/reserve/update',
  reserveInfo: '/x/new-reserve/up/reserve/info',

  // 订阅
  userSubFolder: '/x/v3/fav/folder/collected/list',
  favSeasonList: '/x/space/fav/season/list',
  favSeason: '/x/v3/fav/season/fav',
  unfavSeason: '/x/v3/fav/season/unfav',
  unfavFolder: '/x/v3/fav/folder/unfav',

  //  medialist
  mediaList: '/x/v2/medialist/resource/list',

  // 社区
  communityAction: '/x/community/cosmo/interface/simple_action',

  // 充电
  upowerRank: '/x/upower/up/member/rank/v2',

  // 会员
  vipExpAdd: '/x/vip/experience/add',
  coinLog: '/x/member/web/coin/log',
  expLog: '/x/member/web/exp/log',
  moralLog: '/x/member/web/moral/log',
  getCoin: `${HttpString.accountBaseUrl}/site/getCoin`,

  // 热门系列
  popularSeriesOne: '/x/web-interface/popular/series/one',
  popularSeriesList: '/x/web-interface/popular/series/list',
  popularPrecious: '/x/web-interface/popular/precious',

  // 音乐
  bgmDetail: '/x/copyright-music-publicity/bgm/detail',
  wishUpdate: '/x/copyright-music-publicity/bgm/wish/update',
  bgmRecommend: '/x/copyright-music-publicity/bgm/recommend_list',

  // 电竞
  matchInfo: '/x/esports/match/info',

  // 视频截图
  videoshot: '/x/player/videoshot',

  // 风控
  activateBuvidApi: '/x/internal/gaia-gateway/ExClimbWuzhi',
  gaiaVgateRegister: '/x/gaia-vgate/v1/register',
  gaiaVgateValidate: '/x/gaia-vgate/v1/validate',

  // 气泡
  bubble: '/x/tribee/v1/dyn/all',

  // 最新版
  latestApp: 'https://api.github.com/repos/bggRGjQaUbCoE/PiliPlus/releases',
} as const;
