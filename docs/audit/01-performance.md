# PiliPlus-RN 性能与内存深度审计报告（01-performance）

- 审计对象：`piliplus-RN`（Expo SDK ~57 / RN 0.86 / React 19.2 / expo-router / zustand / reanimated 4.5 / FlashList 2.0.2 / expo-image + 8 个自定义 Swift 原生模块）
- 审计方式：只读静态审计（源码逐文件走查 + grep 统计），未在真机运行 Instruments
- 审计日期：2026-08-13
- 用户目标：运行流畅、省电、**运行时总内存占用 < 100MB**

严重度定义：
- **P0**：直接影响核心目标（100MB 内存 / 播放流畅 / 耗电），必须优先修复
- **P1**：明显影响性能或内存，计划内尽快修复
- **P2**：优化空间 / 潜在风险，可排期

总体结论（先说结果）：该项目工程化程度很高，绝大多数常见的 RN 性能反模式（JS 线程动画、整 store 订阅热路径、未裁剪大图、FlatList、泄漏的 setInterval）**已经被规避**。剩余问题集中在：**播放器缓冲策略过激（默认 60s）、图片内存缓存上限过高（96MB）、弹幕条目三份驻留 + CATextLayer 隐式动画、5 秒一次的心跳上报**。修复 Top 10 后，<100MB 目标在"信息流浏览"场景可行，"1080p 播放 + 弹幕"场景需要配合降档措施才能稳定达标（详见第 1 节预算表）。

---

## 1. 内存预算评估

### 1.1 运行时内存大户盘点（按当前配置估算）

| 大户 | 位置 | 当前估算 | 说明 |
|---|---|---|---|
| RN 基础（Hermes JS 堆 + RN 原生视图层 + 8 个模块） | 全局 | 35~50MB | 90 屏 expo-router、react-native-screens 栈；Hermes 堆通常 20~35MB |
| AVPlayer 前向缓冲 | `modules/pili-player/ios/PiliPlayerSession.swift:185` + `src/stores/settings.ts:257` | **最高 ~45MB** | `bufferSec` 默认 **60s**；1080p qn=80 峰值码率 6Mbps（`src/utils/player-utils.ts:20`）→ 6Mbps×60s/8 ≈ 45MB |
| expo-image 内存缓存 | `src/app/_layout.tsx:20-23` | **最高 96MB** | `maxMemoryCost: 96MB, maxMemoryCount: 96`，显式设置的上限 |
| 弹幕条目（三份驻留） | `src/components/DanmakuOverlay.tsx:128,172-178,346`、`modules/pili-danmaku/ios/PiliDanmakuLoader.swift:11-17` | 5~15MB | 原生 loader 缓存（最多 8 个 cid × 6000 条 `[String:Any]`）+ JS state + 过桥回传原生 view |
| API URLCache（内存段） | `modules/pili-native-core/ios/PiliNetwork.swift:39-43` | 16MB | `memoryCapacity: 16MB` |
| FlashList 回收池 + 卡片纹理 | 各列表 | 10~20MB | 与同屏图片/文字层相关 |
| WebView（仅 3 个页面） | `src/app/webview/index.tsx` 等 | 打开时 +30~60MB | WKWebView WebContent 进程计入 footprint；不打开不占用 |
| 视频增强（默认关闭） | `modules/pili-video-enhance/` | 开启时 +10~30MB | VT 管线 + Metal 纹理；默认关闭 ✓ |

**典型场景估算（当前配置）**：
- 信息流浏览（不播放）：35~50（基础）+ 30~60（图片，逼近 96MB 上限前被 LRU）+ 16（URLCache）≈ **90~130MB**
- 1080p 播放 + 弹幕：基础 45 + 图片 40 + 缓冲 30~45 + 弹幕 10 + URLCache 16 ≈ **140~160MB**

**结论：<100MB 目标在当前默认配置下不可行；落实下述措施后"浏览场景"可行、"播放场景"紧张但可达标。**

### 1.2 内存类发现

