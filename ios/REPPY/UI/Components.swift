import SwiftUI

struct ReppyPage<Content: View>: View {
    var back = false
    @EnvironmentObject private var store: AppStore
    @Environment(\.dismiss) private var dismiss
    @State private var discardDraft = false
    @ViewBuilder var content: () -> Content
    var body: some View {
        ScrollView { VStack(alignment: .leading, spacing: ReppyMetrics.cardGap) {
            if !store.networkAvailable && !store.isDemo { ReppyStatus(message: "Нет сети. Несохранённый прогресс останется в черновике на этом iPhone.") }
            if let error = store.error {
                ReppyStatus(message: error, error: true, actionTitle: store.failedDraft != nil ? "Отбросить нечитабельный черновик" : store.conflict ? "Загрузить актуальные данные" : "Закрыть сообщение") {
                    if store.failedDraft != nil { discardDraft = true }
                    else if store.conflict { Task { await store.reload() } } else { store.error = nil }
                }
            }
            content()
        }.frame(maxWidth: .infinity, alignment: .leading).padding(ReppyMetrics.pageInset) }
            .scrollDismissesKeyboard(.interactively).background(ReppyTheme.background)
            .navigationBarBackButtonHidden(back)
            .toolbar {
                if !back && store.profile != nil {
                    ToolbarItem(placement: .topBarTrailing) {
                        NavigationLink { ProfileScreen() } label: {
                            Image(systemName: "person.crop.circle").frame(width: ReppyMetrics.small, height: ReppyMetrics.small)
                                .background(ReppyTheme.button, in: RoundedRectangle(cornerRadius: ReppyMetrics.radius))
                        }.accessibilityLabel("Профиль")
                    }
                }
                if back {
                    ToolbarItem(placement: .topBarLeading) {
                        Button { dismiss() } label: { Image(systemName: "chevron.left").frame(width: ReppyMetrics.small, height: ReppyMetrics.small).background(ReppyTheme.button, in: RoundedRectangle(cornerRadius: ReppyMetrics.radius)) }.accessibilityLabel("Назад")
                    }
                }
            }
            .confirmationDialog("Удалить нечитабельный локальный черновик? Сохранённые на сервере данные останутся доступны.", isPresented: $discardDraft, titleVisibility: .visible) {
                Button("Удалить черновик", role: .destructive) { store.discardFailedDraft() }
                Button("Оставить файл", role: .cancel) {}
            }
    }
}
struct ReppyCard<Content: View>: View {
    @ViewBuilder var content: () -> Content
    var body: some View {
        VStack(alignment: .leading, spacing: ReppyMetrics.space16, content: content).frame(maxWidth: .infinity, alignment: .leading)
            .padding(ReppyMetrics.space16).background(ReppyTheme.surface, in: RoundedRectangle(cornerRadius: ReppyMetrics.cardRadius))
    }
}
struct ReppyStack<Content: View>: View {
    var compact = false
    @ViewBuilder var content: () -> Content
    var body: some View { VStack(alignment: .leading, spacing: compact ? ReppyMetrics.space8 : ReppyMetrics.space16, content: content).frame(maxWidth: .infinity, alignment: .leading) }
}
struct ReppyRow<Content: View>: View {
    @ViewBuilder var content: () -> Content
    var body: some View { HStack(alignment: .center, spacing: ReppyMetrics.space12, content: content) }
}
struct ReppyTitle: View {
    var text: String
    var subtitle: String? = nil
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(text).reppyTypography(.title).fixedSize(horizontal: false, vertical: true)
            if let subtitle { Text(subtitle).font(.body).foregroundStyle(ReppyTheme.secondary) }
        }.accessibilityElement(children: .combine).accessibilityAddTraits(.isHeader)
    }
}
struct ReppyHeading: View {
    var text: String
    var body: some View { Text(text).reppyTypography(.heading).fixedSize(horizontal: false, vertical: true).accessibilityAddTraits(.isHeader) }
}
struct ReppyText: View {
    var text: String
    var tone: TextTone = .normal
    var body: some View { Text(text).reppyTypography(.body).foregroundStyle(tone.color).fixedSize(horizontal: false, vertical: true) }
}
struct ReppyCaption: View {
    var text: String
    var body: some View { Text(text).reppyTypography(.caption).foregroundStyle(ReppyTheme.secondary).fixedSize(horizontal: false, vertical: true) }
}
struct ReppyNumber: View {
    var value: String
    var body: some View { Text(value).reppyTypography(.number).monospacedDigit() }
}
enum ActionKind { case primary, secondary, danger }
struct ReppyButtonStyle: ButtonStyle {
    var kind: ActionKind = .secondary
    var compact = false
    @Environment(\.isEnabled) private var enabled
    func makeBody(configuration: Configuration) -> some View {
        configuration.label.reppyTypography(.button).multilineTextAlignment(.center)
            .frame(maxWidth: .infinity).padding(.horizontal, ReppyMetrics.controlPadding).padding(.vertical, ReppyMetrics.space12)
            .frame(minHeight: compact ? ReppyMetrics.compact : ReppyMetrics.control)
            .foregroundStyle(kind == .primary ? ReppyTheme.selectedText : (kind == .danger ? ReppyTheme.error : ReppyTheme.text))
            .background(kind == .primary ? ReppyTheme.lime : ReppyTheme.button, in: RoundedRectangle(cornerRadius: ReppyMetrics.radius))
            .opacity(enabled ? (configuration.isPressed ? 0.7 : 1) : 0.4)
    }
}
struct ReppyButton: View {
    var title: String
    var icon: String? = nil
    var kind: ActionKind = .secondary
    var compact = false
    var disabled = false
    var action: () -> Void
    var body: some View {
        Button(action: action) { if let icon { Label(title, systemImage: icon) } else { Text(title) } }
            .buttonStyle(ReppyButtonStyle(kind: kind, compact: compact)).disabled(disabled)
    }
}
struct ReppyLink<Destination: View>: View {
    var title: String
    var subtitle: String? = nil
    var icon: String = "chevron.right"
    @ViewBuilder var destination: () -> Destination
    var body: some View {
        NavigationLink(destination: destination) {
            HStack(spacing: 12) {
                VStack(alignment: .leading, spacing: 6) {
                    Text(title).font(.body.weight(.semibold)).multilineTextAlignment(.leading)
                    if let subtitle { Text(subtitle).font(.subheadline).foregroundStyle(ReppyTheme.secondary).multilineTextAlignment(.leading) }
                }.frame(maxWidth: .infinity, alignment: .leading)
                Image(systemName: icon).accessibilityHidden(true)
            }.padding(16).frame(minHeight: ReppyMetrics.control)
                .background(ReppyTheme.button, in: RoundedRectangle(cornerRadius: ReppyMetrics.radius))
        }.buttonStyle(.plain)
    }
}
struct ReppyField: View {
    var title: String
    @Binding var text: String
    var multiline = false
    var keyboard: UIKeyboardType = .default
    var error: String? = nil
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title).font(.subheadline).foregroundStyle(ReppyTheme.secondary)
            if multiline {
                TextField(title, text: $text, axis: .vertical).lineLimit(3...8).reppyField(invalid: error != nil).keyboardType(keyboard).accessibilityLabel(title)
            } else { TextField(title, text: $text).reppyField(invalid: error != nil).keyboardType(keyboard).accessibilityLabel(title) }
            if let error { ReppyText(text: error, tone: .error) }
        }
    }
}
private struct FieldModifier: ViewModifier {
    var invalid = false
    @FocusState private var focused: Bool
    @Environment(\.isEnabled) private var enabled
    func body(content: Content) -> some View {
        content.reppyTypography(.body).focused($focused).padding(.horizontal, ReppyMetrics.controlPadding).padding(.vertical, ReppyMetrics.space12).frame(minHeight: ReppyMetrics.control)
            .background(ReppyTheme.field, in: RoundedRectangle(cornerRadius: ReppyMetrics.radius))
            .overlay(RoundedRectangle(cornerRadius: ReppyMetrics.radius).stroke(invalid ? ReppyTheme.error : focused ? ReppyTheme.lime : ReppyTheme.outline, lineWidth: focused ? ReppyMetrics.focusWidth : 1))
            .opacity(enabled ? 1 : 0.4)
    }
}
private extension View { func reppyField(invalid: Bool = false) -> some View { modifier(FieldModifier(invalid: invalid)) } }
struct ReppyNumericField: View {
    var title: String
    @Binding var value: Double
    var integer = false
    @State private var text = ""
    @FocusState private var focused: Bool
    @ScaledMetric(relativeTo: .body) private var size = ReppyMetrics.setNumberFont
    var body: some View {
        TextField(title, text: $text).font(.system(size: size, weight: .medium)).monospacedDigit().multilineTextAlignment(.center)
            .keyboardType(integer ? .numberPad : .decimalPad).focused($focused).accessibilityLabel(title)
            .padding(.horizontal, ReppyMetrics.space6).frame(minWidth: ReppyMetrics.small, minHeight: ReppyMetrics.small)
            .background(ReppyTheme.field, in: RoundedRectangle(cornerRadius: ReppyMetrics.radius))
            .overlay(RoundedRectangle(cornerRadius: ReppyMetrics.radius).stroke(value < 0 || !value.isFinite ? ReppyTheme.error : focused ? ReppyTheme.lime : ReppyTheme.outline, lineWidth: focused ? ReppyMetrics.focusWidth : 1))
            .onAppear { if text.isEmpty { text = value.reppyNumber } }
            .onChange(of: text) { _, text in
                let parsed = ReppyValidation.number(text)
                value = parsed.map { integer ? Double(ReppyValidation.integer($0)) : $0 } ?? -1
            }
            .onChange(of: value) { _, value in if !focused && value >= 0 { text = value.reppyNumber } }
    }
}
struct ReppyDateField: View {
    var title: String
    @Binding var date: Date
    var time = false
    var body: some View {
        DatePicker(title, selection: $date, displayedComponents: time ? [.hourAndMinute] : [.date])
            .datePickerStyle(.compact).reppyField().tint(ReppyTheme.text)
    }
}
struct ReppyPicker<T: Hashable, Content: View>: View {
    var title: String
    @Binding var selection: T
    @ViewBuilder var content: () -> Content
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title).font(.subheadline).foregroundStyle(ReppyTheme.secondary)
            Picker(title, selection: $selection, content: content).pickerStyle(.menu).labelsHidden()
                .frame(maxWidth: .infinity, alignment: .leading).reppyField().tint(ReppyTheme.text)
                .accessibilityLabel(title).accessibilityIdentifier(title)
        }
    }
}
struct ReppyToggle: View {
    var title: String
    @Binding var value: Bool
    var body: some View { Toggle(title, isOn: $value).tint(ReppyTheme.lime).frame(minHeight: ReppyMetrics.compact) }
}
struct ReppyEmpty: View {
    var title: String
    var message: String
    var icon = "dumbbell"
    var body: some View {
        ReppyCard {
            Image(systemName: icon).font(.largeTitle).foregroundStyle(ReppyTheme.muted).accessibilityHidden(true)
            ReppyHeading(text: title); ReppyText(text: message, tone: .secondary)
        }
    }
}
struct ReppyStatus: View {
    var message: String
    var error = false
    var actionTitle: String? = nil
    var action: (() -> Void)? = nil
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Label(message, systemImage: error ? "exclamationmark.triangle" : "info.circle").font(.body).foregroundStyle(error ? ReppyTheme.error : ReppyTheme.secondary)
            if let actionTitle, let action { ReppyButton(title: actionTitle, compact: true, action: action) }
        }.padding(16).frame(maxWidth: .infinity, alignment: .leading).background(ReppyTheme.surface)
            .accessibilityElement(children: .contain)
    }
}
struct ReppyLoading: View {
    var body: some View { ZStack { Color.black.ignoresSafeArea(); ProgressView("REPPY").tint(.white).foregroundStyle(.white) } }
}
struct ReppyBrand: View {
    var body: some View { Image("Wordmark").resizable().scaledToFit().frame(width: 150, height: 44).accessibilityLabel("REPPY") }
}

