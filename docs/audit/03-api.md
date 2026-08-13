# 03 · 网络层审计：Flutter 原版 vs RN 移植版（接口 / 签名 / gRPC / 登录 / 根因）

> 审计日期：2026-08-13（只读审计）
> Flutter 原版：`C:/Users/xingtongofficial/Desktop/piliplus/PiliPlus`
> RN 移植版：`C:/Users/xingtongofficial/Desktop/piliplus/piliplus-RN`
> 结论先行：**路径级接口覆盖率 ≈ 97%（活跃 HTTP 路径 260+ 个，RN 缺 8 个），但"签名应用方式、请求头风控指纹、gRPC 层、响应字段解析"存在 20+ 处实质差异，这些才是"很多地方无法加载"的根因。**

---

## 0. 架构对照总览

| 维度 | Flutter 原版 | RN 移植版 |
|---|---|---|
| HTTP 引擎 | Dio + CookieJar 拦截器（`lib/http/init.dart`、`lib/utils/accounts/account_manager/account_mgr.dart`） | 原生 URLSession（`modules/pili-native-core/ios/PiliNetwork.swift`），JS 侧 `src/api/client.ts` 包装 |
| Cookie | 每账号独立 CookieJar（Hive 持久化），拦截器按 URL 注入 | iOS 全局 `HTTPCookieStorage.shared`，按账号快照切换（`src/utils/cookie.ts`） |
| WBI 签名 | `lib/utils/wbi_sign.dart`（Dart） | 原生 `PiliSigner.swift`（算法一致），key 由 `PiliBackgroundTask.fetchMixinKey()` 拉取 |
| App 签名 | `lib/utils/app_sign.dart`（appkey `dfca71928277209b` / appsec `b5475a8825547a4fc26c7d518eaaa02e`） | 原生 `PiliSigner.appSign`（APP_KEY/APP_SEC 完全一致，`PiliSigner.swift:25-26`） |
| gRPC | 完整 protobuf 生成代码 + gRPC-over-HTTP（`lib/grpc/`，8 组 service） | **仅 3 个方法**（`src/api/msg.ts` 的 KeywordBlocking*），且**缺全部 bilibili gRPC 元数据头** |
| 直播弹幕长连 | WebSocket（含 TCP 回退）`lib/tcp/live.dart` | 仅 WSS `modules/pili-live/ios/PiliLiveSocket.swift` |
| 多账号路由 | `ApiType` 按接口把请求路由到 main/history/recommend/video/heartbeat 不同 access_key（`lib/utils/accounts/api_type.dart`） | 单一 access_key |

---

## 1. 签名与风控对比

### 1.1 WBI 签名算法 —— ✅ 一致

| 步骤 | Flutter `wbi_sign.dart` | RN `PiliSigner.swift` | 一致性 |
|---|---|---|---|
| mixin key 重排表 | `_mixinKeyEncTab`（32 项，`wbi_sign.dart:19-52`） | `mixinKeyEncTab`（`PiliSigner.swift:28-31`） | ✅ 逐项相同 |
| key 来源 | nav → `wbi_img.img_url/sub_url` 文件名拼接（`wbi_sign.dart:78-94`），按天缓存 | 同源（`PiliBackgroundTask.swift:337-380`），24h 缓存 | ✅ |
| 参数排序 + 过滤 `!'()*` + encodeURIComponent + `md5(query+mixinKey)` | `encWbi`（`wbi_sign.dart:63-76`） | `wbiSign/wbiQuery`（`PiliSigner.swift:89-106`） | ✅ |

### 1.2 App 签名算法 —— ✅ 一致

- `AppSign.appSign`（`lib/utils/app_sign.dart:7-24`）：注入 `appkey`+`ts` → 按 key 排序 → encode → `md5(query+appsec)`。
- `PiliSigner.appSign`（`PiliSigner.swift:55-85`）：逻辑等价（空值也拼 `key=`，与 Flutter `_makeQueryFromParametersDefault` 行为一致）。
- appkey/appsec 两端完全一致（Flutter `lib/common/constants.dart:7-9` vs `PiliSigner.swift:25-26`）。

### 1.3 请求头 —— ❌ 存在关键差异（"无法加载"的头号嫌疑）

Flutter 侧 **所有 web API 请求**（api.bilibili.com / api.vc / message / passport 等）由拦截器统一注入：

```dart
// lib/common/constants.dart:29-34
static const baseHeaders = {
  'env': 'prod',
  'app-key': 'android64',
  'x-bili-aurora-zone': 'sh001',
};
// lib/utils/accounts/account.dart:65-69（登录账号额外附加）
headers = { ...baseHeaders, 'x-bili-mid': <真实mid>, 'x-bili-aurora-eid': genAuroraEid(mid) };
// account_mgr.dart:66-68 还会补 referer ??= https://www.bilibili.com
// UA 固定为 'Dart/3.6 (dart:io)'（init.dart:212）
```

RN 侧 `client.ts:57-85`：

- 仅当 `baseURL.includes('app.bilibili.com')` 才注入 `app-key: android64`、`x-bili-aurora-zone: sh001`、`x-bili-trace-id`、`x-bili-mid: '1'/'0'`（注意是布尔字符串，不是真实 mid）；
- **api.bilibili.com / api.vc / message.bilibili.com 的 web 请求不带 `env`、`app-key`、`x-bili-aurora-zone`、`x-bili-aurora-eid`、`x-bili-mid:<mid>`**；
- UA 是 `BiliDroid/8.43.0`（安卓客户端 UA，`src/utils/app-sign.ts:5`），Flutter 是 `Dart/3.6`。

