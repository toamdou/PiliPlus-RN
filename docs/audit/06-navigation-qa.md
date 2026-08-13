# 06 · 导航 / 屏幕生命周期 / 错误处理 QA 审计报告

审计对象：piliplus-RN（Expo Router v57，React Native 0.86，iOS only）
审计范围：导航架构、逐屏生命周期、UI 层错误处理、崩溃隐患、状态管理、逐屏缺陷。
审计方式：静态代码审计（只读）。播放器内核实现不在本审计范围，但与导航/布局的交互（全屏进出、共享播放器生命周期）已覆盖。
路径前缀：`C:/Users/xingtongofficial/Desktop/piliplus/piliplus-RN/`

严重度定义：P0=必现崩溃/功能性阻断；P1=高频可感知的错误行为（错误导航、白屏、静默失败、内容丢失）；P2=边缘场景/体验问题。

---

## 一、导航架构问题

### 1.1 总体结构

- 仅两个 `_layout.tsx`：根 Stack（`src/app/_layout.tsx`）+ `(tabs)` NativeTabs（`src/app/(tabs)/_layout.tsx`）。其余 ~70 个路由全部平铺在根 Stack 下，无分组、无 modal presentation。结构本身可用，但所有深屏（视频、直播、空间、收藏详情…）都在同一个 Stack 中无限 push，栈深无上限，长会话下返回链很长（Flutter 原版同样如此，属设计对齐）。
- 根 Stack 全局 `headerShown: true, headerBackButtonDisplayMode: 'minimal'`（`_layout.tsx:122`）；`video/[id]`、`live/[roomId]`、`(tabs)` 为 `headerShown: false`（`_layout.tsx:123-125`），自绘返回按钮。
- **没有 `+not-found.tsx` 兜底路由**。任何 `router.push` 到不存在的路径（例如通知深链拼出 `/pgc/`、`/member/undefined`）会直接抛 expo-router "No route named X" 异常 → dev 红屏 / release 未捕获异常。P1。建议：新增 `src/app/+not-found.tsx` 并在 push 前对拼接型路由做非空校验。

### 1.2 P0/P1 级导航缺陷

