// Copyright 2026 PiliPlus. All rights reserved.

import ExpoModulesCore
import CommonCrypto
import CoreImage
import ImageIO
import Photos
import SDWebImage
import Security
import UIKit
import UserNotifications

public extension Notification.Name {
    static let piliPlusSleepTimerFired = Notification.Name("PiliPlus.SleepTimerFired")
}

public final class PiliNativeCoreModule: Module {
    private static let sleepDeadlineKey = "PiliPlus.sleepTimer.deadline"
    private static let sleepNotificationIdentifier = "piliplus.sleep-timer"
    private static let loginBuvidKey = "PiliPlus.login.buvid"
    private static var sleepNotificationToken = UUID()

    private let pollingTimer = PiliPollingTimer()
    private let qrPollingTimer = PiliPollingTimer()
    private let powerMonitor = PiliPowerMonitor()
    private var qrPollingAuthCode: String?
    private var qrPollingIntervalMs: Double = 2000
    private var qrLifecycleObservers: [NSObjectProtocol] = []
    private var sleepTimer: DispatchSourceTimer?

    public func definition() -> ModuleDefinition {
        Name("PiliNativeCore")

        qrLifecycleObservers.append(
            NotificationCenter.default.addObserver(
                forName: UIApplication.didEnterBackgroundNotification,
                object: nil,
                queue: .main
            ) { [weak self] _ in
                self?.qrPollingTimer.stop()
            }
        )
        qrLifecycleObservers.append(
            NotificationCenter.default.addObserver(
                forName: UIApplication.didBecomeActiveNotification,
                object: nil,
                queue: .main
            ) { [weak self] _ in
                guard let self, let authCode = self.qrPollingAuthCode else {
                    return
                }
                self.startQRCodePolling(
                    authCode: authCode,
                    intervalMs: self.qrPollingIntervalMs
                )
            }
        )

        Events(
            "onDynamicCheck",
            "onQRCodePoll",
            "onDownloadProgress",
            "onDownloadComplete",
            "onDownloadStateChange",
            "onSleepTimerFired",
            "onPowerStateChange"
        )

        PiliDownloadManager.shared.setEventSink { [weak self] name, payload in
            self?.sendEvent(name, payload)
        }
        powerMonitor.setOnChange { [weak self] name, payload in
            self?.sendEvent(name, payload)
        }

        AsyncFunction("isAvailableAsync") { () -> Bool in
            true
        }

        AsyncFunction("configureNetworkAsync") { (options: [String: Any]) in
            PiliNetwork.configure(options: options)
        }

        AsyncFunction("setSettingsSnapshotAsync") { (json: String) -> Bool in
            UserDefaults.standard.set(json, forKey: "PiliPlus.settings.snapshot")
            return true
        }

        AsyncFunction("getSettingsSnapshotAsync") { () -> String? in
            UserDefaults.standard.string(forKey: "PiliPlus.settings.snapshot")
        }

        AsyncFunction("setRecommendCacheAsync") { (json: String) -> Bool in
            UserDefaults.standard.set(json, forKey: "PiliPlus.recommend.cache")
            return true
        }

        AsyncFunction("getRecommendCacheAsync") { () -> String? in
            UserDefaults.standard.string(forKey: "PiliPlus.recommend.cache")
        }

        AsyncFunction("clearNetworkCachesAsync") { () -> Void in
            PiliNetwork.clearCaches()
        }

        AsyncFunction("setDownloadProgressEventsEnabledAsync") { (enabled: Bool) in
            PiliDownloadManager.shared.setDownloadProgressEventsEnabled(enabled)
        }

        Function("getBrightness") { () -> Double in
            UIScreen.main.brightness
        }

        Function("setBrightness") { (value: Double) in
            UIScreen.main.brightness = min(max(value, 0), 1)
        }

        AsyncFunction("startSleepTimerAsync") { (seconds: Double) in
            self.startSleepTimer(seconds: seconds)
        }

        AsyncFunction("cancelSleepTimerAsync") { () -> Void in
            self.cancelSleepTimer()
        }

        AsyncFunction("getSleepRemainingAsync") { () -> Double in
            self.getSleepRemaining()
        }

        AsyncFunction("signAppParamsAsync") { (params: [String: Any]) throws -> [String: Any] in
            PiliSigner.appSign(
                params: params,
                appkey: PiliSigner.APP_KEY,
                appsec: PiliSigner.APP_SEC
            )
        }

        AsyncFunction("wbiSignAsync") { (params: [String: Any], mixinKey: String) throws -> [String: Any] in
            PiliSigner.wbiSign(params: params, mixinKey: mixinKey)
        }

        AsyncFunction("ensureWbiMixinKeyAsync") { () async -> String in
            await PiliBackgroundTask.currentMixinKey() ?? ""
        }

        AsyncFunction("md5HexAsync") { (input: String) -> String in
            PiliSigner.md5Hex(input)
        }

        AsyncFunction("generateLoginBuvidAsync") { () -> String in
            Self.generateLoginBuvid()
        }

        AsyncFunction("getOrCreateLoginBuvidAsync") { () -> String in
            Self.getOrCreateLoginBuvid()
        }

        AsyncFunction("randomHexAsync") { (length: Int, upper: Bool) -> String in
            Self.randomHex(length: length, upper: upper)
        }

        AsyncFunction("randomAlnumAsync") { (length: Int) -> String in
            Self.randomAlnum(length: length)
        }

        AsyncFunction("randomBase64StringAsync") { (length: Int) -> String in
            Self.randomBase64String(length: length)
        }

        AsyncFunction("generateUploadIdAsync") { (prefix: String) -> String in
            let stamp = Int(Date().timeIntervalSince1970)
            let random = UUID().uuidString
                .replacingOccurrences(of: "-", with: "")
                .prefix(8)
            return "\(prefix)_\(stamp)_\(random)"
        }

        AsyncFunction("generateBuvid3Async") { () -> String in
            Self.generateBuvid3()
        }

        AsyncFunction("encryptLoginRSAAsync") { (plaintext: String, pemKey: String) throws -> String in
            try PiliSigner.rsaEncryptPKCS1(plaintext, pemPublicKey: pemKey)
        }

        AsyncFunction("nativeRequestAsync") { (options: [String: Any], body: Data) async throws -> [String: Any] in
            try await PiliNetwork.request(
                options: options,
                body: body.isEmpty ? nil : body
            )
        }

        AsyncFunction("nativeBinaryRequestAsync") { (options: [String: Any], body: Data) async throws -> Data in
            try await PiliNetwork.requestData(
                options: options,
                body: body.isEmpty ? nil : body
            )
        }

        AsyncFunction("nativeBinaryRequestWithHeadersAsync") { (options: [String: Any], body: Data) async throws -> [String: Any] in
            let (data, response) = try await PiliNetwork.requestDataWithResponse(
                options: options,
                body: body.isEmpty ? nil : body
            )
            return try PiliNetwork.makeBinaryResult(
                data: data,
                response: response,
                originalURL: (options["url"] as? String) ?? ""
            )
        }

        AsyncFunction("resolveShortLinkAsync") { (url: String) async -> String? in
            await PiliNetwork.resolveShortLink(urlString: url)
        }

        AsyncFunction("cancelRequestAsync") { (requestId: String) in
            PiliNetwork.cancelRequest(requestId: requestId)
        }

        AsyncFunction("uploadFileAsync") { (options: [String: Any]) async throws -> [String: Any] in
            try await PiliNetwork.upload(options: options)
        }

        AsyncFunction("saveImageToPhotosAsync") { (uri: String) async throws -> Bool in
            try await Self.saveImageToPhotos(uri: uri)
        }

        AsyncFunction("startDownloadAsync") { (url: String, destinationPath: String, title: String, pic: String, id: String?) throws -> String in
            try PiliDownloadManager.shared.startDownload(
                urlString: url,
                destinationPath: destinationPath,
                title: title,
                pic: pic,
                id: id
            )
        }

        AsyncFunction("fetchDownloadsAsync") { () -> [[String: Any]] in
            PiliDownloadManager.shared.fetchDownloads()
        }

        AsyncFunction("replaceDownloadRecordsAsync") { (records: [[String: Any]]) -> Bool in
            PiliDownloadManager.shared.replaceDownloadRecords(records)
            return true
        }

        AsyncFunction("removeDownloadRecordAsync") { (id: String) -> Bool in
            PiliDownloadManager.shared.removeDownloadRecord(id: id)
            return true
        }

        AsyncFunction("clearDownloadsAsync") { () -> Bool in
            PiliDownloadManager.shared.clearDownloads()
        }

        AsyncFunction("cancelDownloadAsync") { (id: String) -> Bool in
            PiliDownloadManager.shared.cancelDownload(id: id)
        }

        AsyncFunction("fetchPendingCompletionsAsync") { () -> [[String: Any]] in
            PiliDownloadManager.shared.fetchPendingCompletions()
        }

        AsyncFunction("ackDownloadCompletionAsync") { (id: String) in
            PiliDownloadManager.shared.ackDownloadCompletion(id: id)
        }

        AsyncFunction("nativeGetCookiesDetailedAsync") { (domain: String) -> [[String: Any]] in
            PiliNetwork.getCookiesDetailed(domain: domain)
        }

        AsyncFunction("nativeSetCookiesAsync") { (cookies: [[String: Any]]) -> Bool in
            PiliNetwork.setCookiesAsync(cookies)
        }

        AsyncFunction("nativeClearCookiesAsync") { () -> Bool in
            PiliNetwork.clearCookies()
        }

        AsyncFunction("nativeGetStringAsync") { (key: String) -> String? in
            UserDefaults.standard.string(forKey: key)
        }

        AsyncFunction("nativeSetStringAsync") { (key: String, value: String) -> Bool in
            UserDefaults.standard.set(value, forKey: key)
            return true
        }

        AsyncFunction("nativeRemoveStringAsync") { (key: String) -> Bool in
            UserDefaults.standard.removeObject(forKey: key)
            return true
        }

        AsyncFunction("nativeGetKeysByPrefixAsync") { (prefix: String) -> [String] in
            UserDefaults.standard.dictionaryRepresentation().keys
                .filter { $0.hasPrefix(prefix) }
                .sorted()
        }

        AsyncFunction("getCacheSizeBytesAsync") { () -> Double in
            Double(Self.directorySize(Self.cacheDirectoryURL()))
        }

        AsyncFunction("clearCacheFilesAsync") { () -> Bool in
            Self.clearCacheDirectory()
        }

        AsyncFunction("getDocumentsDirectoryPathAsync") { () -> String in
            Self.documentsDirectoryURL().path
        }

        AsyncFunction("writeTextFileAsync") { (path: String, content: String) -> Bool in
            let url = URL(fileURLWithPath: path)
            try? FileManager.default.createDirectory(
                at: url.deletingLastPathComponent(),
                withIntermediateDirectories: true
            )
            do {
                try content.write(to: url, atomically: true, encoding: .utf8)
                return true
            } catch {
                return false
            }
        }

        AsyncFunction("readTextFileAsync") { (path: String) -> String? in
            try? String(contentsOf: URL(fileURLWithPath: path), encoding: .utf8)
        }

        AsyncFunction("getAccountRecordsAsync") { () -> [String: Any]? in
            Self.readAccountStore()
        }

        AsyncFunction("setAccountRecordsAsync") { (records: [[String: Any]], currentIndex: Int, anonymousMode: Bool) -> Bool in
            Self.writeAccountStore(
                records: records,
                currentIndex: currentIndex,
                anonymousMode: anonymousMode
            )
        }

        AsyncFunction("setActiveAccountAsync") { (key: String, records: [[String: Any]], currentIndex: Int, anonymousMode: Bool, cookies: [[String: Any]]) -> Bool in
            Self.setActiveAccount(
                key: key,
                records: records,
                currentIndex: currentIndex,
                anonymousMode: anonymousMode,
                cookies: cookies
            )
        }

        AsyncFunction("clearAccountRecordsAsync") { () -> Bool in
            Self.deleteAccountStore()
        }

        AsyncFunction("copyTextAsync") { (text: String) -> Bool in
            UIPasteboard.general.string = text
            return true
        }

        AsyncFunction("readClipboardAsync") { () -> String? in
            UIPasteboard.general.string
        }

        AsyncFunction("shareTextAsync") { (text: String) async -> Bool in
            await Self.presentShare(items: [text])
        }

        AsyncFunction("shareFileAsync") { (uri: String) async -> Bool in
            guard !uri.isEmpty, let url = URL(string: uri), url.isFileURL else {
                return false
            }
            return await Self.presentShare(items: [url])
        }

        AsyncFunction("createQRCodeAsync") { (text: String, size: Int) -> String in
            guard !text.isEmpty else { return "" }
            guard let filter = CIFilter(name: "CIQRCodeGenerator") else { return "" }
            filter.setValue(Data(text.utf8), forKey: "inputMessage")
            filter.setValue("M", forKey: "inputCorrectionLevel")
            guard let output = filter.outputImage else { return "" }
            let scale = CGFloat(max(size, 1)) / max(output.extent.width, 1)
            let scaled = output.transformed(by: CGAffineTransform(scaleX: scale, y: scale))
            let context = CIContext()
            guard let cgImage = context.createCGImage(scaled, from: scaled.extent) else { return "" }
            let png = UIImage(cgImage: cgImage).pngData() ?? Data()
            return "data:image/png;base64," + png.base64EncodedString()
        }

        AsyncFunction("registerBackgroundDynamicCheckAsync") { (options: [String: Any]) -> Bool in
            PiliBackgroundTask.registerDynamicCheck(options: options)
        }

        AsyncFunction("unregisterBackgroundDynamicCheckAsync") { () -> Bool in
            PiliBackgroundTask.unregisterDynamicCheck()
        }

        AsyncFunction("resetDynamicAccountAsync") { () -> Bool in
            PiliBackgroundTask.resetDynamicAccount()
        }

        AsyncFunction("clearDynamicNotificationsAsync") { () -> Void in
            PiliBackgroundTask.clearDynamicNotifications()
        }

        AsyncFunction("setDynamicBadgeCountAsync") { (count: Int) -> Bool in
            PiliBackgroundTask.setBadgeCount(count)
        }

        AsyncFunction("markDynamicReadAsync") { () -> Bool in
            PiliBackgroundTask.markDynamicRead()
        }

        AsyncFunction("showToastAsync") { (message: String, durationMs: Double, announce: Bool?) -> Bool in
            PiliToastOverlay.shared.show(
                message: message,
                durationMs: durationMs,
                announce: announce ?? false
            )
            return true
        }

        AsyncFunction("getLogsAsync") { (limit: Double) -> [String] in
            PiliLogStore.shared.entries(limit: Int(limit))
        }

        AsyncFunction("clearLogsAsync") { () -> Void in
            PiliLogStore.shared.clear()
        }

        AsyncFunction("getPowerStateAsync") { () -> [String: Any] in
            self.powerMonitor.current
        }

        AsyncFunction("presentTextInputAsync") { (title: String, message: String?, initialValue: String?) async throws -> String? in
            try await withCheckedThrowingContinuation { continuation in
                DispatchQueue.main.async {
                    guard let root = Self.topViewController() else {
                        continuation.resume(returning: nil)
                        return
                    }
                    let alert = UIAlertController(title: title, message: message, preferredStyle: .alert)
                    alert.addTextField { textField in
                        textField.text = initialValue ?? ""
                        textField.autocorrectionType = .no
                    }
                    alert.addAction(UIAlertAction(title: "取消", style: .cancel) { _ in
                        continuation.resume(returning: nil)
                    })
                    alert.addAction(UIAlertAction(title: "确定", style: .default) { _ in
                        continuation.resume(returning: alert.textFields?.first?.text ?? "")
                    })
                    root.present(alert, animated: true)
                }
            }
        }

        AsyncFunction("startDynamicPollingAsync") { (intervalMs: Double) in
            self.startDynamicPolling(intervalMs: intervalMs)
        }

        AsyncFunction("startQRCodePollingAsync") { (authCode: String, intervalMs: Double) in
            self.startQRCodePolling(authCode: authCode, intervalMs: intervalMs)
        }

        AsyncFunction("stopQRCodePollingAsync") { () async -> Void in
            self.stopQRCodePolling()
        }

        AsyncFunction("stopDynamicPollingAsync") {
            self.stopDynamicPolling()
        }

        OnDestroy {
            for observer in self.qrLifecycleObservers {
                NotificationCenter.default.removeObserver(observer)
            }
            self.qrLifecycleObservers.removeAll()
            self.stopDynamicPolling()
            self.stopQRCodePolling()
            self.cancelSleepTimer()
        }

        View(PiliImageViewer.self) {
            Events("onClose", "onIndexChange")

            Prop("images") { (view: PiliImageViewer, images: [String]) in
                view.setImages(images)
            }

            Prop("initialIndex") { (view: PiliImageViewer, index: Int) in
                view.setInitialIndex(index)
            }

            Prop("visible") { (view: PiliImageViewer, visible: Bool) in
                view.setVisible(visible)
            }

            Prop("contextMenuEnabled") { (view: PiliImageViewer, enabled: Bool?) in
                view.setContextMenuEnabled(enabled ?? true)
            }
        }
    }

