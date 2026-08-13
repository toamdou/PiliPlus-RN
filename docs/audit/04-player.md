# 04 · 视频播放器深度审计报告（iOS / RN）

审计对象：`piliplus-RN` 视频播放器链路
审计范围：`modules/pili-player`、`modules/pili-danmaku`、`modules/pili-video-enhance`、`modules/pili-dlna`、`modules/pili-live`、`src/app/video/*`、`src/app/live/[roomId].tsx`、`src/app/pgc/[id].tsx`、`src/components/video/*`、`src/hooks/use-video-*.ts`、`src/hooks/use-fullscreen-player.ts`
对照基准：Flutter 原版 `PiliPlus/lib/plugin/pl_player`、`lib/pages/video`
审计方式：只读代码审计（file:line 均相对仓库根 `piliplus-RN/`，Flutter 引用标注 `PiliPlus/`）

---

## 0. 结论速览（用户报告 bug → 一句话根因）

| # | 报告 bug | 一句话根因 |
|---|---|---|
| B1 | 全屏无法正常显示 | App 在 `app.json:7` 锁死 portrait，`expo-screen-orientation` 装了但 0 处调用；原生全屏 VC 的旋转代码在 `viewWillAppear`（此时 `view.window == nil`）执行导致 iOS16+ 的 `requestGeometryUpdate` 分支永远跳过——全屏永远停留在竖屏，旋转从未生效 |
| B2 | 叠加层按钮过大 | 按钮本身尺寸正常（图标 19-22pt / 触点 40x40）；真实原因是 B1 全屏没旋转，视频被 contain 压成一小条，而控制层按整屏铺排，视觉上按钮相对视频严重 oversized（详见 B1/B3 同根因链） |
| B3 | 播放器窗口过小 | 同 B1（全屏竖屏 letterbox）；详情页另叠加竖屏视频高度上限 `max(0.65*屏高, 屏宽)` 且 `enableVerticalExpand` 默认 false、无画面填充模式切换（`videoGravity` 全部写死 `contain`） |
| B4 | 不能灵活适应宽高比 | 原生支持 contain/cover/fill 三档 gravity，但 TS 侧所有使用点写死 `"contain"`，UI 上没有任何画面比例/填充模式入口；全屏不支持竖屏视频竖屏全屏（mode 0 强制 landscapeLeft） |
| B5 | 评论区显示不全 | 播放器高度 = f(评论滚动偏移) 且播放器处于正常文档流（`use-video-controller.ts:282-287` + `VideoScreenView.tsx:166-380`）：滚动 1px 播放器缩 1px，列表视口同时上移+变高 → 内容双倍速滚动 + FlashList 视口逐帧变化出现空白/欠渲染 |
| B6 | 弹幕相关问题 | 多个：XML mode 2/3 滚动弹幕被丢弃、滚动弹幕时长=固定值与文字长度无关、播放器高度动画/收起触发 `setHeight→resetScheduler` 清空全部在屏弹幕、全屏下滑手势与原生亮度/音量手势双系统冲突 |

其他高危发现 TOP：
1. **PGC（番剧）播放有画无声**：`pgc/[id].tsx:69` 用 `fnval: 4048`（DASH）取流，但 `getBestPlayUrl`（`src/utils/player-utils.ts:119-138`）只挑 video 流，AVPlayer 播分离 DASH 无音频。
2. **DLNA 投屏无播放权交接**：投屏成功不暂停本机播放（`src/app/dlna/index.tsx:65-85`），声音双出。
3. **全屏手势双系统冲突**：原生 window 级 pan（亮度/音量）与 RN verticalPan（下滑退出全屏）同时识别，默认 `enableSlideFS=true` + `enableSlideVolumeBrightness=true` → 调亮度/音量时可能直接退出全屏。
4. **直播参数污染共享会话**：`setLiveMode(true)/setBufferConfig(0)/setLoop(true)` 退出直播间不复位，下一个非点播页（如下载播放页）沿用直播小缓冲策略导致卡顿。
5. **AVPlayerItem 从不清理**：TS `replaceAsync(null)` 被早退拦截（`modules/pili-player/src/index.tsx:221`），页面卸载仅 pause，最后一帧解码器/缓冲常驻。

---

## 1. 架构总览

```
┌────────────────────────── JS / RN ──────────────────────────┐
│ /video/[id] 详情页                    /video/fullscreen 全屏页 │
│  useNativeVideoController              useNativeFullscreenPlayer│
│   └ useVideoPlayback(手势/进度/状态)     └ 独立的一套手势/控制层   │
│  VideoScreenView                      FullscreenTopBar/Controls │
│   └ VideoPlayerStage                   └ PiliPlayerView(contain)│
│      └ PiliPlayerView(contain 写死)                            │
│      └ TimeAwareDanmakuOverlay / SubtitleOverlay               │
└──────────────┬───────────────────────────────┬───────────────┘
               │ expo-modules 桥                │
┌──────────────▼───────────────────────────────▼───────────────┐
│ PiliPlayerSession（全局单例 AVPlayer，唯一播放会话）             │
│  ├ PiliPlayerView（ExpoView，AVPlayerLayer 容器，gravity 可配） │
│  ├ PiliFullscreenPresenter → PiliFullscreenController          │
│  │   （透明 overFullScreen 模态：电池/时钟 HUD + window pan 手势）│
│  ├ PiliDanmakuClockBridge → 弹幕/字幕视图绑定同一 AVPlayer 时钟 │
│  └ enterAudioOnly（听视频，保存/恢复 videoItem）                 │
└───────────────────────────────────────────────────────────────┘
```

