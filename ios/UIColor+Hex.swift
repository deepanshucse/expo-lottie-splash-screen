import UIKit

/// Convenience initialiser that parses a CSS-style hex colour string.
/// Accepts: "#RGB", "#RRGGBB", "#AARRGGBB" (with or without the leading #).
extension UIColor {
    convenience init?(hex: String) {
        var str = hex.trimmingCharacters(in: .whitespacesAndNewlines)
        if str.hasPrefix("#") { str = String(str.dropFirst()) }

        var value: UInt64 = 0
        guard Scanner(string: str).scanHexInt64(&value) else { return nil }

        switch str.count {
        case 3: // RGB shorthand
            let r = CGFloat((value & 0xF00) >> 8) / 15
            let g = CGFloat((value & 0x0F0) >> 4) / 15
            let b = CGFloat( value & 0x00F      ) / 15
            self.init(red: r, green: g, blue: b, alpha: 1)
        case 6: // RRGGBB
            let r = CGFloat((value & 0xFF0000) >> 16) / 255
            let g = CGFloat((value & 0x00FF00) >>  8) / 255
            let b = CGFloat( value & 0x0000FF        ) / 255
            self.init(red: r, green: g, blue: b, alpha: 1)
        case 8: // AARRGGBB
            let a = CGFloat((value & 0xFF000000) >> 24) / 255
            let r = CGFloat((value & 0x00FF0000) >> 16) / 255
            let g = CGFloat((value & 0x0000FF00) >>  8) / 255
            let b = CGFloat( value & 0x000000FF        ) / 255
            self.init(red: r, green: g, blue: b, alpha: a)
        default:
            return nil
        }
    }
}