    private func startDynamicPolling(intervalMs: Double) {
        pollingTimer.startAsync(intervalMs: intervalMs) { [weak self] _ in
            guard let self else {
                return
            }
            let result = await PiliBackgroundTask.performDynamicCheckOnce()
            guard !Task.isCancelled else {
                return
            }
            self.sendEvent("onDynamicCheck", result)
        }
    }

    private func stopDynamicPolling() {
        pollingTimer.stop()
    }

    private func startQRCodePolling(authCode: String, intervalMs: Double) {
        stopQRCodePolling()
        qrPollingAuthCode = authCode
        qrPollingIntervalMs = max(1000, intervalMs)
        qrPollingTimer.startAsync(intervalMs: intervalMs) { [weak self] _ in
            guard let self, let authCode = self.qrPollingAuthCode else {
                return
            }
            await self.pollQRCode(authCode: authCode)
        }
    }

    private func stopQRCodePolling() {
        qrPollingAuthCode = nil
        qrPollingTimer.stop()
    }

    private static func topViewController() -> UIViewController? {
        let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
        let window = scenes.flatMap { $0.windows }.first { $0.isKeyWindow }
        var top = window?.rootViewController
        while let presented = top?.presentedViewController {
            top = presented
        }
        return top
    }

    private func startSleepTimer(seconds: Double) {
        cancelSleepTimer()
        guard seconds > 0 else {
            return
        }
        UserDefaults.standard.set(
            Date().timeIntervalSince1970 + seconds,
            forKey: Self.sleepDeadlineKey
        )
        Self.sleepNotificationToken = UUID()
        Self.scheduleSleepNotification(in: seconds, token: Self.sleepNotificationToken)
        let timer = DispatchSource.makeTimerSource(queue: DispatchQueue.global(qos: .utility))
        timer.schedule(deadline: .now() + seconds, leeway: .seconds(1))
        timer.setEventHandler { [weak self] in
            DispatchQueue.main.async {
                NotificationCenter.default.post(name: .piliPlusSleepTimerFired, object: nil)
                self?.sendEvent("onSleepTimerFired", ["seconds": seconds])
                UserDefaults.standard.removeObject(forKey: Self.sleepDeadlineKey)
                Self.cancelSleepNotification()
            }
        }
        timer.resume()
        sleepTimer = timer
    }