关键架构事实：
- **全屏 = RN 路由页 + 原生透明模态叠加**：`/video/fullscreen` 路由渲染全部 UI，原生 `PiliFullscreenController` 只是盖在上面的透明 passthrough VC（`PiliFullscreenController.swift:7-12,134,142-146`），负责状态栏隐藏、电池/时钟标签、window 级亮度/音量 pan。
- **单一共享 AVPlayer**：详情页、全屏页、直播页、下载播放页、听视频全部复用 `PiliPlayerSession.shared`（`PiliPlayerSession.swift:61-64`）。
- **弹幕/字幕为原生 CADisplayLink/Timer 渲染，时钟直接取 AVPlayer item timebase**（`PiliDanmakuOverlayView.swift:215-235`），与播放严格同步，这是本实现质量最高的部分。

---

## 2. 报告 bug 逐项根因与修复

### B1 全屏无法正常显示（P0）

**现象**：点全屏后画面不旋转、不铺满，全屏"看起来没生效"。

**根因链（三重叠加）**：

1. **应用级方向锁死**：`app.json:7` `"orientation": "portrait"`，prebuild 生成的 Info.plist 只含 portrait；`package.json` 依赖里有 `expo-screen-orientation` 但全仓库 0 处调用（grep 验证），也没有在 plugins 中启用其 config plugin。→ 无论 VC 返回什么 `supportedInterfaceOrientations`，系统交集永远是 portrait。
2. **原生旋转代码时机错误**：`PiliFullscreenController.swift:154-160` 在 `viewWillAppear` 调 `applyOrientation()`；`applyOrientation`（`:391-400`）里 iOS16+ 分支要求 `view.window?.windowScene`，而 `viewWillAppear` 时 view 尚未进 window → `scene == nil` → `requestGeometryUpdate` 永不执行；只剩 `UIDevice.current.setValue(orientation.rawValue, forKey: "orientation")`（`:398`）这一 iOS16+ 上不可靠的 KVC 老 hack。退出时 `restorePortraitOrientation()`（`:402-408`）在 `viewWillDisappear` 调用，同样拿不到 window。
3. **透明模态架构放大问题**：`PiliFullscreenController` 是 `.overFullScreen` + clear + hitTest passthrough（`PiliFullscreenController.swift:7-12,134,142-146`），本身不承载视频画面；"全屏"完全依赖底下的 RN 路由页布局。旋转不生效 → RN 页按竖屏尺寸布局 → `PiliPlayerView`（absoluteFill + contain）把 16:9 视频压成竖屏中央一条小窗。

次要问题：
- `present()` 的已呈现短路（`PiliFullscreenController.swift:32-36`）在重复进入时直接返回 true，不应用新 options。
- `fullscreen.tsx:247-249` 的 `.catch((error) => { if (!cancelled) throw error; })` 在 effect 内 re-throw，`topViewController()` 为空时（`PiliFullscreenController.swift:38-45`）变成未处理的 Promise rejection。
- 原生 HUD（电池/时间，`PiliFullscreenController.swift:271-290`）与 RN `FullscreenTopBar`（`FullscreenTopBar.tsx:69-82` 的 onlineCount+BatteryLabel）重复绘制在顶部。
- 设置语义：`FULLSCREEN_MODES`（`src/app/settings/playback.tsx:17-21`）2="不改变方向"，但原生 `fullScreenMode == 2 || autoRotate → .allButUpsideDown`（`PiliFullscreenController.swift:191-192`）反而允许全方向旋转，语义相反。

**修复方案**：

方案 A（推荐，改动最小、行为对齐 Flutter）：
1. `app.json` 增加 expo-screen-orientation 插件并允许动态方向；进入全屏路由时：
```ts
import * as ScreenOrientation from 'expo-screen-orientation';
// enterFullscreen 时（按 fullScreenMode/视频方向决定）
await ScreenOrientation.lockAsync(
  fullScreenMode === 1 ? ScreenOrientation.OrientationLock.PORTRAIT_UP
  : fullScreenMode === 0 ? ScreenOrientation.OrientationLock.LANDSCAPE
  : ScreenOrientation.OrientationLock.DEFAULT /* 不改变 */
);
// 退出全屏时
await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
```
2. 原生 `PiliFullscreenController` 只保留状态栏隐藏与 HUD，旋转交给 expo-screen-orientation；或把 `applyOrientation()` 从 `viewWillAppear` 挪到 `viewDidAppear`（此时 `view.window` 非空），并给 `requestGeometryUpdate` 补错误处理。
3. 竖屏视频（`videoAspect < 1`）+ `fullScreenMode === 0`（对齐 Flutter `FullScreenMode.auto`，`PiliPlus/lib/plugin/pl_player/models/fullscreen_mode.dart`）时锁 PORTRAIT，实现竖屏全屏。

方案 B（彻底）：放弃"RN 路由页 + 透明模态"双层结构，全屏 UI 全部原生承载（present 一个真正的黑色全屏 VC，内含 AVPlayerLayer + RN 控制层 Host），旋转/状态栏/安全区都由该 VC 正常管理。工作量大，但消除 passthrough hitTest、双 HUD、z-order 等一整类问题。

---

### B2 叠加层（控制层）按钮过大（P1，B1 的衍生症状）

