// Copyright 2026 PiliPlus. All rights reserved.

import AVFoundation
import CoreMedia
import ExpoModulesCore
import Foundation
import QuartzCore
import UIKit

private final class DanmakuLayerModel {
  let layer: CATextLayer
  let itemId: String
  let text: String
  let itemTime: Double
  let duration: Double
  let mode: DanmakuMode
  var startMediaTime: Double
  var top: CGFloat
  var textWidth: CGFloat
  var trackIndex: Int

  init(
    item: DanmakuItemRecord,
    top: CGFloat,
    textWidth: CGFloat,
    fontSize: CGFloat,
    trackIndex: Int,
    strokeWidth: CGFloat,
    strokeColor: UIColor,
    layer: CATextLayer
  ) {
    self.itemId = item.id
    self.text = item.text
    self.itemTime = item.time
    self.duration = item.duration > 0 ? item.duration : 8
    self.mode = DanmakuMode(rawValue: item.mode) ?? .scroll
    self.startMediaTime = item.time
    self.top = top
    self.textWidth = textWidth
    self.trackIndex = trackIndex
    self.layer = layer

    // 01-A2/S1（P0）：清空 layer 的隐式动作表，任何对 frame/opacity 的写都不再
    // 触发生成 CAAnimation。配合 displayLinkTick 内的 CATransaction.setDisableActions，
    // 彻底消除弹幕密集时的 CoreAnimation 提交风暴（每条弹幕每帧一条隐式动画）。
    layer.actions = [:]
    let textColor = piliColor(fromHex: item.color)
    layer.font = UIFont.boldSystemFont(ofSize: fontSize)
    layer.fontSize = fontSize
    layer.foregroundColor = textColor.cgColor
    layer.contentsScale = UIScreen.main.scale
    layer.isWrapped = false
    layer.truncationMode = .end
    layer.alignmentMode = .left
    if strokeWidth > 0 {
      // 批次5 P1：真描边。strokeWidth 取负值 = 填充 + 外描边（正值为纯描边镂空字），
      // 描边粗细/颜色由设置项 dmStrokeWidth / dmStrokeColor 直通；CATextLayer 支持
      // NSAttributedString 的 stroke 属性，绘制成本与普通文本一致，不影响池化/60fps。
      layer.string = NSAttributedString(
        string: item.text,
        attributes: [
          .font: UIFont.boldSystemFont(ofSize: fontSize),
          .foregroundColor: textColor,
          .strokeColor: strokeColor,
          .strokeWidth: -strokeWidth,
        ]
      )
      layer.shadowOpacity = 0
    } else {
      layer.string = item.text
      // 兜底软阴影：不描边时保留轻微投影，保证浅色弹幕在亮背景下可读。
      layer.shadowColor = UIColor.black.cgColor
      layer.shadowOpacity = 0.5
      layer.shadowRadius = 2
      layer.shadowOffset = CGSize(width: 1, height: 1)
    }
  }
}

private final class DanmakuDisplayLinkProxy {
  weak var owner: PiliDanmakuOverlayView?

  init(owner: PiliDanmakuOverlayView) {
    self.owner = owner
  }

  @objc func tick(_ link: CADisplayLink) {
    owner?.displayLinkTick(link)
  }
}

public final class PiliDanmakuOverlayView: ExpoView {
  private var allItems: [DanmakuItemRecord] = []
  private var spawnIndex = 0
  private var lastSpawnedMediaTime = -1.0
  private var scrollTrackRelease: [Double] = []
  private var topTrackRelease: [Double] = []
  private var bottomTrackRelease: [Double] = []
  private var layerModels: [DanmakuLayerModel] = []
  private var currentTime: Double = 0
  private var isVisible: Bool = true
  private var overlayHeight: CGFloat = 220
  private var danmakuOpacity: CGFloat = 1
  private var danmakuSpeed: Double = 8
  private var lineHeightMultiplier: Double = 1.6
  private var density: Double = 1
  private var tapEnabled: Bool = false
  // 批次5 P1：弹幕显示区域比例（0~1），轨道只占用可用区域；底部弹幕锚定区域底边。
  private var danmakuArea: Double = 1
  // 批次5 P1：描边粗细（pt，0=关闭描边）与描边颜色。
  private var danmakuStrokeWidth: Double = 0
  private var danmakuStrokeColor: UIColor = .black
  // 批次5 P1：按类型屏蔽（scroll/top/bottom），spawn 时直接跳过被屏蔽的类型。
  private var blockedModes: Set<DanmakuMode> = []
  // 批次5 P1：屏蔽彩色弹幕（强制转白，对齐 Flutter blockColorful 语义）。
  private var blockColorful: Bool = false
  private var displayLink: CADisplayLink?
  private var displayLinkProxy: DanmakuDisplayLinkProxy?
  private var nextSpawnTimer: Timer?
  private weak var boundPlayer: AVPlayer?
  private var playerItemObservation: NSKeyValueObservation?
  private var playerTimeControlObservation: NSKeyValueObservation?
  private var lifecycleObservers: [NSObjectProtocol] = []

