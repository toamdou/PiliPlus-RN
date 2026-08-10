// Copyright 2026 PiliPlus. All rights reserved.

import ExpoModulesCore
import UIKit
import WebKit

public final class PiliWebView: ExpoView, WKNavigationDelegate, WKUIDelegate {
    private final class CookieStoreObserverProxy: NSObject, WKHTTPCookieStoreObserver {
        weak var owner: PiliWebView?

        func cookiesDidChange(in cookieStore: WKHTTPCookieStore) {
            owner?.cookieStoreDidChange(in: cookieStore)
        }
    }

    private let webView: WKWebView
    private let progressView = UIProgressView(progressViewStyle: .bar)
    private let cookieStoreObserverProxy = CookieStoreObserverProxy()
    private var javaScriptEnabled = true
    private var lastRequestedURL: String?
    private var progressObservation: NSKeyValueObservation?
    private var loadGeneration = 0
    private var cookieWriteFallback: DispatchWorkItem?
    private var cookieSyncWorkItem: DispatchWorkItem?
    private var cookieSyncInFlight = false

    private static let bilibiliCookieSuffixes = [
        "bilibili.com",
        "b23.tv",
        "bilibili.tv",
        "acgvideo.com",
        "hdslb.com",
        "bilivideo.com",
        "bilivideo.cn",
        "bilibili.cn"
    ]
    private static var isClearingData = false

    let onOpenInternalLink = EventDispatcher()

    public required init(appContext: AppContext? = nil) {
        let configuration = WKWebViewConfiguration()
        configuration.preferences.javaScriptEnabled = true

        let webView = WKWebView(frame: .zero, configuration: configuration)
        self.webView = webView

        super.init(appContext: appContext)

        cookieStoreObserverProxy.owner = self

        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.allowsBackForwardNavigationGestures = false
        webView.configuration.websiteDataStore.httpCookieStore.add(cookieStoreObserverProxy)
        addSubview(webView)
        progressView.progressTintColor = UIColor(red: 0.984, green: 0.447, blue: 0.6, alpha: 1)
        progressView.trackTintColor = UIColor(white: 0.0, alpha: 0.08)
        progressView.isHidden = true
        addSubview(progressView)

        progressObservation = webView.observe(\.estimatedProgress, options: [.new]) { [weak self] _, _ in
            self?.handleProgressChange()
        }
    }

    deinit {
        progressObservation?.invalidate()
        cookieWriteFallback?.cancel()
        cookieSyncWorkItem?.cancel()
        webView.configuration.websiteDataStore.httpCookieStore.remove(cookieStoreObserverProxy)
    }

    public override func layoutSubviews() {
        super.layoutSubviews()
        webView.frame = bounds
        progressView.frame = CGRect(x: 0, y: 0, width: bounds.width, height: 2)
    }

    // MARK: - Props

    func setSourceUrl(_ value: String?) {
        let urlString = value?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        guard !urlString.isEmpty else {
            return
        }
        guard let url = URL(string: urlString) else {
            dispatchLoadError()
            return
        }

        let absoluteString = url.absoluteString
        guard lastRequestedURL != absoluteString else {
            return
        }
        lastRequestedURL = absoluteString
        loadGeneration += 1
        requestLoad(for: url, generation: loadGeneration)
    }

    func setJavaScriptEnabled(_ value: Bool) {
        guard value != javaScriptEnabled else {
            return
        }
        javaScriptEnabled = value
        webView.configuration.preferences.javaScriptEnabled = value
        if webView.url != nil {
            _ = webView.reload()
        }
    }

    func setAllowsBackForwardNavigationGestures(_ value: Bool) {
        webView.allowsBackForwardNavigationGestures = value
    }

    // MARK: - WKNavigationDelegate

    public func webView(
        _ webView: WKWebView,
        decidePolicyFor navigationAction: WKNavigationAction,
        decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
    ) {
        if navigationAction.targetFrame == nil {
            decisionHandler(.cancel)
            return
        }
        if navigationAction.navigationType == .linkActivated,
           navigationAction.targetFrame?.isMainFrame == true,
           let url = navigationAction.request.url,
           let scheme = url.scheme?.lowercased(),
           scheme == "http" || scheme == "https" {
            decisionHandler(.cancel)
            onOpenInternalLink(["url": url.absoluteString])
            return
        }
        decisionHandler(.allow)
    }

    public func webView(
        _ webView: WKWebView,
        createWebViewWith configuration: WKWebViewConfiguration,
        for navigationAction: WKNavigationAction,
        windowFeatures: WKWindowFeatures
    ) -> WKWebView? {
        if let url = navigationAction.request.url,
           url.scheme == "http" || url.scheme == "https" {
            DispatchQueue.main.async {
                UIApplication.shared.open(url)
            }
        }
        return nil
    }

