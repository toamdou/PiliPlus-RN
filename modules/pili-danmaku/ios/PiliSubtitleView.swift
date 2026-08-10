// Copyright 2026 PiliPlus. All rights reserved.

import AVFoundation
import ExpoModulesCore
import QuartzCore
import UIKit

public final class PiliSubtitleView: ExpoView {
  private var subtitles: [SubtitleItemRecord] = []
  private var currentTime: Double = 0
  private var isVisible: Bool = true
  private var fontSizeScale: Double = 1
  private var strokeWidth: Double = 2
  private var fontWeight: Double = 5
  private var paddingHorizontal: Double = 24
  private var paddingBottom: Double = 24
  private var backgroundOpacity: Double = 0.67
  private var currentContent = ""
  private var renderedSubtitleFrom = -1.0
  private var renderedSubtitleTo = -1.0
  private var renderedTextWidth: CGFloat = 0
  private var renderedTextHeight: CGFloat = 0
  private var renderedFontSize: CGFloat = 0
  private var renderedFontWeight: CGFloat = 0
  private var renderedStrokeWidth: CGFloat = 0
  private var renderedMaxTextWidth: CGFloat = 0
  private weak var boundPlayer: AVPlayer?
  private var clockTimer: Timer?
  private var timeControlObserver: NSKeyValueObservation?
  private var lifecycleObservers: [NSObjectProtocol] = []

  private let textLayer = CATextLayer()
  private let backgroundLayer = CALayer()

  public required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    isUserInteractionEnabled = false
    textLayer.contentsScale = UIScreen.main.scale
    textLayer.alignmentMode = .center
    textLayer.isWrapped = true
    textLayer.truncationMode = .end
    backgroundLayer.cornerRadius = 6
    layer.addSublayer(backgroundLayer)
    layer.addSublayer(textLayer)

