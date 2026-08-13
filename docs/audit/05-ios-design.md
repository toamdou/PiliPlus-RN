# 05 · iOS 视觉与动效质量审计报告

> 审计对象：`piliplus-RN`（expo-router + RN 0.8x，109 个路由 / 274 个 ts/tsx 源文件）
> 对照基线：Flutter 原版 `PiliPlus`（lib/common/style.dart、lib/common/skeleton/、lib/utils/bili_colors.dart）
> 审计日期：2026-08-13 ｜ 方式：只读源码审计（视觉 token 统计 + 逐屏走查）
> 审计视角：Apple HIG / iOS 26 Liquid Glass / 设计系统（design tokens）

---

## 0. 总体结论（先说重点）

**这个仓库不是"没有设计系统"，而是"设计系统已建成约 70%，但长尾屏幕没有吃干净"。**

`src/theme/tokens.ts`（RADII 圆角阶梯 / shadow 分层 / DYN 动态色 / GLASS 预设 / DURATION）、
`semantic-colors.ts`（19 个语义色双套明暗）、`type-scale.tsx`（iOS Dynamic Type 字阶）、
`motion.tsx`（Press 弹簧按压 / Reveal 入场 / useScrollHide，全部响应减弱动态效果）
这一套基础设施的质量**明显高于 Flutter 原版**，且核心屏幕（首页、推荐流、搜索、私信列表、我的、设置主页、视频详情骨架）已达到 iOS 原生级质感：

- 92/109 屏使用 `Stack.Header blurEffect="systemMaterial"` 真毛玻璃导航栏；
- 67 屏使用 `Stack.Title large` 大标题；
- 143 个文件使用 `Press`（弹簧按压+触觉），裸 `TouchableOpacity` 仅剩 1 处；
- 39 屏使用共享骨架屏；Slider/Picker/Form/List 大量走 `@expo/ui` SwiftUI 原生控件；
- 首页 TabBar 在 iOS 26+ 走原生 `minimizeBehavior="onScrollDown"` 液态玻璃收缩。

用户"拼凑感"的真实来源是 **长尾漂移**，集中在六处：

1. **硬编码魔法数字仍然成规模**：289 处硬编码 `borderRadius`（RADII 采用率仅 53%）、104 处硬编码 `fontSize`、663 处硬编码 hex 颜色。重灾区是 `CommentSection`、`LiveInfoPanel`、`VideoIntroSection`、`download`、`ReplyDetailSheet` —— 恰好都是用户每天盯着的屏幕。
2. **主题色（accent）响应机制是断的**：`ACCENT` 是模块加载时求值一次的常量，设置页换主题色后 28 处硬编码 `#FB7299` 与所有 `import { ACCENT }` 的组件都不跟随，直到重启。
3. **原生控件未 iOS 化**：6 个文件使用 RN 默认 `Switch`（无 tint、灰轨道），就是典型的"直接插进来的控件"。
4. **空状态/错误态复制粘贴**：`emptyIconBox`（84px 圆图标+标题+副标题）在 33 个文件里各写一遍，重试按钮样式互不一致。
5. **材质叙事不完整**：Liquid Glass 只出现在约 10 处；动态页顶栏"毛玻璃"是纯色 rgba 假装；视频页 tab 切换、评论排序分段、点赞收藏均无过渡动画。
6. **评论区（用户点名）**：完全绕过字阶与圆角阶梯，`replyLengthLimit=6` 行截断且无内联"展开"，即"显示效果不全"的直接原因。

---

## A. 全局设计系统审计

### A1. Token 体系与采用率

已定义的 token（`src/theme/tokens.ts` / `semantic-colors.ts` / `type-scale.tsx`）：