    public func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation?) {
        progressView.progress = 0
        progressView.isHidden = false
    }

    public func webView(_ webView: WKWebView, didFinish navigation: WKNavigation?) {
        progressView.isHidden = true
        syncWebCookiesToApp()
    }

    public func webView(_ webView: WKWebView, didFail navigation: WKNavigation?, withError error: Error) {
        handleLoadError(error)
    }

    public func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation?, withError error: Error) {
        handleLoadError(error)
    }

    private func cookieStoreDidChange(in cookieStore: WKHTTPCookieStore) {
        guard !PiliWebView.isClearingData else {
            return
        }
        scheduleWebCookieSync()
    }

    // MARK: - Private

    private func handleLoadError(_ error: Error) {
        let nsError = error as NSError
        guard nsError.code != NSURLErrorCancelled else {
            progressView.isHidden = true
            return
        }
        progressView.isHidden = true
    }

    private func handleProgressChange() {
        progressView.setProgress(Float(webView.estimatedProgress), animated: true)
        progressView.isHidden = webView.estimatedProgress >= 1.0 || !webView.isLoading
    }

    private func dispatchLoadError() {
        progressView.isHidden = true
    }

    private func requestLoad(for url: URL, generation: Int) {
        let cookieStore = webView.configuration.websiteDataStore.httpCookieStore
        let cookies = HTTPCookieStorage.shared.cookies(for: url) ?? []

        guard !cookies.isEmpty else {
            cookieWriteFallback?.cancel()
            cookieWriteFallback = nil
            load(url: url, generation: generation)
            return
        }

        var remaining = cookies.count
        var didComplete = false
        let finish: () -> Void = { [weak self] in
            guard let self, !didComplete else {
                return
            }
            didComplete = true
            self.load(url: url, generation: generation)
        }
        let fallback = DispatchWorkItem { finish() }
        cookieWriteFallback?.cancel()
        cookieWriteFallback = fallback
        let fallbackDelay = max(0.25, min(1.5, Double(cookies.count) * 0.05))
        DispatchQueue.main.asyncAfter(deadline: .now() + fallbackDelay, execute: fallback)

        for cookie in cookies {
            cookieStore.setCookie(cookie) {
                DispatchQueue.main.async {
                    if remaining > 0 {
                        remaining -= 1
                    }
                    if remaining == 0 {
                        fallback.cancel()
                        finish()
                    }
                }
            }
        }
    }

    private func load(url: URL, generation: Int) {
        DispatchQueue.main.async { [weak self] in
            guard let self, self.loadGeneration == generation, self.lastRequestedURL == url.absoluteString else {
                return
            }
            _ = self.webView.load(URLRequest(url: url))
        }
    }

    private func scheduleWebCookieSync() {
        cookieSyncWorkItem?.cancel()
        let workItem = DispatchWorkItem { [weak self] in
            guard let self else {
                return
            }
            self.cookieSyncWorkItem = nil
            self.syncWebCookiesToApp()
        }
        cookieSyncWorkItem = workItem
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.15, execute: workItem)
    }

    private func syncWebCookiesToApp() {
        cookieSyncWorkItem?.cancel()
        cookieSyncWorkItem = nil

        guard !cookieSyncInFlight else {
            scheduleWebCookieSync()
            return
        }

        cookieSyncInFlight = true
        let cookieStore = webView.configuration.websiteDataStore.httpCookieStore
        cookieStore.getAllCookies { [weak self] cookies in
            DispatchQueue.main.async {
                guard let self else {
                    return
                }
                self.cookieSyncInFlight = false
                self.applyWebCookiesToApp(cookies)
            }
        }
    }

    private func applyWebCookiesToApp(_ cookies: [HTTPCookie]) {
        let storage = HTTPCookieStorage.shared
        guard !webView.isLoading else {
            scheduleWebCookieSync()
            return
        }
        let webCookies = cookies.filter { PiliWebView.isBilibiliCookie($0) }
        let webKeys = Set(webCookies.map(Self.cookieKey))
        for cookie in webCookies {
            storage.setCookie(cookie)
        }
        for cookie in (storage.cookies ?? []) where PiliWebView.isBilibiliCookie(cookie) {
            if !webKeys.contains(Self.cookieKey(cookie)) {
                storage.deleteCookie(cookie)
            }
        }
    }

    private static func cookieKey(_ cookie: HTTPCookie) -> String {
        "\(cookie.domain)|\(cookie.path)|\(cookie.name)"
    }

    private static func isBilibiliCookie(_ cookie: HTTPCookie) -> Bool {
        isBilibiliCookieDomain(cookie.domain)
    }

    private static func isBilibiliCookieDomain(_ domain: String) -> Bool {
        let normalized = (domain.hasPrefix(".") ? String(domain.dropFirst()) : domain).lowercased()
        return bilibiliCookieSuffixes.contains { suffix in
            normalized == suffix || normalized.hasSuffix("." + suffix)
        }
    }

    static func clearBilibiliData() async {
        isClearingData = true
        await withCheckedContinuation { (continuation: CheckedContinuation<Void, Never>) in
            let store = WKWebsiteDataStore.default()
            let types = WKWebsiteDataStore.allWebsiteDataTypes()
            store.fetchDataRecords(ofTypes: types) { records in
                let bilibiliRecords = records.filter {
                    isBilibiliCookieDomain($0.displayName)
                }
                guard !bilibiliRecords.isEmpty else {
                    continuation.resume()
                    return
                }
                store.removeData(ofTypes: types, for: bilibiliRecords) {
                    continuation.resume()
                }
            }
        }
        isClearingData = false
    }
}