**现象**：全屏/控制层按钮相对视频显得巨大。

**根因**：控制层按钮本身是合理尺寸——`VideoOverlay.tsx:148-165,222`（图标 19-20、`controlBtn padding 10`）、`FullscreenControls.tsx:161-178,259`（图标 19-22）、`FullscreenTopBar.tsx:65-67,142-150`（40x40 返回钮）、`GlassCircle.tsx:28-36`（40x40）。问题在于 B1 导致视频只占竖屏中间一小条，而 `bottomLayer`（`FullscreenControls.tsx:218-231`）与 `topLayer`（`FullscreenTopBar.tsx:114-120`）按整屏 absolute 铺排 + `paddingBottom: Math.max(insets.bottom, 10)`（`FullscreenControls.tsx:134`），按钮相对视频窗口的比例严重失调。横屏旋转修复后此症状自然消失。

独立小问题：全屏时原生 HUD（宽 72pt、图标字号 20，`PiliFullscreenController.swift:292-315`）图标只是字母 "B"/"V"（`:246,249`），粗糙且与 RN 侧 `gestureHud`（`VideoPlayerStage.tsx:227-238`，详情页用）风格分裂。

**修复**：先修 B1；随后把亮度/音量 HUD 统一到 RN 侧（详情页已有 `gestureHud` 组件），删除原生 HUD；全屏控制栏按横屏安全区（左右 inset）收窄内容宽度。

---

### B3 播放器窗口过小（P0/P1）

**现象**：视频画面比预期小。

**根因**：
1. 全屏场景：同 B1（竖屏 contain letterbox）。
2. 详情页竖屏视频：`use-video-controller.ts:265-274`
   - `minVideoHeight = winW*9/16`、`maxVideoHeight = max(max(winH,winW)*0.65, min(winH,winW))`（对齐 Flutter 公式）；
   - `enableVerticalExpand` 默认 **false**（`src/stores/settings.ts:273`），竖屏视频只能拿到 ~65% 屏高，9:16 视频在 contain 下进一步缩到约 55% 屏高。
3. `videoGravity` 写死 `"contain"`：`VideoPlayerStage.tsx:184`、`fullscreen.tsx:147`、`LiveInfoPanel.tsx:79`、`download/player/index.tsx:70`——原生 `setVideoGravity` 明明支持 cover/fill（`PiliPlayerView.swift:33-44`），UI 无任何切换入口。
4. `videoAspect` 初始 16/9，依赖 `videoTrackChange`（`PiliPlayerSession.swift:595-617` → `use-video-controller.ts:340-349`）在流加载后才校正；`presentationSize` 未就绪前按 16:9 布局，首帧前后会有一次跳变（有 200ms 动画缓解，`:276-279`）。

**修复**：
- 修 B1 后全屏窗口即全屏。
- 详情页：`enableVerticalExpand` 默认改 true，或对竖屏视频默认启用（对齐 Flutter 竖屏全屏体验）。
- 在设置/更多菜单加"画面比例"项，把 `videoGravity` prop 暴露为 contain/cover/fill 三档（原生已就绪，仅 TS/UX 缺失）。
- 可选对齐 Flutter：`view` 接口的 `dimension` 字段在取流前就给出宽高（`PiliPlus/lib/pages/video/controller.dart:233-255`），提前定高，消除首帧跳变。

---

### B4 不能灵活适应不同视频宽高比（P1）

**现象**：16:9 / 4:3 / 21:9 / 竖屏视频显示效果都不理想，用户无法调整。

**根因**：
1. 无画面填充模式（见 B3-3）。Flutter 有 6 档 `VideoFitType`（contain/cover/hidden/fill/fitWidth/fitHeight，`PiliPlus/lib/plugin/pl_player/models/video_fit_type.dart`）+ 设置持久化 + 运行时切换（`PiliPlus/lib/plugin/pl_player/controller.dart:127,1226-1236`）。
2. 无全屏方向自适应：`PiliFullscreenController.swift:187-195` mode 0 恒返回 `.landscapeLeft`（竖屏视频也被迫横屏，左右大黑边 + 小窗）；Flutter `changeOrientation` 按 `isVertical` 在竖屏/横屏间切换（`PiliPlus/lib/plugin/pl_player/controller.dart:1369-1398`）。
3. 双指缩放只是 RN transform scale（`VideoPlayerStage.tsx:146-156`，0.75-2x），不改变 gravity、不持久、且放大后超出容器被 `overflow: hidden` 裁掉，不是真正的"填充/裁剪"切换。
4. 详情页高度公式本身正确支持 4:3/21:9（`winW/aspect` 在 min/max 之间），21:9 会被抬到 16:9 高度（黑边，合理）；主要短板在竖屏档与填充模式。

**修复**：
- 增加画面模式菜单（原生 gravity prop 直通即可）+ 双击画面循环切换 contain/cover（对齐 Flutter `doubleTapType`）。
- 全屏方向按视频方向决策（见 B1 方案 A 第 3 步）。
- pinch 改为在 contain/cover 两态间切换（或保留 scale 但持久化到 store）。

---

### B5 评论区显示效果不全（P1）

**现象**：评论区滚动异常、内容像被吞/显示不全。