    PiliDanmakuClockBridge.shared.register(self)
    lifecycleObservers.append(
      NotificationCenter.default.addObserver(
        forName: UIApplication.didEnterBackgroundNotification,
        object: nil,
        queue: .main
      ) { [weak self] _ in
        self?.clockTimer?.invalidate()
        self?.clockTimer = nil
      }
    )
    lifecycleObservers.append(
      NotificationCenter.default.addObserver(
        forName: UIApplication.didBecomeActiveNotification,
        object: nil,
        queue: .main
      ) { [weak self] _ in
        self?.updateClockTimer()
      }
    )
  }

  deinit {
    clockTimer?.invalidate()
    for observer in lifecycleObservers {
      NotificationCenter.default.removeObserver(observer)
    }
    PiliDanmakuClockBridge.shared.unregister(self)
  }

  func setSubtitles(_ value: [SubtitleItemRecord]?) {
    subtitles = (value ?? []).sorted { $0.from < $1.from }
    updateClockTimer()
    updateSubtitle()
  }

  func setCurrentTime(_ value: Double?) {
    currentTime = max(0, value ?? 0)
    updateSubtitle()
  }

  func setVisible(_ value: Bool?) {
    isVisible = value ?? true
    updateClockTimer()
    updateSubtitle()
  }

  func setFontSizeScale(_ value: Double?) {
    fontSizeScale = max(0.5, value ?? 1)
    updateSubtitle()
  }

  func setStrokeWidth(_ value: Double?) {
    strokeWidth = max(0, value ?? 2)
    updateSubtitle()
  }

  func setFontWeight(_ value: Double?) {
    fontWeight = max(1, min(9, value ?? 5))
    updateSubtitle()
  }

  func setPaddingHorizontal(_ value: Double?) {
    paddingHorizontal = max(0, value ?? 24)
    updateSubtitle()
  }

  func setPaddingBottom(_ value: Double?) {
    paddingBottom = max(0, value ?? 24)
    updateSubtitle()
  }

  func setBackgroundOpacity(_ value: Double?) {
    backgroundOpacity = max(0, min(1, value ?? 0.67))
    updateSubtitle()
  }

  func bindPlayer(_ player: AVPlayer?) {
    boundPlayer = player
    timeControlObserver?.invalidate()
    timeControlObserver = player?.observe(\.timeControlStatus, options: [.new]) {
      [weak self] player, _ in
      self?.updateClockTimer()
      if player.timeControlStatus != .playing {
        self?.updateSubtitle()
      }
    }
    updateClockTimer()
    updateSubtitle()
  }

  private func updateClockTimer() {
    guard UIApplication.shared.applicationState != .background,
          isVisible,
          !subtitles.isEmpty,
          boundPlayer?.timeControlStatus == .playing else {
      clockTimer?.invalidate()
      clockTimer = nil
      return
    }
    guard clockTimer == nil else {
      return
    }
    let timer = Timer(timeInterval: 0.25, repeats: true) { [weak self] _ in
      self?.updateSubtitle()
    }
    timer.tolerance = 0.05
    RunLoop.main.add(timer, forMode: .common)
    clockTimer = timer
  }

  public override func layoutSubviews() {
    super.layoutSubviews()
    textLayer.contentsScale = window?.screen.scale ?? UIScreen.main.scale
    updateSubtitle()
  }

  private func resolvedCurrentTime() -> Double {
    guard let player = boundPlayer else {
      return currentTime
    }
    let seconds = player.currentTime().seconds
    return seconds.isFinite ? max(0, seconds) : currentTime
  }

  private func updateSubtitle() {
    guard isVisible, bounds.width > 0, bounds.height > 0 else {
      clearSubtitle()
      return
    }

    guard let item = currentSubtitle(at: resolvedCurrentTime()), !item.content.isEmpty else {
      clearSubtitle()
      return
    }

    let fontSize = 16 * CGFloat(fontSizeScale)
    let fontWeightValue = CGFloat(fontWeight * 100)
    let maxTextWidth = max(40, bounds.width - CGFloat(paddingHorizontal * 2))
    let needsLayout = currentContent != item.content
      || renderedSubtitleFrom != item.from
      || renderedSubtitleTo != item.to
      || renderedFontSize != fontSize
      || renderedFontWeight != fontWeightValue
      || renderedStrokeWidth != CGFloat(strokeWidth)
      || renderedMaxTextWidth != maxTextWidth

    var textWidth = renderedTextWidth
    var textHeight = renderedTextHeight

    if needsLayout {
      let weight = UIFont.Weight(rawValue: fontWeightValue)
      let font = UIFont.systemFont(ofSize: fontSize, weight: weight)
      let boundingSize = (item.content as NSString).boundingRect(
        with: CGSize(width: maxTextWidth, height: .greatestFiniteMagnitude),
        options: [.usesLineFragmentOrigin, .usesFontLeading],
        attributes: [.font: font],
        context: nil
      ).size

      textWidth = ceil(min(boundingSize.width, maxTextWidth))
      textHeight = ceil(boundingSize.height) + 6

      currentContent = item.content
      renderedSubtitleFrom = item.from
      renderedSubtitleTo = item.to
      renderedTextWidth = textWidth
      renderedTextHeight = textHeight
      renderedFontSize = fontSize
      renderedFontWeight = fontWeightValue
      renderedStrokeWidth = CGFloat(strokeWidth)
      renderedMaxTextWidth = maxTextWidth

      textLayer.font = font
      textLayer.fontSize = fontSize
      textLayer.string = item.content
      textLayer.foregroundColor = UIColor.white.cgColor
      textLayer.shadowColor = UIColor.black.cgColor
      textLayer.shadowOpacity = 0.9
      textLayer.shadowRadius = CGFloat(strokeWidth)
      textLayer.shadowOffset = .zero
    }

    let bgWidth = max(40, min(maxTextWidth, textWidth + 20))
    let bgHeight = textHeight + 8
    let bgX = (bounds.width - bgWidth) / 2
    let bgY = max(0, bounds.height - CGFloat(paddingBottom) - bgHeight)

    backgroundLayer.isHidden = backgroundOpacity <= 0
    if !backgroundLayer.isHidden {
      backgroundLayer.frame = CGRect(x: bgX, y: bgY, width: bgWidth, height: bgHeight)
      backgroundLayer.backgroundColor = UIColor.black.withAlphaComponent(CGFloat(backgroundOpacity)).cgColor
    }

    textLayer.frame = CGRect(
      x: bgX + 10,
      y: bgY + 4,
      width: max(1, bgWidth - 20),
      height: textHeight
    )
  }

  private func clearSubtitle() {
    currentContent = ""
    textLayer.string = ""
    backgroundLayer.isHidden = true
  }

  private func currentSubtitle(at time: Double) -> SubtitleItemRecord? {
    var low = 0
    var high = subtitles.count - 1
    var candidate: SubtitleItemRecord?

    while low <= high {
      let mid = (low + high) / 2
      if subtitles[mid].from <= time {
        candidate = subtitles[mid]
        low = mid + 1
      } else {
        high = mid - 1
      }
    }

    if let candidate, time <= candidate.to {
      return candidate
    }
    return nil
  }
}