影响：B 站 web 接口风控（-352 风控校验 / -403 / 412）会核对 UA×头×cookie 的一致性。RN 用"安卓 App UA + 无 aurora 指纹 + 浏览器 cookie"的混搭指纹访问 web 接口，是会员空间、搜索、动态等页面**间歇性空数据/-352**的高概率根因。

### 1.4 dm_img_* 风控参数 —— ✅ 大体对齐

- Flutter `videoUrl`（`lib/http/video.dart:215-239`）：`dm_img_str/dm_cover_img_str/dm_img_list/dm_img_inter + web_location=1315873 + gaia_source=pre-load`。
- RN `buildDmRiskParams`（`src/utils/player-utils.ts:105-112`）+ `videoApi.playUrl`（`src/api/video.ts:47-57`）：字段一致。
- `memberInfo` / `searchArchive` / `memberDynamic` 也已补 dm_img（`src/api/user.ts:56-105`）。✅

### 1.5 buvid 激活 —— ⚠️ 报文格式不一致

- Flutter（`lib/http/init.dart:62-101`）：`POST /x/internal/gaia-gateway/ExClimbWuzhi`，body 为 `{"payload": "<json字符串>"}`（外层包一层 payload）。
- RN（`src/api/validate.ts:11-41`）：直接把 payload JSON 作为 body 发出，**没有外层 `payload` 包裹**，字段集也不同（Flutter 只发 3064/39c8/3c43{adca,bfe9}）。激活大概率无效 → 后续接口风控概率上升（隐性根因）。

---

## 2. 接口清单对账（按功能域）

图例：✅=存在且一致；⚠️=存在但参数/签名/头有差异；❌=缺失。

### 2.1 首页/推荐/热门/排行

| 功能 | Flutter（方法 + path + 签名） | RN | 状态 |
|---|---|---|---|
| web 推荐 | GET `/x/web-interface/wbi/index/top/feed/rcmd` WBI（`video.dart:53-68`） | `videoApi.recommendWeb` `video.ts:207-220` getWbi | ✅ |
| app 推荐 | GET `app.bilibili.com/x/v2/feed/index` appSign + **buvid/fp_local/fp_remote/session_id/env/app-key=android_hd 头 + 完整设备参数(build/mobi_app=android_hd/statistics…)**（`video.dart:89-141`） | `videoApi.recommendApp` `video.ts:193-204`：仅 idx/pull/flush/column/style；头为 app-key=android64，无 buvid/fp 头 | ⚠️ 参数集与头均不齐（默认首页走此接口，`settings.ts:231 appRcmd:true`） |
| 不感兴趣 | GET `app.bilibili.com/x/feed/dislike`(+) `/cancel` appSign（`video.dart:477-531`） | `video.ts:263-272` signed query | ✅ |
| 热门 | GET `/x/web-interface/popular`（`video.dart:170-177`） | `video.ts:223-225` | ✅ |
| 排行榜 | GET `/x/web-interface/ranking/v2` WBI（`video.dart:875-881`） | `video.ts:228-230` | ✅ |
| pgc 榜 | `/pgc/web/rank/list`、`/pgc/season/rank/web/list` WBI（`video.dart:904-947`） | `video.ts:233-240` | ✅ |
| 每周必看/入站必刷 | `/x/web-interface/popular/series/list|one|precious` WBI（`video.dart:972-1024`） | `video.ts:243-260` | ✅ |

### 2.2 视频详情/播放流/进度

| 功能 | Flutter | RN | 状态 |
|---|---|---|---|
| 视频详情 | GET `/x/web-interface/view`（`video.dart:290-303`） | `videoApi.view` `video.ts:30-32` | ✅ |
| UGC 流 | GET `/x/player/wbi/playurl` WBI + dm_img（`video.dart:203-279`，fnval=4048） | `video.ts:38-73`：fnval=0(durl) + WBI + 回退 `/x/player/playurl` | ⚠️ 策略不同（RN 因 AVPlayer 只取 durl，清晰度上限 480P/720P 合流；属有意为之） |
| PGC 流 | GET `/pgc/player/web/v2/playurl`，解析 **`result.video_info`**（`video.dart:250-255`） | `pgcPlayUrl` `video.ts:76-82`；**调用方 `app/pgc/[id].tsx:69-72` 读 `res?.data` → 恒为 undefined** | ❌ **响应字段解析错误，番剧播放必挂**（见 §6.1） |
| PUGV 流 | GET `/pugv/player/web/playurl`（`api.dart:26`） | 无 | ❌ 缺失（课堂视频播放） |
| TV 流 | GET `/x/tv/playurl` appSign（`video.dart:1026-1054`） | 无 | ❌ 缺失（高画质/充电专属兜底） |
| 播放信息(字幕) | GET `/x/player/wbi/v2` WBI（`video.dart:814-837`） | `video.ts:85-87` | ✅ |
| 相关视频 | `/x/web-interface/archive/related`（`video.dart:320-338`） | `video.ts:138-140` | ✅ |
| 在线人数 | `/x/player/online/total`（`video.dart:773-788`） | `video.ts:148-150` | ✅ |
| AI 总结 | `/x/web-interface/view/conclusion/get` WBI（`video.dart:790-812`） | `video.ts:177-179` | ✅ |
| 雪碧图 | `/x/player/videoshot`（`video.dart:1056-1084`） | `video.ts:182-184` | ✅ |
| 心跳 | POST `/x/click-interface/web/heartbeat`（`video.dart:680-705`） | `video.ts:153-159`（JSON） | ⚠️ Flutter form 上报；RN JSON（一般可接受） |
| 历史上报 | POST `/x/v2/history/report`（`video.dart:668-677`） | `video.ts:162-164` | ✅ |
| medialist 历史上报 | POST `/x/v1/medialist/history`（`video.dart:707-722`） | 无 | ❌ 缺失 |
| 互动视频 | （`/x/stein/edgeinfo_v2` 在 Flutter controller 内联） | `video.ts:285-287` | ✅ |

