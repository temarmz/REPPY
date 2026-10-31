import SwiftUI

// Native SF font with the shared base sizes, scaling through iOS Dynamic Type.
struct ReppyTypography: ViewModifier {
    enum Role { case title, heading, body, caption, number, button }
    var role: Role
    @ScaledMetric(relativeTo: .largeTitle) private var title = ReppyMetrics.titleFont
    @ScaledMetric(relativeTo: .headline) private var heading = ReppyMetrics.exerciseTitle
    @ScaledMetric(relativeTo: .body) private var bodySize = ReppyMetrics.bodyFont
    @ScaledMetric(relativeTo: .subheadline) private var caption = ReppyMetrics.captionFont
    @ScaledMetric(relativeTo: .largeTitle) private var number = ReppyMetrics.numberFont
    func body(content: Content) -> some View {
        content.font(.system(size: size, weight: weight))
    }
    private var size: CGFloat {
        switch role { case .title: return title; case .heading: return heading; case .body, .button: return bodySize; case .caption: return caption; case .number: return number }
    }
    private var weight: Font.Weight {
        switch role { case .title: return .bold; case .heading, .number, .button: return .semibold; case .body, .caption: return .regular }
    }
}
extension View {
    func reppyTypography(_ role: ReppyTypography.Role) -> some View { modifier(ReppyTypography(role: role)) }
}

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