  // 01-S2（P2）：CATextLayer 对象池。弹幕在屏上限 maxLayerCount ≈ 40，
  // 复用已回收的 layer，避免每条弹幕新建/释放 CG 对象。
  private var layerPool: [CATextLayer] = []
  // 01-S2（P2）：文字测宽缓存，key = "文本|字号"。弹幕文本高度重复，
  // 命中缓存省掉一次 NSString.size 测量（每条弹幕上屏前都会测量）。
  private var textWidthCache: [String: CGFloat] = [:]
  private let maxTextWidthCacheEntries = 4096

  let onDanmakuTap = EventDispatcher()

  public required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    isUserInteractionEnabled = true

    let proxy = DanmakuDisplayLinkProxy(owner: self)
    displayLinkProxy = proxy
    let link = CADisplayLink(target: proxy, selector: #selector(DanmakuDisplayLinkProxy.tick(_:)))
    link.isPaused = true
    // 01-A3（P2）：限制到 60fps 上限，ProMotion（120Hz）设备上弹幕 CPU/GPU 减半，
    // 静止场景仍由 updateDisplayLinkPaused 把 link 暂停。
    if #available(iOS 15.0, *) {
      link.preferredFrameRateRange = CAFrameRateRange(minimum: 24, maximum: 60, preferred: 60)
    }
    link.add(to: .main, forMode: .common)
    displayLink = link
    PiliDanmakuClockBridge.shared.register(self)
    lifecycleObservers.append(
      NotificationCenter.default.addObserver(
        forName: UIApplication.didEnterBackgroundNotification,
        object: nil,
        queue: .main
      ) { [weak self] _ in
        self?.updateDisplayLinkPaused()
      }
    )
    lifecycleObservers.append(
      NotificationCenter.default.addObserver(
        forName: UIApplication.didBecomeActiveNotification,
        object: nil,
        queue: .main
      ) { [weak self] _ in
        self?.updateDisplayLinkPaused()
      }
    )
  }

  deinit {
    for observer in lifecycleObservers {
      NotificationCenter.default.removeObserver(observer)
    }
    PiliDanmakuClockBridge.shared.unregister(self)
    playerItemObservation?.invalidate()
    playerTimeControlObservation?.invalidate()
    nextSpawnTimer?.invalidate()
    displayLink?.invalidate()
  }

  func setItems(_ items: [DanmakuItemRecord]?) {
    allItems = (items ?? []).sorted { $0.time < $1.time }
    resetScheduler(at: resolvedMediaTime())
    setNeedsLayout()
  }

  /// 01-M3（P1）：JS 侧持 token，弹幕条目整体留在原生（loader 准备结果缓存），
  /// 不再序列化回 JS 再序列化回来。设置变化（字号/速度等）会重新 prepare，
  /// 每次 setItemsRef 都替换为最新的 items 数组。
  func setItemsRef(_ token: String?) {
    guard let token, !token.isEmpty,
          let rawItems = PiliDanmakuLoader.shared.preparedItems(forToken: token) else {
      setItems(nil)
      return
    }
    // 把 loader 缓存的 [String: Any] 条目转回 Record（同模块内，无需过桥）。
    let records: [DanmakuItemRecord] = rawItems.compactMap { dict in
      guard let text = dict["text"] as? String else {
        return nil
      }
      var record = DanmakuItemRecord()
      record.id = dict["id"] as? String ?? ""
      record.text = text
      record.time = dict["time"] as? Double ?? 0
      record.duration = dict["duration"] as? Double ?? 8
      record.color = dict["color"] as? String ?? "#FFFFFF"
      record.fontSize = dict["fontSize"] as? Double ?? 15
      record.mode = dict["mode"] as? String ?? "scroll"
      if let top = dict["top"] as? Double {
        record.top = top
      }
      return record
    }
    setItems(records)
  }

  func setCurrentTime(_ value: Double?) {
    let next = max(0, value ?? 0)
    if next < currentTime - 0.2 || next - currentTime > 1.5 {
      resetScheduler(at: next)
    }
    currentTime = next
  }

  func setVisible(_ value: Bool?) {
    isVisible = value ?? true
    isHidden = !isVisible
    updateDisplayLinkPaused()
  }

  func setDensity(_ value: Double?) {
    density = max(0, min(1, value ?? 1))
  }

  func setHeight(_ value: Double?) {
    overlayHeight = CGFloat(max(1, value ?? 220))
    resetScheduler(at: resolvedMediaTime())
    setNeedsLayout()
  }

  func setOpacity(_ value: Double?) {
    danmakuOpacity = CGFloat(max(0, min(1, value ?? 1)))
    alpha = danmakuOpacity
  }

  func setSpeed(_ value: Double?) {
    danmakuSpeed = max(0.5, value ?? 8)
  }

  func setLineHeight(_ value: Double?) {
    lineHeightMultiplier = max(1, value ?? 1.6)
    resetScheduler(at: resolvedMediaTime())
    setNeedsLayout()
  }

  // 批次5 P1：显示区域比例变化后轨道数/底部锚点随之变化，重排在屏弹幕。
  func setArea(_ value: Double?) {
    danmakuArea = max(0.05, min(1, value ?? 1))
    resetScheduler(at: resolvedMediaTime())
    setNeedsLayout()
  }

  // 批次5 P1：描边粗细/颜色在生成 layer 时写入，改动后重排使在屏弹幕立即生效。
  func setStrokeWidth(_ value: Double?) {
    danmakuStrokeWidth = max(0, value ?? 0)
    resetScheduler(at: resolvedMediaTime())
  }

  func setStrokeColor(_ value: String?) {
    danmakuStrokeColor = piliColor(fromHex: value ?? "#000000")
    resetScheduler(at: resolvedMediaTime())
  }

  // 批次5 P1：按类型屏蔽，改动后立即回收在屏弹幕（被屏蔽类型即时消失）。
  func setBlockModes(_ value: [String]?) {
    blockedModes = Set((value ?? []).compactMap { DanmakuMode(rawValue: $0) })
    resetScheduler(at: resolvedMediaTime())
  }

  // 批次5 P1：彩色屏蔽（转白）实时生效。
  func setBlockColorful(_ value: Bool?) {
    blockColorful = value ?? false
    resetScheduler(at: resolvedMediaTime())
  }

  func setInteractive(_ value: Bool?) {
    tapEnabled = value ?? false
  }

  func bindPlayer(_ player: AVPlayer?) {
    playerItemObservation?.invalidate()
    playerTimeControlObservation?.invalidate()
    playerItemObservation = nil
    playerTimeControlObservation = nil
    boundPlayer = player
    if let player {
      playerItemObservation = player.observe(\.currentItem, options: [.new]) { [weak self] _, _ in
        DispatchQueue.main.async {
          self?.handlePlayerItemChange()
        }
      }
      playerTimeControlObservation = player.observe(\.timeControlStatus, options: [.new]) { [weak self] _, _ in
        DispatchQueue.main.async {
          self?.updateDisplayLinkPaused()
        }
      }
      if let seconds = player.currentTime().seconds, seconds.isFinite {
        currentTime = max(0, seconds)
      }
    }
    resetScheduler(at: currentTime)
  }

  public override func layoutSubviews() {
    super.layoutSubviews()
    for model in layerModels {
      model.layer.contentsScale = window?.screen.scale ?? UIScreen.main.scale
    }
    updateDisplayLinkPaused()
  }

  private func currentMediaTime(at now: CFTimeInterval) -> Double {
    guard let player = boundPlayer else {
      return currentTime
    }
    if let timebase = player.currentItem?.timebase,
       let mediaTime = mediaTime(from: timebase, at: now) {
      return mediaTime
    }
    let seconds = player.currentTime().seconds
    return seconds.isFinite ? max(0, seconds) : currentTime
  }

  private func mediaTime(from timebase: CMTimebase, at now: CFTimeInterval) -> Double? {
    let hostClock = CMClockGetTime(CMClockGetHostTimeClock())
    let delta = CMTime(seconds: now - CACurrentMediaTime(), preferredTimescale: 1_000_000_000)
    let mediaTime = CMTimebaseGetTimeWithHostTime(timebase, CMTimeAdd(hostClock, delta))
    guard mediaTime.seconds.isFinite, mediaTime.seconds >= 0 else {
      return nil
    }
    return mediaTime.seconds
  }

  private func resolvedMediaTime() -> Double {
    currentMediaTime(at: CACurrentMediaTime())
  }

  private func handlePlayerItemChange() {
    if let seconds = boundPlayer?.currentTime().seconds, seconds.isFinite {
      currentTime = max(0, seconds)
    } else {
      currentTime = 0
    }
    resetScheduler(at: currentTime)
  }

  private var isPlaybackActive: Bool {
    guard let player = boundPlayer else {
      return true
    }
    return player.timeControlStatus == .playing
  }

  private func resetScheduler(at time: Double) {
    spawnIndex = allItems.firstIndex { $0.time >= max(0, time) } ?? allItems.count
    lastSpawnedMediaTime = max(0, time)
    scrollTrackRelease = []
    topTrackRelease = []
    bottomTrackRelease = []
    for model in layerModels {
      recycleLayer(model.layer)
    }
    layerModels.removeAll()
    // 新视频/seek 后弹幕内容变化，清空测宽缓存避免旧文本残留膨胀。
    textWidthCache.removeAll(keepingCapacity: true)
    updateDisplayLinkPaused()
  }

  /// 批次5 P1：弹幕可用的轨道高度 = 弹幕层高度 × 显示区域比例。
  private var usableOverlayHeight: CGFloat {
    overlayHeight * CGFloat(max(0.05, min(1, danmakuArea)))
  }

  private func trackCount(for fontSize: CGFloat) -> Int {
    max(1, Int(floor(usableOverlayHeight / max(fontSize * CGFloat(lineHeightMultiplier), 1))))
  }

  private func resizeTracks(_ count: Int) {
    if scrollTrackRelease.count > count {
      scrollTrackRelease.removeLast(scrollTrackRelease.count - count)
    }
    while scrollTrackRelease.count < count {
      scrollTrackRelease.append(-1)
    }
    if topTrackRelease.count > count {
      topTrackRelease.removeLast(topTrackRelease.count - count)
    }
    while topTrackRelease.count < count {
      topTrackRelease.append(-1)
    }
    if bottomTrackRelease.count > count {
      bottomTrackRelease.removeLast(bottomTrackRelease.count - count)
    }
    while bottomTrackRelease.count < count {
      bottomTrackRelease.append(-1)
    }
  }

  private func nextTrackIndex(_ releases: inout [Double], at time: Double) -> Int? {
    releases.firstIndex { $0 <= time }
  }

  private func spawnDueItems(at mediaTime: Double) {
    guard !allItems.isEmpty else {
      return
    }
    while spawnIndex < allItems.count, layerModels.count < maxLayerCount {
      let item = allItems[spawnIndex]
      guard item.time <= mediaTime + 0.001 else {
        break
      }

      let fontSize = CGFloat(max(8, item.fontSize))
      let duration = item.duration > 0 ? item.duration : danmakuSpeed
      let mode = DanmakuMode(rawValue: item.mode) ?? .scroll
      // 批次5 P1：按类型屏蔽——被屏蔽的弹幕类型在 spawn 阶段直接跳过，
      // 不占用轨道也不进入层列表（比 preparer 过滤更即时，改设置无需重拉数据）。
      if blockedModes.contains(mode) {
        spawnIndex += 1
        continue
      }
      let top: CGFloat
      var trackIndex = -1

      if let itemTop = item.top, itemTop >= 0 {
        top = CGFloat(itemTop)
      } else {
        let count = trackCount(for: fontSize)
        resizeTracks(count)
        switch mode {
        case .scroll:
          guard let idx = nextTrackIndex(&scrollTrackRelease, at: mediaTime) else {
            return
          }
          top = CGFloat(idx) * fontSize * CGFloat(lineHeightMultiplier)
          scrollTrackRelease[idx] = mediaTime + duration
          trackIndex = idx
        case .top:
          guard let idx = nextTrackIndex(&topTrackRelease, at: mediaTime) else {
            return
          }
          top = CGFloat(idx) * fontSize * CGFloat(lineHeightMultiplier)
          topTrackRelease[idx] = mediaTime + duration
          trackIndex = idx
        case .bottom:
          guard let idx = nextTrackIndex(&bottomTrackRelease, at: mediaTime) else {
            return
          }
          let line = CGFloat(idx + 1)
          // 批次5 P1：底部弹幕锚定在显示区域的底边（而非整个弹幕层底边）。
          top = max(0, usableOverlayHeight - line * fontSize * CGFloat(lineHeightMultiplier))
          bottomTrackRelease[idx] = mediaTime + duration
          trackIndex = idx
        }
      }

      let measuredWidth = measureTextWidth(item.text, fontSize: fontSize)
      let textWidth = measuredWidth > 0 ? measuredWidth + 12 : max(bounds.width * 0.8, 120)
      var resolvedItem = item
      if resolvedItem.duration <= 0 {
        resolvedItem.duration = danmakuSpeed
      }
      // 批次5 P1：屏蔽彩色弹幕 = 强制转白（对齐 Flutter blockColorful：不是隐藏而是去色）。
      if blockColorful {
        resolvedItem.color = "#FFFFFF"
      }
      let model = DanmakuLayerModel(
        item: resolvedItem,
        top: top,
        textWidth: textWidth,
        fontSize: fontSize,
        trackIndex: trackIndex,
        strokeWidth: CGFloat(danmakuStrokeWidth),
        strokeColor: danmakuStrokeColor,
        layer: acquireLayer()
      )
      model.startMediaTime = mediaTime
      model.layer.frame = CGRect(
        x: 0,
        y: top,
        width: textWidth,
        height: ceil(fontSize * 1.4)
      )
      layer.addSublayer(model.layer)
      layerModels.append(model)
      spawnIndex += 1
    }
  }

  private func freeTrack(_ model: DanmakuLayerModel, at mediaTime: Double) {
    guard model.trackIndex >= 0 else {
      return
    }
    switch model.mode {
    case .scroll:
      if scrollTrackRelease.indices.contains(model.trackIndex) {
        scrollTrackRelease[model.trackIndex] = mediaTime
      }
    case .top:
      if topTrackRelease.indices.contains(model.trackIndex) {
        topTrackRelease[model.trackIndex] = mediaTime
      }
    case .bottom:
      if bottomTrackRelease.indices.contains(model.trackIndex) {
        bottomTrackRelease[model.trackIndex] = mediaTime
      }
    }
  }

  private var maxLayerCount: Int {
    max(1, Int(40 * density))
  }

  private func measureTextWidth(_ text: String, fontSize: CGFloat) -> CGFloat {
    let key = "\(text)|\(Int(fontSize))"
    if let cached = textWidthCache[key] {
      return cached
    }
    let font = UIFont.boldSystemFont(ofSize: fontSize)
    let size = (text as NSString).size(withAttributes: [.font: font])
    let width = ceil(size.width)
    if textWidthCache.count < maxTextWidthCacheEntries {
      textWidthCache[key] = width
    }
    return width
  }

  /// 从对象池取一个 CATextLayer；池为空才新建。layer 的隐式动作在池内保持禁用。
  private func acquireLayer() -> CATextLayer {
    if let layer = layerPool.popLast() {
      return layer
    }
    let layer = CATextLayer()
    layer.actions = [:]
    return layer
  }

  /// 把用完的 layer 重置后放回对象池，供后续弹幕复用。
  private func recycleLayer(_ layer: CATextLayer) {
    layer.string = nil
    layer.opacity = 1
    layer.removeFromSuperlayer()
    layerPool.append(layer)
  }

  private func displayLinkTick(_ link: CADisplayLink) {
    guard isVisible, bounds.width > 0 else {
      return
    }

    let now = CACurrentMediaTime()
    let mediaTime = currentMediaTime(at: now)
    let timeDelta = mediaTime - lastSpawnedMediaTime
    if timeDelta < -0.2 || timeDelta > 1.5 {
      currentTime = mediaTime
      resetScheduler(at: mediaTime)
    }
    if isPlaybackActive {
      spawnDueItems(at: mediaTime)
    }

    var finished: [DanmakuLayerModel] = []
    // 01-A2/S1（P0）：displayLinkTick 每帧改写 layer.frame/opacity。
    // 关闭隐式动作 + layer.actions=[:] 双保险，杜绝每条弹幕每帧生成 CAAnimation，
    // 消除弹幕密集时的 CoreAnimation 提交风暴（播放页最大隐性 CPU 消耗）。
    CATransaction.begin()
    CATransaction.setDisableActions(true)
    defer { CATransaction.commit() }
    for model in layerModels {
      let elapsed = mediaTime - model.startMediaTime
      let progress = model.duration > 0 ? elapsed / model.duration : 1
      if progress >= 1 {
        finished.append(model)
        continue
      }

      if model.textWidth <= 0 {
        model.textWidth = max(bounds.width * 0.5, 80)
      }
      let clampedProgress = max(0, progress)
      let frameHeight = model.layer.frame.height
      switch model.mode {
      case .scroll:
        let travel = bounds.width + model.textWidth
        let x = bounds.width - CGFloat(clampedProgress) * travel
        model.layer.frame = CGRect(x: x, y: model.top, width: model.textWidth, height: frameHeight)
        model.layer.opacity = progress < 0 ? 0 : 1
      case .top:
        let x = max(0, (bounds.width - model.textWidth) / 2)
        model.layer.frame = CGRect(x: x, y: model.top, width: model.textWidth, height: frameHeight)
        model.layer.opacity = progress < 0 ? 0 : Float(min(1, clampedProgress * 8))
      case .bottom:
        let x = max(0, (bounds.width - model.textWidth) / 2)
        model.layer.frame = CGRect(x: x, y: model.top, width: model.textWidth, height: frameHeight)
        model.layer.opacity = progress < 0 ? 0 : Float(min(1, clampedProgress * 8))
      }
    }
    for model in finished {
      freeTrack(model, at: mediaTime)
      recycleLayer(model.layer)
    }
    if !finished.isEmpty {
      let finishedIDs = Set(finished.map { ObjectIdentifier($0) })
      layerModels.removeAll { finishedIDs.contains(ObjectIdentifier($0)) }
    }
    lastSpawnedMediaTime = max(lastSpawnedMediaTime, mediaTime)
    updateDisplayLinkPaused()
  }

  private func updateDisplayLinkPaused() {
    let hasActiveLayers = !layerModels.isEmpty
    let nextDueMediaTime = spawnIndex < allItems.count ? allItems[spawnIndex].time : nil
    let nextDueSoon = nextDueMediaTime.map { $0 - resolvedMediaTime() <= 0.5 } ?? false
    let shouldRun = UIApplication.shared.applicationState != .background
      && isVisible
      && bounds.width > 0
      && (hasActiveLayers || (isPlaybackActive && nextDueSoon))
      && (boundPlayer == nil || isPlaybackActive)
    displayLink?.isPaused = !shouldRun
    scheduleNextSpawnTimerIfNeeded()
  }

  private func scheduleNextSpawnTimerIfNeeded() {
    nextSpawnTimer?.invalidate()
    nextSpawnTimer = nil
    guard UIApplication.shared.applicationState != .background,
          displayLink?.isPaused == true, isPlaybackActive, spawnIndex < allItems.count else {
      return
    }
    let nextTime = allItems[spawnIndex].time
    let delay = max(0.05, nextTime - resolvedMediaTime())
    let timer = Timer(timeInterval: delay, repeats: false) { [weak self] _ in
      self?.nextSpawnTimer = nil
      self?.updateDisplayLinkPaused()
    }
    nextSpawnTimer = timer
    RunLoop.main.add(timer, forMode: .common)
  }

  public override func hitTest(_ point: CGPoint, with event: UIEvent?) -> UIView? {
    guard tapEnabled, isVisible, !isHidden, bounds.contains(point) else {
      return nil
    }
    return layerModel(at: point) != nil ? self : nil
  }

  public override func touchesEnded(_ touches: Set<UITouch>, with event: UIEvent?) {
    defer {
      super.touchesEnded(touches, with: event)
    }
    guard tapEnabled, let touch = touches.first, let model = layerModel(at: touch.location(in: self)) else {
      return
    }
    onDanmakuTap(
      DanmakuTapEventRecord(
        id: model.itemId,
        text: model.text,
        time: model.itemTime,
        mode: model.mode.rawValue
      )
    )
  }

  private func layerModel(at point: CGPoint) -> DanmakuLayerModel? {
    for model in layerModels where model.layer.opacity > 0.05 {
      let frame = model.layer.presentation()?.frame ?? model.layer.frame
      if frame.contains(point) {
        return model
      }
    }
    return nil
  }
}
