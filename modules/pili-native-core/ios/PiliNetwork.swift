// Copyright 2026 PiliPlus. All rights reserved.

import CFNetwork
import Foundation

enum PiliNetworkError: LocalizedError {
    case invalidURL
    case invalidFile
    case readFile(String)
    case transport(String)
    case insufficientStorage

    var errorDescription: String? {
        switch self {
        case .invalidURL:
            return "Invalid native request URL"
        case .invalidFile:
            return "Invalid native upload file URI"
        case .readFile(let message):
            return "Native upload file read failed: \(message)"
        case .transport(let message):
            return "Native request failed: \(message)"
        case .insufficientStorage:
            return "Not enough local storage for download"
        }
    }
}

public enum PiliNetwork {
    private static let configDefaultsKey = "PiliPlus.network.config"
    private static let sessionLock = NSLock()
    private static var sessions: [String: URLSession] = [:]
    private static var activeTasks: [String: URLSessionTask] = [:]
    private static var canceledRequestIds: Set<String> = []
    private static var sharedOptions: [String: Any] = [:]
    private static let sensitiveQueryKeys: Set<String> = [
        "access_key", "csrf", "csrf_token", "bili_jct", "auth_code", "SESSDATA"
    ]
    // 01-M4（P2）：API URLCache 内存段从 16MB 降到 6MB。API JSON 响应多为
    // 几十 KB 级，16MB 内存驻留收益低；磁盘段保留（piliplus-api-cache）。
    private static let apiCacheMemoryCapacity = 6 * 1024 * 1024
    private static let apiCache = URLCache(
        memoryCapacity: apiCacheMemoryCapacity,
        diskCapacity: 64 * 1024 * 1024,
        diskPath: "piliplus-api-cache"
    )

    public static func configure(options: [String: Any]) {
        let previous = sharedOptions
        sharedOptions = options
        let maxCacheSizeMB = max(8, (options["maxCacheSize"] as? Double) ?? 64)
        // 01-M4（P2）：与 apiCache 声明保持一致，configure 不再把内存段抬回 16MB。
        apiCache.memoryCapacity = apiCacheMemoryCapacity
        apiCache.diskCapacity = Int(maxCacheSizeMB * 1024 * 1024)
        if let data = try? JSONSerialization.data(withJSONObject: options),
           let json = String(data: data, encoding: .utf8) {
            UserDefaults.standard.set(json, forKey: configDefaultsKey)
        }
        if sessionAffectingOptionsChanged(previous, options) {
            sessionLock.lock()
            sessions.removeAll()
            sessionLock.unlock()
            PiliDownloadManager.shared.reloadSessionIfNeeded()
        }
    }

    private static func sessionAffectingOptionsChanged(
        _ previous: [String: Any],
        _ next: [String: Any]
    ) -> Bool {
        let keys = [
            "useSystemProxy",
            "proxyHost",
            "proxyPort",
            "enableHttp2",
            "badCertificateCallback",
        ]
        for key in keys {
            let old = previous[key] as? Double ?? (previous[key] as? Bool).map { $0 ? 1 : 0 } ?? 0
            let new = next[key] as? Double ?? (next[key] as? Bool).map { $0 ? 1 : 0 } ?? 0
            if old != new {
                return true
            }
        }
        let oldProxy = previous["proxyHost"] as? String
        let newProxy = next["proxyHost"] as? String
        if oldProxy != newProxy {
            return true
        }
        return false
    }

    public static func mergedOptions(_ options: [String: Any]) -> [String: Any] {
        loadStoredOptionsIfNeeded()
        var merged = sharedOptions
        merged.merge(options) { _, new in new }
        return merged
    }

    public static func clearCaches() {
        sessionLock.lock()
        let activeSessions = Array(sessions.values)
        sessionLock.unlock()
        for session in activeSessions {
            session.configuration.urlCache?.removeAllCachedResponses()
        }
        apiCache.removeAllCachedResponses()
        URLCache.shared.removeAllCachedResponses()
    }

