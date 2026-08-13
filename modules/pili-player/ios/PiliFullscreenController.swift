// Copyright 2026 PiliPlus. All rights reserved.

import UIKit

private final class PiliFullscreenPassthroughView: UIView {
    override func hitTest(_ point: CGPoint, with event: UIEvent?) -> UIView? {
        let hit = super.hitTest(point, with: event)
        return hit === self ? nil : hit
    }
}

final class PiliFullscreenPresenter {
    static let shared = PiliFullscreenPresenter()

    private weak var controller: PiliFullscreenController?

    private init() {}

    func present(options: [String: Any]) async throws -> Bool {
        try await withCheckedThrowingContinuation { continuation in
            DispatchQueue.main.async {
                if let existing = self.controller,
                   existing.isBeingPresented || existing.presentingViewController != nil {
                    continuation.resume(returning: true)
                    return
                }
                self.controller = nil
                guard let top = Self.topViewController() else {
                    continuation.resume(throwing: NSError(
                        domain: "PiliPlayer",
                        code: 1,
                        userInfo: [NSLocalizedDescriptionKey: "No view controller available for fullscreen presentation"]
                    ))
                    return
                }
                let controller = PiliFullscreenController(options: options)
                self.controller = controller
                top.present(controller, animated: true) {
                    // 04-B6-5：全屏手势单一事实源——原生不再安装 window 级 pan 手势。
                    // 亮度/音量/滑动退出全屏/拖字幕全部由 JS 侧 RNGH（use-fullscreen-player）
                    // 承接，原生 VC 仅保留状态栏/电量/时间显示。
                    continuation.resume(returning: true)
                }
            }
        }
    }

    func dismiss() {
        DispatchQueue.main.async {
            if let controller = self.controller {
                controller.dismissFromPresenter()
            }
            self.controller = nil
        }
    }

    private static func topViewController() -> UIViewController? {
        let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
        let window = scenes.flatMap { $0.windows }.first { $0.isKeyWindow }
        var top = window?.rootViewController
        while let presented = top?.presentedViewController, !presented.isBeingDismissed {
            top = presented
        }
        return top
    }
}

final class PiliFullscreenController: UIViewController {
    private let fullScreenMode: Int
    private let autoRotate: Bool
    /// 原生手势已全部禁用（04-B6-5：JS RNGH 为唯一手势源），该选项保留仅为
    /// 记录 JS 侧是否启用"滑动亮度/音量"（决定 JS 手势的识别分区），原生不再消费。
    let gesturesEnabled: Bool

    private let timeLabel = UILabel()
    private let batteryLabel = UILabel()
    private let statusStack = UIStackView()
    private var clockTimer: Timer?
    private var batteryObservers: [NSObjectProtocol] = []

    init(options: [String: Any]) {
        fullScreenMode = (options["fullScreenMode"] as? Double).map { Int($0) } ?? 0
        autoRotate = (options["autoRotate"] as? Bool) ?? false
        gesturesEnabled = (options["enableSlideVolumeBrightness"] as? Bool) ?? true
        super.init(nibName: nil, bundle: nil)
        modalPresentationStyle = .overFullScreen
        modalPresentationCapturesStatusBarAppearance = true
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    override func loadView() {
        view = PiliFullscreenPassthroughView()
        view.backgroundColor = .clear
        view.isOpaque = false
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        buildStatusLabels()
    }

    override func viewWillAppear(_ animated: Bool) {
        super.viewWillAppear(animated)
        updateStatusLabels()
        startBatteryMonitoring()
        startClockTimer()
        // 04-B1：方向不再由原生 VC 控制——进入/退出全屏的旋转全部交给
        // JS 侧 expo-screen-orientation（lockAsync）统一接管。
        // 原实现在 viewWillAppear（view.window == nil）调 applyOrientation，
        // iOS16+ 的 requestGeometryUpdate 分支永远取不到 windowScene 而跳过，
        // 只剩 KVC hack，导致全屏旋转从未生效。此处移除原生旋转逻辑。
    }

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        // 04-B6-5：全屏手势单一事实源——原生不再安装 pan 手势（JS RNGH 唯一手势源）。
    }

    override func viewWillDisappear(_ animated: Bool) {
        super.viewWillDisappear(animated)
        stopClockTimer()
        stopBatteryMonitoring()
        // 方向恢复同样由 expo-screen-orientation 负责（退出全屏时 JS 已锁回竖屏）。
    }

    override var prefersStatusBarHidden: Bool {
        true
    }

    override var preferredScreenEdgesDeferringSystemGestures: UIRectEdge {
        [.bottom]
    }

    override var shouldAutorotate: Bool {
        true
    }

    /// 方向已由 JS 侧 expo-screen-orientation 统一接管（进入全屏按 FULLSCREEN_MODES
    /// lock、退出恢复竖屏）。这里必须返回全方向，否则系统会把"VC 支持方向"与
    /// expo 的 requestGeometryUpdate 取交集，导致竖屏视频全屏 / 退出恢复竖屏失效。
    override var supportedInterfaceOrientations: UIInterfaceOrientationMask {
        .all
    }

    func dismissFromPresenter() {
        guard presentingViewController != nil else {
            return
        }
        dismiss(animated: true)
    }

    // MARK: - Status labels

    private func buildStatusLabels() {
        statusStack.axis = .horizontal
        statusStack.alignment = .center
        statusStack.spacing = 8
        statusStack.isUserInteractionEnabled = false
        statusStack.translatesAutoresizingMaskIntoConstraints = false

        for label in [batteryLabel, timeLabel] {
            label.textColor = .white
            label.font = .monospacedDigitSystemFont(ofSize: 11, weight: .medium)
            label.textAlignment = .right
            statusStack.addArrangedSubview(label)
        }
        view.addSubview(statusStack)

        NSLayoutConstraint.activate([
            statusStack.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: 10),
            statusStack.trailingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.trailingAnchor, constant: -12),
        ])
    }

    private func startBatteryMonitoring() {
        UIDevice.current.isBatteryMonitoringEnabled = true
        let levelObserver = NotificationCenter.default.addObserver(
            forName: UIDevice.batteryLevelDidChangeNotification,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            self?.updateStatusLabels()
        }
        let stateObserver = NotificationCenter.default.addObserver(
            forName: UIDevice.batteryStateDidChangeNotification,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            self?.updateStatusLabels()
        }
        batteryObservers = [levelObserver, stateObserver]
    }

    private func stopBatteryMonitoring() {
        for observer in batteryObservers {
            NotificationCenter.default.removeObserver(observer)
        }
        batteryObservers.removeAll()
    }

    private func startClockTimer() {
        clockTimer?.invalidate()
        let timer = Timer(timeInterval: 30, repeats: true) { [weak self] _ in
            self?.updateStatusLabels()
        }
        timer.tolerance = 1
        RunLoop.main.add(timer, forMode: .common)
        clockTimer = timer
    }

    private func stopClockTimer() {
        clockTimer?.invalidate()
        clockTimer = nil
    }

    private func updateStatusLabels() {
        let formatter = DateFormatter()
        formatter.dateFormat = "HH:mm"
        timeLabel.text = formatter.string(from: Date())

        let level = UIDevice.current.batteryLevel
        if level >= 0 {
            batteryLabel.text = "\(Int((level * 100).rounded()))%"
        } else {
            batteryLabel.text = nil
        }
    }
}
