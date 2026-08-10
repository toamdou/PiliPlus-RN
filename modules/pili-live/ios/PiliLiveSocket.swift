import Compression
import Foundation
import PiliNativeCore

struct PiliLiveJoinOptions {
  let roomId: Int
  let token: String
  let uid: Int
  let platform: String
  let protover: Int
}

final class PiliLiveSocket: NSObject, URLSessionWebSocketDelegate {
  private struct Config {
    let url: URL
    let headers: [String: String]
    var heartbeatIntervalMs: Double
    let maxReconnectDelayMs: Double
    let batchIntervalMs: Double
    let autoReconnect: Bool
    let join: PiliLiveJoinOptions?
  }

  typealias StatusHandler = (String, Int?, String?) -> Void
  typealias MessagesHandler = ([[String: Any]]) -> Void
  typealias ErrorHandler = (String, String) -> Void

  private static let deliverableCommands: Set<String> = [
    "DANMU_MSG",
    "SUPER_CHAT_MESSAGE",
    "SEND_GIFT",
    "GUARD_BUY",
    "INTERACT_WORD",
    "WATCHED_CHANGE",
    "ONLINE_RANK_COUNT",
    "ROOM_CHANGE",
  ]

  var onStatusChange: StatusHandler?
  var onMessages: MessagesHandler?
  var onError: ErrorHandler?

  private let queue = DispatchQueue(label: "pili.live.socket", qos: .userInitiated)
  private var session: URLSession?
  private var webSocketTask: URLSessionWebSocketTask?
  private var config: Config?
  private var generation = 0
  private var isUserDisconnect = true
  private var isConnected = false
  private var reconnectAttempt = 0
  private var heartbeatTimer: DispatchSourceTimer?
  private var reconnectWorkItem: DispatchWorkItem?
  private var batchWorkItem: DispatchWorkItem?
  private var pendingMessages: [[String: Any]] = []
  private var acceptInvalidSSL = false

  deinit {
    webSocketTask?.cancel(with: .normalClosure, reason: nil)
    session?.invalidateAndCancel()
  }

  @discardableResult
  func connect(
    urlString: String,
    headers: [String: String],
    heartbeatIntervalMs: Double,
    maxReconnectDelayMs: Double,
    batchIntervalMs: Double,
    autoReconnect: Bool,
    join: PiliLiveJoinOptions? = nil
  ) -> Bool {
    guard let url = URL(string: urlString), let scheme = url.scheme?.lowercased(), scheme == "wss" || scheme == "ws" else {
      onError?("invalid_url", "Invalid WebSocket URL")
      return false
    }

    var accepted = false
    queue.sync {
      teardown()
      let newConfig = Config(
        url: url,
        headers: headers,
        heartbeatIntervalMs: max(0, heartbeatIntervalMs),
        maxReconnectDelayMs: max(1000, maxReconnectDelayMs),
        batchIntervalMs: min(max(50, batchIntervalMs), 1000),
        autoReconnect: autoReconnect,
        join: join
      )
      config = newConfig
      isUserDisconnect = false
      reconnectAttempt = 0
      generation += 1
      startConnection(config: newConfig, generation: generation)
      accepted = true
    }
    return accepted
  }

  func disconnect() {
    queue.sync {
      isUserDisconnect = true
      teardown()
    }
  }

  @discardableResult
  func send(text: String? = nil, data: Data? = nil) -> Bool {
    var accepted = false
    queue.sync {
      guard let task = self.webSocketTask, task.state == .running, !self.isUserDisconnect else {
        return
      }

      let message: URLSessionWebSocketTask.Message
      if let text = text {
        message = .string(text)
      } else if let data = data {
        message = .data(data)
      } else {
        return
      }

      task.send(message) { [weak self] error in
        guard let error = error else { return }
        self?.queue.async {
          self?.emitError("send_failed", error.localizedDescription)
        }
      }
      accepted = true
    }
    return accepted
  }

  // MARK: - Connection

