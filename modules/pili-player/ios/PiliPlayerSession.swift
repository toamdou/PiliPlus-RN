// Copyright 2026 PiliPlus. All rights reserved.

import AVFoundation
import AVFAudio
import CoreImage
import ExpoModulesCore
import Photos
import UIKit

struct PlayerSourceRecord: Record {
    @Field var uri: String? = nil
    @Field var headers: [String: String]? = nil

    init() {}
}

struct VideoSizeRecord: Record {
    @Field var width: Double = 0
    @Field var height: Double = 0

    init() {}

    init(width: Double, height: Double) {
        self.width = width
        self.height = height
    }
}

struct VideoTrackRecord: Record {
    @Field var size: VideoSizeRecord? = nil
    @Field var frameRate: Double? = nil
    @Field var mimeType: String? = nil

    init() {}
}

enum PlayerScreenshotError: LocalizedError {
    case noItem
    case generationFailed
    case encodeFailed
    case permissionDenied
    case photoSaveFailed

    var errorDescription: String? {
        switch self {
        case .noItem:
            return "No active video item"
        case .generationFailed:
            return "Could not generate the current video frame"
        case .encodeFailed:
            return "Could not encode the screenshot"
        case .permissionDenied:
            return "Photo library permission denied"
        case .photoSaveFailed:
            return "Could not save the screenshot to the photo library"
        }
    }
}

/// Module-level singleton AVPlayer session shared by the detail and fullscreen routes.
final class PiliPlayerSession: NSObject {
    static let shared = PiliPlayerSession()

    let player = AVPlayer()
    private(set) var status = "idle"
    private(set) var isPlaying = false
    private(set) var currentSourceUri: String?
    private(set) var isLoopEnabled = false

    /// Bridge used by PiliPlayerModule to forward native events to JavaScript.
    var eventHandler: ((String, [String: Any?]) -> Void)?

    lazy var sharedRef = SharedRef<AVPlayer>(player)

    private var isActivated = false
    private var timeObserver: Any?
    private var skipBoundaryObserver: Any?
    private var timeUpdateInterval: Double = 0
    private var skipSegments: [[Double]] = []
    private var lastSkipEnd: Double = -1
    private var preferredForwardBufferDuration: Double = 0
    private var maxResolution: CGSize?
    private var peakBitRate: Double?
    private var isLiveMode = false
    private var pendingSeek: Double?
    private var desiredRate: Float = 1
    private var firstFrameItem: AVPlayerItem?
    private var currentTrackSize: CGSize?
    private var savedVideoItem: AVPlayerItem?
    private var savedSourceUri: String?
    private(set) var isAudioOnlyMode = false
    private var screenshotVideoOutput: AVPlayerItemVideoOutput?
    private var screenshotOutputItem: AVPlayerItem?

    private var currentItemObservation: NSKeyValueObservation?
    private var itemStatusObservation: NSKeyValueObservation?
    private var timeControlObservation: NSKeyValueObservation?
    private var presentationSizeObservation: NSKeyValueObservation?
    private var sleepObserver: NSObjectProtocol?
    private var endObserver: NSObjectProtocol?
    private var failedEndObserver: NSObjectProtocol?
    private var appLifecycleObservers: [NSObjectProtocol] = []

    private override init() {
        super.init()
    }