**根因（滚动-布局双向耦合）**：
- `playerCollapseStyle`：`height = max(minH, baseHeightSV - scrollY)`（`use-video-controller.ts:282-287`），播放器容器 `playerWrap` 位于**正常文档流**、在 tab 内容之上（`VideoScreenView.tsx:166-173` 结构：stage → tabBar → tabContent flex:1）。
- 评论滚动处理 `handleCommentScroll`（`use-video-controller.ts:543-558`，经 `VideoScreenView.tsx:368` 传入）把滚动偏移 y 原样写回 `scrollYSV` → 播放器高度逐帧缩减 y → 评论列表视口同时**上移且变高**。净效果：手指滚 1px，内容相对屏幕上移 ~2px（双倍速）；FlashList（`CommentSection.tsx:784-793`，`estimatedItemSize` 静态、`maybeLoadMore` 依赖 onLayout 高度 `CommentSection.tsx:634-638,793`）视口逐帧变化 → 来不及渲染出现底部空白/裁切。
- 暂停态 0.6/0.4 滞回阈值触发 `playerCollapsed` 状态切换（`use-video-controller.ts:528-539,543-558`），`CollapsedPlayerBar` 绝对定位覆盖顶部（`VideoScreenView.tsx:265-280`），布局跳变进一步加剧"显示不全"观感。
- Flutter 用 `ExtendedNestedScrollView` 的 header slurp + 协同滚动（外层先消耗、内层后滚动），RN 侧没有等价机制，用"滚动偏移直接驱动上方布局高度"实现，必然互相打架。

**修复（三选一，按改动量排序）**：
1. 最小改动：滚动中只记录偏移，`onMomentumScrollEnd`/debounce 后再一次性动画收起播放器（避免逐帧 relayout）。
2. 中等：播放器改为 `position: absolute` sticky 顶层，评论/简介列表 `paddingTop = playerBaseHeight` 起步，收起动画只改播放器自身高度，列表视口恒定 → FlashList 不再抖动。
3. 完整对齐 Flutter：实现协同嵌套滚动（header 先收起再滚列表），可用 RNGH + 自定义 scroll handler 或原生 `UIScrollView` 嵌套。

---

### B6 弹幕相关问题（P1/P2 合集）

弹幕引擎本身质量较高：原生 CATextLayer + CADisplayLink，时钟直接取 `item.timebase`（`PiliDanmakuOverlayView.swift:215-235`），seek/倍速/暂停都正确；轨道分配、密度统计、点击菜单、屏蔽规则、分段拉取（6min/段，并发 4，`PiliDanmakuLoader.swift:14-17`）齐全。问题如下：

1. **弹幕丢失：XML mode 2/3 被丢弃**。protobuf 与 XML 解析都只保留 mode 1/4/5（`PiliDanmakuParser.swift:98-100,259-262`）。legacy XML 中 mode 2/3 同为滚动弹幕变体，被静默过滤；mode 6/7（逆向/高级）也不支持（Flutter 原版支持度更高）。
2. **滚动速度模型粗糙**：`duration = dmSpeed` 常量（`PiliDanmakuPreparer.swift:119-122`，默认 8s），所有滚动弹幕无论长短同屏耗时 → 短弹幕漂移慢、长弹幕快，且与 Flutter"按速度系数换算"不一致；倍速播放时弹幕速度随 media clock 变快（符合预期）。
3. **队头阻塞**：`spawnDueItems` 中轨道全忙时 `return` 直接退出整个生成循环（`PiliDanmakuOverlayView.swift:322-324,329-331,336-338`），该时刻后续所有待上屏弹幕全部等待，高密度段落会"卡弹幕"。
4. **播放器高度变化清空在屏弹幕**：`setHeight → resetScheduler`（`PiliDanmakuOverlayView.swift:158-162`）移除全部 layer。详情页弹幕高度 = `(playerBaseHeight - insets.top) * 0.6`（`VideoPlayerStage.tsx:193`）随宽高比变化/滚动收起逐帧变化 → 弹幕被反复清空。建议：高度变化时保留在屏弹幕、仅重排轨道，或对高度做防抖。
5. **全屏手势冲突**（同时属于手势问题）：原生 window pan（`PiliFullscreenController.swift:73-89,206-260`，`shouldRecognizeSimultaneouslyWith` 恒 true `:262-267`）与 RN `verticalPanGesture`（`use-fullscreen-player.ts:426-450`）并行识别。默认 `enableSlideVolumeBrightness=true`（`settings.ts:268`）+ `enableSlideFS=true`（`settings.ts:269`）：在全屏左/右 1/3 区竖滑，原生调亮度/音量的同时 RN 侧 `|dy|>8` 触发退出全屏。修复：全屏下滑动手势改为与原生 pan 同一套（二选一），或 RN pan 在亮度/音量区禁用 fs-slide。
6. **弹幕点击与播放器单击冲突**：`hitTest` 命中弹幕时返回 self（`PiliDanmakuOverlayView.swift:490-495`），但父级 RN gesture-handler 的手势识别器仍会收到触摸 → 点弹幕弹菜单的同时单击手势隐藏/显示控制层。建议弹幕命中时通过原生手势或 `cancelsTouchesInView` 抑制父级 tap。
7. 全屏弹幕高度 `winH * 0.6` 且无 `topInset`（`fullscreen.tsx:154-163`），保留安全区时顶部控制栏与弹幕区重叠（次要）。

---

## 3. 专项审计发现

### 3.1 视图架构（UIView 桥接 / frame / contentMode）

