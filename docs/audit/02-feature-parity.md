# PiliPlus 功能移植完整性审计报告（Flutter → React Native）

- 审计日期：2026-08-13
- 审计方式：只读源码逐屏对比。Flutter 原版 `C:/Users/xingtongofficial/Desktop/piliplus/PiliPlus`（lib/pages 约 110 个页面目录，1297 个 dart 文件）；RN 移植版 `C:/Users/xingtongofficial/Desktop/piliplus/piliplus-RN`（src/app 约 90 个路由、src/components、src/api、modules/ 8 个 Swift 原生模块）。
- 状态定义：✅完整（子功能基本齐全）｜🟡部分（页面存在但缺可感知的子功能）｜❌缺失（无对应路由/组件）。
- 工作量定义：S ≤1 天｜M 2~4 天｜L ≥5 天。

---

## 一、总览统计

| 统计项 | 数量 |
|---|---|
| 审计条目总数（页面/模块/全局能力） | 167 |
| ✅ 完整 | 124（74%） |
| 🟡 部分 | 30（18%） |
| ❌ 缺失 | 13（8%） |

结论：RN 版整体移植完成度很高，核心链路（首页/视频播放/动态/搜索/收藏/直播/私信/设置）全部存在且深度可观；缺口集中在**视频页的深度交互（投币面板/收藏夹选择/选集面板/播放列表/AI大纲）**、**表情（emote）体系**、**文章原生阅读器**、**番剧索引/时间表主页**、**下载管理深度**等。

---

## 二、逐屏对比大表

### 1. 主框架 / 首页