**M1（P0）播放器前向缓冲默认 60 秒，是单一最大内存源**
- 证据：`src/stores/settings.ts:257`（`bufferSec: 60`）→ `src/hooks/use-video-controller.ts:1256` / `src/hooks/use-fullscreen-player.ts:670` / `src/app/pgc/[id].tsx:439` 调 `setBufferConfig` → `modules/pili-player/ios/PiliPlayerSession.swift:185,266-269`（`preferredForwardBufferDuration`）。
- 1080p（峰值 6Mbps，`src/utils/player-utils.ts:20`）60s 缓冲 ≈ 45MB；4K qn=127（25Mbps，`player-utils.ts:26`）时理论上更夸张。
- 修复：默认 `bufferSec` 降到 **15~20s**（B 站点播场景 seek 靠 CDN 即时拉流，60s 缓冲对体验收益很小）；蜂窝 / 低电量时 8~10s；设置页保留高档位给离线/弱网用户。直播分支已正确限到 ≤2s（`PiliPlayerSession.swift:280-294`）✓。
- 预期收益：播放场景直接省 **20~35MB**。

**M2（P1）expo-image 内存缓存上限 96MB/96 张过高**
- 证据：`src/app/_layout.tsx:20-23` `Image.configureCache({ maxMemoryCost: 96*1024*1024, maxMemoryCount: 96 })`。注释自述"96MB ≈ 滚动 3-4 屏封面量"。
- 封面已按 640×360（2x）CDN 缩放（`src/components/video/VideoCard.tsx:75-77`、`src/utils/image-url.ts`），单张解码约 0.9MB（640×360×4），96 张上限意味着缓存可长期驻留近 90MB。
- 修复：`maxMemoryCost` 降到 **32MB（约 32~40 张）**；首页已有 `prefetch` 预热下一屏（`src/components/home/HomeFeedList.tsx:116-130`），LRU 淘汰后回滚代价低。
- 预期收益：图片峰值占用 **-50MB**，滚动流畅度基本不受影响（CDN 命中 + disk 缓存）。

**M3（P1）弹幕数据三份驻留 + JS 过桥往返**
- 证据链：原生 `loadAndPrepareAsync` 产出最多 6000 条字典（`modules/pili-danmaku/ios/PiliDanmakuPreparer.swift:18,45-54`）→ 序列化回 JS 存 `useState`（`src/components/DanmakuOverlay.tsx:128,172-178`）→ 再经 `items` prop 序列化回原生 view（`DanmakuOverlay.tsx:346` → `modules/pili-danmaku/ios/PiliDanmakuModule.swift:141-143` → `PiliDanmakuOverlayView.swift:134-138`）。同时原生 loader 还保留 `rawCache`（8 个 cid × 最多 6000 条 `[String: Any]`，`PiliDanmakuLoader.swift:11-17`）。
- 影响：单视频弹幕 JS 堆 ~2~4MB + 原生 ~2~4MB + 过桥瞬时副本；切换 8 个视频后原生 rawCache 最坏 ~15MB。另外 6000 条 ×8 字段的 prop 序列化本身有 CPU 成本。
- 修复：`loadAndPrepareAsync` 返回 token/id，条目留在原生（loader 已有缓存），`PiliDanmakuOverlay` 只接收 token；`rawCache` 上限从 8 降到 2~3，`preparedCache` 同理（`cacheLimit = 8`，`PiliDanmakuLoader.swift:17`）。
- 预期收益：播放时 **-5~10MB**，切集/切视频 prop 提交更快。

**M4（P2）API URLCache 内存段 16MB**
- 证据：`modules/pili-native-core/ios/PiliNetwork.swift:39-43`。API JSON 响应 16MB 内存缓存偏大。
- 修复：`memoryCapacity` 降到 4~8MB（disk 段可保留）。收益 8~12MB。

**M5（P2）feed 数据数组无上限**
- 证据：`src/hooks/use-rcmd-feed.ts`、`src/hooks/use-dynamic-feed.ts` 的 `loadMore` 只做 append，无截断（对比直播弹幕有 `MAX_ITEMS = 50`，`src/components/live/LiveDanmakuList.tsx:28`）。
- 长时间无限滚动后 JS 侧 item 数组可达数千条（单条 ~300B，量级 MB 内，但 FlashList 的 keyIndex 映射与 diff 成本随之增长）。
- 修复：保留最近 ~400 条，删除最旧（注意保持 keyExtractor 稳定）。

**达标路线（组合拳）**：M1（-30MB）+ M2（-50MB 峰值）+ M3（-8MB）+ M4（-10MB）后，浏览场景 ≈ 55~80MB，播放场景（1080p）≈ 85~105MB；若蜂窝默认 qn=64（720p，峰值 2.5Mbps，`player-utils.ts:18`）则播放场景 ≈ 65~85MB。**<100MB 可行，但需要把上述默认值全部落地，并用 Instruments Allocations/VM Tracker 回归验证。**

