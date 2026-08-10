// Copyright 2026 PiliPlus. All rights reserved.

import AVFoundation
import CoreMedia
import CoreVideo
import ExpoModulesCore
import Metal
import QuartzCore
import UIKit

enum EnhancedContentFit: String {
    case contain
    case cover
    case fill

    var videoGravity: AVLayerVideoGravity {
        switch self {
        case .contain:
            return .resizeAspect
        case .cover:
            return .resizeAspectFill
        case .fill:
            return .resize
        }
    }
}

public final class EnhancedVideoView: ExpoView, PiliEnhancementEngineDelegate {
    private let engine = PiliEnhancementEngine()
    private let passthroughLayerView = PlayerLayerContainerView()
    private let displayLayerView = SampleBufferLayerContainerView()
    private let metalLayerView = MetalLayerContainerView()
    private var hdrRenderer: SdrToHdrRenderer?

    private weak var boundPlayer: AVPlayer?
    private var boundPlayerId: Int?
    private var currentOptions = EnhanceOptions()
    private var safeAreaInsets = UIEdgeInsets.zero
    private var contentFit: EnhancedContentFit = .contain
    private var hasFiredFirstFrame = false
    private var lastPresentedPTS: CMTime?

    let onReady = EventDispatcher()
    let onFirstFrameRender = EventDispatcher()
    let onStateChange = EventDispatcher()
    let onError = EventDispatcher()

    public required init(appContext: AppContext? = nil) {
        super.init(appContext: appContext)
        clipsToBounds = true
        backgroundColor = .black
        engine.delegate = self
        configureSubviews()
    }

    deinit {
        engine.detach()
    }

    func bindPlayer(_ player: AVPlayer?, playerId: Int?) {
        guard let player, let playerId else {
            boundPlayer = nil
            boundPlayerId = nil
            engine.detach()
            return
        }
        if boundPlayer !== player || boundPlayerId != playerId {
            hasFiredFirstFrame = false
            lastPresentedPTS = nil
        }
        boundPlayer = player
        boundPlayerId = playerId
        reconfigureEngine()
    }

    func apply(_ optionsRecord: EnhanceOptionsRecord?) {
        currentOptions = optionsRecord?.native ?? EnhanceOptions()
        reconfigureEngine()
    }

    func setContentFit(_ rawValue: String?) {
        contentFit = EnhancedContentFit(rawValue: rawValue ?? "contain") ?? .contain
        passthroughLayerView.playerLayer?.videoGravity = contentFit.videoGravity
        displayLayerView.displayLayer?.videoGravity = contentFit.videoGravity
        setNeedsLayout()
        reconfigureEngine()
    }

    func applySafeAreaInsets(_ insetsRecord: SafeAreaInsetsRecord?) {
        safeAreaInsets = insetsRecord?.uiEdgeInsets ?? .zero
        setNeedsLayout()
    }

    public override func layoutSubviews() {
        super.layoutSubviews()
        let frame = bounds
        passthroughLayerView.frame = frame
        displayLayerView.frame = frame
        metalLayerView.frame = frame
        if let metalLayer = metalLayerView.metalLayer {
            hdrRenderer?.configure(layer: metalLayer)
        }
    }

    private func reconfigureEngine() {
        guard let boundPlayer, let boundPlayerId else {
            return
        }
        engine.attach(
            player: boundPlayer,
            playerId: boundPlayerId,
            options: currentOptions,
            contentFit: contentFit,
            safeAreaInsets: safeAreaInsets
        )
    }

    private func configureSubviews() {
        addSubview(passthroughLayerView)
        addSubview(displayLayerView)
        addSubview(metalLayerView)

        passthroughLayerView.isHidden = true
        displayLayerView.isHidden = true
        metalLayerView.isHidden = true
        displayLayerView.displayLayer?.videoGravity = contentFit.videoGravity
    }

    private func fireFirstFrameIfNeeded() {
        guard !hasFiredFirstFrame else {
            return
        }
        hasFiredFirstFrame = true
        onFirstFrameRender()
    }

    private func enqueueSampleBufferFrame(_ frame: ProcessedVideoFrame) {
        guard let displayLayer = displayLayerView.displayLayer else {
            return
        }
        if let sampleBuffer = Self.makeSampleBuffer(pixelBuffer: frame.pixelBuffer, presentationTime: frame.presentationTime) {
            displayLayer.enqueue(sampleBuffer)
        }
    }

    private func renderMetalFrame(_ frame: ProcessedVideoFrame) {
        guard let hdrRenderer, let metalLayer = metalLayerView.metalLayer else {
            return
        }
        if let lastPresentedPTS, CMTimeCompare(frame.presentationTime, lastPresentedPTS) <= 0 {
            return
        }
        let targetRect = normalizedVideoRect(for: frame.pixelBuffer)
        hdrRenderer.render(
            pixelBuffer: frame.pixelBuffer,
            presentationTime: frame.presentationTime,
            into: metalLayer,
            targetRect: targetRect
        )
        lastPresentedPTS = frame.presentationTime
    }