    private func cancelSleepTimer() {
        sleepTimer?.cancel()
        sleepTimer = nil
        Self.sleepNotificationToken = UUID()
        UserDefaults.standard.removeObject(forKey: Self.sleepDeadlineKey)
        Self.cancelSleepNotification()
    }

    private func getSleepRemaining() -> Double {
        let deadline = UserDefaults.standard.double(forKey: Self.sleepDeadlineKey)
        guard deadline > 0 else {
            return 0
        }
        let remaining = deadline - Date().timeIntervalSince1970
        if remaining <= 0 {
            UserDefaults.standard.removeObject(forKey: Self.sleepDeadlineKey)
            Self.cancelSleepNotification()
            return 0
        }
        return remaining
    }

    private static func scheduleSleepNotification(in seconds: Double, token: UUID) {
        let center = UNUserNotificationCenter.current()
        center.getNotificationSettings { settings in
            switch settings.authorizationStatus {
            case .notDetermined:
                center.requestAuthorization(options: [.alert, .sound]) { granted, _ in
                    guard granted, Self.sleepNotificationToken == token else { return }
                    addSleepNotification(in: seconds, token: token)
                }
            case .authorized, .provisional:
                addSleepNotification(in: seconds, token: token)
            default:
                break
            }
        }
    }

