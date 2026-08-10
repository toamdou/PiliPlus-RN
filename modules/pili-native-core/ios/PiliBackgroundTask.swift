// Copyright 2026 PiliPlus. All rights reserved.

import BackgroundTasks
import ExpoModulesCore
import UIKit
import UserNotifications

public final class PiliBackgroundTask: ExpoAppDelegateSubscriber {
    public static let identifier = "com.piliplus.dynamic-check"

    private static let lastSeenIdKey = "PiliPlus.dynamic.lastSeenId"
    private static let latestIdKey = "PiliPlus.dynamic.latestId"
    private static let mixinKeyKey = "PiliPlus.dynamic.mixinKey"
    private static let mixinKeyFetchedAtKey = "PiliPlus.dynamic.mixinKeyFetchedAt"
    private static let lastNotifiedIdKey = "PiliPlus.dynamic.lastNotifiedId"
    private static let badgeModeKey = "PiliPlus.dynamic.badgeMode"
    private static let minimumIntervalKey = "PiliPlus.dynamic.minimumIntervalMinutes"
    private static let accountIdKey = "PiliPlus.dynamic.accountId"
    private static let enabledKey = "PiliPlus.dynamic.enabled"
    private static var launchHandlerRegistered = false

    private static func settingsSnapshotValue<T>(_ key: String) -> T? {
        guard let raw = UserDefaults.standard.string(forKey: "PiliPlus.settings.snapshot"),
              let data = raw.data(using: .utf8),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            return nil
        }
        return json[key] as? T
    }

    private static func accountNamespace() -> String {
        let stored = UserDefaults.standard.string(forKey: accountIdKey) ?? "default"
        return stored.isEmpty ? "default" : stored
    }

    private static func scopedKey(_ base: String, _ account: String? = nil) -> String {
        "\(base).\(account ?? accountNamespace())"
    }

    public func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
    ) -> Bool {
        Self.registerLaunchHandler()
        return true
    }

    // MARK: - Module API

    @discardableResult
    static func registerDynamicCheck(options: [String: Any]) -> Bool {
        UserDefaults.standard.set(true, forKey: enabledKey)
        if let accountId = options["accountId"] as? String, !accountId.isEmpty {
            UserDefaults.standard.set(accountId, forKey: accountIdKey)
        }
        if let mixinKey = options["mixinKey"] as? String, !mixinKey.isEmpty {
            UserDefaults.standard.set(mixinKey, forKey: scopedKey(mixinKeyKey))
            UserDefaults.standard.set(Date().timeIntervalSince1970, forKey: scopedKey(mixinKeyFetchedAtKey))
        }
        let badgeMode = Int((options["badgeMode"] as? Double) ?? (settingsSnapshotValue("dynamicBadgeMode") as? Double) ?? 0)
        UserDefaults.standard.set(badgeMode, forKey: scopedKey(badgeModeKey))

        let minutes = max(
            1,
            Int((options["minimumIntervalMinutes"] as? Double) ?? (settingsSnapshotValue("dynamicPeriod") as? Double) ?? 1)
        )
        UserDefaults.standard.set(Double(minutes), forKey: scopedKey(minimumIntervalKey))
        let request = BGAppRefreshTaskRequest(identifier: identifier)
        request.earliestBeginDate = Date(timeIntervalSinceNow: Double(minutes) * 60)

        do {
            try BGTaskScheduler.shared.submit(request)
            requestNotificationAuthorizationIfNeeded()
            return true
        } catch {
            return false
        }
    }

    @discardableResult
    static func unregisterDynamicCheck() -> Bool {
        UserDefaults.standard.set(false, forKey: enabledKey)
        BGTaskScheduler.shared.cancel(taskRequestWithIdentifier: identifier)
        return true
    }

    static func clearDynamicNotifications() {
        let center = UNUserNotificationCenter.current()
        center.removePendingNotificationRequests(withIdentifiers: ["piliplus.dynamic-check"])
        center.removeDeliveredNotifications(withIdentifiers: ["piliplus.dynamic-check"])
        DispatchQueue.main.async {
            UIApplication.shared.applicationIconBadgeNumber = 0
        }
    }

    @discardableResult
    static func resetDynamicAccount() -> Bool {
        let namespace = accountNamespace()
        let defaults = UserDefaults.standard
        defaults.removeObject(forKey: scopedKey(lastSeenIdKey, namespace))
        defaults.removeObject(forKey: scopedKey(latestIdKey, namespace))
        defaults.removeObject(forKey: scopedKey(mixinKeyKey, namespace))
        defaults.removeObject(forKey: scopedKey(mixinKeyFetchedAtKey, namespace))
        defaults.removeObject(forKey: scopedKey(lastNotifiedIdKey, namespace))
        defaults.removeObject(forKey: scopedKey(badgeModeKey, namespace))
        defaults.removeObject(forKey: scopedKey(minimumIntervalKey, namespace))
        defaults.removeObject(forKey: accountIdKey)

        DispatchQueue.main.async {
            UIApplication.shared.applicationIconBadgeNumber = 0
        }
        let center = UNUserNotificationCenter.current()
        center.removePendingNotificationRequests(withIdentifiers: ["piliplus.dynamic-check"])
        center.removeDeliveredNotifications(withIdentifiers: ["piliplus.dynamic-check"])
        return true
    }

    @discardableResult
    static func setBadgeCount(_ count: Int) -> Bool {
        DispatchQueue.main.async {
            UIApplication.shared.applicationIconBadgeNumber = count
        }
        return true
    }

    @discardableResult
    static func markDynamicRead() -> Bool {
        let defaults = UserDefaults.standard
        if let latestId = defaults.string(forKey: scopedKey(latestIdKey)) {
            defaults.set(latestId, forKey: scopedKey(lastSeenIdKey))
        }
        DispatchQueue.main.async {
            UIApplication.shared.applicationIconBadgeNumber = 0
        }
        return true
    }

    // MARK: - Launch registration

    private static func registerLaunchHandler() {
        guard !launchHandlerRegistered else {
            return
        }
        launchHandlerRegistered = true

        BGTaskScheduler.shared.register(forTaskWithIdentifier: identifier, using: nil) { task in
            guard let refreshTask = task as? BGAppRefreshTask else {
                task.setTaskCompleted(success: false)
                return
            }
            handle(refreshTask)
        }
    }

    private static func handle(_ task: BGAppRefreshTask) {
        let completionLock = NSLock()
        var didComplete = false

        func complete(success: Bool) {
            completionLock.lock()
            guard !didComplete else {
                completionLock.unlock()
                return
            }
            didComplete = true
            completionLock.unlock()
            task.setTaskCompleted(success: success)
        }

        let work = Task {
            let result = await performDynamicCheckOnce()
            let success = result["success"] as? Bool ?? false
            guard !Task.isCancelled else {
                return
            }
            scheduleNextRefresh(success: success)
            complete(success: success)
        }

        task.expirationHandler = {
            complete(success: false)
            work.cancel()
        }
    }

    private static func scheduleNextRefresh(success: Bool) {
        guard UserDefaults.standard.bool(forKey: enabledKey) else {
            return
        }
        let storedMinutes = UserDefaults.standard.double(forKey: scopedKey(minimumIntervalKey))
        let configuredMinutes = storedMinutes > 0 ? storedMinutes : 15
        let minutes = success
            ? max(configuredMinutes, 15)
            : max(configuredMinutes * 2, 30)

        let request = BGAppRefreshTaskRequest(identifier: identifier)
        request.earliestBeginDate = Date(timeIntervalSinceNow: minutes * 60)
        do {
            try BGTaskScheduler.shared.submit(request)
        } catch {
            // 系统拒绝续约时保持静默，JS 启动注册仍是兜底入口。
        }
    }

    // MARK: - Dynamic feed check

    static func performDynamicCheckOnce() async -> [String: Any] {
        // 轻量入口：多数轮询周期没有新动态，直接返回 0，不拉全量 feed。
        if let entranceCount = await fetchEntranceCount(), entranceCount <= 0 {
            let defaults = UserDefaults.standard
            return [
                "success": true,
                "newCount": 0,
                "latestId": defaults.string(forKey: scopedKey(latestIdKey)) ?? NSNull(),
                "lastSeenId": defaults.string(forKey: scopedKey(lastSeenIdKey)) ?? NSNull(),
            ]
        }
        return await performFullFeedCheck()
    }

    private static func fetchEntranceCount() async -> Int? {
        var params: [String: Any] = [:]
        let mixinKey = storedMixinKey() ?? (await fetchMixinKey() ?? "")
        if !mixinKey.isEmpty {
            params = PiliSigner.wbiSign(params: params, mixinKey: mixinKey)
        }
        let query = PiliSigner.wbiQuery(from: params)
        let base = "https://api.bilibili.com/x/web-interface/dynamic/entrance"
        guard let url = URL(string: query.isEmpty ? base : "\(base)?\(query)") else {
            return nil
        }

        do {
            let headers: [String: String] = [
                "User-Agent": "Mozilla/5.0 BiliDroid/8.43.0 (bbcallen@gmail.com) os/android model/android mobi_app/android build/8430300 channel/master innerVer/8430300 osVer/15 network/2",
                "Referer": "https://www.bilibili.com",
                "Accept-Encoding": "gzip, deflate",
            ]
            let response = try await PiliNetwork.request(options: PiliNetwork.mergedOptions([
                "url": url.absoluteString,
                "method": "GET",
                "headers": headers,
                "timeoutMs": 10_000.0,
                "retries": 1.0,
                "retryDelayMs": 1_000.0,
                "responseType": "json",
            ]))
            guard let status = response["status"] as? Int,
                  (200..<400).contains(status),
                  let json = response["data"] as? [String: Any],
                  let rootData = json["data"] as? [String: Any],
                  let countValue = rootData["new_count"] as? NSNumber else {
                return nil
            }
            return countValue.intValue
        } catch {
            return nil
        }
    }

    private static func performFullFeedCheck() async -> [String: Any] {
        let defaults = UserDefaults.standard
        var params: [String: Any] = [
            "type_list": "268435455",
            "page": 1,
            "features": "itemOpusStyle",
        ]

        let mixinKey = storedMixinKey() ?? (await fetchMixinKey() ?? "")
        if !mixinKey.isEmpty {
            params = PiliSigner.wbiSign(params: params, mixinKey: mixinKey)
        }

        let query = PiliSigner.wbiQuery(from: params)
        guard let url = URL(string: "https://api.bilibili.com/x/polymer/web-dynamic/v1/feed/all?\(query)") else {
            return failedDynamicResult()
        }

        do {
            var headers: [String: String] = [
                "User-Agent": "Mozilla/5.0 BiliDroid/8.43.0 (bbcallen@gmail.com) os/android model/android mobi_app/android build/8430300 channel/master innerVer/8430300 osVer/15 network/2",
                "Referer": "https://www.bilibili.com",
                "Accept-Encoding": "gzip, deflate",
            ]
            // URLSession sessions share HTTPCookieStorage, so automatic attachment
            // preserves the full cookie attributes including access_key.
            let response = try await PiliNetwork.request(options: PiliNetwork.mergedOptions([
                "url": url.absoluteString,
                "method": "GET",
                "headers": headers,
                "timeoutMs": 10_000.0,
                "retries": 1.0,
                "retryDelayMs": 1_000.0,
                "responseType": "json",
            ]))

            guard let status = response["status"] as? Int,
                  (200..<400).contains(status) else {
                return failedDynamicResult()
            }
            guard let json = response["data"] as? [String: Any],
                  let rootData = json["data"] as? [String: Any],
                  let items = rootData["items"] as? [[String: Any]],
                  let latestId = items.first?["id_str"] as? String else {
                return failedDynamicResult()
            }

            let update = updateState(latestId: latestId, items: items)
            return [
                "success": update.success,
                "newCount": update.count,
                "latestId": latestId,
                "lastSeenId": defaults.string(forKey: scopedKey(lastSeenIdKey)) ?? NSNull(),
            ]
        } catch {
            return failedDynamicResult()
        }
    }

    private static func failedDynamicResult() -> [String: Any] {
        let defaults = UserDefaults.standard
        return [
            "success": false,
            "newCount": 0,
            "latestId": defaults.string(forKey: scopedKey(latestIdKey)) ?? NSNull(),
            "lastSeenId": defaults.string(forKey: scopedKey(lastSeenIdKey)) ?? NSNull(),
        ]
    }

    static func currentMixinKey() async -> String? {
        if let stored = storedMixinKey() {
            return stored
        }
        return await fetchMixinKey()
    }

    static func fetchMixinKey() async -> String? {
        guard let url = URL(string: "https://api.bilibili.com/x/web-interface/nav") else {
            return nil
        }

        do {
            var headers: [String: String] = [
                "User-Agent": "Mozilla/5.0",
                "Referer": "https://www.bilibili.com",
            ]
            // Same shared-storage behavior as the dynamic feed request above.
            let response = try await PiliNetwork.request(options: PiliNetwork.mergedOptions([
                "url": url.absoluteString,
                "method": "GET",
                "headers": headers,
                "timeoutMs": 10_000.0,
                "retries": 1.0,
                "retryDelayMs": 500.0,
                "responseType": "json",
            ]))
            guard let status = response["status"] as? Int,
                  (200..<400).contains(status),
                  let json = response["data"] as? [String: Any],
                  let rootData = json["data"] as? [String: Any],
                  let wbiImg = rootData["wbi_img"] as? [String: Any],
                  let imgUrl = wbiImg["img_url"] as? String,
                  let subUrl = wbiImg["sub_url"] as? String else {
                return nil
            }

            let key = PiliSigner.mixinKey(from: imgUrl, subUrl: subUrl)
            if !key.isEmpty {
                UserDefaults.standard.set(key, forKey: scopedKey(mixinKeyKey))
                UserDefaults.standard.set(
                    Date().timeIntervalSince1970,
                    forKey: scopedKey(mixinKeyFetchedAtKey)
                )
            }
            return key
        } catch {
            return nil
        }
    }

    private static func storedMixinKey() -> String? {
        let defaults = UserDefaults.standard
        guard let value = defaults.string(forKey: scopedKey(mixinKeyKey)) else {
            return nil
        }
        guard !value.isEmpty else {
            return nil
        }
        let fetchedAt = defaults.double(forKey: scopedKey(mixinKeyFetchedAtKey))
        guard fetchedAt > 0, Date().timeIntervalSince1970 - fetchedAt < 24 * 3600 else {
            return nil
        }
        return value
    }

    private static func updateState(
        latestId: String,
        items: [[String: Any]]
    ) -> (count: Int, success: Bool) {
        let defaults = UserDefaults.standard
        let lastSeenId = defaults.string(forKey: scopedKey(lastSeenIdKey))
        var count = 0

        if let lastSeenId {
            if latestId != lastSeenId {
                for item in items {
                    guard let id = item["id_str"] as? String else {
                        continue
                    }
                    if id == lastSeenId {
                        break
                    }
                    count += 1
                }
            }
        }

        defaults.set(latestId, forKey: scopedKey(latestIdKey))
        if lastSeenId == nil {
            defaults.set(latestId, forKey: scopedKey(lastSeenIdKey))
        }

        if count > 0 {
            let lastNotifiedId = defaults.string(forKey: scopedKey(lastNotifiedIdKey))
            if latestId != lastNotifiedId {
                defaults.set(latestId, forKey: scopedKey(lastNotifiedIdKey))
                presentNotification(count: count)
            }
        }
        return (count, true)
    }

    // MARK: - Notifications

    private static func requestNotificationAuthorizationIfNeeded() {
        guard UserDefaults.standard.integer(forKey: scopedKey(badgeModeKey)) != 0 else {
            return
        }
        let center = UNUserNotificationCenter.current()
        center.getNotificationSettings { settings in
            if settings.authorizationStatus == .notDetermined {
                center.requestAuthorization(options: [.alert, .badge, .sound]) { _, _ in }
            }
        }
    }

    private static func presentNotification(count: Int) {
        let badgeMode = UserDefaults.standard.integer(forKey: scopedKey(badgeModeKey))
        guard badgeMode != 0 else {
            return
        }
        let badgeNumber = badgeMode == 2 ? 1 : count
        DispatchQueue.main.async {
            UIApplication.shared.applicationIconBadgeNumber = badgeNumber
        }

        let center = UNUserNotificationCenter.current()
        center.getNotificationSettings { settings in
            guard settings.authorizationStatus == .authorized || settings.authorizationStatus == .provisional else {
                return
            }

            let content = UNMutableNotificationContent()
            content.title = "有新的动态"
            content.body = "你有 \(count) 条新动态"
            content.sound = .default
            content.badge = NSNumber(value: badgeNumber)

            let request = UNNotificationRequest(
                identifier: "piliplus.dynamic-check",
                content: content,
                trigger: nil
            )
            center.add(request)
        }
    }
}
