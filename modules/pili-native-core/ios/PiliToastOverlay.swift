// Copyright 2026 PiliPlus. All rights reserved.

import UIKit

final class PiliToastOverlay {
    static let shared = PiliToastOverlay()

    private var overlayWindow: PiliToastWindow?
    private var toastView: UIView?
    private var toastLabel: UILabel?
    private var hideWorkItem: DispatchWorkItem?
    private var displayGeneration = 0
    private var presentingInKeyWindow = false

    private let minimumDuration: TimeInterval = 0.3
    private let maximumDuration: TimeInterval = 8.0

    private init() {}

    func show(message: String, durationMs: Double, announce: Bool = false) {
        let safeDurationMs = durationMs.isFinite ? durationMs : 1600
        let duration = min(max(safeDurationMs / 1000.0, minimumDuration), maximumDuration)
        DispatchQueue.main.async { [weak self] in
            guard let self else {
                return
            }
            self.hideWorkItem?.cancel()
            self.displayGeneration += 1

            if let scene = self.activeWindowScene() {
                self.showInWindow(scene: scene, message: message, duration: duration)
            } else if let keyWindow = self.keyWindow() {
                self.showInKeyWindow(keyWindow, message: message, duration: duration)
            }
        }
    }

    // MARK: - Scene resolution

    private func activeWindowScene() -> UIWindowScene? {
        let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
        return scenes.first { $0.activationState == .foregroundActive }
            ?? scenes.first { $0.activationState == .foregroundInactive }
            ?? scenes.first
    }

    private func keyWindow() -> UIWindow? {
        if let scene = activeWindowScene() {
            return scene.windows.first { $0.isKeyWindow } ?? scene.windows.first
        }
        return UIApplication.shared.windows.first { $0.isKeyWindow }
            ?? UIApplication.shared.windows.first
    }

    // MARK: - Presentation

    private func showInWindow(scene: UIWindowScene, message: String, duration: TimeInterval) {
        overlayWindow?.isHidden = true
        presentingInKeyWindow = false

        let window = makeWindow(for: scene)
        guard let hostView = window.rootViewController?.view else {
            return
        }

        let toast = makeToastViewIfNeeded()
        if toast.superview !== hostView {
            toast.removeFromSuperview()
            hostView.addSubview(toast)
        }

        presentToast(message: message, in: hostView)
        window.isHidden = false
        if announce {
            UIAccessibility.post(notification: .announcement, argument: message)
        }
        scheduleHide(after: duration)
    }

    private func showInKeyWindow(_ keyWindow: UIWindow, message: String, duration: TimeInterval) {
        overlayWindow?.isHidden = true
        presentingInKeyWindow = true

        let toast = makeToastViewIfNeeded()
        if toast.superview !== keyWindow {
            toast.removeFromSuperview()
            keyWindow.addSubview(toast)
        }

        presentToast(message: message, in: keyWindow)
        if announce {
            UIAccessibility.post(notification: .announcement, argument: message)
        }
        scheduleHide(after: duration)
    }

    private func presentToast(message: String, in hostView: UIView) {
        toastLabel?.text = message
        guard let toastView else {
            return
        }
        toastView.alpha = 1
        toastView.transform = .identity
        toastView.layer.removeAllAnimations()
        layoutToast(in: hostView)
    }

    private func makeWindow(for scene: UIWindowScene) -> PiliToastWindow {
        if let existing = overlayWindow, existing.windowScene === scene {
            return existing
        }

        let window = PiliToastWindow(windowScene: scene)
        window.windowLevel = UIWindow.Level(rawValue: UIWindow.Level.alert.rawValue + 1)
        window.backgroundColor = .clear
        window.isUserInteractionEnabled = false
        window.isHidden = true

        let hostViewController = UIViewController()
        hostViewController.view.backgroundColor = .clear
        hostViewController.view.isUserInteractionEnabled = false
        window.rootViewController = hostViewController
        window.layoutToast = { [weak self, weak window] in
            guard let self, let window, let hostView = window.rootViewController?.view else {
                return
            }
            self.layoutToast(in: hostView)
        }

        overlayWindow = window
        return window
    }

    private func makeToastViewIfNeeded() -> UIView {
        if let toastView {
            return toastView
        }

        let view = UIView()
        view.backgroundColor = UIColor.black.withAlphaComponent(0.78)
        view.layer.cornerRadius = 22
        view.layer.cornerCurve = .continuous
        view.clipsToBounds = true
        view.isUserInteractionEnabled = false

        let label = UILabel()
        label.textColor = .white
        label.font = .systemFont(ofSize: 14, weight: .medium)
        label.textAlignment = .center
        label.numberOfLines = 1
        view.addSubview(label)

        toastView = view
        toastLabel = label
        return view
    }

    private func layoutToast(in hostView: UIView) {
        guard let toastView, let toastLabel else {
            return
        }

        let horizontalInset: CGFloat = 24
        let maxWidth = min(hostView.bounds.width - horizontalInset * 2, 360)
        guard maxWidth > 0 else {
            return
        }

        let text = toastLabel.text ?? ""
        let textSize = (text as NSString).boundingRect(
            with: CGSize(width: maxWidth - 36, height: CGFloat.greatestFiniteMagnitude),
            options: [.usesLineFragmentOrigin, .usesFontLeading],
            attributes: [NSAttributedString.Key.font: toastLabel.font as Any],
            context: nil
        ).size

        let toastWidth = min(max(textSize.width + 36, 64), maxWidth)
        let toastHeight = max(textSize.height + 18, 36)
        toastView.frame = CGRect(
            x: (hostView.bounds.width - toastWidth) / 2,
            y: hostView.safeAreaInsets.top + 12,
            width: toastWidth,
            height: toastHeight
        )
        toastLabel.frame = CGRect(
            x: 18,
            y: 9,
            width: max(toastWidth - 36, 0),
            height: max(toastHeight - 18, 0)
        )
    }

    // MARK: - Auto hide

    private func scheduleHide(after duration: TimeInterval) {
        let generation = displayGeneration
        let workItem = DispatchWorkItem { [weak self] in
            self?.hide(generation: generation)
        }
        hideWorkItem = workItem
        DispatchQueue.main.asyncAfter(deadline: .now() + duration, execute: workItem)
    }

    private func hide(generation: Int) {
        guard generation == displayGeneration, let toastView else {
            return
        }

        let wasPresentingInKeyWindow = presentingInKeyWindow
        UIView.animate(
            withDuration: 0.18,
            animations: {
                toastView.alpha = 0
                toastView.transform = CGAffineTransform(translationX: 0, y: -8)
            },
            completion: { [weak self] _ in
                guard let self, self.displayGeneration == generation else {
                    return
                }
                if wasPresentingInKeyWindow {
                    self.toastView?.removeFromSuperview()
                } else {
                    self.overlayWindow?.isHidden = true
                }
            }
        )
    }
}

private final class PiliToastWindow: UIWindow {
    var layoutToast: (() -> Void)?

    override func layoutSubviews() {
        super.layoutSubviews()
        layoutToast?()
    }
}
