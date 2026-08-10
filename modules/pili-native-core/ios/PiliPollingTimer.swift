// Copyright 2026 PiliPlus. All rights reserved.

import Foundation
import Dispatch

/// Native polling timer: runs on a utility serial queue with in-flight tick coalescing.
final class PiliPollingTimer {
    private let queue = DispatchQueue(label: "com.piliplus.polling", qos: .utility)
    private var timer: DispatchSourceTimer?
    private var tickCount = 0
    private var generation = 0
    private var onTick: ((Int) -> Void)?
    private var asyncTick: ((Int) async -> Void)?
    private var currentTask: Task<Void, Never>?
    private var tickInFlight = false

    func start(intervalMs: Double, onTick: @escaping (Int) -> Void) {
        queue.sync {
            stopLocked()
            self.tickCount = 0
            self.onTick = onTick
            self.asyncTick = nil
            scheduleLocked(intervalMs: intervalMs)
        }
    }

    func startAsync(intervalMs: Double, onTick: @escaping (Int) async -> Void) {
        queue.sync {
            stopLocked()
            self.tickCount = 0
            self.onTick = nil
            self.asyncTick = onTick
            scheduleLocked(intervalMs: intervalMs)
        }
    }

    func stop() {
        queue.sync {
            stopLocked()
        }
    }

    private func stopLocked() {
        generation += 1
        timer?.cancel()
        timer = nil
        currentTask?.cancel()
        currentTask = nil
        onTick = nil
        asyncTick = nil
        tickCount = 0
        tickInFlight = false
    }

    private func scheduleLocked(intervalMs: Double) {
        let interval = max(intervalMs / 1000.0, 0.001)
        let timer = DispatchSource.makeTimerSource(queue: queue)
        timer.schedule(deadline: .now() + interval, repeating: interval, leeway: .milliseconds(50))
        timer.setEventHandler { [weak self] in
            self?.handleTick()
        }
        timer.resume()
        self.timer = timer
    }

    private func handleTick() {
        guard !tickInFlight else { return }
        tickCount += 1
        if let asyncTick {
            let count = tickCount
            let gen = generation
            tickInFlight = true
            currentTask = Task { [weak self] in
                await asyncTick(count)
                self?.queue.async { [weak self] in
                    guard let self, self.generation == gen else { return }
                    self.tickInFlight = false
                    self.currentTask = nil
                }
            }
        } else {
            onTick?(tickCount)
        }
    }

    deinit {
        timer?.cancel()
        currentTask?.cancel()
    }
}
