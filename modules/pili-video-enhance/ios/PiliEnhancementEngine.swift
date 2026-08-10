// Copyright 2026 PiliPlus. All rights reserved.

import AVFoundation
import CoreMedia
import CoreVideo
import Darwin
import QuartzCore
import UIKit
import VideoToolbox

protocol PiliEnhancementEngineDelegate: AnyObject {
    func enhancementEngine(_ engine: PiliEnhancementEngine, didChangeState state: EnhancementStateRecord)
    func enhancementEngine(_ engine: PiliEnhancementEngine, didFailWithError error: EnhancementErrorRecord)
    func enhancementEngineDidBecomeReady(_ engine: PiliEnhancementEngine)
    func enhancementEngine(_ engine: PiliEnhancementEngine, didSetRenderPath path: PiliEnhancementEngine.RenderPath) -> Bool
    func enhancementEngine(_ engine: PiliEnhancementEngine, didProduceFrame frame: ProcessedVideoFrame, targetMediaTime: CMTime)
}

/// Owns the per-view playback session: `AVPlayerVideoOutput` pulling, quality degradation,
/// `VTFrameProcessor` pipelines, and frame presentation coordination.
final class PiliEnhancementEngine {
    enum RenderPath: Equatable {
        case passthrough
        case sampleBuffer
        case metal
    }

    private struct PulledFrame {
        let pixelBuffer: CVPixelBuffer
        let presentationTime: CMTime
    }

    weak var delegate: PiliEnhancementEngineDelegate?
    private(set) var player: AVPlayer?
    private(set) var renderPath: RenderPath = .passthrough

    private let processingQueue = DispatchQueue(label: "pili.video-enhance.processing", qos: .userInteractive)
    private var displayLink: CADisplayLink?
    private var videoOutput: AnyObject?
    private var qualityTimer: Timer?

    private var playerId = 0
    private var options = EnhanceOptions()
    private var contentFit: EnhancedContentFit = .contain
    private var safeAreaInsets = UIEdgeInsets.zero
    private var isAttached = false
    private var isDetached = true
    private var currentState = "detached"
    private var hasSentReady = false
    private var targetMediaTime = CMTime.zero

    private var previousPulledFrame: PulledFrame?
    private var lastProcessedSourcePTS: CMTime?
    private var lastEmittedPTS: CMTime?
    private var pendingPulledFrame: PulledFrame?
    private var isProcessingFrame = false
    private var pendingMetalFrame: ProcessedVideoFrame?
    private var frameInterpolationPipeline: FrameRateConversionPipeline?
    private var superResolutionPipeline: FrameRateConversionPipeline?
    private var usesCombinedSpatialInterpolation = false

    private var sourceWidth = 0
    private var sourceHeight = 0
    private var sourcePixelFormat: OSType = 0
    private var sourceFrameRate: Double = 0
    private var sourceIsHDR = false
    private var pipelinesConfigured = false

    private var qualityLevel: QualityLevel = .high
    private var lastThermalState: ProcessInfo.ThermalState = .nominal
    private var lowPowerMode = false
    private var batteryLevel: Float = 1
    private var nominalObservationCount = 0
    private var dropSampleStart = CACurrentMediaTime()
    private var displayLinkTickCount = 0
    private var processedFrameCount = 0

    private var targetFPS: Int {
        UIScreen.main.maximumFramesPerSecond
    }

    // MARK: - Capabilities

    static func capabilities() -> EnhancementCapabilitiesRecord {
        let os = ProcessInfo.processInfo.operatingSystemVersion
        let osVersion = "\(os.majorVersion).\(os.minorVersion).\(os.patchVersion)"
        let refreshRate = UIScreen.main.maximumFramesPerSecond
        let screen = UIScreen.main
        let potentialEDR: CGFloat = {
            if #available(iOS 16.0, *) {
                return screen.potentialEDRHeadroom
            }
            return 1.0
        }()
        let hdrCapable = potentialEDR > 1.0
        let insets = mainWindowSafeAreaInsets()

        var superResolution = FeatureSupportRecord(available: false, reason: "unsupported-os")
        var frameInterpolation = FeatureSupportRecord(available: false, reason: "unsupported-os")
        var sdrToHdr = FeatureSupportRecord(available: false, reason: "unsupported-os")

