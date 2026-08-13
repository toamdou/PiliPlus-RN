# PiliPlus-RN 专家团综合审计总报告（00 · MASTER）

> 生成日期：2026-08-13
> 团队：6 名专业子代理并行审计（性能内存 / 功能移植 / API 网络 / 视频播放器 / iOS 设计 / 导航QA）
> 依据：`01-performance.md`、`02-feature-parity.md`、`03-api.md`、`04-player.md`、`05-ios-design.md`、`06-navigation-qa.md`
> 说明：本报告为**全量汇总**——6 份子报告中的每一个问题条目均已收录，未遗漏；同一根因被多个专家命中的问题已交叉标注（🔁）。

---

## 0. 总览

### 0.1 审计对象
- RN 版（被审计）：`piliplus-RN` —— Expo SDK 57 / RN 0.86 / React 19.2 / expo-router（109 路由）/ zustand / reanimated 4.5 / FlashList 2.0.2 / expo-image + **8 个自定义 Swift 原生模块**（pili-player / pili-danmaku / pili-live / pili-audio / pili-dlna / pili-video-enhance / pili-webview / pili-native-core）。
- Flutter 原版（对照基准）：`PiliPlus` —— 1297 个 dart 文件，lib/pages 约 110 个页面目录，lib/grpc 8 组 proto service，458 个模型文件。

### 0.2 整体结论（六个专家的共识）
1. **工程质量底子很好**：无 JS 线程动画、热路径订阅用细粒度 selector、列表图片全部 CDN 降采样、Swift 侧生命周期管理规范、动效基建（motion.tsx / Glass.tsx / type-scale.tsx）高于 Flutter 原版。
2. **"很多地方无法加载"的根因集中在 API 层**：路径级接口覆盖率 97%，但**签名应用方式、风控请求头、gRPC 元数据头、响应字段解析**有 20+ 处实质差异（03 报告 R1~R11）。
3. **"返回上一级导航有问题"的最大根因**：共享单例播放器（`PiliPlayer.shared`）被多个屏幕共用，返回后源不恢复 + 全屏 blur 暂停竞态（06-N1/N2）。
4. **"播放器 bug 巨多"**：根因链集中在全屏旋转从未生效（app 锁死 portrait + 原生旋转时机错误），以及播放器高度与评论滚动逐帧耦合（04-B1/B5）。
5. **"没有设计感"的实质**：设计系统已建成约 70%，长尾屏幕（评论区、直播间 SuperChat、下载页、视频详情 ActionBar）没有吃干净——硬编码 289 处圆角 / 663 处 hex 色 / 104 处 fontSize，加上 ACCENT 主题色响应机制断裂。
6. **功能移植完成度**：167 个审计条目 ✅124（74%）/ 🟡30（18%）/ ❌13（8%），缺口集中在视频页深度交互、emote 表情体系、下载深度、文章阅读器、番剧索引。

### 0.3 六大维度问题计数
| 维度 | 报告 | P0 | P1 | P2/P3 | 信息项 |
|---|---|---|---|---|---|
| 性能与内存 | 01 | 3 | 5 | 12 | 8 |
| 功能移植 | 02 | 13 缺失 + 30 部分（以条目标题计） | — | — | — |
| API 网络 | 03 | 4 根因 | 2 根因 | 5 根因 + 8 缺接口 | 多项确认 |
| 视频播放器 | 04 | 3 | 6 | 8 | 多项确认 |
| iOS 设计 | 05 | 3 组件级 | 4 | 9 | 6 屏评级 |
| 导航 QA | 06 | 1 | 10 | 20+ | — |

### 0.4 <100MB 内存目标可行性（01 报告结论）
- **当前默认配置不可行**：浏览 90~130MB，1080p 播放+弹幕 140~160MB。
- 落实 Top 措施（缓冲 60s→15s、图片缓存 96MB→32MB、弹幕三份驻留收敛、URLCache 16→4~8MB、feed 上限）后：浏览 55~80MB（可行），1080p 播放+弹幕 85~105MB（临界），蜂窝默认 720p 时 65~85MB（可行）。
- 需要 Instruments（Allocations + VM Tracker + Memory Graph）在 iPhone 12/13 上全链路回归，并把 100MB 设为 CI 软阈值。

---

# 第一部分 · 性能与内存（01-performance 全量）

## 1.1 内存预算（01 §1.1）
| 大户 | 位置 | 当前估算 |
|---|---|---|
| RN 基础（Hermes 堆 + 原生层 + 8 模块） | 全局 | 35~50MB |
| AVPlayer 前向缓冲（bufferSec=60） | `PiliPlayerSession.swift:185` + `settings.ts:257` | 最高 ~45MB |
| expo-image 内存缓存 | `src/app/_layout.tsx:20-23` | 最高 96MB |
| 弹幕三份驻留 | `DanmakuOverlay.tsx:128,172-178,346` + `PiliDanmakuLoader.swift:11-17` | 5~15MB |
| API URLCache 内存段 | `PiliNetwork.swift:39-43` | 16MB |
| FlashList 回收池+卡片纹理 | 各列表 | 10~20MB |
| WebView（3 页，打开时） | `src/app/webview` | +30~60MB |
| 视频增强（默认关） | pili-video-enhance | 开启 +10~30MB |

## 1.2 内存类发现
- **M1（P0）播放器前向缓冲默认 60 秒** —— `settings.ts:257` → `PiliPlayerSession.swift:185,266-269`。1080p 峰值 6Mbps（`player-utils.ts:20`）≈45MB。修复：默认 15~20s，蜂窝/低电 8~10s，直播分支已正确限 ≤2s ✓。收益 -20~35MB。
- **M2（P1）expo-image 内存缓存 96MB/96 张过高** —— `_layout.tsx:20-23`。封面 640×360 单张 ~0.9MB，96 张≈90MB 常驻。修复：降到 32MB（约 32~40 张），首页已有 prefetch 预热。收益 -50MB 峰值。
- **M3（P1）弹幕数据三份驻留 + JS 过桥往返** —— 原生产出 6000 条 → 序列化回 JS `useState`（`DanmakuOverlay.tsx:128`）→ 再序列化回原生（`:346`），原生另有 rawCache 8 cid×6000 条（`PiliDanmakuLoader.swift:11-17`）。修复：返回 token 引用、条目留原生；缓存上限 8→2~3。收益 -5~15MB + 过桥提速。
- **M4（P2）API URLCache 内存段 16MB** —— `PiliNetwork.swift:39-43`。降到 4~8MB。收益 8~12MB。
- **M5（P2）feed 数据数组无上限** —— `use-rcmd-feed.ts`、`use-dynamic-feed.ts` append 不截断（直播弹幕有 MAX_ITEMS=50 可对照）。修复：保留最近 ~400 条、keyExtractor 保持稳定。

## 1.3 列表滚动性能
- **L1（P1）FlashList v2 下 v1 调优 props 疑似静默失效** —— `VideoCard.tsx:186-196` 用 `declare module` 补类型；`HomeFeedList.tsx:220-222` 等 ~10 处 `windowSize/initialNumToRender/maxToRenderPerBatch` 大概率无效。v2 真实 API 是 `drawDistance`/`overrideProps`（`history/index.tsx:291`、`dynamics.tsx:373` 用法正确）。修复：对照 2.0.2 源码替换并删类型 augmentation。
- **L2（P2）动态 feed 未传 getItemType** —— `(tabs)/dynamics.tsx:366-374`，异构卡片（文字/多图/视频/直播/文章/投票）共用回收池。修复：按 dynType 返回编号（首页 `HomeFeedList.tsx:169-172`、rank、member_search 等 12 处已正确）。
- **L3（P2）keyExtractor 含 index** —— `history/index.tsx:277` `${it.history.oid}-${idx}`、`SearchResultList.tsx:252` 同。刷新/筛选后 key 漂移整列重挂。修复：用稳定 oid/bvid。
- **L4（信息）热路径列表配置良好** —— 首页 `overrideItemLayout` 固定行高 + getItemType + drawDistance=400 + 低电量门控预取 + 卡片 memo；评论区 `estimatedItemSize=180` + drawDistance=250 + 行级 memo 且与播放器 tick 解耦；未发现 renderItem 内联匿名函数。

## 1.4 React 重渲染
- **R1（P2）设置页整 store 订阅 17 处** —— `settings/*.tsx` ×15 + `PlayerSettingsSheet.tsx:89` + `SubtitleOverlay.tsx:39`。低频页可接受，但 **SubtitleOverlay 挂载于播放中**，应改按需 selector。
- **R2（P2）`useAuthStore()` 无 selector 约 29 处** —— 低频变更，风格问题，机械替换 `s => s.isLoggedIn`。
- **R3（信息）热路径订阅方式正确** —— player store 细粒度 selector、`syncProgress` 有引用计数无订阅者不写 store（`stores/player.ts:26-27,96-106`）——设计很好。
- **R4（P2）播放进度 2Hz JS 重渲染链** —— 原生 0.5s timeUpdate 事件 → `PlayerTimeProvider` setState → 进度条 shared value 走 UI 线程、仅时间文本走 JS。**原生 `PiliPlayerProgressBar` 已实现却 0 引用**（`pili-player/src/index.tsx:525-536`）。修复：收起态改用原生进度条，或 timeUpdate 放宽到 1s。
- **R5（P2）渲染期副作用** —— `use-video-controller.ts:1253-1256`、`use-fullscreen-player.ts:667-670` 渲染体内调 `PiliPlayer.shared.setLoop/setMuted/setBufferConfig`。StrictMode/React Compiler 下执行两次。移入 useEffect。（🔁 04-3.7、06-C7）
- **R6（P2）模块级 ACCENT 快照** —— `SwiftUIHost.tsx:28` `export const ACCENT = useSettingsStore.getState().accentColor`，改主题色后静态样式不更新。（🔁 05-C1）

## 1.5 动画性能
- **A1（信息）未发现 JS 线程动画** —— 0 处 legacy Animated、0 处 setInterval 驱动动画；滚动联动全 worklet；按压/入场/顶栏收起全 shared value + spring。这一层很干净。
- **A2（P0）弹幕 CATextLayer 每帧写 frame 未禁用隐式动画** —— `PiliDanmakuOverlayView.swift:402-458` displayLinkTick 每帧写 layer.frame/opacity 但无 `CATransaction.setDisableActions` → 每条弹幕每帧生成 CAAnimation，CoreAnimation 提交风暴，弹幕密集时播放页最大隐性 CPU 消耗。修复：tick 内 begin/setDisableActions/commit，或 `layer.actions = [:]`，更彻底改单次 CABasicAnimation 位移。（🔁 04 弹幕引擎质量虽高但受此拖累）
- **A3（P2）120Hz 全局解锁 + 弹幕 DisplayLink 跑满帧率** —— `app.json` `CADisableMinimumFrameDurationOnPhone: true`；弹幕 link 未设 preferredFrameRateRange（`PiliDanmakuOverlayView.swift:98-101`）。修复：限 `CAFrameRateRange(24,60,60)`，ProMotion 弹幕 CPU/GPU 减半。
- **A4（P2）BlurView/Glass 使用克制，1 处可优化** —— `<BlurView>` 仅 2 处、`<GlassView>` 2 处、`<MaskedView>` 3 处；`VideoPlayerStage.tsx:215-217` collapseBlur **始终挂载**（展开态靠 opacity=0），建议条件卸载。GlassCard 的"磨砂层"实为静态色（注释明确降级决策）✓。