| # | 问题 | 位置 | 严重度 |
|---|------|------|--------|
| N1 | **共享单例播放器 + 返回后不恢复源**：`PiliPlayer.shared` 被 video 详情页、video 全屏页、pgc 页、download/player、live 共用。从视频 A push 到视频 B（相关视频/合集 `switchEpisode` 走 `router.push('/video/'+bvid)`，`use-video-controller.ts:1052`），B 卸载时只 `pause()` 不重置源；返回 A 后 A 的 `videoSource` 未变，`use-video-playback.ts:244-285` 的源加载 effect 不会重跑 → **A 页面显示的是 B 的最后一帧/黑屏，点播放会播出 B 的内容**。pgc→video、download/player→video 同理。这是"返回上一级有问题"的最大根因。 | `src/hooks/use-video-playback.ts:243`、`src/hooks/use-video-controller.ts:584-629`、`src/app/pgc/[id].tsx:436` | **P0** |
| N2 | **进入全屏后播放被旧页 blur 暂停（竞态）**：`enterFullscreen` push `/video/fullscreen` 后，全屏页挂载即 `player.play()`（`use-fullscreen-player.ts:200-216`），而详情页的 `useFocusAwarePlayer` 在转场结束（~350-500ms 后）才收到 blur → `player.pause()`（`use-focus-aware-player.ts:64-68`）。共享播放器被后到的 pause 停掉 → **进全屏后视频冻结在暂停态**，需手动点播放。push 新视频页（N1 场景）同样受此竞态影响（新视频 autoPlay 后可能被旧页 blur 暂停）。 | `src/hooks/use-focus-aware-player.ts:64`、`src/hooks/use-fullscreen-player.ts:211` | **P1** |
| N3 | **评论排序/重试在切 P（switchToCid）后失效**：`useVideoComments` 的 `changeCommentSort`/`retryComments` 通过 useCallback 捕获的 `loadCommentsFor` 闭包读取 `commentsLoaded` 状态。切 P 时 `setInfo` 改变 `info` → 这些回调以 `commentsLoaded=true` 的闭包重建；此后点"最新/最热"会 `setReplies([])` 后 `loadCommentsFor` 因 `if (commentsLoaded) return`（`use-video-comments.ts:101`）直接返回 → **评论区被清空且不再加载**；错误态下点"重试"为无操作。 | `src/hooks/use-video-comments.ts:100-102,421-445` | **P1** |
| N4 | **通知深链：ep 链接被当成 season 打开**：`bilibili://pgc/season/ep/(\d+)` 映射为 `/pgc/${epId}`（`notifications/index.tsx:60-62`），但 `pgc/[id]` 把参数当 `season_id` 请求 `seasonInfo`（`pgc/[id].tsx:93`）→ 接口报错，页面显示"加载失败"且无重试。 | `src/app/notifications/index.tsx:60`、`src/app/pgc/[id].tsx:93` | **P1** |
| N5 | **通知深链：`comment_root_id` 分支永不可达**：`/bilibili:\/\/video\/(\d+)/` 的匹配写在 `/comment_root_id=` 分支之前（`notifications/index.tsx:54-57`），先命中先返回 → 带定位的评论通知永远只打开视频页，**无法定位到具体评论**。且 `main_reply` 页根本不读 `rootId` 参数（`main_reply/[oid]/index.tsx:92`）。用户报告的"评论定位"问题根因之一。 | `src/app/notifications/index.tsx:54` | **P1** |
| N6 | **`/pgc/${item.businessId || item.subjectId || ''}` 可能拼出 `/pgc/`** → 路由不存在 → push 抛异常（无 +not-found 兜底）。 | `src/app/notifications/index.tsx:81` | P2 |
| N7 | `av2bv(NaN)` 抛 RangeError（`BigInt(NaN)`，`utils/id-utils.ts:17`）。通知 `av2bv(item.subjectId)`（`notifications/index.tsx:80`）若 subjectId 非数字 → 点击通知崩溃。 | `src/utils/id-utils.ts:17`、`src/app/notifications/index.tsx:80` | P2 |
| N8 | 视频页 `Stack.Screen` 的 `gestureEnabled: activeTab === 'intro'`（`VideoScreenView.tsx:169`）：评论 Tab 下 iOS 边缘返回手势被禁用（为避让横向 pager），只能点播放器返回键——从评论 Tab 直接手势返回会"失效"，与"返回有问题"的主观感受相关。属有意设计，但应在 UI 上给返回 affordance 或改用 simultaneous 手势。 | `src/components/video/VideoScreenView.tsx:169` | P2 |
| N9 | `router.replace('/dynamics'|'/mine')` 实现默认首页（`_layout.tsx:57-60`）：在 Tabs 内 replace 可切换初始 tab，但依赖 `initialPathRef.current==='/'` 且发生在 `authInit/settingsInit` 完成后 → 启动时先闪现首页 Tab 再跳变。体验瑕疵。 | `src/app/_layout.tsx:55-60` | P2 |
| N10 | `member/` 目录下的 `article-tab.tsx`、`audio-tab.tsx`、`cheese-tab.tsx`、`guard-tab.tsx`、`opus-tab.tsx`、`shop-tab.tsx` 既是组件又被 expo-router 注册为可达路由（`/member/article-tab` 等）。误导航会以缺失 `mid` 参数渲染，属于路由污染；建议移出 `src/app` 或加 `unstable_settings` 守卫。 | `src/app/member/*-tab.tsx` | P2 |
| N11 | 深链解析 `parseBiliUrl` 只支持 video/space/live 三种 http 链接（`utils/feedback.ts:87-104`）：不解析 `bilibili://` scheme、bangumi ss/ep、opus/动态、专栏。app scheme `piliplus://` 仅靠 expo-router 自动路径映射，无自定义入站链接处理（无 `Linking.addEventListener('url')`）。外部唤端能力基本缺失。 | `src/utils/feedback.ts:87`、`app.json:9` | P2 |

