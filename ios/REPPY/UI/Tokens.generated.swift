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
    static let limeStrong = adaptive(0xb7e85a, 0x4f7111, darkAlpha: 1, lightAlpha: 1)
    static let brandSoft = adaptive(0xb7e85a, 0xb7e85a, darkAlpha: 0.11, lightAlpha: 0.11)
    static let error = adaptive(0xdc7d73, 0xa84336, darkAlpha: 1, lightAlpha: 1)
    static let warning = adaptive(0xffd166, 0x86492d, darkAlpha: 1, lightAlpha: 1)
    static let button = adaptive(0xffffff, 0x192317, darkAlpha: 0.07, lightAlpha: 0.08)
    static let outline = adaptive(0xffffff, 0x192317, darkAlpha: 0.12, lightAlpha: 0.2)
    static let navSelected = adaptive(0xecefe9, 0xacd957, darkAlpha: 1, lightAlpha: 1)
    static let focusSurface = adaptive(0xecefe9, 0xffffff, darkAlpha: 1, lightAlpha: 1)
    static let focusText = adaptive(0x070908, 0x070908, darkAlpha: 1, lightAlpha: 1)
    static let focusSecondary = adaptive(0x626961, 0x626961, darkAlpha: 1, lightAlpha: 1)
    static let focusAccent = adaptive(0x6f9518, 0x6f9518, darkAlpha: 1, lightAlpha: 1)
    static let trendUp = adaptive(0xb7e85a, 0x4f7111, darkAlpha: 1, lightAlpha: 1)
    static let trendDown = adaptive(0xff6a35, 0xa8442b, darkAlpha: 1, lightAlpha: 1)
    static let focusMeta = adaptive(0x5f7f18, 0x5f7f18, darkAlpha: 1, lightAlpha: 1)
    static let divider = adaptive(0xffffff, 0x192317, darkAlpha: 0.065, lightAlpha: 0.09)
    static let selectedText = Color(red: 7.0 / 255, green: 9.0 / 255, blue: 8.0 / 255)
}
enum ReppyMetrics {
    static let control: CGFloat = 48
    static let compact: CGFloat = 48
    static let small: CGFloat = 44
    static let radius: CGFloat = 12
    static let cardRadius: CGFloat = 20
    static let modalRadius: CGFloat = 24
    static let cardGap: CGFloat = 24
    static let exerciseTitle: CGFloat = 18
    static let pageInset: CGFloat = 20
    static let iconSize: CGFloat = 20
    static let quantityWidth: CGFloat = 20
    static let calendarMarker: CGFloat = 7
    static let addExerciseIcon: CGFloat = 27
    static let emptyIcon: CGFloat = 24
    static let emptyInset: CGFloat = 32
    static let emptyMinHeight: CGFloat = 220
    static let notesGap: CGFloat = 16
    static let notesPadding: CGFloat = 12
    static let notesMinHeight: CGFloat = 208
    static let notesFont: CGFloat = 16
    static let mediaMinHeight: CGFloat = 150
    static let focusTitleFont: CGFloat = 44
    static let focusInset: CGFloat = 22
    static let focusMinHeight: CGFloat = 310
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