---

## 2. 列表滚动性能

全站统计：FlashList 使用文件 **85 个**、`<FlashList>/<AnimatedFlashList>` 元素 **120 处**、`estimatedItemSize` **81 处**、`drawDistance` 全站统一 250（首页 400）、ScrollView 35 处（均为详情页/设置页，非热路径）。

**L1（P1）FlashList v2 下 v1 调优 props 疑似静默失效**
- 证据：`src/components/video/VideoCard.tsx:186-196` 自己用 `declare module` 给 FlashListProps 补了 `estimatedItemSize/windowSize/initialNumToRender/maxToRenderPerBatch`，注释明说"FlashList 2.0.2 的类型声明未包含…v1 风格调优 props，运行时由列表内部版本决定生效项"。而 FlashList v2 真实 API 用的是 `drawDistance` / `overrideProps`（如 `overrideProps={{ initialDrawBatchSize: 10 }}`，`src/app/history/index.tsx:291`、`src/app/(tabs)/dynamics.tsx:373`）。
- 影响：`HomeFeedList` 的 `windowSize={7} initialNumToRender={8} maxToRenderPerBatch={10}`（`src/components/home/HomeFeedList.tsx:220-222`）与 ~10 个页面的同类 props 大概率是**无效参数**，首屏批次/窗口控制实际由 v2 内部默认值决定。
- 修复：对照 `@shopify/flash-list@2.0.2` 源码确认 v2 支持的 prop 集合，把 v1 props 全部替换为 v2 等价配置（`drawDistance`、`overrideProps.initialDrawBatchSize` 等），删掉类型 augmentation。
- 预期收益：首屏渲染批次可控，避免 v2 默认窗口过大导致的首帧长尾。

**L2（P2）动态 feed 未传 getItemType，异构卡片共用回收池**
- 证据：`src/app/(tabs)/dynamics.tsx:366-374`（estimatedItemSize 160/220、masonry，均无 `getItemType`）。动态卡片形态差异极大（纯文字/多图/视频档案/直播/文章/投票）。
- 对比：做得对的示例 —— `src/components/home/HomeFeedList.tsx:169-172`、`src/app/rank/index.tsx:183`、`src/app/member_search/[mid]/index.tsx:241` 等 12 处已传 `getItemType`。
- 修复：按 `dynType` 返回类型编号。收益：回收复用命中率提升，减少异构 re-render。

**L3（P2）keyExtractor 含 index，刷新后 key 漂移**
- 证据：`src/app/history/index.tsx:277` `keyExtractor={(it, idx) => `${it.history.oid}-${idx}`}`；`src/components/search/SearchResultList.tsx:252` 同样拼 idx。
- 修复：用稳定 id（oid/bvid）；确需防重时拼 `oid-type`。收益：刷新/筛选时避免整列 unmount/remount。

**L4（信息项）热路径列表配置普遍良好**
- 首页：固定行高经 `overrideItemLayout` 精确给出（`HomeFeedList.tsx:179-203`）、`getItemType`、`drawDistance=400`、封面预取受低电量门控（`HomeFeedList.tsx:116-130`）、卡片 `memo`（`VideoCard.tsx:184`）。
- 评论：`estimatedItemSize=180` + `drawDistance=250` + 行级 `memo`（`src/components/CommentSection.tsx:801,805,837`），且整个 CommentSection 被 memo 与播放器 tick 解耦（`CommentSection.tsx:211-212`）。
- 直播弹幕列表上限 50 条（`LiveDanmakuList.tsx:28`）。
- 未发现 renderItem 内联匿名函数/对象导致的大面积重渲染（renderItem 均为 useCallback）。

---

## 3. React 重渲染（zustand / memo）

**R1（P2）设置页整 store 订阅（`const s = useSettingsStore()`）共 17 处**
- 证据：`src/app/settings/*.tsx`（network/appearance/extra/bar_set/danmaku/playback/… 共 15 处，如 `src/app/settings/video.tsx:115`）+ `src/components/PlayerSettingsSheet.tsx:89` + `src/components/SubtitleOverlay.tsx:39`。
- 评估：设置页是低频页面，无 selector 可接受；但 **SubtitleOverlay 挂载于播放中**，任意设置项变更都会使其整树重渲染（播放期间设置写入很少，风险低）。`PlayerSettingsSheet` 同理。
- 修复：SubtitleOverlay 改为按需 selector（它只读字幕 6 项，`SubtitleOverlay.tsx:39` 起）。