| Token 族 | 已定义阶梯 | 评价 |
|---|---|---|
| 圆角 RADII | sm 10 / md 14 / card 16 / lg 20 / sheet 24 / circle 999，统一 `borderCurve:'continuous'` | 阶梯合理，贴合 iOS 26 |
| 阴影 shadow() | sm / md / lg / glass 四档；深色模式自动降影+0.5px 微亮边 | 设计正确 |
| 颜色 DYN + SEMANTIC_COLORS | label/secondary/tertiary/quaternary、separator、fill1-3、card/elevatedCard、bg、cardBorder、headerBlurBg，全部 light/dark 双套 | 完整 |
| 字阶 useType() | largeTitle 34 → caption2 11 共 11 级，随设置 fontSize 缩放，letterSpacing/lineHeight 按 iOS 规则 | 完整且考究 |
| 间距 | **未定义** | 缺口（见 C1） |
| 动效 MOTION | spring/springBouncy、duration 150/250/350、stagger 40ms | 已定义 |
| 玻璃 GLASS | bar / circleButton / playerControl / toast 四预设 | 已定义但采用率低 |

**采用率实测（grep 统计，src/ 全量）：**

| 指标 | token 化 | 硬编码 | 采用率 |
|---|---|---|---|
| 圆角 | `RADII.` 327 处 | `borderRadius: 数字` 289 处 | 53% |
| 字号 | `useType()` 124 文件 | `fontSize: 数字` 104 处 | 尚可但重灾区致命 |
| 颜色 | `useThemeColors` 普及 | hex 663 处 / rgba 154 处 | 偏低 |
| 阴影 | `shadow(…)` 101 处 | `shadowColor` 硬编码 128 处 | 44% |
| 品牌粉 | `colors.accent` | `#FB7299` 字面量 28 处 | — |

硬编码热点文件 TOP（hex 颜色 / borderRadius）：

- `app/settings/index.tsx`（23 色）、`app/(tabs)/mine.tsx`（21 色，多为菜单图标色——这类"iOS 设置图标色"可接受，但应收入 token）、`app/settings/color_select.tsx`（20 色）
- `components/CommentSection.tsx`（19 处圆角 + 全套字号硬编码）
- `components/dynamics/DynamicMedia.tsx`（16 处圆角，实际是统一的 8pt 媒体圆角，属"未登记的 token"而非混乱）
- `components/live/LiveInfoPanel.tsx`、`components/video/VideoIntroSection.tsx`、`components/ReplyDetailSheet.tsx`、`app/download/index.tsx`

**结论**：token 定义齐全，缺的是①间距阶梯 ②"媒体缩略圆角 8pt"这类二级 token 的登记 ③采用率收敛到 100% 的清理动作。

### A2. 材质与层次

- **Liquid Glass（expo-glass-effect）**：统一封装在 `components/Glass.tsx`（variant/colorScheme/animated 约定齐全），但实际消费方仅约 10 处：`GlassSearchBar`、`GlassCard` 分类胶囊、搜索建议浮层、`LiveInfoPanel`、播放器控件（`VideoOverlay`/`GlassCircle`/`VideoPlayerStage`）、`HomeFeedList` 刷新标记。大量本可玻璃化的表面（toast 已走原生、但各页 floating 工具条、评论区排序条、动态页顶栏）仍是实心 View。
- **BlurView（expo-blur）**：全仓仅 4 处引用（GlassCard 磨砂层注释提到、VideoOverlay、VideoPlayerStage）。动态页顶栏 `backgroundColor: colors.headerBlurBg`（rgba(242,242,247,0.85)）是**纯色假毛玻璃**，内容滚到下面直接消失而非透出模糊——这是"背景透明度很差"观感的直接来源之一。
- **阴影**：`shadow()` 四档语义正确且深色模式处理得当；但 128 处手写阴影漂移（如 `dynamics.tsx` FAB 手写 opacity 0.2；`VideoActionBar` 样式表与内联双重定义阴影且 `shadowOpacity:1` 配浅色 shadowColor，属配置冲突）。
- **分隔**：列表 hairline 统一走 `colors.separator` + `StyleSheet.hairlineWidth`，一致性好；卡片分隔用 16pt 外间距 + 圆角卡，符合 iOS grouped 规范。

### A3. 导航栏与标签栏