## 1.6 图片内存
- **I1（信息）缩略策略正确** —— 全部 CDN 缩放（`biliCover` 640×360/360/96×96/120×120/1280×720）、recyclingKey、memory-disk、不做过渡淡入以省 GPU、首页预取受低电量门控。
- **I2（P1）= M2**。
- **I3（P2）`biliCover` 每次渲染 `useSettingsStore.getState()`** —— `image-url.ts`，可缓存 picQuality 快照。

## 1.7 内存泄漏
- **K1（信息）JS 侧清理基本完整** —— 原生事件监听成对 remove、AppState 有清理、zustand subscribe 均返回 unsub、usePagedList 卸载 abort、setTimeout 存 ref。
- **K2（信息）Swift 侧生命周期总体规范** —— PiliDanmakuOverlayView.deinit 完整移除；PiliPlayerSession 单例 5 处 observer 有意保留；timeObserver 严格 remove；PiliEnhancementEngine 引用环由 detach 打破；PiliPowerMonitor/SubtitleView/LiveSocket 均配对清理。
- **K3（P2）确认项** —— PiliFullscreenController 30s HUD timer 与 PiliPlayerSession 截图 output 均正确释放。**真正的风险点只有 A2 的 CAAnimation 对象风暴（非泄漏但效果类似）与 M3 的原生缓存驻留。**

## 1.8 Swift 原生模块性能
- **S1（P0）= A2（弹幕隐式动画）**。
- **S2（P2）CATextLayer 无池化** —— `PiliDanmakuOverlayView.swift:352-367` spawn 新建、`:448-455` 丢弃。修复：建 40 个 layer 对象池，文字测宽缓存。
- **S3（P1）= M1**。另：`automaticallyWaitsToMinimizeStalling=true`（VOD）内存紧张机型可评估关闭；1x 用 timeDomain ✓ 省 CPU；直播限 2s ✓。
- **S4（P2）pili-video-enhance 成本** —— 默认全关 ✓；开启时 CADisplayLink 最高帧率 + VT 管线 + Metal，为整机最重可选功能；已有热/电量降级 ✓。建议：UI 明示耗电；thermal≥serious 强制回 passthrough（确认覆盖 EDR 路径）。
- **S5（P2）弹幕 loader 缓存 8 cid 偏多**（见 M3）。
- **S6（信息）pili-live socket 设计良好** —— 150ms 批处理过桥（`PiliLiveModule.swift:36`）、心跳 30s、重连/世代号/weak self 完整。

## 1.9 省电
- **B1（P0）播放心跳每 5 秒一次 HTTP，且两份实现** —— `use-video-playback.ts:188-205` 与 `use-fullscreen-player.ts:172-190` 相同逻辑。播放 1 小时 ~720 次请求。修复：提到 15s + 暂停/退出补报，或移入原生 PiliPollingTimer；两份收敛为一个 util。
- **B2（信息）动态轮询链路规范** —— 原生 DispatchSourceTimer（utility QoS + 50ms leeway + in-flight 合并）、默认 5 分钟、低电/高温 ×2、退后台停改 BGAppRefreshTask、登录态联动注销。
- **B3（信息）其他耗电点受控** —— 电源状态原生事件推送、屏幕常亮仅前台+播放+非纯音频、后台音频系统 audio mode、无定位、无持续传感器。（P2）`enableHttp2` 默认 false：开启可减 TLS 握手耗电。

## 1.10 启动性能
- **T1（信息）启动链路已优化** —— splash 首帧隐藏、auth/settings 异步并行、网络监听延后、设置整表快照 + 150ms debounce、首页冷启动原生推荐缓存秒开、8 模块轻量桥接。
- **T2（P2）可再压榨** —— `settings.init()` AsyncStorage 迁移兜底在新用户首启仍跑 getKeysByPrefix，可加"已迁移"标记短路；`Image.configureCache` 两处调用（`_layout.tsx:20` 与 `:64`）合并为一次。

## 1.11 RN vs Swift 分工结论（01 §10）
| 模块 | 建议 |
|---|---|
| 视频播放 / 弹幕渲染 / 字幕 / 网络层 / 轮询 / 视频增强 | **保持原生**（弹幕修 A2/S2 后即为最优） |
| 收起态进度条 | **改用已实现未启用的原生 `PiliPlayerProgressBar`**（省 2Hz JS 重渲染） |
| 播放心跳上报 | **移入原生**（PiliPollingTimer）或至少 15s |
| 列表/Feed/评论 UI、玻璃材质、路由业务 | **保持 RN**（FlashList v2 + memo 足够；Glass 系统级比自绘省电） |

## 1.12 性能 Top 10 行动清单（01 §Top10）
1. P0 弹幕隐式动画 `PiliDanmakuOverlayView.swift:402-458`
2. P0 bufferSec 默认 60s `settings.ts:257`
3. P0 心跳 5s ×2 份 `use-video-playback.ts:192`、`use-fullscreen-player.ts:176`
4. P1 expo-image 缓存 96MB `_layout.tsx:20-23`
5. P1 FlashList v1 props 失效 `VideoCard.tsx:186-196` 等
6. P1 弹幕三份驻留 + 8 cid 原生缓存 `DanmakuOverlay.tsx:128,346`、`PiliDanmakuLoader.swift:11-17`
7. P2 弹幕 120Hz `PiliDanmakuOverlayView.swift:98-101` + app.json
8. P2 CATextLayer 无池化 `PiliDanmakuOverlayView.swift:352-367`
9. P2 URLCache 16MB / collapseBlur 常驻 `PiliNetwork.swift:39-43`、`VideoPlayerStage.tsx:215-217`
10. P2 动态无 getItemType / history key 含 idx / feed 无上限

---

# 第二部分 · 功能移植完整性（02-feature-parity 全量）

## 2.1 统计
- 审计条目 167：✅ 完整 **124（74%）**｜🟡 部分 **30（18%）**｜❌ 缺失 **13（8%）**
- 工作量：S ≤1 天｜M 2~4 天｜L ≥5 天

## 2.2 ❌ 缺失项（13 条，全量）
| 功能 | Flutter 路径 | RN 缺失说明 | 工作量 |
|---|---|---|---|
| 播放列表 medialist（连播队列） | video/medialist | 「播放全部」队列面板（稍后再看/合集连播、当前高亮、上下集切换）完全缺失 | M |
| UP 主页横屏面板 | video/member | HorizontalMemberPage（视频页底部弹层内浏览 UP 投稿）缺失 | M |
| UP 帖子面板 post_panel | video/post_panel | 视频页内 UP 主帖子面板缺失 | S |
| 表情 emote 体系 | lib/pages/emote | 全站表情面板缺失（发动态/发评论/私信只能纯文本）；[doge] 文本不渲染成图片；仅直播间例外 | L |
| 喜欢 Tab member_like_arc | member_like_arc | 「最近喜欢/点赞的视频」Tab 未移植 | S |
| 投稿(网页版) member_contribute | member_contribute | 少见 Tab 缺失 | S |
| 下载搜索 download/search | download/search | 下载内搜索缺失 | M |
| 下载详情(分P) download/detail | download/detail | 单任务分P详情缺失 | M |
| 联系人选择 contact | lib/pages/contact | 转发/分享时选择联系人（粉丝+互关）页面缺失 | M |
| 站内分享选人 share | lib/pages/share | Flutter 站内分享给指定用户面板缺失（RN 走系统分享，站外已覆盖） | S |
| 番剧索引 pgc_index | lib/pages/pgc_index | 按题材/年份/地区/排序的索引筛选页缺失（API 已写） | M |
| 番剧主页/时间表 | lib/pages/pgc/view.dart | 追番时间表主页 + 索引入口缺失（PgcTimelineStrip 组件已存在未接入） | M |
| emote_span 文本表情渲染 | lib/common/widgets | 评论/动态文本中 [表情] 不渲染为图片 | M |

## 2.3 🟡 部分实现项（30 条，全量）
| 功能 | 缺失细节 | 工作量 |
|---|---|---|
| 本地/离线视频简介 | 无离线视频详情页框架（本地元信息、分P列表） | M |
| 发评论 reply_new | 支持文字+图片；❌无表情面板、无 @用户、无话题 | M |
| 投币面板 pay_coins | 只投 1 币；❌无 1/2 币选择弹窗、❌无长按一键三连（endpoint ugcTriple 已备未接 UI） | S |
| 收藏夹选择面板 fav_panel | FavFolderPicker 组件存在但**未接入视频页**；❌无长按选文件夹、无面板内新建收藏夹 | S |
| 选集面板 episode_panel | ❌无独立选集底部面板（全屏可选集）、❌无倒序、❌无 section 合集切换、全屏页无选集入口 | M |
| 缓存面板 download_panel | ❌无清晰度选择、无分P多选、无仅音频、无任务面板；只缓存当前流 URL | L |
| AI 总结 ai_conclusion | ❌无 outline 章节大纲面板、无分段跳转 | S |
| 发弹幕面板 send_danmaku | ❌无弹幕位置（滚动/顶部/底部）、无颜色选择、无字号样式 | M |
| 弹幕设置面板 | 已有开关/合并/字号/速度/透明度；❌缺显示区域、行高、描边、滚动/静态时长、按类型屏蔽（滚动/顶部/底部/颜色）、智能云屏蔽级别 | M |
| 更多菜单 | 已有稍后再看/笔记/复制/分享/缓存/投屏/举报；❌无"保存封面"、❌无"听音频"入口（听视频在控制栏有） | S |
| 画中画 PiP | 原生模块有痕迹，无设置/UI（Flutter 有"后台画中画""不加载弹幕"设置） | M |
| 动态 Tab 页 | ❌无「全部/投稿/番剧/专栏」4 个切换 Tab（只能靠设置 defaultDynamicType 固定） | S |
| 动态详情 | ❌视频类动态无内联播放器（Flutter 详情页可播放） | L |
| 搜索结果 | 已有 视频/番剧/影视/直播间/用户/专栏 6 类 + 5 排序；❌缺「综合/全部」混合结果 Tab | M |
| 空间头部 | ❌头部无右上角菜单（分享UP主/拉黑/举报/私信入口） | S |
| 稍后再看 | 已有播放全部/清空/看完过滤/搜索；❌无"清空失效""清空看完"分开操作 | S |
| 下载管理 | 已有列表/暂停/删除/多选/播放全部/本地播放；❌无下载内搜索、无单任务分P详情、无音视频合并离线视频（仅单流 URL 缓存）、无后台任务队列 | L |
| 赛事 match_info | 仅比分/队徽/时间/进直播间；❌无事件时间线、阵容、统计 | M |
| 私信会话详情 | 已有文字/图片/BFS上传/撤回展示；❌无表情面板、❌无长按消息菜单（撤回自己的消息/复制/举报） | M |
| 专栏阅读 article | 仅 WebView 跳转+保存分享；❌无原生阅读器、无点赞/收藏/评论条 | L |
| 音频 audio | 仅取流播放/暂停；❌无歌单列表、定时关闭、音量控制 UI | M |
| 音乐 MV music | 详情+播放+评论入口；❌无播放器完整控制（进度/歌单切换） | M |
| 设置-视频/画质 | ❌「CDN 测速」「开启硬解」「蜂窝网络音质」「B站定向流量」暂不支持（多为 iOS 平台限制） | M |
| 设置-播放 | ❌「后台画中画」「提前初始化播放器」「快速收藏」「键盘控制」无 | M |
| 设置-其他 | ❌「发评反诈」「发布动态反诈」「检查更新」「显示热门推荐」「快速收藏」标注暂不支持 | M |
| 头像挂件 pendant_avatar | 基础头像有，挂件装饰未移植 | S |
| 界面缩放 uiScale | 未见 RN 对应项 | S |
| 画中画 PiP（全局） | 原生模块有基础，无 UI/设置暴露 | M |
| 检查更新 | RN 标注暂不支持 | S |
| 离线下载（全局能力） | 仅单流 URL 缓存 | L |