    public static func cancelRequest(requestId: String) {
        guard !requestId.isEmpty else {
            return
        }
        sessionLock.lock()
        canceledRequestIds.insert(requestId)
        let task = activeTasks.removeValue(forKey: requestId)
        sessionLock.unlock()
        task?.cancel()
    }

    private static func isCanceled(_ requestId: String?) -> Bool {
        guard let requestId, !requestId.isEmpty else {
            return false
        }
        sessionLock.lock()
        let canceled = canceledRequestIds.contains(requestId)
        sessionLock.unlock()
        return canceled
    }

    private static func clearCanceled(_ requestId: String?) {
        guard let requestId, !requestId.isEmpty else {
            return
        }
        sessionLock.lock()
        canceledRequestIds.remove(requestId)
        sessionLock.unlock()
    }

    public static func session(for options: [String: Any]) -> URLSession {
        loadStoredOptionsIfNeeded()
        return makeSession(for: options)
    }

    private static func loadStoredOptionsIfNeeded() {
        guard sharedOptions.isEmpty,
              let json = UserDefaults.standard.string(forKey: configDefaultsKey),
              let data = json.data(using: .utf8),
              let stored = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            return
        }
        sharedOptions = stored
    }

    // MARK: - Request

    static func request(
        options: [String: Any],
        body: Data? = nil
    ) async throws -> [String: Any] {
        let merged = mergedOptions(options)
        let (requestOptions, requestId) = cancellableRequestId(merged)
        guard let urlString = requestOptions["url"] as? String else {
            throw PiliNetworkError.invalidURL
        }
        let responseType = (requestOptions["responseType"] as? String) ?? "text"
        return try await withTaskCancellationHandler {
            let (data, response) = try await performRequest(options: requestOptions, body: body)
            return try makeResult(
                data: data,
                response: response,
                originalURL: urlString,
                responseType: responseType
            )
        } onCancel: {
            cancelRequest(requestId: requestId)
        }
    }

    /// 二进制请求：与 request 共用同一套配置/重试逻辑，但直接返回 Data。
    static func requestData(
        options: [String: Any],
        body: Data? = nil
    ) async throws -> Data {
        let merged = mergedOptions(options)
        let (requestOptions, requestId) = cancellableRequestId(merged)
        return try await withTaskCancellationHandler {
            let (data, _) = try await performRequest(options: requestOptions, body: body)
            return data
        } onCancel: {
            cancelRequest(requestId: requestId)
        }
    }

    /// 二进制响应 + 响应头：gRPC 等需要读取 grpc-status 的场景使用。
    static func requestDataWithResponse(
        options: [String: Any],
        body: Data? = nil
    ) async throws -> (data: Data, response: HTTPURLResponse) {
        let merged = mergedOptions(options)
        let (requestOptions, requestId) = cancellableRequestId(merged)
        return try await withTaskCancellationHandler {
            try await performRequest(options: requestOptions, body: body)
        } onCancel: {
            cancelRequest(requestId: requestId)
        }
    }

    private static func cancellableRequestId(
        _ options: [String: Any]
    ) -> ([String: Any], String) {
        if let existing = options["requestId"] as? String, !existing.isEmpty {
            return (options, existing)
        }
        var next = options
        let requestId = "auto-\(UUID().uuidString)"
        next["requestId"] = requestId
        return (next, requestId)
    }

    private static func performRequest(
        options: [String: Any],
        body: Data? = nil
    ) async throws -> (data: Data, response: HTTPURLResponse) {
        guard let urlString = options["url"] as? String,
              let url = URL(string: urlString) else {
            throw PiliNetworkError.invalidURL
        }

        let method = ((options["method"] as? String) ?? "GET").uppercased()
        let headers = (options["headers"] as? [String: String]) ?? [:]
        let bodyString = options["body"] as? String
        let timeoutMs = (options["timeoutMs"] as? Double) ?? 10_000
        let requestedRetries = max(0, Int((options["retries"] as? Double) ?? 0))
        let retries: Int
        if ["GET", "HEAD", "OPTIONS"].contains(method) {
            retries = requestedRetries
        } else {
            // 写请求不是幂等操作，失败时不自动重试，避免重复发弹幕/投币/点赞。
            retries = 0
        }
        let retryDelayMs = (options["retryDelayMs"] as? Double) ?? 0
        let skipCookies = (options["skipCookies"] as? Bool) ?? false
        let requestId = options["requestId"] as? String
        if isCanceled(requestId) {
            throw CancellationError()
        }
        defer {
            clearCanceled(requestId)
        }

        var effectiveHeaders = headers
        let hasCookieHeader = effectiveHeaders.keys.contains { $0.lowercased() == "cookie" }
        if hasCookieHeader {
            effectiveHeaders = effectiveHeaders.filter { $0.key.lowercased() != "cookie" }
        }

        let session = makeSession(for: options)

        var request = URLRequest(url: url)
        request.httpMethod = method
        request.httpShouldHandleCookies = !skipCookies
        request.timeoutInterval = timeoutMs > 0 ? timeoutMs / 1000 : 30
        if let body {
            request.httpBody = body
        } else if let bodyString {
            request.httpBody = Data(bodyString.utf8)
        }
        for (key, value) in effectiveHeaders {
            request.setValue(value, forHTTPHeaderField: key)
        }

        var lastError: Error?

        for attempt in 0...retries {
            if isCanceled(requestId) {
                throw CancellationError()
            }
            try Task.checkCancellation()
            do {
                let (data, response) = try await performSessionTask(
                    session: session,
                    request: request,
                    requestId: requestId
                )
                guard let httpResponse = response as? HTTPURLResponse else {
                    throw PiliNetworkError.transport("non-HTTP response")
                }

                let status = httpResponse.statusCode
                if (500..<600).contains(status), attempt < retries {
                    try? await Task.sleep(nanoseconds: retryDelayNanos(retryDelayMs, attempt: attempt + 1))
                    if isCanceled(requestId) {
                        throw CancellationError()
                    }
                    try Task.checkCancellation()
                    continue
                }

                return (data, httpResponse)
            } catch is CancellationError {
                throw CancellationError()
            } catch {
                lastError = error
                if attempt < retries {
                    try? await Task.sleep(nanoseconds: retryDelayNanos(retryDelayMs, attempt: attempt + 1))
                    if isCanceled(requestId) {
                        throw CancellationError()
                    }
                    try Task.checkCancellation()
                }
            }
        }

        let error = PiliNetworkError.transport(lastError?.localizedDescription ?? "unknown error")
        PiliLogStore.shared.append(
            level: "error",
            message: "\(sanitizedURLString(urlString)) \(error.localizedDescription)"
        )
        throw error
    }

    private static func sanitizedURLString(_ urlString: String) -> String {
        guard var components = URLComponents(string: urlString),
              var queryItems = components.queryItems else {
            return urlString
        }
        queryItems = queryItems.map { item in
            guard sensitiveQueryKeys.contains(item.name) else {
                return item
            }
            return URLQueryItem(name: item.name, value: "***")
        }
        components.queryItems = queryItems
        return components.string ?? urlString
    }

    private static func performSessionTask(
        session: URLSession,
        request: URLRequest,
        requestId: String?
    ) async throws -> (Data, URLResponse) {
        try await withTaskCancellationHandler {
            try await withCheckedThrowingContinuation { continuation in
                let dataTask = session.dataTask(with: request) { data, response, error in
                    if let requestId, !requestId.isEmpty {
                        sessionLock.lock()
                        if let registered = activeTasks[requestId], registered === dataTask {
                            activeTasks.removeValue(forKey: requestId)
                        }
                        sessionLock.unlock()
                    }
                    if let error {
                        if (error as? URLError)?.code == .cancelled {
                            continuation.resume(throwing: CancellationError())
                        } else {
                            continuation.resume(throwing: error)
                        }
                        return
                    }
                    guard let data, let response else {
                        continuation.resume(throwing: URLError(.unknown))
                        return
                    }
                    continuation.resume(returning: (data, response))
                }
                if let requestId, !requestId.isEmpty {
                    sessionLock.lock()
                    activeTasks[requestId] = dataTask
                    sessionLock.unlock()
                }
                dataTask.resume()
            }
        } onCancel: {
            if let requestId, !requestId.isEmpty {
                cancelRequest(requestId: requestId)
            }
        }
    }

    // MARK: - Short link

    static func resolveShortLink(urlString: String) async -> String? {
        guard let url = URL(string: urlString) else {
            return nil
        }

        let handler = PiliRedirectHandler()
        let configuration = sessionConfiguration(for: mergedOptions([:]))
        configuration.httpShouldSetCookies = false
        let session = URLSession(configuration: configuration, delegate: handler, delegateQueue: nil)
        defer {
            session.finishTasksAndInvalidate()
        }

        var request = URLRequest(url: url)
        request.httpMethod = "HEAD"
        request.timeoutInterval = 10

        do {
            let (_, response) = try await session.data(for: request)
            if let redirect = handler.capturedURL {
                return redirect
            }
            if let httpResponse = response as? HTTPURLResponse,
               let location = httpResponse.allHeaderFields["Location"] as? String {
                return location
            }
            return nil
        } catch {
            return nil
        }
    }

    // MARK: - Upload

    static func upload(options: [String: Any]) async throws -> [String: Any] {
        let options = mergedOptions(options)
        guard let urlString = options["url"] as? String,
              let url = URL(string: urlString) else {
            throw PiliNetworkError.invalidURL
        }
        guard let fileUri = options["fileUri"] as? String,
              let fileURL = fileURL(from: fileUri) else {
            throw PiliNetworkError.invalidFile
        }
        guard FileManager.default.fileExists(atPath: fileURL.path) else {
            throw PiliNetworkError.readFile("upload file is missing")
        }

        let headers = (options["headers"] as? [String: String]) ?? [:]
        let timeoutMs = (options["timeoutMs"] as? Double) ?? 30_000
        // multipart 上传是 POST 写操作，失败时不自动重试。
        let retries = 0
        let retryDelayMs = (options["retryDelayMs"] as? Double) ?? 0
        let skipCookies = (options["skipCookies"] as? Bool) ?? false
        let requestId = options["requestId"] as? String
        if isCanceled(requestId) {
            throw CancellationError()
        }
        defer {
            clearCanceled(requestId)
        }

        var effectiveHeaders = headers
        let hasCookieHeader = effectiveHeaders.keys.contains { $0.lowercased() == "cookie" }
        if hasCookieHeader {
            effectiveHeaders = effectiveHeaders.filter { $0.key.lowercased() != "cookie" }
        }

        let boundary = "PiliPlusBoundary\(UUID().uuidString)"

        let fileName = (options["fileName"] as? String).flatMap { $0.isEmpty ? nil : $0 }
            ?? fileURL.lastPathComponent
        let safeFileName = fileName.replacingOccurrences(of: "\"", with: "_")
        let mimeType = (options["mimeType"] as? String) ?? "application/octet-stream"
        let category = options["category"] as? String
        let biz = options["biz"] as? String
        let csrf = options["csrf"] as? String

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.httpShouldHandleCookies = !skipCookies
        request.timeoutInterval = timeoutMs > 0 ? timeoutMs / 1000 : 30
        request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
        for (key, value) in effectiveHeaders {
            request.setValue(value, forHTTPHeaderField: key)
        }

        let header = "--\(boundary)\r\n"
            + "Content-Disposition: form-data; name=\"file_up\"; filename=\"\(safeFileName)\"\r\n"
            + "Content-Type: \(mimeType)\r\n\r\n"
        var tail = ""
        if let category, !category.isEmpty {
            tail += multipartField(boundary: boundary, name: "category", value: category)
        }
        if let biz, !biz.isEmpty {
            tail += multipartField(boundary: boundary, name: "biz", value: biz)
        }
        if let csrf, !csrf.isEmpty {
            tail += multipartField(boundary: boundary, name: "csrf", value: csrf)
        }
        tail += "--\(boundary)--\r\n"

        let headerData = Data(header.utf8)
        let tailData = Data(tail.utf8)
        let fileAttributes = try? FileManager.default.attributesOfItem(atPath: fileURL.path)
        let fileSize = (fileAttributes?[.size] as? NSNumber)?.int64Value
        if let fileSize {
            request.setValue(
                "\(headerData.count + Int(fileSize) + tailData.count)",
                forHTTPHeaderField: "Content-Length"
            )
        }
        // 不生成临时 multipart 文件：头部/原文件/尾部字段组合为 InputStream，
        // URLSession dataTask 流式读取，同时保留 requestId 取消语义。
        request.httpBodyStream = PiliMultipartInputStream(segments: [
            .data(headerData),
            .file(fileURL),
            .data(tailData),
        ])

        let session = makeSession(for: options)
        var lastError: Error?

        for attempt in 0...retries {
            do {
                if isCanceled(requestId) {
                    throw CancellationError()
                }
                let (data, response) = try await performSessionTask(
                    session: session,
                    request: request,
                    requestId: requestId
                )
                guard let httpResponse = response as? HTTPURLResponse else {
                    throw PiliNetworkError.transport("non-HTTP response")
                }

                let status = httpResponse.statusCode
                if (500..<600).contains(status), attempt < retries {
                    try? await Task.sleep(nanoseconds: retryDelayNanos(retryDelayMs, attempt: attempt + 1))
                    if isCanceled(requestId) {
                        throw CancellationError()
                    }
                    continue
                }

                return try makeResult(
                    data: data,
                    response: httpResponse,
                    originalURL: urlString,
                    responseType: (options["responseType"] as? String) ?? "text"
                )
            } catch {
                lastError = error
                if attempt < retries {
                    try? await Task.sleep(nanoseconds: retryDelayNanos(retryDelayMs, attempt: attempt + 1))
                }
            }
        }

        throw PiliNetworkError.transport(lastError?.localizedDescription ?? "unknown error")
    }

    private static func multipartField(boundary: String, name: String, value: String) -> String {
        "--\(boundary)\r\n"
            + "Content-Disposition: form-data; name=\"\(name)\"\r\n\r\n"
            + "\(value)\r\n"
    }

    // MARK: - Session reuse

    static func applyNetworkSettings(
        to configuration: URLSessionConfiguration,
        options: [String: Any]
    ) {
        let useSystemProxy = (options["useSystemProxy"] as? Bool) ?? true
        let proxyHost = options["proxyHost"] as? String
        let proxyPort = (options["proxyPort"] as? Double).map { Int($0) }
        let enableHttp2 = (options["enableHttp2"] as? Bool) ?? false

        // URLSession 会自动协商 HTTP/2；该开关仅控制原生会话配置。
        configuration.httpShouldUsePipelining = enableHttp2
        if !useSystemProxy {
            configuration.connectionProxyDictionary = [AnyHashable: Any]()
        } else if let proxyHost, let proxyPort {
            configuration.connectionProxyDictionary = [
                kCFNetworkProxiesHTTPEnable: true,
                kCFNetworkProxiesHTTPProxy: proxyHost,
                kCFNetworkProxiesHTTPPort: NSNumber(value: proxyPort),
                kCFNetworkProxiesHTTPSEnable: true,
                kCFNetworkProxiesHTTPSProxy: proxyHost,
                kCFNetworkProxiesHTTPSPort: NSNumber(value: proxyPort),
            ]
        }
    }

    public static func sessionConfiguration(for options: [String: Any]) -> URLSessionConfiguration {
        let timeoutMs = (options["timeoutMs"] as? Double) ?? 10_000

        // 单请求超时由 URLRequest.timeoutInterval 控制；session 只保留兜底超时，
        // 避免不同调用方因 timeout 不同而各自创建连接池。
        let fallbackTimeout = timeoutMs > 0 ? max(timeoutMs / 1000, 30) : 30
        let configuration = URLSessionConfiguration.default
        configuration.timeoutIntervalForRequest = fallbackTimeout
        configuration.timeoutIntervalForResource = max(fallbackTimeout * 3, 60)
        // Automatic cookie attachment preserves the full HTTPCookie attributes.
        configuration.httpCookieStorage = HTTPCookieStorage.shared
        configuration.httpCookieAcceptPolicy = .always
        configuration.requestCachePolicy = .useProtocolCachePolicy
        configuration.urlCache = apiCache
        applyNetworkSettings(to: configuration, options: options)

        return configuration
    }

    private static func makeSession(for options: [String: Any]) -> URLSession {
        let useSystemProxy = (options["useSystemProxy"] as? Bool) ?? true
        let proxyHost = options["proxyHost"] as? String
        let proxyPort = (options["proxyPort"] as? Double).map { Int($0) }
        let enableHttp2 = (options["enableHttp2"] as? Bool) ?? false
        let badCertificateCallback = (options["badCertificateCallback"] as? Bool) ?? false

        var cacheKey = "http2=\(enableHttp2)"
        cacheKey += ";badssl=\(badCertificateCallback)"
        if !useSystemProxy {
            cacheKey += ";no-proxy"
        } else if let proxyHost, let proxyPort {
            cacheKey += ";proxy=\(proxyHost):\(proxyPort)"
        }

        sessionLock.lock()
        defer { sessionLock.unlock() }
        if let session = sessions[cacheKey] {
            return session
        }

        let configuration = sessionConfiguration(for: options)
        let session = URLSession(
            configuration: configuration,
            delegate: PiliNetworkSessionDelegate(acceptInvalidSSL: badCertificateCallback),
            delegateQueue: nil
        )
        sessions[cacheKey] = session
        return session
    }

    private final class PiliNetworkSessionDelegate: NSObject, URLSessionDelegate {
        let acceptInvalidSSL: Bool

        init(acceptInvalidSSL: Bool) {
            self.acceptInvalidSSL = acceptInvalidSSL
        }

        func urlSession(
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
    }

    private static func fileURL(from fileUri: String) -> URL? {
        if let url = URL(string: fileUri), url.isFileURL {
            return url
        }
        if fileUri.hasPrefix("/") {
            return URL(fileURLWithPath: fileUri)
        }
        return URL(fileURLWithPath: fileUri)
    }

    private static func retryDelayNanos(_ milliseconds: Double, attempt: Int) -> UInt64 {
        let delay = milliseconds * Double(attempt) / 1000
        return UInt64(max(0, delay) * 1_000_000_000)
    }

    static func makeResult(
        data: Data,
        response: HTTPURLResponse,
        originalURL: String,
        responseType: String
    ) throws -> [String: Any] {
        let dataValue: Any
        if responseType == "json", !data.isEmpty {
            do {
                dataValue = try JSONSerialization.jsonObject(with: data)
            } catch {
                throw PiliNetworkError.transport(
                    "JSON response parse failed: \(error.localizedDescription)"
                )
            }
        } else {
            dataValue = String(data: data, encoding: .utf8) ?? ""
        }
        var headerDict: [String: String] = [:]
        for (key, value) in response.allHeaderFields {
            headerDict["\(key)"] = "\(value)"
        }

        return [
            "status": response.statusCode,
            "ok": (200..<400).contains(response.statusCode),
            "data": dataValue,
            "headers": headerDict,
            "url": response.url?.absoluteString ?? originalURL,
        ]
    }

    static func makeBinaryResult(
        data: Data,
        response: HTTPURLResponse,
        originalURL: String
    ) throws -> [String: Any] {
        var headerDict: [String: String] = [:]
        for (key, value) in response.allHeaderFields {
            headerDict["\(key)"] = "\(value)"
        }
        return [
            "status": response.statusCode,
            "ok": (200..<400).contains(response.statusCode),
            "data": data,
            "headers": headerDict,
            "url": response.url?.absoluteString ?? originalURL,
        ]
    }

    // MARK: - Cookies

    @discardableResult
    static func setCookiesAsync(_ cookies: [[String: Any]]) -> Bool {
        let storage = HTTPCookieStorage.shared
        for item in cookies {
            guard let name = item["name"] as? String,
                  let value = item["value"] as? String else {
                continue
            }

            var properties: [HTTPCookiePropertyKey: Any] = [
                .name: name,
                .value: value,
                .domain: item["domain"] as? String ?? ".bilibili.com",
                .path: item["path"] as? String ?? "/",
            ]
            if let expires = item["expires"] as? Double {
                properties[.expires] = Date(timeIntervalSince1970: expires / 1000)
            }
            if let secure = item["secure"] as? Bool {
                properties[.secure] = secure ? "TRUE" : "FALSE"
            }
            if let httpOnly = item["httpOnly"] as? Bool {
                properties[.httpOnly] = httpOnly ? "TRUE" : "FALSE"
            }
            if let sameSite = item["sameSite"] as? String {
                switch sameSite.lowercased() {
                case "strict":
                    properties[.sameSitePolicy] = HTTPCookieStringPolicy.sameSiteStrict
                case "lax":
                    properties[.sameSitePolicy] = HTTPCookieStringPolicy.sameSiteLax
                default:
                    // SameSite=None 是 HTTPCookie 的默认行为，不写属性即可保留。
                    break
                }
            }
            if let cookie = HTTPCookie(properties: properties) {
                storage.setCookie(cookie)
            }
        }
        return true
    }

    static func getCookiesDetailed(domain: String) -> [[String: Any]] {
        let storage = HTTPCookieStorage.shared
        let allCookies = storage.cookies ?? []
        let filtered = allCookies.filter { cookieMatchesDomain($0, domain: domain) }

        return filtered.map { cookie in
            let sameSite: String
            if let policy = cookie.sameSitePolicy {
                sameSite = policy.rawValue.lowercased()
            } else {
                sameSite = "none"
            }
            return [
                "name": cookie.name,
                "value": cookie.value,
                "domain": cookie.domain,
                "path": cookie.path,
                "expires": cookie.expiresDate.map { $0.timeIntervalSince1970 * 1000 } ?? NSNull(),
                "secure": cookie.isSecure,
                "httpOnly": cookie.isHTTPOnly,
                "sameSite": sameSite,
            ]
        }
    }

    @discardableResult
    static func clearCookies() -> Bool {
        let storage = HTTPCookieStorage.shared
        let domains = [
            "bilibili.com",
            "b23.tv",
            "bilibili.tv",
            "acgvideo.com",
            "hdslb.com",
            "bilivideo.com",
            "bilivideo.cn",
            "bilibili.cn",
        ]
        for cookie in storage.cookies ?? [] {
            if domains.contains(where: { cookieMatchesDomain(cookie, domain: $0) }) {
                storage.deleteCookie(cookie)
            }
        }
        return true
    }

    // MARK: - Cookie domain matching

    private static func cookieMatchesDomain(_ cookie: HTTPCookie, domain: String) -> Bool {
        let normalized = domain.lowercased().trimmingCharacters(in: CharacterSet(charactersIn: "."))
        let cookieDomain = cookie.domain.lowercased().trimmingCharacters(in: CharacterSet(charactersIn: "."))
        if normalized.isEmpty {
            return true
        }
        if cookieDomain.isEmpty {
            return false
        }
        return cookieDomain == normalized
            || cookieDomain.hasSuffix(".\(normalized)")
            || normalized.hasSuffix(".\(cookieDomain)")
    }

}