    private static func addSleepNotification(in seconds: Double, token: UUID) {
        guard Self.sleepNotificationToken == token else {
            return
        }
        let deadline = UserDefaults.standard.double(forKey: sleepDeadlineKey)
        guard deadline > Date().timeIntervalSince1970 else {
            return
        }
        let content = UNMutableNotificationContent()
        content.title = "定时关闭"
        content.body = "播放已到定时关闭时间"
        content.sound = .default
        let trigger = UNTimeIntervalNotificationTrigger(
            timeInterval: max(0.1, seconds),
            repeats: false
        )
        let request = UNNotificationRequest(
            identifier: sleepNotificationIdentifier,
            content: content,
            trigger: trigger
        )
        UNUserNotificationCenter.current().add(request)
    }

    private static func cancelSleepNotification() {
        UNUserNotificationCenter.current().removePendingNotificationRequests(
            withIdentifiers: [sleepNotificationIdentifier]
        )
    }

    private func pollQRCode(authCode: String) async {
        guard !Task.isCancelled else {
            return
        }
        let signed = PiliSigner.appSign(params: [
            "auth_code": authCode,
            "local_id": "Yk5WQz00",
        ])
        let query = PiliSigner.appQuery(from: signed)
        let urlString = "https://passport.bilibili.com/x/passport-tv-login/qrcode/poll?\(query)"

        do {
            let result = try await PiliNetwork.request(options: [
                "url": urlString,
                "method": "POST",
                "headers": ["Accept-Encoding": "gzip, deflate"],
                "timeoutMs": 10_000.0,
                "responseType": "json",
            ])
            guard !Task.isCancelled else {
                return
            }
            guard let json = result["data"] as? [String: Any] else {
                dispatchQRCodePoll(["code": -1, "message": "Invalid QR poll response"])
                return
            }
            dispatchQRCodePoll(json)
        } catch {
            guard !Task.isCancelled else {
                return
            }
            dispatchQRCodePoll(["code": -1, "message": error.localizedDescription])
        }
    }

