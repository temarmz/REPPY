import SwiftUI

struct ReppyToast: View {
    var message: String
    var actionTitle: String? = nil
    var action: (() -> Void)? = nil
    var body: some View {
        HStack(spacing: ReppyMetrics.space12) {
            Text(message).font(.subheadline).foregroundStyle(ReppyTheme.text)
                .frame(maxWidth: .infinity, alignment: .leading)
            if let actionTitle, let action {
                Button(actionTitle, action: action)
                    .font(.subheadline.weight(.semibold))
                    .padding(.horizontal, ReppyMetrics.space12)
                    .frame(minHeight: ReppyMetrics.small)
                    .background(ReppyTheme.button, in: RoundedRectangle(cornerRadius: ReppyMetrics.radius))
            }
        }
        .padding(ReppyMetrics.space12)
        .background(ReppyTheme.surface, in: RoundedRectangle(cornerRadius: ReppyMetrics.cardRadius))
        .shadow(color: .black.opacity(0.18), radius: 12, y: 4)
        .accessibilityElement(children: .contain)
    }
}
