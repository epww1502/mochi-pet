// 쿼카 픽셀 앱 아이콘(1024x1024 PNG)을 만든다.
// 사용: swift scripts/make-icon.swift src-tauri/icons/source.png && npx tauri icon src-tauri/icons/source.png
import AppKit

let rows = [
  "................",
  "..ooo......ooo..",
  ".oxxbo....obxxo.",
  ".oxbbooooobbbxo.",
  "..obbbbbbbbbbo..",
  ".obsbbbbbbbbbbo.",
  "obsbbbbbbbbbbbbo",
  "obbbbebbbbebbbbo",
  "obbcbebnnbebcbbo",
  "obbbbbbmmbbbbbbo",
  ".obbbbbbbbbbbbo.",
  "..oobbbbbbbboo..",
  "....oooooooo....",
  "...oo......oo...",
]
let colors: [Character: NSColor] = [
  "o": NSColor(red: 0.36, green: 0.23, blue: 0.16, alpha: 1),
  "b": NSColor(red: 0.85, green: 0.66, blue: 0.47, alpha: 1),
  "s": .white,
  "x": NSColor(red: 0.96, green: 0.60, blue: 0.63, alpha: 1),
  "c": NSColor(red: 0.96, green: 0.60, blue: 0.63, alpha: 1),
  "e": NSColor(red: 0.17, green: 0.11, blue: 0.08, alpha: 1),
  "n": NSColor(red: 0.17, green: 0.11, blue: 0.08, alpha: 1),
  "m": NSColor(red: 0.17, green: 0.11, blue: 0.08, alpha: 1),
]
let size = 1024
let rep = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: size, pixelsHigh: size, bitsPerSample: 8, samplesPerPixel: 4,
                           hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
NSGraphicsContext.saveGraphicsState()
NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)
// 둥근 사각형 배경 (민트)
let bg = NSBezierPath(roundedRect: NSRect(x: 64, y: 64, width: 896, height: 896), xRadius: 200, yRadius: 200)
NSColor(red: 0.78, green: 0.94, blue: 0.85, alpha: 1).setFill()
bg.fill()
// 16x14 픽셀을 가운데에
let cell = 44.0
let ox = (Double(size) - 16 * cell) / 2
let oy = (Double(size) - 14 * cell) / 2 - 20
for (y, row) in rows.enumerated() {
  for (x, ch) in row.enumerated() {
    guard let c = colors[ch] else { continue }
    c.setFill()
    // AppKit은 아래가 0이라 뒤집는다
    NSRect(x: ox + Double(x) * cell, y: Double(size) - oy - Double(y + 1) * cell, width: cell, height: cell).fill()
  }
}
NSGraphicsContext.restoreGraphicsState()
let out = CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : "icon.png"
try! rep.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: out))
print("저장: \(out)")