    private func dispatchQRCodePoll(_ payload: [String: Any]) {
        DispatchQueue.main.async { [weak self] in
            self?.sendEvent("onQRCodePoll", payload)
        }
    }

    static func saveImageToPhotos(uri: String) async throws -> Bool {
        guard !uri.isEmpty, let sourceURL = URL(string: uri) else {
            throw NSError(
                domain: "PiliNativeCore",
                code: 1,
                userInfo: [NSLocalizedDescriptionKey: "Invalid image URI"]
            )
        }

        var tempDownloadedURL: URL?
        var convertedURL: URL?
        let fileURL: URL
        if sourceURL.isFileURL {
            let tempDir = FileManager.default.temporaryDirectory.path
            if sourceURL.path.hasPrefix(tempDir + "/"),
               sourceURL.lastPathComponent.hasPrefix("pili-screenshot-") {
                tempDownloadedURL = sourceURL
            }
            fileURL = sourceURL
        } else {
            if let cachedData = Self.cachedImageData(for: sourceURL.absoluteString) {
                let ext = Self.imageExtension(for: cachedData)
                let tempURL = FileManager.default.temporaryDirectory
                    .appendingPathComponent("pili-photo-\(UUID().uuidString).\(ext)")
                try cachedData.write(to: tempURL)
                tempDownloadedURL = tempURL
                fileURL = tempURL
            } else {
                let session = PiliNetwork.session(
                    for: PiliNetwork.mergedOptions([:])
                )
                let ext = sourceURL.pathExtension.isEmpty ? "jpg" : sourceURL.pathExtension
                let tempURL = FileManager.default.temporaryDirectory
                    .appendingPathComponent("pili-photo-\(UUID().uuidString).\(ext)")
                let (downloadURL, response) = try await session.download(from: sourceURL)
                guard let http = response as? HTTPURLResponse, (200..<400).contains(http.statusCode) else {
                    throw NSError(
                        domain: "PiliNativeCore",
                        code: 2,
                        userInfo: [NSLocalizedDescriptionKey: "Image download failed"]
                    )
                }
                if FileManager.default.fileExists(atPath: tempURL.path) {
                    try FileManager.default.removeItem(at: tempURL)
                }
                try FileManager.default.moveItem(at: downloadURL, to: tempURL)
                tempDownloadedURL = tempURL
                fileURL = tempURL
            }
        }

        defer {
            if let tempDownloadedURL {
                try? FileManager.default.removeItem(at: tempDownloadedURL)
            }
            if let convertedURL {
                try? FileManager.default.removeItem(at: convertedURL)
            }
        }
        guard FileManager.default.fileExists(atPath: fileURL.path) else {
            throw NSError(
                domain: "PiliNativeCore",
                code: 3,
                userInfo: [NSLocalizedDescriptionKey: "Image file is missing"]
            )
        }

        if !isPhotoLibrarySafeExtension(fileURL.pathExtension) {
            convertedURL = try convertImageToJPEGIfNeeded(fileURL)
        }
        let saveURL = convertedURL ?? fileURL

        let status: PHAuthorizationStatus = await withCheckedContinuation { continuation in
            PHPhotoLibrary.requestAuthorization(for: .addOnly) { status in
                continuation.resume(returning: status)
            }
        }
        guard status == .authorized || status == .limited else {
            throw NSError(
                domain: "PiliNativeCore",
                code: 4,
                userInfo: [NSLocalizedDescriptionKey: "Photo library permission denied"]
            )
        }

        return try await withCheckedThrowingContinuation { continuation in
            PHPhotoLibrary.shared().performChanges {
                let request = PHAssetCreationRequest.forAsset()
                request.addResource(with: .photo, fileURL: saveURL, options: nil)
            } completionHandler: { success, error in
                if success {
                    continuation.resume(returning: true)
                } else {
                    continuation.resume(throwing: error ?? NSError(
                        domain: "PiliNativeCore",
                        code: 5,
                        userInfo: [NSLocalizedDescriptionKey: "Photo save failed"]
                    ))
                }
            }
        }
    }