  private func startConnection(config: Config, generation: Int) {
    session?.invalidateAndCancel()
    session = nil
    emitStatus("connecting", nil, nil)

    let mergedOptions = PiliNetwork.mergedOptions([
        "timeoutMs": 30_000.0,
    ])
    acceptInvalidSSL = (mergedOptions["badCertificateCallback"] as? Bool) ?? false
    let sessionConfig = PiliNetwork.sessionConfiguration(for: mergedOptions)
    sessionConfig.waitsForConnectivity = true
    let newSession = URLSession(configuration: sessionConfig, delegate: self, delegateQueue: nil)
    session = newSession

    var request = URLRequest(url: config.url)
    request.timeoutInterval = 30
    for (key, value) in config.headers {
      request.setValue(value, forHTTPHeaderField: key)
    }

    let task = newSession.webSocketTask(with: request)
    task.maximumMessageSize = 8 * 1024 * 1024
    webSocketTask = task
    task.resume()

    receiveLoop(task: task, generation: generation)
  }

  private func receiveLoop(task: URLSessionWebSocketTask, generation: Int) {
    task.receive { [weak self] result in
      guard let self = self else { return }
      self.queue.async {
        guard self.generation == generation, self.webSocketTask === task, !self.isUserDisconnect else {
          return
        }

        switch result {
        case .success(let message):
          self.enqueue(message)
          self.receiveLoop(task: task, generation: generation)
        case .failure(let error):
          self.handleDisconnect(error: error, generation: generation)
        }
      }
    }
  }

  private func enqueue(_ message: URLSessionWebSocketTask.Message) {
    switch message {
    case .string(let text):
      if let data = text.data(using: .utf8),
         let object = try? JSONSerialization.jsonObject(with: data),
         let dictionary = object as? [String: Any] {
        if let shaped = Self.shapedMessage(dictionary) {
          pendingMessages.append(["type": "parsed", "data": shaped])
        }
      }
    case .data(let data):
      parseBinary(data, into: &pendingMessages)
    @unknown default:
      break
    }
    scheduleBatchFlush()
  }

  // MARK: - Bilibili binary protocol

  private struct FrameHeader {
    let totalSize: UInt32
    let headerSize: UInt16
    let protover: UInt16
    let operation: UInt32
    let sequence: UInt32
  }

  private static func readUInt16(_ data: Data, at offset: Int) -> UInt16 {
    (UInt16(data[offset]) << 8) | UInt16(data[offset + 1])
  }

  private static func readUInt32(_ data: Data, at offset: Int) -> UInt32 {
    (UInt32(data[offset]) << 24) |
      (UInt32(data[offset + 1]) << 16) |
      (UInt32(data[offset + 2]) << 8) |
      UInt32(data[offset + 3])
  }

  private static func parseHeader(_ data: Data, at offset: Int) -> FrameHeader? {
    guard offset >= 0, offset + 16 <= data.count else {
      return nil
    }
    return FrameHeader(
      totalSize: readUInt32(data, at: offset),
      headerSize: readUInt16(data, at: offset + 4),
      protover: readUInt16(data, at: offset + 6),
      operation: readUInt32(data, at: offset + 8),
      sequence: readUInt32(data, at: offset + 12)
    )
  }

  private static func parseJSONPayload(_ data: Data) -> [[String: Any]]? {
    guard !data.isEmpty,
          let object = try? JSONSerialization.jsonObject(with: data),
          let dictionary = object as? [String: Any] else {
      return nil
    }
    return [dictionary]
  }

  private static func decompressZlib(_ data: Data) -> Data? {
    guard !data.isEmpty else { return nil }
    var outputSize = max(1024, data.count * 4)
    while outputSize <= 8 * 1024 * 1024 {
      var output = Data(count: outputSize)
      let decodedSize = output.withUnsafeMutableBytes { outputBytes -> Int in
        guard let outputBase = outputBytes.bindMemory(to: UInt8.self).baseAddress else {
          return 0
        }
        return data.withUnsafeBytes { inputBytes -> Int in
          guard let inputBase = inputBytes.bindMemory(to: UInt8.self).baseAddress else {
            return 0
          }
          return compression_decode_buffer(
            outputBase,
            outputSize,
            inputBase,
            data.count,
            nil,
            COMPRESSION_ZLIB
          )
        }
      }
      if decodedSize > 0 {
        return Data(output.prefix(decodedSize))
      }
      outputSize *= 2
    }
    return nil
  }

