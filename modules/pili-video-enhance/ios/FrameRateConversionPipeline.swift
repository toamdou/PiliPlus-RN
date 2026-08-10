// Copyright 2026 PiliPlus. All rights reserved.

import CoreMedia
import CoreVideo
import Foundation
import VideoToolbox

/// A single `VTFrameProcessor` session configured for one effect:
/// low-latency super resolution, low-latency interpolation, or full frame rate conversion.
final class FrameRateConversionPipeline {
    enum Mode {
        case superResolution(scaleFactor: Float)
        case frameRateConversion(phases: [Float])
        case lowLatencyInterpolation(phases: [Float], spatialScaleFactor: Int?)
    }

    private var processor: AnyObject?
    private var configuration: Any?
    private var destinationPool: CVPixelBufferPool?
    private let mode: Mode
    private let sourceWidth: Int
    private let sourceHeight: Int
    private let sourcePixelFormat: OSType
    private var didStart = false

    init(mode: Mode, sourceWidth: Int, sourceHeight: Int, sourcePixelFormat: OSType) throws {
        self.mode = mode
        self.sourceWidth = sourceWidth
        self.sourceHeight = sourceHeight
        self.sourcePixelFormat = sourcePixelFormat
        try start()
    }

    deinit {
        end()
    }

    func end() {
        guard didStart else {
            return
        }
        if #available(iOS 26.0, *) {
            (processor as? VTFrameProcessor)?.endSession()
        }
        processor = nil
        configuration = nil
        destinationPool = nil
        didStart = false
    }

    func process(
        current: CVPixelBuffer,
        presentationTime: CMTime,
        completion: @escaping (Result<[FrameRateConversionOutputFrame], Error>) -> Void
    ) {
        guard #available(iOS 26.0, *) else {
            completion(.failure(PiliEnhanceError.unsupportedOS))
            return
        }
        guard case .superResolution = mode else {
            completion(.failure(PiliEnhanceError.frameProcessingFailed("Pipeline is not configured for super resolution")))
            return
        }
        do {
            let destinationFrame = try allocateDestinationFrame(presentationTime: presentationTime)
            guard
                let sourceFrame = VTFrameProcessorFrame(buffer: current, presentationTimeStamp: presentationTime),
                let outputFrame = VTFrameProcessorFrame(buffer: destinationFrame, presentationTimeStamp: presentationTime)
            else {
                throw PiliEnhanceError.frameProcessingFailed("Unable to wrap super resolution frames")
            }
            guard let processor = processor as? VTFrameProcessor else {
                throw PiliEnhanceError.frameProcessingFailed("Frame processor session is not active")
            }
            let parameters = VTLowLatencySuperResolutionScalerParameters(sourceFrame: sourceFrame, destinationFrame: outputFrame)
            processor.process(parameters: parameters) { _, error in
                if let error {
                    completion(.failure(error))
                    return
                }
                // The destination frame object is populated in place; reading it here avoids relying
                // on the exact property shape of the returned parameters object.
                completion(.success([
                    FrameRateConversionOutputFrame(pixelBuffer: outputFrame.buffer, presentationTime: outputFrame.presentationTimeStamp)
                ]))
            }
        } catch {
            completion(.failure(error))
        }
    }

    func process(
        previous: CVPixelBuffer,
        current: CVPixelBuffer,
        previousPTS: CMTime,
        currentPTS: CMTime,
        interpolationPhases: [Float],
        destinationPresentationTimes: [CMTime],
        completion: @escaping (Result<[FrameRateConversionOutputFrame], Error>) -> Void
    ) {
        guard #available(iOS 26.0, *) else {
            completion(.failure(PiliEnhanceError.unsupportedOS))
            return
        }
        do {
            let allocatedFrames = try allocateDestinationFrames(presentationTimes: destinationPresentationTimes)
            let destinationFrames = try allocatedFrames.map { frame -> VTFrameProcessorFrame in
                guard let frame = frame as? VTFrameProcessorFrame else {
                    throw PiliEnhanceError.frameProcessingFailed("Destination frame has unexpected type")
                }
                return frame
            }
            guard
                let previousFrame = VTFrameProcessorFrame(buffer: previous, presentationTimeStamp: previousPTS),
                let currentFrame = VTFrameProcessorFrame(buffer: current, presentationTimeStamp: currentPTS)
            else {
                throw PiliEnhanceError.frameProcessingFailed("Unable to wrap interpolation frames")
            }

            let parameters: any VTFrameProcessorParameters
            switch mode {
            case .frameRateConversion:
                guard let conversionParameters = VTFrameRateConversionParameters(
                    sourceFrame: previousFrame,
                    nextFrame: currentFrame,
                    opticalFlow: nil,
                    interpolationPhase: interpolationPhases,
                    submissionMode: .sequential,
                    destinationFrames: destinationFrames
                ) else {
                    throw PiliEnhanceError.frameProcessingFailed("Unable to create frame rate conversion parameters")
                }
                parameters = conversionParameters
            case .lowLatencyInterpolation:
                guard let interpolationParameters = VTLowLatencyFrameInterpolationParameters(
                    sourceFrame: currentFrame,
                    previousFrame: previousFrame,
                    interpolationPhase: interpolationPhases,
                    destinationFrames: destinationFrames
                ) else {
                    throw PiliEnhanceError.frameProcessingFailed("Unable to create low latency interpolation parameters")
                }
                parameters = interpolationParameters
            case .superResolution:
                throw PiliEnhanceError.frameProcessingFailed("Pipeline is not configured for interpolation")
            }

            guard let processor = processor as? VTFrameProcessor else {
                throw PiliEnhanceError.frameProcessingFailed("Frame processor session is not active")
            }
            processor.process(parameters: parameters) { _, error in
                if let error {
                    completion(.failure(error))
                    return
                }
                let frames = destinationFrames.map {
                    FrameRateConversionOutputFrame(pixelBuffer: $0.buffer, presentationTime: $0.presentationTimeStamp)
                }
                completion(.success(frames))
            }
        } catch {
            completion(.failure(error))
        }
    }

    private func start() throws {
        guard #available(iOS 26.0, *) else {
            throw PiliEnhanceError.unsupportedOS
        }
        end()

        let configuration: any VTFrameProcessorConfiguration
        switch mode {
        case .superResolution(let scaleFactor):
            guard VTLowLatencySuperResolutionScalerConfiguration.isSupported else {
                throw PiliEnhanceError.unsupportedChip
            }
            let config = VTLowLatencySuperResolutionScalerConfiguration(
                frameWidth: sourceWidth,
                frameHeight: sourceHeight,
                scaleFactor: scaleFactor
            )
            guard config.supportedPixelFormats.contains(sourcePixelFormat) else {
                throw PiliEnhanceError.unsupportedCodec
            }
            destinationPool = try Self.makePool(
                attributes: config.destinationPixelBufferAttributes,
                minimumCount: 3
            )
            configuration = config

        case .frameRateConversion(let phases):
            guard VTFrameRateConversionConfiguration.isSupported else {
                throw PiliEnhanceError.unsupportedChip
            }
            guard let config = VTFrameRateConversionConfiguration(
                frameWidth: sourceWidth,
                frameHeight: sourceHeight,
                usePrecomputedFlow: false,
                qualityPrioritization: .normal,
                revision: .defaultRevision
            ) else {
                throw PiliEnhanceError.pipelineCreationFailed("VTFrameRateConversionConfiguration init failed")
            }
            guard config.supportedPixelFormats.contains(sourcePixelFormat) else {
                throw PiliEnhanceError.unsupportedCodec
            }
            destinationPool = try Self.makePool(
                attributes: config.destinationPixelBufferAttributes,
                minimumCount: max(phases.count + 1, 3)
            )
            configuration = config

        case .lowLatencyInterpolation(let phases, let spatialScaleFactor):
            guard VTLowLatencyFrameInterpolationConfiguration.isSupported else {
                throw PiliEnhanceError.unsupportedChip
            }
            let config: VTLowLatencyFrameInterpolationConfiguration
            if let spatialScaleFactor {
                guard let spatialConfig = VTLowLatencyFrameInterpolationConfiguration(
                    frameWidth: sourceWidth,
                    frameHeight: sourceHeight,
                    spatialScaleFactor: spatialScaleFactor
                ) else {
                    throw PiliEnhanceError.pipelineCreationFailed("Low latency spatial interpolation init failed")
                }
                config = spatialConfig
            } else {
                guard let temporalConfig = VTLowLatencyFrameInterpolationConfiguration(
                    frameWidth: sourceWidth,
                    frameHeight: sourceHeight,
                    numberOfInterpolatedFrames: phases.count
                ) else {
                    throw PiliEnhanceError.pipelineCreationFailed("Low latency interpolation init failed")
                }
                config = temporalConfig
            }
            guard config.supportedPixelFormats.contains(sourcePixelFormat) else {
                throw PiliEnhanceError.unsupportedCodec
            }
            destinationPool = try Self.makePool(
                attributes: config.destinationPixelBufferAttributes,
                minimumCount: max(phases.count + 1, 3)
            )
            configuration = config
        }

        let processor = VTFrameProcessor()
        try processor.startSession(configuration: configuration)
        self.processor = processor
        self.configuration = configuration as Any
        didStart = true
    }

    private func allocateDestinationFrame(presentationTime: CMTime) throws -> CVPixelBuffer {
        guard let pool = destinationPool else {
            throw PiliEnhanceError.frameProcessingFailed("Destination pool is not ready")
        }
        var pixelBuffer: CVPixelBuffer?
        let status = CVPixelBufferPoolCreatePixelBuffer(nil, pool, &pixelBuffer)
        guard status == kCVReturnSuccess, let pixelBuffer else {
            throw PiliEnhanceError.frameProcessingFailed("Destination buffer allocation failed: \(status)")
        }
        // VTFrameProcessorFrame requires IOSurface-backed buffers.
        // TODO: 真机验证 CVPixelBufferGetIOSurface 的 Swift 返回类型。
        if CVPixelBufferGetIOSurface(pixelBuffer) == nil {
            throw PiliEnhanceError.frameProcessingFailed("Destination buffer is not IOSurface-backed")
        }
        return pixelBuffer
    }

    private func allocateDestinationFrames(presentationTimes: [CMTime]) throws -> [AnyObject] {
        guard #available(iOS 26.0, *) else {
            throw PiliEnhanceError.unsupportedOS
        }
        var frames: [AnyObject] = []
        frames.reserveCapacity(presentationTimes.count)
        for time in presentationTimes {
            let pixelBuffer = try allocateDestinationFrame(presentationTime: time)
            guard let frame = VTFrameProcessorFrame(buffer: pixelBuffer, presentationTimeStamp: time) else {
                throw PiliEnhanceError.frameProcessingFailed("Unable to wrap destination frame")
            }
            frames.append(frame)
        }
        return frames
    }

    private static func makePool(attributes: [String: any Sendable], minimumCount: Int) throws -> CVPixelBufferPool {
        var merged: [String: Any] = Dictionary(uniqueKeysWithValues: attributes.map { ($0.key, $0.value as Any) })
        merged[kCVPixelBufferPoolMinimumBufferCountKey as String] = minimumCount
        if merged[kCVPixelBufferIOSurfacePropertiesKey as String] == nil {
            merged[kCVPixelBufferIOSurfacePropertiesKey as String] = [String: Any]()
        }
        var pool: CVPixelBufferPool?
        let status = CVPixelBufferPoolCreate(nil, nil, merged as CFDictionary, &pool)
        guard status == kCVReturnSuccess, let pool else {
            throw PiliEnhanceError.pipelineCreationFailed("CVPixelBufferPoolCreate failed: \(status)")
        }
        return pool
    }
}