    private static func cachedImageData(for key: String) -> Data? {
        SDImageCache.shared.diskImageData(forKey: key)
    }

    private static func imageExtension(for data: Data) -> String {
        guard data.count >= 12 else {
            return "jpg"
        }
        let bytes = [UInt8](data.prefix(12))
        if bytes[0] == 0xFF, bytes[1] == 0xD8, bytes[2] == 0xFF {
            return "jpg"
        }
        if bytes[0] == 0x89, bytes[1] == 0x50, bytes[2] == 0x4E, bytes[3] == 0x47 {
            return "png"
        }
        if bytes[0] == 0x52, bytes[1] == 0x49, bytes[2] == 0x46, bytes[3] == 0x46,
           bytes[8] == 0x57, bytes[9] == 0x45, bytes[10] == 0x42, bytes[11] == 0x50 {
            return "webp"
        }
        if bytes[4] == 0x66, bytes[5] == 0x74, bytes[6] == 0x79, bytes[7] == 0x70 {
            return "heic"
        }
        return "jpg"
    }

    private static func isPhotoLibrarySafeExtension(_ ext: String) -> Bool {
        switch ext.lowercased() {
        case "jpg", "jpeg", "png", "heic", "heif", "tif", "tiff":
            return true
        default:
            return false
        }
    }

