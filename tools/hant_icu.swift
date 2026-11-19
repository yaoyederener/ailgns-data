// 简体 → 繁体：用 macOS 自带的 ICU（Hans-Hant），一行进、一行出。只给 tools/hant.py 用。
import Foundation
while let line = readLine(strippingNewline: true) {
  print(line.applyingTransform(StringTransform("Hans-Hant"), reverse: false) ?? line)
}
