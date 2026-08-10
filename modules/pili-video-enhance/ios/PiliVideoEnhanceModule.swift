// Copyright 2026 PiliPlus. All rights reserved.

import AVFoundation
import ExpoModulesCore
import UIKit

public final class PiliVideoEnhanceModule: Module {
    public func definition() -> ModuleDefinition {
        Name("PiliVideoEnhance")

        AsyncFunction("getCapabilitiesAsync") { () -> EnhancementCapabilitiesRecord in
            PiliEnhancementEngine.capabilities()
        }

        View(EnhancedVideoView.self) {
            Events(
                "onReady",
                "onFirstFrameRender",
                "onStateChange",
                "onError"
            )

            Prop("player") { (view: EnhancedVideoView, player: SharedRef<AVPlayer>?) in
                view.bindPlayer(player?.ref, playerId: player?.sharedObjectId)
            }

            Prop("options") { (view: EnhancedVideoView, options: EnhanceOptionsRecord?) in
                view.apply(options)
            }

            Prop("contentFit") { (view: EnhancedVideoView, contentFit: String?) in
                view.setContentFit(contentFit)
            }

            Prop("safeAreaInsets") { (view: EnhancedVideoView, insets: SafeAreaInsetsRecord?) in
                view.applySafeAreaInsets(insets)
            }
        }
    }
}