**R2（P2）`useAuthStore()` 无 selector 订阅约 29 处**
- 证据：`src/app/coin_log/index.tsx:29`、`src/app/history/index.tsx:101` 等（grep 结果 29 处），多为只取 `isLoggedIn`。
- 评估：auth store 仅登录/登出/切号时变更，实际重渲染频率≈0，属代码风格问题而非性能问题。
- 修复：统一改 `useAuthStore(s => s.isLoggedIn)`，一次性机械替换。

**R3（信息项）热路径订阅方式正确**
- player store 全部走细粒度 selector（`src/app/audio/[id]/index.tsx:30-32`、`src/hooks/use-fullscreen-player.ts:25`、`src/hooks/use-video-controller.ts:74`）；`syncProgress` 有 `progressSubscribers` 引用计数，无订阅者时不写 store（`src/stores/player.ts:26-27,96-106`）——这个设计很好。
- Glass/主题只订阅单字段（`src/components/Glass.tsx:79`）。
- 卡片链 VideoCard→GlassCard→DynamicCard、评论行、直播弹幕行全部 `memo`；`useThemeColors` 内部 useMemo（`src/components/SwiftUIHost.tsx:43-69`）。

**R4（P2）播放进度 2Hz 驱动的 JS 重渲染链**
- 证据：`modules/pili-player/src/index.tsx:191` 首个 timeUpdate 监听者出现时 `setTimeUpdateInterval(0.5)` → 原生 2Hz 事件 → `PlayerTimeProvider` setState（`src/components/video/PlayerTimeProvider.tsx:41-52`）→ `usePlayerTime` 消费者重渲染（`VideoProgressBar.tsx:80`、`CollapsedPlayerBar`）。进度条填充本身走 shared value + `withTiming(480ms)` UI 线程动画（`VideoProgressBar.tsx:128-131`），只有时间文本走 JS 重渲染。
- 评估：2Hz、消费者 2~3 个，开销可控；但**原生 `PiliPlayerProgressBar` 已实现却未被任何页面使用**（`modules/pili-player/src/index.tsx:525-536`，src/ 内 0 引用）。
- 修复：收起态/迷你播放条改用原生 `PiliPlayerProgressBar`；或把 timeUpdate 间隔放宽到 1s（seek 时再临时加密）。

**R5（P2）渲染期副作用**
- 证据：`src/hooks/use-video-controller.ts:1253-1256`、`use-fullscreen-player.ts:667-670` 在函数组件渲染体内直接调 `PiliPlayer.shared.setLoop/setMuted/setBufferConfig`。虽是幂等原生调用，但违反 React 渲染纯净性，StrictMode 双渲染下会执行两次。
- 修复：移入 useEffect（依赖 cfg 值）。

**R6（P2）模块级 ACCENT 快照**
- 证据：`src/components/SwiftUIHost.tsx:28` `export const ACCENT = useSettingsStore.getState().accentColor` —— 模块加载时快照，用户改主题色后所有引用 ACCENT 的静态样式不更新（功能性 bug，顺带一提）。

---

## 4. 动画性能

**A1（信息项）未发现 JS 线程动画**
- 全站 0 处 legacy `Animated.timing/spring/loop`（RN 自带 Animated API）；0 处 setInterval 驱动动画（全项目仅 `PlayerSettingsSheet` 曾有 setInterval，已改为原生事件驱动，`src/components/PlayerSettingsSheet.tsx:102` 注释）；滚动联动全部 `useAnimatedScrollHandler` worklet（`src/app/(tabs)/index.tsx:44-59`、`src/components/motion.tsx:190-203`）；按压缩放/入场/顶栏收起全部 shared value + spring（`motion.tsx:81-135`、`GlassCard.tsx:184-206`）。这一层做得很干净。

