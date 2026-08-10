// Copyright 2026 PiliPlus. All rights reserved.

import ExpoModulesCore

public final class PiliWebViewModule: Module {
    public func definition() -> ModuleDefinition {
        Name("PiliWebView")

        AsyncFunction("isAvailableAsync") { () -> Bool in
            true
        }

        AsyncFunction("clearBilibiliDataAsync") { () async in
            await PiliWebView.clearBilibiliData()
        }

        View(PiliWebView.self) {
            Events(
                "onOpenInternalLink"
            )

            Prop("sourceUrl") { (view: PiliWebView, sourceUrl: String?) in
                view.setSourceUrl(sourceUrl)
            }

            Prop("javaScriptEnabled") { (view: PiliWebView, javaScriptEnabled: Bool?) in
                view.setJavaScriptEnabled(javaScriptEnabled ?? true)
            }

            Prop("allowsBackForwardNavigationGestures") { (view: PiliWebView, allowsBackForwardNavigationGestures: Bool?) in
                view.setAllowsBackForwardNavigationGestures(allowsBackForwardNavigationGestures ?? false)
            }
        }
    }
}
