// Copyright 2026 PiliPlus. All rights reserved.

import CoreGraphics
import CoreMedia
import CoreVideo
import Metal
import QuartzCore
import UIKit

/// Metal compute renderer that converts SDR YCbCr frames to extended linear Display P3
/// and writes them into an EDR-enabled `CAMetalLayer`.
final class SdrToHdrRenderer {
    private struct Uniforms {
        var sourceRect = SIMD4<Float>(0, 0, 1, 1)
        var outputSize = SIMD2<Float>(1, 1)
        var headroom: Float = 2
        var saturationBoost: Float = 1.08
        var matrixType: UInt32 = 1
        var fullRange: UInt32 = 0
        var transferFunction: UInt32 = 0
        var sourceLayout: UInt32 = 0
        var padding = SIMD2<Float>(0, 0)
    }

    private struct SourceInfo {
        let layout: UInt32
        let lumaFormat: MTLPixelFormat
        let chromaFormat: MTLPixelFormat
        let width: Int
        let height: Int
        let chromaWidth: Int
        let chromaHeight: Int
        let matrixType: UInt32
        let fullRange: Bool
        let transferFunction: UInt32
    }

    private final class MetalFrameResources {
        let cvTextures: [CVMetalTexture]
        let textures: [MTLTexture]

        init(cvTextures: [CVMetalTexture], textures: [MTLTexture]) {
            self.cvTextures = cvTextures
            self.textures = textures
        }
    }

    private let device: MTLDevice
    private let commandQueue: MTLCommandQueue
    private let pipelineState: MTLComputePipelineState
    private var textureCache: CVMetalTextureCache?
    private var uniformBuffer: MTLBuffer?
    private var lutTexture: MTLTexture?
    private var cachedHeadroom: Float = 0
    private let lutSize = 33
    private let lutMaxValue: Float = 4.0

    init() throws {
        guard let device = MTLCreateSystemDefaultDevice() else {
            throw PiliEnhanceError.metalUnavailable
        }
        guard let commandQueue = device.makeCommandQueue() else {
            throw PiliEnhanceError.metalUnavailable
        }
        let library = try Self.makeLibrary(device: device)
        guard let function = library.makeFunction(name: "sdrToHdrKernel") else {
            throw PiliEnhanceError.metalUnavailable
        }

        self.device = device
        self.commandQueue = commandQueue
        pipelineState = try device.makeComputePipelineState(function: function)

        var cache: CVMetalTextureCache?
        let cacheStatus = CVMetalTextureCacheCreate(kCFAllocatorDefault, nil, device, nil, &cache)
        guard cacheStatus == kCVReturnSuccess, let cache else {
            throw PiliEnhanceError.metalUnavailable
        }
        textureCache = cache

        guard let buffer = device.makeBuffer(length: MemoryLayout<Uniforms>.size, options: .storageModeShared) else {
            throw PiliEnhanceError.metalUnavailable
        }
        uniformBuffer = buffer
        try makeLUTTexture(headroom: 2.0)
    }

    func configure(layer: CAMetalLayer) {
        layer.device = device
        layer.pixelFormat = .rgba16Float
        layer.wantsExtendedDynamicRangeContent = true
        layer.colorspace = CGColorSpace(name: CGColorSpace.extendedLinearDisplayP3)
        layer.framebufferOnly = false
        layer.maximumDrawableCount = 3
        let scale = max(layer.contentsScale, UIScreen.main.scale)
        layer.drawableSize = CGSize(width: layer.bounds.width * scale, height: layer.bounds.height * scale)
    }