private final class PiliRedirectHandler: NSObject, URLSessionTaskDelegate {
    private var redirectURL: URL?

    var capturedURL: String? {
        redirectURL?.absoluteString
    }

    func urlSession(
        _ session: URLSession,
        task: URLSessionTask,
        willPerformHTTPRedirection response: HTTPURLResponse,
        newRequest request: URLRequest,
        completionHandler: @escaping (URLRequest?) -> Void
    ) {
        redirectURL = request.url
        completionHandler(nil)
    }
}

/// 组合 Data/文件 InputStream：用于 multipart 流式上传，避免整包写临时文件。
private final class PiliMultipartInputStream: InputStream {
    enum Segment {
        case data(Data)
        case file(URL)
    }

    private let segments: [Segment]
    private var currentIndex = 0
    private var dataOffset = 0
    private var fileHandle: FileHandle?
    private var statusValue: Stream.Status = .notOpen
    private var streamErrorValue: Error?

    init(segments: [Segment]) {
        self.segments = segments
        super.init()
    }

    override var streamStatus: Stream.Status {
        statusValue
    }

    override var streamError: Error? {
        streamErrorValue
    }

    override func open() {
        guard statusValue == .notOpen else { return }
        statusValue = .open
        currentIndex = 0
        dataOffset = 0
        fileHandle = nil
    }