### 1.3 header / 安全区一致性

- 自绘 header 的屏幕（video、live、dlna、video/notes）均正确使用 `useSafeAreaInsets()` 的 `insets.top` 放置返回按钮（如 `LiveInfoPanel.tsx:87`、`VideoOverlay`、`video/notes.tsx:164-170`），未发现刘海/灵动岛冲突。
- 首页浮动 GlassSearchBar/HomeCategoryBar 使用 `topInset={insets.top}` 计算定位（`(tabs)/index.tsx:185`、`HomeCategoryBar.tsx:117-135`），正确。
- `mine.tsx` 使用 `contentInsetAdjustmentBehavior="automatic"`（`mine.tsx:92`），由系统处理顶部 inset，正确；首页 FlashList 显式禁用自动 inset 并自管 padding（`(tabs)/_layout.tsx:81-84` 注释），两端策略不一致但各自自洽。
- `search/results.tsx:255` 的 FlashList 用 `contentInsetAdjustmentBehavior="never"`，在带 `Stack.SearchBar` 的 header 下顶部间距依赖 `contentContainerStyle.paddingTop: 6` —— iOS 26 的 Toolbar/SearchBarSlot 场景下可能出现顶部贴合偏紧，建议在真机 iOS 26 验证一次。

---

## 二、全局错误处理问题

### 2.1 API 层

- `src/api/client.ts` **没有任何全局拦截/错误归一化**：HTTP 非 2xx 抛 `原生请求失败: HTTP {status}`（`client.ts:174,190`），业务错误码（`code !== 0`）完全不处理，原样返回给调用方。各屏幕各自判断 `res?.code`，标准不一（有的判断、有的只看 `data` 存在性）。建议增加统一 `request()` 包装：`code!==0` 时抛出带 message 的 ApiError，UI 层统一消费。P1（架构）。
- B 站风控（-352/-403/网络超时）在 UI 层的呈现完全取决于各屏幕自觉，无统一错误态组件。`usePagedList`（`src/hooks/use-paged-list.ts`）是唯一提供 `error` + 首页失败态的通用 hook，但只有部分屏幕使用（main_reply、notifications、follow…）。

### 2.2 首屏加载失败 = 静默空态的屏幕（白屏/空列表，无提示、无重试）

| 屏幕 | 位置 | 表现 |
|------|------|------|
| 首页推荐 | `src/hooks/use-rcmd-feed.ts:301-302` | catch 只 console.error；失败后空列表无任何提示（loading 结束） |
| 动态 Tab | `src/hooks/use-dynamic-feed.ts:89-91` | 同上 |
| 历史记录 | `src/app/history/index.tsx:131` | 同上 |
| 搜索结果 | `src/app/search/results.tsx:178-179` | catch 后 `setResults([])` → 显示"无搜索结果"，把网络错误伪装成空结果 |
| PGC 详情 | `src/app/pgc/[id].tsx:128-130,428-430` | 显示"加载失败"文字但**没有重试按钮** |
| 直播间 | `src/app/live/[roomId].tsx:333` | catch 只 console.error，info=null 渲染空壳页 |
| 我的页统计 | `src/app/(tabs)/mine.tsx:48-52` | catch(()=>{}) 静默（次要） |

有完整 错误态+重试 的屏幕：member/[mid]（TabError）、main_reply、usePagedList 系屏幕、CommentSection（commentsError+重试按钮）、动态详情评论区。

### 2.3 其他全局性问题