    @discardableResult
    func render(
        pixelBuffer: CVPixelBuffer,
        presentationTime: CMTime,
        into layer: CAMetalLayer,
        targetRect: CGRect
    ) -> Bool {
        guard
            let drawable = layer.nextDrawable(),
            let commandBuffer = commandQueue.makeCommandBuffer(),
            let encoder = commandBuffer.makeComputeCommandEncoder(),
            let uniformBuffer
        else {
            return false
        }

        updateHeadroomIfNeeded(layer: layer)
        guard let lutTexture else {
            return false
        }
        let sourceInfo = Self.sourceInfo(for: pixelBuffer)
        guard
            let lumaPair = makeTexturePair(
                pixelBuffer: pixelBuffer,
                plane: 0,
                pixelFormat: sourceInfo.lumaFormat,
                width: sourceInfo.width,
                height: sourceInfo.height
            )
        else {
            return false
        }

        var uniforms = Uniforms()
        uniforms.sourceRect = SIMD4<Float>(
            Float(targetRect.origin.x),
            Float(targetRect.origin.y),
            Float(targetRect.size.width),
            Float(targetRect.size.height)
        )
        uniforms.outputSize = SIMD2<Float>(Float(drawable.texture.width), Float(drawable.texture.height))
        uniforms.headroom = max(Self.currentHeadroom(for: layer), 1.25)
        uniforms.saturationBoost = 1.08
        uniforms.matrixType = sourceInfo.matrixType
        uniforms.fullRange = sourceInfo.fullRange ? 1 : 0
        uniforms.transferFunction = sourceInfo.transferFunction
        uniforms.sourceLayout = sourceInfo.layout
        uniformBuffer.contents().copyMemory(from: &uniforms, byteCount: MemoryLayout<Uniforms>.size)

        encoder.setComputePipelineState(pipelineState)
        encoder.setTexture(lumaPair.texture, index: 0)

        var chromaPair: (cvTexture: CVMetalTexture, texture: MTLTexture)?
        if sourceInfo.layout == 0 {
            guard let pair = makeTexturePair(
                pixelBuffer: pixelBuffer,
                plane: 1,
                pixelFormat: sourceInfo.chromaFormat,
                width: sourceInfo.chromaWidth,
                height: sourceInfo.chromaHeight
            ) else {
                return false
            }
            chromaPair = pair
            encoder.setTexture(pair.texture, index: 1)
        }
        encoder.setTexture(drawable.texture, index: 2)
        encoder.setTexture(lutTexture, index: 3)
        encoder.setBuffer(uniformBuffer, offset: 0, index: 0)

        let width = pipelineState.threadExecutionWidth
        let threadsPerThreadgroup = MTLSize(width: width, height: 1, depth: 1)
        let threadgroups = MTLSize(
            width: (drawable.texture.width + width - 1) / width,
            height: drawable.texture.height,
            depth: 1
        )
        encoder.dispatchThreadgroups(threadgroups, threadsPerThreadgroup: threadsPerThreadgroup)
        encoder.endEncoding()

        var cvTextures: [CVMetalTexture] = [lumaPair.cvTexture]
        var textures: [MTLTexture] = [lumaPair.texture]
        if let chromaPair {
            cvTextures.append(chromaPair.cvTexture)
            textures.append(chromaPair.texture)
        }
        let resources = MetalFrameResources(cvTextures: cvTextures, textures: textures)
        commandBuffer.addCompletedHandler { _ in
            _ = resources
        }
        commandBuffer.present(drawable)
        commandBuffer.commit()
        return true
    }

    private func makeTexturePair(
        pixelBuffer: CVPixelBuffer,
        plane: Int,
        pixelFormat: MTLPixelFormat,
        width: Int,
        height: Int
    ) -> (cvTexture: CVMetalTexture, texture: MTLTexture)? {
        guard let textureCache else {
            return nil
        }
        var cvTexture: CVMetalTexture?
        let status = CVMetalTextureCacheCreateTextureFromImage(
            kCFAllocatorDefault,
            textureCache,
            pixelBuffer,
            nil,
            pixelFormat,
            width,
            height,
            plane,
            &cvTexture
        )
        guard status == kCVReturnSuccess, let cvTexture, let texture = CVMetalTextureGetTexture(cvTexture) else {
            return nil
        }
        return (cvTexture, texture)
    }

    private func updateHeadroomIfNeeded(layer: CAMetalLayer) {
        let headroom = max(Self.currentHeadroom(for: layer), 1.25)
        if lutTexture == nil || abs(headroom - cachedHeadroom) > 0.15 {
            try? makeLUTTexture(headroom: headroom)
            cachedHeadroom = headroom
        }
    }

    private func makeLUTTexture(headroom: Float) throws {
        let size = lutSize
        let peak = max(headroom, 1.25)
        var data = [Float16](repeating: 0, count: size * size * size * 4)

        for blue in 0..<size {
            for green in 0..<size {
                for red in 0..<size {
                    let index = (blue * size * size + green * size + red) * 4
                    let redValue = Float(red) / Float(size - 1) * lutMaxValue
                    let greenValue = Float(green) / Float(size - 1) * lutMaxValue
                    let blueValue = Float(blue) / Float(size - 1) * lutMaxValue
                    data[index] = Float16(Self.expand(redValue, peak: peak))
                    data[index + 1] = Float16(Self.expand(greenValue, peak: peak))
                    data[index + 2] = Float16(Self.expand(blueValue, peak: peak))
                    data[index + 3] = 1
                }
            }
        }

        let descriptor = MTLTextureDescriptor.texture3DDescriptor(
            pixelFormat: .rgba16Float,
            width: size,
            height: size,
            depth: size,
            mipmapped: false
        )
        descriptor.usage = .shaderRead
        descriptor.storageMode = .shared
        guard let texture = device.makeTexture(descriptor: descriptor) else {
            throw PiliEnhanceError.metalUnavailable
        }

        let bytesPerRow = size * 4 * MemoryLayout<Float16>.size
        let bytesPerImage = bytesPerRow * size
        data.withUnsafeBytes { rawBuffer in
            if let baseAddress = rawBuffer.baseAddress {
                texture.replace(
                    region: MTLRegionMake3D(0, 0, 0, size, size, size),
                    mipmapLevel: 0,
                    slice: 0,
                    withBytes: baseAddress,
                    bytesPerRow: bytesPerRow,
                    bytesPerImage: bytesPerImage
                )
            }
        }
        lutTexture = texture
    }