**A2（P0）弹幕 CATextLayer 每帧写 frame 未禁用隐式动画**
- 证据：`modules/pili-danmaku/ios/PiliDanmakuOverlayView.swift:402-458` `displayLinkTick` 每帧对每个活跃 layer 执行 `model.layer.frame = …`（436/440/444 行）与 `model.layer.opacity = …`。独立 CALayer（非 view backing layer）的 `position/bounds/opacity` 变更默认触发 0.25s 隐式动画，代码中没有 `CATransaction.setDisableActions(true)` 包裹。
- 影响：每条弹幕每帧生成 CAAnimation 对象 → CoreAnimation 提交风暴、CPU/内存抖动、弹幕视觉"拖影/迟滞"；弹幕密集时是播放页最大的隐性 CPU 消耗。
- 修复：tick 开头 `CATransaction.begin(); CATransaction.setDisableActions(true)`，结尾 commit；或在 `DanmakuLayerModel.init` 里 `layer.actions = [:]` 一次性禁用。更彻底：滚动弹幕用 `position` + 单次 `CABasicAnimation`（按 duration 线性位移）替代逐帧写，DisplayLink 只负责生成/回收与 seek 重置。
- 预期收益：播放页 CPU 明显下降（高弹幕密度场景收益最大），内存抖动消失。

**A3（P2）120Hz 全局解锁 + 弹幕 DisplayLink 跑满帧率**
- 证据：`app.json` infoPlist `CADisableMinimumFrameDurationOnPhone: true`；弹幕 DisplayLink 未设 `preferredFrameRateRange`（`PiliDanmakuOverlayView.swift:98-101`），ProMotion 机型上会以 120Hz tick，每帧开销翻倍；视频增强引擎则显式要求最高帧率（`PiliEnhancementEngine.swift:307-310`，功能需要，保留）。
- 修复：弹幕 link 设 `CAFrameRateRange(minimum: 24, maximum: 60, preferred: 60)`（弹幕 60fps 足够顺滑）。收益：ProMotion 机型播放时弹幕 CPU/GPU 约减半。

**A4（P2）BlurView / GlassView / MaskedView 使用克制，但有 2 个可优化点**
- 统计：`<BlurView>` 仅 2 处、`<GlassView>` 2 处、`<MaskedView>` 3 处。
  - `src/components/video/VideoOverlay.tsx:120-131`：MaskedView+BlurView(intensity 40) 仅在控制条显示时挂载（`controlsShown &&`）✓。
  - `src/components/video/VideoPlayerStage.tsx:215-217`：collapseBlur（intensity 28）**始终挂载**，展开态靠动画 opacity 到 0；UIVisualEffectView 在 alpha≈0 时仍参与合成。建议展开态条件卸载。
  - `src/components/GlassCard.tsx:110-124`：immersive 卡片"磨砂层"实为静态半透明色 + 渐变（无实时模糊）✓（注释 336-339 明确记录了"实时模糊是 compact 滚动卡顿主因"的降级决策）；卡片分类胶囊用系统级 GlassView，小面积 ✓（`GlassCard.tsx:91-103`）。
  - 首页搜索栏/分类栏走 iOS 26 Liquid Glass（`GlassSearchBar.tsx:208-212`），系统级优化，无逐帧重采样问题 ✓。
- 修复：仅 VideoPlayerStage collapseBlur 条件挂载一项。

---

## 5. 图片内存

**I1（信息项）缩略策略正确**
- 所有列表封面走 B 站 CDN 缩放：`biliCover(url, w, h)` 追加 `@w_h_1c_80q.webp`（`src/utils/image-url.ts`），首页封面 640×360（`VideoCard.tsx:75-77`）、双列 360 宽、头像 96×96（`GlassSearchBar.tsx:113`）、评论图 120×120（`CommentSection.tsx:1035`）、播放页占位封面 1280×720（`VideoPlayerStage.tsx:205`）。未发现列表直接解码原图。
- 列表图均设 `recyclingKey`（防回收残留）+ `cachePolicy="memory-disk"`（`GlassCard.tsx:252-253,331-332` 等）；封面不做 `transition` 淡入以省滚动期 GPU（`GlassCard.tsx:242-245` 注释）✓。
- 首页预取下一屏 24 张封面且受低电量/高温门控（`HomeFeedList.tsx:116-130`）✓。

**I2（P1）内存缓存上限过高** —— 同 M2（`src/app/_layout.tsx:20-23`），是图片侧唯一的实质问题。

**I3（P2）`biliCover` 每次渲染读 store**
- 证据：`src/utils/image-url.ts`（`biliCover` 内 `useSettingsStore.getState()`）。getState 开销极小，但在列表大量调用；质量值几乎不变。可缓存 picQuality 快照。

---

## 6. 内存泄漏（JS + Swift）

