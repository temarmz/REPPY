import SwiftUI

struct ReppyNotesGrid<Content: View>: View {
    @Environment(\.dynamicTypeSize) private var typeSize
    @ViewBuilder var content: () -> Content
    var body: some View {
        LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 16), count: typeSize.isAccessibilitySize ? 1 : 2), spacing: 16, content: content)
    }
}

struct NoteDayCard: View {
    var day: String
    @Binding var text: String
    var pending = false
    var error: String?
    var retry: () -> Void = {}
    var body: some View {
        ReppyCard {
            ReppyCaption(text: ReppyDate.display(day))
            TextEditor(text: $text).font(.body).scrollContentBackground(.hidden)
                .frame(minHeight: 180).accessibilityLabel("Заметка на \(ReppyDate.display(day))")
            if let error { ReppyStatus(message: error, error: true, actionTitle: "Повторить", action: retry) }
            else if pending { ReppyCaption(text: "Сохраняем…") }
        }
    }
}
