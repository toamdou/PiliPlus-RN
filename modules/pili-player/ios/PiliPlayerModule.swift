// Copyright 2026 PiliPlus. All rights reserved.

import AVFoundation
import ExpoModulesCore
import UIKit

public final class PiliPlayerModule: Module {
    /// 后台画中画开关（JS 设置页「后台画中画」同步）。开启后进入后台自动拉起系统 PiP 小窗。
    private var piPBackgroundEnabled = false
    private var backgroundPiPObserver: NSObjectProtocol?

    public func definition() -> ModuleDefinition {
        Name("PiliPlayer")

        Events(
            "timeUpdate",
            "statusChange",
            "playingChange",
            "videoTrackChange",
            "error",
            "firstFrameRender",
            "playToEnd",
            "buffering",
            "pictureInPictureActiveChange"
        )

        OnCreate {
            PiliPlayerSession.shared.eventHandler = { [weak self] eventName, payload in
                self?.sendEvent(eventName, payload)
            }
            // PiP 激活状态变化（true=小窗已开启，false=小窗已关闭）转发到 JS，
            // 供「画中画不加载弹幕」等逻辑消费。
            PiliPlayerPiPRegistrar.onPiPStateChange = { [weak self] active in
                self?.sendEvent("pictureInPictureActiveChange", ["active": active])
            }
            // 后台画中画：enablePiP 开启且应用进入后台时，自动拉起系统 PiP 小窗，
            // 让视频在锁屏/切后台后仍以悬浮小窗继续播放。
            backgroundPiPObserver = NotificationCenter.default.addObserver(
                forName: UIApplication.didEnterBackgroundNotification,
                object: nil,
                queue: .main
            ) { [weak self] _ in
                guard let self, self.piPBackgroundEnabled else { return }
                PiliPlayerPiPRegistrar.activeView?.startPiP()
            }
        }

        OnDestroy {
            if let backgroundPiPObserver {
                NotificationCenter.default.removeObserver(backgroundPiPObserver)
                backgroundPiPObserver = nil
            }
            PiliPlayerPiPRegistrar.onPiPStateChange = nil
        }

        AsyncFunction("isAvailableAsync") { () -> Bool in
            true
        }

        Function("create") {
            PiliPlayerSession.shared.activate()
        }

        AsyncFunction("replaceAsync") { (source: PlayerSourceRecord?) in
            PiliPlayerSession.shared.load(source: source)
        }.runOnQueue(.main)

        AsyncFunction("enterAudioOnlyAsync") { (source: PlayerSourceRecord?, startTime: Double) in
            PiliPlayerSession.shared.enterAudioOnly(source: source, startTime: startTime)
        }.runOnQueue(.main)

        AsyncFunction("exitAudioOnlyAsync") { () -> Bool in
            PiliPlayerSession.shared.exitAudioOnly()
        }.runOnQueue(.main)

        Function("play") {
            PiliPlayerSession.shared.play()
        }

        Function("pause") {
            PiliPlayerSession.shared.pause()
        }

        Function("seekTo") { (seconds: Double) in
            PiliPlayerSession.shared.seek(to: seconds)
        }

        Function("setRate") { (rate: Double) in
            PiliPlayerSession.shared.setRate(Float(rate))
        }

        Function("setVolume") { (volume: Double) in
            PiliPlayerSession.shared.setVolume(Float(volume))
        }

        Function("setMuted") { (muted: Bool) in
            PiliPlayerSession.shared.setMuted(muted)
        }

        Function("setLoop") { (loop: Bool) in
            PiliPlayerSession.shared.setLoop(loop)
        }

        Function("setTimeUpdateInterval") { (interval: Double) in
            PiliPlayerSession.shared.setTimeUpdateInterval(interval)
        }

        Function("setBufferConfig") { (seconds: Double) in
            PiliPlayerSession.shared.setBufferConfig(seconds: seconds)
        }

        Function("setStreamingLimits") { (maxWidth: Double, maxHeight: Double, peakBitRate: Double) in
            PiliPlayerSession.shared.setStreamingLimits(
                maxWidth: maxWidth,
                maxHeight: maxHeight,
                peakBitRate: peakBitRate
            )
        }

        Function("setLiveMode") { (live: Bool) in
            PiliPlayerSession.shared.setLiveMode(live)
        }

        Function("setSkipSegments") { (segments: [[Double]]) in
            PiliPlayerSession.shared.setSkipSegments(segments)
        }

        Function("currentTime") { () -> Double in
            PiliPlayerSession.shared.currentTime()
        }

        Function("duration") { () -> Double in
            PiliPlayerSession.shared.duration()
        }

        Function("status") { () -> String in
            PiliPlayerSession.shared.status
        }

        Function("isPlaying") { () -> Bool in
            PiliPlayerSession.shared.isPlaying
        }

        Function("getRate") { () -> Double in
            PiliPlayerSession.shared.rate()
        }

        Function("getVolume") { () -> Double in
            PiliPlayerSession.shared.volume()
        }

        Function("isMuted") { () -> Bool in
            PiliPlayerSession.shared.isMuted()
        }

        Function("getLoop") { () -> Bool in
            PiliPlayerSession.shared.isLoopEnabled
        }

        Function("getVideoTrack") { () -> VideoTrackRecord? in
            PiliPlayerSession.shared.videoTrackRecord()
        }

        Function("getSharedPlayer") { () -> SharedRef<AVPlayer> in
            PiliPlayerSession.shared.sharedRef
        }

        AsyncFunction("generateScreenshotAsync") { () async throws -> String in
            try await PiliPlayerSession.shared.generateScreenshot()
        }

        AsyncFunction("saveScreenshotToPhotosAsync") { () async throws -> Bool in
            try await PiliPlayerSession.shared.saveCurrentFrameToPhotos()
        }

        AsyncFunction("cropSeekThumbnailAsync") {
            (
                uri: String,
                col: Int,
                row: Int,
                frameW: Double,
                frameH: Double,
                targetWidth: Double,
                targetHeight: Double
            ) async throws -> PiliSeekThumbnailImage in
            try await PiliSeekThumbnail.crop(
                uri: uri,
                col: col,
                row: row,
                frameW: frameW,
                frameH: frameH,
                targetWidth: targetWidth,
                targetHeight: targetHeight
            )
        }

        AsyncFunction("presentFullscreenAsync") { (options: [String: Any]) async throws -> Bool in
            try await PiliFullscreenPresenter.shared.present(options: options)
        }

        Function("dismissFullscreen") {
            PiliFullscreenPresenter.shared.dismiss()
        }

        // MARK: - 画中画 PiP（批次5 P3）
        // 注：start/stop 经 PiliPlayerPiPRegistrar 路由到当前挂载的 PiliPlayerView；
        // 真机验收前需确认 entitlement 已开启，否则 isPictureInPicturePossible 恒为 false。

        Function("setPiPEnabled") { (enabled: Bool) in
            self.piPBackgroundEnabled = enabled
        }

        Function("setPiPRequiresLinearPlayback") { (enabled: Bool) in
            PiliPlayerPiPRegistrar.activeView?.setRequiresLinearPlayback(enabled)
        }

        Function("startPictureInPicture") {
            PiliPlayerPiPRegistrar.activeView?.startPiP()
        }

        Function("stopPictureInPicture") {
            PiliPlayerPiPRegistrar.activeView?.stopPiP()
        }

        Function("isPictureInPictureActive") { () -> Bool in
            PiliPlayerPiPRegistrar.activeView?.isPiPActive ?? false
        }

        Function("isPictureInPicturePossible") { () -> Bool in
            PiliPlayerPiPRegistrar.activeView?.isPiPPossible ?? false
        }

        Class(PiliSeekThumbnailImage.self) {}

        View(PiliPlayerView.self) {
            Prop("player") { (view: PiliPlayerView, player: SharedRef<AVPlayer>?) in
                view.bindPlayer(player?.ref)
            }

            Prop("videoGravity") { (view: PiliPlayerView, videoGravity: String?) in
                view.setVideoGravity(videoGravity)
            }
        }

        View(PiliSeekThumbnailView.self) {
            Prop("image") { (view: PiliSeekThumbnailView, image: SharedRef<UIImage>?) in
                view.setImage(image)
            }
        }

        View(PiliPlayerProgressView.self) {
            Prop("progressTintColor") { (view: PiliPlayerProgressView, color: UIColor?) in
                view.setProgressTintColor(color)
            }

            Prop("trackTintColor") { (view: PiliPlayerProgressView, color: UIColor?) in
                view.setTrackTintColor(color)
            }
        }
    }
}
