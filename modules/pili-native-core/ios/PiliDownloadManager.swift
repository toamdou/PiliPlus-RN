// Copyright 2026 PiliPlus. All rights reserved.

import Foundation
import CFNetwork
import UIKit

/// URLSession background download manager with task progress/complete events.
public final class PiliDownloadManager: NSObject, URLSessionDownloadDelegate {
    public static let shared = PiliDownloadManager()
    static let identifier = "com.piliplus.download"

    private static let statesKey = "PiliPlus.download.states"
    private static let pendingDestinationsKey = "PiliPlus.download.pendingDestinations"
    private static let pendingCompletionsKey = "PiliPlus.download.pendingCompletions"
    private static let recordsKey = "PiliPlus.download.records"
    private static let recordIdsKey = "PiliPlus.download.recordIds"
    private static let recordPrefix = "PiliPlus.download.record."
    private static let statePrefix = "PiliPlus.download.state."
    private static let pendingDestinationPrefix = "PiliPlus.download.pendingDestination."
    private static let pendingCompletionIdsKey = "PiliPlus.download.completionIds"
    private static let pendingCompletionPrefix = "PiliPlus.download.completion."

    private let lock = NSLock()

    private struct DownloadState {
        let id: String
        let url: URL?
        let destination: URL
    }

    private var states: [String: DownloadState] = [:]
    private var pendingDestinations: [String: URL] = [:]
    private var lastProgressAt: [String: Date] = [:]
    private var lastProgressFraction: [String: Double] = [:]
    private var didRestorePersistedState = false
    private var didRestoreRecords = false
    private var recordsPersistGeneration = 0
    private var pendingRecordWrites: Set<String> = []
    private var backgroundCompletionHandlers: [String: () -> Void] = [:]
    private var configuredSession: URLSession?
    private var eventSink: ((String, [String: Any]) -> Void)?
    private var downloadProgressEventsEnabled = false
    private var acceptInvalidSSL = false
    private var records: [String: [String: Any]] = [:]

    // MARK: - App delegate

    func handleEventsForBackgroundURLSession(
        identifier: String,
        completionHandler: @escaping () -> Void
    ) {
        guard identifier == Self.identifier else {
            completionHandler()
            return
        }
        lock.lock()
        backgroundCompletionHandlers[identifier] = completionHandler
        lock.unlock()
        _ = session
    }

    // MARK: - Session

    private var session: URLSession {
        lock.lock()
        defer { lock.unlock() }
        restorePersistedStateIfNeededLocked()
        if let configuredSession {
            return configuredSession
        }

        let configuration = URLSessionConfiguration.background(withIdentifier: Self.identifier)
        configuration.sessionSendsLaunchEvents = true
        configuration.isDiscretionary = false
        configuration.waitsForConnectivity = true
        configuration.timeoutIntervalForResource = 7 * 24 * 60 * 60
        configuration.httpMaximumConnectionsPerHost = 3
        configuration.httpCookieStorage = HTTPCookieStorage.shared
        configuration.requestCachePolicy = .useProtocolCachePolicy
        configuration.httpAdditionalHeaders = [
            "User-Agent": "Mozilla/5.0 BiliDroid/8.43.0 (bbcallen@gmail.com) os/android model/android mobi_app/android build/8430300 channel/master innerVer/8430300 osVer/15 network/2",
            "Referer": "https://www.bilibili.com",
        ]
        let merged = PiliNetwork.mergedOptions([:])
        acceptInvalidSSL = (merged["badCertificateCallback"] as? Bool) ?? false
        PiliNetwork.applyNetworkSettings(to: configuration, options: merged)
        let created = URLSession(configuration: configuration, delegate: self, delegateQueue: nil)
        configuredSession = created
        return created
    }

    // MARK: - Module API

