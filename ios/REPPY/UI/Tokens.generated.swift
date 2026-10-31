// Generated from app/ui/tokens.css by ios/scripts/sync-web-contract.mjs.
// Edit the web tokens, then run npm run ios:sync.
import SwiftUI

enum ReppyTheme {
    static func adaptive(_ dark: UInt32, _ light: UInt32, darkAlpha: CGFloat = 1, lightAlpha: CGFloat = 1) -> Color {
        Color(uiColor: UIColor { traits in
            let hex = traits.userInterfaceStyle == .dark ? dark : light
            return UIColor(red: CGFloat((hex >> 16) & 255) / 255, green: CGFloat((hex >> 8) & 255) / 255, blue: CGFloat(hex & 255) / 255, alpha: traits.userInterfaceStyle == .dark ? darkAlpha : lightAlpha)
        })
    }
    static let background = adaptive(0x070908, 0xf1f2eb, darkAlpha: 1, lightAlpha: 1)
    static let surface = adaptive(0x111411, 0xffffff, darkAlpha: 1, lightAlpha: 1)
    static let field = adaptive(0x090b09, 0xf7f8f3, darkAlpha: 1, lightAlpha: 1)
    static let text = adaptive(0xf5f6ef, 0x171b16, darkAlpha: 1, lightAlpha: 1)
    static let secondary = adaptive(0xc8ccc5, 0x465043, darkAlpha: 1, lightAlpha: 1)
    static let muted = adaptive(0x979d95, 0x687067, darkAlpha: 1, lightAlpha: 1)
    static let lime = adaptive(0xb7e85a, 0xacd957, darkAlpha: 1, lightAlpha: 1)
    static let error = adaptive(0xdc7d73, 0xa84336, darkAlpha: 1, lightAlpha: 1)
    static let warning = adaptive(0xffd166, 0x86492d, darkAlpha: 1, lightAlpha: 1)
    static let button = adaptive(0xffffff, 0x192317, darkAlpha: 0.07, lightAlpha: 0.08)
    static let outline = adaptive(0xffffff, 0x192317, darkAlpha: 0.12, lightAlpha: 0.2)
    static let selectedText = Color(red: 7.0 / 255, green: 9.0 / 255, blue: 8.0 / 255)
}
enum ReppyMetrics {
    static let control: CGFloat = 56
    static let compact: CGFloat = 48
    static let small: CGFloat = 44
    static let radius: CGFloat = 12
    static let cardRadius: CGFloat = 20
    static let modalRadius: CGFloat = 24
    static let cardGap: CGFloat = 24
    static let exerciseTitle: CGFloat = 18
    static let pageInset: CGFloat = 20
    static let space4: CGFloat = 4
    static let space6: CGFloat = 6
    static let space8: CGFloat = 8
    static let space12: CGFloat = 12
    static let space16: CGFloat = 16
    static let controlPadding: CGFloat = 16
    static let bodyFont: CGFloat = 17
    static let captionFont: CGFloat = 15
    static let titleFont: CGFloat = 34
    static let numberFont: CGFloat = 34
    static let setNumberFont: CGFloat = 20
    static let focusWidth: CGFloat = 3
}