  private func parseBinary(_ data: Data, into messages: inout [[String: Any]]) {
    var offset = 0
    while offset + 16 <= data.count {
      guard let header = Self.parseHeader(data, at: offset) else {
        return
      }

      let totalSize = Int(header.totalSize)
      let headerSize = Int(header.headerSize)
      let payloadStart = offset + headerSize
      let payloadEnd = offset + totalSize
      guard totalSize >= 16, totalSize <= 8 * 1024 * 1024, payloadEnd <= data.count else {
        return
      }
      guard headerSize >= 16, payloadStart <= payloadEnd else {
        offset = payloadEnd
        continue
      }

      if header.operation == 5 {
        let payload = data.subdata(in: payloadStart..<payloadEnd)
        switch header.protover {
        case 0, 1:
          if let objects = Self.parseJSONPayload(payload) {
            messages.append(contentsOf: objects.compactMap {
              Self.shapedMessage($0).map { ["type": "parsed", "data": $0] }
            })
          }
        case 2:
          if let decompressed = Self.decompressZlib(payload) {
            parseBinary(decompressed, into: &messages)
          }
        default:
          break
        }
      }
      offset = payloadEnd
    }
  }

  /// 直播页只消费少量命令；其余命令在原生侧直接丢弃，减少跨桥 JSON 与 JS 分支。
  private static func shapedMessage(_ dictionary: [String: Any]) -> [String: Any]? {
    guard let cmd = dictionary["cmd"] as? String,
          deliverableCommands.contains(cmd) else {
      return nil
    }
    switch cmd {
    case "DANMU_MSG":
      let info = dictionary["info"] as? [Any]
      let message = (info?.count ?? 0) > 1 ? (info?[1] as? String ?? "") : ""
      let user = (info?.count ?? 0) > 2 ? (info?[2] as? [Any]) : nil
      let uname = (user?.count ?? 0) > 1 ? (user?[1] as? String ?? "") : ""
      return [
        "cmd": cmd,
        "info": [NSNull(), message, [NSNull(), uname]],
      ]
    case "SUPER_CHAT_MESSAGE":
      let data = dictionary["data"] as? [String: Any]
      let userInfo = data?["user_info"] as? [String: Any]
      return [
        "cmd": cmd,
        "data": [
          "id": data?["id"] ?? NSNull(),
          "price": data?["price"] ?? NSNull(),
          "message": data?["message"] ?? NSNull(),
          "background_color": data?["background_color"] ?? NSNull(),
          "user_info": [
            "uname": userInfo?["uname"] ?? NSNull(),
            "face": userInfo?["face"] ?? NSNull(),
          ],
        ],
      ]
    case "SEND_GIFT":
      let data = dictionary["data"] as? [String: Any]
      let nested = data?["data"] as? [String: Any]
      return [
        "cmd": cmd,
        "data": [
          "uname": data?["uname"] ?? NSNull(),
          "giftName": data?["giftName"] ?? NSNull(),
          "gift_name": data?["gift_name"] ?? NSNull(),
          "num": data?["num"] ?? NSNull(),
          "data": [
            "uname": nested?["uname"] ?? NSNull(),
            "num": nested?["num"] ?? NSNull(),
          ],
        ],
      ]
    case "GUARD_BUY":
      let data = dictionary["data"] as? [String: Any]
      let nested = data?["data"] as? [String: Any]
      return [
        "cmd": cmd,
        "data": [
          "username": data?["username"] ?? NSNull(),
          "uname": data?["uname"] ?? NSNull(),
          "giftName": data?["giftName"] ?? NSNull(),
          "gift_name": data?["gift_name"] ?? NSNull(),
          "data": [
            "username": nested?["username"] ?? NSNull(),
          ],
        ],
      ]
    case "INTERACT_WORD":
      let data = dictionary["data"] as? [String: Any]
      let nested = data?["data"] as? [String: Any]
      return [
        "cmd": cmd,
        "data": [
          "uname": data?["uname"] ?? NSNull(),
          "msg_type": data?["msg_type"] ?? NSNull(),
          "data": [
            "uname": nested?["uname"] ?? NSNull(),
          ],
        ],
      ]
    case "WATCHED_CHANGE":
      let data = dictionary["data"] as? [String: Any]
      return [
        "cmd": cmd,
        "data": [
          "text_large": data?["text_large"] ?? NSNull(),
        ],
      ]
    case "ONLINE_RANK_COUNT":
      let data = dictionary["data"] as? [String: Any]
      return [
        "cmd": cmd,
        "data": [
          "count": data?["count"] ?? NSNull(),
        ],
      ]
    case "ROOM_CHANGE":
      let data = dictionary["data"] as? [String: Any]
      return [
        "cmd": cmd,
        "data": [
          "title": data?["title"] ?? NSNull(),
        ],
      ]
    default:
      return nil
    }
  }

