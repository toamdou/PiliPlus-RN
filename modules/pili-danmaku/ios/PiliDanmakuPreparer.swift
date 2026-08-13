// Copyright 2026 PiliPlus. All rights reserved.

import Foundation

enum PiliDanmakuPreparer {
    private static let vipColors = ["#FF5E7E", "#FF9F43", "#A55EEA", "#22D3EE", "#F759AB"]

    static func prepare(items: [[String: Any]], options: [String: Any]) -> [String: Any] {
        let merge = options["merge"] as? Bool ?? false
        let keywords = (options["keywords"] as? [String]) ?? []
        let regexSources = (options["regexps"] as? [String]) ?? []
        let users = Set(((options["users"] as? [String]) ?? []).map { normalizeUserHash($0) })
        let duration = options["duration"] as? Double ?? 0
        let showVipDm = options["showVipDm"] as? Bool ?? true
        let fontSize = options["dmFontSize"] as? Double ?? 15
        let dmSpeed = options["dmSpeed"] as? Double ?? 8
        let staticDuration = options["staticDuration"] as? Double ?? 4
        let maxResident = max(0, options["maxResident"] as? Int ?? 6000)
        let densityBucketSec = max(1, options["densityBucketSec"] as? Double ?? 10)
        let densityMinLevel = options["densityMinLevel"] as? Double ?? 0.35

        let regexps = regexSources.compactMap {
            try? NSRegularExpression(pattern: $0, options: [.caseInsensitive])
        }

        var filtered: [[String: Any]] = []
        for item in items {
            if matchesFilter(
                item,
                keywords: keywords,
                regexps: regexps,
                users: users
            ) {
                continue
            }
            filtered.append(item)
        }
        filtered.sort {
            ($0["time"] as? Double ?? 0) < ($1["time"] as? Double ?? 0)
        }
        if merge {
            filtered = mergeSimilar(filtered)
        }

        let resident = maxResident > 0 ? Array(filtered.suffix(maxResident)) : filtered
        let outputItems = resident.map {
            makeNativeItem(
                $0,
                showVipDm: showVipDm,
                fontSize: fontSize,
                dmSpeed: dmSpeed,
                staticDuration: staticDuration
            )
        }
        let density = buildDensityMarkers(
            resident,
            duration: duration,
            bucketSec: densityBucketSec,
            minLevel: densityMinLevel
        )
        return [
            "items": outputItems,
            "density": density,
        ]
    }

    private static func matchesFilter(
        _ item: [String: Any],
        keywords: [String],
        regexps: [NSRegularExpression],
        users: Set<String>
    ) -> Bool {
        let text = item["text"] as? String ?? ""
        let uid = normalizeUserHash(item["userId"] as? String ?? "")
        if !uid.isEmpty && users.contains(uid) {
            return true
        }
        if keywords.contains(where: { text.contains($0) }) {
            return true
        }
        let nsText = text as NSString
        return regexps.contains {
            $0.firstMatch(
                in: text,
                range: NSRange(location: 0, length: nsText.length)
            ) != nil
        }
    }

    private static func mergeSimilar(_ items: [[String: Any]]) -> [[String: Any]] {
        var seen: [String: Int] = [:]
        var merged: [[String: Any]] = []
        for item in items {
            let key = (item["text"] as? String ?? "")
                .trimmingCharacters(in: .whitespacesAndNewlines)
                .lowercased()
            let count = seen[key] ?? 0
            if count < 3 {
                merged.append(item)
                seen[key] = count + 1
            }
        }
        return merged
    }

    private static func makeNativeItem(
        _ item: [String: Any],
        showVipDm: Bool,
        fontSize: Double,
        dmSpeed: Double,
        staticDuration: Double
    ) -> [String: Any] {
        let id = String(describing: item["id"] ?? "")
        let text = item["text"] as? String ?? ""
        let time = item["time"] as? Double ?? 0
        let modeRaw = item["mode"] as? Int ?? 0
        let mode: String
        let duration: Double
        // 批次5 P1：顶部固定弹幕原始 mode 为 5/6/7（底部固定为 4，滚动为 1/2/3）。
        // 原生渲染管线只支持 scroll/top/bottom 三类；mode 2/3 与 6/7 分别归类到
        // scroll/top，保证这些弹幕不再被丢弃（原先只在 1/4/5 时才保留）。
        switch modeRaw {
        case 1, 2, 3:
            mode = "scroll"
            duration = max(0, dmSpeed)
        case 4:
            mode = "bottom"
            duration = max(0, staticDuration)
        default:
            mode = "top"
            duration = max(0, staticDuration)
        }

        let colorful = item["colorful"] as? Bool ?? false
        let color: String
        if colorful && showVipDm {
            color = vipColor(id: id, text: text)
        } else {
            color = item["color"] as? String ?? "#FFFFFF"
        }

        return [
            "id": id,
            "text": text,
            "time": time,
            "duration": duration,
            "color": color,
            "fontSize": max(0, fontSize),
            "mode": mode,
        ]
    }

    private static func vipColor(id: String, text: String) -> String {
        let seed = id.isEmpty ? text : id
        var hash: UInt32 = 0
        for unit in seed.utf16 {
            hash = hash &* 31 &+ UInt32(unit)
        }
        return vipColors[Int(hash % UInt32(vipColors.count))]
    }

    private static func buildDensityMarkers(
        _ items: [[String: Any]],
        duration: Double,
        bucketSec: Double,
        minLevel: Double
    ) -> [[String: Any]] {
        guard duration > 0, !items.isEmpty else {
            return []
        }
        let bucketCount = max(1, Int(ceil(duration / bucketSec)))
        var counts = [Int](repeating: 0, count: bucketCount)
        var maxCount = 0
        for item in items {
            let time = item["time"] as? Double ?? 0
            let index = min(max(0, Int(floor(time / bucketSec))), bucketCount - 1)
            counts[index] += 1
            maxCount = max(maxCount, counts[index])
        }
        guard maxCount > 0 else {
            return []
        }

        var markers: [[String: Any]] = []
        for index in 0..<bucketCount {
            let level = Double(counts[index]) / Double(maxCount)
            if level < minLevel {
                continue
            }
            markers.append([
                "start": Double(index) * bucketSec,
                "end": min(Double(index + 1) * bucketSec, duration),
                "level": level,
            ])
        }
        return markers
    }

    private static func normalizeUserHash(_ uid: String) -> String {
        let lower = uid.lowercased()
        if lower.allSatisfy({ $0.isNumber }), let value = UInt64(lower) {
            return String(value, radix: 16)
        }
        return lower
    }
}