    func startDownload(
        urlString: String,
        destinationPath: String,
        title: String? = nil,
        pic: String? = nil,
        id: String? = nil
    ) throws -> String {
        guard let url = URL(string: urlString) else {
            throw PiliNetworkError.invalidURL
        }
        restorePersistedStateIfNeeded()
        restoreRecordsIfNeeded()

        let destination = destinationURL(from: destinationPath)
        let attrs = try? FileManager.default.attributesOfFileSystem(
            forPath: destination.deletingLastPathComponent().path
        )
        if let freeBytes = (attrs?[.systemFreeSize] as? NSNumber)?.int64Value,
           freeBytes < 64 * 1024 * 1024 {
            throw PiliNetworkError.insufficientStorage
        }
        let downloadId = id ?? UUID().uuidString
        var request = URLRequest(url: url, cachePolicy: .useProtocolCachePolicy, timeoutInterval: 60)
        request.setValue("https://www.bilibili.com", forHTTPHeaderField: "Referer")
        let task = session.downloadTask(with: request)
        task.taskDescription = downloadId
        lock.lock()
        states[downloadId] = DownloadState(id: downloadId, url: url, destination: destination)
        pendingDestinations[downloadId] = destination
        records[downloadId] = makeDownloadRecord(
            id: downloadId,
            url: url,
            destination: destination,
            title: title,
            pic: pic
        )
        lock.unlock()
        persistState(for: downloadId)
        persistRecord(downloadId)
        emit("onDownloadStateChange", ["id": downloadId, "state": "waiting"])
        task.resume()
        return downloadId
    }

    func fetchDownloads() -> [[String: Any]] {
        restoreRecordsIfNeeded()
        lock.lock()
        let sorted = records.values.sorted {
            ($0["createdAt"] as? Double ?? 0) > ($1["createdAt"] as? Double ?? 0)
        }
        lock.unlock()
        return sorted
    }

    func replaceDownloadRecords(_ records: [[String: Any]]) {
        restoreRecordsIfNeeded()
        lock.lock()
        var next: [String: [String: Any]] = [:]
        for record in records {
            if let id = record["id"] as? String {
                next[id] = record
            }
        }
        let removed = Set(self.records.keys).subtracting(Set(next.keys))
        self.records = next
        lock.unlock()
        for id in removed {
            removeRecordPersistence(id)
        }
        for (id, record) in next {
            writeRecord(id: id, record: record)
            ensureRecordId(id)
        }
    }

    func removeDownloadRecord(id: String) {
        restoreRecordsIfNeeded()
        lock.lock()
        records.removeValue(forKey: id)
        lock.unlock()
        removeRecordPersistence(id)
    }

    func fetchPendingCompletions() -> [[String: Any]] {
        loadPendingCompletions()
    }

    func ackDownloadCompletion(id: String) {
        removeCompletion(id)
    }

    func cancelDownload(id: String) -> Bool {
        restorePersistedStateIfNeeded()
        lock.lock()
        let destination = pendingDestinations[id] ?? states[id]?.destination
        let removed = states.removeValue(forKey: id) != nil
        let removedPending = pendingDestinations.removeValue(forKey: id) != nil
        let removedRecord = records.removeValue(forKey: id) != nil
        lastProgressAt.removeValue(forKey: id)
        lastProgressFraction.removeValue(forKey: id)
        lock.unlock()
        guard removed || removedPending || removedRecord else {
            return false
        }
        removePendingCompletions { $0 == id }
        removePersistedState(for: id)
        removeRecordPersistence(id)
        session.getAllTasks { tasks in
            tasks.first { $0.taskDescription == id }?.cancel()
            if let destination, FileManager.default.fileExists(atPath: destination.path) {
                try? FileManager.default.removeItem(at: destination)
            }
        }
        return true
    }