### JS 侧
**K1（信息项）清理基本完整**
- 原生事件监听均成对 remove：`src/hooks/use-live-socket.ts:156,173`、`PlayerTimeProvider.tsx:49`、`use-video-playback.ts:184-230`（timeUpdate/playingChange/statusChange 都在 effect cleanup）。
- AppState 监听有清理（`src/app/(tabs)/index.tsx:134-139`）；zustand `subscribe` 全部在 effect 返回 unsub（`use-video-controller.ts:1265-1270`、`src/utils/dynamic-polling.ts` 全局订阅在 `stop()` 中解除）。
- `usePagedList` 卸载时 abort 原生请求（`src/hooks/use-paged-list.ts:131-133`）、DanmakuOverlay 切 cid/卸载取消加载（`DanmakuOverlay.tsx:179-182`）✓。
- setTimeout 均存 ref 并在卸载清理（抽查 `use-rcmd-feed.ts:73-84`、`use-video-controller.ts:304-305`）✓。

### Swift 侧
**K2（信息项）生命周期管理总体规范**
- `PiliDanmakuOverlayView.deinit` 完整移除 NotificationCenter/KVO/Timer/DisplayLink（`PiliDanmakuOverlayView.swift:123-132`）；DisplayLink 用 weak proxy 避免 target 强引用环（`:54-64,96-101`）✓。
- `PiliPlayerSession` 为单例，其 5 处 addObserver 不移除属有意为之（`PiliPlayerSession.swift:125-153,711-743`）✓；timeObserver 在暂停/后台/重建时严格 remove（`:631-637,686-709`）✓。
- `PiliEnhancementEngine` 的 `CADisplayLink(target: self)` 存在引用环，但由 `detach()` 打破，且 view 的 deinit 会调 `engine.detach()`（`EnhancedVideoView.swift:56-57`、`PiliEnhancementEngine.swift:313-317`）✓。
- `PiliAudioModule`、`PiliSubtitleView`、`PiliLiveSocket`（deinit 关 task，`PiliLiveSocket.swift:57`）的 observer/timer 均配对清理。
- `PiliPowerMonitor.deinit` removeObserver(self)（`PiliPowerMonitor.swift:42-43`）✓。

**K3（P2）`PiliFullscreenController` 音量 HUD timer 与 `PiliPlayerSession` screenshot output**
- `PiliFullscreenController.swift:325,363` 的 30s  repeating timer 与 HUD timer 均在对应流程 invalidate（`:356`）✓；`PiliPlayerSession` 的 `AVPlayerItemVideoOutput`（截图用）在 item 切换时置空（`:520-521`）✓。此条为确认项，无泄漏。

**真正的泄漏风险点只有 A2 附带的 CAAnimation 对象风暴（非泄漏但效果类似）与 M3 的原生缓存驻留。**

---

## 7. Swift 原生模块性能

**S1（P0）pili-danmaku 渲染** —— 即 A2（隐式动画）+ 下述池化问题。
**S2（P2）CATextLayer 无池化，每条弹幕新建/销毁**
- 证据：`PiliDanmakuOverlayView.swift:352-367` spawn 时 new `DanmakuLayerModel`（含 CATextLayer + 光栅化文字），`:448-455` 完成后 `removeFromSuperlayer` 丢弃。maxLayerCount 上限 40（`:392-394`）。
- 评估：弹幕生成频率（每秒几条）下分配成本可接受，但高峰期（名场面）会有分配/光栅化抖动。
- 修复：建 40 个 CATextLayer 的对象池复用，仅重设 string/frame；文字测宽 `measureTextWidth`（`:396-400`）可对相同文本做缓存。

**S3（P1）pili-player 缓冲策略** —— 即 M1。另：`automaticallyWaitsToMinimizeStalling = true`（VOD，`PiliPlayerSession.swift:282`）会让 AVPlayer 倾向攒更多缓冲，内存紧张机型可评估关闭；`audioTimePitchAlgorithm` 1x 用 timeDomain（`:244-247`）✓ 省 CPU；直播模式关 waits + 限 2s 缓冲（`:280-294`）✓。

**S4（P2）pili-video-enhance 成本**
- 默认全部关闭（`settings.ts:261-263`）✓。开启时：CADisplayLink 最高帧率拉帧（`PiliEnhancementEngine.swift:307-310`）+ VT 超分/插帧管线 + Metal 渲染，是整机最重的可选功能。已有热/电量降级（2s 质量巡检 timer `:771-778`、`lastThermalState`/`lowPowerMode` 参与决策）✓。
- 建议：UI 上明示耗电；thermal ≥ serious 时强制回 passthrough（代码已有降级框架，确认覆盖 sdrToHdr 的 EDR 路径即可）。