    func activate() {
        guard !isActivated else {
            return
        }
        isActivated = true

        // AVAudioSession category/options 统一由 pili-audio 配置；这里只启用外部播放，
        // 不再用固定 options 覆盖 pili-audio 侧的 .allowAirPlay。
        player.allowsExternalPlayback = true

        currentItemObservation = player.observe(\.currentItem, options: [.new]) { [weak self] player, _ in
            self?.handleCurrentItemChange(for: player)
        }
        timeControlObservation = player.observe(\.timeControlStatus, options: [.new]) { [weak self] player, _ in
            self?.updatePlayingState(for: player)
            self?.maybeFireFirstFrame(for: player)
        }
        sleepObserver = NotificationCenter.default.addObserver(
            forName: Notification.Name("PiliPlus.SleepTimerFired"),
            object: nil,
            queue: .main
        ) { [weak self] _ in
            self?.pause()
        }
        appLifecycleObservers.append(
            NotificationCenter.default.addObserver(
                forName: UIApplication.didEnterBackgroundNotification,
                object: nil,
                queue: .main
            ) { [weak self] _ in
                self?.removeTimeObserver()
                self?.updateKeepAwake(false)
            }
        )
        appLifecycleObservers.append(
            NotificationCenter.default.addObserver(
                forName: UIApplication.didBecomeActiveNotification,
                object: nil,
                queue: .main
            ) { [weak self] _ in
                self?.updateTimeObserverForPlaybackState()
                self?.updateKeepAwake(self?.isPlaying ?? false)
            }
        )

        installEndObservers()
        handleCurrentItemChange(for: player)
    }

    func load(source: PlayerSourceRecord?) {
        activate()

        if isAudioOnlyMode {
            isAudioOnlyMode = false
            savedVideoItem = nil
            savedSourceUri = nil
        }

        guard let source, let uri = source.uri, let url = URL(string: uri) else {
            player.replaceCurrentItem(with: nil)
            currentSourceUri = nil
            pendingSeek = nil
            firstFrameItem = nil
            updateKeepAwake(false)
            setStatus("idle")
            return
        }

        var options: [String: Any] = [:]
        if let headers = source.headers, !headers.isEmpty {
            options[AVURLAssetHTTPHeaderFieldsKey] = headers
        }

        let asset = AVURLAsset(url: url, options: options)
        let item = AVPlayerItem(asset: asset)
        applyPitchAlgorithm(to: item)
        applyStreamingLimits(to: item)
        item.preferredForwardBufferDuration = bufferDurationForCurrentMode()
        currentSourceUri = uri
        pendingSeek = nil
        setStatus("loading")
        player.replaceCurrentItem(with: item)
    }

