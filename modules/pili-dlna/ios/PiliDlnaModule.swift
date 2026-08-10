// Copyright 2026 PiliPlus. All rights reserved.

import ExpoModulesCore
import Foundation
import PiliNativeCore

public final class PiliDlnaModule: Module {
    private static let avTransportService = "urn:schemas-upnp-org:service:AVTransport:1"

    private let discovery = PiliDlnaDiscovery()
    private var pendingDiscovery: PendingDlnaDiscovery?

    public func definition() -> ModuleDefinition {
        Name("PiliDlna")

        AsyncFunction("isAvailableAsync") { () -> Bool in
            true
        }

        AsyncFunction("discoverDevicesAsync") { (timeoutMs: Double) async -> [[String: Any]] in
            await self.discoverDevices(timeoutMs: timeoutMs)
        }

        AsyncFunction("stopDiscoveryAsync") { () -> Bool in
            self.stopDiscovery()
            return true
        }

        AsyncFunction("soapActionAsync") { (controlUrl: String, action: String, args: [String: String]) async throws -> Bool in
            try await Self.soapAction(controlUrl: controlUrl, action: action, args: args)
        }

        OnDestroy {
            self.stopDiscovery()
        }
    }

    private func discoverDevices(timeoutMs: Double) async -> [[String: Any]] {
        await withCheckedContinuation { continuation in
            DispatchQueue.main.async { [weak self] in
                guard let self else {
                    continuation.resume(returning: [])
                    return
                }
                self.beginDiscovery(timeoutMs: timeoutMs) { devices in
                    continuation.resume(returning: devices)
                }
            }
        }
    }

    private func beginDiscovery(timeoutMs: Double, completion: @escaping ([[String: Any]]) -> Void) {
        finishPendingDiscovery()

        let timeout = max(1000, min(timeoutMs, 30000))
        let pending = PendingDlnaDiscovery()
        pending.completion = completion
        pendingDiscovery = pending

        discovery.onResponse = { [weak self] location, usn in
            guard let self, let pending = self.pendingDiscovery, !pending.isFinished else {
                return
            }
            let normalizedLocation = location.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !normalizedLocation.isEmpty,
                  !pending.requestedLocations.contains(normalizedLocation) else {
                return
            }
            pending.requestedLocations.insert(normalizedLocation)
            let key = (usn ?? "").isEmpty ? normalizedLocation : usn!
            guard pending.devices[key] == nil else {
                return
            }
            Task {
                let description = await Self.fetchDeviceDescription(location: normalizedLocation)
                let device = Self.device(
                    from: description,
                    key: key,
                    location: normalizedLocation
                )
                DispatchQueue.main.async {
                    guard pending === self.pendingDiscovery, !pending.isFinished else {
                        return
                    }
                    if device == nil {
                        pending.requestedLocations.remove(normalizedLocation)
                    }
                    self.addDevice(device, key: key, pending: pending)
                }
            }
        }

        let started = discovery.start(timeoutMs: timeout)
        guard started else {
            pendingDiscovery = nil
            discovery.onResponse = nil
            completion([])
            return
        }

        let workItem = DispatchWorkItem { [weak self] in
            self?.finishPendingDiscovery()
        }
        pending.finishWorkItem = workItem
        DispatchQueue.main.asyncAfter(
            deadline: .now() + .milliseconds(Int(timeout)),
            execute: workItem
        )
    }

    private func addDevice(_ device: [String: Any]?, key: String, pending: PendingDlnaDiscovery) {
        guard pending === pendingDiscovery,
              !pending.isFinished,
              let device,
              pending.devices[key] == nil else {
            return
        }
        pending.devices[key] = device
        pending.deviceOrder.append(key)
    }

