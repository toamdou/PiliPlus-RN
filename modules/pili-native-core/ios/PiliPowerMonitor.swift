// Copyright 2026 PiliPlus. All rights reserved.

import Foundation
import UIKit

final class PiliPowerMonitor {
    static let shared = PiliPowerMonitor()

    private var onChange: ((String, [String: Any]) -> Void)?
    private var lastSnapshot: [String: Any] = [:]

    private init() {
        UIDevice.current.isBatteryMonitoringEnabled = true
        let center = NotificationCenter.default
        center.addObserver(
            self,
            selector: #selector(stateChanged),
            name: ProcessInfo.thermalStateDidChangeNotification,
            object: nil
        )
        center.addObserver(
            self,
            selector: #selector(stateChanged),
            name: ProcessInfo.powerStateDidChangeNotification,
            object: nil
        )
        center.addObserver(
            self,
            selector: #selector(stateChanged),
            name: UIDevice.batteryStateDidChangeNotification,
            object: nil
        )
        center.addObserver(
            self,
            selector: #selector(stateChanged),
            name: UIDevice.batteryLevelDidChangeNotification,
            object: nil
        )
        lastSnapshot = Self.snapshot()
    }

    deinit {
        NotificationCenter.default.removeObserver(self)
    }

    var current: [String: Any] {
        Self.snapshot()
    }

    func setOnChange(_ handler: ((String, [String: Any]) -> Void)?) {
        onChange = handler
    }

    private static func snapshot() -> [String: Any] {
        let device = UIDevice.current
        let batteryLevel = device.batteryLevel >= 0 ? Double(device.batteryLevel) : -1.0
        let batteryState: String
        switch device.batteryState {
        case .charging:
            batteryState = "charging"
        case .full:
            batteryState = "full"
        case .unplugged:
            batteryState = "unplugged"
        default:
            batteryState = "unknown"
        }
        let thermalState: String
        switch ProcessInfo.processInfo.thermalState {
        case .nominal:
            thermalState = "nominal"
        case .fair:
            thermalState = "fair"
        case .serious:
            thermalState = "serious"
        case .critical:
            thermalState = "critical"
        @unknown default:
            thermalState = "nominal"
        }
        return [
            "lowPowerMode": ProcessInfo.processInfo.isLowPowerModeEnabled,
            "thermalState": thermalState,
            "batteryLevel": batteryLevel,
            "batteryState": batteryState,
        ]
    }

    @objc private func stateChanged() {
        let next = Self.snapshot()
        let changed =
            (next["lowPowerMode"] as? Bool) != (lastSnapshot["lowPowerMode"] as? Bool)
            || (next["thermalState"] as? String) != (lastSnapshot["thermalState"] as? String)
            || abs(
                (next["batteryLevel"] as? Double ?? -1)
                    - (lastSnapshot["batteryLevel"] as? Double ?? -1)
            ) > 0.01
            || (next["batteryState"] as? String) != (lastSnapshot["batteryState"] as? String)
        guard changed else {
            return
        }
        lastSnapshot = next
        onChange?("onPowerStateChange", next)
    }
}
