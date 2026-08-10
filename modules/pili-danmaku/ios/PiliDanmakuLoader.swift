// Copyright 2026 PiliPlus. All rights reserved.

import Foundation

final class PiliDanmakuLoader {
    static let shared = PiliDanmakuLoader()

    private let lock = NSLock()
    private var activeTasks: [String: [URLSessionDataTask]] = [:]
    private var cancelledRequestIds: Set<String> = []
    private var rawCache: [Int: [String: Any]] = [:]
    private var preparedCache: [String: [String: Any]] = [:]

    private let segmentSeconds = 360.0
    private let maxSegments = 30
    private let concurrentSegments = 4
    private let cacheLimit = 8

    private init() {}

    func loadAndPrepare(
        cid: Int,
        options: [String: Any],
        requestId: String
    ) async throws -> [String: Any] {
        if isCancelled(requestId) {
            throw CancellationError()
        }

        let signature = "\(cid)|\(Self.canonicalJSON(options))"
        if let cached = preparedResult(for: signature) {
            return cached
        }

        let rawItems: [String: Any]
        if let cached = rawItems(for: cid) {
            rawItems = cached
        } else {
            let duration = (options["duration"] as? Double) ?? 0
            let count = min(max(1, Int(ceil(duration / segmentSeconds))), maxSegments)
            let maxResident = max(0, options["maxResident"] as? Int ?? 6000)
            let skipCookies = (options["skipCookies"] as? Bool) ?? false

            var results: [Data?] = Array(repeating: nil, count: count)
            for batchStart in stride(from: 0, to: count, by: concurrentSegments) {
                let batchCount = min(concurrentSegments, count - batchStart)
                await withTaskGroup(of: (Int, Data?).self) { group in
                    for index in batchStart..<(batchStart + batchCount) {
                        group.addTask { [weak self] in
                            guard let self else {
                                return (index, nil)
                            }
                            let data = try? await self.fetchSegment(
                                cid: cid,
                                index: index + 1,
                                requestId: requestId,
                                skipCookies: skipCookies
                            )
                            return (index, data)
                        }
                    }
                    for await (index, data) in group {
                        results[index] = data
                    }
                }
                if isCancelled(requestId) {
                    throw CancellationError()
                }
            }

            var items: [[String: Any]] = []
            var seenIDs = Set<String>()
            for data in results {
                guard let data, !data.isEmpty else {
                    continue
                }
                for item in PiliDanmakuParser.parseDmSegReply(data) {
                    let id = item["id"] as? String ?? ""
                    if !id.isEmpty {
                        if seenIDs.contains(id) {
                            continue
                        }
                        seenIDs.insert(id)
                    }
                    items.append(item)
                }
            }

            if items.isEmpty,
               let xml = try? await fetchXml(
                   cid: cid,
                   requestId: requestId,
                   skipCookies: skipCookies
               ) {
                items = PiliDanmakuParser.parseXmlDanmaku(xml)
            }
            if isCancelled(requestId) {
                throw CancellationError()
            }

            items.sort {
                ($0["time"] as? Double ?? 0) < ($1["time"] as? Double ?? 0)
            }
            let resident = maxResident > 0 ? Array(items.suffix(maxResident)) : items
            let cachedRaw: [String: Any] = ["items": resident]
            lock.lock()
            rawCache[cid] = cachedRaw
            trimCacheIfNeeded()
            lock.unlock()
            rawItems = cachedRaw
        }

        let items = rawItems["items"] as? [[String: Any]] ?? []
        let prepared = PiliDanmakuPreparer.prepare(items: items, options: options)
        lock.lock()
        preparedCache[signature] = prepared
        trimPreparedCacheIfNeeded()
        lock.unlock()
        return prepared
    }

    func cancel(requestId: String) {
        lock.lock()
        cancelledRequestIds.insert(requestId)
        let tasks = activeTasks.removeValue(forKey: requestId) ?? []
        lock.unlock()
        for task in tasks {
            task.cancel()
        }
    }

    private func isCancelled(_ requestId: String) -> Bool {
        lock.lock()
        defer { lock.unlock() }
        return cancelledRequestIds.contains(requestId)
    }