**S5（P2）pili-danmaku loader 缓存**
- 分段并发 4、上限 30 段（`PiliDanmakuLoader.swift:14-16`）合理；但 `rawCache`/`preparedCache` 各 8 条（`:17`）偏多，见 M3。

**S6（信息项）pili-live socket 设计良好**
- 原生 WebSocket + 消息 150ms 批处理（`PiliLiveModule.swift:36`，`PiliLiveSocket.swift:506-514`）避免逐条过桥；心跳 30s（`src/app/live/[roomId].tsx:435`）合理；重连/世代号、weak self 完整。

---

## 8. 省电

**B1（P0）播放心跳每 5 秒一次 HTTP 上报，且两个 hook 各写一份**
- 证据：`src/hooks/use-video-playback.ts:188-205`（`e.currentTime - lastHeartbeatRef.current >= 5` → `videoApi.heartbeat` POST）与 `src/hooks/use-fullscreen-player.ts:172-190` 相同逻辑。播放期间每 5s 一次网络请求（蜂窝下持续唤醒无线电）。
- 修复：间隔提到 **15s**（B 站 web 端 heartbeat 同量级）；暂停/退出时补一次收尾上报；两份实现收敛为一个 util。若必须 5s，把定时器移到原生（pili-native-core 已有 PiliPollingTimer 基建），避免 JS 线程唤醒。
- 预期收益：播放 1 小时少 ~480 次请求，蜂窝待机/流量显著改善。

**B2（信息项）动态轮询链路规范**
- 前台轮询走原生 DispatchSourceTimer（utility QoS + 50ms leeway + in-flight 合并，`modules/pili-native-core/ios/PiliPollingTimer.swift:8,58,66-67`）；默认 5 分钟（`settings.ts:357`），低电量/高温自动 ×2（`src/utils/dynamic-polling.ts` `effectivePeriodMinutes`）；退后台即停、改由 BGAppRefreshTask（`PiliBackgroundTask.swift:68-69` 有 earliestBeginDate）✓；登录态/匿名模式联动注销（`dynamic-polling.ts` authUnsub）✓。

**B3（信息项）其他耗电点受控**
- 电源状态为原生事件推送（`src/utils/power-state.ts` addPowerStateListener），无轮询 ✓。
- 屏幕常亮仅"前台 + 播放中 + 非纯音频"（`PiliPlayerSession.swift:677-684`）✓；后台音频为系统 audio mode（`app.json` UIBackgroundModes）✓。
- 未使用定位；旋转走原生 fullscreen controller（`PiliFullscreenController.swift:187,392-406`），无持续传感器监听。
- （P2）`enableHttp2` 默认 false（`settings.ts:369`）：开启可减少并发连接数与 TLS 握手耗电（需配合服务端验证）。

---

## 9. 启动性能

**T1（信息项）启动链路已优化**
- splash 首帧即隐藏，auth/settings 初始化异步并行（`src/app/_layout.tsx:46-54`）；网络监听/buvid/动态轮询延后到首帧后（`:72-79`）✓。
- 设置持久化为整表快照 + 150ms debounce（`src/stores/settings.ts:430-438`），避免滑杆逐 key 写放大 ✓；启动读取为单次原生快照（`settings.ts:443-461`）✓。
- 首页冷启动有原生推荐缓存秒开（`getRecommendCache`，`src/hooks/use-rcmd-feed.ts:13`，限 50 条）✓。
- expo-router 文件路由按屏拆分模块；8 个原生模块均为轻量桥接，无启动期重活。

**T2（P2）可再压榨的点**
- `settings.init()` 中 AsyncStorage 迁移兜底路径（`settings.ts:462-498`）在新用户首启仍会跑一遍 getKeysByPrefix，可加"已迁移"标记短路。
- 建议用 Instruments App Launch 验证：`Image.configureCache` 两次调用（`_layout.tsx:20` 与 `:64`）可合并为一次。

---

## 10. RN vs Swift 分工建议