    func play() {
        activate()
        try? AVAudioSession.sharedInstance().setActive(true)
        updateKeepAwake(true)
        player.play()
        if #available(iOS 16.0, *) {
            player.defaultRate = desiredRate
        }
        player.rate = desiredRate
        if !isPlaying {
            isPlaying = true
            eventHandler?("playingChange", ["isPlaying": true, "oldIsPlaying": false])
        }
        maybeFireFirstFrame(for: player)
        updatePlayingState(for: player)
        updateTimeObserverForPlaybackState()
    }

    func pause() {
        player.pause()
        updateKeepAwake(false)
        if isPlaying {
            isPlaying = false
            eventHandler?("playingChange", ["isPlaying": false, "oldIsPlaying": true])
        }
        updatePlayingState(for: player)
        updateTimeObserverForPlaybackState()
    }

    func seek(to seconds: Double) {
        lastSkipEnd = -1
        pendingSeek = max(0, seconds)
        applyPendingSeekIfReady()
    }

    func setSkipSegments(_ segments: [[Double]]) {
        skipSegments = segments
            .map { [$0.first ?? 0, $0.count > 1 ? $0[1] : ($0.first ?? 0)] }
            .filter { $0[1] > $0[0] }
        lastSkipEnd = -1
        rebuildSkipBoundaryObserver()
    }

    func setRate(_ rate: Float) {
        desiredRate = rate
        applyPitchAlgorithm(to: player.currentItem)
        if #available(iOS 16.0, *) {
            player.defaultRate = rate
        }
        player.rate = rate
    }

    private func applyPitchAlgorithm(to item: AVPlayerItem?) {
        // 1x 用低 CPU 的 timeDomain；倍速才切回更高质量算法。
        item?.audioTimePitchAlgorithm = desiredRate == 1 ? .timeDomain : .spectral
    }

    func setVolume(_ volume: Float) {
        player.volume = min(max(volume, 0), 1)
    }

    func setMuted(_ muted: Bool) {
        player.isMuted = muted
    }

    func setLoop(_ loop: Bool) {
        isLoopEnabled = loop
    }

    func setTimeUpdateInterval(_ interval: Double) {
        timeUpdateInterval = interval > 0 ? interval : 0
        updateTimeObserverForPlaybackState()
    }

    func setBufferConfig(seconds: Double) {
        preferredForwardBufferDuration = max(0, seconds)
        player.currentItem?.preferredForwardBufferDuration = preferredForwardBufferDuration
    }

    func setStreamingLimits(maxWidth: Double, maxHeight: Double, peakBitRate: Double) {
        maxResolution = maxWidth > 0 && maxHeight > 0
            ? CGSize(width: maxWidth, height: maxHeight)
            : nil
        self.peakBitRate = peakBitRate > 0 ? peakBitRate : nil
        applyStreamingLimits(to: player.currentItem)
    }

    /// 直播模式：关闭“尽量少卡顿”的自动缓冲策略以降低延迟，并限制为小缓冲。
    func setLiveMode(_ live: Bool) {
        isLiveMode = live
        player.automaticallyWaitsToMinimizeStalling = !live
        if #available(iOS 16.0, *) {
            player.automaticallyPreservesTimeOffsetFromLive = live
        }
        if live {
            player.currentItem?.preferredForwardBufferDuration = min(
                preferredForwardBufferDuration > 0 ? preferredForwardBufferDuration : 1,
                2
            )
        } else {
            player.currentItem?.preferredForwardBufferDuration = preferredForwardBufferDuration
        }
    }

    private func applyStreamingLimits(to item: AVPlayerItem?) {
        guard let item else {
            return
        }
        if let maxResolution {
            item.preferredMaximumResolution = maxResolution
        }
        if let peakBitRate {
            item.preferredPeakBitRate = peakBitRate
        }
    }

    private func bufferDurationForCurrentMode() -> Double {
        if isLiveMode {
            return min(preferredForwardBufferDuration > 0 ? preferredForwardBufferDuration : 1, 2)
        }
        return preferredForwardBufferDuration
    }

    /// 用共享 AVPlayer 播放纯音频源（DASH 分离音轨 / 直播 onlyAudio），
    /// 先保存当前视频 item，退出音频模式时原样恢复，避免第二套播放器。
    func enterAudioOnly(source: PlayerSourceRecord?, startTime: Double) {
        activate()
        guard !isAudioOnlyMode else {
            return
        }
        savedVideoItem = player.currentItem
        savedSourceUri = currentSourceUri
        isAudioOnlyMode = true

        guard let source, let uri = source.uri, let url = URL(string: uri) else {
            player.pause()
            return
        }

        var options: [String: Any] = [:]
        if let headers = source.headers, !headers.isEmpty {
            options[AVURLAssetHTTPHeaderFieldsKey] = headers
        }
        let asset = AVURLAsset(url: url, options: options)
        let item = AVPlayerItem(asset: asset)
        applyPitchAlgorithm(to: item)
        applyStreamingLimits(to: item)
        item.preferredForwardBufferDuration = bufferDurationForCurrentMode()
        currentSourceUri = uri
        pendingSeek = max(0, startTime)
        setStatus("loading")
        player.replaceCurrentItem(with: item)
    }

    @discardableResult
    func exitAudioOnly() -> Bool {
        guard isAudioOnlyMode else {
            return false
        }
        isAudioOnlyMode = false
        let savedItem = savedVideoItem
        let savedUri = savedSourceUri
        savedVideoItem = nil
        savedSourceUri = nil
        currentSourceUri = savedUri
        pendingSeek = nil
        if let savedItem {
            player.replaceCurrentItem(with: savedItem)
            return true
        }
        player.replaceCurrentItem(with: nil)
        return false
    }

    func currentTime() -> Double {
        let seconds = player.currentTime().seconds
        return seconds.isFinite ? max(0, seconds) : 0
    }

    func duration() -> Double {
        guard let seconds = player.currentItem?.duration.seconds, seconds.isFinite, seconds > 0 else {
            return 0
        }
        return seconds
    }

    func rate() -> Double {
        Double(desiredRate)
    }

    func volume() -> Double {
        Double(player.volume)
    }

    func isMuted() -> Bool {
        player.isMuted
    }

    func videoTrackRecord() -> VideoTrackRecord? {
        guard let currentTrackSize, currentTrackSize.width > 0, currentTrackSize.height > 0 else {
            return nil
        }
        var record = VideoTrackRecord()
        record.size = VideoSizeRecord(
            width: Double(currentTrackSize.width),
            height: Double(currentTrackSize.height)
        )
        return record
    }

    func generateScreenshot() async throws -> String {
        guard let item = player.currentItem, item.status == .readyToPlay else {
            throw PlayerScreenshotError.noItem
        }

        let image = try await currentFrameCGImage(item: item, time: player.currentTime())
        let uiImage = UIImage(cgImage: image)
        guard let data = uiImage.jpegData(compressionQuality: 0.92) else {
            throw PlayerScreenshotError.encodeFailed
        }

        let url = FileManager.default.temporaryDirectory
            .appendingPathComponent("pili-screenshot-\(UUID().uuidString).jpg")
        try data.write(to: url)
        return url.absoluteString
    }

    func saveCurrentFrameToPhotos() async throws -> Bool {
        guard let item = player.currentItem, item.status == .readyToPlay else {
            throw PlayerScreenshotError.noItem
        }
        let image = try await currentFrameCGImage(item: item, time: player.currentTime())
        let uiImage = UIImage(cgImage: image)
        guard let data = uiImage.jpegData(compressionQuality: 0.92) else {
            throw PlayerScreenshotError.encodeFailed
        }

        let status: PHAuthorizationStatus = await withCheckedContinuation { continuation in
            PHPhotoLibrary.requestAuthorization(for: .addOnly) { status in
                continuation.resume(returning: status)
            }
        }
        guard status == .authorized || status == .limited else {
            throw PlayerScreenshotError.permissionDenied
        }

        return try await withCheckedThrowingContinuation { continuation in
            PHPhotoLibrary.shared().performChanges {
                let request = PHAssetCreationRequest.forAsset()
                request.addResource(with: .photo, data: data, options: nil)
            } completionHandler: { success, error in
                if success {
                    continuation.resume(returning: true)
                } else {
                    continuation.resume(throwing: error ?? PlayerScreenshotError.photoSaveFailed)
                }
            }
        }
    }

    private func currentFrameCGImage(
        item: AVPlayerItem,
        time: CMTime
    ) async throws -> CGImage {
        let output: AVPlayerItemVideoOutput
        if let existing = screenshotVideoOutput, screenshotOutputItem === item {
            output = existing
        } else {
            let newOutput = AVPlayerItemVideoOutput(pixelBufferAttributes: [
                kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA,
            ])
            item.add(newOutput)
            screenshotVideoOutput = newOutput
            screenshotOutputItem = item
            output = newOutput
        }

        var displayTime = CMTime.zero
        var pixelBuffer: CVPixelBuffer?
        for _ in 0..<20 {
            if output.hasNewPixelBuffer(forItemTime: time) {
                pixelBuffer = output.copyPixelBuffer(
                    forItemTime: time,
                    itemTimeForDisplay: &displayTime
                )
                if pixelBuffer != nil {
                    break
                }
            }
            try? await Task.sleep(nanoseconds: 10_000_000)
        }
        if let pixelBuffer {
            let ciImage = CIImage(cvPixelBuffer: pixelBuffer)
            let context = CIContext(options: [.useSoftwareRenderer: false])
            if let cgImage = context.createCGImage(ciImage, from: ciImage.extent) {
                return cgImage
            }
        }
        return try await generateAssetCGImage(item: item, time: time)
    }

    private func generateAssetCGImage(
        item: AVPlayerItem,
        time: CMTime
    ) async throws -> CGImage {
        let generator = AVAssetImageGenerator(asset: item.asset)
        generator.appliesPreferredTrackTransform = true
        generator.requestedTimeToleranceBefore = .zero
        generator.requestedTimeToleranceAfter = .zero

        return try await withCheckedThrowingContinuation { continuation in
            generator.generateCGImagesAsynchronously(forTimes: [NSValue(time: time)]) { _, image, _, _, error in
                if let image {
                    continuation.resume(returning: image)
                } else if let error {
                    continuation.resume(throwing: error)
                } else {
                    continuation.resume(throwing: PlayerScreenshotError.generationFailed)
                }
            }
        }
    }

    // MARK: - Player observation

    private func handleCurrentItemChange(for player: AVPlayer) {
        itemStatusObservation?.invalidate()
        presentationSizeObservation?.invalidate()
        screenshotVideoOutput = nil
        screenshotOutputItem = nil
        itemStatusObservation = nil
        presentationSizeObservation = nil
        firstFrameItem = nil
        rebuildSkipBoundaryObserver()

        guard let item = player.currentItem else {
            currentTrackSize = nil
            setStatus("idle")
            return
        }
        currentTrackSize = nil

        itemStatusObservation = item.observe(\.status, options: [.new, .old]) { [weak self] item, _ in
            self?.handleItemStatusChange(item)
        }
        presentationSizeObservation = item.observe(\.presentationSize, options: [.new]) { [weak self] item, _ in
            self?.handlePresentationSizeChange(item)
        }

        handleItemStatusChange(item)
        handlePresentationSizeChange(item)
    }

    private func rebuildSkipBoundaryObserver() {
        if let skipBoundaryObserver {
            player.removeTimeObserver(skipBoundaryObserver)
            self.skipBoundaryObserver = nil
        }
        guard !skipSegments.isEmpty, player.currentItem != nil else {
            return
        }
        let times = skipSegments.map {
            NSValue(time: CMTime(seconds: $0[0], preferredTimescale: 600))
        }
        skipBoundaryObserver = player.addBoundaryTimeObserver(forTimes: times, queue: .main) {
            [weak self] in
            guard let self, let item = self.player.currentItem else {
                return
            }
            let current = item.currentTime().seconds
            for segment in self.skipSegments {
                let start = segment[0]
                let end = segment[1]
                if current >= start - 0.1, current < end - 0.5, self.lastSkipEnd < end - 0.5 {
                    self.lastSkipEnd = end
                    self.player.seek(
                        to: CMTime(seconds: end, preferredTimescale: 600),
                        toleranceBefore: .zero,
                        toleranceAfter: .zero
                    )
                    break
                }
            }
        }
    }

    private func handleItemStatusChange(_ item: AVPlayerItem) {
        switch item.status {
        case .readyToPlay:
            applyPendingSeekIfReady()
            setStatus("readyToPlay")
            maybeFireFirstFrame(for: player)
        case .failed:
            let message = item.error?.localizedDescription ?? "Player item failed"
            setStatus("error", error: message)
            eventHandler?("error", ["code": "ERR_PLAYER_FAILED", "message": message])
        case .unknown:
            setStatus("loading")
        @unknown default:
            setStatus("loading")
        }
    }

    private func handlePresentationSizeChange(_ item: AVPlayerItem) {
        let size = item.presentationSize
        guard size.width > 0, size.height > 0 else {
            return
        }

        let nextSize = CGSize(width: size.width, height: size.height)
        if currentTrackSize != nextSize {
            currentTrackSize = nextSize
            eventHandler?(
                "videoTrackChange",
                [
                    "videoTrack": [
                        "size": [
                            "width": Double(size.width),
                            "height": Double(size.height),
                        ],
                    ],
                ]
            )
        }
        maybeFireFirstFrame(for: player)
    }

    private func updatePlayingState(for player: AVPlayer) {
        let nextPlaying = player.timeControlStatus == .playing
        updateKeepAwake(nextPlaying)
        guard nextPlaying != isPlaying else {
            return
        }
        let oldPlaying = isPlaying
        isPlaying = nextPlaying
        eventHandler?("playingChange", ["isPlaying": nextPlaying, "oldIsPlaying": oldPlaying])
        updateTimeObserverForPlaybackState()
    }

    private func updateTimeObserverForPlaybackState() {
        if isPlaying {
            installTimeObserver()
        } else {
            removeTimeObserver()
        }
    }

    private func maybeFireFirstFrame(for player: AVPlayer) {
        guard let item = player.currentItem,
              item.status == .readyToPlay,
              item.presentationSize.width > 0,
              item.presentationSize.height > 0,
              player.timeControlStatus == .playing,
              firstFrameItem !== item else {
            return
        }
        firstFrameItem = item
        eventHandler?("firstFrameRender", [:])
    }

    private func applyPendingSeekIfReady() {
        guard let pendingSeek, player.currentItem?.status == .readyToPlay else {
            return
        }
        self.pendingSeek = nil
        let time = CMTime(seconds: pendingSeek, preferredTimescale: 600)
        player.seek(to: time, toleranceBefore: .zero, toleranceAfter: .zero)
    }

    private func setStatus(_ newStatus: String, error: String? = nil) {
        guard newStatus != status else {
            return
        }
        let oldStatus = status
        status = newStatus
        var payload: [String: Any?] = [
            "status": newStatus,
            "oldStatus": oldStatus,
        ]
        if let error {
            payload["error"] = ["message": error]
        }
        eventHandler?("statusChange", payload)
    }

    private func updateKeepAwake(_ keepAwake: Bool) {
        DispatchQueue.main.async {
            let shouldKeepAwake = keepAwake
                && UIApplication.shared.applicationState == .active
                && !self.isAudioOnlyMode
            UIApplication.shared.isIdleTimerDisabled = shouldKeepAwake
        }
    }

    private func installTimeObserver() {
        removeTimeObserver()
        guard isPlaying, timeUpdateInterval > 0, UIApplication.shared.applicationState == .active else {
            return
        }

        let interval = CMTime(seconds: timeUpdateInterval, preferredTimescale: 600)
        timeObserver = player.addPeriodicTimeObserver(forInterval: interval, queue: .main) { [weak self] time in
            guard let self else {
                return
            }
            let seconds = time.seconds.isFinite ? time.seconds : 0
            let duration = self.player.currentItem?.duration.seconds ?? 0
            let safeDuration = duration.isFinite && duration > 0 ? duration : 0
            self.eventHandler?("timeUpdate", ["currentTime": seconds, "duration": safeDuration])
        }
    }

    private func removeTimeObserver() {
        if let timeObserver {
            player.removeTimeObserver(timeObserver)
            self.timeObserver = nil
        }
    }

    private func installEndObservers() {
        endObserver = NotificationCenter.default.addObserver(
            forName: AVPlayerItem.didPlayToEndTimeNotification,
            object: nil,
            queue: .main
        ) { [weak self] notification in
            guard let self,
                  let item = notification.object as? AVPlayerItem,
                  item === self.player.currentItem else {
                return
            }
            self.eventHandler?("playToEnd", [:])
            if self.isLoopEnabled {
                self.player.seek(to: .zero)
                self.player.play()
            }
        }

        failedEndObserver = NotificationCenter.default.addObserver(
            forName: AVPlayerItem.failedToPlayToEndTimeNotification,
            object: nil,
            queue: .main
        ) { [weak self] notification in
            guard let self,
                  let item = notification.object as? AVPlayerItem,
                  item === self.player.currentItem else {
                return
            }
            let message = item.error?.localizedDescription ?? "Playback failed"
            self.setStatus("error", error: message)
            self.eventHandler?("error", ["code": "ERR_PLAY_FAILED", "message": message])
        }
    }
}