- 评论 `loadMoreReplies` 失败只 console.error（`use-video-comments.ts:266-268`），页脚一直可点"加载更多"但无反馈。
- 视频 `loadVideo` 有 3 次指数退避自动重试（`use-video-controller.ts:740-754`），但**全部失败后没有错误 UI**：loading=false、info=null，`VideoScreenView` 直接渲染空 container（无 info 的 tab 栏/简介）——取流风控时用户看到半空白页，只有取流分支会 toast（`use-video-controller.ts:680`）。P1。
- 视频页 loading 态只是一个居中 ActivityIndicator（`VideoScreenView.tsx:158-164`），无标题/骨架，返回键也不可用（headerShown:false，加载期间没有返回按钮入口——VideoOverlay 未渲染）。P2。

---

## 三、逐屏缺陷清单

### (tabs) 首页 index

| # | 缺陷 | 位置 | 严重度 |
|---|------|------|--------|
| H1 | 首屏加载失败无任何错误态/重试（见 2.2） | use-rcmd-feed.ts:301 | P1 |
| H2 | 未登录点头像 → `/member/0`（`userInfo?.mid || 0`），打开 mid=0 的空间页报错 | (tabs)/index.tsx:183 | P2 |
| H3 | 切换分区/分类先 `setVideos([])` 再请求（use-rcmd-feed.ts:315-323）→ 明显白屏闪烁；请求失败则停留在空列表 | use-rcmd-feed.ts:316 | P2 |
| H4 | `fetchVideos` 的闭包依赖 `activeCategory`，`handleEndReached` 依赖 `loading/refreshing` 状态做防重入（use-rcmd-feed.ts:336-344）——状态更新异步，极端快速滚动下可能并发两次请求（有 cancelToken 兜底，影响小） | use-rcmd-feed.ts:336 | P2 |

### (tabs) 动态 dynamics

| # | 缺陷 | 位置 | 严重度 |
|---|------|------|--------|
| D1 | 加载失败静默空态（见 2.2） | use-dynamic-feed.ts:89 | P1 |
| D2 | 未登录仅显示登录按钮，无"去登录"以外的内容——可接受 | (tabs)/dynamics.tsx | — |

### (tabs) 我的 mine

- 统计数据失败静默（mine.tsx:52）——P2。其余结构健康（账号切换/登出均有确认弹窗与错误 toast）。

### 搜索 search/index + search/results（用户点名）

| # | 缺陷 | 位置 | 严重度 |
|---|------|------|--------|
| S1 | 结果页请求失败 → `setResults([])` 显示"无搜索结果"，无错误提示/重试；用户无法区分"没结果"和"挂了" | search/results.tsx:178-179 | P1 |
| S2 | `onEndReached` 用 `page` state 做下一页且无 busy 守卫（仅 `!searching` 状态判断），惯性滚动快速触发时可能重复请求同一页（cancelToken 会中断上一次，但仍浪费请求并可能闪动） | search/results.tsx:272 | P2 |
| S3 | 搜索建议浮层不是浮层：`suggestCard` 在普通文档流里（search/index.tsx:167-183），输入时把下方热搜/历史整体推下去，布局跳动——"很难看"的直接来源之一 | search/index.tsx:167 | P2 |
| S4 | iOS 26 上排序同时存在于 `Stack.Toolbar.Menu` 和 `SearchTypeTabs` 的排序行（results.tsx:238-252 + SearchTypeTabs.tsx:52-68），UI 重复 | results.tsx:238 | P2 |
| S5 | 分类切换缓存 `categoryCacheRef` 以 `displayResults` 为依赖的 effect 维护（SearchResultList.tsx:215-228），逻辑正确但 `useEffect` 依赖 `displayResults` 造成每次结果更新都跑一次缓存写入（含 scrollToOffset timer），可优化 | SearchResultList.tsx:206-228 | P2 |
| S6 | 关键词由 URL 参数同步（`searchBarRef.setText`，results.tsx:42-45），在结果页改词搜索后 URL 不变，返回再进入会回到旧词——预期内但不直观 | results.tsx:42 | P2 |

### 视频详情 video/[id]（含评论区，用户点名）