### 2.3 点赞/投币/收藏/关注（动作类 POST）

| 功能 | Flutter | RN | 状态 |
|---|---|---|---|
| 点赞 | POST `app.bilibili.com/x/v2/view/like` form（appSign，`video.dart:437-451`） | `video.ts:90-93` signed query | ⚠️ query vs body，通常可通 |
| 点踩 | POST `app.bilibili.com/x/v2/view/dislike`（`video.dart:454-474`） | `video.ts:96-99` | ✅ |
| 投币 | POST `app.bilibili.com/x/v2/view/coin/add`（`video.dart:356-377`） | `video.ts:102-105` | ✅ |
| 三连 | POST `/x/web-interface/archive/like/triple` form + csrf + PC UA/referer（`video.dart:405-434`） | `video.ts:108-110`：无 form/PC UA/referer/eab_x 等参数 | ⚠️ |
| pgc 三连 | POST `/pgc/season/episode/like/triple` + origin/referer/PC UA（`video.dart:380-402`） | `video.ts:118-120` | ⚠️ 缺 referer/origin |
| 关注操作 | POST `/x/relation/modify` form + extend_content + space referer + PC UA（`video.dart:612-658`） | `user.ts:124-126`：仅 fid/act/re_src/csrf，JSON | ⚠️ 关注/取关在部分风控账号上会失败 |
| 收藏 batch-deal | POST `/x/v3/fav/resource/batch-deal` form（`fav.dart:633-654`） | `fav.ts:27-29`、`video.ts:128-130` JSON | ⚠️ |
| 追番 add/del/update | `/pgc/web/follow/*` form（`video.dart:725-770`） | `fav.ts:114-121`、`pgc.ts:23-35` | ✅（JSON，通常可通） |

### 2.4 收藏夹/稍后再看/历史

收藏夹 CRUD（`fav.dart` ↔ `src/api/fav.ts`）路径全部齐全：`resource/list|batch-deal|unfav-all|copy|move|clean|sort`、`folder/*`、`collected/list`、`season/fav|unfav`、`space/fav/season/list`。
差异点：
- ⚠️ `copyToview/moveToview`（`/x/v2/history/toview/copy|move`，`api.dart:151-153`）❌ 缺失（稍后再看内容的复制/移动）。
- ⚠️ Flutter 稍后再看列表 `/x/v2/history/toview/web` WBI（`user.dart:59-82`）→ RN `fav.ts:62-66` getWbi ✅。
- 历史 `/x/web-interface/history/cursor`（`user.dart:85-106`，走 history 账号）→ RN `fav.ts:84-86` ✅（单账号）。

### 2.5 评论

| 功能 | Flutter | RN | 状态 |
|---|---|---|---|
| 主列表 | 登录 `/x/v2/reply`(pn/ps/sort)；游客 `/x/v2/reply/main` + pagination_str + **NoAccount 空 cookie + baseHeaders(app-key android64)**（`reply.dart:16-57`） | `reply.ts:10-42`：相同分支 + 游客加 WBI | ⚠️ 头策略不同（RN 游客仍带 buvid3 cookie、无 app-key 头） |
| 楼中楼 | `/x/v2/reply/reply`（`reply.dart:59-89`） | `reply.ts:47-58` | ✅ |
| 赞/踩/发/删/置顶/举报 | `/x/v2/reply/action|hate|add|del|top|report`（`reply.dart`、`video.dart:541-609`） | `reply.ts:66-107` | ✅（JSON vs form 差异） |
| 表情 | `/x/emote/user/panel/web`（`reply.dart:140-155`） | `reply.ts:116-118` | ✅ |
| **gRPC 评论** | `ReplyGrpc.mainList/detailList/dialogList/searchItem/translateReply`（`lib/grpc/reply.dart`，含 trackInfo 广告过滤） | ❌ 无 | 见 §4 |

### 2.6 动态

| 功能 | Flutter | RN | 状态 |
|---|---|---|---|
| 关注动态流 | GET `/x/polymer/web-dynamic/v1/feed/all` **无 WBI**（`dynamics.dart:36-71`，features=itemOpusStyle,listOnlyfans,onlyfansQaCard） | `dynamics.ts:25-29` getWbi（多签名，无害） | ✅ |
| UP 面板/直播中 | `/x/polymer/web-dynamic/v1/portal`（`dynamics.dart:73-86`） | `dynamics.ts:64-66` | ✅ |
| UP 列表 | `/x/polymer/web-dynamic/v1/uplist`（`dynamics.dart:88-102`） | `dynamics.ts:59-61` | ✅ |
| 动态点赞 | POST `/x/dynamic/feed/dyn/thumb` + t.bilibili.com referer（`dynamics.dart:151-176`） | `dynamics.ts:39-41`（无 referer） | ⚠️ |
| 动态详情 | `/x/polymer/web-dynamic/v1/detail`（`dynamics.dart:266-297`） | `dynamics.ts:32-36` | ✅ |
| 用户动态 | `/x/polymer/web-dynamic/v1/feed/space` WBI+dm_img（`member.dart:439-483`） | `user.ts:90-106` getWbi+dm_img | ✅ |
| 用户动态搜索 | `/x/polymer/web-dynamic/v1/feed/space/search`（`member.dart:485-508`） | `user.ts:299-301` | ✅ |
| 创建/编辑/删除/置顶/转发/预约/投票/话题 | `/x/dynamic/feed/create/dyn`（JSON，`dynamics.dart:178-262`）等全套 | `dynamics.ts:69-268` + `useCreateDynamic.ts` | ✅（含 upload_bfs 原生上传） |
| opus 详情 | HTTP `/x/polymer/web-dynamic/v1/opus/detail`（`dynamics.dart:374-390`）+ gRPC `OpusDetail` | `dynamics.ts:136-138` HTTP | ✅ |
| 文章详情 | `/x/article/viewinfo` WBI + `/x/article/view` WBI（`dynamics.dart:337-372`） | ❌ article 页是 WebView 跳转壳（`app/article/[id]/index.tsx`） | ⚠️ 降级实现 |
| 未读动态角标 | HTTP `/x/web-interface/dynamic/entrance` + **gRPC `DynGrpc.dynRed`**（`lib/pages/main/controller.dart`） | `dynamics.ts:54-56` 仅 HTTP + 轮询 | ⚠️ |