## 2.4 首页/主框架差异（02 §2.1）
- 主框架 ✅：3 个原生 Tab + 动态角标 + 底栏滚动隐藏；缺「导航栏 tab 自由增删排序的完整编辑」（bar_set 已有基础版）——S。
- 热门并入 HomeCategoryBar ✅；推荐（web/app 双源、过滤器、保留刷新）✅；rank/popular_series/popular_precious ✅；我的 ✅。

## 2.5 建议移植优先级（02 §4）
- **P0（S/M）**：投币面板(1/2币+长按三连)、收藏文件夹选择面板接入视频页、选集面板完善（全屏选集/section/倒序）、表情 emote（先文本渲染后表情面板，L）。
- **P1**：弹幕设置补齐（M）、动态 4 Tab 筛选（S）+ 动态详情视频播放（L）、下载体系升级（L）。
- **P2**：播放列表 medialist（M）、番剧索引+时间表（M×2）、私信长按菜单+表情、AI 大纲面板、更多菜单补全（保存封面/听音频）。
- **P3**：专栏阅读器、音频歌单、音乐播放页、member_like_arc、contact 选人、搜索综合 Tab、match 详情、UP 帖子面板、PiP、界面缩放。

## 2.6 备注
- iOS 专属实现；Flutter 的 Android/桌面能力（键盘控制、托盘、窗口标题栏等）不计入缺失。
- RN 设置中 8 项标注"暂不支持"：CDN 测速、硬解、发评反诈、快速收藏、提前初始化播放器、检查更新、热门推荐入口、蜂窝音质。

---

# 第三部分 · API 网络层（03-api 全量）

## 3.1 架构对照
| 维度 | Flutter | RN |
|---|---|---|
| HTTP 引擎 | Dio + CookieJar 拦截器 | 原生 URLSession（PiliNetwork.swift）+ client.ts 包装 |
| Cookie | 每账号独立 CookieJar（Hive） | iOS 全局 HTTPCookieStorage + 账号快照切换 |
| WBI 签名 | wbi_sign.dart | PiliSigner.swift（算法逐项一致） |
| App 签名 | app_sign.dart | PiliSigner.appSign（appkey/appsec 完全一致） |
| gRPC | 完整 protobuf + 8 组 service | **仅 3 个方法且缺全部元数据头** |
| 直播长连 | WSS + TCP 回退 + brotli/zlib | 仅 WSS |
| 多账号路由 | ApiType 按接口路由不同 access_key | 单一 access_key |

## 3.2 签名与风控
- **✅ 一致**：WBI mixin 重排表、key 来源（nav 拉取 24h 缓存）、参数排序+过滤+md5；appSign 逻辑与 appkey/appsec 一致。
- **❌ 请求头关键差异（"无法加载"头号嫌疑）**：Flutter 对**每个 web 请求**（api.bilibili.com / api.vc / message）统一注入 `env:prod / app-key:android64 / x-bili-aurora-zone:sh001` + 登录态 `x-bili-mid:<mid> / x-bili-aurora-eid` + referer；UA 为 `Dart/3.6`。RN `client.ts:57-85` **仅 app.bilibili.com 注入**且 `x-bili-mid` 传布尔字符串 `'1'/'0'`，web 请求无指纹头，UA 为安卓 `BiliDroid/8.43.0` → 混搭指纹触发 -352/-403，是空间/搜索/动态**间歇性空数据**根因。
- **✅ 对齐**：dm_img_* 风控参数（playUrl/memberInfo/searchArchive/memberDynamic 均已补）。
- **⚠️ buvid 激活报文不一致**：Flutter POST `/x/internal/gaia-gateway/ExClimbWuzhi` body 为 `{"payload": json}`（`init.dart:92-99`）；RN `validate.ts:35-37` 直接发 payload 无包裹 → 激活大概率无效，风控概率隐性上升。

## 3.3 接口对账差异点（全量 ⚠️/❌）
**首页/推荐**：
- ⚠️ app 推荐 `videoApi.recommendApp`（`video.ts:193-204`）参数集与头不齐：缺 buvid/fp_local/fp_remote/session_id/env 头、build/mobi_app=android_hd/statistics 参数（Flutter `video.dart:89-141` 全带）。默认首页走此接口（appRcmd:true）。

**视频**：
- ⚠️ UGC 流 fnval=0(durl) 而非 4048(DASH)——因 AVPlayer 只取 durl，清晰度上限 480P/720P 合流，属有意为之但牺牲画质。
- ❌ **PGC 流响应字段解析错误**：`app/pgc/[id].tsx:69-72` 读 `res?.data`，实际载荷在 `result.video_info`（Flutter `video.dart:250-255`）→ **番剧播放必挂**（= R1）。
- ❌ 缺 `/pugv/player/web/playurl`（课堂视频）。
- ❌ 缺 `/x/tv/playurl` appSign（高画质/充电专属兜底）。
- ⚠️ 心跳 JSON vs Flutter form（一般可接受）。
- ❌ 缺 `/x/v1/medialist/history`（列表播放历史上报）。

**动作类**：
- ⚠️ 三连 `/x/web-interface/archive/like/triple` 无 form/PC UA/referer/eab_x 参数。
- ⚠️ pgc 三连缺 referer/origin。
- ⚠️ 关注操作 `/x/relation/modify` 仅 fid/act/re_src/csrf JSON，缺 extend_content/space referer/PC UA → 部分风控账号关注/取关失败。
- ⚠️ 收藏 batch-deal JSON vs form。
- ❌ 稍后再看 copy/move（`/x/v2/history/toview/copy|move`）。

**评论**：
- ⚠️ 游客分支：Flutter 用 NoAccount 空 cookie + baseHeaders；RN 游客仍带 buvid3 cookie、无 app-key 头 → 个别视频游客 -352。

**动态**：
- ✅ 主链路全齐；⚠️ 动态点赞无 t.bilibili.com referer；⚠️ 文章详情降级 WebView（缺 viewinfo/view）；⚠️ 未读角标用 HTTP+轮询替代 gRPC dynRed。

**消息/私信**：
- ⚠️ remove_session/set_top/update_ack 未 WBI 签名 + JSON body。
- ❌ `clearUnread`（gRPC）无 HTTP 等价 → RN 用本地游标模拟已读，服务端未读不会真清零。
- ❌ **gRPC KeywordBlocking* 缺全部元数据头**（= R4，whisper_block 页必挂）。

**直播**：
- ❌ **首页直播 feed `/xlive/app-interface/v2/index/feed` 未 appSign**、无 buvid/app-key=android 头（Flutter `live.dart:197-251` 全签名）→ 直播 tab 高风险（= R3）。
- ❌ 分区列表 `/second/getList`、分区总表 `/index/getAreaList` 未签名（同上）。
- ⚠️ `/room/v1/Area/getList`、`get_fav_tag` 未签名。
- ✅ 直播搜索已签名。
- ❌ 缺 `/xlive/web-interface/v1/second/getUserRecommend`（web 直播推荐）。
- ⚠️ 长连接仅 wss，无 TCP 回退、无 brotli/zlib。

**音乐（必挂）**：
- ❌ `music.ts:4-14`：bgmDetail/bgmRecommend 参数名 `id` 应为 **`music_id`**，detail 需 WBI+`relation_from:'bgm_page'`；wishUpdate 传 `{id,wish}` 应为 `{music_id, state:1|2, csrf}` form（Flutter `music.dart:11-60`）= R5。

**搜索**：
- ⚠️ 分类搜索 WBI ✅ 但**无 search origin/referer、无 v_voucher→geetest 解锁链** → 触发风控后无法自愈（= R6）。
- ❌ 缺综合搜索 `/x/web-interface/wbi/search/all/v2`。

**用户空间**：✅ 主链路全齐；⚠️ spaceShop 发到 appClient 基址+完整 mall URL（可通）。

**登录**：
- ✅ QR/密码/短信/风控二次验证参数逐项对齐，RSA 走原生。
- ⚠️ **无 oauth2/access_token 自动续期**（Flutter 在 cookie 过期自动刷新）→ 长期挂机 access_key 过期整体失效。
- ✅ Cookie 持久化：bili_jct/SESSDATA/DedeUserID/__ckMd5 完整落盘 iOS HTTPCookieStorage + Keychain 账号快照；buvid3 本地生成。
- ⚠️ iOS HTTPCookieStorage 全局单份，多账号切换靠 clear+restore（`cookie.ts:210-215`），漏存即串号（Flutter 每账号独立 jar 天然隔离）。

**其他**：
- ⚠️ SponsorBlock 仅 3 个核心接口，缺投稿/查询类。
- ✅ 弹幕分段 HTTP seg.so（原生解码 protobuf）等价 gRPC DmSegMobile；弹幕动作全套 ✅；Gaia 风控 ✅；电竞赛事 ✅；版本检查 ✅。
- ⚠️ 下载用原生 PiliDownloadManager 独立实现，未逐项对账。

## 3.4 缺失接口汇总（HTTP，8 个）
1. GET `/x/web-interface/wbi/search/all/v2`（综合搜索，WBI）
2. GET `/x/tv/playurl`（appSign，高画质兜底）
3. GET `/pugv/player/web/playurl`（课堂播放流）
4. GET `/x/article/viewinfo`、`/x/article/view`（专栏详情）
5. POST `/x/v1/medialist/history`（列表历史上报，form）
6. POST `/x/v2/history/toview/copy`、`/move`（稍后再看复制/移动）
7. GET `/xlive/web-interface/v1/second/getUserRecommend`（web 直播推荐）
8. gRPC 层（见 3.5）

## 3.5 gRPC 缺口
| service | 方法 | RN 现状 |
|---|---|---|
| im / ImInterface | SessionMain/SessionSecondary/ClearUnread/…/KeywordBlocking* | ❌ HTTP 替代大部分；ClearUnread 无等价；KeywordBlocking 缺头必挂 |
| Reply | MainList/DetailList/DialogList/SearchItem/TranslateReply | ❌ HTTP `/x/v2/reply*` 替代（可用，丢失过滤/翻译） |
| DM | DmSegMobile/DmView | ✅ seg.so 等价；DmView 无等价 |
| Dynamic/Opus | DynRed/OpusDetail/OpusSpaceFlow | ⚠️ HTTP 替代，角标实时性差 |
| ViewUnite.View | View | ❌ 无（PGC 页少部分联合数据） |
| Listener | PlayURL/Playlist/ThumbUp/TripleLike/CoinAdd | ⚠️ RN 音频用 web 接口，点赞/三连/投币无实现 |
| Space | SearchArchive | ⚠️ HTTP 替代（可接受） |

