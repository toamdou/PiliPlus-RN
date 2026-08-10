// Copyright 2026 PiliPlus. All rights reserved.

import ExpoModulesCore
import Foundation
import UIKit

enum DanmakuMode: String {
  case scroll
  case top
  case bottom
}

struct DanmakuItemRecord: Record {
  @Field var id: String = ""
  @Field var text: String = ""
  @Field var time: Double = 0
  @Field var duration: Double = 8
  @Field var color: String = "#FFFFFF"
  @Field var fontSize: Double = 15
  @Field var mode: String = "scroll"
  @Field var top: Double? = nil

  init() {}
}

struct DanmakuTapEventRecord: Record {
  @Field var id: String = ""
  @Field var text: String = ""
  @Field var time: Double = 0
  @Field var mode: String = "scroll"

  init() {}

  init(id: String, text: String, time: Double, mode: String) {
    self.id = id
    self.text = text
    self.time = time
    self.mode = mode
  }
}

struct SubtitleItemRecord: Record {
  @Field var from: Double = 0
  @Field var to: Double = 0
  @Field var content: String = ""

  init() {}
}

func piliColor(fromHex hex: String) -> UIColor {
  var value = hex.trimmingCharacters(in: CharacterSet.alphanumerics.inverted)
  if value.count > 6 {
    value = String(value.suffix(6))
  }
  var rgb: UInt64 = 0
  Scanner(string: value).scanHexInt64(&rgb)

  let red = CGFloat((rgb >> 16) & 0xFF) / 255.0
  let green = CGFloat((rgb >> 8) & 0xFF) / 255.0
  let blue = CGFloat(rgb & 0xFF) / 255.0
  return UIColor(red: red, green: green, blue: blue, alpha: 1)
}