| 模块/职责 | 现状 | 建议 | 理由 |
|---|---|---|---|
| 视频播放（AVPlayer/缓冲/seek/截图） | Swift（pili-player） | **保持原生** ✓ | 单例共享 AVPlayer、音频/全屏复用同一 player（`PiliAudioModule.swift:233-276`），零 RN 替代方案 |
| 弹幕渲染与调度 | Swift（CADisplayLink+CATextLayer） | **保持原生**，修复 A2/S2 | 每帧 40 layer 的调度在 JS 线程不可行；当前架构正确，只差隐式动画与池化 |
| 字幕渲染 | Swift（PiliSubtitleView） | 保持原生 ✓ | 0.25s 原生 timer，门控完善 |
| 播放进度条（迷你/收起态） | JS 2Hz 重渲染（VideoProgressBar） | **收起态改用原生 `PiliPlayerProgressBar`**（已实现未使用，`modules/pili-player/src/index.tsx:525-536`） | 省 2Hz JS 唤醒与重渲染 |
| 播放心跳上报 | JS 5s 定时器 | **移入原生**（PiliPollingTimer）或至少 15s | 省 JS 线程唤醒与无线电开销 |
| 动态轮询/后台检查 | 已原生（PiliPollingTimer/BGTask） | 保持 ✓ | 已是最佳实践 |
| 网络层（签名/请求/缓存/取消） | 原生（PiliNetwork/PiliSigner） | 保持 ✓ | WBI 签名与请求取消都在原生，JS 零序列化开销 |
| 列表/Feed/评论 UI | RN FlashList | **保持 RN** | FlashList v2 + 现有 memo 体系足够；配置问题见 L1~L3 |
| 玻璃材质 UI | expo-glass-effect（系统 GlassView） | 保持 ✓ | 系统级渲染，比自绘 blur 省电 |
| 视频增强（超分/插帧/SDR→HDR） | Swift（VT+Metal） | 保持原生、保持默认关闭 ✓ | RN 无替代 |
| WebView/登录/下载/投屏 | 原生模块 | 保持 ✓ | — |

---

## Top 10 行动清单（按优先级）

| # | 严重度 | 问题 | 位置 | 预期收益 |
|---|---|---|---|---|
| 1 | P0 | 弹幕 CATextLayer 每帧写 frame 未禁隐式动画 | `PiliDanmakuOverlayView.swift:402-458` | 播放页 CPU/内存抖动大幅下降 |
| 2 | P0 | `bufferSec` 默认 60s | `settings.ts:257` | 播放内存 -20~35MB |
| 3 | P0 | 心跳 5s/次 ×2 份实现 | `use-video-playback.ts:192`、`use-fullscreen-player.ts:176` | 省电/省流量显著 |
| 4 | P1 | expo-image 内存缓存 96MB | `_layout.tsx:20-23` | 图片峰值 -50MB |
| 5 | P1 | FlashList v1 props 在 v2 下疑似失效 | `VideoCard.tsx:186-196` 等 | 首屏批次控制生效 |
| 6 | P1 | 弹幕条目三份驻留 + 8 cid 原生缓存 | `DanmakuOverlay.tsx:128,346`、`PiliDanmakuLoader.swift:11-17` | -5~15MB + 过桥提速 |
| 7 | P2 | 弹幕 DisplayLink 跑 120Hz | `PiliDanmakuOverlayView.swift:98-101` + app.json | ProMotion 弹幕功耗减半 |
| 8 | P2 | CATextLayer 无池化 | `PiliDanmakuOverlayView.swift:352-367` | 弹幕高峰分配抖动消失 |
| 9 | P2 | URLCache 内存 16MB / collapseBlur 常驻 | `PiliNetwork.swift:39-43`、`VideoPlayerStage.tsx:215-217` | -10MB / GPU 合成减负 |
| 10 | P2 | 动态列表无 getItemType、history key 含 idx、feed 无上限 | `(tabs)/dynamics.tsx:366`、`history/index.tsx:277` | 滚动复用率与长会话稳定性 |

**<100MB 可行性结论**：完成 #2、#4、#6 及 M4/M5 后，浏览场景约 55~80MB（可行）；1080p 播放+弹幕场景约 85~105MB（临界，蜂窝默认 720p 时 65~85MB 可行）。建议以 Instruments（Allocations + VM Tracker + Memory Graph）在 iPhone 12/13（4GB RAM）上对"冷启动→刷首页 5 分钟→播放 1080p 视频 10 分钟→退出"全链路回归验证，并把 100MB 设为 CI 软阈值。
