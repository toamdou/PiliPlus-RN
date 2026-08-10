// Copyright 2026 PiliPlus. All rights reserved.

import CommonCrypto
import Foundation
import Security

enum PiliSignerError: LocalizedError {
    case invalidKey
    case keyCreationFailed(String)
    case encryptionFailed(String)

    var errorDescription: String? {
        switch self {
        case .invalidKey:
            return "Invalid RSA public key"
        case .keyCreationFailed(let message):
            return "RSA key creation failed: \(message)"
        case .encryptionFailed(let message):
            return "RSA encryption failed: \(message)"
        }
    }
}

enum PiliSigner {
    static let APP_KEY = "dfca71928277209b"
    static let APP_SEC = "b5475a8825547a4fc26c7d518eaaa02e"

    private static let mixinKeyEncTab = [
        46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35,
        27, 43, 5, 49, 33, 9, 42, 19, 29, 28, 14, 39, 12, 38, 41, 13,
    ]

    private static let jsEncodeAllowed = CharacterSet(
        charactersIn: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_.~!'()*"
    )

    private static let wbiFilteredCharacters = CharacterSet(charactersIn: "!'()*")

    // MARK: - MD5

    static func md5Hex(_ input: String) -> String {
        md5Hex(data: Data(input.utf8))
    }

    static func md5Hex(data: Data) -> String {
        var digest = [UInt8](repeating: 0, count: Int(CC_MD5_DIGEST_LENGTH))
        data.withUnsafeBytes { buffer in
            _ = CC_MD5(buffer.baseAddress, CC_LONG(data.count), &digest)
        }
        return digest.map { String(format: "%02x", $0) }.joined()
    }

    // MARK: - appSign

    static func appSign(
        params: [String: Any],
        appkey: String = APP_KEY,
        appsec: String = APP_SEC
    ) -> [String: Any] {
        var result = params
        result["appkey"] = appkey
        result["ts"] = String(Int(Date().timeIntervalSince1970))

        let query = appQuery(from: result)
        result["sign"] = md5Hex(query + appsec)
        return result
    }

    static func appQuery(from params: [String: Any]) -> String {
        let sortedKeys = params.keys.sorted()
        var pairs: [String] = []

        for key in sortedKeys {
            guard let value = params[key], !(value is NSNull) else {
                continue
            }
            let stringValue = stringify(value)
            if stringValue.isEmpty {
                pairs.append("\(jsEncodeURIComponent(key))=")
            } else {
                pairs.append("\(jsEncodeURIComponent(key))=\(jsEncodeURIComponent(stringValue))")
            }
        }
        return pairs.joined(separator: "&")
    }

    // MARK: - WBI

    static func wbiSign(params: [String: Any], mixinKey: String) -> [String: Any] {
        var result = params
        result["wts"] = Int(Date().timeIntervalSince1970)

        let query = wbiQuery(from: result)
        result["w_rid"] = md5Hex(query + mixinKey)
        return result
    }

    static func wbiQuery(from params: [String: Any]) -> String {
        let sortedKeys = params.keys.sorted()
        return sortedKeys.map { key in
            let value = stringify(params[key])
                .components(separatedBy: wbiFilteredCharacters)
                .joined()
            return "\(jsEncodeURIComponent(key))=\(jsEncodeURIComponent(value))"
        }.joined(separator: "&")
    }

    static func mixinKey(from imgUrl: String, subUrl: String) -> String {
        let origin = fileName(from: imgUrl) + fileName(from: subUrl)
        let characters = Array(origin)
        return mixinKeyEncTab.compactMap { index in
            guard characters.indices.contains(index) else {
                return nil
            }
            return String(characters[index])
        }.joined()
    }

    // MARK: - Login RSA

    static func rsaEncryptPKCS1(_ plaintext: String, pemPublicKey: String) throws -> String {
        let body = pemPublicKey
            .replacingOccurrences(of: "-----BEGIN PUBLIC KEY-----", with: "")
            .replacingOccurrences(of: "-----END PUBLIC KEY-----", with: "")
            .replacingOccurrences(of: "\r", with: "")
            .replacingOccurrences(of: "\n", with: "")
            .trimmingCharacters(in: .whitespacesAndNewlines)

        guard let der = Data(base64Encoded: body) else {
            throw PiliSignerError.invalidKey
        }

        let attributes: [CFString: Any] = [
            kSecAttrKeyType: kSecAttrKeyTypeRSA,
            kSecAttrKeyClass: kSecAttrKeyClassPublic,
        ]

        var createError: Unmanaged<CFError>?
        guard let key = SecKeyCreateWithData(der as CFData, attributes as CFDictionary, &createError) else {
            throw PiliSignerError.keyCreationFailed(
                (createError?.takeRetainedValue() as NSError?)?.localizedDescription ?? "unknown error"
            )
        }

        var encryptError: Unmanaged<CFError>?
        guard let encrypted = SecKeyCreateEncryptedData(
            key,
            .rsaEncryptionPKCS1,
            Data(plaintext.utf8) as CFData,
            &encryptError
        ) as Data? else {
            throw PiliSignerError.encryptionFailed(
                (encryptError?.takeRetainedValue() as NSError?)?.localizedDescription ?? "unknown error"
            )
        }

        return encrypted.base64EncodedString()
    }

    // MARK: - Encoding helpers

    private static func jsEncodeURIComponent(_ string: String) -> String {
        return string.addingPercentEncoding(withAllowedCharacters: jsEncodeAllowed) ?? string
    }

    private static func stringify(_ value: Any?) -> String {
        guard let value else {
            return "null"
        }
        if let string = value as? String {
            return string
        }
        if let bool = value as? Bool {
            return bool ? "true" : "false"
        }
        if let number = value as? NSNumber {
            if CFGetTypeID(number as CFTypeRef) == CFBooleanGetTypeID() {
                return number.boolValue ? "true" : "false"
            }
            let double = number.doubleValue
            if double.isFinite,
               double.rounded() == double,
               abs(double) < 9_007_199_254_740_992 {
                return String(Int64(double))
            }
            return String(describing: double)
        }
        if let array = value as? [Any] {
            return array.map { stringify($0) }.joined(separator: ",")
        }
        if value is [String: Any] {
            return "[object Object]"
        }
        return String(describing: value)
    }

    private static func fileName(from url: String) -> String {
        let lastComponent = url.split(separator: "/").last.map(String.init) ?? ""
        return lastComponent.split(separator: ".").first.map(String.init) ?? lastComponent
    }
}
