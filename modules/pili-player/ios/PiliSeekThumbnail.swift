// Copyright 2026 PiliPlus. All rights reserved.

import Foundation
import ImageIO
import PiliNativeCore
import UIKit

enum PiliSeekThumbnailError: LocalizedError {
    case invalidURL
    case downloadFailed
    case decodeFailed
    case cropFailed

    var errorDescription: String? {
        switch self {
        case .invalidURL:
            return "Invalid seek thumbnail URL"
        case .downloadFailed:
            return "Could not download the seek thumbnail sprite"
        case .decodeFailed:
            return "Could not decode the seek thumbnail sprite"
        case .cropFailed:
            return "Could not crop the seek thumbnail frame"
        }
    }
}

private final class PiliSeekSpriteEntry {
    let image: CGImage
    let sourceWidth: Int
    let sourceHeight: Int

    init(image: CGImage, sourceWidth: Int, sourceHeight: Int) {
        self.image = image
        self.sourceWidth = sourceWidth
        self.sourceHeight = sourceHeight
    }
}

enum PiliSeekThumbnail {
    private static let spriteFileCache = NSCache<NSString, NSString>()
    private static let spriteImageCache = NSCache<NSString, PiliSeekSpriteEntry>()
    private static let frameImageCache = NSCache<NSString, CGImage>()

    static func crop(
        uri: String,
        col: Int,
        row: Int,
        frameW: Double,
        frameH: Double,
        targetWidth: Double,
        targetHeight: Double
    ) async throws -> PiliSeekThumbnailImage {
        guard let sourceURL = URL(string: uri) else {
            throw PiliSeekThumbnailError.invalidURL
        }
        let cacheKey = "\(uri)|\(col)|\(row)|\(Int(targetWidth.rounded()))|\(Int(targetHeight.rounded()))" as NSString
        if let cached = frameImageCache.object(forKey: cacheKey) {
            return PiliSeekThumbnailImage(UIImage(cgImage: cached))
        }
        pruneStaleFiles()

        let fileURL: URL
        if sourceURL.isFileURL {
            fileURL = sourceURL
        } else {
            fileURL = try await downloadSprite(url: sourceURL)
        }

        let frameWidth = max(1, Int(frameW.rounded()))
        let frameHeight = max(1, Int(frameH.rounded()))
        let x = max(0, col * frameWidth)

        let spriteKey = fileURL.absoluteString as NSString
        let sprite: PiliSeekSpriteEntry
        if let cached = spriteImageCache.object(forKey: spriteKey) {
            sprite = cached
        } else {
            guard let source = CGImageSourceCreateWithURL(fileURL as CFURL, nil) else {
                throw PiliSeekThumbnailError.decodeFailed
            }
            var sourceWidth = 0
            var sourceHeight = 0
            if let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any] {
                if let width = properties[kCGImagePropertyPixelWidth] as? Int, width > 0 {
                    sourceWidth = width
                }
                if let height = properties[kCGImagePropertyPixelHeight] as? Int, height > 0 {
                    sourceHeight = height
                }
            }
            let longestSide = max(sourceWidth, sourceHeight)
            let maxPixelSize = longestSide > 0
                ? min(longestSide, 4096)
                : max(frameWidth * 4, frameHeight * 4)
            let thumbnailOptions: [CFString: Any] = [
                kCGImageSourceCreateThumbnailFromImageAlways: true,
                kCGImageSourceCreateThumbnailWithTransform: true,
                kCGImageSourceThumbnailMaxPixelSize: maxPixelSize,
            ]
            guard let decoded = CGImageSourceCreateThumbnailAtIndex(
                source,
                0,
                thumbnailOptions as CFDictionary
            ) else {
                throw PiliSeekThumbnailError.decodeFailed
            }
            let entry = PiliSeekSpriteEntry(
                image: decoded,
                sourceWidth: sourceWidth > 0 ? sourceWidth : decoded.width,
                sourceHeight: sourceHeight > 0 ? sourceHeight : decoded.height
            )
            spriteImageCache.setObject(
                entry,
                forKey: spriteKey,
                cost: decoded.width * decoded.height * 4
            )
            sprite = entry
        }