    private func normalizedVideoRect(for pixelBuffer: CVPixelBuffer) -> CGRect {
        let layerBounds = metalLayerView.bounds
        guard layerBounds.width > 0, layerBounds.height > 0 else {
            return CGRect(x: 0, y: 0, width: 1, height: 1)
        }
        let container = layerBounds.inset(by: safeAreaInsets)
        guard container.width > 0, container.height > 0 else {
            return CGRect(x: 0, y: 0, width: 1, height: 1)
        }

        let sourceWidth = CGFloat(CVPixelBufferGetWidth(pixelBuffer))
        let sourceHeight = CGFloat(CVPixelBufferGetHeight(pixelBuffer))
        guard sourceWidth > 0, sourceHeight > 0 else {
            return CGRect(x: 0, y: 0, width: 1, height: 1)
        }

        let scale: CGFloat
        switch contentFit {
        case .fill:
            return CGRect(x: 0, y: 0, width: 1, height: 1)
        case .cover:
            scale = max(container.width / sourceWidth, container.height / sourceHeight)
        case .contain:
            scale = min(container.width / sourceWidth, container.height / sourceHeight)
        }

        let drawSize = CGSize(width: sourceWidth * scale, height: sourceHeight * scale)
        let drawOrigin = CGPoint(
            x: container.midX - drawSize.width / 2,
            y: container.midY - drawSize.height / 2
        )
        return CGRect(
            x: drawOrigin.x / layerBounds.width,
            y: drawOrigin.y / layerBounds.height,
            width: drawSize.width / layerBounds.width,
            height: drawSize.height / layerBounds.height
        )
    }

    private static func makeSampleBuffer(pixelBuffer: CVPixelBuffer, presentationTime: CMTime) -> CMSampleBuffer? {
        var formatDescription: CMVideoFormatDescription?
        let formatStatus = CMVideoFormatDescriptionCreateForImageBuffer(
            allocator: kCFAllocatorDefault,
            imageBuffer: pixelBuffer,
            formatDescriptionOut: &formatDescription
        )
        guard formatStatus == noErr, let formatDescription else {
            return nil
        }

        var sampleBuffer: CMSampleBuffer?
        let timing = CMSampleTimingInfo(
            duration: .invalid,
            presentationTimeStamp: presentationTime,
            decodeTimeStamp: .invalid
        )
        let status = CMSampleBufferCreateReadyWithImageBuffer(
            allocator: kCFAllocatorDefault,
            imageBuffer: pixelBuffer,
            formatDescription: formatDescription,
            sampleTiming: timing,
            sampleBufferOut: &sampleBuffer
        )
        return status == noErr ? sampleBuffer : nil
    }

    // MARK: - PiliEnhancementEngineDelegate

    func enhancementEngine(_ engine: PiliEnhancementEngine, didChangeState state: EnhancementStateRecord) {
        onStateChange(state)
    }

    func enhancementEngine(_ engine: PiliEnhancementEngine, didFailWithError error: EnhancementErrorRecord) {
        onError(error)
    }

    func enhancementEngineDidBecomeReady(_ engine: PiliEnhancementEngine) {
        onReady()
    }

    func enhancementEngine(_ engine: PiliEnhancementEngine, didSetRenderPath path: PiliEnhancementEngine.RenderPath) -> Bool {
        switch path {
        case .passthrough:
            passthroughLayerView.isHidden = false
            displayLayerView.isHidden = true
            metalLayerView.isHidden = true
            guard let player = engine.player, let playerLayer = passthroughLayerView.playerLayer else {
                return false
            }
            playerLayer.player = player
            playerLayer.videoGravity = contentFit.videoGravity
            return true

        case .sampleBuffer:
            passthroughLayerView.isHidden = true
            displayLayerView.isHidden = false
            metalLayerView.isHidden = true
            if let displayLayer = displayLayerView.displayLayer {
                displayLayer.flush()
            }
            return true

        case .metal:
            do {
                if hdrRenderer == nil {
                    hdrRenderer = try SdrToHdrRenderer()
                }
                guard let metalLayer = metalLayerView.metalLayer else {
                    return false
                }
                hdrRenderer?.configure(layer: metalLayer)
                passthroughLayerView.isHidden = true
                displayLayerView.isHidden = true
                metalLayerView.isHidden = false
                return true
            } catch {
                return false
            }
        }
    }

    func enhancementEngine(_ engine: PiliEnhancementEngine, didProduceFrame frame: ProcessedVideoFrame, targetMediaTime: CMTime) {
        switch engine.renderPath {
        case .passthrough:
            break
        case .sampleBuffer:
            enqueueSampleBufferFrame(frame)
        case .metal:
            renderMetalFrame(frame)
        }
        fireFirstFrameIfNeeded()
    }
}

private final class PlayerLayerContainerView: UIView {
    override class var layerClass: AnyClass {
        AVPlayerLayer.self
    }

    var playerLayer: AVPlayerLayer? {
        layer as? AVPlayerLayer
    }
}

private final class SampleBufferLayerContainerView: UIView {
    override class var layerClass: AnyClass {
        AVSampleBufferDisplayLayer.self
    }

    var displayLayer: AVSampleBufferDisplayLayer? {
        layer as? AVSampleBufferDisplayLayer
    }
}

private final class MetalLayerContainerView: UIView {
    override class var layerClass: AnyClass {
        CAMetalLayer.self
    }

    var metalLayer: CAMetalLayer? {
        layer as? CAMetalLayer
    }
}