    private static func convertImageToJPEGIfNeeded(_ url: URL) throws -> URL? {
        guard let source = CGImageSourceCreateWithURL(url as CFURL, nil),
              let image = CGImageSourceCreateImageAtIndex(source, 0, nil) else {
            return nil
        }
        let output = FileManager.default.temporaryDirectory
            .appendingPathComponent("pili-photo-jpeg-\(UUID().uuidString).jpg")
        guard let destination = CGImageDestinationCreateWithURL(
            output as CFURL,
            "public.jpeg" as CFString,
            1,
            nil
        ) else {
            return nil
        }
        CGImageDestinationAddImage(destination, image, nil)
        guard CGImageDestinationFinalize(destination) else {
            return nil
        }
        return output
    }

    private static func generateLoginBuvid() -> String {
        var bytes = [UInt8](repeating: 0, count: 16)
        guard SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes) == errSecSuccess else {
            return ""
        }
        let digest = PiliSigner.md5Hex(data: Data(bytes))
        return "XY\(digest[digest.index(digest.startIndex, offsetBy: 2)])\(digest[digest.index(digest.startIndex, offsetBy: 12)])\(digest[digest.index(digest.startIndex, offsetBy: 22)])\(digest)"
    }

    private static func getOrCreateLoginBuvid() -> String {
        if let saved = UserDefaults.standard.string(forKey: loginBuvidKey), !saved.isEmpty {
            return saved
        }
        let buvid = generateLoginBuvid()
        if !buvid.isEmpty {
            UserDefaults.standard.set(buvid, forKey: loginBuvidKey)
        }
        return buvid
    }

    private static func randomBytes(_ count: Int) -> [UInt8] {
        for _ in 0..<3 {
            var bytes = [UInt8](repeating: 0, count: count)
            if SecRandomCopyBytes(kSecRandomDefault, count, &bytes) == errSecSuccess {
                return bytes
            }
        }
        return []
    }

    private static func randomHex(length: Int, upper: Bool) -> String {
        let bytes = randomBytes(max(0, length))
        let format = upper ? "%02X" : "%02x"
        return bytes.map { String(format: format, $0) }.joined().prefix(max(0, length)).description
    }

    private static func randomAlnum(length: Int) -> String {
        let chars = Array("abcdefghijklmnopqrstuvwxyz0123456789")
        let count = max(0, length)
        var result = ""
        result.reserveCapacity(count)
        while result.count < count {
            let bytes = randomBytes(max(1, count - result.count))
            guard !bytes.isEmpty else { break }
            for byte in bytes {
                if result.count >= count { break }
                // 256 bytes 不是 36 的整数倍，拒绝尾部采样消除模偏差。
                if byte < 252 {
                    result.append(chars[Int(byte) % chars.count])
                }
            }
        }
        return result
    }

    private static func randomBase64String(length: Int) -> String {
        let alphabet = Array("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/")
        let bytes = randomBytes(max(0, length))
        return bytes.map { String(alphabet[Int($0) % alphabet.count]) }.joined()
    }

    private static func generateBuvid3() -> String {
        let uuid = UUID().uuidString.uppercased()
        var digits = ""
        while digits.count < 5 {
            let bytes = randomBytes(5 - digits.count)
            guard !bytes.isEmpty else { break }
            for byte in bytes {
                if digits.count >= 5 { break }
                // 250 = 25 * 10，拒绝尾部采样消除模偏差。
                if byte < 250 {
                    digits.append(String(Int(byte) % 10))
                }
            }
        }
        return uuid + digits + "infoc"
    }

    // MARK: - Account records (Keychain)

    private static let accountStoreService = "com.piliplus.app.accounts"
    private static let accountStoreAccount = "PiliPlus.accountStore"

    private static func accountStoreQuery() -> [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: accountStoreService,
            kSecAttrAccount as String: accountStoreAccount,
        ]
    }

    private static func readAccountStore() -> [String: Any]? {
        var query = accountStoreQuery()
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne
        var item: CFTypeRef?
        guard SecItemCopyMatching(query as CFDictionary, &item) == errSecSuccess,
              let data = item as? Data,
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            return nil
        }
        return json
    }

    private static func writeAccountStore(
        records: [[String: Any]],
        currentIndex: Int,
        anonymousMode: Bool
    ) -> Bool {
        guard currentIndex >= 0, currentIndex < records.count else {
            return false
        }
        let activeAccessKey = records[currentIndex]["accessKey"] as? String ?? ""
        return saveAccountStore([
            "records": records,
            "currentIndex": currentIndex,
            "anonymousMode": anonymousMode,
            "activeAccessKey": activeAccessKey,
        ])
    }

    private static func saveAccountStore(_ store: [String: Any]) -> Bool {
        guard JSONSerialization.isValidJSONObject(store),
              let data = try? JSONSerialization.data(withJSONObject: store) else {
            return false
        }
        let query = accountStoreQuery()
        let status = SecItemCopyMatching(query as CFDictionary, nil)
        if status == errSecItemNotFound {
            var attributes = query
            attributes[kSecValueData as String] = data
            return SecItemAdd(attributes as CFDictionary, nil) == errSecSuccess
        }
        guard status == errSecSuccess else {
            return false
        }
        let update: [String: Any] = [kSecValueData as String: data]
        return SecItemUpdate(query as CFDictionary, update as CFDictionary) == errSecSuccess
    }

    private static func deleteAccountStore() -> Bool {
        let status = SecItemDelete(accountStoreQuery() as CFDictionary)
        return status == errSecSuccess || status == errSecItemNotFound
    }

    private static func setActiveAccount(
        key: String,
        records: [[String: Any]],
        currentIndex: Int,
        anonymousMode: Bool,
        cookies: [[String: Any]]
    ) -> Bool {
        guard currentIndex >= 0, currentIndex < records.count,
              let activeKey = records[currentIndex]["accessKey"] as? String,
              !activeKey.isEmpty,
              activeKey == key else {
            return false
        }
        let previousStore = readAccountStore()
        let previousCookies = PiliNetwork.getCookiesDetailed(domain: "")
        let store: [String: Any] = [
            "records": records,
            "currentIndex": currentIndex,
            "anonymousMode": anonymousMode,
            "activeAccessKey": key,
        ]
        guard saveAccountStore(store) else {
            return false
        }

        PiliNetwork.clearCookies()
        guard PiliNetwork.setCookiesAsync(cookies) else {
            // 事务回滚：先恢复 Keychain 账号记录，再恢复原 cookie 快照。
            if let previousStore {
                _ = saveAccountStore(previousStore)
            } else {
                _ = deleteAccountStore()
            }
            PiliNetwork.clearCookies()
            _ = PiliNetwork.setCookiesAsync(previousCookies)
            return false
        }
        return true
    }

    // MARK: - File helpers

    private static func cacheDirectoryURL() -> URL {
        FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask).first
            ?? FileManager.default.temporaryDirectory
    }

    private static func documentsDirectoryURL() -> URL {
        FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first
            ?? FileManager.default.temporaryDirectory
    }

    private static func directorySize(_ url: URL) -> Int64 {
        let resourceKeys: Set<URLResourceKey> = [.isRegularFileKey, .fileSizeKey]
        let enumerator = FileManager.default.enumerator(
            at: url,
            includingPropertiesForKeys: Array(resourceKeys),
            options: [.skipsHiddenFiles],
            errorHandler: nil
        )
        var total: Int64 = 0
        while let fileURL = enumerator?.nextObject() as? URL {
            guard let values = try? fileURL.resourceValues(forKeys: resourceKeys),
                  values.isRegularFile == true,
                  let size = values.fileSize else {
                continue
            }
            total += Int64(size)
        }
        return total
    }

    private static func clearCacheDirectory() -> Bool {
        let cache = cacheDirectoryURL()
        let contents = (
            try? FileManager.default.contentsOfDirectory(
                at: cache,
                includingPropertiesForKeys: nil,
                options: [.skipsHiddenFiles]
            )
        ) ?? []
        var ok = true
        for item in contents {
            do {
                try FileManager.default.removeItem(at: item)
            } catch {
                ok = false
            }
        }
        return ok
    }

    // MARK: - Share sheet

    private static func presentShare(items: [Any]) async -> Bool {
        await withCheckedContinuation { continuation in
            DispatchQueue.main.async {
                guard let root = Self.topViewController() else {
                    continuation.resume(returning: false)
                    return
                }
                let controller = UIActivityViewController(
                    activityItems: items,
                    applicationActivities: nil
                )
                if let popover = controller.popoverPresentationController {
                    popover.sourceView = root.view
                    popover.sourceRect = CGRect(
                        x: root.view.bounds.midX,
                        y: root.view.bounds.midY,
                        width: 0,
                        height: 0
                    )
                    popover.permittedArrowDirections = []
                }
                controller.completionWithItemsHandler = { _, completed, _, _ in
                    continuation.resume(returning: completed)
                }
                root.present(controller, animated: true)
            }
        }
    }
}
