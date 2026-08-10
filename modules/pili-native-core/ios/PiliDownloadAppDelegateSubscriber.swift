// Copyright 2026 PiliPlus. All rights reserved.

import ExpoModulesCore
import UIKit

/// Forwards background URLSession launch events to the shared download manager.
public final class PiliDownloadAppDelegateSubscriber: ExpoAppDelegateSubscriber {
    public func application(
        _ application: UIApplication,
        handleEventsForBackgroundURLSession identifier: String,
        completionHandler: @escaping () -> Void
    ) {
        PiliDownloadManager.shared.handleEventsForBackgroundURLSession(
            identifier: identifier,
            completionHandler: completionHandler
        )
    }
}
