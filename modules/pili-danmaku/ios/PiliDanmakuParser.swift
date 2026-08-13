// Copyright 2026 PiliPlus. All rights reserved.

import Foundation

enum PiliDanmakuParser {
    private static let vipGradualColor: UInt64 = 60001

    static func parseDmSegReply(_ data: Data) -> [[String: Any]] {
        var reader = WireReader(data: data)
        var items: [[String: Any]] = []

        while reader.offset < data.count {
            guard let tag = reader.readVarint() else {
                break
            }
            let field = Int(tag >> 3)
            let wire = Int(tag & 0x7)
            if field == 1 && wire == 2 {
                guard let elemData = reader.readLengthDelimited() else {
                    break
                }
                if let item = parseDmSegElem(elemData) {
                    items.append(item)
                }
            } else if !reader.skip(wire: wire) {
                break
            }
        }
        return items
    }

    static func parseXmlDanmaku(_ text: String) -> [[String: Any]] {
        guard let data = text.data(using: .utf8) else {
            return []
        }
        let parser = PiliXmlDanmakuParser()
        return parser.parse(data: data)
    }

    private static func parseDmSegElem(_ data: Data) -> [String: Any]? {
        var reader = WireReader(data: data)
        var id: UInt64?
        var idStr: String?
        var progress: UInt64?
        var mode: UInt64?
        var color: UInt64?
        var midHash = ""
        var content = ""
        var likeCount: UInt64?
        var colorful: UInt64?

        while reader.offset < data.count {
            guard let tag = reader.readVarint() else {
                return nil
            }
            let field = Int(tag >> 3)
            let wire = Int(tag & 0x7)

            switch field {
            case 1 where wire == 0:
                id = reader.readVarint()
            case 2 where wire == 0:
                progress = reader.readVarint()
            case 3 where wire == 0:
                mode = reader.readVarint()
            case 5 where wire == 0:
                color = reader.readVarint()
            case 6 where wire == 2:
                guard let value = reader.readLengthDelimited() else {
                    return nil
                }
                midHash = decodeUTF8(value)
            case 7 where wire == 2:
                guard let value = reader.readLengthDelimited() else {
                    return nil
                }
                content = decodeUTF8(value)
            case 12 where wire == 2:
                guard let value = reader.readLengthDelimited() else {
                    return nil
                }
                idStr = decodeUTF8(value)
            case 13 where wire == 0:
                if reader.readVarint() == nil {
                    return nil
                }
            case 15 where wire == 0:
                likeCount = reader.readVarint()
            case 24 where wire == 0:
                colorful = reader.readVarint()
            default:
                if !reader.skip(wire: wire) {
                    return nil
                }
            }
        }

        // 批次5 P1：放开 mode 白名单到 1~7。mode 2/3（滚动）、6/7（顶部）此前被丢弃，
        // 现由 Preparer 重新归类到 scroll/top/bottom 三类渲染（04-B6①）。
        guard let mode, mode >= 1, mode <= 7 else {
            return nil
        }

        var item: [String: Any] = [
            "id": idStr ?? (id.map { String($0) } ?? ""),
            "text": content,
            "time": Double(progress ?? 0) / 1000,
            "mode": Int(mode),
            "color": hexColor(color ?? 0),
            "userId": midHash,
            "colorful": colorful == vipGradualColor,
        ]
        if let likeCount, likeCount > 0 {
            item["likeCount"] = Double(likeCount)
        }
        return item
    }

    private static func decodeUTF8(_ data: Data) -> String {
        return String(data: data, encoding: .utf8) ?? ""
    }

    private static func hexColor(_ value: UInt64) -> String {
        if value == 0 {
            return "#FFFFFF"
        }
        return String(format: "#%06x", UInt32(truncatingIfNeeded: value))
    }
}

private struct WireReader {
    let data: Data
    var offset = 0

    init(data: Data) {
        self.data = data
    }

    mutating func readVarint() -> UInt64? {
        var result: UInt64 = 0
        var shift: UInt64 = 0

        while offset < data.count {
            let byte = data[offset]
            offset += 1
            let payload = UInt64(byte & 0x7f)
            if shift >= 64 {
                return nil
            }
            if shift == 63 {
                guard payload <= 1 else {
                    return nil
                }
                result |= payload << 63
            } else {
                result |= payload << shift
            }
            if byte & 0x80 == 0 {
                return result
            }
            shift += 7
        }
        return nil
    }

    mutating func readLengthDelimited() -> Data? {
        guard let lengthValue = readVarint(),
              let length = Int(exactly: lengthValue),
              length >= 0,
              offset <= data.count,
              length <= data.count - offset else {
            return nil
        }
        defer {
            offset += length
        }
        return data.subdata(in: offset..<(offset + length))
    }

    mutating func skip(wire: Int) -> Bool {
        switch wire {
        case 0:
            return readVarint() != nil
        case 1:
            return skipBytes(8)
        case 2:
            guard let lengthValue = readVarint(),
                  let length = Int(exactly: lengthValue),
                  length >= 0 else {
                return false
            }
            return skipBytes(length)
        case 5:
            return skipBytes(4)
        default:
            return false
        }
    }