  private static func appendUInt16(_ value: UInt16, to data: inout Data) {
    data.append(UInt8((value >> 8) & 0xff))
    data.append(UInt8(value & 0xff))
  }

  private static func appendUInt32(_ value: UInt32, to data: inout Data) {
    data.append(UInt8((value >> 24) & 0xff))
    data.append(UInt8((value >> 16) & 0xff))
    data.append(UInt8((value >> 8) & 0xff))
    data.append(UInt8(value & 0xff))
  }

  private static func makeJoinPacket(_ join: PiliLiveJoinOptions) -> Data? {
    let payloadObject: [String: Any] = [
      "uid": join.uid,
      "roomid": join.roomId,
      "protover": join.protover,
      "platform": join.platform,
      "type": 2,
      "key": join.token,
    ]
    guard let payload = try? JSONSerialization.data(withJSONObject: payloadObject) else {
      return nil
    }
    var frame = Data(capacity: 16 + payload.count)
    appendUInt32(UInt32(clamping: 16 + payload.count), to: &frame)
    appendUInt16(16, to: &frame)
    appendUInt16(1, to: &frame)
    appendUInt32(7, to: &frame)
    appendUInt32(1, to: &frame)
    frame.append(payload)
    return frame
  }

  private func sendJoinPacket() {
    guard let task = webSocketTask, task.state == .running, !isUserDisconnect else {
      return
    }
    guard let join = config?.join else { return }
    guard let packet = Self.makeJoinPacket(join) else {
      emitError("join_packet_failed", "Failed to build Bilibili join packet")
      return
    }
    task.send(.data(packet)) { [weak self] error in
      guard let error = error else { return }
      self?.queue.async {
        self?.emitError("join_failed", error.localizedDescription)
      }
    }
  }

  // MARK: - Heartbeat / batching

  private func startHeartbeat(config: Config, generation: Int) {
    stopHeartbeat()
    let intervalMs = config.heartbeatIntervalMs
    guard intervalMs > 0, isConnected else { return }

    let timer = DispatchSource.makeTimerSource(queue: queue)
    timer.schedule(deadline: .now() + intervalMs / 1000.0, repeating: intervalMs / 1000.0)
    timer.setEventHandler { [weak self] in
      self?.sendHeartbeat(generation: generation)
    }
    heartbeatTimer = timer
    timer.resume()
  }

  private func stopHeartbeat() {
    heartbeatTimer?.cancel()
    heartbeatTimer = nil
  }

  private func sendHeartbeat(generation: Int) {
    guard let task = webSocketTask, task.state == .running, !isUserDisconnect, self.generation == generation else {
      return
    }
    let message = URLSessionWebSocketTask.Message.data(Self.defaultBiliHeartbeat())

    task.send(message) { [weak self] error in
      guard let error = error else { return }
      self?.queue.async {
        self?.emitError("heartbeat_failed", error.localizedDescription)
      }
    }
  }

  private func scheduleBatchFlush() {
    guard batchWorkItem == nil, let config = config else { return }
    let interval = max(0.05, config.batchIntervalMs / 1000.0)
    let workItem = DispatchWorkItem { [weak self] in
      self?.batchWorkItem = nil
      self?.flushMessages()
    }
    batchWorkItem = workItem
    queue.asyncAfter(deadline: .now() + interval, execute: workItem)
  }

  private func cancelBatchFlush() {
    batchWorkItem?.cancel()
    batchWorkItem = nil
  }

  private func flushMessages() {
    guard !pendingMessages.isEmpty else { return }
    let messages = pendingMessages
    pendingMessages = []
    let handler = onMessages
    DispatchQueue.main.async {
      handler?(messages)
    }
  }

  private static func defaultBiliHeartbeat() -> Data {
    Data([
      0x00, 0x00, 0x00, 0x10,
      0x00, 0x10, 0x00, 0x01,
      0x00, 0x00, 0x00, 0x02,
      0x00, 0x00, 0x00, 0x01,
    ])
  }

  // MARK: - Reconnect

  private func handleClosed(code: Int, reason: String?, generation: Int) {
    guard generation == self.generation, !isUserDisconnect, webSocketTask != nil else {
      return
    }
    webSocketTask = nil
    session?.invalidateAndCancel()
    session = nil
    stopHeartbeat()
    cancelBatchFlush()
    isConnected = false
    flushMessages()

    if config?.autoReconnect == true {
      emitStatus("reconnecting", code, reason)
      scheduleReconnect(generation: generation)
    } else {
      emitStatus("closed", code, reason)
    }
  }