- `PiliPlayerView`（`PiliPlayerView.swift`）：ExpoView + 内嵌 `layerClass = AVPlayerLayer` 的容器，`layoutSubviews` 里 `frame = bounds`（`:24-27`），clipsToBounds、黑底、`isUserInteractionEnabled = false`（触摸全部交给 RN 手势层，设计正确）。`videoGravity` 三档映射齐全（`:33-44`）但从未被 UI 使用（见 B4）。
- TS 侧 `PiliPlayerView` 在 shared id 为空时降级为空 `<View>`（`modules/pili-player/src/index.tsx:493-507`）——正常分支 id 恒有值，但降级时静默黑屏无日志，排障困难。
- `PiliSeekThumbnailView`：`imageLayer.contentsScale = image?.ref.scale ?? UIScreen.main.scale`（`PiliSeekThumbnailView.swift:42`），而 `PiliSeekThumbnailImage` 由 `UIImage(cgImage:)` 构造（scale = 1.0）→ contentsScale=1 在 3x 屏上缩略图模糊。应改为 `UIScreen.main.scale`。
- `EnhancedVideoView`（超分/插帧/HDR 管线）自包含 passthrough/AVSampleBufferDisplayLayer/CAMetalLayer 三路渲染，contain 计算含 safeArea inset（`EnhancedVideoView.swift:163-200`），与播放器视图互斥挂载（`VideoPlayerStage.tsx:168-187`）——架构合理；注意增强开启时 pinch 缩放仍作用于外层包装视图（`VideoPlayerStage.tsx:169-178`），与 Metal 路径的 normalizedVideoRect 不联动（次要）。

### 3.2 全屏链路（present / 旋转 / 状态恢复 / 安全区 / 状态栏）

- 呈现方式：`top.present(controller, animated: true)`（`PiliFullscreenController.swift:48`），topViewController 取 keyWindow rootVC 的 presented 链（`:99-107`）。无可用 VC 时抛错（`:38-45`）。
- 状态栏：`prefersStatusBarHidden = true` + `modalPresentationCapturesStatusBarAppearance`（`:135,175-177`）正确。
- 安全区：`preferredScreenEdgesDeferringSystemGestures = [.bottom]`（`:179-181`）正确；RN 侧 `safePadding`（`use-fullscreen-player.ts:46-48`）+ `removeSafeArea` 设置可用。
- 状态恢复：退出全屏经 `writeFullscreenState()` 写回 zustand（`use-fullscreen-player.ts:221-247`），详情页 `useFocusEffect` 消费（`use-video-controller.ts:310-337`）恢复倍速/音量/弹幕/字幕/进度。可用但注意：`writeFullscreenState` 里 `currentTime: base?.currentTime ?? 0`（`:231`）用的是**进入全屏时**的 base 快照而非当前时间，真正的进度靠 `syncProgress` 另一条路径（`:257,273`）——双路径写进度，若 base 存在则 fullscreenState.currentTime 永远是旧值，阅读/维护风险高。
- 竞态：`exitFullscreen()` 先 `dismissFullscreen()`（异步 main dispatch）再 `router.back()`（`use-fullscreen-player.ts:259-260`），路由卸载 cleanup 又 dismiss 一次；快速进出全屏时 `present()` 的"已呈现短路"（`PiliFullscreenController.swift:32-36`）可能复用旧 VC 且不重装手势。
- 全屏页卸载 effect 无条件 `playerRef.current?.pause()`（`use-fullscreen-player.ts:289`）与 `enableAutoExit`（播完自动退出）等路径叠加时语义正确，但与详情页 `useFocusEffect` 的 `st.playing && videoStarted → play()`（`use-video-controller.ts:334-336`）依赖 store 写入顺序，属脆弱设计。

### 3.3 手势系统

- 详情页组合：`Race(longPress, seekPan(surface), verticalPan, Exclusive(doubleTap, singleTap))` + pinch（`use-video-controller.ts:487-492`、`VideoPlayerStage.tsx:164`）。分区合理：左 1/3 亮度、右 1/3 音量、中 1/3 上滑进全屏（`use-video-controller.ts:424-451`），单击显隐控制、双击左右快进/中间播放暂停（`use-video-playback.ts:424-431`）、长按倍速（`:439-447`）、表面横滑 seek（`use-scrub-bar.ts:106-155`，带边缘 24px 防误触）。
- 问题：
  1. 全屏双系统冲突（见 B6-5），最严重。
  2. `seekPanGesture` 与水平 tab pager、弹幕 tap 的优先级依赖 Race 顺序，横滑 seek 在评论/简介区无影响（pager 在播放器下方），OK。
  3. `verticalPanGesture` 的 `failOffsetX([-8,8])` 较严，斜向滑动容易失败（体验项）。
  4. 原生全屏 pan 用 `UIScreen.main.brightness` 与 **player.volume**（`PiliFullscreenController.swift:225,245-248`）——调的是播放器音量而非系统音量，与实体键语义不一致（Flutter 侧是系统音量），属行为差异。
- UIKit/RNGH 冲突总体可控：原生视图（弹幕）`isUserInteractionEnabled` 只在 interactive 时吃触摸；`PiliPlayerView` 自身不接收触摸。

### 3.4 播放状态机（播放/暂停/buffering/错误/seek/倍速/清晰度/字幕/记忆播放）