### 2.7 消息中心 / 私信

HTTP 部分（`msg.dart` ↔ `src/api/msg.ts`）基本齐全：`msgfeed/unread|reply|at|like|like_detail|del|notice`、`sys-msg/query_notify_list|update_cursor|del_notify_list`、`session_svr/get_sessions|update_ack|remove_session|set_top|single_unread`、`svr_sync/fetch_session_msgs`、`web_im/send_msg`、`link_setting/*`、`x/im/user_infos`。
差异：
- ⚠️ Flutter 对 `remove_session / set_top / update_ack / createTextDynamic` 都做了 WBI 签名 + form（`msg.dart:246-370`）；RN 未签名、JSON body（`msg.ts:277-302`）。这些接口 web 端通常可不签名，但 body 类型差异存在失败风险。
- ❌ Flutter 私信核心能力（会话列表/二级会话/发图/已读/置顶/免打扰设置等）主要走 **ImGrpc**（见 §4）；RN 全部用 api.vc HTTP 替代，功能可用但：
  - `clearUnread`（gRPC）无 HTTP 等价 → RN 用"本地游标"模拟已读（`msg.ts:12-13,188-202`），服务端未读不会真清零；
  - 会话消息 `sendMsg` 的 JSON content 与 msg_type 映射一致 ✅。
- ❌ gRPC `KeywordBlocking*`：RN 有实现（`msg.ts:133-156, 332-345`）但**缺少全部 gRPC 元数据头**（见 §4.2），whisper_block 页大概率报错。

### 2.8 直播

| 功能 | Flutter | RN | 状态 |
|---|---|---|---|
| 房间流 | GET `/xlive/web-room/v2/index/getRoomPlayInfo` WBI（`live.dart:83-113`） | `live.ts:10-17` | ✅ |
| H5 信息/弹幕历史/弹幕 token | `getH5InfoByRoom`、`dM/gethistory`、`getDanmuInfo` WBI（`live.dart:115-178`） | `live.ts:20-32` | ✅ |
| 发弹幕 | POST `/msg/send` form + WBI query（`live.dart:37-81`） | `live.ts:35-57` | ✅ |
| **直播首页 feed** | GET `/xlive/app-interface/v2/index/feed` **appSign + buvid/app-key=android/安卓 UA 头**（`live.dart:197-251`） | `live.ts:180-212`：**未签名**、无 buvid/app-key 头 | ❌ **首页"直播"tab 高风险**（见 §6.3） |
| **分区列表** | `/xlive/app-interface/v2/second/getList` appSign（`live.dart:270-331`） | `live.ts:100-102` 未签名 | ❌ 同上 |
| **分区总表** | `/xlive/app-interface/v2/index/getAreaList` appSign（`live.dart:333-362`） | `live.ts:95-97` 未签名 | ❌ 同上 |
| 房间分区 | `/room/v1/Area/getList` appSign（`live.dart:429-461`） | `live.ts:225-227` 未签名 | ⚠️ |
| 收藏分区 get/set_fav_tag | appSign（`live.dart:364-427`） | `live.ts:215-222` 未签名 | ⚠️ |
| 直播搜索 | `/xlive/app-interface/v2/search_live` appSign（`live.dart:463-496`） | `live.ts:73-92` **已签名** ✅ | ✅ |
| 关注主播列表 | `/xlive/web-ucenter/user/following`（`live.dart:253-268`） | `live.ts:68-70` | ✅ |
| web 推荐列表 | `/xlive/web-interface/v1/second/getUserRecommend`（`api.dart:309-310`） | ❌ 缺失 | ❌ |
| SC/贡献榜/勋章墙/禁言/屏蔽词/举报/点赞 | 全套（`live.dart:498-800`） | `live.ts:110-290` 全套 | ✅ |
| 长连接 | wss + TCP 回退、brotli/zlib（`lib/tcp/live.dart`） | 仅 wss（`PiliLiveSocket.swift`） | ⚠️ |

### 2.9 PGC/影视

`pgc.dart` ↔ `src/api/pgc.ts`：`/pgc/view/web/season`、`/pgc/season/episode/web/info`、`/pgc/web/follow/*`、`/pgc/season/index/condition|result`、`/pgc/web/timeline`、`/pgc/review/*`、`/pgc/view/web/season/user/status` 全部 ✅。
❌ 缺 `/pugv/player/web/playurl`（PUGV 流，见 2.2）；`/pugv/view/web/season` 存在 ✅。

### 2.10 搜索