| 屏幕/功能 | Flutter 路径 | RN 状态 | RN 路径 | 缺失细节 | 工作量 |
|---|---|---|---|---|---|
| 主框架/导航 | lib/pages/main | ✅ | src/app/(tabs)/_layout.tsx | 3 个原生 Tab（首页/动态/我的）+动态角标+底栏滚动隐藏 | — |
| 首页 home | lib/pages/home | ✅ | src/app/(tabs)/index.tsx + components/home/* | 直播/推荐/热门/分区/番剧/影视分类、玻璃搜索栏、未读角标、刷新保留标记均已实现；缺"导航栏 tab 自由增删排序的完整编辑"（bar_set 已有基础版） | S |
| 热门 hot | lib/pages/hot | ✅ | 并入 HomeCategoryBar「热门」 | — | — |
| 推荐 rcmd | lib/pages/rcmd | ✅ | hooks/use-rcmd-feed.ts | web/app 双源、过滤器、已关注豁免、保留刷新均实现 | — |
| 排行榜 rank | lib/pages/rank | ✅ | src/app/rank/index.tsx | 分区榜 | — |
| 每周必看 popular_series | lib/pages/popular_series | ✅ | src/app/popular_series | — | — |
| 入站必看 popular_precious | lib/pages/popular_precious | ✅ | src/app/popular_precious | — | — |
| 我的 mine | lib/pages/mine | ✅ | src/app/(tabs)/mine.tsx | 离线缓存/订阅/稍后再看/收藏/消息/资料/设备/日志/追番/评论/硬币/经验/漫画/关于全在；含匿名模式、多账号切换面板 | — |

### 2. 视频播放页（重点）

| 屏幕/功能 | Flutter 路径 | RN 状态 | RN 路径 | 缺失细节 | 工作量 |
|---|---|---|---|---|---|
| 视频详情页框架 | lib/pages/video/view.dart | ✅ | src/app/video/[id].tsx + components/video/* + hooks/use-video-controller.ts | 播放器/简介评论 Tab/弹幕开关/发弹幕/收起动画/互动视频(stein)/字幕自动加载/AI 总结/相关视频/在线人数/SponsorBlock/seek 缩略图/心跳与历史上报/听视频/后台自动转音频/画质切换/手势(亮度音量全屏字幕拖动)均已实现 | — |
| UGC 简介面板 | video/introduction/ugc | ✅ | components/video/VideoIntroSection.tsx | 点赞/投币/收藏/分享/关注/展开简介/标签 | — |
| PGC 简介面板 | video/introduction/pgc | ✅ | src/app/pgc/[id].tsx + components/pgc/* | — | — |
| 本地/离线视频简介 | video/introduction/local | 🟡 | download/player 简单播放 | 无离线视频详情页框架（本地视频元信息、分 P 列表） | M |
| 评论面板 reply | video/reply | ✅ | components/CommentSection.tsx | 排序/楼中楼/图片查看/置顶/删除/复制/搜索均实现 | — |
| 评论搜索 reply_search_item | video/reply_search_item | ✅ | CommentSection 内置搜索 | — | — |
| 发评论 reply_new | video/reply_new | 🟡 | CommentSection 内联回复框 | 支持文字+图片；❌无表情(emote)面板、无 @用户选择、无话题 | M |
| 投币面板 pay_coins | video/pay_coins | 🟡 | hooks/use-video-actions.ts handleCoin | 只投 1 个币；❌无 1/2 币选择弹窗、❌无长按"一键三连"（endpoint 已有 ugcTriple 未接 UI） | S |
| 收藏夹选择面板 fav_panel | lib/pages/fav_panel | 🟡 | components/fav/FavFolderPicker.tsx | FavFolderPicker 组件存在但**未接入视频页**；视频页收藏仅切换默认收藏夹，❌无长按选择文件夹、无面板内新建收藏夹 | S |
| 选集面板 episode_panel | lib/pages/episode_panel | 🟡 | VideoIntroSection 内联 pages/seasonEpisodes | ❌无独立选集底部面板（全屏时可选集）、❌无倒序播放、❌无分 section 合集切换 UI（当前是扁平列表）、全屏页无选集入口 | M |
| 播放列表 medialist | video/medialist | ❌ | 无 | Flutter「播放全部」进入的队列面板（稍后再看/合集连播队列、当前播放高亮、上下集切换）完全缺失 | M |
| 缓存面板 download_panel | video/download_panel | 🟡 | more 菜单「离线缓存」 | ❌无清晰度选择、无分 P 多选、无仅音频、无下载任务面板；只缓存当前流 URL | L |
| AI 总结 ai_conclusion | video/ai_conclusion | 🟡 | aiSummary 字符串展示 | ❌无 outline 章节大纲面板、无分段跳转 | S |
| 视频分段 view_point | video/view_point | ✅ | showViewPointsMenu（Alert 版） | — | — |
| 发弹幕面板 send_danmaku | video/send_danmaku | 🟡 | VideoPlayerStage 弹幕输入框 | ❌无弹幕位置（滚动/顶部/底部）、无颜色选择、无字号样式选择 | M |
| 弹幕设置面板 | lib/pages/danmaku + video/widgets/header_mixin.dart | 🟡 | PlayerSettingsSheet 弹幕区 | 已有：开关/合并/字号/速度/透明度；❌缺显示区域、行高、描边、滚动时长、静态时长、按类型屏蔽（滚动/顶部/底部/颜色）、智能云屏蔽级别 | M |
| UP 主页横屏面板 | video/member | ❌ | 直接跳 /member | Flutter HorizontalMemberPage（视频页底部弹层内浏览 UP 投稿）缺失 | M |
| UP 帖子面板 post_panel | video/post_panel | ❌ | 无 | 视频页内 UP 主帖子（图文动态）面板缺失 | S |
| 更多菜单 | video/view.dart _moreBtn | 🟡 | showMoreMenu | 已有稍后再看/笔记/复制/分享/缓存/投屏/举报；❌无"保存封面"、❌无"听音频"入口（听视频在控制栏有） | S |
| 视频笔记 note | video/note | ✅ | src/app/video/notes.tsx | — | — |
| 全屏页 | pl_player 全屏 | ✅ | src/app/video/fullscreen.tsx + hooks/use-fullscreen-player.ts | 进度/倍速/音量/弹幕/字幕桥接完整 | — |
| 截图 | 播放器截图 | ✅ | utils/screenshot.ts + 设置项 | — | — |
| 画中画 PiP | pl_player pip | 🟡 | modules/pili-player 有原生痕迹，无设置/UI | Flutter 有"后台画中画""画中画不加载弹幕"设置，RN 未暴露 | M |

### 3. 动态（Dynamics）

| 屏幕/功能 | Flutter 路径 | RN 状态 | RN 路径 | 缺失细节 | 工作量 |
|---|---|---|---|---|---|
| 动态 Tab 页 | lib/pages/dynamics | 🟡 | src/app/(tabs)/dynamics.tsx + hooks/use-dynamic-feed.ts | 已有 feed+UpPanel(直播中)+推荐话题/部落入口+长按菜单(转发/编辑/删除/置顶/取消置顶)；❌无「全部/投稿/番剧/专栏」4 个切换 Tab（只能靠设置 defaultDynamicType 固定） | S |
| 动态详情 dynamics_detail | lib/pages/dynamics_detail | 🟡 | src/app/dynamics/[id].tsx | 已有评论/转发/保存分享菜单/点赞投币；❌视频类动态无内联播放器（Flutter 详情页可播放） | L |
| 发布动态 dynamics_create | lib/pages/dynamics_create | ✅ | src/app/dynamics/create.tsx + components/dynamics/* | 文字/多图上传/话题/@提及/投票/预约/编辑已有动态均实现 | — |
| 表情 emote（发布/评论/私信用） | lib/pages/emote | ❌ | 无 | 全站表情面板缺失：发动态、发评论、私信均只能发纯文本；[doge] 等表情文本**不渲染成图片**（无 emote_span 对应）。直播间例外（有表情面板） | L |
| 投票 dynamics_create_vote | lib/pages/dynamics_create_vote | ✅ | src/app/create_vote + VoteEditor | — | — |
| 预约 dynamics_create_reserve | lib/pages/dynamics_create_reserve | ✅ | components/dynamics/ReserveEditor.tsx | — | — |
| @提及 dynamics_mention | lib/pages/dynamics_mention | ✅ | components/dynamics/MentionPicker.tsx | — | — |
| 话题选择 dynamics_select_topic | lib/pages/dynamics_select_topic | ✅ | components/dynamics/TopicPicker.tsx | — | — |
| 转发 dynamics_repost | lib/pages/dynamics_repost | ✅ | src/app/dynamics_repost/[id] | — | — |
| 话题页 dynamics_topic | lib/pages/dynamics_topic | ✅ | src/app/dynamics_topic/[id] | — | — |
| 推荐话题 dynamics_topic_rcmd | lib/pages/dynamics_topic_rcmd | ✅ | src/app/dynamics_topic_rcmd | — | — |
| 我的动态 dynamics_tab(个人) | mine→dynamics | ✅ | src/app/dynamics/mine.tsx | — | — |
| 动态关键词过滤/屏蔽带货 | setting extra | ✅ | settings/extra.tsx + use-dynamic-feed 过滤 | — | — |

### 4. 搜索

| 屏幕/功能 | Flutter 路径 | RN 状态 | RN 路径 | 缺失细节 | 工作量 |
|---|---|---|---|---|---|
| 搜索首页 search | lib/pages/search | ✅ | src/app/search/index.tsx | 联想 suggest/搜索历史/大家都在搜/搜索发现/默认词 | — |
| 搜索结果 search_result+search_panel | lib/pages/search_result, search_panel | 🟡 | src/app/search/results.tsx | 已有 视频/番剧/影视/直播间/用户/专栏 6 类 + 5 种排序；❌缺「综合/全部」混合结果 Tab | M |
| 热搜榜 search_trending | lib/pages/search_trending | ✅ | src/app/search_trending | — | — |
| 设置搜索 settings_search | lib/pages/settings_search | ✅ | settings/index.tsx 内联过滤 | — | — |

### 5. 个人空间 Member 全家桶

| 屏幕/功能 | Flutter 路径 | RN 状态 | RN 路径 | 缺失细节 | 工作量 |
|---|---|---|---|---|---|
| 空间框架+头部 | lib/pages/member | 🟡 | src/app/member/[mid].tsx + components/member/* | 已有 头像/等级/大会员/认证/签名/关注粉丝数/关注按钮/充电榜/共同关注等入口；❌头部无右上角菜单（分享UP主/拉黑/举报/私信入口） | S |
| 投稿 member_video | lib/pages/member_video | ✅ | MemberTabContainer videos tab | — | — |
| 主页 member_home | lib/pages/member_home | ✅ | member/[mid] 首页 tab | — | — |
| 动态 member_dynamics | lib/pages/member_dynamics | ✅ | MemberTabContainer dynamics tab | — | — |
| 最近投币 member_coin_arc | lib/pages/member_coin_arc | ✅ | MemberTabContainer coins tab | — | — |
| 喜欢 member_like_arc | lib/pages/member_like_arc | ❌ | 无 | 「最近喜欢/点赞的视频」Tab 未移植 | S |
| 合集/列表 member_season_series | lib/pages/member_season_series | ✅ | member_ss_web + collection tab | — | — |
| 专栏 member_article | lib/pages/member_article | ✅ | member/article-tab | — | — |
| 音频 member_audio | lib/pages/member_audio | ✅ | member/audio-tab | — | — |
| 课程 member_cheese | lib/pages/member_cheese | ✅ | member/cheese-tab | — | — |
| 作品 opus member_opus | lib/pages/member_opus | ✅ | member/opus-tab | — | — |
| 小店 member_shop | lib/pages/member_shop | ✅ | member/shop-tab（受设置控制） | — | — |
| 漫画 member_comic | lib/pages/member_comic | ✅ | src/app/member_comic/[mid] | — | — |
| 收藏 member_favorite | lib/pages/member_favorite | ✅ | src/app/member_favorite/[mid] | — | — |
| 舰队 member_guard | lib/pages/member_guard | ✅ | member_guard + guard-tab | — | — |
| 追番 member_pgc | lib/pages/member_pgc | ✅ | src/app/member_pgc/[mid] | — | — |
| 空间搜索 member_search | lib/pages/member_search | ✅ | src/app/member_search/[mid] | — | — |
| 网页投稿 member_video_web | lib/pages/member_video_web | ✅ | src/app/member_video_web/[mid] | — | — |
| 充电榜 member_upower_rank | lib/pages/member_upower_rank | ✅ | src/app/upower_rank/[mid] | — | — |
| 投稿(网页版) member_contribute | lib/pages/member_contribute | ❌ | 无 | 少见 Tab，缺失 | S |
| 资料编辑 member_profile | lib/pages/member_profile | ✅ | src/app/edit_profile | 昵称/签名/性别/生日/头像上传 | — |
| 共同关注 | member 内入口 | ✅ | src/app/same_following/[mid] | — | — |
| 关注我的 | member 内入口 | ✅ | src/app/followed | — | — |

### 6. 收藏 / 稍后再看 / 历史

| 屏幕/功能 | Flutter 路径 | RN 状态 | RN 路径 | 缺失细节 | 工作量 |
|---|---|---|---|---|---|
| 我的收藏 fav | lib/pages/fav | ✅ | src/app/fav/index.tsx + components/fav/* | 视频/追番/追剧/专栏/笔记/话题/课堂/订阅 8 Tab 齐全，创建/排序/长按管理 | — |
| 收藏夹详情 fav_detail | lib/pages/fav_detail | ✅ | src/app/fav/[fid].tsx | 搜索/排序/批量选择/移出/复制移动/清理失效/编辑/播放全部 | — |
| 收藏夹内排序 fav_sort | lib/pages/fav_sort | ✅ | 集成于 fav/[fid] 管理流程 | — | — |
| 创建收藏夹 fav_create | lib/pages/fav_create | ✅ | src/app/fav_create | — | — |
| 收藏夹排序 fav_folder_sort | lib/pages/fav_folder_sort | ✅ | src/app/fav_folder_sort | — | — |
| 收藏搜索 fav_search | lib/pages/fav_search | ✅ | src/app/fav_search | — | — |
| 稍后再看 later | lib/pages/later | 🟡 | src/app/later/index.tsx | 已有 播放全部/清空/看完状态过滤/搜索；❌无"清空失效""清空看完"分开操作 | S |
| 稍后再看搜索 later_search | lib/pages/later_search | ✅ | src/app/later_search | — | — |
| 观看历史 history | lib/pages/history | ✅ | src/app/history/index.tsx | 视频/直播/文章 Tab、暂停记录、删除、搜索 | — |
| 历史搜索 history_search | lib/pages/history_search | ✅ | src/app/history_search | — | — |

### 7. 下载 / 离线

| 屏幕/功能 | Flutter 路径 | RN 状态 | RN 路径 | 缺失细节 | 工作量 |
|---|---|---|---|---|---|
| 下载管理 download | lib/pages/download | 🟡 | src/app/download/index.tsx + utils/download.ts | 已有 列表/暂停状态/删除/多选删除/播放全部/本地播放；❌无下载内搜索、无单任务分P详情(detail)、无音视频合并为完整离线视频（仅单流 URL 缓存）、无后台下载任务队列 | L |
| 下载搜索 download/search | download/search | ❌ | 无 | 见上 | M |
| 下载详情(分P) download/detail | download/detail | ❌ | 无 | 见上 | M |

### 8. 直播

| 屏幕/功能 | Flutter 路径 | RN 状态 | RN 路径 | 缺失细节 | 工作量 |
|---|---|---|---|---|---|
| 直播列表 live | lib/pages/live | ✅ | src/app/live（并入首页直播分类+live 路由） | — | — |
| 直播间 live_room | lib/pages/live_room | ✅ | src/app/live/[roomId].tsx + components/live/* | WebSocket弹幕/SuperChat/贡献榜/礼物&上舰&进场事件/关注/分享/举报/画质切换/弹幕发送/表情面板/全屏/分区切换/弹幕屏蔽管理均已实现 | — |
| 直播表情 live_emote | lib/pages/live_emote | ✅ | LiveChatInput 表情面板 | — | — |
| 直播弹幕屏蔽 live_dm_block | lib/pages/live_dm_block | ✅ | src/app/live_dm_block | — | — |
| 直播搜索 live_search | lib/pages/live_search | ✅ | src/app/live_search | — | — |
| 直播关注 live_follow | lib/pages/live_follow | ✅ | src/app/live_follow | — | — |
| 分区 live_area / detail | lib/pages/live_area* | ✅ | src/app/live_area, live_area_detail | — | — |
| 赛事 match_info | lib/pages/match_info | 🟡 | src/app/match/[cid] | 仅比分/队徽/时间/进直播间；❌无事件时间线、阵容、统计等详情 | M |

### 9. 私信 / 消息

| 屏幕/功能 | Flutter 路径 | RN 状态 | RN 路径 | 缺失细节 | 工作量 |
|---|---|---|---|---|---|
| 会话列表 whisper | lib/pages/whisper | ✅ | src/app/whisper/index.tsx | 未读/置顶/删除(带撤销)/时间分组 | — |
| 会话详情 whisper_detail | lib/pages/whisper_detail | 🟡 | src/app/whisper/[uid].tsx | 已有 文字/图片消息/BFS上传/撤回消息展示；❌无表情面板、❌无长按消息菜单（撤回自己的消息/复制/举报） | M |
| 会话设置 whisper_settings | lib/pages/whisper_settings | ✅ | src/app/whisper_settings/[uid] | 置顶/免打扰/删除会话 | — |
| 链接设置 whisper_link_setting | lib/pages/whisper_link_setting | ✅ | src/app/whisper_link_setting | — | — |
| 屏蔽词 whisper_block | lib/pages/whisper_block | ✅ | src/app/whisper_block | — | — |
| 二级消息 whisper_secondary | lib/pages/whisper_secondary | ✅ | src/app/notifications | 回复/@我/赞/系统 4 Tab | — |
| 消息中心 msg_feed_top | lib/pages/msg_feed_top | ✅ | notifications + msg_like_detail | at_me/reply_me/like_me/sys_msg/like_detail 全覆盖 | — |
| 联系人选择 contact | lib/pages/contact | ❌ | 无 | 转发/分享时选择联系人（粉丝+互关）页面缺失 | M |
| 分享对象选择 share | lib/pages/share | ❌ | 系统 Share | Flutter 站内分享给指定用户的选人面板缺失（RN 走系统分享，站外分享已覆盖） | S |

### 10. 番剧 / 影视 / 订阅 / 专栏 / 音频

| 屏幕/功能 | Flutter 路径 | RN 状态 | RN 路径 | 缺失细节 | 工作量 |
|---|---|---|---|---|---|
| PGC 详情页 pgc | lib/pages/pgc(详情经 video/introduction/pgc) | ✅ | src/app/pgc/[id].tsx | 选集网格/简介/评论(番剧评论)/播放器/更多菜单 | — |
| 番剧索引 pgc_index | lib/pages/pgc_index | ❌ | API 已有无页面 | 按题材/年份/地区/排序的索引筛选页缺失（pgcIndexCondition/Result 接口已写） | M |
| 番剧主页/时间表 pgc(view) | lib/pages/pgc/view.dart | ❌ | 无 | 番剧/影视 Tab 主页：追番时间表(周更)、索引入口缺失；PgcTimelineStrip 组件已存在但未接入首页 | M |
| 番剧评论 pgc_review | lib/pages/pgc_review | ✅ | components/pgc/PgcReviewSection.tsx | — | — |
| 我的追番 | fav pgc tab | ✅ | src/app/pgc_follow | — | — |
| 订阅 subscription | lib/pages/subscription | ✅ | src/app/subscription | — | — |
| 订阅详情 subscription_detail | lib/pages/subscription_detail | ✅ | src/app/subscription_detail/[mid] | — | — |
| 专栏阅读 article | lib/pages/article | 🟡 | src/app/article/[id] | 仅跳转 WebView 阅读+保存分享；❌无原生阅读器、无点赞/收藏/评论条 | L |
| 专栏列表 article_list | lib/pages/article_list | ✅ | src/app/article_list/[mid] | — | — |
| 音频 audio | lib/pages/audio | 🟡 | src/app/audio/[id] | 仅取流播放/暂停；❌无歌单列表、定时关闭、音量控制 UI（后台播放由原生统一处理） | M |
| 音乐 MV music | lib/pages/music | 🟡 | src/app/music/[id] | 详情+播放+评论入口；❌无播放器完整控制（进度/歌单切换） | M |

### 11. 关注 / 粉丝 / 登录 / 日志 / 杂项

| 屏幕/功能 | Flutter 路径 | RN 状态 | RN 路径 | 缺失细节 | 工作量 |
|---|---|---|---|---|---|
| 关注/粉丝 follow | lib/pages/follow | ✅ | src/app/follow/index.tsx | 特别关注/移入分组/长按操作/搜索 | — |
| 关注搜索 follow_search | lib/pages/follow_search | ✅ | src/app/follow_search | — | — |
| 分组管理 follow_tag_sort/group_panel | follow_tag_sort, group_panel | ✅ | src/app/follow/tags | 分组排序/重命名/删除 | — |
| 关注类型 follow_type | lib/pages/follow_type | ✅ | followed/same_following/follow?type | — | — |
| 粉丝页 fan | lib/pages/fan | ✅ | follow?type=fans | — | — |
| 登录 login | lib/pages/login | ✅ | src/app/login | 扫码/密码/短信/Cookie 四方式；geetest 风控由原生处理 | — |
| 登录设备 login_devices | lib/pages/login_devices | ✅ | src/app/login_devices | — | — |
| 登录日志 login_log | lib/pages/login_log | ✅ | src/app/login_log | — | — |
| 硬币日志 coin_log | lib/pages/coin_log | ✅ | src/app/coin_log | — | — |
| 经验日志 exp_log | lib/pages/exp_log | ✅ | src/app/exp_log | — | — |
| 日志表 log_table | lib/pages/log_table | ✅ | coin_log+exp_log 分页呈现 | — | — |
| 黑名单 blacklist | lib/pages/blacklist | ✅ | src/app/blacklist | — | — |
| 气泡消息 bubble | lib/pages/bubble | ✅ | src/app/bubble | — | — |
| 我的评论 my_reply | lib/pages/my_reply | ✅ | src/app/my_reply | — | — |
| 评论详情 main_reply | lib/pages/main_reply | ✅ | src/app/main_reply/[oid] | — | — |
| 弹幕屏蔽 danmaku_block | lib/pages/danmaku_block | ✅ | src/app/danmaku_block | — | — |
| 空降助手 sponsor_block | lib/pages/sponsor_block | ✅ | src/app/settings/sponsor_block | — | — |
| 投屏 dlna | lib/pages/dlna | ✅ | src/app/dlna + modules/pili-dlna | — | — |
| Webview | lib/pages/webview | ✅ | src/app/webview + modules/pili-webview | — | — |
| 保存/分享面板 save_panel | lib/pages/save_panel | ✅ | src/app/save_panel | — | — |
| 空间设置 space_setting | lib/pages/space_setting | ✅ | src/app/space_setting | — | — |
| 关于 about | lib/pages/about | ✅ | src/app/about | — | — |

### 12. 设置（逐项对照 lib/pages/setting ↔ src/app/settings）

| 设置分组 | Flutter | RN 状态 | 缺失细节 | 工作量 |
|---|---|---|---|---|
| 隐私设置 privacy | privacy_settings.dart | ✅ | 黑名单/匿名模式/青少年说明等 | — |
| 推荐设置 recommend | recommend_settings.dart | ✅ | web/app 源、保留刷新、过滤器(播放量/点赞率/时长/关键词)、已关注豁免 | — |
| 视频/画质 video | video_settings.dart | 🟡 | 画质/音质/解码/缓冲/CDN 服务/免登 1080P 已有；❌「CDN 测速」「开启硬解」「蜂窝网络音质」「B站定向流量」标记暂不支持（iOS 特性限制居多） | M |
| 播放设置 play | play_settings.dart | 🟡 | 自动播放/全屏/手势/倍速/后台播放/字幕偏好/SC 大小/播放顺序已有；❌「后台画中画」「提前初始化播放器」「快速收藏」「键盘控制」无 | M |
| 外观设置 style | style_settings.dart | ✅ | 主题模式/纯黑/主题色/字号/视频页深色/底栏收起/瀑布流/直播列表展开等 | — |
| 其他设置 extra | extra_settings.dart | 🟡 | 搜索/AI/评论折叠/震动/代理/弹幕合并/带货屏蔽等已有；❌「发评反诈」「发布动态反诈」「检查更新」「显示热门推荐」「快速收藏」RN 明确标注暂不支持 | M |
| WebDAV 备份 | webdav | ✅ | 备份/恢复设置 | — |
| 倍速/全屏SC/主题色/字号/Navbar/弹幕色/日志 | setting/pages/* | ✅ | play_speed/fullscreen_sc/color_select/font_size/bar_set/slide_color_picker/logs 全有 | — |
| 设置搜索 | settings_search | ✅ | settings 首页内联搜索过滤 | — | — |

### 13. 通用组件（lib/common/widgets ↔ src/components）

| Flutter 组件 | RN 状态 | 说明 | 工作量 |
|---|---|---|---|
| video_card | ✅ | components/video/VideoCard（含长按不感兴趣） | — |
| 骨架屏 loading_widget | ✅ | Skeleton/DynamicSkeleton/FavDetailSkeleton | — |
| image_viewer | ✅ | ImageViewer | — |
| context_menu | ✅ | SwiftUI ContextMenu（动态长按等） | — |
| dialog | ✅ | Alert/ActionSheet/SwiftUI BottomSheet | — |
| text_more（展开收起） | ✅ | VideoIntroSection expanded | — |
| refresh_layout | ✅ | RefreshControl + 原生刷新 | — |
| player_bar（小窗播放条） | ✅ | CollapsedPlayerBar + 后台音频会话 | — |
| emote_span（文本内表情渲染） | ❌ | 评论/动态文本中的 [表情] 不渲染为图片 | M |
| 徽章/头像挂件 pendant_avatar | 🟡 | 头像基础展示有，挂件装饰未移植 | S |

### 14. 全局能力

| 能力 | Flutter | RN 状态 | 说明 | 工作量 |
|---|---|---|---|---|
| 多账号切换 | utils/accounts | ✅ | stores/auth 多账号 + AccountSwitchSheet | — |
| 匿名模式 | Accounts.anonymity | ✅ | auth store anonymousMode | — |
| 定时关闭 | shutdown_timer_service | ✅ | PlayerSettingsSheet + pili-native-core/pili-audio 原生定时器 | — |
| 投屏 DLNA | dlna | ✅ | modules/pili-dlna + /dlna | — |
| 后台播放 | play_settings | ✅ | 设置+AppState 自动转音频+pili-audio 会话 | — |
| 后台音频服务 | audio service | ✅ | pili-audio 锁屏/远程命令 | — |
| 离线下载 | download 体系 | 🟡 | 仅单流 URL 缓存（见下载章节） | L |
| 代理设置 | extra 代理 | ✅ | settings/network host:port | — |
| 主题/深色/纯黑 | theme_utils | ✅ | 跟随系统/深色/纯黑/主题色选择 | — |
| 界面缩放 uiScale | style_settings | 🟡 | 未见 RN 对应项 | S |
| 画中画 PiP | pip 设置 | 🟡 | 原生模块有基础，无 UI/设置暴露 | M |
| 检查更新 | extra | 🟡 | RN 标注暂不支持 | S |
| 青少年模式 | 无 | N/A | Flutter 原版亦无此功能 | — |

---

## 三、缺失最多的模块 TOP 10（按影响面排序）

1. **视频页深度交互**：投币面板(1/2 币+三连)、收藏夹选择面板接入、选集面板(全屏选集/倒序/section)、播放列表 medialist、AI 总结大纲 —— 用户每天高频触达。
2. **表情 emote 体系**：评论/动态/私信的表情面板 + 文本表情图片渲染，全站性缺口。
3. **下载管理深度**：清晰度/分P选择、音视频合并、任务队列、下载内搜索 —— Flutter 是完整离线体系，RN 仅 URL 缓存。
4. **弹幕设置面板**：显示区域/行高/类型屏蔽/云屏蔽等 8 项缺失。
5. **专栏原生阅读器**：RN 仅 WebView 跳转。
6. **番剧索引页 + 追番时间表主页**（API 已备、组件 PgcTimelineStrip 已备，缺组装）。
7. **动态 Tab 类型筛选（全部/投稿/番剧/专栏）+ 动态详情视频内联播放**。
8. **音频/音乐播放页深度**：歌单列表、定时关闭、进度控制 UI。
9. **私信会话详情**：表情 + 长按撤回/复制/举报菜单。
10. **搜索综合 Tab + member 喜欢 Tab + 视频页更多菜单(保存封面/听音频)** 等零散缺口。

## 四、推荐移植优先级（按使用频率/影响面）

| 优先级 | 任务 | 工作量 |
|---|---|---|
| P0 | 视频页投币面板(1/2币+长按三连)、收藏文件夹选择面板接入 | S×2 |
| P0 | 选集面板完善（全屏选集入口、section 切换、倒序播放） | M |
| P0 | 表情 emote：先做文本表情渲染，再做评论/动态/私信表情面板 | L |
| P1 | 弹幕设置面板补齐（显示区域/行高/类型屏蔽/云屏蔽） | M |
| P1 | 动态 Tab 4 类型筛选 UI + 动态详情视频内联播放 | S+L |
| P1 | 下载体系：清晰度/分P选择 + 音视频合并 + 任务管理 | L |
| P2 | 播放列表 medialist（稍后再看连播队列） | M |
| P2 | 番剧索引页 + 时间表主页（组件已备） | M×2 |
| P2 | 私信长按菜单 + 表情；AI 总结大纲面板；更多菜单补全 | S/M |
| P3 | 专栏原生阅读器、音频歌单页、音乐播放页 | L/M/M |
| P3 | member_like_arc、contact 选人、搜索综合 Tab、match 详情、UP 帖子面板、PiP、界面缩放 | S~M |

## 五、备注

- RN 版为 iOS 优先实现（SwiftUI Host + 8 个 Swift 原生模块），Flutter 版中 Android/桌面端专属能力（键盘控制、托盘、窗口标题栏、屏幕帧率、SDI 等）不在移植范围内，未计入缺失。
- RN settings 中标注「暂不支持」的项（CDN 测速、硬解、发评反诈、快速收藏、提前初始化播放器、检查更新、显示热门推荐、蜂窝音质）共 8 项，多为平台限制或低优先级。
- Flutter 的 `common`、`main` 目录为脚手架/控制器，不构成独立屏幕。