    private mutating func skipBytes(_ count: Int) -> Bool {
        guard count >= 0, offset <= data.count, count <= data.count - offset else {
            return false
        }
        offset += count
        return true
    }
}

private final class PiliXmlDanmakuParser: NSObject, XMLParserDelegate {
    private var items: [[String: Any]] = []
    private var params: [String]?
    private var text = ""
    private var fallbackID = 0

    func parse(data: Data) -> [[String: Any]] {
        let parser = XMLParser(data: data)
        parser.delegate = self
        parser.parse()
        return items
    }

    func parser(
        _ parser: XMLParser,
        didStartElement elementName: String,
        namespaceURI: String?,
        qualifiedName qName: String?,
        attributes attributeDict: [String: String]
    ) {
        guard elementName == "d", let p = attributeDict["p"] else {
            return
        }
        params = p.components(separatedBy: ",")
        text = ""
    }

    func parser(_ parser: XMLParser, foundCharacters string: String) {
        if params != nil {
            text += string
        }
    }

    func parser(_ parser: XMLParser, foundCDATA CDATABlock: Data) {
        if params != nil, let value = String(data: CDATABlock, encoding: .utf8) {
            text += value
        }
    }

    func parser(
        _ parser: XMLParser,
        didEndElement elementName: String,
        namespaceURI: String?,
        qualifiedName qName: String?
    ) {
        guard elementName == "d", let currentParams = params else {
            return
        }
        let value = text
        params = nil
        text = ""

        // 批次5 P1：同 protobuf 路径，保留 1~7 全部 mode，交由 Preparer 归类渲染。
        guard let time = legacyParseDouble(currentParams.element(at: 0)),
              let mode = legacyParseInt(currentParams.element(at: 1)),
              mode >= 1, mode <= 7 else {
            return
        }

        let colorValue = legacyParseInt(currentParams.element(at: 3)) ?? 0
        let midHash = currentParams.element(at: 6)
        let dmid = currentParams.element(at: 7)
        let id: String
        if !dmid.isEmpty {
            id = dmid
        } else {
            id = String(fallbackID)
            fallbackID += 1
        }

        items.append([
            "id": id,
            "text": value,
            "time": time,
            "mode": mode,
            "color": colorValue == 0 ? "#FFFFFF" : String(format: "#%06x", colorValue),
            "userId": midHash,
            "colorful": false,
        ])
    }
}

private extension Array where Element == String {
    func element(at index: Int) -> String {
        return index < count ? self[index] : ""
    }
}

private func legacyParseInt(_ raw: String) -> Int? {
    let scalars = Array(raw.unicodeScalars)
    var index = 0
    while index < scalars.count, CharacterSet.whitespacesAndNewlines.contains(scalars[index]) {
        index += 1
    }

    var negative = false
    if index < scalars.count {
        if scalars[index] == "+" {
            index += 1
        } else if scalars[index] == "-" {
            negative = true
            index += 1
        }
    }

    guard index < scalars.count, isDigit(scalars[index]) else {
        return nil
    }

    var result = 0
    while index < scalars.count, isDigit(scalars[index]) {
        let digit = Int(scalars[index].value - 48)
        let multiplied = result.multipliedReportingOverflow(by: 10)
        guard !multiplied.overflow else {
            return nil
        }
        let added = multiplied.partialValue.addingReportingOverflow(digit)
        guard !added.overflow else {
            return nil
        }
        result = added.partialValue
        index += 1
    }
    return negative ? -result : result
}

private func legacyParseDouble(_ raw: String) -> Double? {
    let scalars = Array(raw.unicodeScalars)
    var index = 0
    while index < scalars.count, CharacterSet.whitespacesAndNewlines.contains(scalars[index]) {
        index += 1
    }

    var negative = false
    if index < scalars.count {
        if scalars[index] == "+" {
            index += 1
        } else if scalars[index] == "-" {
            negative = true
            index += 1
        }
    }

    var value = 0.0
    var fraction = 0.1
    var hasDigits = false
    while index < scalars.count, isDigit(scalars[index]) {
        value = value * 10 + Double(scalars[index].value - 48)
        hasDigits = true
        index += 1
    }
    if index < scalars.count, scalars[index] == "." {
        index += 1
        while index < scalars.count, isDigit(scalars[index]) {
            value += Double(scalars[index].value - 48) * fraction
            fraction *= 0.1
            hasDigits = true
            index += 1
        }
    }

    guard hasDigits else {
        return nil
    }

    if index < scalars.count, scalars[index] == "e" || scalars[index] == "E" {
        index += 1
        var exponentNegative = false
        if index < scalars.count {
            if scalars[index] == "+" {
                index += 1
            } else if scalars[index] == "-" {
                exponentNegative = true
                index += 1
            }
        }
        var exponent = 0
        var hasExponentDigits = false
        while index < scalars.count, isDigit(scalars[index]) {
            exponent = exponent * 10 + Int(scalars[index].value - 48)
            hasExponentDigits = true
            index += 1
        }
        if hasExponentDigits {
            value *= pow(10, exponentNegative ? -Double(exponent) : Double(exponent))
        }
    }

    return negative ? -value : value
}

private func isDigit(_ scalar: Unicode.Scalar) -> Bool {
    return scalar.value >= 48 && scalar.value <= 57
}