- **导航栏**：92 屏 `Stack.Header blurEffect="systemMaterial"` + 67 屏大标题 + `headerBackButtonDisplayMode:'minimal'`，滚动收缩由系统处理——这一层是全站最 iOS 的部分。
- **搜索栏**：`Stack.SearchBar` 原生 UISearchBar 用于搜索输入/结果等 10 屏，正确。
- **TabBar**：`NativeTabs` + SF Symbols 线性/面性切换（house/house.fill、person/person.fill）+ iOS 26 `minimizeBehavior`；**但动态 Tab 图标选中/未选中是同一个 `antenna.radiowaves.left.and.right`，没有面性变体**，选中态仅靠 tintColor，弱于其他两个 Tab。
- **iOS < 26 回退**：底栏显隐用 `hidden` prop 瞬时切换，无动画——旧系统上底栏"闪没闪回"，是过渡动画差评来源之一。
- **模态**：全站 0 处 `presentation:'modal'|'formSheet'`。所有弹层内容（账号切换、播放器设置、收藏夹选择、回复详情）用 SwiftUI `BottomSheet + presentationDetents`（有 medium/large detents、dragIndicator，这部分正确）；但登录页、保存面板等仍是普通 push，缺少 iOS 层级叙事。

### A4. 动效体系

已有：`Press` 弹簧按压（按下临界阻尼 ratio1/500、抬起欠阻尼 0.75/400）+ 触觉分级、`Reveal` 入场淡入上移（stagger 40ms）、`useScrollHide` 顶栏弹簧隐藏、`GlassCard` 封面 1.05→1/胶囊弹入/文字上浮三段入场、视频详情 tab 指示器弹簧滑动、首页搜索栏滚动折叠。全部响应 `useReducedMotion`——动效基建是专业的。

**完全没有过渡动画的交互（欠账清单）：**

1. 视频详情"简介/评论" tab 内容切换：横向 pager 有滑动，但 **tab 文字粗细/颜色是瞬切**，指示器之外的页面无淡入。
2. **点赞/收藏/投币无图标切换动画**：`VideoActionBar` 与评论区点赞仅颜色瞬变，无 spring 缩放/爆发动画（B 站/Apple 照片的标准微动效），也无 success haptic 之外的视觉奖励。
3. 评论区排序分段（最热/最新）：背景色瞬切，无滑块位移。
4. 动态瀑布流 ↔ 单列切换：`key` 直接换列表，无 layout 过渡。
5. 收藏/历史/稍后再看的删除：行直接消失，无 `removingItem` 收缩动画（FlashList 支持）。
6. 搜索结果分类切换：数据瞬换（有缓存兜底但无淡入）。
7. iOS<26 底栏显隐（见 A3）。

### A5. 加载 / 空 / 错误三态

- **骨架屏**：`Skeleton.tsx`（SkeletonCard/Row/MediaRow，900ms 单程脉冲、reduced-motion 静态化）覆盖 39 屏，且动态页有专用 `DynamicSkeleton`。对照 Flutter 原版 11 个按内容类型定制的骨架（video_card_v/h、dynamic_card、whisper_item、video_reply…），RN 版用 3 个通用骨架覆盖，形态略简单但统一性更好。**缺口**：视频详情页首次加载、PGC 页、直播间无骨架（用 spinner 或黑屏占位）。
- **加载指示器不统一**：45 个屏幕用 RN `ActivityIndicator`，其余用 SwiftUI `ProgressView`。二者在 iOS 上都渲染为系统 spinner，视觉差异小，但代码双轨；且部分页面首屏加载只有 footer spinner 没有骨架（coin_log、exp_log、bubble 等已补骨架，member_search 等没有）。
- **空状态**：33 个文件各自实现同一套 84px 圆图标+标题+副标题（`emptyIconBox`），文案与图标漂移（"暂无私信/暂无动态/无搜索结果/暂无评论"），无共享组件、无插画、无引导按钮（仅 LoginGate 是共享的）。
- **错误态**：无统一 ErrorState；重试按钮至少 3 种样式（CommentSection 灰底圆角 8、search_trending 品牌粉底 RADII.lg、部分页只有文字）。
- **图片加载**：expo-image 统一 `backgroundColor: colors.fill2` 占位色（正确，避免白块闪烁），有意不做淡入（注释说明为滚动性能）；头图/查看器有 transition。策略合理，但占位色是中性灰，B 站封面色彩丰富，可考虑按封面主色或更浅的 fill3。