- 状态：`idle/loading/readyToPlay/error` 经 `statusChange` 事件（`PiliPlayerSession.swift:661-675`）；`playingChange` 由 `timeControlStatus` KVO 驱动（`:121-124,619-629`）——**buffering 没有独立状态**：卡顿（waitingToPlayAtSpecifiedRate）时 UI 只能看到 isPlaying=false，无法显示"缓冲中"（Flutter 有 buffering 态）。建议：`timeControlStatus == .waitingToPlayAtSpecifiedRate` 时发 buffering 事件。
- 错误重试：item failed / failedToPlayToEndTime 发 error 事件（`:584-592,729-742`），但 **RN 侧没有任何消费方自动重载**（详情页/全屏页都没订阅 error 做 retry），只有 loadVideo 的网络层 3 次指数退避（`use-video-controller.ts:740-753`）。播放中途 CDN 403/断流 = 黑屏无提示。建议：error → toast + 一键重载（reloadSource 已存在，接上即可）。
- seek：`pendingSeek` 在 item ready 前挂起（`:221-225,652-659`），零容差 seek（`:658`）；TS 侧 600ms seekGuard 防旧 timeUpdate 回跳（`use-video-playback.ts:187,342`）。正确。
- seek 缩略图：sprite 下载 + ImageIO 降采样 + 裁剪 + NSCache 三级缓存（`PiliSeekThumbnail.swift:45-166`），实现完整；仅详情页进度条使用（`VideoProgressBar.tsx:134-183`），**全屏页无 seek 预览缩略图**（`FullscreenControls.tsx` 未接入），对齐 Flutter 缺失。
- 倍速：`setRate` 同时写 `defaultRate`（iOS16+）与 `rate`，1x 用 `.timeDomain`、倍速用 `.spectral`（`PiliPlayerSession.swift:235-247`）——正确且省 CPU；长按加速（boost）在 JS 侧实现（`use-video-playback.ts:405-417`）。
- 清晰度切换：详情页 `changeQuality` 重新取流 setPlayUrl（`use-video-controller.ts:916-935`）；全屏页 `changeQuality`/`reloadSource` 直接 replaceAsync 后立即写 currentTime（`use-fullscreen-player.ts:533-561`）——依赖 pendingSeek 兜底，正确。但全屏 `applyReady` 在每次 readyToPlay 都重写 `playbackRate = initSpeed`、`volume = initVolume`（`use-fullscreen-player.ts:200-216`）→ **切换清晰度会把用户已调的倍速/音量重置回进入全屏时的值**。修复：`applyReady` 只在 `seekOnceRef` 首次生效时写倍速/音量。
- 多音轨/多清晰度 DASH：不支持（见 3.9 PGC 与 fnval 问题）。`enterAudioOnly` 只服务"听视频"（`PiliPlayerSession.swift:317-364`）。
- 字幕：原生 `PiliSubtitleView`（0.25s Timer + player.currentTime，`PiliSubtitleView.swift:137-155`），二分定位（`:254-273`），字号/描边/底距/背景透明度全可配，全屏拖拽底距（`use-fullscreen-player.ts:406-413`）。字幕数据经 JS 加载后以 prop 传入（`SubtitleOverlay.tsx:107-118`）。功能完整。
- 记忆播放：**无本地进度持久化**。仅依赖服务端历史（从历史页带 `t` 参数进入，`use-video-controller.ts:68,137,222-226`）与全屏↔详情页的 store 桥接。Flutter 有本地记忆播放，RN 缺失（见 3.9）。

### 3.5 弹幕（见 B6，此处补充）

- 时间同步：displayLink 每帧取 timebase 时间，偏差 < -0.2s 或 > 1.5s 触发 resetScheduler 重排（`PiliDanmakuOverlayView.swift:410-413`）——seek 后弹幕正确重置。
- 层级：弹幕视图是 RN 子视图，位于 PiliPlayerView 之上、控制层之下（`VideoPlayerStage.tsx:188-199`、`fullscreen.tsx:154-164`），层级正确。
- 全屏弹幕与详情页弹幕是两个实例（路由切换重新挂载），靠 `preparedCache`（`PiliDanmakuLoader.swift:30-33`）避免重复拉取——OK。
- `bindPlayer` 在每个弹幕/字幕视图 mount 时重复调用（`DanmakuOverlay.tsx:143-145`、`SubtitleOverlay.tsx:44-46`），ClockBridge 幂等处理（`PiliDanmakuModule.swift:33-70`）——OK。

### 3.6 画中画 / 后台播放 / DLNA 交接

- **PiP：未实现**。`PiliPlayerView.swift:12-13` 注释明确"当前未启用，待真机验收后另行接线"；无 `AVPictureInPictureController`、无 entitlement。
- 后台播放：两条路径——(a) `enableBackgroundPlay && continuePlayInBackground` 时后台自动切"听视频"（`use-video-controller.ts:843-856` → `enterAudioOnlyAsync`，`PiliPlayerSession.swift:317-344` 保存 videoItem、退出时原样恢复）；(b) 否则后台暂停、回前台恢复（`use-focus-aware-player.ts:98-123`）。`UIBackgroundModes: ["audio"]` 已配（`app.json:21`），锁屏控制/NowPlaying 由 pili-audio 承担。设计合理。
- 隐患：后台切音频依赖 JS AppState 回调 + 一次网络请求（取音频流），系统给 JS 的后台窗口有限，切换可能失败且无降级（直接静音暂停）。
- **DLNA 交接缺失**：`src/app/dlna/index.tsx:65-85` 投屏只调 `dlnaSetUrl + dlnaPlay`，**不暂停 `PiliPlayer.shared`**（本机继续出声）；停止投屏（`:87-97`）也不恢复本机播放、不回填进度。Flutter 原版投屏时暂停本机。修复：cast 成功 → `player.pause()` + 记录进度；stop → 可选续播。
- AirPlay：`player.allowsExternalPlayback = true`（`PiliPlayerSession.swift:116`）但无 AVRoutePickerView 入口（`PiliPlayerView.swift:10-11` 注释承认），用户无法主动发起 AirPlay。