**致命问题（4.2）**：`src/api/msg.ts:133-156` 的 `grpcUnary` 只带 `Content-Type`，**缺 `authorization: identify_v1 <access_key>` + 6 组 x-bili-*-bin 元数据**（Flutter `grpc_headers.dart:23-85`）→ B 站 app gRPC 网关返回 UNAUTHENTICATED，**whisper_block 页必然加载失败**。

**实现方案（4.3）**：① 最小改动：在 grpcUnary 复刻 6 组 header（字段号固定可手写 varint 编码，无需 protobuf 库），帧头 flag=0 不压缩可接受；② 通用化：引入 protobufjs 从 pbjson 反推 .proto；③ 能走 HTTP 的优先 HTTP（评论/弹幕/会话已可用），只补无 HTTP 等价的：ClearUnread、KeywordBlocking、音频点赞投币、DmView。

## 3.6 "无法加载"根因排序（R1~R11，全量）
- **R1｜PGC 播放流字段解析错误（必然失败）**：读 `res.data` 应为 `res.result.video_info`；另注意 `lastPlayTime` 在 `result.play_view_business_info.user_status.watch_progress.current_watch_progress`。（🔁 04-3.9 有画无声）
- **R2｜web 请求缺风控指纹头（间歇性大面积空数据）**：-352 时空间/搜索/动态时有时无。（见 3.2）
- **R3｜直播 app-interface 未签名（直播 tab/分区失败）**。
- **R4｜gRPC 元数据头缺失（私信屏蔽词必挂）**。
- **R5｜音乐接口参数名全错（音乐页必挂）**。
- **R6｜搜索风控无自愈（搜索结果空且不恢复）**。
- **R7｜buvid 激活报文缺 payload 包裹（隐性放大风控）**。
- **R8｜POST 动作接口 Content-Type 不一致**：Flutter 多为 form，RN 默认 JSON（client.ts:114-126）；`/x/msgfeed/del`、`/x/v3/fav/*`、`/x/relation/modify` 部分场景只认 form/csrf。
- **R9｜app 推荐参数集过简**。
- **R10｜评论游客分支头策略差异**。
- **R11｜缺失接口导致的局部空白**（§3.4 各条）。

## 3.7 修复优先级（03 §8）
- **P0**：R1 PGC `result.video_info` + fnval 策略；R3 直播 appSign + app-key:android；R5 音乐参数名/WBI/csrf。
- **P1**：R2 全局 baseHeaders/aurora/mid/UA 对齐；R4 grpcUnary 补元数据头；R6 搜索 origin/referer + v_voucher 解锁链。
- **P2**：R7 payload 包裹；R8 form 化；R9 推荐参数补齐；R10 游客评论头；§3.4 缺接口按需补；oauth2 自动续期。

---

# 第四部分 · 视频播放器（04-player 全量）

## 4.1 用户报告 bug 根因（B1~B6）
- **B1（P0）全屏无法正常显示**：三重根因——① `app.json:7` 锁死 portrait、expo-screen-orientation 装了 0 调用；② `PiliFullscreenController.swift:154-160,391-400` 旋转代码在 `viewWillAppear`（view.window==nil）执行，iOS16+ `requestGeometryUpdate` 分支永远跳过；③ 透明模态架构（全屏 UI 靠 RN 路由页，原生 VC 只是 passthrough）放大问题。修复方案 A：expo-screen-orientation 统一接管 lock（按 fullScreenMode/视频方向），原生 VC 只保留状态栏+HUD，或把 applyOrientation 挪到 viewDidAppear；方案 B：全屏 UI 全部原生承载（工作量大）。同时：present 已呈现短路（`:32-36`）重复进入不应用新 options；`fullscreen.tsx:247-249` catch 内 re-throw → unhandled rejection；原生 HUD 与 RN FullscreenTopBar 双重绘制顶部；`FULLSCREEN_MODES` 2="不改变方向"但原生 `:191-192` 反而允许全方向旋转，**语义相反**。
- **B2（P1）叠加层按钮过大**：按钮尺寸本身正常（图标 19-22pt / 触点 40x40）；是 B1 衍生症状——视频被 contain 压成竖屏小条而控制层按整屏铺排。修复：先修 B1；亮度/音量 HUD 统一到 RN 侧（详情页已有 gestureHud），删原生 HUD（原生 HUD 图标只是字母 "B"/"V"，粗糙且风格分裂）；全屏控制栏按横屏安全区收窄。
- **B3（P0/P1）播放器窗口过小**：① 全屏同 B1；② 详情页竖屏视频高度上限 `max(0.65*屏高, 屏宽)` 且 `enableVerticalExpand` 默认 false（`settings.ts:273`），9:16 视频在 contain 下仅 ~55% 屏高；③ `videoGravity` 全写死 `"contain"`（`VideoPlayerStage.tsx:184`、`fullscreen.tsx:147`、`LiveInfoPanel.tsx:79`、`download/player/index.tsx:70`）而原生支持 cover/fill 三档（`PiliPlayerView.swift:33-44`）无 UI 入口；④ videoAspect 初始 16/9 依赖 videoTrackChange 校正，首帧前后跳变（有 200ms 动画缓解）。修复：enableVerticalExpand 默认 true、加画面比例设置项、可选对齐 Flutter 用 view.dimension 提前定高消除跳变。
- **B4（P1）不能灵活适应宽高比**：① 无画面填充模式（Flutter 有 6 档 VideoFitType + 双击切换 + 持久化）；② 全屏方向不按视频方向（mode 0 恒 landscapeLeft，竖屏视频被迫横屏）；③ 双指缩放只是 transform scale（0.75-2x）、不持久、放大被 overflow:hidden 裁掉。修复：画面模式菜单（原生 gravity prop 直通）+ 双击循环切换 + 全屏按视频方向决策。
- **B5（P1）评论区显示不全**：播放器高度 = f(评论滚动偏移) 且播放器在正常文档流（`use-video-controller.ts:282-287` + `VideoScreenView.tsx:166-380`）——滚动 1px 播放器缩 1px、列表视口同时上移变高 → 内容双倍速滚动 + FlashList 视口逐帧变化出现空白/欠渲染；暂停态滞回阈值触发 CollapsedPlayerBar 覆盖加剧跳变。Flutter 用协同嵌套滚动，RN 无等价机制。修复三选一：① 滚动中只记偏移、momentum 结束再一次性收起；② 播放器改 absolute sticky 顶层、列表 paddingTop 起步（推荐，列表视口恒定）；③ 完整协同嵌套滚动（RNGH 自定义或原生 UIScrollView 嵌套）。（🔁 05-B4、06-V5/V8）
- **B6（P1/P2）弹幕相关问题**：① XML mode 2/3 滚动弹幕被丢弃（`PiliDanmakuParser.swift:98-100,259-262` 只留 1/4/5），mode 6/7 也不支持；② 滚动时长 = dmSpeed 常量与文字长度无关（`PiliDanmakuPreparer.swift:119-122`，默认 8s）；③ 队头阻塞：`spawnDueItems` 轨道全忙时 `return` 直接退出整个生成循环（`PiliDanmakuOverlayView.swift:322-338`）→ 高密度段落"卡弹幕"；④ 播放器高度变化触发 `setHeight→resetScheduler` 清空全部在屏弹幕（`:158-162`），详情页弹幕高度随宽高比/滚动逐帧变化 → 弹幕反复清空；⑤ 全屏手势双系统冲突（见 4.4）；⑥ 弹幕点击与播放器单击冲突（hitTest 命中 self 但父级 RNGH 仍收触摸 → 点弹幕同时切换控制层显隐）；⑦ 全屏弹幕高度 winH*0.6 无 topInset 与顶栏重叠（次要）。

## 4.2 专项发现（3.x 全量）
**3.1 视图架构**：
- `PiliPlayerView` 黑底 clipsToBounds、`isUserInteractionEnabled=false`（触摸全交 RN 手势层，设计正确）。
- TS 侧 `PiliPlayerView` 在 shared id 为空时降级为空 `<View>`（`pili-player/src/index.tsx:493-507`）——静默黑屏无日志，排障困难。
- `PiliSeekThumbnailView.swift:42` contentsScale 用 image.ref.scale（由 UIImage(cgImage:) 构造 scale=1.0）→ **3x 屏缩略图模糊**，应改 `UIScreen.main.scale`。
- `EnhancedVideoView` 三路渲染自包含、与播放器互斥挂载（架构合理）；增强开启时 pinch 作用于外层包装视图与 Metal normalizedVideoRect 不联动（次要）。

**3.2 全屏链路**：
- 呈现 `top.present(animated:)`，无可用 VC 抛错（`:38-45`）。
- 状态栏隐藏 ✓；安全区 defer bottom ✓；RN safePadding ✓。
- 状态恢复 `writeFullscreenState` 的 `currentTime: base?.currentTime ?? 0`（`use-fullscreen-player.ts:231`）用的是**进入全屏时的快照**而非当前时间，与 syncProgress 双路径写进度，阅读/维护风险高。
- 竞态：exitFullscreen 先 dismiss（异步）再 router.back，路由卸载 cleanup 又 dismiss 一次；快速进出时 present 短路复用旧 VC 不重装手势。
- 全屏页卸载无条件 pause 与详情页 useFocusEffect play 依赖 store 写入顺序，脆弱设计。

**3.3 手势系统**：
- 详情页 Race 组合分区合理（左 1/3 亮度、右 1/3 音量、中 1/3 上滑全屏；单击显隐、双击快进/中间暂停、长按倍速、横滑 seek 带 24px 防误触）。
- ① 全屏双系统冲突最严重（见 4.4-3）；② `verticalPanGesture` failOffsetX([-8,8]) 较严，斜向滑动易失败；③ 原生全屏 pan 调的是 **player.volume** 而非系统音量，与实体键语义不一致（Flutter 侧是系统音量）。

**3.4 播放状态机**：
- **无独立 buffering 状态**：`timeControlStatus == .waitingToPlayAtSpecifiedRate` 时 UI 只能看到 isPlaying=false，无法显示"缓冲中"。建议发 buffering 事件。
- **错误重试缺失**：item failed/failedToPlayToEndTime 发 error 事件（`:584-592,729-742`）但 **RN 侧无任何消费方**，只有 loadVideo 网络层 3 次退避。播放中途断流 = 黑屏无提示。修复：error → toast + 一键重载（reloadSource 已存在）。
- seek：pendingSeek 挂起 + 零容差 + 600ms seekGuard ✓。
- seek 缩略图三级缓存完整，但**仅详情页使用**，全屏页无 seek 预览（对齐 Flutter 缺失）。
- 倍速：1x timeDomain / 倍速 spectral ✓；长按加速 JS 侧 ✓。
- 清晰度：**全屏 `applyReady` 在每次 readyToPlay 重写 playbackRate/volume = 进入全屏时的值（`use-fullscreen-player.ts:200-216`）→ 切换清晰度把用户已调的倍速/音量重置**。修复：只在 seekOnceRef 首次生效时写。
- 多音轨/DASH 不支持。
- 字幕功能完整（0.25s timer、二分定位、字号/描边/底距/背景全可配、全屏拖拽底距）。
- **记忆播放缺失**：无本地进度持久化，仅依赖服务端历史 t 参数与 store 桥接（Flutter 有本地记忆播放）。

