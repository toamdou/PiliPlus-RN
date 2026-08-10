// Copyright 2026 PiliPlus. All rights reserved.

import AVFoundation
import ExpoModulesCore

private final class WeakDanmakuViewBox {
  weak var value: PiliDanmakuOverlayView?

  init(_ value: PiliDanmakuOverlayView) {
    self.value = value
  }
}

private final class WeakSubtitleViewBox {
  weak var value: PiliSubtitleView?

  init(_ value: PiliSubtitleView) {
    self.value = value
  }
}

/// Module-level clock bridge so a shared AVPlayer can be applied to every mounted
/// danmaku/subtitle overlay, including views that mount after `bindPlayer` is called.
final class PiliDanmakuClockBridge {
  static let shared = PiliDanmakuClockBridge()

  private weak var boundPlayer: AVPlayer?
  private var danmakuViews: [WeakDanmakuViewBox] = []
  private var subtitleViews: [WeakSubtitleViewBox] = []

  private init() {}

  func bind(_ player: AVPlayer?) {
    boundPlayer = player
    for box in danmakuViews {
      box.value?.bindPlayer(player)
    }
    for box in subtitleViews {
      box.value?.bindPlayer(player)
    }
    prune()
  }

  func register(_ view: PiliDanmakuOverlayView) {
    prune()
    if danmakuViews.contains(where: { box in
      guard let value = box.value else {
        return false
      }
      return value === view
    }) {
      return
    }
    danmakuViews.append(WeakDanmakuViewBox(view))
    view.bindPlayer(boundPlayer)
  }

  func register(_ view: PiliSubtitleView) {
    prune()
    if subtitleViews.contains(where: { box in
      guard let value = box.value else {
        return false
      }
      return value === view
    }) {
      return
    }
    subtitleViews.append(WeakSubtitleViewBox(view))
    view.bindPlayer(boundPlayer)
  }

  func unregister(_ view: PiliDanmakuOverlayView) {
    danmakuViews.removeAll { box in
      guard let value = box.value else {
        return true
      }
      return value === view
    }
  }

  func unregister(_ view: PiliSubtitleView) {
    subtitleViews.removeAll { box in
      guard let value = box.value else {
        return true
      }
      return value === view
    }
  }

  private func prune() {
    danmakuViews.removeAll { $0.value == nil }
    subtitleViews.removeAll { $0.value == nil }
  }
}

public final class PiliDanmakuModule: Module {
    public func definition() -> ModuleDefinition {
        Name("PiliDanmaku")

        AsyncFunction("isAvailableAsync") { () -> Bool in
            true
        }

        AsyncFunction("bindPlayer") { (player: SharedRef<AVPlayer>?) in
            PiliDanmakuClockBridge.shared.bind(player?.ref)
        }.runOnQueue(.main)

        AsyncFunction("parseDmSegReplyAsync") { (bytes: Data) -> [[String: Any]] in
            PiliDanmakuParser.parseDmSegReply(bytes)
        }

        AsyncFunction("parseXmlDanmakuAsync") { (text: String) -> [[String: Any]] in
            PiliDanmakuParser.parseXmlDanmaku(text)
        }

        AsyncFunction("prepareDanmakuAsync") { (items: [[String: Any]], options: [String: Any]) -> [String: Any] in
            PiliDanmakuPreparer.prepare(items: items, options: options)
        }

        AsyncFunction("loadAndPrepareAsync") { (cid: Int, options: [String: Any], requestId: String) async throws -> [String: Any] in
            try await PiliDanmakuLoader.shared.loadAndPrepare(
                cid: cid,
                options: options,
                requestId: requestId
            )
        }

        Function("cancelLoad") { (requestId: String) in
            PiliDanmakuLoader.shared.cancel(requestId: requestId)
        }

        AsyncFunction("loadSubtitleJsonAsync") { (url: String) async throws -> [SubtitleItemRecord] in
            try await PiliSubtitleLoader.shared.load(url: url)
        }

        View(PiliDanmakuOverlayView.self) {
            Events(
                "onDanmakuTap"
            )

            Prop("items") { (view: PiliDanmakuOverlayView, items: [DanmakuItemRecord]?) in
                view.setItems(items)
            }

            Prop("currentTime") { (view: PiliDanmakuOverlayView, currentTime: Double?) in
                view.setCurrentTime(currentTime)
            }

            Prop("visible") { (view: PiliDanmakuOverlayView, visible: Bool?) in
                view.setVisible(visible)
            }

            Prop("density") { (view: PiliDanmakuOverlayView, density: Double?) in
                view.setDensity(density)
            }

            Prop("height") { (view: PiliDanmakuOverlayView, height: Double?) in
                view.setHeight(height)
            }

            Prop("opacity") { (view: PiliDanmakuOverlayView, opacity: Double?) in
                view.setOpacity(opacity)
            }

            Prop("speed") { (view: PiliDanmakuOverlayView, speed: Double?) in
                view.setSpeed(speed)
            }

            Prop("lineHeight") { (view: PiliDanmakuOverlayView, lineHeight: Double?) in
                view.setLineHeight(lineHeight)
            }

            Prop("interactive") { (view: PiliDanmakuOverlayView, interactive: Bool?) in
                view.setInteractive(interactive)
            }
        }

        View(PiliSubtitleView.self) {
            Prop("subtitles") { (view: PiliSubtitleView, subtitles: [SubtitleItemRecord]?) in
                view.setSubtitles(subtitles)
            }

            Prop("currentTime") { (view: PiliSubtitleView, currentTime: Double?) in
                view.setCurrentTime(currentTime)
            }

            Prop("visible") { (view: PiliSubtitleView, visible: Bool?) in
                view.setVisible(visible)
            }

            Prop("fontSizeScale") { (view: PiliSubtitleView, fontSizeScale: Double?) in
                view.setFontSizeScale(fontSizeScale)
            }

            Prop("strokeWidth") { (view: PiliSubtitleView, strokeWidth: Double?) in
                view.setStrokeWidth(strokeWidth)
            }

            Prop("fontWeight") { (view: PiliSubtitleView, fontWeight: Double?) in
                view.setFontWeight(fontWeight)
            }

            Prop("paddingHorizontal") { (view: PiliSubtitleView, paddingHorizontal: Double?) in
                view.setPaddingHorizontal(paddingHorizontal)
            }

            Prop("paddingBottom") { (view: PiliSubtitleView, paddingBottom: Double?) in
                view.setPaddingBottom(paddingBottom)
            }

            Prop("backgroundOpacity") { (view: PiliSubtitleView, backgroundOpacity: Double?) in
                view.setBackgroundOpacity(backgroundOpacity)
            }
        }
    }
}