### 3.7 生命周期与内存

- KVO/observer 清理总体规范：`PiliPlayerSession` 的 item/presentationSize observation 在换源时 invalidate（`:517-543`）；弹幕/字幕视图 deinit 完整（`PiliDanmakuOverlayView.swift:123-132`、`PiliSubtitleView.swift:68-74`）；`PiliPlayerProgressView.deinit` 移除 timeObserver（`:43-48`）。
- **会话从不清理**：`PiliPlayerSession` 单例无 deactivate；页面卸载只 `player.pause()`（`use-video-controller.ts:618-620`），最后一个 `AVPlayerItem`（含解码器、最多 60s 前向缓冲 `bufferSec: 60`）常驻直到下次 load。且 TS `replaceAsync(null)` 被 `if (!source) return` 拦截（`modules/pili-player/src/index.tsx:221`）无法主动置空。修复：放开 null 源清理路径，详情页卸载（非后台音频保留场景）时 `replaceAsync(null)`。
- 截图用 `AVPlayerItemVideoOutput` 挂到 item 上直到换源才移除（`PiliPlayerSession.swift:456-467,520-521`），截图后立即 `item.remove(output)` 更佳（次要）。
- 全屏 VC：presenter 持 weak controller，dismiss 后自动释放；`hudTimer/clockTimer/batteryObservers` 在 disappear 清理（`PiliFullscreenController.swift:167-173`）——无明显泄漏。
- `PiliPlayer.shared` 在构造函数里调 `native.create()`（`index.tsx:177-178`），而 `useNativeVideoController`/`useNativeFullscreenPlayer` 在**渲染期**调 setLoop/setMuted/setBufferConfig/setLiveMode（`use-video-controller.ts:1252-1257`、`use-fullscreen-player.ts:666-672`）——渲染期副作用，React Compiler 下有重复执行风险，应移入 effect。

### 3.8 直播 vs 点播

- 直播复用同一 AVPlayer 会话，`setLiveMode(true)` 关闭 `automaticallyWaitsToMinimizeStalling`、限制 2s 小缓冲（`PiliPlayerSession.swift:280-294`）正确；`setLoop(true)`（`live/[roomId].tsx:111`）对直播无意义。
- **退出直播间不复位**：unmount 只 pause + releaseAudioPlayer（`live/[roomId].tsx:130-137`），`liveMode/bufferConfig/timeUpdateInterval(0)/loop` 残留。再进点播详情页会被 `useNativeVideoController`（`use-video-controller.ts:1252-1257`）复位，但**下载播放页**（`src/app/download/player/index.tsx`）不复位 → 沿用直播小缓冲策略，点播频繁卡顿。修复：直播页 unmount 时 `setLiveMode(false); setLoop(false); setTimeUpdateInterval(0.5)`。
- 直播无全屏（页面无全屏入口，`LiveInfoPanel` 固定 16:9 窗口 `LiveInfoPanel.tsx:216-217`）——Flutter 直播支持全屏，RN 缺失。
- 直播后台音频交接（startLiveAudio）路径完整（`live/[roomId].tsx:169-216`）。

### 3.9 取流管线（重大功能缺口）

- UGC：`fnval: 0`（`src/api/video.ts:50`）强制 durl（progressive MP4 合流），AVPlayer 可直播；代价是画质上限受 durl 限制（非 VIP 通常 ≤480p），高质量（1080P+/4K/杜比）实际拿不到。`getBestPlayUrl` 的 DASH 兜底**只取 video 流**（`player-utils.ts:131-136`，注释自认"仅视频流，无音频"）。
- **PGC**：`pgcPlayUrl` 默认 `fnval: 1`（`src/api/video.ts:81`），`pgc/[id].tsx:69` 更传 `fnval: 4048` → 返回纯 DASH → `getBestPlayUrl` 选出纯视频流 → **番剧有画无声**。这是当前最严重的功能性 bug 之一。
- 修复方向：引入双轨方案——(a) 继续 fnval=0 但登录态/VIP 参数拿高画质 durl；(b) 或原生侧支持 DASH：用 `AVPlayerItem(asset:)` 挂两条 `AVURLAsset`（video+audio）通过 `AVPlayerItemVideoOutput` 合成不可行，正确做法是自研 `AVAssetResourceLoaderDelegate` 代理合并，或引入轻量 LL-HLS/DASH 封装，或退一步用 `enterAudioOnly` 同款思路做 video/audio 双 player 时钟同步（复杂）。短期止血：PGC 也请求 fnval=0 的 durl（部分 PGC 支持），至少保证有声。

### 3.10 对照 Flutter 原版：RN 缺失能力清单