| # | 缺陷 | 位置 | 严重度 |
|---|------|------|--------|
| V1 | 返回后播放源不恢复（N1，P0） | use-video-playback.ts:243 | P0 |
| V2 | 进全屏被 blur 暂停竞态（N2） | use-focus-aware-player.ts:64 | P1 |
| V3 | 切 P 后评论排序/重试失效（N3） | use-video-comments.ts:421-445 | P1 |
| V4 | loadVideo 3 次重试耗尽后无错误 UI（见 2.3） | use-video-controller.ts:740-754 | P1 |
| V5 | **评论/回复输入框无键盘规避**：整个视频页没有 KeyboardAvoidingView；CommentSection 的主评论 TextInput 在 FlashList header、回复输入在行内（CommentSection.tsx:761,992,1058），键盘弹出会遮挡输入框且 FlashList 不会自动避让 → "评论区显示效果不全"的直接来源之一 | components/CommentSection.tsx、VideoScreenView.tsx | P1 |
| V6 | ReplyDetailSheet 底部输入框在 SwiftUI BottomSheet（NativeBottomSheet）内，同样无键盘规避，`medium` detent 下输入框大概率被键盘盖住 | components/ReplyDetailSheet.tsx:464-490 | P1 |
| V7 | CommentSection 在视频页未传 `oid/type` props，主体 oid 从 `replies[].oid` 推导（CommentSection.tsx:278-279）；评论为空/加载失败时 subjectOid=0 → 发评论提示"评论主体信息缺失" | VideoScreenView.tsx:350-374、CommentSection.tsx:278 | P2 |
| V8 | 评论文本按 `replyLengthLimit` 硬截断（numberOfLines），无"展开"入口，只能进楼中楼/长按——长评论"显示不全"的观感来源；楼中楼预加载只覆盖前 6 条可视评论（use-video-comments.ts:20），其余展开时才拉取，失败则静默（catch{}，:181,306）→ 少量评论会没有楼中楼预览也无任何提示 | CommentSection.tsx:933、use-video-comments.ts:181 | P2 |
| V9 | `renderReply` 的 useCallback 依赖 `replyText/replyImage/replyingTo/sendingReply`（CommentSection.tsx:705）——行内回复框每输入一个字符就重建整个 FlashList 的 renderItem 并重渲染所有可见行，输入卡顿 | CommentSection.tsx:674-706 | P2 |
| V10 | 评论行整行 `Press onPress={() => {}}`（CommentSection.tsx:910）：点评论无反应（Flutter 版点击进楼中楼详情），交互缺失 | CommentSection.tsx:910 | P2 |
| V11 | `s = useSettingsStore.getState()` 在 render 期读取（use-video-controller.ts:1129）：`replyLengthLimit` 等透传给评论区的设置变更后不触发重渲染（需下次渲染才生效） | use-video-controller.ts:1129 | P2 |
| V12 | 合集选集跳新视频用 push（use-video-controller.ts:1052）→ 栈随选集增长，且触发 N1/N2；Flutter 行为对齐但 RN 侧因共享播放器问题放大 | use-video-controller.ts:1049-1056 | P2 |

### 全屏 video/fullscreen

| # | 缺陷 | 位置 | 严重度 |
|---|------|------|--------|
| F1 | blur 暂停竞态（同 V2/N2） | use-focus-aware-player.ts:64 | P1 |
| F2 | `presentFullscreenAsync().catch(err => { if (!cancelled) throw error })`：在 catch 回调里 throw 产生无人处理的 rejected Promise → unhandled promise rejection（dev 红屏警告源之一） | app/video/fullscreen.tsx:243-249 | P2 |
| F3 | 全屏页 `gestureEnabled:false`（fullscreen.tsx:104,118）：iOS 边缘返回被禁，退出依赖顶栏按钮/下滑手势/播放结束自动退出；锁屏态下退出路径仅剩解锁后按钮——可接受但需知晓 | app/video/fullscreen.tsx:104 | P2 |
| F4 | 全屏内 `changeQuality` 成功后未把新 playUrl 写回 fullscreenState（use-fullscreen-player.ts:533-550），退出回详情页时详情页仍持旧清晰度 URL（writeFullscreenState 用 `base?.playUrl ?? playUrl` 保留旧值）→ 退出全屏后清晰度悄悄回退 | use-fullscreen-player.ts:221-247 | P2 |

