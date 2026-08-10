// Copyright 2026 PiliPlus. All rights reserved.

import Foundation
import Network

final class PiliDlnaDiscovery {
    typealias ResponseHandler = (String, String?) -> Void

    var onResponse: ResponseHandler?

    private let queue = DispatchQueue(label: "pili.dlna.discovery", qos: .userInitiated)
    private var connectionGroup: NWConnectionGroup?
    private var stopTimer: DispatchSourceTimer?
    private var generation = 0

    @discardableResult
    func start(timeoutMs: Double) -> Bool {
        let timeout = max(1000, min(timeoutMs, 30000))
        var accepted = false
        queue.sync {
            stopLocked()
            generation += 1
            let currentGeneration = generation

            do {
                let port = NWEndpoint.Port(rawValue: 1900)!
                let group = try NWMulticastGroup(
                    for: [.hostPort(host: NWEndpoint.Host("239.255.255.250"), port: port)],
                    from: nil,
                    disableUnicast: false
                )
                let parameters = NWParameters.udp
                parameters.allowLocalEndpointReuse = true

                let connection = NWConnectionGroup(with: group, using: parameters)
                connection.stateUpdateHandler = { [weak self] state in
                    guard let self, self.generation == currentGeneration else {
                        return
                    }
                    switch state {
                    case .ready:
                        self.sendSearch(generation: currentGeneration)
                    case .failed:
                        self.stopLocked()
                    default:
                        break
                    }
                }
                connection.setReceiveHandler(maximumMessageSize: 64 * 1024, rejectOversizedMessages: true) {
                    [weak self] _, data, _ in
                    guard let self, self.generation == currentGeneration, let data else {
                        return
                    }
                    self.handleResponse(data, generation: currentGeneration)
                }
                connectionGroup = connection
                accepted = true

                let timer = DispatchSource.makeTimerSource(queue: queue)
                timer.schedule(deadline: .now() + .milliseconds(Int(timeout)))
                timer.setEventHandler { [weak self] in
                    self?.stopLocked()
                }
                timer.resume()
                stopTimer = timer

                connection.start(queue: queue)
            } catch {
                accepted = false
            }
        }
        return accepted
    }

    func stop() {
        queue.sync {
            stopLocked()
        }
    }

    private func stopLocked() {
        generation += 1
        stopTimer?.cancel()
        stopTimer = nil
        connectionGroup?.cancel()
        connectionGroup = nil
    }

    private func sendSearch(generation: Int) {
        let payload = [
            "M-SEARCH * HTTP/1.1",
            "HOST: 239.255.255.250:1900",
            "MAN: \"ssdp:discover\"",
            "MX: 2",
            "ST: urn:schemas-upnp-org:device:MediaRenderer:1",
            "USER-AGENT: PiliPlus/1.0",
            "",
            "",
        ].joined(separator: "\r\n")
        guard let data = payload.data(using: .utf8) else {
            return
        }
        connectionGroup?.send(content: data) { _ in
            // 发送失败不阻断；组播网络在部分路由器上会延迟响应。
        }
    }

    private func handleResponse(_ data: Data, generation: Int) {
        guard generation == self.generation,
              let text = String(data: data, encoding: .utf8) else {
            return
        }

        var location: String?
        var usn: String?
        for line in text.components(separatedBy: "\r\n") {
            let lower = line.lowercased()
            if lower.hasPrefix("location:"), location == nil {
                location = line.dropFirst("location:".count)
                    .trimmingCharacters(in: .whitespacesAndNewlines)
            } else if lower.hasPrefix("usn:"), usn == nil {
                usn = line.dropFirst("usn:".count)
                    .trimmingCharacters(in: .whitespacesAndNewlines)
            }
        }

        guard let location, !location.isEmpty else {
            return
        }
        DispatchQueue.main.async { [weak self] in
            self?.onResponse?(location, usn)
        }
    }
}