        if os.majorVersion >= 26 {
            if #available(iOS 26.0, *) {
                let srChipSupported = VTLowLatencySuperResolutionScalerConfiguration.isSupported
                let srFactors = srChipSupported
                    ? VTLowLatencySuperResolutionScalerConfiguration.supportedScaleFactors(frameWidth: 1920, frameHeight: 1080)
                    : []
                superResolution = FeatureSupportRecord(
                    available: srChipSupported && !srFactors.isEmpty,
                    reason: srChipSupported && !srFactors.isEmpty ? nil : "unsupported-chip"
                )

                let llfiSupported = VTLowLatencyFrameInterpolationConfiguration.isSupported
                let frcSupported = VTFrameRateConversionConfiguration.isSupported
                let fiSupported = llfiSupported || frcSupported
                frameInterpolation = FeatureSupportRecord(
                    available: fiSupported,
                    reason: fiSupported ? nil : "unsupported-chip"
                )

                let hdrSupported = potentialEDR >= 1.5
                sdrToHdr = FeatureSupportRecord(
                    available: hdrSupported,
                    reason: hdrSupported ? nil : "unsupported-display"
                )
            }
        }

        return EnhancementCapabilitiesRecord(
            available: superResolution.available || frameInterpolation.available || sdrToHdr.available,
            osVersion: osVersion,
            chipName: hardwareModel(),
            refreshRateHz: Double(refreshRate),
            hdrCapable: hdrCapable,
            safeAreaInsets: SafeAreaInsetsRecord(uiEdgeInsets: insets),
            superResolution: superResolution,
            frameInterpolation: frameInterpolation,
            sdrToHdr: sdrToHdr
        )
    }

    // MARK: - Lifecycle

    func attach(
        player: AVPlayer,
        playerId: Int,
        options: EnhanceOptions,
        contentFit: EnhancedContentFit,
        safeAreaInsets: UIEdgeInsets
    ) {
        guard Thread.isMainThread else {
            DispatchQueue.main.async { [weak self] in
                self?.attach(
                    player: player,
                    playerId: playerId,
                    options: options,
                    contentFit: contentFit,
                    safeAreaInsets: safeAreaInsets
                )
            }
            return
        }

        if isAttached, self.player === player, self.playerId == playerId {
            update(options: options, contentFit: contentFit, safeAreaInsets: safeAreaInsets)
            return
        }

        detach()
        self.player = player
        self.playerId = playerId
        self.options = options
        self.contentFit = contentFit
        self.safeAreaInsets = safeAreaInsets
        isAttached = true
        isDetached = false
        hasSentReady = false
        resetFrameState()
        setState("attaching")
        startSession()
    }

    func update(options: EnhanceOptions, contentFit: EnhancedContentFit, safeAreaInsets: UIEdgeInsets) {
        guard Thread.isMainThread else {
            DispatchQueue.main.async { [weak self] in
                self?.update(options: options, contentFit: contentFit, safeAreaInsets: safeAreaInsets)
            }
            return
        }
        guard isAttached, !isDetached else {
            return
        }
        self.options = options
        self.contentFit = contentFit
        self.safeAreaInsets = safeAreaInsets

        if !options.isAnyEnabled {
            fail(with: .enhancementsDisabled, enhancement: nil)
            return
        }

        resetFrameState()
        pipelinesConfigured = false
        updateRenderPath(force: true)
    }

    func detach() {
        guard Thread.isMainThread else {
            DispatchQueue.main.async { [weak self] in
                self?.detach()
            }
            return
        }
        guard !isDetached else {
            return
        }

        isDetached = true
        isAttached = false
        stopDisplayLink()
        stopQualityTimer()
        detachVideoOutput()
        resetFrameState()
        pendingMetalFrame = nil
        renderPath = .passthrough
        _ = delegate?.enhancementEngine(self, didSetRenderPath: .passthrough)
        setState("detached")
        player = nil
    }

    private func startSession() {
        guard let player else {
            return
        }
        guard ProcessInfo.processInfo.operatingSystemVersion.majorVersion >= 26 else {
            fail(with: .unsupportedOS, enhancement: nil)
            return
        }
        if isProtectedContent(player: player) {
            fail(with: .drmUnsupported, enhancement: nil)
            return
        }
        if !options.isAnyEnabled {
            fail(with: .enhancementsDisabled, enhancement: nil)
            return
        }

        let caps = PiliEnhancementEngine.capabilities()
        if options.superResolution == .on, !caps.superResolution.available {
            fail(with: .unsupportedChip, enhancement: "superResolution")
            return
        }
        if options.frameInterpolation == .on, !caps.frameInterpolation.available {
            fail(with: .unsupportedChip, enhancement: "frameInterpolation")
            return
        }
        if options.sdrToHdr == .on, !caps.sdrToHdr.available {
            fail(with: .unsupportedDisplay, enhancement: "sdrToHdr")
            return
        }

        attachVideoOutput(to: player)
        guard videoOutput != nil else {
            fail(with: .unsupportedOS, enhancement: nil)
            return
        }
        startDisplayLink()
        startQualityTimer()
        updateRenderPath(force: true)
        guard !isDetached else {
            return
        }
        setState("active")
        notifyReady()
    }

    private func isProtectedContent(player: AVPlayer) -> Bool {
        if #available(iOS 15.0, *) {
            return player.currentItem?.asset.hasProtectedContent == true
        }
        return false
    }

    private func attachVideoOutput(to player: AVPlayer) {
        guard #available(iOS 17.2, *) else {
            return
        }
        let specification = AVVideoOutputSpecification(tagCollections: [])
        let output = AVPlayerVideoOutput(specification: specification)
        player.videoOutput = output
        videoOutput = output
    }

    private func detachVideoOutput() {
        guard #available(iOS 17.2, *) else {
            return
        }
        player?.videoOutput = nil
        videoOutput = nil
    }

    // MARK: - Display link

    private func startDisplayLink() {
        let link = CADisplayLink(target: self, selector: #selector(displayLinkTick(_:)))
        if #available(iOS 15.0, *) {
            let maxFPS = Float(UIScreen.main.maximumFramesPerSecond)
            link.preferredFrameRateRange = CAFrameRateRange(minimum: 10, maximum: maxFPS, preferred: maxFPS)
        }
        link.add(to: .main, forMode: .common)
        displayLink = link
    }

    private func stopDisplayLink() {
        displayLink?.invalidate()
        displayLink = nil
    }

    @objc private func displayLinkTick(_ link: CADisplayLink) {
        guard isAttached, !isDetached, let player else {
            return
        }
        let targetHostTime = Self.hostTime(for: link.targetTimestamp)
        let targetMediaTime = Self.mediaTime(forHostTime: targetHostTime, player: player)
        self.targetMediaTime = targetMediaTime
        presentPendingMetalFrameIfNeeded(at: targetMediaTime)

        guard player.rate != 0 else {
            return
        }

        if #available(iOS 26.0, *) {
            guard let output = videoOutput as? AVPlayerVideoOutput else {
                return
            }
            displayLinkTickCount += 1
            processingQueue.async { [weak self] in
                guard let self, !self.isDetached else {
                    return
                }
                if #available(iOS 26.0, *) {
                    guard let sample = output.sample(forHostTime: targetHostTime) else {
                        return
                    }
                    guard let pixelBuffer = Self.pixelBuffer(from: sample.taggedBuffers) else {
                        return
                    }
                    self.handlePulledFrame(
                        PulledFrame(pixelBuffer: pixelBuffer, presentationTime: sample.presentationTime)
                    )
                }
            }
        }
    }

    private static func hostTime(for targetTimestamp: CFTimeInterval) -> CMTime {
        // TODO: 真机验证 CMClockGetHostTimeClock 与 CADisplayLink targetTimestamp 的换算。
        let now = CMClockGetTime(CMClockGetHostTimeClock())
        let delta = CMTime(seconds: targetTimestamp - CACurrentMediaTime(), preferredTimescale: 1_000_000_000)
        return CMTimeAdd(now, delta)
    }

    private static func mediaTime(forHostTime hostTime: CMTime, player: AVPlayer) -> CMTime {
        if let timebase = player.currentItem?.timebase {
            // TODO: 真机验证 CMTimebaseGetTimeWithHostTime 在 iOS 26 的可用性。
            return CMTimebaseGetTimeWithHostTime(timebase, hostTime)
        }
        let now = CMClockGetTime(CMClockGetHostTimeClock())
        let delta = CMTimeSubtract(hostTime, now)
        let current = player.currentTime()
        let rate = max(player.rate, 0)
        return CMTimeAdd(current, CMTimeMultiplyByFloat64(delta, multiplier: Float64(rate)))
    }

    @available(iOS 26.0, *)
    private static func pixelBuffer(from taggedBuffers: [CMTaggedDynamicBuffer]) -> CVPixelBuffer? {
        for taggedBuffer in taggedBuffers {
            // TODO: 真机验证 CMTaggedDynamicBuffer.content 的 case 与 withUnsafe* 方法签名。
            switch taggedBuffer.content {
            case .pixelBuffer(let pixelBuffer):
                return pixelBuffer.withUnsafeBuffer { $0 }
            case .pixelSampleBuffer(let sampleBuffer):
                return sampleBuffer.withUnsafeSampleBuffer { CMSampleBufferGetImageBuffer($0) }
            case .dataSampleBuffer:
                break
            @unknown default:
                break
            }
        }
        return nil
    }

    // MARK: - Frame processing

    private func handlePulledFrame(_ frame: PulledFrame) {
        guard !isDetached, renderPath != .passthrough else {
            return
        }
        updateSourceFormatIfNeeded(frame)
        guard sourceWidth > 0, sourceHeight > 0 else {
            return
        }
        if isProcessingFrame {
            pendingPulledFrame = frame
            return
        }
        isProcessingFrame = true

        let effective = effectiveOptions()
        if effective.frameInterpolation == .on, sourceFrameRate > 0 {
            if let previous = previousPulledFrame,
               CMTimeCompare(previous.presentationTime, frame.presentationTime) != 0 {
                processInterpolation(previous: previous, current: frame)
            }
            previousPulledFrame = frame
        } else {
            if let last = lastProcessedSourcePTS,
               CMTimeCompare(last, frame.presentationTime) == 0 {
                return
            }
            processDirect(frame)
            lastProcessedSourcePTS = frame.presentationTime
        }
    }

    private func updateSourceFormatIfNeeded(_ frame: PulledFrame) {
        let width = CVPixelBufferGetWidth(frame.pixelBuffer)
        let height = CVPixelBufferGetHeight(frame.pixelBuffer)
        let format = CVPixelBufferGetPixelFormatType(frame.pixelBuffer)
        let isHDR = Self.isHDRPixelFormat(format) || isHDRAsset()
        let frameRate = currentSourceFrameRate()

        guard width != sourceWidth || height != sourceHeight || format != sourcePixelFormat
                || frameRate != sourceFrameRate || isHDR != sourceIsHDR else {
            return
        }

        sourceWidth = width
        sourceHeight = height
        sourcePixelFormat = format
        sourceFrameRate = frameRate
        sourceIsHDR = isHDR
        pipelinesConfigured = false
        resetFrameState()
        updateRenderPath(force: true)
    }

    private func currentSourceFrameRate() -> Double {
        guard let tracks = player?.currentItem?.tracks else {
            return 0
        }
        for track in tracks {
            guard let assetTrack = track.assetTrack, assetTrack.mediaType == .video else {
                continue
            }
            let rate = assetTrack.nominalFrameRate
            if rate > 0 {
                return Double(rate)
            }
        }
        return 0
    }

    private func isHDRAsset() -> Bool {
        guard #available(iOS 13.0, *) else {
            return false
        }
        return player?.currentItem?.tracks.contains { track in
            track.assetTrack?.hasMediaCharacteristic(.containsHDRVideo) == true
        } ?? false
    }

    private static func isHDRPixelFormat(_ format: OSType) -> Bool {
        switch format {
        case kCVPixelFormatType_420YpCbCr10BiPlanarVideoRange,
             kCVPixelFormatType_420YpCbCr10BiPlanarFullRange,
             kCVPixelFormatType_420YpCbCr10BiPlanarP010:
            return true
        default:
            return false
        }
    }

    private func processDirect(_ frame: PulledFrame) {
        let base = ProcessedVideoFrame(pixelBuffer: frame.pixelBuffer, presentationTime: frame.presentationTime)
        applySuperResolutionIfNeeded(to: base) { [weak self] processed in
            self?.present(processed)
            self?.finishProcessing()
        }
    }

    private func processInterpolation(previous: PulledFrame, current: PulledFrame) {
        let effective = effectiveOptions()
        let targetRate = effectiveTargetFPS(sourceRate: sourceFrameRate)
        guard targetRate > sourceFrameRate + 0.5 else {
            processDirect(current)
            return
        }

        let phases = interpolationPhases(sourceRate: sourceFrameRate, targetRate: targetRate)
        guard !phases.isEmpty else {
            processDirect(current)
            return
        }

        do {
            let usesSpatial = try configureFrameInterpolationPipelineIfNeeded(phases: phases, effective: effective)
            usesCombinedSpatialInterpolation = usesSpatial
            guard let pipeline = frameInterpolationPipeline else {
                finishProcessing()
                return
            }

            let previousSeconds = CMTimeGetSeconds(previous.presentationTime)
            let currentSeconds = CMTimeGetSeconds(current.presentationTime)
            let interval = currentSeconds - previousSeconds
            let destinationTimes = phases.map { phase -> CMTime in
                CMTime(seconds: previousSeconds + interval * Double(phase), preferredTimescale: 600)
            }

            pipeline.process(
                previous: previous.pixelBuffer,
                current: current.pixelBuffer,
                previousPTS: previous.presentationTime,
                currentPTS: current.presentationTime,
                interpolationPhases: phases,
                destinationPresentationTimes: destinationTimes
            ) { [weak self] result in
                guard let self else {
                    return
                }
                self.processingQueue.async {
                    switch result {
                    case .success(let interpolatedFrames):
                        self.emitInterpolatedSequence(
                            previous: previous,
                            current: current,
                            interpolated: interpolatedFrames
                        )
                    case .failure(let error):
                        self.fail(with: .frameProcessingFailed(error.localizedDescription), enhancement: "frameInterpolation")
                    }
                }
            }
        } catch {
            fail(with: .pipelineCreationFailed(error.localizedDescription), enhancement: "frameInterpolation")
        }
    }

    private func emitInterpolatedSequence(
        previous: PulledFrame,
        current: PulledFrame,
        interpolated: [FrameRateConversionOutputFrame]
    ) {
        var frames: [ProcessedVideoFrame] = []

        if let last = lastEmittedPTS, CMTimeCompare(previous.presentationTime, last) <= 0 {
            // Already emitted.
        } else {
            frames.append(ProcessedVideoFrame(pixelBuffer: previous.pixelBuffer, presentationTime: previous.presentationTime))
        }

        frames.append(contentsOf: interpolated.map {
            ProcessedVideoFrame(pixelBuffer: $0.pixelBuffer, presentationTime: $0.presentationTime)
        })

        if let last = lastEmittedPTS, CMTimeCompare(current.presentationTime, last) <= 0 {
            // Already emitted.
        } else {
            frames.append(ProcessedVideoFrame(pixelBuffer: current.pixelBuffer, presentationTime: current.presentationTime))
        }

        lastEmittedPTS = current.presentationTime
        emitFramesSequentially(frames)
    }

    private func emitFramesSequentially(_ frames: [ProcessedVideoFrame]) {
        var iterator = frames.makeIterator()

        func next() {
            guard let frame = iterator.next() else {
                finishProcessing()
                return
            }
            applySuperResolutionIfNeeded(to: frame) { [weak self] processed in
                self?.present(processed)
                next()
            }
        }

        next()
    }

    private func finishProcessing() {
        isProcessingFrame = false
        if let pending = pendingPulledFrame {
            pendingPulledFrame = nil
            handlePulledFrame(pending)
        }
    }

    private func applySuperResolutionIfNeeded(
        to frame: ProcessedVideoFrame,
        completion: @escaping (ProcessedVideoFrame) -> Void
    ) {
        let effective = effectiveOptions()
        guard effective.superResolution == .on, !usesCombinedSpatialInterpolation else {
            completion(frame)
            return
        }

        do {
            if superResolutionPipeline == nil {
                superResolutionPipeline = try makeSuperResolutionPipeline()
            }
            guard let pipeline = superResolutionPipeline else {
                completion(frame)
                return
            }
            pipeline.process(current: frame.pixelBuffer, presentationTime: frame.presentationTime) { [weak self] result in
                guard let self else {
                    completion(frame)
                    return
                }
                self.processingQueue.async {
                    switch result {
                    case .success(let outputs):
                        completion(outputs.first ?? frame)
                    case .failure(let error):
                        self.fail(with: .frameProcessingFailed(error.localizedDescription), enhancement: "superResolution")
                        completion(frame)
                    }
                }
            }
        } catch {
            fail(with: .pipelineCreationFailed(error.localizedDescription), enhancement: "superResolution")
            completion(frame)
        }
    }

    private func makeSuperResolutionPipeline() throws -> FrameRateConversionPipeline {
        guard #available(iOS 26.0, *) else {
            throw PiliEnhanceError.unsupportedOS
        }
        let targetScale = Self.targetScaleForSuperResolution(sourceWidth: sourceWidth, sourceHeight: sourceHeight)
        let factors = VTLowLatencySuperResolutionScalerConfiguration.supportedScaleFactors(
            frameWidth: sourceWidth,
            frameHeight: sourceHeight
        )
        let candidates = factors.filter { $0 >= 1.001 && $0 <= targetScale + 0.01 }
        guard let scale = candidates.max() ?? factors.filter({ $0 >= 1.001 }).min() else {
            throw PiliEnhanceError.unsupportedChip
        }
        return try FrameRateConversionPipeline(
            mode: .superResolution(scaleFactor: scale),
            sourceWidth: sourceWidth,
            sourceHeight: sourceHeight,
            sourcePixelFormat: sourcePixelFormat
        )
    }

    private func configureFrameInterpolationPipelineIfNeeded(
        phases: [Float],
        effective: EnhanceOptions
    ) throws -> Bool {
        if frameInterpolationPipeline != nil, pipelinesConfigured {
            return usesCombinedSpatialInterpolation
        }

        let isTwoX = phases.count == 1 && abs(phases[0] - 0.5) < 0.001
        guard #available(iOS 26.0, *) else {
            throw PiliEnhanceError.unsupportedOS
        }

        if isTwoX, effective.superResolution == .on, VTLowLatencyFrameInterpolationConfiguration.isSupported,
           Self.canUseSpatialCombined(sourceWidth: sourceWidth, sourceHeight: sourceHeight) {
            frameInterpolationPipeline = try FrameRateConversionPipeline(
                mode: .lowLatencyInterpolation(phases: phases, spatialScaleFactor: 2),
                sourceWidth: sourceWidth,
                sourceHeight: sourceHeight,
                sourcePixelFormat: sourcePixelFormat
            )
            superResolutionPipeline = nil
            pipelinesConfigured = true
            usesCombinedSpatialInterpolation = true
            return true
        }

        if isTwoX, VTLowLatencyFrameInterpolationConfiguration.isSupported {
            frameInterpolationPipeline = try FrameRateConversionPipeline(
                mode: .lowLatencyInterpolation(phases: phases, spatialScaleFactor: nil),
                sourceWidth: sourceWidth,
                sourceHeight: sourceHeight,
                sourcePixelFormat: sourcePixelFormat
            )
        } else {
            frameInterpolationPipeline = try FrameRateConversionPipeline(
                mode: .frameRateConversion(phases: phases),
                sourceWidth: sourceWidth,
                sourceHeight: sourceHeight,
                sourcePixelFormat: sourcePixelFormat
            )
        }
        pipelinesConfigured = true
        usesCombinedSpatialInterpolation = false
        return false
    }

    @available(iOS 26.0, *)
    private static func canUseSpatialCombined(sourceWidth: Int, sourceHeight: Int) -> Bool {
        // TODO: 真机验证 maximumDimension/maximumPixelCount 是否属于
        // VTLowLatencyFrameInterpolationConfiguration；Apple 文档页面未完整列出。
        let maximumDimension = VTLowLatencyFrameInterpolationConfiguration.maximumDimension(forSpatialScaleFactor: 2)
        let maximumPixelCount = VTLowLatencyFrameInterpolationConfiguration.maximumPixelCount(forSpatialScaleFactor: 2)
        return max(sourceWidth, sourceHeight) <= maximumDimension
            && sourceWidth * sourceHeight <= maximumPixelCount
    }

    private static func targetScaleForSuperResolution(sourceWidth: Int, sourceHeight: Int) -> Float {
        let targetSize = UIScreen.main.nativeBounds.size
        let scaleX = targetSize.width / CGFloat(max(sourceWidth, 1))
        let scaleY = targetSize.height / CGFloat(max(sourceHeight, 1))
        return Float(min(scaleX, scaleY))
    }

    private func interpolationPhases(sourceRate: Double, targetRate: Double) -> [Float] {
        guard sourceRate > 0, targetRate > sourceRate else {
            return []
        }
        let count = max(1, Int(ceil(targetRate / sourceRate)) - 1)
        return (1...count).map { Float($0) / Float(count + 1) }
    }

    // MARK: - Presentation

    private func present(_ frame: ProcessedVideoFrame) {
        processedFrameCount += 1
        DispatchQueue.main.async { [weak self] in
            guard let self, let delegate = self.delegate, !self.isDetached else {
                return
            }
            if self.renderPath == .metal {
                let tolerance = 1.0 / Double(max(self.targetFPS, 30))
                let frameSeconds = CMTimeGetSeconds(frame.presentationTime)
                let targetSeconds = CMTimeGetSeconds(self.targetMediaTime)
                if frameSeconds <= targetSeconds + tolerance {
                    delegate.enhancementEngine(self, didProduceFrame: frame, targetMediaTime: self.targetMediaTime)
                    self.pendingMetalFrame = nil
                } else {
                    self.pendingMetalFrame = frame
                }
            } else {
                delegate.enhancementEngine(self, didProduceFrame: frame, targetMediaTime: self.targetMediaTime)
            }
        }
    }

    private func presentPendingMetalFrameIfNeeded(at targetMediaTime: CMTime) {
        guard renderPath == .metal, let pending = pendingMetalFrame, let delegate else {
            return
        }
        let tolerance = 1.0 / Double(max(targetFPS, 30))
        if CMTimeGetSeconds(pending.presentationTime) <= CMTimeGetSeconds(targetMediaTime) + tolerance {
            delegate.enhancementEngine(self, didProduceFrame: pending, targetMediaTime: targetMediaTime)
            pendingMetalFrame = nil
        }
    }

    // MARK: - Quality degradation

    private func startQualityTimer() {
        UIDevice.current.isBatteryMonitoringEnabled = true
        let timer = Timer(timeInterval: 2.0, repeats: true) { [weak self] _ in
            self?.sampleQuality()
        }
        RunLoop.main.add(timer, forMode: .common)
        qualityTimer = timer
    }

    private func stopQualityTimer() {
        qualityTimer?.invalidate()
        qualityTimer = nil
    }

    private func sampleQuality() {
        guard isAttached, !isDetached else {
            return
        }

        let thermal = ProcessInfo.processInfo.thermalState
        let lowPower = ProcessInfo.processInfo.isLowPowerModeEnabled
        let battery = UIDevice.current.batteryLevel >= 0 ? UIDevice.current.batteryLevel : 1
        lastThermalState = thermal
        lowPowerMode = lowPower
        batteryLevel = battery

        var next = qualityLevel
        switch thermal {
        case .critical:
            next = .minimal
        case .serious:
            next = degraded(next, minimum: .low)
        case .fair:
            next = degraded(next, minimum: .medium)
        case .nominal:
            next = degraded(next, minimum: .high)
        @unknown default:
            break
        }
        if lowPower || battery < 0.2 {
            next = degraded(next, minimum: .medium)
        }
        if dropRateInLastWindow() > 0.05 {
            next = .minimal
        }

        if next.rawValue > qualityLevel.rawValue, thermal == .nominal {
            nominalObservationCount += 1
            if nominalObservationCount >= 15 {
                next = QualityLevel(rawValue: qualityLevel.rawValue + 1) ?? .high
                nominalObservationCount = 0
            } else {
                next = qualityLevel
            }
        } else {
            nominalObservationCount = 0
        }

        guard next != qualityLevel else {
            return
        }
        qualityLevel = next
        pipelinesConfigured = false
        resetFrameState()
        updateRenderPath(force: true)
    }

    private func degraded(_ level: QualityLevel, minimum: QualityLevel) -> QualityLevel {
        level.rawValue < minimum.rawValue ? minimum : level
    }

    private func dropRateInLastWindow() -> Double {
        let now = CACurrentMediaTime()
        let elapsed = now - dropSampleStart
        guard elapsed >= 1 else {
            return 0
        }
        let expected = max(displayLinkTickCount, 1)
        let presented = processedFrameCount + (pendingMetalFrame != nil ? 1 : 0)
        let rate = Double(max(0, expected - presented)) / Double(expected)
        displayLinkTickCount = 0
        processedFrameCount = 0
        dropSampleStart = now
        return rate
    }

    private func effectiveOptions() -> EnhanceOptions {
        var result = options
        switch qualityLevel {
        case .minimal:
            result.superResolution = .off
            result.frameInterpolation = .off
            result.sdrToHdr = .off
        case .low:
            result.superResolution = .off
            result.frameInterpolation = .off
        case .medium:
            result.superResolution = .off
        case .high, .ultra:
            break
        }
        return result
    }

    private func effectiveTargetFPS(sourceRate: Double) -> Double {
        switch qualityLevel {
        case .minimal, .low:
            return sourceRate
        case .medium:
            return min(Double(targetFPS), sourceRate * 2.0)
        case .high, .ultra:
            return Double(targetFPS)
        }
    }

    // MARK: - State helpers

    private func updateRenderPath(force: Bool = false) {
        if Thread.isMainThread {
            updateRenderPathOnMain(force: force)
        } else {
            DispatchQueue.main.async { [weak self] in
                self?.updateRenderPathOnMain(force: force)
            }
        }
    }

    private func updateRenderPathOnMain(force: Bool) {
        guard !isDetached else {
            return
        }
        let effective = effectiveOptions()
        let newPath: RenderPath
        if sourceIsHDR && effective.sdrToHdr == .on {
            newPath = .passthrough
        } else if !effective.isAnyEnabled {
            newPath = .passthrough
        } else if effective.sdrToHdr == .on {
            newPath = .metal
        } else {
            newPath = .sampleBuffer
        }

        guard force || newPath != renderPath else {
            return
        }
        renderPath = newPath
        let supported = delegate?.enhancementEngine(self, didSetRenderPath: newPath) ?? false
        if !supported {
            if newPath == .metal {
                fail(with: .metalUnavailable, enhancement: "sdrToHdr")
            } else {
                fail(with: .frameProcessingFailed("Enhanced render path is unavailable"), enhancement: nil)
            }
            return
        }
        if newPath == .passthrough {
            resetFrameState()
        }
    }

    private func setState(_ state: String) {
        currentState = state
        let record = EnhancementStateRecord(
            playerId: playerId,
            state: state,
            activeEnhancements: ActiveEnhancementsRecord(options: effectiveOptions())
        )
        delegate?.enhancementEngine(self, didChangeState: record)
    }

    private func notifyReady() {
        guard !hasSentReady else {
            return
        }
        hasSentReady = true
        delegate?.enhancementEngineDidBecomeReady(self)
    }

    private func fail(with error: PiliEnhanceError, enhancement: String?) {
        if Thread.isMainThread {
            failOnMain(with: error, enhancement: enhancement)
        } else {
            DispatchQueue.main.async { [weak self] in
                self?.failOnMain(with: error, enhancement: enhancement)
            }
        }
    }

    private func failOnMain(with error: PiliEnhanceError, enhancement: String?) {
        guard let delegate, !isDetached else {
            return
        }
        isDetached = true
        isAttached = false
        stopDisplayLink()
        stopQualityTimer()
        detachVideoOutput()
        resetFrameState()
        pendingMetalFrame = nil
        renderPath = .passthrough
        _ = delegate.enhancementEngine(self, didSetRenderPath: .passthrough)
        setState("fallingBack")
        delegate.enhancementEngine(
            self,
            didFailWithError: EnhancementErrorRecord(
                playerId: playerId,
                code: error.code,
                message: error.localizedDescription,
                enhancement: enhancement
            )
        )
        player = nil
    }

    private func resetFrameState() {
        previousPulledFrame = nil
        lastProcessedSourcePTS = nil
        lastEmittedPTS = nil
        pendingPulledFrame = nil
        isProcessingFrame = false
        pendingMetalFrame = nil
        pipelinesConfigured = false
        usesCombinedSpatialInterpolation = false
        frameInterpolationPipeline?.end()
        frameInterpolationPipeline = nil
        superResolutionPipeline?.end()
        superResolutionPipeline = nil
    }

    // MARK: - Device info

    private static func hardwareModel() -> String {
        var size = 0
        sysctlbyname("hw.machine", nil, &size, nil, 0)
        guard size > 0 else {
            return "unknown"
        }
        var machine = [CChar](repeating: 0, count: size)
        sysctlbyname("hw.machine", &machine, &size, nil, 0)
        return String(cString: machine)
    }

    private static func mainWindowSafeAreaInsets() -> UIEdgeInsets {
        let keyWindow = UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .flatMap { $0.windows }
            .first { $0.isKeyWindow }
        return keyWindow?.safeAreaInsets ?? .zero
    }
}