    private func rawItems(for cid: Int) -> [String: Any]? {
        lock.lock()
        defer { lock.unlock() }
        return rawCache[cid]
    }

    private func preparedResult(for signature: String) -> [String: Any]? {
        lock.lock()
        defer { lock.unlock() }
        return preparedCache[signature]
    }

    private func fetchSegment(
        cid: Int,
        index: Int,
        requestId: String,
        skipCookies: Bool
    ) async throws -> Data {
        let urlString = "https://api.bilibili.com/x/v2/dm/web/seg.so?type=1&oid=\(cid)&segment_index=\(index)"
        guard let url = URL(string: urlString) else {
            throw URLError(.badURL)
        }
        return try await performDataTask(url: url, requestId: requestId, skipCookies: skipCookies)
    }

    private func fetchXml(
        cid: Int,
        requestId: String,
        skipCookies: Bool
    ) async throws -> String {
        let urlString = "https://api.bilibili.com/x/v1/dm/list.so?oid=\(cid)"
        guard let url = URL(string: urlString) else {
            throw URLError(.badURL)
        }
        let data = try await performDataTask(url: url, requestId: requestId, skipCookies: skipCookies)
        return String(data: data, encoding: .utf8) ?? ""
    }

    private func performDataTask(
        url: URL,
        requestId: String,
        skipCookies: Bool
    ) async throws -> Data {
        try await withCheckedThrowingContinuation { continuation in
            var request = URLRequest(url: url)
            request.timeoutInterval = 10
            request.httpShouldHandleCookies = !skipCookies
            request.setValue("https://www.bilibili.com", forHTTPHeaderField: "Referer")
            request.setValue(
                "Mozilla/5.0 BiliDroid/8.43.0 (bbcallen@gmail.com) os/android model/android mobi_app/android build/8430300 channel/master innerVer/8430300 osVer/15 network/2",
                forHTTPHeaderField: "User-Agent"
            )

            let task = URLSession.shared.dataTask(with: request) { [weak self] data, _, error in
                self?.unregister(task, for: requestId)
                if let error {
                    if (error as? URLError)?.code == .cancelled {
                        continuation.resume(throwing: CancellationError())
                    } else {
                        continuation.resume(throwing: error)
                    }
                    return
                }
                guard let data else {
                    continuation.resume(throwing: URLError(.unknown))
                    return
                }
                continuation.resume(returning: data)
            }
            register(task, for: requestId)
            task.resume()
        }
    }

    private func register(_ task: URLSessionDataTask, for requestId: String) {
        lock.lock()
        var tasks = activeTasks[requestId] ?? []
        tasks.append(task)
        activeTasks[requestId] = tasks
        lock.unlock()
    }

    private func unregister(_ task: URLSessionDataTask, for requestId: String) {
        lock.lock()
        if var tasks = activeTasks[requestId] {
            tasks.removeAll { $0 === task }
            if tasks.isEmpty {
                activeTasks.removeValue(forKey: requestId)
            } else {
                activeTasks[requestId] = tasks
            }
        }
        lock.unlock()
    }

    private func trimCacheIfNeeded() {
        while rawCache.count > cacheLimit {
            if let key = rawCache.keys.first {
                rawCache.removeValue(forKey: key)
            } else {
                break
            }
        }
    }

    private func trimPreparedCacheIfNeeded() {
        while preparedCache.count > cacheLimit * 2 {
            if let key = preparedCache.keys.first {
                preparedCache.removeValue(forKey: key)
            } else {
                break
            }
        }
    }

    private static func canonicalJSON(_ value: Any) -> String {
        if let dict = value as? [String: Any] {
            let keys = dict.keys.sorted()
            let parts = keys.map { "\($0):\(canonicalJSON(dict[$0] ?? NSNull()))" }
            return "{\(parts.joined(separator: ","))}"
        }
        if let array = value as? [Any] {
            return "[\(array.map { canonicalJSON($0) }.joined(separator: ","))]"
        }
        if value is NSNull {
            return "null"
        }
        if let bool = value as? Bool {
            return bool ? "true" : "false"
        }
        if let number = value as? NSNumber {
            return number.stringValue
        }
        return "\(value)"
    }
}