    override func close() {
        if let handle = fileHandle {
            try? handle.close()
        }
        fileHandle = nil
        statusValue = .closed
    }

    override var hasBytesAvailable: Bool {
        guard statusValue == .open else { return false }
        if currentIndex < segments.count {
            return true
        }
        return fileHandle != nil
    }

    override func read(_ buffer: UnsafeMutablePointer<UInt8>, maxLength len: Int) -> Int {
        guard len > 0, statusValue == .open else {
            return 0
        }
        while currentIndex < segments.count {
            switch segments[currentIndex] {
            case .data(let data):
                if dataOffset < data.count {
                    let count = min(len, data.count - dataOffset)
                    data.copyBytes(to: buffer, from: dataOffset..<(dataOffset + count))
                    dataOffset += count
                    return count
                }
                currentIndex += 1
                dataOffset = 0
            case .file(let url):
                do {
                    let handle: FileHandle
                    if let existing = fileHandle {
                        handle = existing
                    } else {
                        handle = try FileHandle(forReadingFrom: url)
                        fileHandle = handle
                    }
                    let chunk = handle.readData(ofLength: len)
                    if !chunk.isEmpty {
                        chunk.copyBytes(to: buffer, count: chunk.count)
                        return chunk.count
                    }
                    try? handle.close()
                    fileHandle = nil
                    currentIndex += 1
                } catch {
                    statusValue = .error
                    streamErrorValue = error
                    return -1
                }
            }
        }
        statusValue = .atEnd
        return 0
    }

    override func getBuffer(
        _ buffer: UnsafeMutablePointer<UnsafeMutablePointer<UInt8>?>,
        length len: UnsafeMutablePointer<Int>
    ) -> Bool {
        false
    }

    override func property(forKey key: Stream.PropertyKey) -> Any? {
        nil
    }

    override func setProperty(_ property: Any?, forKey key: Stream.PropertyKey) -> Bool {
        false
    }

    override func schedule(in aRunLoop: RunLoop, forMode mode: RunLoop.Mode) {}

    override func remove(from aRunLoop: RunLoop, forMode mode: RunLoop.Mode) {}
}
