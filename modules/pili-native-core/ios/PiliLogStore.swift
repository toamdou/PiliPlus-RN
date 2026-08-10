// Copyright 2026 PiliPlus. All rights reserved.

import Foundation
import os

final class PiliLogStore {
    static let shared = PiliLogStore()

    private static let maxEntries = 500
    private static let maxFileBytes = 1_048_576
    private static let timestampFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd HH:mm:ss"
        formatter.locale = Locale(identifier: "en_US_POSIX")
        return formatter
    }()

    private let lock = NSLock()
    private var pendingLines: [String] = []
    private var pendingPersist = false
    private let logger = Logger(subsystem: "com.piliplus.app", category: "PiliPlus")

    private init() {}

    private var logURL: URL {
        let documents = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first
            ?? FileManager.default.temporaryDirectory
        return documents
            .appendingPathComponent("Logs", isDirectory: true)
            .appendingPathComponent("piliplus.log")
    }

    func append(level: String, message: String) {
        lock.lock()
        pendingLines.append("[\(Self.timestamp())] \(level.uppercased()): \(message)")
        if pendingLines.count > Self.maxEntries {
            pendingLines.removeFirst(pendingLines.count - Self.maxEntries)
        }
        schedulePersistLocked()
        lock.unlock()

        switch level.lowercased() {
        case "error":
            logger.error("\(message)")
        case "warn":
            logger.warning("\(message)")
        default:
            logger.info("\(message)")
        }
    }

    /// 弱网失败风暴时合并追加写入，最多 1s 落盘一次。
    private func schedulePersistLocked() {
        guard !pendingPersist else {
            return
        }
        pendingPersist = true
        DispatchQueue.global(qos: .utility).asyncAfter(deadline: .now() + 1) { [weak self] in
            self?.persist()
        }
    }

    private func persist() {
        lock.lock()
        guard pendingPersist else {
            lock.unlock()
            return
        }
        pendingPersist = false
        let lines = pendingLines
        pendingLines.removeAll()
        appendLinesToFileLocked(lines)
        lock.unlock()
    }

    private func appendLinesToFileLocked(_ lines: [String]) {
        guard !lines.isEmpty else {
            return
        }
        let fileURL = logURL
        try? FileManager.default.createDirectory(
            at: fileURL.deletingLastPathComponent(),
            withIntermediateDirectories: true
        )
        let fileManager = FileManager.default
        if !fileManager.fileExists(atPath: fileURL.path) {
            fileManager.createFile(atPath: fileURL.path, contents: nil)
        }

        let attributes = try? fileManager.attributesOfItem(atPath: fileURL.path)
        let size = (attributes?[.size] as? NSNumber)?.int64Value ?? 0
        let incomingBytes = lines.reduce(0) { $0 + $1.utf8.count + 1 }
        if size + Int64(incomingBytes) > Self.maxFileBytes {
            let archiveURL = fileURL.appendingPathExtension("1")
            try? fileManager.removeItem(at: archiveURL)
            try? fileManager.moveItem(at: fileURL, to: archiveURL)
            fileManager.createFile(atPath: fileURL.path, contents: nil)
        }

        guard let handle = try? FileHandle(forWritingTo: fileURL) else {
            return
        }
        defer { try? handle.close() }
        handle.seekToEndOfFile()
        for line in lines {
            handle.write(Data((line + "\n").utf8))
        }
    }

    func entries(limit: Int) -> [String] {
        lock.lock()
        let pending = pendingLines
        let fileLines = readTailLocked(limit: Self.maxEntries)
        lock.unlock()
        return Array((fileLines + pending).suffix(max(1, min(limit, Self.maxEntries))))
    }

    private func readTailLocked(limit: Int) -> [String] {
        guard let data = try? Data(contentsOf: logURL) else {
            return []
        }
        guard let text = String(data: data, encoding: .utf8) else {
            return []
        }
        var lines = text.components(separatedBy: "\n")
        if lines.last == "" {
            lines.removeLast()
        }
        return Array(lines.suffix(max(0, limit)))
    }

    func clear() {
        lock.lock()
        pendingLines.removeAll()
        pendingPersist = false
        let fileManager = FileManager.default
        try? fileManager.removeItem(at: logURL)
        try? fileManager.removeItem(at: logURL.appendingPathExtension("1"))
        lock.unlock()
    }

    private static func timestamp() -> String {
        timestampFormatter.string(from: Date())
    }
}