    private func finishPendingDiscovery() {
        guard let pending = pendingDiscovery, !pending.isFinished else {
            return
        }
        pending.isFinished = true
        pending.finishWorkItem?.cancel()
        pending.finishWorkItem = nil
        discovery.onResponse = nil
        discovery.stop()
        let devices = pending.deviceOrder.compactMap { pending.devices[$0] }
        pending.completion?(devices)
        pending.completion = nil
        pendingDiscovery = nil
    }

    private func stopDiscovery() {
        discovery.stop()
        DispatchQueue.main.async { [weak self] in
            self?.finishPendingDiscovery()
        }
    }

    private static func device(
        from description: [String: Any]?,
        key: String,
        location: String
    ) -> [String: Any]? {
        guard let description,
              let controlUrl = description["controlUrl"] as? String,
              !controlUrl.isEmpty else {
            return nil
        }
        return [
            "key": key,
            "friendlyName": description["friendlyName"] as? String ?? location,
            "location": location,
            "controlUrl": controlUrl,
        ]
    }

    private static func fetchDeviceDescription(location: String) async -> [String: Any]? {
        guard let baseURL = URL(string: location) else {
            return nil
        }
        guard isHttpURL(baseURL) else {
            return nil
        }

        var request = URLRequest(url: baseURL)
        request.timeoutInterval = 10
        request.cachePolicy = .reloadIgnoringLocalCacheData

        do {
            let (data, response) = try await PiliNetwork.session(
                for: PiliNetwork.mergedOptions([
                    "useSystemProxy": false,
                    "timeoutMs": 10_000.0,
                ])
            ).data(for: request)
            guard let httpResponse = response as? HTTPURLResponse,
                  (200..<300).contains(httpResponse.statusCode),
                  !data.isEmpty else {
                return nil
            }

            let parser = PiliDlnaDescriptionParser(avTransportService: avTransportService)
            return parser.parse(data: data, baseURL: baseURL)
        } catch {
            return nil
        }
    }

    private static func soapAction(controlUrl: String, action: String, args: [String: String]) async throws -> Bool {
        guard let url = URL(string: controlUrl), !action.isEmpty else {
            throw PiliDlnaError.invalidRequest
        }
        guard isHttpURL(url) else {
            throw PiliDlnaError.invalidRequest
        }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.timeoutInterval = 10
        request.cachePolicy = .reloadIgnoringLocalCacheData
        request.setValue("text/xml; charset=\"utf-8\"", forHTTPHeaderField: "Content-Type")
        request.setValue("\"\(avTransportService)#\(action)\"", forHTTPHeaderField: "SOAPAction")
        request.httpBody = Data(soapBody(action: action, args: args).utf8)

        let (_, response) = try await PiliNetwork.session(
            for: PiliNetwork.mergedOptions([
                "useSystemProxy": false,
                "timeoutMs": 10_000.0,
            ])
        ).data(for: request)
        guard let httpResponse = response as? HTTPURLResponse else {
            throw PiliDlnaError.invalidResponse
        }
        guard (200..<300).contains(httpResponse.statusCode) else {
            throw PiliDlnaError.soapStatus(httpResponse.statusCode)
        }
        return true
    }

    private static func isHttpURL(_ url: URL) -> Bool {
        guard let scheme = url.scheme?.lowercased() else {
            return false
        }
        return scheme == "http" || scheme == "https"
    }

    private static func soapBody(action: String, args: [String: String]) -> String {
        let fields = soapArgumentOrder(for: action).compactMap { name -> String? in
            guard let value = args[name] else {
                return nil
            }
            return "<\(name)>\(escapeXml(value))</\(name)>"
        }.joined()
        return """
        <?xml version="1.0" encoding="utf-8"?>
        <s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">
        <s:Body><u:\(action) xmlns:u="\(avTransportService)">\(fields)</u:\(action)></s:Body></s:Envelope>
        """
    }

    private static func soapArgumentOrder(for action: String) -> [String] {
        switch action {
        case "SetAVTransportURI":
            return ["InstanceID", "CurrentURI", "CurrentURIMetaData"]
        case "Play":
            return ["InstanceID", "Speed"]
        case "Pause", "Stop":
            return ["InstanceID"]
        default:
            return []
        }
    }