  private func handleDisconnect(error: Error, generation: Int) {
    guard generation == self.generation, !isUserDisconnect, webSocketTask != nil else {
      return
    }
    webSocketTask = nil
    session?.invalidateAndCancel()
    session = nil
    stopHeartbeat()
    cancelBatchFlush()
    isConnected = false
    flushMessages()

    let nsError = error as NSError
    let code = nsError.domain == NSURLErrorDomain ? String(nsError.code) : "socket_error"
    emitError(code, error.localizedDescription)

    if config?.autoReconnect == true {
      emitStatus("reconnecting", nsError.code, error.localizedDescription)
      scheduleReconnect(generation: generation)
    } else {
      emitStatus("closed", nsError.code, error.localizedDescription)
    }
  }

  private func scheduleReconnect(generation: Int) {
    guard !isUserDisconnect, generation == self.generation else { return }
    reconnectWorkItem?.cancel()

    let attempt = reconnectAttempt
    reconnectAttempt += 1
    let maxDelayMs = config?.maxReconnectDelayMs ?? 30000
    let baseMs = min(1000.0 * pow(2.0, Double(max(0, attempt - 1))), maxDelayMs)
    let jitterMs = Double.random(in: 0...250)
    let delayMs = min(baseMs + jitterMs, maxDelayMs)

    let workItem = DispatchWorkItem { [weak self] in
      guard let self = self else { return }
      guard generation == self.generation, !self.isUserDisconnect, let config = self.config else {
        return
      }
      self.reconnectWorkItem = nil
      self.startConnection(config: config, generation: generation)
    }
    reconnectWorkItem = workItem
    queue.asyncAfter(deadline: .now() + delayMs / 1000.0, execute: workItem)
  }

  private func teardown() {
    reconnectWorkItem?.cancel()
    reconnectWorkItem = nil
    stopHeartbeat()
    cancelBatchFlush()
    webSocketTask?.cancel(with: .normalClosure, reason: nil)
    webSocketTask = nil
    session?.invalidateAndCancel()
    session = nil
    pendingMessages = []
    isConnected = false
  }

  // MARK: - Events

  private func emitStatus(_ status: String, _ code: Int?, _ reason: String?) {
    let handler = onStatusChange
    DispatchQueue.main.async {
      handler?(status, code, reason)
    }
  }

  private func emitError(_ code: String, _ message: String) {
    let handler = onError
    DispatchQueue.main.async {
      handler?(code, message)
    }
  }

  // MARK: - URLSessionWebSocketDelegate

  func urlSession(
    _ session: URLSession,
    didReceive challenge: URLAuthenticationChallenge,
    completionHandler: @escaping (URLSession.AuthChallengeDisposition, URLCredential?) -> Void
  ) {
    if acceptInvalidSSL,
       let serverTrust = challenge.protectionSpace.serverTrust {
      let credential = URLCredential(trust: serverTrust)
      completionHandler(.useCredential, credential)
    } else {
      completionHandler(.performDefaultHandling, nil)
    }
  }

  func urlSession(_ session: URLSession, webSocketTask: URLSessionWebSocketTask, didOpenWithProtocol protocol: String?) {
    queue.async {
      guard self.webSocketTask === webSocketTask, !self.isUserDisconnect else { return }
      self.isConnected = true
      self.reconnectAttempt = 0
      self.emitStatus("open", nil, nil)
      self.sendJoinPacket()
      if let config = self.config {
        self.startHeartbeat(config: config, generation: generation)
      }
    }
  }

  func urlSession(
    _ session: URLSession,
    webSocketTask: URLSessionWebSocketTask,
    didCloseWith closeCode: URLSessionWebSocketTask.CloseCode,
    reason: Data?
  ) {
    queue.async {
      let reasonString = reason.flatMap { String(data: $0, encoding: .utf8) }
      self.handleClosed(code: closeCode.rawValue, reason: reasonString, generation: self.generation)
    }
  }

  func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
    queue.async {
      guard let webSocketTask = task as? URLSessionWebSocketTask, self.webSocketTask === webSocketTask, !self.isUserDisconnect else {
        return
      }
      if let error = error {
        self.handleDisconnect(error: error, generation: self.generation)
      }
    }
  }
}
