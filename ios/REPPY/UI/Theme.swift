import SwiftUI

enum TextTone { case normal, secondary, muted, error, warning }
extension TextTone {
    var color: Color {
        switch self {
        case .normal: return ReppyTheme.text
        case .secondary: return ReppyTheme.secondary
        case .muted: return ReppyTheme.muted
        case .error: return ReppyTheme.error
        case .warning: return ReppyTheme.warning
        }
    }
}