### A6. 深色模式完整性

- 语义色 19 项全部 light/dark 双套；`shadow()` 深色自动降影增边；支持"纯黑主题"（`isPureBlackTheme`，卡片压到 #000）；播放器/图片查看器 `forceDark` 恒深。
- **漏洞**：① 28 处 `#FB7299` 与大量 `rgba(251,114,153,·)` 直接写死，深色下对比度未校验；② 个别屏混用 `isDark ? '#FFFFFF' : '#1C1C1E'` 而不用 `colors.text`（search 热榜）；③ `LiveInfoPanel` 播放占位 `#1c1c1e` 写死。整体深色模式完成度约 90%，剩 10% 是硬编码清理。

---

## B. 逐屏审计

> 评级：✅ 达标（iOS 原生质感） / ⚠️ 有局部问题 / ❌ 需要重做局部

### B1. 首页 tabs（(tabs)/index.tsx）✅⚠️
悬浮 GlassSearchBar（头像玻璃圈+搜索 pill+通知铃）+ 分类 bar + 双列/单列流，滚动折叠顶栏弹簧驱动，是全站最佳屏幕。
问题：① iOS<26 底栏瞬时隐藏；② 分类 chip（HomeCategoryBar）字号 17/15 硬编码、圆角 13 游离于阶梯外；③ 下拉刷新仅触觉+系统 UIRefreshControl，无品牌化刷新动画（可接受）。
修复：分类 chip 改用 `RADII.circle` 胶囊 + T.subhead；旧系统底栏加 translate 动画。

### B2. 推荐流卡片（GlassCard）✅
immersive 单列（磨砂+渐变压字+玻璃分类胶囊）与 compact 双列（渐变数据条）两种形态完整，入场三段动画、recyclingKey 防封面残留、CDN 降采样。
问题：① compact 数据条是静态半透明黑（注释承认是性能降级）——在纯亮色封面上略脏，建议恢复为轻量 LinearGradient 或提高黑底透明度自适应；② 长按菜单走 Link.Menu 原生，正确。

### B3. 视频详情页（video/[id]）⚠️（重点）
播放器钉住/收起、CollapsedPlayerBar、弹簧 tab 指示器、SwiftUI 设置 sheet——架构好。
问题：① **播放器与下方内容衔接生硬**：播放器槽位与 tab 栏之间无圆角/阴影/材质过渡，视频区直接"拍"在白色页面上；建议播放器容器底部加 `RADII.md` 下圆角或让 tab 栏玻璃化。② **VideoActionBar 阴影配置冲突**（样式表 shadowColor rgba(0,0,0,0.08)+shadowOpacity 1 vs 内联 colors.shadowColor），圆角 26 游离阶梯；应改 `shadow('md')` + `RADII.sheet`。③ 点赞/收藏/投币无图标动效（见 A4-2）。④ VideoIntroSection：AI 摘要图标盒 `#5E5CE6`、UP 头像描边 `rgba(251,114,153,0.3)`、关注按钮圆角 18 全部硬编码。⑤ 简介展开/收起无高度动画（瞬切）。