### 评论详情 main_reply/[oid]

| # | 缺陷 | 位置 | 严重度 |
|---|------|------|--------|
| M1 | 不支持 `rootId` 定位（N5）——从通知进来无法滚动到目标评论 | main_reply/[oid]/index.tsx:92 | P1 |
| M2 | 点赞初始态错误地用 `up_action.like`（"UP 主觉得很赞"标记）映射 `action`（main_reply:127）→ UP 点赞过的评论会显示成"我已赞"，再点赞实际执行取消赞 | main_reply/[oid]/index.tsx:127 | P2 |
| M3 | 取消赞发送 `action: 2`（踩）而非 B 站撤销语义；`toggleLike` 失败回滚正确。低风险 | main_reply/[oid]/index.tsx:170 | P2 |
| M4 | `useScrollToTop(listRef)` 绑定 FlashList ref 类型 `any`——功能正常 | — | — |

### 动态详情 dynamics/[id]、发动态 dynamics/create

- 动态详情：删除动态成功后 `router.back()`（dynamics/[id].tsx:341）——正确。评论加载有 error 态。
- create：无 KeyboardAvoidingView，仅 `keyboardShouldPersistTaps`（dynamics/create.tsx:71-76），长文本编辑时键盘遮挡风险。P2。

### 直播 live/[roomId]

| # | 缺陷 | 位置 | 严重度 |
|---|------|------|--------|
| L1 | loadRoom 失败仅 console.error（live/[roomId].tsx:333），无错误态/重试，渲染空 info 页面 | live/[roomId].tsx:333 | P1 |
| L2 | 直播 also 使用 `PiliPlayer.shared`（与视频互踩，同 N1 家族）：从直播返回视频页，视频源不恢复 | app/live/[roomId].tsx | P1 |
| L3 | 弹幕 socket 错误仅 console.error（:77-78）——用户无感知弹幕断连 | use-live-socket.ts 回调 | P2 |

### PGC pgc/[id]

| # | 缺陷 | 位置 | 严重度 |
|---|------|------|--------|
| G1 | 加载失败仅"加载失败"文字，无重试按钮（pgc/[id].tsx:428-430） | pgc/[id].tsx:428 | P1 |
| G2 | 与视频共享单例播放器，返回视频页源不恢复（N1） | pgc/[id].tsx:436-442 | P1 |
| G3 | `parseInt(id)` 对 ep_id 深链（N4）返回错误内容 | pgc/[id].tsx:93 | P1 |

### 收藏夹 fav / fav/[fid]

- `fav/[fid]` 每次 focus 都 `refresh()`（fav/[fid].tsx:100-107）→ 从视频返回会整列表重新拉取，滚动位置可能因数据替换跳动，且重复请求。P2。
- playAll 用 `items.find(i=>i.bvid)` 有守卫（fav/[fid].tsx:125-129），later 有 `items.length===0` 守卫（later/index.tsx:148）——OK。

### 空间 member/[mid]

- 有 TabError + 重试（member/[mid].tsx 渲染段）——良好。
- `parseInt(mid)`：上游 push `/member/0`（H2）会得到 NaN，`memberInfo({mid: NaN})` 序列化后请求必然失败 → TabError。建议入口处拦截 mid<=0。P2。

### 通知 notifications

- 见 N4/N5/N6/N7。
- 首焦不刷新、再次聚焦刷新（notifications/index.tsx:241-253）——合理。

### 私信 whisper / whisper/[uid]

- 有 KeyboardAvoidingView（whisper/[uid].tsx:351）——OK。JSON.parse 均在 try 内。

### 下载 download / download/player

- download/player 复用共享播放器且卸载仅 pause（download/player/index.tsx:34-39）→ 返回 download 列表再进视频页会踩 N1。P1。

