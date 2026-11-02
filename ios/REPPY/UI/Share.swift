import SwiftUI

struct ReppyShare: View {
    var title: String
    var item: String
    var kind: ActionKind = .primary
    var body: some View { ShareLink(item: item) { Label(title, systemImage: "square.and.arrow.up") }.buttonStyle(ReppyButtonStyle(kind: kind)) }
}