### B4. 评论区（CommentSection.tsx）❌（用户点名）
功能全（搜索/楼中楼/投票/图片/草稿），但视觉是全站最大欠账：
- **绕过字阶**：replyName 14、replyMsg 15/24、replyTime 12、levelText 10 全部写死，用户调字号不生效；
- **圆角乱**：sortSegment 9、sortSegBtn 7、searchRow 10、composerRow 12、card 18、replyPic 8、subReplyBox 10、voteOption 8——9 种圆角没有一个在 RADII 阶梯上；
- **`.card` 样式无效**：`backgroundColor:'transparent'` 配 `shadowOpacity:0.6`，iOS 上透明视图不产生阴影，纯死代码，还说明卡片容器到底要不要底色没想清楚；
- **"显示不全"根因**：`replyLengthLimit` 默认 6 行截断（`numberOfLines`），被截断的评论**没有"展开"入口**，只能进楼中楼 sheet；子回复（楼中楼预览）没有时间/IP 属地，信息密度与主评论不对称；
- 排序分段无滑块动画；点赞无弹簧动画。
修复：整块样式迁移到 T.* + RADII（卡片 RADII.lg、内嵌框 RADII.sm/md、图片 RADII.sm），被截断评论尾部渲染"展开"文字按钮，点赞图标 withSpring 缩放+颜色。

### B5. 搜索输入页（search/index.tsx）⚠️
原生 UISearchBar + Glass 建议浮层 + 三段卡片（热榜/历史/发现），结构是 iOS 的。
问题：① 热榜标签 hotTag 圆角 3/4、字号 10、"默认词"tag 字号 9——小徽章体系全部硬编码且圆角过小（iOS 徽章至少 4-5pt）；② 热榜文字用 `isDark?'#FFF':'#1C1C1E'` 而非 colors.text；③ "换一换/完整榜"两个文字按钮并排，视觉权重打架，建议合并为一个菜单。
（用户点名"很难看"——从代码看主体不差，真正拉胯的是这些小徽章与 tag 的廉价圆角/字号。）

### B6. 搜索结果页（search/results.tsx）✅⚠️
iOS 26 走 Stack.Toolbar + SearchBarSlot，分类 SearchTypeTabs，结果卡片统一 RADII.md+hairline 描边+shadow('sm')，空态规范。
问题：① 分类 tab 切换无下划线/指示器动画；② 直播/专栏角标（liveBadge 圆角 4）与时长角标（圆角 5）不一致；③ 用户结果行信息过少（仅粉丝数），可加签名一行。

### B7. 动态页（(tabs)/dynamics.tsx）⚠️
瀑布流/单列、UpPanel、FAB、骨架齐全。
问题：① **顶栏假毛玻璃**（纯色 0.85 透明度，见 A2）——滚动内容到顶栏下直接消失，应换 BlurView intensity 50 或 Glass variant regular；② FAB 手写阴影 opacity 0.2，应走 `shadow('lg')`，且建议改为 Glass 圆钮以贴合 iOS 26；③ 瀑布流↔列表切换无过渡；④ 动态 Tab 底栏图标无面性变体（A3）。

### B8. 用户空间（member/[mid]）⚠️
MemberHeaderCard（头像/等级/大会员徽章/关注按钮）+ 多 tab 内容，结构好。
问题：① `vipBadge` 用 `#FF6699`——Flutter 原版 `bili_colors.pinkLight` 就是为此定义的，RN 应登记为 `BILI.pink` token；② 关注按钮圆角 RADII.circle 正确，但按下仅缩放、无状态变形动画；③ 头部背景无 banner/装饰图层（Flutter 有 decorate card），空间页"头像+白卡"略显空。

### B9. 收藏夹（fav/index.tsx）✅⚠️
FavTabs + FolderCard + 骨架 + SwiftUI ConfirmationDialog 删除确认，规范。
问题：行删除无收缩动画；多选管理态的选中圈是手绘 checkCircle（download 同款）而非原生 checkmark 控件。

### B10. 历史记录（history/index.tsx）✅
SkeletonMediaRow 骨架、大标题、分组时间轴，达标。删除/清空缺行级动画同 B9。

### B11. 稍后再看（later/index.tsx）✅
同 B10，达标。播放进度条样式与视频详情页不统一（细线 vs 圆条）可对齐。

