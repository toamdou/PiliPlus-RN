// Copyright 2026 PiliPlus. All rights reserved.

import ExpoModulesCore
import UIKit

public final class PiliLiveModule: Module {
    private let socket = PiliLiveSocket()
    private var isInBackground = false
    private var lifecycleObservers: [NSObjectProtocol] = []

    public func definition() -> ModuleDefinition {
        Name("PiliLive")

        Events("onMessages", "onStatusChange", "onError")

        AsyncFunction("isAvailableAsync") { () -> Bool in
            true
        }

        AsyncFunction("connectAsync") { (url: String, headers: [String: String], heartbeatIntervalMs: Double, options: PiliLiveConnectOptions?) -> Bool in
            self.configureSocket()
            let join = options?.join.map { joinOptions in
                PiliLiveJoinOptions(
                    roomId: joinOptions.roomId,
                    token: joinOptions.token,
                    uid: joinOptions.uid,
                    platform: joinOptions.platform,
                    protover: joinOptions.protover
                )
            }
            return self.socket.connect(
                urlString: url,
                headers: headers,
                heartbeatIntervalMs: heartbeatIntervalMs,
                maxReconnectDelayMs: options?.maxReconnectDelayMs ?? 30000,
                batchIntervalMs: options?.batchIntervalMs ?? 150,
                autoReconnect: options?.autoReconnect ?? true,
                join: join
            )
        }

        AsyncFunction("disconnectAsync") {
            self.socket.disconnect()
        }

        AsyncFunction("sendAsync") { (message: PiliLiveSendMessage) -> Bool in
            if message.type == "text" {
                return self.socket.send(text: message.text)
            }
            return self.socket.send(data: message.data)
        }

        OnDestroy {
            for observer in self.lifecycleObservers {
                NotificationCenter.default.removeObserver(observer)
            }
            self.lifecycleObservers.removeAll()
            self.socket.disconnect()
        }
    }

    private func configureSocket() {
        guard socket.onStatusChange == nil else { return }
        lifecycleObservers.append(
            NotificationCenter.default.addObserver(
                forName: UIApplication.didEnterBackgroundNotification,
                object: nil,
                queue: .main
            ) { [weak self] _ in
                self?.isInBackground = true
            }
        )
        lifecycleObservers.append(
            NotificationCenter.default.addObserver(
                forName: UIApplication.didBecomeActiveNotification,
                object: nil,
                queue: .main
            ) { [weak self] _ in
                self?.isInBackground = false
            }
        )
        socket.onStatusChange = { [weak self] status, code, reason in
            DispatchQueue.main.async {
                self?.sendEvent("onStatusChange", [
                    "status": status,
                    "code": code as Any,
                    "reason": reason as Any,
                ])
            }
        }
        socket.onMessages = { [weak self] messages in
            DispatchQueue.main.async {
                guard let self, !self.isInBackground else { return }
                self.sendEvent("onMessages", ["messages": messages])
            }
        }
        socket.onError = { [weak self] code, message in
            DispatchQueue.main.async {
                self?.sendEvent("onError", ["code": code, "message": message])
            }
        }
    }
}

struct PiliLiveJoin: Record {
    @Field var roomId: Int = 0
    @Field var token: String = ""
    @Field var uid: Int = 0
    @Field var platform: String = "web"
    @Field var protover: Int = 1
}

struct PiliLiveConnectOptions: Record {
    @Field var maxReconnectDelayMs: Double = 30000
    @Field var batchIntervalMs: Double = 150
    @Field var autoReconnect: Bool = true
    @Field var join: PiliLiveJoin?
}

struct PiliLiveSendMessage: Record {
    @Field var type: String = "text"
    @Field var text: String = ""
    @Field var data: Data = Data()
}