**3.5 弹幕补充**：时间同步严（timebase 每帧取、偏差阈值触发重排）✓；seek 后弹幕正确重置 ✓；层级正确 ✓；全屏与详情两实例靠 preparedCache 避免重复拉取 ✓；bindPlayer 幂等 ✓。核心质量问题全在 B6 + 01-A2/S2。

**3.6 PiP/后台/DLNA**：
- **PiP 未实现**：`PiliPlayerView.swift:12-13` 注释自认"待真机验收后接线"，无 AVPictureInPictureController、无 entitlement。
- 后台播放两条路径（后台自动转听视频 / 否则暂停恢复）设计合理；隐患：后台切音频依赖 JS AppState 回调 + 一次网络请求，系统后台窗口有限，切换可能失败且无降级（直接静音暂停）。
- **DLNA 交接缺失**：`src/app/dlna/index.tsx:65-85` 投屏只 setUrl+play **不暂停本机**（声音双出）；停止投屏（`:87-97`）不恢复本机、不回填进度。修复：cast 成功 → pause + 记进度；stop → 可选续播。
- AirPlay：`allowsExternalPlayback=true` 但**无 AVRoutePickerView 入口**（`PiliPlayerView.swift:10-11` 注释承认），用户无法主动发起。

**3.7 生命周期与内存**：
- KVO/observer 清理总体规范 ✓。
- **会话从不清理**：单例无 deactivate；页面卸载只 pause（`use-video-controller.ts:618-620`），最后一个 AVPlayerItem（解码器 + 60s 缓冲）常驻直到下次 load；TS `replaceAsync(null)` 被 `if (!source) return` 拦截（`pili-player/src/index.tsx:221`）无法主动置空。修复：放开 null 清理路径，详情页卸载（非后台音频保留场景）调 replaceAsync(null)。（🔁 06-N1、01-M1）
- 截图 AVPlayerItemVideoOutput 挂到换源才移除，截图后立即移除更佳（次要）。
- 全屏 VC 无泄漏 ✓。
- **渲染期副作用**（🔁 01-R5、06-C7）：useNativeVideoController/useNativeFullscreenPlayer 渲染期调 setLoop/setMuted/setBufferConfig/setLiveMode（`use-video-controller.ts:1252-1257`、`use-fullscreen-player.ts:666-672`）。

**3.8 直播 vs 点播**：
- 直播复用共享 AVPlayer，setLiveMode 关 waits + 限 2s ✓；setLoop(true)（`live/[roomId].tsx:111`）对直播无意义。
- **退出直播间不复位**：unmount 只 pause + releaseAudioPlayer（`:130-137`），liveMode/bufferConfig/timeUpdateInterval(0)/loop 残留 → 下载播放页沿用直播小缓冲策略点播频繁卡顿。修复：unmount 时 setLiveMode(false)/setLoop(false)/setTimeUpdateInterval(0.5)。
- **直播无全屏**（无全屏入口，LiveInfoPanel 固定 16:9）——Flutter 直播支持全屏。
- 直播后台音频交接完整 ✓。

**3.9 取流管线（重大功能缺口）**：
- UGC：`fnval:0` 强制 durl（合流 MP4）可播但**画质上限受 durl 限制**（非 VIP 通常 ≤480p）；`getBestPlayUrl` 的 DASH 兜底只取 video 流（`player-utils.ts:131-136` 注释自认）。
- **PGC：`pgc/[id].tsx:69` 传 `fnval:4048` 返回纯 DASH → getBestPlayUrl 选出纯视频流 → 番剧有画无声**（当前最严重功能 bug 之一）。（🔁 03-R1 同一处文件的两面：字段解析错 + fnval 策略错）
- 修复方向：短期 PGC 请求 fnval=0 durl 至少有声；中期评估 DASH 双轨（AVAssetResourceLoaderDelegate 代理合并 / LL-HLS 封装 / 双 player 时钟同步）。

**3.10 对照 Flutter 缺失能力清单**：
| 能力 | RN 现状 |
|---|---|
| 全屏方向模式 auto/none/vertical/horizontal/ratio | ❌ 锁死竖屏；mode 语义残缺 |
| 画面比例 6 档 VideoFitType + 双击切换 | ❌ 写死 contain |
| DASH 音视频分离（高画质+多音轨） | ❌ fnval=0 durl 优先；DASH 兜底无声 |
| PGC 播放 | ⚠️ 有画无声 |
| 画中画 PiP | ❌ 未实现 |
| 记忆播放（本地进度） | ❌ 仅服务端 t 参数 |
| 全屏 seek 缩略图 | ❌ 仅详情页 |
| 缓冲中 buffering UI | ❌ 无独立状态 |
| 播放错误自动/手动重试 | ❌ error 无消费方 |
| AirPlay 入口 | ❌ 只开了 allowsExternalPlayback |
| 投屏暂停本机 | ❌ |
| 直播全屏 | ❌ |
| 弹幕 mode 2/3/6/7 | ❌ 仅 1/4/5 |
| 滚动联动收起播放器 | ⚠️ 逐帧耦合（B5） |
| 双击/长按/亮度音量手势 | ✅（全屏与原生冲突 B6-5） |
| SponsorBlock / 倍速 / 长按加速 / 截图 / 字幕 / 听视频 | ✅ |

## 4.3 目标架构（04 §4）
1. 旋转/方向：expo-screen-orientation 统一接管，原生 VC 只做状态栏+HUD（或删除）。
2. 全屏单一事实源：全屏状态收敛到一个 store，避免 fullscreenState 双路径回写。
3. 播放会话：放开 replaceAsync(null)；页面卸载清 item；增加 buffering/error 状态与重试 UI。
4. 画面模式：videoGravity prop 直通 UI + 双击循环；竖屏视频竖屏全屏。
5. 布局解耦：播放器改 sticky/absolute，列表 paddingTop 起步。
6. 手势单一事实源：全屏手势统一走 RNGH 或统一走原生，废除双系统并存。
7. 取流：PGC 止血 fnval=0；中期 DASH 双轨。

## 4.4 修复优先级（04 §5，全量）
- **P0**：① 全屏旋转修复（`app.json:7`、`PiliFullscreenController.swift:154-160,391-408`、`fullscreen.tsx:240-254`）；② PGC 有声播放（`pgc/[id].tsx:69`、`video.ts:76-81`）；③ 播放 error 事件接入重试 UI。
- **P1**：① 评论/简介区与播放器高度解耦（B5 三方案之一）；② 全屏手势冲突（`use-fullscreen-player.ts:426-451`、`PiliFullscreenController.swift:206-260`）；③ 画面模式 + 竖屏全屏；④ DLNA 投屏暂停本机/停投恢复；⑤ 直播退出复位共享会话参数。
- **P2**：① 全屏切清晰度不重置倍速/音量；② 弹幕 mode 2/3、队头阻塞、setHeight 不清空；③ buffering 状态、记忆播放、全屏 seek 缩略图、AirPlay 入口、PiP；④ replaceAsync(null) 放开 + 卸载清理。
- **P3**：缩略图 contentsScale、原生 HUD 与 RN TopBar 合并、渲染期副作用移入 effect。

---

# 第五部分 · iOS 视觉与动效（05-ios-design 全量）

## 5.1 总体判断
设计系统建成约 70%，长尾漂移。已有好底子：92/109 屏真毛玻璃导航栏、67 屏大标题、143 文件用 Press 弹簧按压、39 屏共享骨架、Slider/Picker/Form 大量走 @expo/ui SwiftUI 原生控件、iOS 26 TabBar minimizeBehavior。**"拼凑感"来自六处**：
1. 硬编码成规模（289 圆角 / 104 字号 / 663 hex / 128 手写阴影）；
2. ACCENT 主题色机制断裂 + 28 处写死 #FB7299；
3. 6 文件 RN 裸 Switch；
4. 33 处空态复制粘贴、错误重试 3 种样式；
5. 材质叙事不完整（Liquid Glass 仅 ~10 处、动态页假毛玻璃）；
6. 评论区（用户点名）：完全绕过字阶与圆角阶梯 + `replyLengthLimit=6` 行截断无展开入口。

## 5.2 A 全局审计（A1~A6 全量）
**A1 Token 采用率**：RADII 采用率 53%（327 token / 289 硬编码）；useType 124 文件但 104 处硬编码 fontSize；hex 663 / rgba 154；shadow() 101 处 vs 手写 128 处；#FB7299 字面量 28 处。热点文件：`settings/index.tsx`（23 色）、`mine.tsx`（21 色）、`color_select.tsx`（20 色）、`CommentSection.tsx`（19 圆角+全套字号）、`DynamicMedia.tsx`（16 圆角——统一的 8pt 媒体圆角属"未登记 token"）、`LiveInfoPanel`、`VideoIntroSection`、`ReplyDetailSheet`、`download`。**缺口：间距阶梯未定义、二级 token（媒体缩略圆角 8pt）未登记、采用率未收敛。**
**A2 材质与层次**：Liquid Glass 消费方仅 ~10 处；动态页顶栏 `backgroundColor: colors.headerBlurBg`（rgba 0.85）是**纯色假毛玻璃**（滚动内容直接消失而非透出）——"背景透明度很差"观感直接来源；128 处手写阴影漂移（动态 FAB opacity 0.2、VideoActionBar 双重定义且 shadowOpacity:1 配浅色 = 配置冲突）；分隔线一致性 ✓。
**A3 导航栏/标签栏**：导航栏层全站最 iOS ✓；**动态 Tab 图标无面性变体**（antenna.radiowaves 选中态仅靠 tintColor）；**iOS<26 底栏瞬时隐藏无动画**；**全站 0 处 modal presentation**（登录页/保存面板仍普通 push）。
**A4 动效欠账清单（7 项）**：① 视频 tab 文字粗细/颜色瞬切；② 点赞/收藏/投币无图标切换动画（仅颜色瞬变）；③ 评论排序分段背景瞬切无滑块位移；④ 动态瀑布流↔单列无 layout 过渡；⑤ 收藏/历史/稍后再看删除无收缩动画；⑥ 搜索结果分类切换数据瞬换；⑦ iOS<26 底栏显隐。
**A5 三态**：骨架 39 屏但**视频详情页首次加载、PGC 页、直播间无骨架**（spinner/黑屏）；45 屏 ActivityIndicator 与 SwiftUI ProgressView 双轨；33 份 emptyIconBox 复制粘贴无共享组件；**无统一 ErrorState、重试按钮 ≥3 种样式**；图片占位色中性灰可考虑按封面主色。
**A6 深色模式**：19 语义色双套 ✓、shadow 深色降影增边 ✓、纯黑主题 ✓；漏洞：28 处 #FB7299 + rgba 写死未校验对比度、search 热榜混用 `isDark?'#FFF':'#1C1C1E'` 而非 colors.text、LiveInfoPanel 占位 #1c1c1e 写死。完成度约 90%。

