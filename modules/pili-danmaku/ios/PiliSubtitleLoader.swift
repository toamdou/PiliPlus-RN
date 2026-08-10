// Copyright 2026 PiliPlus. All rights reserved.

import Foundation

final class PiliSubtitleLoader {
    static let shared = PiliSubtitleLoader()

    private let lock = NSLock()
    private var cache: [String: [SubtitleItemRecord]] = [:]

    private init() {}

    func load(url: String) async throws -> [SubtitleItemRecord] {
        let normalized = url.trimmingCharacters(in: .whitespacesAndNewlines)
        if let cached = cachedResult(for: normalized) {
            return cached
        }
        guard let sourceURL = URL(string: normalized) else {
            throw URLError(.badURL)
        }

        var request = URLRequest(url: sourceURL)
        request.timeoutInterval = 10
        request.setValue("https://www.bilibili.com", forHTTPHeaderField: "Referer")
        request.setValue(
            "Mozilla/5.0 BiliDroid/8.43.0 (bbcallen@gmail.com) os/android model/android mobi_app/android build/8430300 channel/master innerVer/8430300 osVer/15 network/2",
            forHTTPHeaderField: "User-Agent"
        )
        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse, (200..<400).contains(http.statusCode) else {
            throw URLError(.badServerResponse)
        }
        guard let json = try JSONSerialization.jsonObject(with: data) as? [String: Any],
              let body = json["body"] as? [[String: Any]] else {
            return []
        }

        let items = body.compactMap { item -> SubtitleItemRecord? in
            guard let from = item["from"] as? Double,
                  let to = item["to"] as? Double,
                  let content = item["content"] as? String else {
                return nil
            }
            var record = SubtitleItemRecord()
            record.from = from
            record.to = to
            record.content = content
            return record
        }

        lock.lock()
        cache[normalized] = items
        while cache.count > 16 {
            if let key = cache.keys.first {
                cache.removeValue(forKey: key)
            } else {
                break
            }
        }
        lock.unlock()
        return items
    }

    private func cachedResult(for url: String) -> [SubtitleItemRecord]? {
        lock.lock()
        defer { lock.unlock() }
        return cache[url]
    }
}