| 功能 | Flutter | RN | 状态 |
|---|---|---|---|
| 默认词 | `/x/web-interface/wbi/search/default` | `search.ts:7-9`（无 WBI；Flutter `search.dart` 亦未签名） | ✅ |
| 建议 | `s.search.bilibili.com/main/suggest`（`search.dart:23-45`） | `search.ts:12-14` | ✅ |
| 分类搜索 | `/x/web-interface/wbi/search/type` WBI + **origin/referer=search.bilibili.com + v_voucher→geetest 解锁**（`search.dart:47-131`） | `search.ts:17-24`：WBI ✅ 但**无 search origin/referer、无 v_voucher 处理** | ⚠️ 触发风控后无法自愈，结果持续为空 |
| 综合搜索 | `/x/web-interface/wbi/search/all/v2` WBI（`search.dart:134-174`） | ❌ 缺失（RN 无综合 tab） | ❌ |
| 热搜 | `s.search.bilibili.com/main/hotword` | 用 `/x/v2/search/trending/ranking` 替代 | ✅ |
| app 搜索推荐 | `app.bilibili.com/x/v2/search/recommend` appSign（`search.dart:277-296`） | `search.ts:32-34` 已签名 | ✅ |
| 话题发布搜索 | `app.bilibili.com/x/topic/pub/search` appSign（`search.dart:298-328`） | `search.ts:37-44` 已签名 | ✅ |

### 2.11 用户空间（member）

`member.dart` ↔ `src/api/user.ts`：
- ✅ `memberInfo`（WBI+dm_img+space referer+PC UA，`member.dart:286-318` ↔ `user.ts:56-69`）
- ✅ `searchArchive`（WBI+dm_img，`member.dart:349-392` ↔ `user.ts:77-87`）
- ✅ app 空间 `/x/v2/space`、`space/archive/cursor`、`space/article`、`coinarc`、`likearc`、`space/bangumi`（appSign，`user.ts:184-261`）
- ✅ `card`、`upstat`、`seasons_series`、`seasons_archives_list`、`x/series/archives`、`upowerRank`、`spaceSetting(/app)`、`space/privacy/batch/modify`、`userRealName`(appSign)
- ⚠️ `spaceShop`（`member.dart:805-833` appSign POST mall 域）→ `user.ts:258-261`（RN 发到 appClient=app.bilibili.com 基址 + mall 完整 URL，客户端按 http 前缀直发，可通）
- ❌ Flutter 会员搜索子页走 `SpaceGrpc.searchArchive`（`lib/pages/member_search/child/controller.dart`）；RN 用 HTTP（可接受）。

### 2.12 登录/账号（详见 §5）

路径全部存在：TV 二维码（auth_code/poll/confirm）、oauth2/login、sms、web/key、safecenter、oauth2/access_token、login/exit/v2、login_devices。
❌ 缺 `refreshToken` 的自动续期调用链（Flutter 在 cookie 过期时自动 `oauth2AccessToken` 刷新；RN 仅暴露 `loginApi.refreshToken`，未见自动调用）。

### 2.13 其他

| 功能 | Flutter | RN | 状态 |
|---|---|---|---|
| 弹幕分段 | gRPC DmSegMobile | HTTP `/x/v2/dm/web/seg.so`（`danmaku.ts:24-26`，原生解码 protobuf） | ✅ 等价 |
| 弹幕动作 | `/x/v2/dm/post|thumbup/add|/x/dm/report/add|recall|edit/state|filter/*`（`danmaku.dart`、`danmaku_block.dart`） | `danmaku.ts` 全套 | ✅ |
| 音乐 BGM | `/x/copyright-music-publicity/bgm/detail` WBI(music_id,relation_from)、`wish/update`(music_id,state,csrf)、`recommend_list`(music_id)（`music.dart:11-60`） | `music.ts:4-14`：**参数名全部错用 `id`/`wish`，无 WBI，无 csrf** | ❌ **音乐页必挂**（见 §6.4） |
| 电竞赛事 | `/x/esports/match/info`（`match.dart`） | `match.ts` | ✅ |
| SponsorBlock | `skipSegments/vote/viewed/portVideo/userInfo/uptime`（`sponsor_block.dart`） | `sponsor-block.ts`：仅 3 个核心接口 | ⚠️ 缺投稿/查询类 |
| Gaia 风控 | `/x/gaia-vgate/v1/register|validate` appSign（`validate.dart`） | `validate.ts:44-51`（已签名） | ✅ |
| 版本检查 | github releases | 同 | ✅ |
| 下载 | `download.dart`（WBI playurl fnval） | 原生 PiliDownloadManager（独立实现） | ⚠️ 未逐项对账 |

---

## 3. 缺失接口汇总（HTTP）

| # | 接口 | Flutter 用途 | 移植方法 |
|---|---|---|---|
| 1 | GET `/x/web-interface/wbi/search/all/v2` | 综合搜索 | WBI 签名；参数 keyword/page/order/duration/tids/order_sort/user_type/category_id/pubtime_begin_s/end_s（`search.dart:146-157`） |
| 2 | GET `/x/tv/playurl` | 高画质/专属视频流兜底 | **appSign**；access_key/actionKey=appkey/cid/fourk/is_proj/mobile_access_key/object_id/mobi_app=android/platform=android/playurl_type/protocol/qn（`video.dart:1026-1054`） |
| 3 | GET `/pugv/player/web/playurl` | 课堂(PUGV)播放流 | 同 pgcUrl，解析 `data`（`api.dart:26`） |
| 4 | GET `/x/article/viewinfo`、`/x/article/view` | 专栏详情/阅读计数 | WBI；id 参数（`dynamics.dart:337-372`） |
| 5 | POST `/x/v1/medialist/history` | 列表播放历史上报 | form；desc/oid/upper_mid/csrf（`video.dart:707-722`） |
| 6 | POST `/x/v2/history/toview/copy`、`/move` | 稍后再看内容复制/移动 | form；resources/src_media_id?/tar_media_id/csrf（`fav.dart:676-707`） |
| 7 | GET `/xlive/web-interface/v1/second/getUserRecommend` | web 直播推荐 | page/page_size/platform=web（`api.dart:309`） |
| 8 | （gRPC）见 §4 | — | — |

---

