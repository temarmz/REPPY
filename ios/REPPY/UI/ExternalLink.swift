import SwiftUI

struct ReppyExternalLink: View {
    var title: String
    var url: URL
    var body: some View { Link(destination: url) { Label(title, systemImage: "arrow.up.right") }.buttonStyle(ReppyButtonStyle()) }
}