| 能力 | Flutter 原版 | RN 现状 |
|---|---|---|
| 全屏方向模式 auto/none/vertical/horizontal/ratio（`fullscreen_mode.dart`） | ✅ `changeOrientation` 按视频方向切横竖屏 | ❌ 锁死竖屏；mode 语义残缺（B1/B4） |
| 画面比例 6 档 VideoFitType + 双击切换 | ✅ | ❌ 写死 contain（B4） |
| DASH 音视频分离播放（media_kit/ffmpeg） | ✅ 高画质 + 多音轨 | ❌ fnval=0 durl 优先；DASH 兜底无声（3.9） |
| PGC 播放 | ✅ | ⚠️ 有画无声（3.9） |
| 画中画 PiP | ✅（桌面端） | ❌ 未实现（3.6） |
| 记忆播放（本地进度） | ✅ | ❌ 仅服务端历史 t 参数（3.4） |
| 全屏 seek 缩略图预览 | ✅ | ❌ 仅详情页（3.4） |
| 缓冲中 buffering UI 状态 | ✅ | ❌ 无独立状态（3.4） |
| 播放错误自动/手动重试 | ✅ | ❌ error 事件无消费方（3.4） |
| AirPlay 入口（AVRoutePickerView） | N/A | ❌ 只开了 allowsExternalPlayback（3.6） |
| 投屏暂停本机 | ✅ | ❌（3.6） |
| 直播全屏 | ✅ | ❌（3.8） |
| 弹幕 mode 2/3/6/7、高级弹幕 | 部分支持 | ❌ 仅 1/4/5（B6-1） |
| 滚动联动收起播放器 | ✅ 协同嵌套滚动 | ⚠️ 逐帧耦合实现，B5 副作用 |
| 双击/长按/亮度音量手势 | ✅ | ✅（全屏与原生冲突，B6-5） |
| SponsorBlock 跳过 | ✅ | ✅（boundary observer，`PiliPlayerSession.swift:545-576`） |
| 倍速/长按加速/截图/字幕/听视频 | ✅ | ✅ |

---

## 4. 架构改进建议（目标架构）

```
┌──────────────────────────── 建议 ────────────────────────────┐
│ 1. 旋转/方向：expo-screen-orientation 统一接管，进入/退出全屏   │
│    lock/unlock；原生全屏 VC 只做状态栏+HUD（或删除）。          │
│ 2. 全屏单一事实源：全屏状态（方向/锁屏/控制层显隐）收敛到一个     │
│    store，避免 fullscreenState 双路径回写。                     │
│ 3. 播放会话：放开 replaceAsync(null)；页面卸载即清 item；        │
│    增加 buffering/error 状态与错误重试 UI。                     │
│ 4. 画面模式：videoGravity prop 直通 UI（contain/cover/fill），  │
│    双击循环切换；竖屏视频竖屏全屏。                              │
│ 5. 布局解耦：播放器改 sticky/absolute，列表 paddingTop 起步，    │
│    消灭"滚动偏移驱动上方布局高度"的逐帧 relayout。               │
│ 6. 手势单一事实源：全屏亮度/音量/退出滑动统一走 RN gesture-handler│
│    （或统一走原生），废除 window 级 pan 与 RN pan 并存。          │
│ 7. 取流：PGC 止血 fnval=0；中期评估 DASH 音视频双轨方案。        │
└───────────────────────────────────────────────────────────────┘
```

## 5. 修复优先级清单

| 级别 | 事项 | 位置 |
|---|---|---|
| P0 | 全屏旋转修复（expo-screen-orientation + 移除/修正原生旋转时机） | `app.json:7`、`PiliFullscreenController.swift:154-160,391-408`、`fullscreen.tsx:240-254` |
| P0 | PGC 有声播放（fnval=0 止血） | `src/app/pgc/[id].tsx:69`、`src/api/video.ts:76-81` |
| P0 | 播放 error 事件接入重试 UI | `use-video-playback.ts`（新增订阅） |
| P1 | 评论/简介区与播放器高度解耦（B5 三方案之一） | `use-video-controller.ts:282-293,525-558`、`VideoScreenView.tsx:166-380` |
| P1 | 全屏手势冲突：RN 下滑退出 vs 原生亮度音量 | `use-fullscreen-player.ts:426-451`、`PiliFullscreenController.swift:206-260` |
| P1 | 画面模式切换 + 竖屏视频竖屏全屏 | `PiliPlayerView.swift:33-44`（已就绪）、TS 使用点、设置 UI |
| P1 | DLNA 投屏暂停本机/停投恢复 | `src/app/dlna/index.tsx:65-97` |
| P1 | 直播退出复位共享会话参数 | `src/app/live/[roomId].tsx:130-137` |
| P2 | 全屏切清晰度不重置倍速/音量 | `use-fullscreen-player.ts:200-216` |
| P2 | 弹幕：mode 2/3 支持、队头阻塞、setHeight 不清空 | `PiliDanmakuParser.swift:98-100,259-262`、`PiliDanmakuOverlayView.swift:158-162,322-338` |
| P2 | buffering 状态、记忆播放、全屏 seek 缩略图、AirPlay 入口、PiP | 新增 |
| P2 | replaceAsync(null) 放开 + 卸载清理 item | `index.tsx:220-227`、`use-video-controller.ts:584-629` |
| P3 | 缩略图 contentsScale、原生 HUD 与 RN TopBar 合并、渲染期副作用移入 effect | `PiliSeekThumbnailView.swift:42`、`FullscreenTopBar.tsx`、`use-video-controller.ts:1252-1257` |

---
审计人：ZCode 只读审计 · 2026-08-13