### B12. 直播间（live/[roomId]）⚠️
播放器+主播卡+榜单卡走 token，房间菜单走 sheet。
问题：**SuperChat（醒目留言）区是重灾区**——整段 inline style（fontSize 12/13、borderRadius 8、`rgba(255,182,0,0.15)` 背景、头像 24px），与周围卡片体系完全脱节，即"直接插进来的组件"的实例；弹幕输入条 LiveChatInput 有 3 处硬编码圆角。
修复：SuperChat 抽组件，背景色取 SC 下发 background_color 时补深色模式亮度校验，圆角/字号全部走 token。

### B13. PGC 番剧（pgc/[id].tsx）⚠️
大标题+PgcInfoHeader+选集网格+播放器。
问题：PgcInfoHeader 7 处硬编码颜色、PgcEpisodeGrid 选集格子圆角 6-8 混用、选中态用实心 ACCENT 填充（iOS 26 更适合玻璃描边态）；评分星星 #FF9500 写死（应入 warning token）。

### B14. 私信会话列表（whisper/index.tsx）✅
时间分组、置顶、SwiftUI SwipeActions 侧滑、撤销删除浮条、骨架——全站第二梯队最佳。
问题：footer 加载更多用 ActivityIndicator；分组标题 paddingTop 14 与卡片内行距略冲突（视觉可接受）。

### B15. 私信详情（whisper/[uid].tsx）⚠️
气泡圆角 RADII.lg(20)、输入条玻璃化方向正确。
问题：① 气泡四角同圆角（20），iMessage 式气泡应区分"尾巴角"（同侧下角 4-6pt）；② 输入框 fontSize 15 硬编码；③ 消息出现无入场动画（新消息应 translateY+spring 进入）；④ 时间戳/吸顶日期分隔缺失或未审计到实现。

### B16. 登录页（login/index.tsx）✅
SwiftUI Form + 分段 Picker + TextField/SecureField 原生控件 + 大标题毛玻璃——教科书级。
问题：① Cookie 粘贴框是 RN TextInput 包在 RNHostView 里，圆角 10/字号 13 硬编码，与周围原生 Form 行风格有细微落差；② 二维码过期态只有一行按钮，可加二维码灰罩+刷新图标的过渡；③ 登录成功无品牌动画（直接 back）。

### B17. 设置页（settings/index.tsx + 子页）✅⚠️
主页 SwiftUI List + 搜索 + 分类图标色块，完全复刻 iOS Settings，达标。
问题：① `bar_set`/`color_select` 用 **RN 裸 Switch**（无 trackColor/tint，灰轨道绿开关与全站 ACCENT 色调冲突）——`whisper_link_setting`、`whisper_settings`、`live_dm_block`、`PlayerSettingsSheet`(×3) 同款，共 6 文件，是"没做 iOS 化"的实锤；建议全部换 SwiftUI `Toggle` 或统一 `<Switch trackColor={{true: colors.accent}}/>` 封装；② 子页 tint 多处写死 `'#FB7299'`（28 处）不随主题色；③ color_select 20 个色板硬编码（作为色板数据可接受，但应抽常量表）。

### B18. 下载页（download/index.tsx）⚠️
问题：① 圆角 14/12/10/11 四种混用（row 14、clearBtn 12、cover 10、checkCircle 11），不在阶梯上；② 多选选中圈手绘（borderWidth 1.5 + checkmark icon），建议换原生 Image(systemName checkmark.circle.fill) 着色；③ 下载进度条样式未见统一 token（细线+ACCENT），任务卡片无 shadow 层级，页面偏"平"。

### B19. 排行榜（rank/index.tsx）/ 消息通知（notifications/index.tsx）✅
排行榜复用 VideoCard + 名次角标（top3 品牌粉/其余黑底），通知页 SwiftUI Picker 切类型 + SwipeActions，均达标。问题仅：rankBadge 圆角与字号硬编码、通知 footer spinner。

---

## C. 整改方案

### C1. 需要补齐/登记的 Token 表（建议数值）

**间距阶梯（新文件 `src/theme/spacing.ts`，4 的倍数 + iOS 惯用值）：**

