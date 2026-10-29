import SwiftUI

struct ReppyShare: View {
    var title: String
    var item: String
    var body: some View { ShareLink(item: item) { Label(title, systemImage: "square.and.arrow.up") }.buttonStyle(ReppyButtonStyle(kind: .primary)) }
}