## 4. gRPC 缺口分析

### 4.1 Flutter gRPC 服务与调用方

传输层：gRPC-over-HTTP2(POST app.bilibili.com/<service>/<method>，`application/grpc`，gzip 帧)（`lib/grpc/grpc_req.dart:55-111`）。
认证头（`lib/utils/accounts/grpc_headers.dart:23-85`）：`authorization: identify_v1 <access_key>`、`x-bili-device-bin`、`x-bili-network-bin`、`x-bili-locale-bin`、`x-bili-metadata-bin`(含 accessKey/buvid/build)、`x-bili-fawkes-req-bin`、`buvid`、`x-bili-trace-id`、`grpc-encoding: gzip`。

| service | 方法 | Flutter 调用方 | RN 现状 |
|---|---|---|---|
| `bilibili.app.im.v1.im` + `bilibili.im.interface.v1.ImInterface` | SessionMain/SessionSecondary/ClearUnread/SessionUpdate/(Un)PinSession/DeleteSessionList/Get&SetImSettings/SendMsg/ShareList/SyncFetchSessionMsgs/GetTotalUnread/SessionDetail | whisper 全家桶（`pages/whisper*/controller.dart`） | ❌ 用 api.vc HTTP 替代大部分；ClearUnread 无等价（本地游标模拟） |
| 同上 | **KeywordBlockingList/Add/Delete** | `pages/whisper_block/controller.dart` | ⚠️ RN 有 gRPC 实现（`msg.ts:332-345`）但**缺全部元数据头**（见 4.2） |
| `bilibili.main.community.reply.v1.Reply` | MainList/DetailList/DialogList/SearchItem/TranslateReply | 视频评论页/楼中楼/评论搜索/翻译（`pages/video/reply*/controller.dart`、`main_reply`、`common_dyn`） | ❌ 用 HTTP `/x/v2/reply*` 替代（功能可用，丢失 grpc 评论过滤/翻译） |
| `bilibili.community.service.dm.v1.DM` | DmSegMobile/DmView | 视频弹幕+下载弹幕（`pages/danmaku/controller.dart`、`services/download/download_service.dart`） | ✅ HTTP `/x/v2/dm/web/seg.so` 等价替代；DmView（弹幕设置/防挡）无等价 |
| `bilibili.app.dynamic.v1.Dynamic` / `v2.Opus` | DynRed/OpusDetail/OpusSpaceFlow | 动态角标（`pages/main/controller.dart`）、opus 详情/空间 opus | ⚠️ RN 用 HTTP entrance/opus 接口替代，角标实时性差 |
| `bilibili.app.viewunite.v1.View` | View | PGC 页 introduction 补充数据（`pages/video/introduction/pgc/controller.dart`） | ❌ 无（PGC 页少部分联合数据） |
| `bilibili.app.listener.v1.Listener` | PlayURL/Playlist/ThumbUp/TripleLike/CoinAdd | 音频播放器（`pages/audio/controller.dart`） | ⚠️ RN 音频页用 web 接口 `/audio/music-service-c/web/url`（`app/audio/[id]/index.tsx:47`），点赞/三连/投币无实现 |
| `bilibili.app.interface.v1.Space` | SearchArchive | 会员投稿搜索（`pages/member_search/child/controller.dart`） | ⚠️ RN 用 HTTP WBI searchArchive 替代（可接受） |
| `dagw`/`vas`/`metadata` 等 | 广告/风控元数据 proto | 仅被引用，无业务调用 | — |

### 4.2 RN 唯一 gRPC 实现的致命问题

`src/api/msg.ts:133-156` 的 `grpcUnary` 只带 `Content-Type: application/grpc`（+ app.bilibili.com 自动附加的 app-key 头），**完全没有** Flutter `grpc_headers.dart` 的 6 组二进制元数据与 `authorization: identify_v1 <access_key>`。B 站 app gRPC 网关对 im service 强制校验 `x-bili-metadata-bin`/authorization → 预期返回 grpc-status 16 (UNAUTHENTICATED)。**whisper_block（私信屏蔽词）页面必然加载失败。**

### 4.3 RN 侧实现 gRPC 的可行方案

1. **补齐元数据头（最小改动，推荐先做）**：在 `grpcUnary` 内按 `grpc_headers.dart` 复刻：
   - `x-bili-device-bin` = protobuf `Device{appId:5,build:2001100,buvid,mobiApp:'android_hd',platform:'android',channel:'master',brand/model:'android',osver:'15',versionName:'2.0.1'}` base64；
   - `x-bili-network-bin`、`x-bili-locale-bin`、`x-bili-metadata-bin`(accessKey)、`x-bili-fawkes-req-bin`(appkey=android_hd,env=prod,sessionId 随机 8 位)；
   - `authorization: identify_v1 <access_key>`、`grpc-encoding: gzip`、`buvid`。
   这些 message 的字段号固定，可像现有 `encodeStringField` 一样手写 varint 编码，无需 protobuf 库。注意 RN 目前帧头 flag=0 不压缩，服务端可接受 identity。
2. **通用化**：若后续要补 Reply/MainList、Im SessionMain 等，建议引入 `protobufjs`（纯 JS，RN 可用）+ 从 `lib/grpc/bilibili/**/*.pbjson.dart` 反推 .proto（descriptor 已含字段定义），帧协议复用现有 `frameGrpc/decodeGrpcFrame`（需补 gzip flag=1 解压）。
3. **能走 HTTP 的优先 HTTP**：评论、弹幕、会话列表/消息记录 RN 已有 HTTP 替代且工作正常，不必重做 gRPC；只有 ClearUnread、KeywordBlocking、音频点赞/投币、DmView 等无 HTTP 等价的才值得补。

---

## 5. 登录链路与 Cookie 持久化