```ts
export const SPACE = { xxs:2, xs:4, sm:8, md:12, lg:16, xl:20, xxl:28, page:16, section:16 } as const;
```
页面水平留白 `page=16`、卡片间距 `section=16`、卡内 padding 12/16、行内元素 gap 4/8/12——现有代码 90% 已符合，登记后用于 lint。

**圆角阶梯（补齐二级 token，收敛现有 289 处硬编码）：**

| Token | 值 | 用途 |
|---|---|---|
| RADII.xs | 6 | 徽章/tag/角标（替换 3/4/5/6） |
| RADII.sm | 10 | chip/输入框内嵌/楼中楼框 |
| RADII.thumb | 8 | **所有媒体缩略图**（登记 DynamicMedia 的事实标准） |
| RADII.md | 14 | 按钮/卡片行/结果卡 |
| RADII.card | 16 | 双列卡 |
| RADII.lg | 20 | 大卡/头像卡/评论区容器 |
| RADII.sheet | 24 | sheet/ActionBar 胶囊 |

**颜色补充（新文件 `bili-colors.ts`，对齐 Flutter bili_colors）：**

```ts
export const BILI = {
  pink: DynamicColorIOS({ light:'#FF6699', dark:'#FB7299' }),   // 品牌粉（大会员/VIP）
  pinkDim: DynamicColorIOS({ light:'rgba(251,114,153,0.15)', dark:'rgba(251,114,153,0.22)' }),
  blue: DynamicColorIOS({ light:'#008AC5', dark:'#2C9CC8' }),
  yellow: '#FFCC00',
  hot: '#FF3B30', new: '#FF9500', star: '#FF9500',              // 徽章专用
  level: ['#BFBFBF','#BFBFBF','#95DDC7','#7EC5FF','#FFB37A','#FF8C4D','#FF5C5C'],
};
```

**修复 ACCENT 响应性（高优先）：**
`SwiftUIHost.tsx` 的 `export const ACCENT` 改为 hook：`useAccent()`（订阅 `useSettingsStore.accentColor/enableDynamicColor`）；保留 ACCENT 常量仅供模块级默认值。同时把 28 处 `#FB7299` 字面量（含 settings 各子页 `tint('#FB7299')`）替换为动态值。

**阴影**：维持四档，删除 128 处手写阴影；`VideoActionBar`、动态 FAB、下载卡片统一 `shadow('md'|'lg')`。

### C2. 需要重做/返工的组件（按优先级）

| P | 组件/屏 | 动作 |
|---|---|---|
| P0 | CommentSection 样式层 | 全量迁移 T.*/RADII/BILI；删除死代码 `.card` 阴影；加"展开全文"；点赞弹簧动画；排序分段加滑块 |
| P0 | 6 处 RN 裸 Switch | 抽 `IoSToggle`（SwiftUI Toggle 或 tint 化 RN Switch），替换 bar_set/color_select/whisper_settings/whisper_link_setting/live_dm_block/PlayerSettingsSheet |
| P0 | `useAccent()` 重构 + 28 处 #FB7299 清理 | 主题色真正全局生效 |
| P1 | 共享 `EmptyState`/`ErrorState` 组件 | 收敛 33 处 emptyIconBox：icon（SF Symbol 风格 Ionicons）+ 标题 + 副标题 + 可选动作按钮，统一重试按钮为 `RADII.circle` 品牌胶囊 |
| P1 | LiveInfoPanel SuperChat | 抽 `SuperChatCard` 组件，token 化，深色校验 |
| P1 | 动态页顶栏 | 纯色假玻璃 → BlurView/Glass；FAB 走 shadow('lg') 或 Glass 圆钮 |
| P2 | VideoActionBar | 阴影修复 + RADII.sheet + 点赞/收藏/投币图标 spring 爆发微动效（scale 1→1.25→1 + 颜色） |
| P2 | VideoIntroSection / MemberHeaderCard / ReplyDetailSheet | 硬编码色/圆角迁移（AI 摘要图标盒、VIP 徽章、关注按钮、composer 圆角 12→RADII.md） |
| P2 | download 页 | 圆角收敛（14→RADII.md、12/10→RADII.sm/thumb）、选中圈换原生、任务卡加 shadow('sm') |
| P2 | whisper/[uid] 气泡 | 尾巴角差异化圆角、新消息入场 spring、字号走 T.body |
| P3 | iOS<26 底栏显隐动画、搜索结果分类指示器、列表删除收缩动画 | 动效补全 |
| P3 | search 热榜徽章 | 圆角 3/4→RADII.xs、字号 10→T.caption2 |