## 5.3 B 逐屏审计（B1~B19 全量）
- **B1 首页 ✅⚠️**：GlassSearchBar + 分类 bar 双列/单列流，全站最佳屏。问题：iOS<26 底栏瞬时隐藏；HomeCategoryBar 字号 17/15 硬编码、圆角 13 游离阶梯外。
- **B2 推荐流卡 ✅**：immersive/compact 两形态完整、三段入场、recyclingKey。问题：compact 数据条静态半透明黑（性能降级注释）在亮色封面上略脏。
- **B3 视频详情 ⚠️**：① 播放器与下方内容衔接生硬（无圆角/阴影/材质过渡，"拍"在白色页面上）；② VideoActionBar 阴影配置冲突 + 圆角 26 游离；③ 点赞/收藏/投币无图标动效；④ VideoIntroSection AI 摘要图标盒 #5E5CE6、UP 头像描边、关注按钮圆角 18 全硬编码；⑤ 简介展开/收起无高度动画（瞬切）。
- **B4 评论区 ❌（用户点名）**：绕过字阶（14/15/24/12/10 写死，用户调字号不生效）；圆角 9 种（9/7/10/12/18/8/10/8）全不在阶梯；`.card` 透明底+shadowOpacity 0.6 是死代码；**replyLengthLimit=6 行截断无"展开"入口**；子回复无时间/IP 属地；排序分段无滑块、点赞无弹簧。（🔁 04-B5、06-V5/V8）
- **B5 搜索输入页 ⚠️**：主体是 iOS 结构；问题：热榜标签圆角 3/4、字号 10/9 硬编码且圆角过小（廉价感来源）；热榜文字用 isDark 三元；"换一换/完整榜"两个文字按钮视觉权重打架。
- **B6 搜索结果 ✅⚠️**：iOS 26 Toolbar + SearchBarSlot、结果卡统一 RADII.md + hairline + shadow('sm')。问题：分类 tab 切换无指示器动画；直播/专栏角标圆角 4 vs 时长角标 5 不一致；用户结果行信息过少。
- **B7 动态页 ⚠️**：① **顶栏假毛玻璃**；② FAB 手写阴影 opacity 0.2 应走 shadow('lg') 或改 Glass 圆钮；③ 瀑布流↔列表切换无过渡；④ 底栏图标无面性变体。
- **B8 用户空间 ⚠️**：vipBadge 用 #FF6699（应登记 BILI.pink token）；关注按钮按下仅缩放无状态动画；头部背景无 banner/装饰图层略显空。
- **B9 收藏夹 ✅⚠️**：行删除无收缩动画；多选选中圈手绘 checkCircle 而非原生控件。
- **B10 历史 ✅**：达标，删除动画同 B9。
- **B11 稍后再看 ✅**：达标；进度条样式与视频详情页不统一（细线 vs 圆条）。
- **B12 直播间 ⚠️**：**SuperChat 区重灾区**——整段 inline style（fontSize 12/13、borderRadius 8、写死黄背景 rgba(255,182,0,0.15)、头像 24px），"直接插进来的组件"实例；LiveChatInput 3 处硬编码圆角。
- **B13 PGC ⚠️**：PgcInfoHeader 7 处硬编码色；选集格子圆角 6-8 混用；选中态实心 ACCENT 填充（iOS 26 更适合玻璃描边态）；评分星星 #FF9500 写死（应入 warning token）。
- **B14 私信会话列表 ✅**：全站第二梯队最佳；footer ActivityIndicator（次要）。
- **B15 私信详情 ⚠️**：气泡四角同圆角 20（iMessage 应区分尾巴角 4-6pt）；输入框 fontSize 15 硬编码；新消息无入场动画；时间戳/吸顶日期分隔缺失或未审计到。
- **B16 登录 ✅**：教科书级；问题：Cookie 粘贴框 RN TextInput 圆角 10/字号 13 硬编码；二维码过期态无灰罩+刷新过渡；登录成功无品牌动画。
- **B17 设置 ✅⚠️**：主页完全复刻 iOS Settings；问题：**6 处 RN 裸 Switch**（bar_set、color_select、whisper_settings、whisper_link_setting、live_dm_block、PlayerSettingsSheet×3）灰轨道绿开关与全站 ACCENT 冲突；子页 tint 28 处写死 #FB7299；color_select 20 色板硬编码（可接受但应抽常量）。
- **B18 下载页 ⚠️**：圆角 14/12/10/11 四种混用；选中圈手绘；进度条无统一 token；任务卡无 shadow 层级，页面偏平。
- **B19 排行榜/通知 ✅**：rankBadge 圆角/字号硬编码；通知 footer spinner（次要）。

## 5.4 C 整改方案（C1~C4 全量）
**C1 Token 补充**：
- 间距阶梯（新文件 `spacing.ts`）：`{xxs:2, xs:4, sm:8, md:12, lg:16, xl:20, xxl:28, page:16, section:16}`。
- 圆角补齐二级 token：RADII.xs=6（徽章/tag，替换 3/4/5/6）、sm=10、**thumb=8（所有媒体缩略图，登记 DynamicMedia 事实标准）**、md=14、card=16、lg=20、sheet=24。
- 颜色（新文件 `bili-colors.ts`，对齐 Flutter bili_colors）：BILI.pink `#FF6699`/dark `#FB7299`、pinkDim、blue、yellow、hot `#FF3B30`、new/star `#FF9500`、level 7 色等级表。
- **ACCENT 响应性修复（高优先）**：`SwiftUIHost.tsx:28` 常量改 `useAccent()` hook（订阅 accentColor/enableDynamicColor），28 处 #FB7299 字面量替换为动态值。
- 阴影：维持四档，删除 128 处手写，VideoActionBar/动态 FAB/下载卡统一 shadow('md'|'lg')。

**C2 组件返工（按优先级）**：
- P0：① CommentSection 样式层全量迁移 T.*/RADII/BILI + 删死代码 .card 阴影 + 加"展开全文" + 点赞弹簧 + 排序分段滑块；② 抽 IoSToggle 替换 6 处裸 Switch；③ useAccent() 重构 + 28 处 #FB7299 清理。
- P1：共享 EmptyState/ErrorState（收敛 33 处空态，统一重试按钮为 RADII.circle 品牌胶囊）；SuperChat 抽组件 token 化+深色校验；动态页顶栏换真 BlurView/Glass + FAB 走 shadow('lg')。
- P2：VideoActionBar 阴影修复 + RADII.sheet + 点赞/收藏/投币 spring 爆发（1→1.25→1）；VideoIntroSection/MemberHeaderCard/ReplyDetailSheet 硬编码迁移；download 圆角收敛 + 选中圈换原生 + shadow('sm')；whisper 气泡尾巴角 + 新消息入场 + 字号走 T.body。
- P3：iOS<26 底栏显隐动画、搜索结果分类指示器、列表删除收缩动画；search 热榜徽章（圆角 RADII.xs、字号 T.caption2）。

**C3 动效规范（固化数值）**：按压 spring(ratio 1, k=500) scale 0.95-0.98 / 抬起 (0.75, 400)；转场交原生 + 弹层一律 SwiftUI BottomSheet detents [medium,large] + dragIndicator；入场 250ms Easing.out(cubic) + translateY 12 + stagger 40ms 上限 10 项；图标状态切换 withSpring(damping 16, k=260) 1→1.25→1 + 颜色交叉淡入 150ms + haptic light；分段选择器滑块 spring(0.85, k=350) 禁背景瞬切；列表删除高度收缩 250ms + opacity；glassMorph 0.35s 走 animated 通道；全部保留 useReducedMotion 分支。

**C4 执行顺序**：第 1 周 P0 三项（评论区样式、Toggle 统一、useAccent）→ 第 2 周 EmptyState/ErrorState + SuperChat + 动态页材质 → 第 3 周 ActionBar/IntroSection/ReplyDetailSheet/download/whisper token 迁移 + 点赞收藏微动效 → 第 4 周动效补全 + eslint 硬编码禁制（no-restricted-syntax 禁 borderRadius 数字 / fontSize 数字 / hex，白名单仅 theme/ 与 bili-colors.ts）。

---

# 第六部分 · 导航 / 生命周期 / 错误处理 QA（06-navigation-qa 全量）

## 6.1 导航架构
- 仅根 Stack + (tabs) 两个 layout，~70 路由平铺，栈深无上限（对齐 Flutter）。
- 根 Stack 全局 headerShown:true / minimal 返回；video/live/(tabs) 自绘返回。
- **没有 `+not-found.tsx` 兜底** → push 不存在路由抛异常（dev 红屏 / release 未捕获）。P1。
- header/安全区：自绘 header 屏均正确用 insets.top；首页浮动组件 topInset 正确；mine 用 automatic、首页显式禁用自管 padding（两策略各自自洽）；`search/results.tsx:255` contentInsetAdjustmentBehavior="never" 在 iOS 26 Toolbar/SearchBarSlot 下顶部可能偏紧，**需真机 iOS 26 验证**。