### 登录 login

- `completeLogin` 后 `canGoBack()?back():replace('/')`（login/index.tsx:159-160）——正确。登录页错误态完整。

---

## 四、屏幕生命周期问题汇总

1. **返回后列表位置**：tab 页（首页/动态）组件不卸载，位置保留 OK；`fav/[fid]`、`notifications` 聚焦即 refresh 会替换数据造成位置跳动（P2）。
2. **重复请求/闪烁**：`fav/[fid]` focus 刷新；首页切分类 `setVideos([])` 清空再拉（H3）；`usePagedList` 首次加载用 `setTimeout 0` 延迟，StrictMode 双挂载下有 clearTimeout 清理——OK。
3. **useFocusEffect 使用**：全部通过 `useCallback` 包裹，依赖基本正确；`use-video-controller.ts:310-337` 依赖 `[videoStarted]` 为有意设计（全屏返回桥接）。
4. **卸载清理**：各 hook 普遍有 cancelToken abort/定时器清理（use-paged-list.ts:131、use-video-comments.ts:92、CommentSection:312 等），质量较好。缺口：视频页卸载时未重置共享播放器源（N1 根因）。

---

## 五、崩溃隐患 TOP 清单

| # | 隐患 | 位置 | 说明 |
|---|------|------|------|
| C1 | `BigInt(NaN)` RangeError | utils/id-utils.ts:17 | 通知 subjectId / 任何 NaN aid 传入 av2bv 即抛；建议入口 `Number.isFinite` 校验 |
| C2 | expo-router push 未知路由抛异常且无 +not-found | notifications/index.tsx:81 等拼接路由 | 拼接型 href（`/pgc/${x}`、`/member/${x}`）缺空值守卫 |
| C3 | unhandled promise rejection：fullscreen present 失败 throw | app/video/fullscreen.tsx:247-249 | release 下 Hermes 记录不崩溃，但 dev 红屏；应 showToast 降级 |
| C4 | 共享播放器多屏争用导致的原生层状态不一致（两个 PiliPlayerView 同时 attach 同一 player：push 视频 B 时 A 未卸载） | VideoPlayerStage.tsx:181 + 共享单例 | 原生 AVPlayer layer 双附着行为未定义，偶发黑屏/画面错乱的风险源 |
| C5 | `as any` 共 158 处、非空断言 13 处（均有条件渲染守卫） | 全局 | 类型安全总体可控；`router.push(x as any)` 模式规避了 typed routes 校验，把路由拼写错误推迟到运行时——建议逐步收敛为 `Href` 类型化调用 |
| C6 | JSON.parse 全部在 try/catch 内（已逐一核对） | — | 无问题 |
| C7 | `useNativeVideoController` 在渲染期调用原生单例 setter（`PiliPlayer.shared.setLoop` 等，use-video-controller.ts:1253-1257；pgc 同样） | use-video-controller.ts:1253 | 渲染副作用，StrictMode/React Compiler 下重复执行；当前幂等无实害，建议移入 effect |

---

## 六、状态管理评估

- zustand 划分合理：auth / settings / player / tab-bar 四个 store 职责清晰；auth 多账号 + 匿名模式 + Keychain 迁移逻辑完整且有错误兜底；settings 快照 debounce 持久化 + SecureStore 分离 webdav 密码——质量好。
- **跨屏共享的真正问题是播放器**：播放态没有收敛到 store，而是靠 `PiliPlayer.shared` 原生单例 + `usePlayerStore.fullscreenState` 一次性桥接。fullscreenState 是"写一次-读一次-清空"的隐式协议（player.ts:67-70、use-video-controller.ts:310-337），任何路径绕过消费（如全屏页被系统杀掉、详情页先卸载）都会残留脏状态。建议把"当前播放源 + 归属屏幕"纳入 store，页面 focus 时按归属恢复源（同时解决 N1）。
- RootLayout 在 `authInit/settingsInit` 完成前即渲染（splash 先隐藏），首帧用默认设置、hydrate 后可能闪一次主题（_layout.tsx:46-67）。P2。
- 登录态切换后无全局导航重置：登出时若用户停留在 member/收藏夹深屏，页面靠响应式 isLoggedIn 降级（大多有登录按钮态），但栈中个人数据屏幕不会主动弹出。P2。