        let thumbnail = sprite.image
        let thumbnailWidth = thumbnail.width
        let thumbnailHeight = thumbnail.height
        let y = max(0, sprite.sourceHeight - (row + 1) * frameHeight)
        let scaleX = CGFloat(thumbnailWidth) / CGFloat(max(sprite.sourceWidth, 1))
        let scaleY = CGFloat(thumbnailHeight) / CGFloat(max(sprite.sourceHeight, 1))
        let cropRect = CGRect(
            x: CGFloat(x) * scaleX,
            y: CGFloat(thumbnailHeight) - CGFloat(y + frameHeight) * scaleY,
            width: CGFloat(frameWidth) * scaleX,
            height: CGFloat(frameHeight) * scaleY
        ).intersection(CGRect(x: 0, y: 0, width: thumbnailWidth, height: thumbnailHeight))
        guard !cropRect.isNull, !cropRect.isEmpty,
              let cropped = thumbnail.cropping(to: cropRect) else {
            throw PiliSeekThumbnailError.cropFailed
        }

        let outputWidth = max(1, Int(targetWidth.rounded()))
        let outputHeight = max(1, Int(targetHeight.rounded()))
        guard let context = CGContext(
            data: nil,
            width: outputWidth,
            height: outputHeight,
            bitsPerComponent: 8,
            bytesPerRow: 0,
            space: CGColorSpaceCreateDeviceRGB(),
            bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
        ) else {
            throw PiliSeekThumbnailError.cropFailed
        }
        context.interpolationQuality = .high
        context.draw(
            cropped,
            in: CGRect(x: 0, y: 0, width: outputWidth, height: outputHeight)
        )
        guard let output = context.makeImage() else {
            throw PiliSeekThumbnailError.cropFailed
        }

        frameImageCache.setObject(
            output,
            forKey: cacheKey,
            cost: output.width * output.height * 4
        )
        return PiliSeekThumbnailImage(UIImage(cgImage: output))
    }

    private static func downloadSprite(url: URL) async throws -> URL {
        let cacheKey = url.absoluteString as NSString
        if let cachedPath = spriteFileCache.object(forKey: cacheKey) as String?,
           FileManager.default.fileExists(atPath: cachedPath) {
            return URL(fileURLWithPath: cachedPath)
        }

        var request = URLRequest(url: url)
        request.setValue("https://www.bilibili.com", forHTTPHeaderField: "Referer")
        request.setValue(
            "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15",
            forHTTPHeaderField: "User-Agent"
        )
        let (fileURL, response) = try await PiliNetwork.session(
            for: PiliNetwork.mergedOptions([:])
        ).download(for: request)
        guard let httpResponse = response as? HTTPURLResponse,
              (200..<400).contains(httpResponse.statusCode) else {
            throw PiliSeekThumbnailError.downloadFailed
        }

        let outputURL = FileManager.default.temporaryDirectory
            .appendingPathComponent("pili-seek-sprite-\(UUID().uuidString).img")
        if FileManager.default.fileExists(atPath: outputURL.path) {
            try FileManager.default.removeItem(at: outputURL)
        }
        try FileManager.default.moveItem(at: fileURL, to: outputURL)
        spriteFileCache.setObject(outputURL.path as NSString, forKey: cacheKey)
        return outputURL
    }

    /// Sprite 文件仍落在临时目录；旧文件在下一次裁剪时清理，帧图只保留内存 CGImage。
    private static func pruneStaleFiles() {
        let fm = FileManager.default
        guard let urls = try? fm.contentsOfDirectory(
            at: .temporaryDirectory,
            includingPropertiesForKeys: [.contentModificationDateKey],
            options: [.skipsHiddenFiles]
        ) else {
            return
        }
        let cutoff = Date().addingTimeInterval(-86_400)
        for url in urls {
            guard url.lastPathComponent.hasPrefix("pili-seek-sprite-") else {
                continue
            }
            guard let date = (try? url.resourceValues(
                forKeys: [.contentModificationDateKey]
            ))?.contentModificationDate, date < cutoff else {
                continue
            }
            try? fm.removeItem(at: url)
        }
    }
}
