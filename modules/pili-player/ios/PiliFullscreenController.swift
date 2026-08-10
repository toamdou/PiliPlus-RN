// Copyright 2026 PiliPlus. All rights reserved.

import AVFoundation
import QuartzCore
import UIKit

private final class PiliFullscreenPassthroughView: UIView {
    override func hitTest(_ point: CGPoint, with event: UIEvent?) -> UIView? {
        let hit = super.hitTest(point, with: event)
        return hit === self ? nil : hit
    }
}

private enum PiliFullscreenGestureMode: Equatable {
    case none
    case brightness
    case volume
}

final class PiliFullscreenPresenter {
    static let shared = PiliFullscreenPresenter()

    private weak var controller: PiliFullscreenController?
    private weak var gestureWindow: UIWindow?
    private var panGesture: UIPanGestureRecognizer?

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
                    self.installPanGesture(on: controller)
                    continuation.resume(returning: true)
                }
            }
        }
    }

    func installPanGestureIfNeeded() {
        guard let controller else {
            return
        }
        installPanGesture(on: controller)
    }

    func dismiss() {
        DispatchQueue.main.async {
            self.removePanGesture()
            if let controller = self.controller {
                controller.dismissFromPresenter()
            }
            self.controller = nil
        }
    }

    private func installPanGesture(on controller: PiliFullscreenController) {
        removePanGesture()
        guard controller.gesturesEnabled else {
            return
        }
        guard let window = controller.view.window else {
            return
        }
        let pan = UIPanGestureRecognizer(target: controller, action: #selector(PiliFullscreenController.handlePan(_:)))
        pan.cancelsTouchesInView = false
        pan.delaysTouchesBegan = false
        pan.delaysTouchesEnded = false
        pan.delegate = controller
        window.addGestureRecognizer(pan)
        panGesture = pan
        gestureWindow = window
    }

    private func removePanGesture() {
        if let panGesture {
            gestureWindow?.removeGestureRecognizer(panGesture)
        }
        panGesture = nil
        gestureWindow = nil
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

final class PiliFullscreenController: UIViewController, UIGestureRecognizerDelegate {
    private let fullScreenMode: Int
    private let autoRotate: Bool
    let gesturesEnabled: Bool

    private let timeLabel = UILabel()
    private let batteryLabel = UILabel()
    private let statusStack = UIStackView()
    private let hudStack = UIStackView()
    private let hudValueLabel = UILabel()
    private let hudIconLabel = UILabel()
    private var hudTimer: Timer?
    private var clockTimer: Timer?
    private var batteryObservers: [NSObjectProtocol] = []

    private var gestureMode: PiliFullscreenGestureMode = .none
    private var gestureBase: Double = 0
    private var lastHUDUpdate: CFTimeInterval = 0

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
        buildHUD()
    }

    override func viewWillAppear(_ animated: Bool) {
        super.viewWillAppear(animated)
        updateStatusLabels()
        startBatteryMonitoring()
        startClockTimer()
        applyOrientation()
    }

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        PiliFullscreenPresenter.shared.installPanGestureIfNeeded()
    }

    override func viewWillDisappear(_ animated: Bool) {
        super.viewWillDisappear(animated)
        stopClockTimer()
        stopBatteryMonitoring()
        hudTimer?.invalidate()
        restorePortraitOrientation()
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

    override var supportedInterfaceOrientations: UIInterfaceOrientationMask {
        if fullScreenMode == 1 {
            return .portrait
        }
        if fullScreenMode == 2 || autoRotate {
            return .allButUpsideDown
        }
        return .landscapeLeft
    }

    func dismissFromPresenter() {
        guard presentingViewController != nil else {
            return
        }
        dismiss(animated: true)
    }

    // MARK: - Pan gesture

    @objc func handlePan(_ gesture: UIPanGestureRecognizer) {
        guard let window = view.window else {
            return
        }
        let location = gesture.location(in: window)
        let width = window.bounds.width
        let height = window.bounds.height

        switch gesture.state {
        case .began:
            guard location.y < height - 120 else {
                gestureMode = .none
                return
            }
            if location.x < width / 3 {
                gestureMode = .brightness
                gestureBase = Double(UIScreen.main.brightness)
            } else if location.x > width * 2 / 3 {
                gestureMode = .volume
                gestureBase = Double(PiliPlayerSession.shared.player.volume)
            } else {
                gestureMode = .none
                return
            }
            lastHUDUpdate = 0
            showHUD()
        case .changed:
            guard gestureMode != .none else {
                return
            }
            let now = CACurrentMediaTime()
            guard now - lastHUDUpdate >= 0.1 else {
                return
            }
            lastHUDUpdate = now
            let delta = -Double(gesture.translation(in: window).y) / 200
            let value = min(max(gestureBase + delta, 0), 1)
            switch gestureMode {
            case .brightness:
                UIScreen.main.brightness = CGFloat(value)
                hudIconLabel.text = "B"
            case .volume:
                PiliPlayerSession.shared.setVolume(Float(value))
                hudIconLabel.text = "V"
            case .none:
                break
            }
            hudValueLabel.text = "\(Int(value * 100))%"
        case .ended, .cancelled, .failed:
            gestureMode = .none
            scheduleHideHUD()
        default:
            break
        }
    }

    func gestureRecognizer(
        _ gestureRecognizer: UIGestureRecognizer,
        shouldRecognizeSimultaneouslyWith otherGestureRecognizer: UIGestureRecognizer
    ) -> Bool {
        true
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

    private func buildHUD() {
        hudStack.axis = .vertical
        hudStack.alignment = .center
        hudStack.spacing = 8
        hudStack.isUserInteractionEnabled = false
        hudStack.backgroundColor = UIColor.black.withAlphaComponent(0.72)
        hudStack.layer.cornerRadius = 12
        hudStack.isHidden = true
        hudStack.translatesAutoresizingMaskIntoConstraints = false

        hudIconLabel.textColor = .white
        hudIconLabel.font = .systemFont(ofSize: 20, weight: .semibold)
        hudValueLabel.textColor = .white
        hudValueLabel.font = .monospacedDigitSystemFont(ofSize: 13, weight: .semibold)
        hudStack.addArrangedSubview(hudIconLabel)
        hudStack.addArrangedSubview(hudValueLabel)
        view.addSubview(hudStack)

        NSLayoutConstraint.activate([
            hudStack.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            hudStack.centerYAnchor.constraint(equalTo: view.centerYAnchor, constant: -36),
            hudStack.widthAnchor.constraint(equalToConstant: 72),
        ])
    }

    private func showHUD() {
        hudTimer?.invalidate()
        hudStack.isHidden = false
        hudStack.alpha = 1
    }

    private func scheduleHideHUD() {
        hudTimer?.invalidate()
        hudTimer = Timer(timeInterval: 0.3, repeats: false) { [weak self] _ in
            UIView.animate(withDuration: 0.18) {
                self?.hudStack.alpha = 0
            } completion: { _ in
                self?.hudStack.isHidden = true
            }
        }
        RunLoop.main.add(hudTimer!, forMode: .common)
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

    // MARK: - Orientation

    private func applyOrientation() {
        let mask = supportedInterfaceOrientations
        if #available(iOS 16.0, *), let scene = view.window?.windowScene {
            scene.requestGeometryUpdate(.iOS(interfaceOrientations: mask))
            setNeedsUpdateOfSupportedInterfaceOrientations()
        }
        let orientation: UIInterfaceOrientation = mask.contains(.portrait) ? .portrait : .landscapeLeft
        UIDevice.current.setValue(orientation.rawValue, forKey: "orientation")
        UIViewController.attemptRotationToDeviceOrientation()
    }

    private func restorePortraitOrientation() {
        if #available(iOS 16.0, *), let scene = view.window?.windowScene {
            scene.requestGeometryUpdate(.iOS(interfaceOrientations: .portrait))
        }
        UIDevice.current.setValue(UIInterfaceOrientation.portrait.rawValue, forKey: "orientation")
        UIViewController.attemptRotationToDeviceOrientation()
    }
}
