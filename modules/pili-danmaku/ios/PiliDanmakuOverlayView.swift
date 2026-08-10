// Copyright 2026 PiliPlus. All rights reserved.

import AVFoundation
import CoreMedia
import ExpoModulesCore
import Foundation
import QuartzCore
import UIKit

private final class DanmakuLayerModel {
  let layer = CATextLayer()
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
    trackIndex: Int
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

    layer.string = item.text
    layer.font = UIFont.boldSystemFont(ofSize: fontSize)
    layer.fontSize = fontSize
    layer.foregroundColor = piliColor(fromHex: item.color).cgColor
    layer.contentsScale = UIScreen.main.scale
    layer.isWrapped = false
    layer.truncationMode = .end
    layer.alignmentMode = .left
    layer.shadowColor = UIColor.black.cgColor
    layer.shadowOpacity = 0.5
    layer.shadowRadius = 2
    layer.shadowOffset = CGSize(width: 1, height: 1)
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
  private var displayLink: CADisplayLink?
  private var displayLinkProxy: DanmakuDisplayLinkProxy?
  private var nextSpawnTimer: Timer?
  private weak var boundPlayer: AVPlayer?
  private var playerItemObservation: NSKeyValueObservation?
  private var playerTimeControlObservation: NSKeyValueObservation?
  private var lifecycleObservers: [NSObjectProtocol] = []

  let onDanmakuTap = EventDispatcher()

  public required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    isUserInteractionEnabled = true

    let proxy = DanmakuDisplayLinkProxy(owner: self)
    displayLinkProxy = proxy
    let link = CADisplayLink(target: proxy, selector: #selector(DanmakuDisplayLinkProxy.tick(_:)))
    link.isPaused = true
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
      model.layer.removeFromSuperlayer()
    }
    layerModels.removeAll()
    updateDisplayLinkPaused()
  }

  private func trackCount(for fontSize: CGFloat) -> Int {
    max(4, Int(floor(overlayHeight / max(fontSize * CGFloat(lineHeightMultiplier), 1))))
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
          top = max(0, overlayHeight - line * fontSize * CGFloat(lineHeightMultiplier))
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
      let model = DanmakuLayerModel(
        item: resolvedItem,
        top: top,
        textWidth: textWidth,
        fontSize: fontSize,
        trackIndex: trackIndex
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
    let font = UIFont.boldSystemFont(ofSize: fontSize)
    let size = (text as NSString).size(withAttributes: [.font: font])
    return ceil(size.width)
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
      model.layer.removeFromSuperlayer()
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