// Native scroll/keyboard behavior; the auth screen has no marketing sections.
struct ReppyAuthPage<Content: View>: View {
    @ViewBuilder var content: () -> Content
    var body: some View {
        GeometryReader { geometry in
            ScrollView {
                VStack(alignment: .leading, spacing: ReppyMetrics.cardGap, content: content)
                    .frame(maxWidth: 440, alignment: .leading)
                    .padding(ReppyMetrics.pageInset)
                    .frame(maxWidth: .infinity)
                    .frame(minHeight: geometry.size.height, alignment: .center)
            }.scrollDismissesKeyboard(.interactively)
        }.background(ReppyTheme.background.ignoresSafeArea())
    }
}

struct ReppyAuthIntro: View {
    var body: some View {
        ReppyStack {
            ReppyBrand()
            ReppyTitle(text: "Войти в REPPY", subtitle: "Твои тренировки и прогресс.")
        }
    }
}
struct ReppySearch: View {
    @Binding var text: String
    var body: some View { TextField("Поиск", text: $text).textInputAutocapitalization(.never).autocorrectionDisabled().reppyField().accessibilityLabel("Поиск") }
}
struct ReppyProgressBar: View {
    var completed: Int
    var total: Int
    var body: some View { ProgressView(value: Double(completed), total: Double(max(total, 1))).tint(ReppyTheme.lime).accessibilityLabel("Выполнено \(completed) из \(total) подходов") }
}
extension Double {
    var reppyNumber: String {
        guard isFinite else { return "" }
        return formatted(.number.locale(Locale(identifier: "ru_RU")).precision(.fractionLength(0...2)).grouping(.never))
    }
}