    func clearDownloads() -> Bool {
        restorePersistedStateIfNeeded()
        restoreRecordsIfNeeded()
        lock.lock()
        let destinations = Array(pendingDestinations.values)
        states.removeAll()
        pendingDestinations.removeAll()
        lastProgressAt.removeAll()
        lastProgressFraction.removeAll()
        records.removeAll()
        lock.unlock()
        clearPendingCompletions()
        clearPersistedState()
        clearRecordPersistence()
        session.getAllTasks { tasks in
            for task in tasks {
                task.cancel()
            }
            for destination in destinations {
                if FileManager.default.fileExists(atPath: destination.path) {
                    try? FileManager.default.removeItem(at: destination)
                }
            }
        }
        return true
    }

    /// 网络配置变化后，仅在没有活动任务时重建 background session。
    func reloadSessionIfNeeded() {
        lock.lock()
        let existing = configuredSession
        lock.unlock()
        guard let existing else {
            return
        }
        existing.getAllTasks { [weak self] tasks in
            guard let self, tasks.isEmpty else {
                return
            }
            self.lock.lock()
            if self.configuredSession === existing {
                existing.finishTasksAndInvalidate()
                self.configuredSession = nil
            }
            self.lock.unlock()
        }
    }

    // MARK: - URLSessionDownloadDelegate

    public func urlSession(
        _ session: URLSession,
        downloadTask: URLSessionDownloadTask,
        didWriteData bytesWritten: Int64,
        totalBytesWritten: Int64,
        totalBytesExpectedToWrite: Int64
    ) {
        restorePersistedStateIfNeeded()
        guard let id = downloadTask.taskDescription else {
            return
        }
        let fraction = totalBytesExpectedToWrite > 0
            ? Double(totalBytesWritten) / Double(totalBytesExpectedToWrite)
            : 0
        lock.lock()
        guard states[id] != nil else {
            lock.unlock()
            return
        }
        let shouldUpdate = downloadProgressEventsEnabled
        lock.unlock()
        // 没有下载页/JS 监听时跳过记录写入，避免后台下载约 0.5s 整表写 UserDefaults。
        guard shouldUpdate else {
            return
        }
        updateRecord(id: id) { record in
            record["status"] = "downloading"
            record["progress"] = fraction
        }
        let shouldEmit: Bool
        lock.lock()
        shouldEmit = shouldEmitProgressLocked(id: id, fraction: fraction)
        lock.unlock()
        guard shouldEmit else {
            return
        }
        emit(
            "onDownloadProgress",
            [
                "id": id,
                "fractionCompleted": fraction,
                "bytesWritten": totalBytesWritten,
                "totalBytesExpected": totalBytesExpectedToWrite,
            ]
        )
    }

    public func urlSession(
        _ session: URLSession,
        downloadTask: URLSessionDownloadTask,
        didFinishDownloadingTo location: URL
    ) {
        restorePersistedStateIfNeeded()
        guard let id = downloadTask.taskDescription else {
            return
        }
        lock.lock()
        let state = states.removeValue(forKey: id)
        pendingDestinations.removeValue(forKey: id)
        lastProgressAt.removeValue(forKey: id)
        lastProgressFraction.removeValue(forKey: id)
        lock.unlock()
        removePersistedState(for: id)
        guard let state else {
            return
        }
        do {
            if FileManager.default.fileExists(atPath: state.destination.path) {
                try FileManager.default.removeItem(at: state.destination)
            }
            try FileManager.default.moveItem(at: location, to: state.destination)
            var backupValue = URLResourceValues()
            backupValue.isExcludedFromBackup = true
            try? state.destination.setResourceValues(backupValue)
            let fileSize: Int64
            if let attributes = try? FileManager.default.attributesOfItem(
                atPath: state.destination.path
            ) {
                if let size = attributes[.size] as? NSNumber {
                    fileSize = size.int64Value
                } else {
                    fileSize = 0
                }
            } else {
                fileSize = 0
            }
            emit(
                "onDownloadProgress",
                [
                    "id": state.id,
                    "fractionCompleted": 1.0,
                    "bytesWritten": fileSize,
                    "totalBytesExpected": fileSize,
                ]
            )
            emit(
                "onDownloadComplete",
                [
                    "id": state.id,
                    "uri": state.destination.absoluteString,
                    "error": NSNull(),
                ]
            )
            enqueueCompletion(id: state.id, uri: state.destination.absoluteString, error: nil)
            updateRecord(id: state.id) { record in
                record["status"] = "done"
                record["progress"] = 1.0
                record["path"] = state.destination.absoluteString
            }
            persistRecord(state.id)
        } catch {
            enqueueCompletion(id: state.id, uri: nil, error: error.localizedDescription)
            updateRecord(id: state.id) { record in
                record["status"] = "error"
                record["error"] = error.localizedDescription
            }
            persistRecord(state.id)
            emit(
                "onDownloadComplete",
                [
                    "id": state.id,
                    "uri": NSNull(),
                    "error": error.localizedDescription,
                ]
            )
        }
    }