---

## 七、类型安全与代码质量

- eslint 仅 `eslint-config-expo` 默认集（eslint.config.js），无自定义规则；多个核心文件头部带 `eslint-disable react-hooks/exhaustive-deps`（use-video-controller.ts:1、use-video-comments.ts:1、use-video-playback.ts:1）——这些文件恰好是闭包陈旧 bug（N3）的高发区，建议对这三处逐个复核后移除 disable。
- 巨型组件：CommentSection.tsx 1170 行、use-video-controller.ts 1277 行、use-fullscreen-player.ts 674 行、ReplyDetailSheet.tsx 600 行。CommentSection 与 ReplyDetailSheet 之间"点赞/踩/删除/置顶/图片上传/发回复"逻辑几乎逐行重复（uploadPicked、pickImage、doDelete、doTop、openManage 同名同构），建议抽公共 hook。
- typedRoutes 已开启但被 `as any`（158 处）大量绕过。
- React Compiler 实验开启（app.json experiments）+ `'use no memo'`（use-video-playback.ts:45）局部豁免——注意编译器与手动 memo 的交互。

---

## 八、修复优先级建议

### 立即（P0/P1 核心链路）

1. **N1/V1 共享播放器源恢复**：在 store 记录"当前源属于哪个 bvid/cid"，视频页 focus 时若 player 当前源 ≠ 本页 playUrl 则重新 `replaceAsync` 并恢复进度；或退一步——视频页 push 视频页改用 `replace`。
2. **N2/F1 blur 暂停竞态**：`useFocusAwarePlayer` 的 pause-on-blur 对"目标是全屏页/新视频页"的 blur 做豁免（例如 push 前在 player store 打 `handoff` 标记，blur 时若标记存在则跳过 pause）。
3. **N3 评论闭包 bug**：`loadCommentsFor` 用 ref 读取 `commentsLoaded`（或改为函数式 setState 判定），移除对渲染期状态的闭包依赖。
4. **N4/N5/N6/N7 通知深链**：调整正则顺序（comment_root_id 分支前置）、ep 链接改走 ep_id 查询 season、空值拼接守卫、av2bv 入口 `Number.isFinite` 校验；main_reply 支持 rootId 滚动定位。
5. **全局错误态**：新增统一 `ErrorState`（图标+文案+重试）组件，接入首页、动态、历史、搜索结果、直播、PGC、视频 loadVideo 失败路径；api/client.ts 增加 code!==0 归一化抛错。
6. **V5/V6 键盘**：视频页评论区包 KeyboardAvoidingView（或 FlashList `keyboardShouldPersistTaps` + 输入行滚动到可见）；ReplyDetailSheet 输入框在键盘弹出时切 `large` detent 或同样避让。

### 短期（P2 体验）

7. +not-found 路由；拼接型 push 统一走带校验的辅助函数。
8. 搜索结果页错误/空态区分；建议浮层改绝对定位；iOS26 排序入口去重。
9. fav/[fid] focus 刷新改为参数变化才刷新；首页切分类保留旧数据直到新数据到达（先请求后替换）。
10. CommentSection 行内回复输入状态下沉到行组件，消除整列表重渲染；点击评论行打开楼中楼。
11. fullscreen 内切画质后回写 playUrl 到 fullscreenState。
12. member/*-tab.tsx 移出 app 目录。

### 长期

13. 播放态收敛进 store（源归属 + 进度），彻底替代 fullscreenState 一次性桥接协议。
14. 拆分 CommentSection/ReplyDetailSheet 公共逻辑；收敛 `as any` 路由调用；恢复 exhaustive-deps lint。
