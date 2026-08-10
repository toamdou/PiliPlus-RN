// Copyright 2026 PiliPlus. All rights reserved.

import AVFoundation
import ExpoModulesCore
import UIKit

public final class PiliPlayerView: ExpoView {
    private let playerLayerView = PlayerLayerContainerView()

    // AirPlay: `AVPlayer.allowsExternalPlayback` 已在 PiliPlayerSession.activate 打开；
    // AVRoutePickerView 入口属于播放器控制层 UI 决策，不在本容器内重复实现。
    // PiP: 需要 AVPictureInPictureController + com.apple.developer.avfoundation.picture-in-picture
    // entitlement，当前未启用，待真机/Xcode 验收后另行接线。

    public required init(appContext: AppContext? = nil) {
        super.init(appContext: appContext)
        clipsToBounds = true
        backgroundColor = .black
        isUserInteractionEnabled = false
        playerLayerView.isUserInteractionEnabled = false
        addSubview(playerLayerView)
    }

    public override func layoutSubviews() {
        super.layoutSubviews()
        playerLayerView.frame = bounds
    }

    func bindPlayer(_ player: AVPlayer?) {
        playerLayerView.playerLayer.player = player
    }

    func setVideoGravity(_ rawValue: String?) {
        let gravity: AVLayerVideoGravity
        switch rawValue {
        case "cover", "resizeAspectFill":
            gravity = .resizeAspectFill
        case "fill", "resize":
            gravity = .resize
        default:
            gravity = .resizeAspect
        }
        playerLayerView.playerLayer.videoGravity = gravity
    }
}

private final class PlayerLayerContainerView: UIView {
    override class var layerClass: AnyClass {
        AVPlayerLayer.self
    }

    var playerLayer: AVPlayerLayer? {
        layer as? AVPlayerLayer
    }
}