## 6.2 导航缺陷（N1~N11 全量）
- **N1（P0）共享单例播放器 + 返回后不恢复源**：`PiliPlayer.shared` 被 video/pgc/download/player/live 共用；从 A push 到 B，B 卸载只 pause 不重置源；返回 A 后 A 的源加载 effect 不重跑（`use-video-playback.ts:243`）→ A 显示 B 最后一帧/黑屏、点播放播出 B 内容。**"返回上一级有问题"最大根因**。（🔁 04-3.7）
- **N2（P1）进全屏后播放被旧页 blur 暂停（竞态）**：全屏页挂载即 play，详情页 blur 在转场结束才 pause（`use-focus-aware-player.ts:64-68`）→ 进全屏视频冻结需手动点播放；push 新视频页同理。
- **N3（P1）评论排序/重试在切 P 后失效**：`use-video-comments.ts:100-102,421-445` useCallback 闭包读 `commentsLoaded` 状态，切 P 后闭包陈旧 → 点"最新/最热" setReplies([]) 后直接 return，评论区被清空且不再加载；错误态点"重试"为无操作。
- **N4（P1）通知深链 ep 链接被当 season 打开**：`notifications/index.tsx:60-62` bilibili://pgc/season/ep/(\d+) → /pgc/${epId}，但 pgc/[id] 把参数当 season_id → 接口报错显示"加载失败"无重试。
- **N5（P1）通知深链 comment_root_id 分支永不可达**：video 正则写在 comment_root_id 分支之前（`:54-57`）先命中先返回；且 `main_reply` 不读 rootId（`main_reply/[oid]/index.tsx:92`）→ 评论定位永远失效。
- **N6（P2）`/pgc/${item.businessId || item.subjectId || ''}` 可能拼出 `/pgc/`** → push 抛异常（无 +not-found）。
- **N7（P2）`av2bv(NaN)` 抛 RangeError**（`BigInt(NaN)`，`id-utils.ts:17`）：通知 subjectId 非数字 → 点击通知崩溃。
- **N8（P2）视频页 `gestureEnabled: activeTab==='intro'`**（`VideoScreenView.tsx:169`）：评论 Tab 下 iOS 边缘返回手势被禁（为避让横向 pager），只能点播放器返回键。
- **N9（P2）默认首页 replace 跳变**：`_layout.tsx:55-60` 启动先闪现首页 Tab 再 replace 到设置默认 Tab。
- **N10（P2）member/*-tab.tsx 被注册为可达路由**：`/member/article-tab` 等误导航以缺失 mid 渲染，路由污染。
- **N11（P2）深链解析能力弱**：`parseBiliUrl`（`utils/feedback.ts:87-104`）只支持 video/space/live 三种 http 链接，不解析 bilibili:// scheme、bangumi ss/ep、opus/动态/专栏；无自定义 Linking.addEventListener('url') → 外部唤端基本缺失。

## 6.3 全局错误处理
- **client.ts 无全局拦截/错误归一化**：HTTP 非 2xx 抛"原生请求失败: HTTP {status}"；业务 code!==0 完全不处理，各屏判断标准不一。建议统一 request() 包装抛 ApiError。P1（架构）。
- **首屏加载失败 = 静默空态的屏幕（7 处，全量）**：
  | 屏幕 | 位置 | 表现 |
  |---|---|---|
  | 首页推荐 | `use-rcmd-feed.ts:301-302` | catch 只 console.error，空列表无提示 |
  | 动态 Tab | `use-dynamic-feed.ts:89-91` | 同上 |
  | 历史记录 | `history/index.tsx:131` | 同上 |
  | 搜索结果 | `search/results.tsx:178-179` | setResults([]) 把网络错误伪装成"无搜索结果" |
  | PGC 详情 | `pgc/[id].tsx:128-130,428-430` | 显示"加载失败"文字但无重试按钮 |
  | 直播间 | `live/[roomId].tsx:333` | catch 只 console.error，渲染空壳页 |
  | 我的页统计 | `mine.tsx:48-52` | catch(()=>{}) 静默（次要） |
- **其他**：评论 loadMoreReplies 失败只 console.error（`use-video-comments.ts:266-268`）；**视频 loadVideo 3 次重试耗尽后无错误 UI**（loading=false、info=null → 半空白页，仅取流分支 toast）；视频页 loading 态只有居中 spinner 无标题/骨架且加载期间无返回按钮（headerShown:false）。
- 有完整错误态+重试的：member/[mid]、main_reply、usePagedList 系、CommentSection、动态详情评论区。

## 6.4 逐屏缺陷（全量）
**首页 (tabs)/index**：
- H1（P1）首屏失败静默空态。
- H2（P2）未登录点头像 → `/member/0`（`userInfo?.mid || 0`）打开 mid=0 空间页报错。
- H3（P2）切分类先 setVideos([]) 再请求（`use-rcmd-feed.ts:315-323`）→ 白屏闪烁；失败停留空列表。修复：先请求后替换。
- H4（P2）handleEndReached 依赖 loading/refreshing 防重入，状态更新异步极端快速滚动可能并发两次（有 cancelToken 兜底，影响小）。

**动态 (tabs)/dynamics**：D1（P1）失败静默空态；D2 未登录仅登录按钮（可接受）。

**我的 mine**：统计失败静默（P2）；其余健康（账号切换/登出有确认与 toast）。

**搜索（用户点名）**：
- S1（P1）结果页失败 setResults([]) 伪装"无搜索结果"。
- S2（P2）onEndReached 用 page state 无 busy 守卫，惯性滚动重复请求同页。
- S3（P2）**搜索建议浮层不是浮层**：suggestCard 在普通文档流（`search/index.tsx:167-183`），输入时把下方热搜/历史整体推下去——"很难看"直接来源之一。修复：绝对定位浮层。
- S4（P2）iOS 26 排序入口重复（Stack.Toolbar.Menu + SearchTypeTabs 排序行）。
- S5（P2）SearchResultList 缓存 effect 依赖 displayResults 每次结果更新都写缓存。
- S6（P2）结果页改词搜索后 URL 不变，返回再进入回到旧词（预期内但不直观）。

**视频详情 video/[id]**：
- V1（P0）返回后播放源不恢复（= N1）。
- V2（P1）进全屏 blur 暂停竞态（= N2）。
- V3（P1）切 P 后评论排序/重试失效（= N3）。
- V4（P1）loadVideo 重试耗尽无错误 UI。
- V5（P1）**评论/回复输入框无键盘规避**：整个视频页无 KeyboardAvoidingView；FlashList 不避让 → 键盘遮挡输入框（"评论区显示效果不全"直接来源之一）。
- V6（P1）ReplyDetailSheet 底部输入框在 SwiftUI BottomSheet 内无键盘规避，medium detent 下输入框大概率被键盘盖住。
- V7（P2）CommentSection 未传 oid/type props，评论为空/失败时 subjectOid=0 → 发评论提示"评论主体信息缺失"。
- V8（P2）评论文本硬截断 6 行无"展开"入口；楼中楼预加载只覆盖前 6 条可视评论，展开失败静默 → 少量评论无楼中楼预览也无提示。
- V9（P2）renderReply useCallback 依赖 replyText/replyImage/replyingTo/sendingReply（`CommentSection.tsx:705`）——行内回复每输入一个字符重建整个 FlashList renderItem → **输入卡顿**。
- V10（P2）评论行整行 `Press onPress={() => {}}`（`:910`）点评论无反应（Flutter 版点击进楼中楼）。
- V11（P2）`useSettingsStore.getState()` 在 render 期读取（`use-video-controller.ts:1129`）设置变更不触发重渲染。
- V12（P2）合集选集跳新视频用 push → 栈增长 + 触发 N1/N2。

**全屏 video/fullscreen**：
- F1（P1）blur 暂停竞态。
- F2（P2）`presentFullscreenAsync().catch(err => { if (!cancelled) throw error })`（`fullscreen.tsx:243-249`）catch 内 throw → unhandled rejection。
- F3（P2）全屏页 gestureEnabled:false 退出路径受限（可接受但需知晓）。
- F4（P2）**全屏内 changeQuality 后未把新 playUrl 写回 fullscreenState**（`use-fullscreen-player.ts:533-550`）→ 退出全屏清晰度悄悄回退。

**评论详情 main_reply/[oid]**：
- M1（P1）不支持 rootId 定位（= N5）。
- M2（P2）点赞初始态错误用 `up_action.like`（"UP 主觉得很赞"）映射 action（`:127`）→ UP 赞过的评论显示成"我已赞"，再点赞实际取消赞。
- M3（P2）取消赞发 action:2（踩）而非撤销语义（低风险）。
- M4（信息）useScrollToTop 绑定 any ref 功能正常。

**动态详情/发动态**：删除后 router.back() 正确；create 无 KeyboardAvoidingView，仅 keyboardShouldPersistTaps，长文本编辑键盘遮挡风险（P2）。

**直播 live/[roomId]**：
- L1（P1）loadRoom 失败无错误态/重试，渲染空 info 页。
- L2（P1）直播共用共享播放器与视频互踩（N1 家族）：从直播返回视频页源不恢复。
- L3（P2）弹幕 socket 错误仅 console.error，用户无感知弹幕断连。

**PGC pgc/[id]**：
- G1（P1）"加载失败"无重试按钮。
- G2（P1）共享播放器返回源不恢复（N1）。
- G3（P1）parseInt(id) 对 ep_id 深链（N4）返回错误内容。

**收藏 fav**：fav/[fid] 每次 focus 都 refresh（`:100-107`）→ 返回整列表重新拉取、位置跳动、重复请求（P2）；playAll 有守卫 ✓。

**空间 member**：有 TabError+重试 ✓；`parseInt(mid)` 对 /member/0 得 NaN → 请求必然失败 → TabError。建议入口拦截 mid<=0（P2）。

**通知**：见 N4~N7；首焦不刷新、再聚焦刷新合理。

**私信**：有 KeyboardAvoidingView ✓；JSON.parse 均在 try 内 ✓。

**下载 download/player**：复用共享播放器卸载仅 pause（`download/player/index.tsx:34-39`）→ 返回列表再进视频页踩 N1（P1）。

**登录**：completeLogin 后 back/replace 正确；错误态完整 ✓。

## 6.5 屏幕生命周期汇总
- 返回后列表位置：tab 页组件不卸载位置保留 ✓；fav/[fid]、notifications 聚焦即 refresh 造成位置跳动（P2）。
- useFocusEffect 全部 useCallback 包裹，依赖基本正确；use-video-controller.ts:310-337 依赖 [videoStarted] 为有意设计。
- 卸载清理普遍有 abort/定时器清理；**缺口：视频页卸载未重置共享播放器源（N1 根因）**。

## 6.6 崩溃隐患（C1~C7 全量）
- **C1** `BigInt(NaN)` RangeError（`id-utils.ts:17`）：通知 subjectId/任何 NaN aid 传入 av2bv 即抛。修复：入口 Number.isFinite 校验。
- **C2** expo-router push 未知路由抛异常且无 +not-found：拼接型 href（`/pgc/${x}`、`/member/${x}`）缺空值守卫。
- **C3** fullscreen present 失败 catch 内 throw → unhandled rejection（dev 红屏）。
- **C4** 共享播放器多屏争用：push 视频 B 时 A 未卸载，两个 PiliPlayerView 同时 attach 同一原生播放器 → 原生 AVPlayer layer 双附着行为未定义，偶发黑屏/画面错乱风险源。
- **C5** `as any` 158 处 + 非空断言 13 处（均有守卫）：`router.push(x as any)` 绕过 typedRoutes，路由拼写错误推迟到运行时。
- **C6** JSON.parse 全部 try/catch ✓ 无问题。
- **C7** 渲染期调用原生单例 setter（= 01-R5、04-3.7）：StrictMode/React Compiler 下重复执行；当前幂等无实害，移入 effect。

## 6.7 状态管理
- zustand 划分合理（auth/settings/player/tab-bar），auth 多账号+匿名+Keychain 完整，settings 快照 debounce + SecureStore 分离 webdav 密码——质量好。
- **跨屏真正问题是播放器**：播放态未收敛到 store，靠原生单例 + `fullscreenState`"写一次-读一次-清空"隐式协议（`player.ts:67-70`、`use-video-controller.ts:310-337`），绕过消费即残留脏状态。建议：当前播放源+归属屏幕纳入 store，focus 时按归属恢复源（同时解决 N1）。
- RootLayout 在 authInit/settingsInit 前渲染 → hydrate 后可能闪一次主题（P2）。
- 登录态切换后无全局导航重置：登出时深屏靠响应式 isLoggedIn 降级，栈中个人数据屏不主动弹出（P2）。

## 6.8 代码质量
- eslint 仅默认集无自定义规则；**3 个核心文件头部 `eslint-disable react-hooks/exhaustive-deps`**（use-video-controller/use-video-comments/use-video-playback）——恰好是闭包陈旧 bug（N3）高发区，复核后移除。
- 巨型组件：CommentSection 1170 行、use-video-controller 1277 行、use-fullscreen-player 674 行、ReplyDetailSheet 600 行；**CommentSection 与 ReplyDetailSheet 的点赞/踩/删除/置顶/图片上传/发回复逻辑几乎逐行重复**，建议抽公共 hook。
- typedRoutes 被 as any 大量绕过；React Compiler 实验开启 + 'use no memo' 局部豁免——注意与手动 memo 交互。

## 6.9 修复优先级（06 §8 全量）
**立即（P0/P1）**：① N1/V1 播放器源恢复（store 记录源归属 + focus 时校验恢复，或 push 视频页改 replace）；② N2/F1 blur 暂停竞态豁免（push 前打 handoff 标记，blur 时跳过 pause）；③ N3 评论闭包用 ref 读状态；④ N4/N5/N6/N7 通知深链（正则顺序、ep→season 查询、空值守卫、av2bv 校验、main_reply rootId 定位）；⑤ 全局 ErrorState + client.ts code!==0 归一化 + 7 屏静默失败接入；⑥ V5/V6 键盘规避（KeyboardAvoidingView / detent 切换）。
**短期（P2）**：⑦ +not-found + 拼接 push 校验辅助函数；⑧ 搜索结果错误/空态区分 + 建议浮层绝对定位 + iOS26 排序去重；⑨ fav focus 刷新改参数触发 + 首页先请求后替换；⑩ CommentSection 输入状态下沉行组件 + 点击评论进楼中楼；⑪ 全屏切画质回写 playUrl；⑫ member/*-tab 移出 app。
**长期**：⑬ 播放态收敛进 store（源归属+进度）替代 fullscreenState 一次性协议；⑭ 拆分 CommentSection/ReplyDetailSheet 公共逻辑、收敛 as any、恢复 exhaustive-deps lint。

---

# 第七部分 · 交叉关联发现（同一根因被多个专家命中）

| 根因 | 报告交叉 | 一句话 |
|---|---|---|
| PGC 播放失败 | 03-R1 + 04-3.9 + 06-G1/G2 | 字段解析错（res.data vs result.video_info）+ fnval=4048 纯 DASH 无声 + 无错误 UI/重试，三层叠加 |
| 评论区显示不全 | 04-B5 + 05-B4 + 06-V5/V6/V8 | 滚动-布局耦合 + 样式全硬编码/6 行截断无展开 + 键盘遮挡 + emote 缺失（02） |
| 全屏播放器 | 04-B1~B4 + 06-N2/F1~F4 | 旋转从未生效（app 锁 portrait）+ 控制层全屏铺排 + 双 HUD + blur 竞态 + 状态恢复双路径 |
| 共享播放器源不恢复 | 06-N1/V1/L2/G2 + 04-3.7 + 01-M1 | 单例被 5 屏共用、卸载不重置源/不清 item、60s 缓冲常驻 |
| 弹幕质量 | 01-A2/A3/S2 + 04-B6 | 隐式动画风暴 + 120Hz + 无池化 + mode 2/3 丢弃 + 队头阻塞 + setHeight 清屏 |
| 心跳 5s 双实现 | 01-B1 + 04 架构 | JS 5s 定时 ×2 份，应 15s 或移原生 |
| ACCENT 断裂 | 01-R6 + 05-C1/C2 | 模块级快照 + 28 处 #FB7299 → 改主题色不生效 |
| 渲染期副作用 | 01-R5 + 04-3.7 + 06-C7 | 渲染体调原生单例 setter，StrictMode/Compiler 双执行 |
| 直播接口未签名 | 03-R3 + 02 直播 tab | appSign 缺失 → 直播 feed/分区空 |
| 错误处理缺失 | 06-2.2 + 05-A5 + 03-R2 | 7 屏静默失败 + 无统一 ErrorState + 风控 -352 放大 |
| 播放器高度逐帧耦合 | 04-B5 + 06 生命周期 | FlashList 视口逐帧变化 → 空白/欠渲染 |

---

# 第八部分 · 统一修复路线图（合并去重，按执行批次）

> 批次按"先止血（数据/功能可用）→ 再架构（播放器/导航）→ 后体验（设计/动效/性能打磨）"组织。每个任务标注来源报告编号。

## 批次 1：止血 —— 恢复"无法加载"与播放器基本可用（本周）
| # | 任务 | 来源 |
|---|---|---|
| 1 | PGC 播放修复：`res.result.video_info` 解析 + fnval=0 止血 + 错误 UI/重试 | 03-R1、04-P0、06-G1/G3 |
| 2 | 直播 app-interface 补 appSign + app-key:android 头 | 03-R3 |
| 3 | 音乐接口参数修复（music_id/state/csrf/WBI/relation_from） | 03-R5 |
| 4 | grpcUnary 补 6 组 x-bili-*-bin + authorization 头（whisper_block 恢复） | 03-R4 |
| 5 | web 请求全局补 baseHeaders/aurora/mid/UA 对齐（消除间歇性 -352） | 03-R2 |
| 6 | 搜索补 origin/referer + v_voucher 解锁链 | 03-R6 |
| 7 | buvid 激活报文 payload 包裹 | 03-R7 |
| 8 | 全屏旋转修复：expo-screen-orientation 接管 + 修正/移除原生旋转时机 | 04-B1 |
| 9 | 共享播放器源恢复（store 记源归属 + focus 校验恢复） | 06-N1/V1 |
| 10 | blur 暂停竞态豁免（handoff 标记） | 06-N2/F1 |
| 11 | 播放 error 事件接入重试 UI + buffering 状态 | 04-P0、04-3.4 |
| 12 | 评论闭包 bug（N3）+ 切 P 后评论区失效 | 06-N3/V3 |
| 13 | av2bv NaN 校验 + +not-found 路由 + 拼接 push 守卫（崩溃三连） | 06-C1/C2/N6/N7 |
| 14 | 评论/回复键盘规避 | 06-V5/V6 |

## 批次 2：架构 —— 播放器、导航、错误处理体系（1~2 周）
| # | 任务 | 来源 |
|---|---|---|
| 15 | 播放器高度与评论滚动解耦（absolute sticky + paddingTop 方案） | 04-B5 |
| 16 | 全屏手势单一事实源（废除双系统并存） | 04-B6-5、03-3.3 |
| 17 | 画面模式（gravity contain/cover/fill 直通 UI + 双击切换）+ 竖屏视频竖屏全屏 | 04-B3/B4 |
| 18 | DLNA 投屏暂停本机/停投恢复 | 04-3.6 |
| 19 | 直播退出复位共享会话参数 + 直播全屏 | 04-3.8 |
| 20 | 通知深链全修（正则顺序、ep→season、rootId 定位、空值守卫） | 06-N4/N5/M1 |
| 21 | client.ts 统一错误归一化（ApiError）+ 全局 ErrorState/EmptyState 组件 + 7 屏接入 | 06-2.x、05-C2 |
| 22 | replaceAsync(null) 放开 + 页面卸载清 item | 04-3.7 |
| 23 | 全屏状态收敛 store 单一路径回写（含切画质回写 playUrl） | 04-3.2、06-F4、06-6 |
| 24 | 搜索建议浮层绝对定位 + 结果页错误/空态区分 | 06-S1/S3 |

## 批次 3：性能与内存 —— 冲刺 100MB（2~3 周）
| # | 任务 | 来源 |
|---|---|---|
| 25 | 弹幕 CATextLayer 隐式动画修复 + 池化 + 120Hz 限 60fps | 01-A2/A3/S2 |
| 26 | bufferSec 默认 60→15~20s（蜂窝 8~10s） | 01-M1 |
| 27 | 心跳 5s→15s + 收尾补报 + 两份收敛为一个 util（或移原生） | 01-B1 |
| 28 | expo-image 缓存 96MB→32MB | 01-M2 |
| 29 | 弹幕三份驻留收敛（token 引用留原生）+ 原生缓存 8→2~3 | 01-M3 |
| 30 | FlashList v1 props → v2 等价（drawDistance/overrideProps）+ 删类型 augmentation | 01-L1 |
| 31 | URLCache 16→4~8MB + collapseBlur 条件卸载 | 01-M4/A4 |
| 32 | 动态 getItemType + history key 稳定 + feed 上限 400 | 01-L2/L3/M5 |
| 33 | 收起态进度条改用原生 PiliPlayerProgressBar | 01-R4 |
| 34 | 渲染期副作用移入 effect（三处） | 01-R5、06-C7 |
| 35 | enableHttp2、Image.configureCache 合并、迁移标记短路 | 01-B3/T2 |

## 批次 4：体验 —— 设计系统收敛 + 动效（3~6 周，对齐 05-C4 排期）
| # | 任务 | 来源 |
|---|---|---|
| 36 | CommentSection 样式全量迁移 + "展开全文" + 点赞弹簧 + 分段滑块 | 05-B4/C2 |
| 37 | IoSToggle 替换 6 处裸 Switch | 05-C2 |
| 38 | useAccent() 重构 + 28 处 #FB7299 清理 | 05-C1 |
| 39 | 共享 EmptyState/ErrorState 收敛 33 处 + 重试按钮统一 | 05-C2 |
| 40 | SuperChat 抽组件 token 化 + 动态页真毛玻璃 + FAB shadow('lg') | 05-C2 |
| 41 | VideoActionBar/VideoIntroSection/ReplyDetailSheet/download/whisper token 迁移 + 点赞收藏投币 spring 动效 | 05-C2 |
| 42 | iOS<26 底栏动画、分段滑块、列表删除收缩动画 | 05-C3 |
| 43 | 间距/二级圆角/颜色 token 登记 + eslint 硬编码禁制 | 05-C1/C4 |
| 44 | 深色模式 10% 硬编码清理 | 05-A6 |

## 批次 5：功能移植补齐（按 02-§4 优先级，穿插进行）
- P0：投币面板（1/2 币 + 长按三连）、收藏文件夹选择面板接入视频页、选集面板完善、emote 文本渲染 → 表情面板
- P1：弹幕设置补齐、动态 4 Tab 筛选 + 动态详情内联播放、下载体系升级
- P2：播放列表 medialist、番剧索引 + 时间表、私信长按菜单、AI 大纲面板
- P3：专栏阅读器、音频/音乐页、member_like_arc、contact/share 选人、搜索综合 Tab、match 详情、PiP 设置、界面缩放

---

# 第九部分 · 验证方法（所有批次完成后）

- 内存：Instruments（Allocations + VM Tracker + Memory Graph）在 iPhone 12/13（4GB）跑"冷启动 → 刷首页 5 分钟 → 播放 1080p 10 分钟 → 退出"全链路，100MB 设 CI 软阈值。
- 性能：Time Profiler 验证弹幕 CPU、滚动帧率（FPS 打点）、省电用 Xcode Energy Log。
- 功能：对照 02-feature-parity.md 大表逐屏验收；对照 03-api.md 接口清单回归；播放器按 04-§5 清单回归。
- 设计：按 05-C2/C3 清单逐屏走查（含 iOS 26 真机 + iOS 17 回退验证）。
- 导航：按 06-§8 清单 + 深链矩阵（bilibili://video/av/BV/ep/opus + piliplus://）回归。

---

*附录：各子报告完整版路径（同目录）*
- `01-performance.md` —— 性能与内存（预算表 / 10 维度 / Top10）
- `02-feature-parity.md` —— 功能移植（167 条全量对照大表）
- `03-api.md` —— API 网络（接口对账 / gRPC 方案 / R1~R11）
- `04-player.md` —— 视频播放器（B1~B6 根因与修复 / 目标架构）
- `05-ios-design.md` —— iOS 设计（A/B/C 三章全量）
- `06-navigation-qa.md` —— 导航 QA（N/C/H/S/V/F/M/L/G 系列全量）