### C3. 动效规范（推荐数值）

已有 MOTION token 基本即 Apple 标准，按此固化并扩大使用面：

| 场景 | 规范 |
|---|---|
| 按压 | 临界阻尼 spring(ratio 1, k=500)，scale 0.95-0.98，抬起 spring(0.75, k=400) |
| 转场 | 栈推入/返回交给 react-native-screens 原生；弹层一律 SwiftUI BottomSheet detents [medium, large] + dragIndicator |
| 入场 | withTiming 250ms Easing.out(cubic) + translateY 12，列表 stagger 40ms、上限 10 项 |
| 顶/底栏显隐 | spring(ratio 1, k=300)（现值保留），iOS26 交给系统 minimizeBehavior |
| 图标状态切换（点赞/收藏） | withSpring(damping 16, k=260)：scale 1→1.25→1 + 颜色交叉淡入 150ms，配 haptic light |
| 分段选择器 | 滑块 translate spring(ratio 0.85, k=350)，禁止背景色瞬切 |
| 列表删除 | layout animation：高度收缩 250ms + opacity，再触发数据移除 |
| 玻璃形态 | glassMorph 0.35s（已定义），variant 切换必须走 animated 通道 |
| 无障碍 | 全部保留 useReducedMotion 分支（现状良好，新动效必须遵循） |

### C4. 执行顺序建议

1. **第 1 周**：P0 三项（评论区样式迁移、Toggle 统一、useAccent）——直接消除"拼凑感"与"控件没 iOS 化"的主要证据；
2. **第 2 周**：EmptyState/ErrorState 共享件 + 33 处替换、SuperChat、动态页顶栏材质；
3. **第 3 周**：VideoActionBar/VideoIntroSection/ReplyDetailSheet/download/whisper 气泡的 token 迁移 + 点赞收藏微动效；
4. **第 4 周**：动效补全（iOS<26 底栏、分段滑块、删除动画）+ 硬编码 lint 规则（eslint no-restricted-syntax 禁 `borderRadius: 数字`、`fontSize: 数字`、`#十六进制`，白名单仅限 theme/ 与 bili-colors.ts）。

---

## 附录：关键证据索引

- token 定义：`src/theme/tokens.ts`、`src/theme/semantic-colors.ts`、`src/components/type-scale.tsx`
- 动效原语：`src/components/motion.tsx`
- 玻璃封装：`src/components/Glass.tsx`（采用方约 10 处）
- ACCENT 断点：`src/components/SwiftUIHost.tsx:28`（`export const ACCENT = useSettingsStore.getState().accentColor`）
- 裸 Switch：`app/settings/bar_set.tsx`、`app/settings/color_select.tsx`、`app/whisper_link_setting/index.tsx`、`app/whisper_settings/[uid]/index.tsx`、`app/live_dm_block/index.tsx`、`components/PlayerSettingsSheet.tsx`
- 评论区问题：`src/components/CommentSection.tsx`（styles 1106-1169；折叠逻辑 933）
- 假毛玻璃顶栏：`src/app/(tabs)/dynamics.tsx:398`
- SuperChat inline：`src/components/live/LiveInfoPanel.tsx:199-205`
- 阴影冲突：`src/components/video/VideoActionBar.tsx:72-81`
- Flutter 对照：`PiliPlus/lib/common/style.dart`（imgRadius 10 / bottomSheetRadius 18）、`lib/common/skeleton/`（11 类骨架）、`lib/utils/bili_colors.dart`
