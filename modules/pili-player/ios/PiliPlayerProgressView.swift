// Copyright 2026 PiliPlus. All rights reserved.

import AVFoundation
import ExpoModulesCore
import UIKit

public final class PiliPlayerProgressView: ExpoView {
    private let progressView = UIProgressView(progressViewStyle: .default)
    private let timeLabel = UILabel()
    private var timeObserver: Any?
    private var currentItemObservation: NSKeyValueObservation?

    public required init(appContext: AppContext? = nil) {
        super.init(appContext: appContext)
        backgroundColor = .clear
        isUserInteractionEnabled = false

        timeLabel.textColor = .white
        timeLabel.font = .monospacedDigitSystemFont(ofSize: 12, weight: .medium)
        timeLabel.textAlignment = .center
        timeLabel.text = "0:00 / 0:00"
        timeLabel.translatesAutoresizingMaskIntoConstraints = false

        progressView.translatesAutoresizingMaskIntoConstraints = false
        progressView.trackTintColor = UIColor.white.withAlphaComponent(0.25)
        progressView.progressTintColor = UIColor(red: 1, green: 0.36, blue: 0.48, alpha: 1)

        addSubview(timeLabel)
        addSubview(progressView)
        NSLayoutConstraint.activate([
            timeLabel.topAnchor.constraint(equalTo: topAnchor),
            timeLabel.leadingAnchor.constraint(equalTo: leadingAnchor),
            timeLabel.trailingAnchor.constraint(equalTo: trailingAnchor),
            progressView.topAnchor.constraint(equalTo: timeLabel.bottomAnchor, constant: 6),
            progressView.leadingAnchor.constraint(equalTo: leadingAnchor),
            progressView.trailingAnchor.constraint(equalTo: trailingAnchor),
            progressView.bottomAnchor.constraint(equalTo: bottomAnchor),
        ])

        observePlayer()
    }

    deinit {
        if let timeObserver {
            PiliPlayerSession.shared.player.removeTimeObserver(timeObserver)
        }
        currentItemObservation?.invalidate()
    }

    func setProgressTintColor(_ color: UIColor?) {
        progressView.progressTintColor = color ?? UIColor(red: 1, green: 0.36, blue: 0.48, alpha: 1)
    }

    func setTrackTintColor(_ color: UIColor?) {
        progressView.trackTintColor = color ?? UIColor.white.withAlphaComponent(0.25)
    }

    private func observePlayer() {
        let player = PiliPlayerSession.shared.player
        currentItemObservation = player.observe(\.currentItem, options: [.new]) { [weak self] _, _ in
            DispatchQueue.main.async {
                self?.update()
            }
        }
        timeObserver = player.addPeriodicTimeObserver(
            forInterval: CMTime(seconds: 0.25, preferredTimescale: 600),
            queue: .main
        ) { [weak self] _ in
            self?.update()
        }
        update()
    }

    private func update() {
        let current = PiliPlayerSession.shared.currentTime()
        let duration = PiliPlayerSession.shared.duration()
        progressView.progress = duration > 0 ? Float(min(current / duration, 1)) : 0
        timeLabel.text = "\(Self.formatTime(current)) / \(Self.formatTime(duration))"
    }

    private static func formatTime(_ seconds: Double) -> String {
        let total = max(0, Int(seconds.rounded()))
        let hours = total / 3600
        let minutes = (total % 3600) / 60
        let secs = total % 60
        if hours > 0 {
            return String(format: "%d:%02d:%02d", hours, minutes, secs)
        }
        return String(format: "%d:%02d", minutes, secs)
    }
}