    private static func escapeXml(_ value: String) -> String {
        value
            .replacingOccurrences(of: "&", with: "&amp;")
            .replacingOccurrences(of: "<", with: "&lt;")
            .replacingOccurrences(of: ">", with: "&gt;")
            .replacingOccurrences(of: "\"", with: "&quot;")
            .replacingOccurrences(of: "'", with: "&apos;")
    }
}

private final class PendingDlnaDiscovery {
    var completion: (([[String: Any]]) -> Void)?
    var devices: [String: [String: Any]] = [:]
    var deviceOrder: [String] = []
    var requestedLocations = Set<String>()
    var finishWorkItem: DispatchWorkItem?
    var isFinished = false
}

private enum PiliDlnaError: LocalizedError {
    case invalidRequest
    case invalidResponse
    case soapStatus(Int)

    var errorDescription: String? {
        switch self {
        case .invalidRequest:
            return "Invalid DLNA request"
        case .invalidResponse:
            return "Invalid DLNA response"
        case .soapStatus(let status):
            return "DLNA SOAP failed: \(status)"
        }
    }
}

private final class PiliDlnaDescriptionParser: NSObject, XMLParserDelegate {
    private let avTransportService: String
    private var friendlyName: String?
    private var controlURL: String?
    private var serviceDepth = 0
    private var isAVTransportService = false
    private var readingFriendlyName = false
    private var readingServiceType = false
    private var readingControlURL = false
    private var text = ""

    init(avTransportService: String) {
        self.avTransportService = avTransportService
    }

    func parse(data: Data, baseURL: URL) -> [String: Any]? {
        let parser = XMLParser(data: data)
        parser.shouldProcessNamespaces = true
        parser.delegate = self
        parser.parse()

        guard let controlURL,
              let resolvedURL = URL(string: controlURL, relativeTo: baseURL)?.absoluteURL else {
            return nil
        }
        return [
            "friendlyName": friendlyName ?? baseURL.absoluteString,
            "controlUrl": resolvedURL.absoluteString,
        ]
    }

    func parser(
        _ parser: XMLParser,
        didStartElement elementName: String,
        namespaceURI: String?,
        qualifiedName qName: String?,
        attributes attributeDict: [String: String]
    ) {
        text = ""

        switch elementName {
        case "service":
            serviceDepth += 1
            isAVTransportService = false
        case "friendlyName" where friendlyName == nil:
            readingFriendlyName = true
        case "serviceType" where serviceDepth > 0:
            readingServiceType = true
        case "controlURL" where serviceDepth > 0 && isAVTransportService && controlURL == nil:
            readingControlURL = true
        default:
            break
        }
    }

    func parser(_ parser: XMLParser, foundCharacters string: String) {
        text += string
    }

    func parser(_ parser: XMLParser, foundCDATA CDATABlock: Data) {
        if let value = String(data: CDATABlock, encoding: .utf8) {
            text += value
        }
    }

    func parser(
        _ parser: XMLParser,
        didEndElement elementName: String,
        namespaceURI: String?,
        qualifiedName qName: String?
    ) {
        let value = text.trimmingCharacters(in: .whitespacesAndNewlines)

        switch elementName {
        case "friendlyName" where readingFriendlyName:
            if friendlyName == nil, !value.isEmpty {
                friendlyName = value
            }
            readingFriendlyName = false
        case "serviceType" where readingServiceType:
            isAVTransportService = value == avTransportService
            readingServiceType = false
        case "controlURL" where readingControlURL:
            if controlURL == nil, !value.isEmpty {
                controlURL = value
            }
            readingControlURL = false
        case "service":
            serviceDepth = max(0, serviceDepth - 1)
            if serviceDepth == 0 {
                isAVTransportService = false
            }
        default:
            break
        }
    }
}