### 5.1 登录方式对比

| 方式 | Flutter（`lib/http/login.dart` + `pages/login/controller.dart`） | RN（`src/api/login.ts` + `app/login/index.tsx`） | 结论 |
|---|---|---|---|
| TV 二维码 | getHDcode(appSign, local_id='0') + codePoll（`login.dart:34-70`） | getQRCode(`local_id:'Yk5WQz00'`，`login.ts:349-352`) + 原生轮询（`PiliNativeCoreModule.swift:648-652`） | ✅ 等价（local_id 不同但合法） |
| 密码登录 | oauth2/login：RSA(hash+pwd)、dt、buvid、device_id、mobi_app=android_hd、statistics（`login.dart:192-265`） | `login.ts:360-399`：参数逐项对齐，RSA 走原生 Security | ✅ |
| 短信登录 | sms/send + login/sms（`login.dart:95-327`） | `login.ts:402-479`：对齐（login_session_id=md5(buvid+ts) 等） | ✅ |
| 风控二次验证 | safecenter user/info、captcha/pre、sms/send、login/tel/verify（`login.dart:329-450`） | `login.ts:488-525` | ✅ |
| token 刷新 | oauth2/access_token（`login.dart:452-493`），**cookie 失效自动触发** | 仅 `login.ts:539-542` 暴露方法，无自动续期 | ⚠️ 长期挂机后 access_key 过期会整体失效 |
| 登出 | login/exit/v2 appSign | `login.ts:533-536` | ✅ |

### 5.2 Cookie 持久化

- Flutter：登录响应 `token_info.access_token` + `cookie_info.cookies[]`（含 SESSDATA、bili_jct、DedeUserID、DedeUserID__ckMd5、sid）写入该账号 CookieJar（Hive），并同步到 WebView（`LoginUtils.setWebCookie`，`login_utils.dart:21-45`）；buvid3 首次本地生成（`account.dart:198-204`）。
- RN：`handleLoginCookies`（`login.ts:545-554`）把 access_key 与全部 cookies 写入 iOS `HTTPCookieStorage`（域名 .bilibili.com），另按账号名做快照存 Keychain（`cookie.ts:162-224`）；buvid3 由 `ensureBuvid` 生成（`cookie.ts:59-64`）。
- **结论**：bili_jct/SESSDATA/DedeUserID/DedeUserID__ckMd5 四类关键 cookie 均完整落盘 ✅；buvid4 两端都不主动生成（依赖服务端 Set-Cookie）✅；WebView cookie 通过 pili-webview 的 HTTPCookieStorage 共享 ✅。
- ⚠️ 风险点：iOS HTTPCookieStorage 是**全局单份**，多账号切换靠 clear+restore（`cookie.ts:210-215`），任何一处漏存会串号；Flutter 是每账号独立 jar，天然隔离。

---

## 6. "无法加载"根因诊断（按影响面排序，均附代码证据）

### R1｜PGC 播放流响应字段解析错误（必然失败）
`app/pgc/[id].tsx:69-72`：`getBestPlayUrl(res?.data)`。`/pgc/player/web/v2/playurl` 的载荷在 **`result.video_info`**（Flutter `video.dart:250-255` 明确解析 `res.data['result']['video_info']`），`res.data` 恒为 undefined → 所有番剧/影视点击播放即"获取播放地址失败"。
修复：读 `res?.result?.video_info`（含 `lastPlayTime` 取 `result.play_view_business_info.user_status.watch_progress.current_watch_progress`）；另注意 RN 播放器只能播 durl，需要 `fnval:0/1` 或接受 DASH 仅视频轨。

### R2｜web 请求缺少风控指纹头（间歇性大面积空数据）
`src/api/client.ts:65-85` 不给 api.bilibili.com 注入 `env:prod / app-key:android64 / x-bili-aurora-zone:sh001 / x-bili-mid:<mid> / x-bili-aurora-eid`（Flutter `constants.dart:29-34` + `account.dart:65-69` 对**每个** web 请求都带），且 UA 从 `Dart/3.6` 变为 BiliDroid 安卓 UA。触发 -352/-403 时表现为：空间投稿、用户动态、搜索、动态流等**时有时无**地加载失败。
修复：把 BASE_HEADERS 应用到所有 bilibili 域（不只 app 域），登录态补 `x-bili-mid:<mid>` 与 aurora-eid（Flutter `IdUtils.genAuroraEid`）。

### R3｜直播 app-interface 接口未签名（直播 tab/分区加载失败）
Flutter 对 `/xlive/app-interface/v2/index/feed`、`/second/getList`、`/index/getAreaList`、`get_fav_tag`、`/room/v1/Area/getList` 全部 `AppSign.appSign` + buvid/app-key=android 头（`live.dart:197-461`）；RN `src/api/live.ts:95-102,180-212` 未签名（client.ts 只对 app.bilibili.com 自动签名）。
修复：这些调用改为 `signAppParamsAsync(params)` 并补 `app-key:'android'` 头。

### R4｜gRPC 元数据头缺失（私信屏蔽词页必挂）
`src/api/msg.ts:133-156`：仅 Content-Type。见 §4.2/4.3。

### R5｜音乐接口参数名全错（音乐页必挂）
`src/api/music.ts:4-14`：`bgmDetail/bgmRecommend` 传 `id`（应为 `music_id`，且 detail 需 WBI+`relation_from:'bgm_page'`）；`wishUpdate` 传 `{id,wish}`（应为 `{music_id, state:1|2, csrf}` form）（Flutter `music.dart:11-60`）。

### R6｜搜索风控无自愈（搜索结果为空且不恢复）
`src/api/search.ts:17-24` 缺 `origin/referer: search.bilibili.com`，且无 `v_voucher → gaia register → geetest → validate` 解锁链（Flutter `search.dart:79-99` + `request_utils.dart:532-598`）。一旦触发搜索风控，RN 只能永久空结果。