    private static func expand(_ value: Float, peak: Float) -> Float {
        let diffuseWhite: Float = 1.0
        if value <= diffuseWhite {
            return value
        }
        let normalized = min((value - diffuseWhite) / (4.0 - diffuseWhite), 1.0)
        let knee = 1.0 - exp(-normalized * 4.0)
        return diffuseWhite + (peak - diffuseWhite) * knee
    }

    private static func currentHeadroom(for layer: CAMetalLayer) -> Float {
        guard #available(iOS 16.0, *) else {
            return 1.0
        }
        let screen = UIScreen.main
        return Float(max(screen.currentEDRHeadroom, 1.0))
    }

    private static func sourceInfo(for pixelBuffer: CVPixelBuffer) -> SourceInfo {
        let format = CVPixelBufferGetPixelFormatType(pixelBuffer)
        let width = CVPixelBufferGetWidth(pixelBuffer)
        let height = CVPixelBufferGetHeight(pixelBuffer)

        switch format {
        case kCVPixelFormatType_420YpCbCr8BiPlanarVideoRange,
             kCVPixelFormatType_420YpCbCr8BiPlanarFullRange:
            return SourceInfo(
                layout: 0,
                lumaFormat: .r8Unorm,
                chromaFormat: .rg8Unorm,
                width: width,
                height: height,
                chromaWidth: width / 2,
                chromaHeight: height / 2,
                matrixType: matrixType(for: pixelBuffer),
                fullRange: format == kCVPixelFormatType_420YpCbCr8BiPlanarFullRange,
                transferFunction: transferFunction(for: pixelBuffer)
            )
        case kCVPixelFormatType_420YpCbCr10BiPlanarVideoRange,
             kCVPixelFormatType_420YpCbCr10BiPlanarFullRange:
            return SourceInfo(
                layout: 0,
                lumaFormat: .r16Unorm,
                chromaFormat: .rg16Unorm,
                width: width,
                height: height,
                chromaWidth: width / 2,
                chromaHeight: height / 2,
                matrixType: matrixType(for: pixelBuffer),
                fullRange: format == kCVPixelFormatType_420YpCbCr10BiPlanarFullRange,
                transferFunction: transferFunction(for: pixelBuffer)
            )
        case kCVPixelFormatType_32BGRA:
            return SourceInfo(
                layout: 1,
                lumaFormat: .bgra8Unorm,
                chromaFormat: .invalid,
                width: width,
                height: height,
                chromaWidth: 1,
                chromaHeight: 1,
                matrixType: 1,
                fullRange: true,
                transferFunction: 0
            )
        default:
            return SourceInfo(
                layout: 0,
                lumaFormat: .r8Unorm,
                chromaFormat: .rg8Unorm,
                width: width,
                height: height,
                chromaWidth: width / 2,
                chromaHeight: height / 2,
                matrixType: 1,
                fullRange: false,
                transferFunction: 0
            )
        }
    }

    private static func matrixType(for pixelBuffer: CVPixelBuffer) -> UInt32 {
        let matrix = CVBufferGetAttachment(pixelBuffer, kCVImageBufferYCbCrMatrixKey, nil) as? String
        switch matrix {
        case kCVImageBufferYCbCrMatrix_ITU_R_601_4:
            return 0
        case kCVImageBufferYCbCrMatrix_ITU_R_709_2:
            return 1
        case kCVImageBufferYCbCrMatrix_ITU_R_2020:
            return 2
        default:
            return 1
        }
    }

    private static func transferFunction(for pixelBuffer: CVPixelBuffer) -> UInt32 {
        let transfer = CVBufferGetAttachment(pixelBuffer, kCVImageBufferTransferFunctionKey, nil) as? String
        switch transfer {
        case kCVImageBufferTransferFunction_ITU_R_2100_HLG:
            return 1
        case kCVImageBufferTransferFunction_SMPTE_ST_2084_PQ:
            return 2
        default:
            return 0
        }
    }

    private static func makeLibrary(device: MTLDevice) throws -> MTLLibrary {
        let candidates: [URL?] = [
            Bundle.main.url(forResource: "PiliVideoEnhance", withExtension: "bundle")?
                .appendingPathComponent("default.metallib"),
            Bundle(for: Self.self).url(forResource: "default", withExtension: "metallib"),
            Bundle.main.url(forResource: "default", withExtension: "metallib")
        ]
        for url in candidates.compactMap({ $0 }) {
            if let library = try? device.makeLibrary(url: url) {
                return library
            }
        }
        throw PiliEnhanceError.metalUnavailable
    }
}
