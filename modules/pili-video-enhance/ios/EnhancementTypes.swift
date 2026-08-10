// Copyright 2026 PiliPlus. All rights reserved.

import CoreMedia
import CoreVideo
import ExpoModulesCore
import Foundation
import UIKit

/// Mirrors `EnhancementMode` in `src/index.tsx`.
enum EnhancementMode: String {
    case off = "off"
    case on = "on"
}

/// Internal options model parsed from the JS `EnhanceOptions` record.
struct EnhanceOptions: Equatable {
    var superResolution: EnhancementMode = .off
    var frameInterpolation: EnhancementMode = .off
    var sdrToHdr: EnhancementMode = .off

    var isAnyEnabled: Bool {
        superResolution == .on || frameInterpolation == .on || sdrToHdr == .on
    }
}

/// A frame that has passed through the enhancement pipeline.
struct ProcessedVideoFrame {
    let pixelBuffer: CVPixelBuffer
    let presentationTime: CMTime
}

/// Output of a `FrameRateConversionPipeline` request. Kept top-level so the engine can
/// reference it without depending on the iOS 26 `VideoToolbox` types in its stored properties.
struct FrameRateConversionOutputFrame {
    let pixelBuffer: CVPixelBuffer
    let presentationTime: CMTime
}

/// Dynamic quality level used for thermal/battery/frame-budget degradation.
enum QualityLevel: Int, Comparable {
    case minimal = 0
    case low = 1
    case medium = 2
    case high = 3
    case ultra = 4

    static func < (lhs: QualityLevel, rhs: QualityLevel) -> Bool {
        lhs.rawValue < rhs.rawValue
    }
}

/// Native error codes; `code` is intentionally aligned with `FeatureReason`.
enum PiliEnhanceError: LocalizedError {
    case unsupportedOS
    case unsupportedChip
    case unsupportedDisplay
    case unsupportedCodec
    case drmUnsupported
    case enhancementsDisabled
    case metalUnavailable
    case pipelineCreationFailed(String)
    case frameProcessingFailed(String)

    var code: String {
        switch self {
        case .unsupportedOS:
            return "unsupported-os"
        case .unsupportedChip:
            return "unsupported-chip"
        case .unsupportedDisplay:
            return "unsupported-display"
        case .unsupportedCodec:
            return "unsupported-codec"
        case .drmUnsupported:
            return "drm-unsupported"
        case .enhancementsDisabled:
            return "enhancements-disabled"
        case .metalUnavailable:
            return "metal-unavailable"
        case .pipelineCreationFailed, .frameProcessingFailed:
            return "pipeline-error"
        }
    }

    var errorDescription: String? {
        switch self {
        case .unsupportedOS:
            return "Video enhancements require iOS 26 or later"
        case .unsupportedChip:
            return "This device does not support the requested video enhancement"
        case .unsupportedDisplay:
            return "The display does not support EDR for SDR to HDR"
        case .unsupportedCodec:
            return "The current video format is not supported by the enhancement pipeline"
        case .drmUnsupported:
            return "Protected content is not supported by the enhancement pipeline"
        case .enhancementsDisabled:
            return "No enhancement is enabled"
        case .metalUnavailable:
            return "Metal is unavailable for SDR to HDR rendering"
        case .pipelineCreationFailed(let message):
            return "Enhancement pipeline failed: \(message)"
        case .frameProcessingFailed(let message):
            return "Frame processing failed: \(message)"
        }
    }
}

struct FeatureSupportRecord: Record {
    @Field var available: Bool = false
    @Field var reason: String? = nil

    init() {}

    init(available: Bool, reason: String?) {
        self.available = available
        self.reason = reason
    }
}

struct SafeAreaInsetsRecord: Record {
    @Field var top: Double = 0
    @Field var right: Double = 0
    @Field var bottom: Double = 0
    @Field var left: Double = 0

    init() {}

    init(uiEdgeInsets: UIEdgeInsets) {
        top = Double(uiEdgeInsets.top)
        right = Double(uiEdgeInsets.right)
        bottom = Double(uiEdgeInsets.bottom)
        left = Double(uiEdgeInsets.left)
    }

    var uiEdgeInsets: UIEdgeInsets {
        UIEdgeInsets(
            top: CGFloat(top),
            left: CGFloat(left),
            bottom: CGFloat(bottom),
            right: CGFloat(right)
        )
    }
}

struct EnhanceOptionsRecord: Record {
    @Field var superResolution: String? = nil
    @Field var frameInterpolation: String? = nil
    @Field var sdrToHdr: String? = nil

    init() {}

    var native: EnhanceOptions {
        EnhanceOptions(
            superResolution: EnhancementMode(rawValue: superResolution ?? "off") ?? .off,
            frameInterpolation: EnhancementMode(rawValue: frameInterpolation ?? "off") ?? .off,
            sdrToHdr: EnhancementMode(rawValue: sdrToHdr ?? "off") ?? .off
        )
    }
}

struct ActiveEnhancementsRecord: Record {
    @Field var superResolution: String = "off"
    @Field var frameInterpolation: String = "off"
    @Field var sdrToHdr: String = "off"

    init() {}

    init(options: EnhanceOptions) {
        superResolution = options.superResolution.rawValue
        frameInterpolation = options.frameInterpolation.rawValue
        sdrToHdr = options.sdrToHdr.rawValue
    }
}

struct EnhancementCapabilitiesRecord: Record {
    @Field var available: Bool = false
    @Field var platform: String = "ios"
    @Field var osVersion: String = ""
    @Field var chipName: String = ""
    @Field var refreshRateHz: Double = 0
    @Field var hdrCapable: Bool = false
    @Field var safeAreaInsets: SafeAreaInsetsRecord = SafeAreaInsetsRecord()
    @Field var superResolution: FeatureSupportRecord = FeatureSupportRecord()
    @Field var frameInterpolation: FeatureSupportRecord = FeatureSupportRecord()
    @Field var sdrToHdr: FeatureSupportRecord = FeatureSupportRecord()

    init() {
        platform = "ios"
    }

    init(
        available: Bool,
        osVersion: String,
        chipName: String,
        refreshRateHz: Double,
        hdrCapable: Bool,
        safeAreaInsets: SafeAreaInsetsRecord,
        superResolution: FeatureSupportRecord,
        frameInterpolation: FeatureSupportRecord,
        sdrToHdr: FeatureSupportRecord
    ) {
        self.available = available
        self.osVersion = osVersion
        self.chipName = chipName
        self.refreshRateHz = refreshRateHz
        self.hdrCapable = hdrCapable
        self.safeAreaInsets = safeAreaInsets
        self.superResolution = superResolution
        self.frameInterpolation = frameInterpolation
        self.sdrToHdr = sdrToHdr
    }
}

struct EnhancementStateRecord: Record {
    @Field var playerId: Int = 0
    @Field var state: String = "detached"
    @Field var activeEnhancements: ActiveEnhancementsRecord = ActiveEnhancementsRecord()

    init() {}

    init(playerId: Int, state: String, activeEnhancements: ActiveEnhancementsRecord) {
        self.playerId = playerId
        self.state = state
        self.activeEnhancements = activeEnhancements
    }
}

struct EnhancementErrorRecord: Record {
    @Field var playerId: Int = 0
    @Field var code: String = ""
    @Field var message: String = ""
    @Field var enhancement: String? = nil

    init() {}

    init(playerId: Int, code: String, message: String, enhancement: String?) {
        self.playerId = playerId
        self.code = code
        self.message = message
        self.enhancement = enhancement
    }
}
