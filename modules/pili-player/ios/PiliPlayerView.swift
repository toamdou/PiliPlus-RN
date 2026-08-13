// Copyright 2026 PiliPlus. All rights reserved.

import AVFoundation
import AVKit
import ExpoModulesCore
import UIKit

/// 全局 PiP 注册表：共享 AVPlayer 会话在多个页面复用时，PiP 控制器始终绑定到
/// 当前挂载的 PiliPlayerView 的 AVPlayerLayer 上，模块层通过这里路由 start/stop。
enum PiliPlayerPiPRegistrar {
    /// 当前持有 PiP 控制器的视图实例（weak，页面卸载即失效）
    static weak var activeView: PiliPlayerView?
    /// PiP 激活状态变化回调（由 PiliPlayerModule 注入，转发到 JS）
    static var onPiPStateChange: ((Bool) -> Void)?
}

public final class PiliPlayerView: ExpoView, AVPictureInPictureControllerDelegate {
    private let playerLayerView = PlayerLayerContainerView()

    // AirPlay: `AVPlayer.allowsExternalPlayback` 已在 PiliPlayerSession.activate 打开；
    // AVRoutePickerView 入口属于播放器控制层 UI 决策，不在本容器内重复实现。
    // PiP: 批次5 P3 —— AVPictureInPictureController 已接线（start/stop + requiresLinearPlayback）。
    // 真机验收项：需在工程开启 com.apple.developer.avfoundation.picture-in-picture entitlement
    // 并在 capabilities 中声明 Background Modes → Audio（UIBackgroundModes=audio 已在 app.json），
    // 否则 isPictureInPicturePossible 恒为 false（模拟器也不支持 PiP）。

    /// PiP 控制器：绑定到 playerLayerView 的 AVPlayerLayer（iOS 15+ 使用 contentSource 初始化）。
    private var pipController: AVPictureInPictureController?

    public required init(appContext: AppContext? = nil) {
        super.init(appContext: appContext)
        clipsToBounds = true
        backgroundColor = .black
        isUserInteractionEnabled = false
        playerLayerView.isUserInteractionEnabled = false
        addSubview(playerLayerView)
        // 登记为模块层 PiP 路由目标；页面卸载（deinit）时自动解除。
        PiliPlayerPiPRegistrar.activeView = self
    }

    deinit {
        if PiliPlayerPiPRegistrar.activeView === self {
            PiliPlayerPiPRegistrar.activeView = nil
        }
    }

    public override func layoutSubviews() {
        super.layoutSubviews()
        playerLayerView.frame = bounds
    }

    func bindPlayer(_ player: AVPlayer?) {
        playerLayerView.playerLayer.player = player
        // 惰性创建 PiP 控制器：AVPlayerLayer 首次绑定 player 后即可用。
        ensurePiPController()
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

    // MARK: - PiP 控制（由 PiliPlayerModule 经 PiliPlayerPiPRegistrar 调用）

    /// 惰性创建 PiP 控制器（AVPlayerLayer 已有 player 时）。
    /// 最低部署 iOS 15.1（见 PiliPlayer.podspec），直接使用 iOS 15+ 的
    /// `AVPictureInPictureController(contentSource:)` 初始化，不触碰已废弃的 `playerLayer:` 旧 init。
    private func ensurePiPController() {
        guard pipController == nil, let layer = playerLayerView.playerLayer, layer.player != nil else {
            return
        }
        let contentSource = AVPictureInPictureContentSource(playerLayer: layer)
        let controller = AVPictureInPictureController(contentSource: contentSource)
        controller.delegate = self
        // requiresLinearPlayback：PiP 小窗内禁用进度/倍速控件（锁定式小窗），对齐 Flutter「后台画中画」体验。
        controller.requiresLinearPlayback = true
        pipController = controller
    }

    /// 开启画中画（仅当 isPictureInPicturePossible 为 true 时生效）
    func startPiP() {
        guard let pipController, pipController.isPictureInPicturePossible else {
            return
        }
        pipController.startPictureInPicture()
    }

    /// 关闭画中画
    func stopPiP() {
        pipController?.stopPictureInPicture()
    }

    /// 切换 PiP 小窗内是否锁定线性播放（默认 true）
    func setRequiresLinearPlayback(_ enabled: Bool) {
        pipController?.requiresLinearPlayback = enabled
    }

    var isPiPPossible: Bool {
        pipController?.isPictureInPicturePossible ?? false
    }

    var isPiPActive: Bool {
        pipController?.isPictureInPictureActive ?? false
    }

    // MARK: - AVPictureInPictureControllerDelegate

    public func pictureInPictureControllerDidStartPictureInPicture(_ pictureInPictureController: AVPictureInPictureController) {
        PiliPlayerPiPRegistrar.onPiPStateChange?(true)
    }

    public func pictureInPictureControllerDidStopPictureInPicture(_ pictureInPictureController: AVPictureInPictureController) {
        PiliPlayerPiPRegistrar.onPiPStateChange?(false)
    }

    public func pictureInPictureController(
        _ pictureInPictureController: AVPictureInPictureController,
        failedToStartPictureInPictureWithError error: Error
    ) {
        // 启动失败（常见于缺少 entitlement / 模拟器环境）静默处理，不打断播放。
        PiliPlayerPiPRegistrar.onPiPStateChange?(false)
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