    public func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
        restorePersistedStateIfNeeded()
        guard let id = task.taskDescription else {
            return
        }
        lock.lock()
        let state = states.removeValue(forKey: id)
        pendingDestinations.removeValue(forKey: id)
        lastProgressAt.removeValue(forKey: id)
        lastProgressFraction.removeValue(forKey: id)
        lock.unlock()
        guard let state else {
            return
        }
        removePersistedState(for: id)
        if let error {
            enqueueCompletion(id: state.id, uri: nil, error: error.localizedDescription)
            updateRecord(id: state.id) { record in
                record["status"] = "error"
                record["error"] = error.localizedDescription
            }
            persistRecord(state.id)
            emit("onDownloadStateChange", ["id": state.id, "state": "error"])
            emit(
                "onDownloadComplete",
                [
                    "id": state.id,
                    "uri": NSNull(),
                    "error": error.localizedDescription,
                ]
            )
        }
    }

    public func urlSessionDidFinishEvents(forBackgroundURLSession session: URLSession) {
        let identifier = session.configuration.identifier ?? Self.identifier
        lock.lock()
        let handler = backgroundCompletionHandlers.removeValue(forKey: identifier)
        lock.unlock()
        DispatchQueue.main.async {
            handler?()
        }
    }

    public func urlSession(
        _ session: URLSession,
        didReceive challenge: URLAuthenticationChallenge,
        completionHandler: @escaping (URLSession.AuthChallengeDisposition, URLCredential?) -> Void
    ) {
        if acceptInvalidSSL,
           challenge.protectionSpace.authenticationMethod == NSURLAuthenticationMethodServerTrust,
           let serverTrust = challenge.protectionSpace.serverTrust {
            completionHandler(.useCredential, URLCredential(trust: serverTrust))
            return
        }
        completionHandler(.performDefaultHandling, nil)
    }

    func setEventSink(_ sink: ((String, [String: Any]) -> Void)?) {
        lock.lock()
        eventSink = sink
        lock.unlock()
    }

    func setDownloadProgressEventsEnabled(_ enabled: Bool) {
        lock.lock()
        downloadProgressEventsEnabled = enabled
        lock.unlock()
    }

    // MARK: - Download records

    private func makeDownloadRecord(
        id: String,
        url: URL,
        destination: URL,
        title: String?,
        pic: String?
    ) -> [String: Any] {
        [
            "id": id,
            "title": title ?? "",
            "pic": pic ?? "",
            "url": url.absoluteString,
            "destination": destination.absoluteString,
            "path": destination.absoluteString,
            "createdAt": Date().timeIntervalSince1970,
            "status": "downloading",
            "progress": 0.0,
        ]
    }

    private func updateRecord(id: String, mutate: (inout [String: Any]) -> Void) {
        restoreRecordsIfNeeded()
        lock.lock()
        guard var record = records[id] else {
            lock.unlock()
            return
        }
        mutate(&record)
        records[id] = record
        lock.unlock()
        persistRecordsThrottled(id: id)
    }

    private func restoreRecordsIfNeeded() {
        lock.lock()
        defer { lock.unlock() }
        guard !didRestoreRecords else {
            return
        }
        didRestoreRecords = true
        let defaults = UserDefaults.standard
        let ids = defaults.stringArray(forKey: Self.recordIdsKey) ?? []
        if !ids.isEmpty {
            var restored: [String: [String: Any]] = [:]
            for id in ids {
                guard let raw = defaults.string(forKey: Self.recordPrefix + id),
                      let data = raw.data(using: .utf8),
                      let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                      let recordId = json["id"] as? String,
                      recordId == id else {
                    continue
                }
                restored[id] = json
            }
            records = restored
            return
        }

        let prefixedKeys = defaults.dictionaryRepresentation().keys
            .filter { $0.hasPrefix(Self.recordPrefix) }
        if !prefixedKeys.isEmpty {
            var restored: [String: [String: Any]] = [:]
            for key in prefixedKeys {
                let id = String(key.dropFirst(Self.recordPrefix.count))
                guard let raw = defaults.string(forKey: key),
                      let data = raw.data(using: .utf8),
                      let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                      let recordId = json["id"] as? String,
                      recordId == id else {
                    continue
                }
                restored[id] = json
            }
            if !restored.isEmpty {
                records = restored
                writeRecordIdsLocked()
                return
            }
        }

        // 旧版整表 records 迁移为按 id 分 key 存储。
        if let raw = defaults.string(forKey: Self.recordsKey),
           let data = raw.data(using: .utf8),
           let entries = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]] {
            var restored: [String: [String: Any]] = [:]
            for entry in entries {
                if let id = entry["id"] as? String {
                    restored[id] = entry
                }
            }
            records = restored
            for (id, record) in restored {
                writeRecord(id: id, record: record)
            }
            writeRecordIdsLocked()
            defaults.removeObject(forKey: Self.recordsKey)
        }
    }

    private func persistRecord(_ id: String) {
        lock.lock()
        let record = records[id]
        lock.unlock()
        guard let record else {
            return
        }
        writeRecord(id: id, record: record)
        ensureRecordId(id)
    }

    private func writeRecord(id: String, record: [String: Any]) {
        if let data = try? JSONSerialization.data(withJSONObject: record) {
            UserDefaults.standard.set(
                String(data: data, encoding: .utf8),
                forKey: Self.recordPrefix + id
            )
        }
    }

    private func ensureRecordId(_ id: String) {
        let defaults = UserDefaults.standard
        var ids = defaults.stringArray(forKey: Self.recordIdsKey) ?? []
        if !ids.contains(id) {
            ids.append(id)
            defaults.set(ids, forKey: Self.recordIdsKey)
        }
    }

    private func removeRecordPersistence(_ id: String) {
        let defaults = UserDefaults.standard
        defaults.removeObject(forKey: Self.recordPrefix + id)
        var ids = defaults.stringArray(forKey: Self.recordIdsKey) ?? []
        if let index = ids.firstIndex(of: id) {
            ids.remove(at: index)
            defaults.set(ids, forKey: Self.recordIdsKey)
        }
    }

    private func clearRecordPersistence() {
        let defaults = UserDefaults.standard
        let ids = defaults.stringArray(forKey: Self.recordIdsKey) ?? []
        for id in ids {
            defaults.removeObject(forKey: Self.recordPrefix + id)
        }
        defaults.removeObject(forKey: Self.recordIdsKey)
    }

    private func writeRecordIdsLocked() {
        let defaults = UserDefaults.standard
        let ids = records.values
            .sorted { ($0["createdAt"] as? Double ?? 0) > ($1["createdAt"] as? Double ?? 0) }
            .compactMap { $0["id"] as? String }
        defaults.set(ids, forKey: Self.recordIdsKey)
    }

    private func persistRecordsThrottled(id: String) {
        lock.lock()
        recordsPersistGeneration += 1
        let generation = recordsPersistGeneration
        pendingRecordWrites.insert(id)
        lock.unlock()
        DispatchQueue.global().asyncAfter(deadline: .now() + 0.5) { [weak self] in
            self?.persistPendingRecordsIfCurrent(generation)
        }
    }

    private func persistPendingRecordsIfCurrent(_ generation: Int) {
        lock.lock()
        guard generation == recordsPersistGeneration else {
            lock.unlock()
            return
        }
        let ids = Array(pendingRecordWrites)
        pendingRecordWrites.removeAll()
        var snapshot: [String: [String: Any]] = [:]
        for id in ids {
            if let record = records[id] {
                snapshot[id] = record
            }
        }
        lock.unlock()
        for (id, record) in snapshot {
            writeRecord(id: id, record: record)
            ensureRecordId(id)
        }
    }

    // MARK: - Persistence

    private func restorePersistedStateIfNeeded() {
        lock.lock()
        restorePersistedStateIfNeededLocked()
        lock.unlock()
    }

    private func restorePersistedStateIfNeededLocked() {
        guard !didRestorePersistedState else {
            return
        }
        didRestorePersistedState = true
        let defaults = UserDefaults.standard
        let ids = defaults.stringArray(forKey: Self.recordIdsKey) ?? []
        if !ids.isEmpty {
            for id in ids {
                if let raw = defaults.string(forKey: Self.statePrefix + id),
                   let data = raw.data(using: .utf8),
                   let entry = try? JSONSerialization.jsonObject(with: data) as? [String: String],
                   let destinationPath = entry["destination"] {
                    states[id] = DownloadState(
                        id: id,
                        url: entry["url"].flatMap { URL(string: $0) },
                        destination: URL(fileURLWithPath: destinationPath)
                    )
                }
                if let path = defaults.string(forKey: Self.pendingDestinationPrefix + id) {
                    pendingDestinations[id] = URL(fileURLWithPath: path)
                }
            }
            return
        }

        let stateKeys = defaults.dictionaryRepresentation().keys
            .filter { $0.hasPrefix(Self.statePrefix) }
        let pendingKeys = defaults.dictionaryRepresentation().keys
            .filter { $0.hasPrefix(Self.pendingDestinationPrefix) }
        if !stateKeys.isEmpty || !pendingKeys.isEmpty {
            for key in stateKeys {
                let id = String(key.dropFirst(Self.statePrefix.count))
                guard let raw = defaults.string(forKey: key),
                      let data = raw.data(using: .utf8),
                      let entry = try? JSONSerialization.jsonObject(with: data) as? [String: String],
                      let destinationPath = entry["destination"] else {
                    continue
                }
                states[id] = DownloadState(
                    id: id,
                    url: entry["url"].flatMap { URL(string: $0) },
                    destination: URL(fileURLWithPath: destinationPath)
                )
            }
            for key in pendingKeys {
                let id = String(key.dropFirst(Self.pendingDestinationPrefix.count))
                if let path = defaults.string(forKey: key) {
                    pendingDestinations[id] = URL(fileURLWithPath: path)
                }
            }
            return
        }

        // 旧版整表 state/pendingDestinations 迁移为按 id 分 key。
        if let raw = defaults.string(forKey: Self.statesKey),
           let data = raw.data(using: .utf8),
           let entries = try? JSONSerialization.jsonObject(with: data) as? [[String: String]] {
            var restored: [String: DownloadState] = [:]
            for entry in entries {
                guard let id = entry["id"],
                      let destinationPath = entry["destination"] else {
                    continue
                }
                let url: URL?
                if let urlString = entry["url"] {
                    url = URL(string: urlString)
                } else {
                    url = nil
                }
                restored[id] = DownloadState(
                    id: id,
                    url: url,
                    destination: URL(fileURLWithPath: destinationPath)
                )
            }
            states = restored
            for state in states.values {
                writeStatePersistence(state)
            }
            defaults.removeObject(forKey: Self.statesKey)
        }

        if let raw = defaults.string(forKey: Self.pendingDestinationsKey),
           let data = raw.data(using: .utf8),
           let entries = try? JSONSerialization.jsonObject(with: data) as? [[String: String]] {
            var restored: [String: URL] = [:]
            for entry in entries {
                guard let id = entry["id"],
                      let destinationPath = entry["destination"] else {
                    continue
                }
                restored[id] = URL(fileURLWithPath: destinationPath)
            }
            pendingDestinations = restored
            for (id, destination) in restored {
                defaults.set(destination.path, forKey: Self.pendingDestinationPrefix + id)
            }
            defaults.removeObject(forKey: Self.pendingDestinationsKey)
        }
    }

    private func persistState(for id: String) {
        lock.lock()
        let state = states[id]
        let pending = pendingDestinations[id]
        lock.unlock()
        if let state {
            writeStatePersistence(state)
        } else {
            UserDefaults.standard.removeObject(forKey: Self.statePrefix + id)
        }
        if let pending {
            UserDefaults.standard.set(pending.path, forKey: Self.pendingDestinationPrefix + id)
        } else {
            UserDefaults.standard.removeObject(forKey: Self.pendingDestinationPrefix + id)
        }
    }

    private func writeStatePersistence(_ state: DownloadState) {
        var entry: [String: String] = [
            "id": state.id,
            "destination": state.destination.path,
        ]
        if let url = state.url {
            entry["url"] = url.absoluteString
        }
        if let data = try? JSONSerialization.data(withJSONObject: entry) {
            UserDefaults.standard.set(
                String(data: data, encoding: .utf8),
                forKey: Self.statePrefix + state.id
            )
        }
    }

    private func removePersistedState(for id: String) {
        let defaults = UserDefaults.standard
        defaults.removeObject(forKey: Self.statePrefix + id)
        defaults.removeObject(forKey: Self.pendingDestinationPrefix + id)
    }

    private func clearPersistedState() {
        let defaults = UserDefaults.standard
        for key in defaults.dictionaryRepresentation().keys
            where key.hasPrefix(Self.statePrefix) || key.hasPrefix(Self.pendingDestinationPrefix) {
            defaults.removeObject(forKey: key)
        }
    }

    private func loadPendingCompletions() -> [[String: Any]] {
        let defaults = UserDefaults.standard
        let ids = defaults.stringArray(forKey: Self.pendingCompletionIdsKey) ?? []
        if !ids.isEmpty {
            var result: [[String: Any]] = []
            for id in ids {
                guard let raw = defaults.string(forKey: Self.pendingCompletionPrefix + id),
                      let data = raw.data(using: .utf8),
                      let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
                    continue
                }
                result.append(json)
            }
            return result
        }

        let completionKeys = defaults.dictionaryRepresentation().keys
            .filter { $0.hasPrefix(Self.pendingCompletionPrefix) }
        if !completionKeys.isEmpty {
            var result: [[String: Any]] = []
            let ordered = completionKeys.sorted()
            for key in ordered {
                guard let raw = defaults.string(forKey: key),
                      let data = raw.data(using: .utf8),
                      let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                      let id = json["id"] as? String else {
                    continue
                }
                result.append(json)
                appendCompletionId(id)
            }
            if !result.isEmpty {
                return result
            }
        }

        // 旧版整表 pendingCompletions 迁移。
        guard let raw = defaults.string(forKey: Self.pendingCompletionsKey),
              let data = raw.data(using: .utf8),
              let entries = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]] else {
            return []
        }
        for entry in entries {
            guard let id = entry["id"] as? String else {
                continue
            }
            writeCompletion(id: id, entry: entry)
            appendCompletionId(id)
        }
        defaults.removeObject(forKey: Self.pendingCompletionsKey)
        return entries
    }

    private func writeCompletion(id: String, entry: [String: Any]) {
        if let data = try? JSONSerialization.data(withJSONObject: entry) {
            UserDefaults.standard.set(
                String(data: data, encoding: .utf8),
                forKey: Self.pendingCompletionPrefix + id
            )
        }
    }

    private func appendCompletionId(_ id: String) {
        let defaults = UserDefaults.standard
        var ids = defaults.stringArray(forKey: Self.pendingCompletionIdsKey) ?? []
        ids.removeAll { $0 == id }
        ids.append(id)
        if ids.count > 200 {
            let removed = ids.prefix(ids.count - 200)
            ids.removeFirst(ids.count - 200)
            for old in removed {
                defaults.removeObject(forKey: Self.pendingCompletionPrefix + old)
            }
        }
        defaults.set(ids, forKey: Self.pendingCompletionIdsKey)
    }

    private func removeCompletion(_ id: String) {
        let defaults = UserDefaults.standard
        defaults.removeObject(forKey: Self.pendingCompletionPrefix + id)
        var ids = defaults.stringArray(forKey: Self.pendingCompletionIdsKey) ?? []
        ids.removeAll { $0 == id }
        defaults.set(ids, forKey: Self.pendingCompletionIdsKey)
    }

    private func clearPendingCompletions() {
        let defaults = UserDefaults.standard
        let ids = defaults.stringArray(forKey: Self.pendingCompletionIdsKey) ?? []
        for id in ids {
            defaults.removeObject(forKey: Self.pendingCompletionPrefix + id)
        }
        defaults.removeObject(forKey: Self.pendingCompletionIdsKey)
        defaults.removeObject(forKey: Self.pendingCompletionsKey)
    }

    private func enqueueCompletion(id: String, uri: String?, error: String?) {
        _ = loadPendingCompletions()
        writeCompletion(id: id, entry: [
            "id": id,
            "uri": uri ?? NSNull(),
            "error": error ?? NSNull(),
        ])
        appendCompletionId(id)
    }

    private func removePendingCompletions(matching filter: (String) -> Bool) {
        _ = loadPendingCompletions()
        let defaults = UserDefaults.standard
        var ids = defaults.stringArray(forKey: Self.pendingCompletionIdsKey) ?? []
        var removed: [String] = []
        ids.removeAll { id in
            if filter(id) {
                removed.append(id)
                return true
            }
            return false
        }
        if !removed.isEmpty {
            for id in removed {
                defaults.removeObject(forKey: Self.pendingCompletionPrefix + id)
            }
            defaults.set(ids, forKey: Self.pendingCompletionIdsKey)
        }
    }

    // MARK: - Progress throttle

    private func shouldEmitProgressLocked(id: String, fraction: Double) -> Bool {
        let now = Date()
        let lastAt = lastProgressAt[id]
        let previousFraction = lastProgressFraction[id] ?? -1
        let significantChange = abs(fraction - previousFraction) >= 0.01
        let intervalElapsed = lastAt == nil || now.timeIntervalSince(lastAt!) >= 0.25
        guard significantChange || intervalElapsed else {
            return false
        }
        lastProgressAt[id] = now
        lastProgressFraction[id] = fraction
        return true
    }

    // MARK: - Events

    private func emit(_ name: String, _ payload: [String: Any]) {
        lock.lock()
        let sink = eventSink
        lock.unlock()
        DispatchQueue.main.async {
            sink?(name, payload)
        }
    }

    private func destinationURL(from path: String) -> URL {
        if let fileURL = URL(string: path), fileURL.isFileURL {
            return fileURL
        }
        return URL(fileURLWithPath: path)
    }
}
