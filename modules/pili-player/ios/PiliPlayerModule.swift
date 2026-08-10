// Copyright 2026 PiliPlus. All rights reserved.

import AVFoundation
import ExpoModulesCore
import UIKit

public final class PiliPlayerModule: Module {
    public func definition() -> ModuleDefinition {
        Name("PiliPlayer")

        Events(
            "timeUpdate",
            "statusChange",
            "playingChange",
            "videoTrackChange",
            "error",
            "firstFrameRender",
            "playToEnd"
        )

        OnCreate {
            PiliPlayerSession.shared.eventHandler = { [weak self] eventName, payload in
                self?.sendEvent(eventName, payload)
            }
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