### R7｜buvid 激活报文错误（隐性放大风控）
`src/api/validate.ts:35-37` 直接 POST payload；Flutter 是 `{'payload': json}`（`init.dart:92-99`）。激活无效 → 游客/新装场景更易被风控。

### R8｜POST 动作接口 Content-Type 不一致（部分操作偶发失败）
Flutter 绝大多数 `/x/*` POST 用 `application/x-www-form-urlencoded`（如三连、评论增删、收藏、弹幕屏蔽、msg 系列）；RN client.ts 默认 `application/json`（`client.ts:114-126`）。多数 B 站接口两者都收，但 `/x/msgfeed/del`、`/x/v3/fav/*`、`/x/relation/modify` 等在部分场景只认 form/csrf 表。

### R9｜app 推荐参数集过简（首页推荐可能空/不个性化）
`src/api/video.ts:193-204` 只传 idx/pull/flush/column/style；Flutter 传 build/mobi_app=android_hd/platform/statistics/fnval/qn/device… + buvid/fp_local/fp_remote/session_id/env/app-key=android_hd 头（`video.dart:92-140`）。

### R10｜评论游客分支头策略差异
Flutter 游客评论用 NoAccount（空 cookie）+ baseHeaders（`reply.dart:16-19,29-40`）；RN 游客仍带全套 cookie 且无 app-key 头（`reply.ts:28-41`）。个别视频游客评论 -352。

### R11｜缺失接口导致的局部空白
综合搜索（searchAll）、PUGV 播放流、TV 播放流、专栏详情、medialist 历史上报、稍后再看 copy/move、web 直播推荐（§3）。

---

## 7. 模型解析抽查

| 场景 | Flutter 模型 | RN 解析 | 结论 |
|---|---|---|---|
| 首页推荐(app) | `RcmdVideoItemAppModel`（models/model_rec_video_item.dart） | `use-rcmd-feed.ts:109-128`：card_goto/args/player_args/cover_left_text_1/2、three_point_v2 dislike reasons | ✅ 字段对齐 |
| 首页推荐(web) | `RcmdVideoItemModel` | `use-rcmd-feed.ts:129-144`：goto/id/owner/stat/rcmd_reason.content | ✅ |
| 动态流 | `DynamicsDataModel`（modules/module_stat 等） | `components/dynamics/feed-types.ts` + `use-dynamic-feed.ts:82-87`：items/offset，过滤广告卡 | ✅（字段名一致） |
| 评论 | `ReplyData`（models_new/reply/*） | `hooks/use-video-comments.ts`：replies/rpid/member/level_info/vip/official_verify/content/emote、page/cursor、subject_control | ✅（与 Flutter replyCast 的映射一致） |
| 搜索结果 | `SearchVideoData` 等 | 直接渲染原始 JSON | ✅ 字段兼容 |
| **PGC 播放** | `result.video_info`（`video.dart:250-255`） | **读 `res.data`**（`app/pgc/[id].tsx:70`） | ❌ 见 R1 |
| PGC season | `result`（`search.dart:208-224`） | `app/pgc/[id].tsx:96-128` 读 `res.result` | ✅ |
| 私信会话 | ImGrpc SessionMainReply | `app/whisper/index.tsx` 解析 HTTP `session_list`：talker_id/last_msg/unread_count/account_info | ✅（HTTP 结构） |

---

## 8. 修复优先级建议

| 优先级 | 事项 | 预期收益 |
|---|---|---|
| P0 | R1 PGC `result.video_info` 解析 + fnval 策略 | 番剧/影视恢复播放 |
| P0 | R3 直播 app-interface 补 appSign + app-key:android 头 | 直播 tab/分区恢复 |
| P0 | R5 音乐参数名/WBI/csrf | 音乐页恢复 |
| P1 | R2 全局 web 请求补 baseHeaders/aurora/mid/UA 对齐 | 消除间歇性 -352 空数据 |
| P1 | R4 grpcUnary 补元数据头（§4.3 方案 1） | 私信屏蔽词恢复 |
| P1 | R6 搜索 origin/referer + v_voucher 解锁链 | 搜索风控自愈 |
| P2 | R7 ExClimbWuzhi payload 包裹；R8 form 化动作接口；R9 推荐参数补齐；R10 游客评论头 | 降低风控概率 |
| P2 | §3 缺失接口按需补齐；oauth2 自动续期 | 功能完整性 |

---

## 附录：文件索引

- Flutter HTTP 层：`lib/http/api.dart`（301 常量）、`lib/http/init.dart`、`lib/utils/accounts/account_manager/account_mgr.dart`、`lib/utils/accounts/account.dart`、`lib/utils/accounts/grpc_headers.dart`、`lib/common/constants.dart`、`lib/utils/wbi_sign.dart`、`lib/utils/app_sign.dart`、`lib/http/{video,dynamics,user,live,search,reply,msg,fav,member,login,music,pgc,danmaku,validate,sponsor_block}.dart`
- Flutter gRPC：`lib/grpc/{grpc_req,url,im,reply,dm,dyn,view,audio,space}.dart`、`lib/grpc/bilibili/**`
- RN API 层：`src/api/{client,constants,endpoints,video,dynamics,user,login,msg,fav,live,search,reply,pgc,danmaku,music,match,validate,sponsor-block}.ts`
- RN 签名/网络原生层：`modules/pili-native-core/ios/{PiliSigner,PiliNetwork,PiliNativeCoreModule,PiliBackgroundTask}.swift`
- RN 直播长连：`modules/pili-live/ios/PiliLiveSocket.swift`
