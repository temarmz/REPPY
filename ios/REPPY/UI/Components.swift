import SwiftUI

struct ReppyPage<Content: View>: View {
    var back = false
    var nativeList = false
    var lazyContent = false
    var title: String? = nil
    var onConflictReload: (() -> Void)? = nil
    @EnvironmentObject private var store: AppStore
    @State private var discardDraft = false
    @ViewBuilder var content: () -> Content
    var body: some View {
        Group {
            if nativeList {
                List { pageContent }.scrollContentBackground(.hidden)
            } else if lazyContent {
                ScrollView { LazyVStack(alignment: .leading, spacing: ReppyMetrics.cardGap) { pageContent }
                    .frame(maxWidth: .infinity, alignment: .leading).padding(ReppyMetrics.pageInset) }
            } else {
                ScrollView { VStack(alignment: .leading, spacing: ReppyMetrics.cardGap) { pageContent }
                    .frame(maxWidth: .infinity, alignment: .leading).padding(ReppyMetrics.pageInset) }
            }
        }.onAppear { ActivityLog.record(back ? "screen.detail" : "screen.root") }.scrollDismissesKeyboard(.interactively).background(ReppyTheme.background)
            .overlay(alignment: .top) {
                if let error = store.error, !store.conflict, store.failedDraft == nil {
                    ReppyToast(message: error, actionTitle: "Закрыть") { store.error = nil }
                        .padding(.horizontal, ReppyMetrics.pageInset).padding(.top, ReppyMetrics.space8)
                }
            }
            .modifier(ReppyPageNavigationTitle(title: title ?? (!back && store.profile != nil ? "REPPY" : nil)))
            .toolbarColorScheme(nil, for: .navigationBar)
            .toolbar {
                if !back && store.profile != nil {
                    ToolbarItem(placement: .topBarTrailing) {
                        NavigationLink { ProfileScreen() } label: {
                            Image(systemName: "person.crop.circle")
                        }.accessibilityLabel("Профиль")
                    }
                }
                ToolbarItemGroup(placement: .keyboard) {
                    Spacer()
                    Button("Скрыть клавиатуру", systemImage: "keyboard.chevron.compact.down") {
                        UIApplication.shared.sendAction(#selector(UIResponder.resignFirstResponder), to: nil, from: nil, for: nil)
                    }.accessibilityIdentifier("dismiss-keyboard")
                }
            }
            .confirmationDialog("Удалить нечитабельный локальный черновик? Сохранённые на сервере данные останутся доступны.", isPresented: $discardDraft, titleVisibility: .visible) {
                Button("Удалить черновик", role: .destructive) { store.discardFailedDraft() }
                Button("Оставить файл", role: .cancel) {}
            }
    }
    @ViewBuilder private var pageContent: some View {
        if !store.networkAvailable && !store.isDemo { ReppyStatus(message: "Нет сети. Несохранённый прогресс останется в черновике на этом iPhone.") }
        if let error = store.error, store.conflict || store.failedDraft != nil {
            ReppyStatus(message: error, error: true, actionTitle: store.failedDraft != nil ? "Отбросить нечитабельный черновик" : store.conflict ? "Загрузить актуальные данные" : "Закрыть сообщение") {
                if store.failedDraft != nil { discardDraft = true }
                else if store.conflict {
                    if let onConflictReload { onConflictReload() }
                    else { Task { await store.reload() } }
                } else { store.error = nil }
            }
        }
        content()
    }

}
private struct ReppyPageNavigationTitle: ViewModifier {
    var title: String?
    @ViewBuilder func body(content: Content) -> some View {
        if let title { content.navigationTitle(title).navigationBarTitleDisplayMode(.inline) }
        else { content }
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
    @Environment(\.dynamicTypeSize) private var typeSize
    var alignment: VerticalAlignment = .center
    @ViewBuilder var content: () -> Content
    var body: some View {
        let layout = typeSize.isAccessibilitySize ? AnyLayout(VStackLayout(alignment: .leading, spacing: ReppyMetrics.space12)) : AnyLayout(HStackLayout(alignment: alignment, spacing: ReppyMetrics.space12))
        layout { content() }
    }
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
    @Environment(\.dynamicTypeSize) private var typeSize
    var title: String
    var icon: String? = nil
    var kind: ActionKind = .secondary
    var compact = false
    var disabled = false
    var action: () -> Void
    var body: some View {
        Button(action: action) { if let icon, !typeSize.isAccessibilitySize { Label(title, systemImage: icon) } else { Text(title) } }
            .buttonStyle(ReppyButtonStyle(kind: kind, compact: compact)).disabled(disabled)
    }
}
struct ReppyLink<Destination: View>: View {
    @Environment(\.dynamicTypeSize) private var typeSize
    var title: String
    var subtitle: String? = nil
    var icon: String = "chevron.right"
    var kind: ActionKind = .secondary
    @ViewBuilder var destination: () -> Destination
    var body: some View {
        NavigationLink(destination: destination) {
            HStack(spacing: 12) {
                if subtitle == nil {
                    Spacer(minLength: 0)
                    Group {
                        if typeSize.isAccessibilitySize { Text(title) }
                        else { Label(title, systemImage: icon) }
                    }.font(.body.weight(.semibold)).multilineTextAlignment(.center)
                    Spacer(minLength: 0)
                } else {
                VStack(alignment: .leading, spacing: 6) {
                    Text(title).font(.body.weight(.semibold)).multilineTextAlignment(.leading)
                    if let subtitle { Text(subtitle).font(.subheadline).foregroundStyle(ReppyTheme.secondary).multilineTextAlignment(.leading) }
                }.frame(maxWidth: .infinity, alignment: .leading)
                if !typeSize.isAccessibilitySize { Image(systemName: icon).accessibilityHidden(true) }
                }
            }.padding(16).frame(maxWidth: .infinity, minHeight: ReppyMetrics.control)
                .foregroundStyle(kind == .primary ? ReppyTheme.selectedText : ReppyTheme.text)
                .background(kind == .primary ? ReppyTheme.lime : ReppyTheme.button, in: RoundedRectangle(cornerRadius: ReppyMetrics.radius))
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
                TextField(title, text: $text, axis: .vertical).lineLimit(3...8).reppyField(invalid: error != nil).keyboardType(keyboard).accessibilityLabel(title).accessibilityHint(error ?? "")
            } else { TextField(title, text: $text).reppyField(invalid: error != nil).keyboardType(keyboard).accessibilityLabel(title).accessibilityHint(error ?? "") }
            if let error { ReppyText(text: error, tone: .error) }
        }
    }
}
private struct FieldModifier: ViewModifier {
    var invalid = false
    var compact = false
    @FocusState private var focused: Bool
    @Environment(\.isEnabled) private var enabled
    func body(content: Content) -> some View {
        content.reppyTypography(.body).focused($focused).padding(.horizontal, ReppyMetrics.controlPadding).padding(.vertical, ReppyMetrics.space12).frame(minHeight: compact ? ReppyMetrics.compact : ReppyMetrics.control)
            .background(ReppyTheme.field, in: RoundedRectangle(cornerRadius: ReppyMetrics.radius))
            .overlay(RoundedRectangle(cornerRadius: ReppyMetrics.radius).stroke(invalid ? ReppyTheme.error : focused ? ReppyTheme.lime : ReppyTheme.outline, lineWidth: focused ? ReppyMetrics.focusWidth : 1))
            .opacity(enabled ? 1 : 0.4)
    }
}
private extension View { func reppyField(invalid: Bool = false, compact: Bool = false) -> some View { modifier(FieldModifier(invalid: invalid, compact: compact)) } }
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
            .accessibilityHint(value < 0 || !value.isFinite ? "Проверь число: значение не должно быть отрицательным." : integer ? "Введи целое число." : "Можно вводить дробное число с запятой.")
            .padding(.horizontal, ReppyMetrics.space6).frame(minWidth: ReppyMetrics.small, minHeight: ReppyMetrics.small)
            .background(ReppyTheme.field, in: RoundedRectangle(cornerRadius: ReppyMetrics.radius))
            .overlay(RoundedRectangle(cornerRadius: ReppyMetrics.radius).stroke(value < 0 || !value.isFinite ? ReppyTheme.error : focused ? ReppyTheme.lime : ReppyTheme.outline, lineWidth: focused ? ReppyMetrics.focusWidth : 1))
            .onAppear { if text.isEmpty { text = value.reppyNumber } }
            .onChange(of: focused) { _, active in
                if active {
                    Task { @MainActor in
                        await Task.yield()
                        guard focused else { return }
                        UIApplication.shared.sendAction(#selector(UIResponder.selectAll(_:)), to: nil, from: nil, for: nil)
                    }
                }
            }
            .onChange(of: text) { _, text in
                let parsed = ReppyValidation.number(text)
                value = parsed.map { integer ? Double(ReppyValidation.integer($0)) : $0 } ?? -1
            }
            .onChange(of: value) { _, value in
                // Keep local formatting while typing, but always display a new
                // server value, including when this field still has focus.
                if value >= 0, ReppyValidation.number(text) != value { text = value.reppyNumber }
            }
    }
}
struct ReppyDateField: View {
    var title: String
    @Binding var date: Date
    var time = false
    var compact = false
    @Environment(\.dynamicTypeSize) private var typeSize
    @State private var presented = false
    @State private var pendingDate = Date()
    var body: some View {
        if typeSize.isAccessibilitySize {
            ReppyStack(compact: true) {
                ReppyCaption(text: title)
                Button {
                    pendingDate = date; presented = true
                } label: {
                    Text(time ? date.formatted(.dateTime.hour().minute().locale(Locale(identifier: "ru_RU"))) : date.formatted(.dateTime.day().month(.wide).year().locale(Locale(identifier: "ru_RU"))))
                }.buttonStyle(ReppyButtonStyle(compact: compact)).accessibilityLabel(title).accessibilityValue(date.formatted(date: time ? .omitted : .long, time: time ? .shortened : .omitted))
            }.sheet(isPresented: $presented) {
                NavigationStack {
                    DatePicker(title, selection: $pendingDate, displayedComponents: time ? [.hourAndMinute] : [.date])
                        .datePickerStyle(.wheel).labelsHidden()
                        .navigationTitle(title).navigationBarTitleDisplayMode(.inline)
                        .toolbar {
                            ToolbarItem(placement: .cancellationAction) { Button("Отмена") { presented = false } }
                            ToolbarItem(placement: .confirmationAction) { Button("Готово") { date = pendingDate; presented = false } }
                        }
                }.presentationDetents([.medium, .large]).presentationCornerRadius(ReppyMetrics.modalRadius)
            }
        } else {
        DatePicker(title, selection: $date, displayedComponents: time ? [.hourAndMinute] : [.date])
            .datePickerStyle(.compact).reppyField(compact: compact).tint(ReppyTheme.text)
        }
    }
}
struct ReppyPicker<T: Hashable, Content: View>: View {
    var title: String
    @Binding var selection: T
    var compact = false
    @ViewBuilder var content: () -> Content
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title).font(.subheadline).foregroundStyle(ReppyTheme.secondary)
            Picker(title, selection: $selection, content: content).pickerStyle(.menu).labelsHidden()
                .frame(maxWidth: .infinity, alignment: .leading).reppyField(compact: compact).tint(ReppyTheme.text)
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
        VStack(spacing: ReppyMetrics.space16) {
            Image(systemName: icon)
                .font(.system(size: ReppyMetrics.emptyIcon))
                .foregroundStyle(ReppyTheme.limeStrong)
                .accessibilityHidden(true)
            ReppyHeading(text: title)
            ReppyCaption(text: message)
        }
        .multilineTextAlignment(.center)
        .padding(ReppyMetrics.emptyInset)
        .frame(maxWidth: .infinity, minHeight: ReppyMetrics.emptyMinHeight, alignment: .center)
        .listRowInsets(EdgeInsets())
        .listRowBackground(Color.clear)
        .listRowSeparator(.hidden)
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
struct ReppyHeaderBrand: View {
    var body: some View {
        Image("Wordmark").resizable().scaledToFit().frame(width: 100, height: ReppyMetrics.small).accessibilityLabel("REPPY")
    }
}
struct ReppyToolbarIcon: View {
    var icon: String
    var selected = false
    var body: some View {
        Image(systemName: icon).font(.system(size: ReppyMetrics.iconSize, weight: .medium))
            .foregroundStyle(selected ? ReppyTheme.lime : ReppyTheme.text)
            .frame(width: ReppyMetrics.small, height: ReppyMetrics.small)
            .background(ReppyTheme.button, in: RoundedRectangle(cornerRadius: ReppyMetrics.radius))
    }
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
            }.onAppear { ActivityLog.record("screen.signin") }.scrollDismissesKeyboard(.interactively)
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

// All explicit-save editors share navigation actions and the same draft exit policy.
struct ReppyFormActions: ViewModifier {
    var saveTitle: String
    var saveLabel: String? = nil
    var cancelTitle = "Отмена"
    var cancelIcon = true
    var showsCancel = true
    var disabled = false
    var busy = false
    var hasChanges = true
    var allowsKeepDraft = true
    var save: () -> Void
    var discard: () -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var confirmExit = false
    func body(content: Content) -> some View {
        content.navigationBarBackButtonHidden()
            .interactiveDismissDisabled(busy || hasChanges)
            .toolbar {
                if showsCancel {
                    ToolbarItem(placement: .cancellationAction) {
                        Button { if hasChanges { confirmExit = true } else { dismiss() } } label: {
                            if cancelIcon { Image(systemName: "chevron.left") }
                            else { Text(cancelTitle) }
                        }.accessibilityLabel(cancelIcon ? "Назад" : cancelTitle)
                            .modifier(ReppySecondaryToolbarStyle()).disabled(busy).accessibilityIdentifier("form-cancel")
                    }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(action: save) { Text(saveTitle).foregroundStyle(disabled || busy ? ReppyTheme.secondary : ReppyTheme.selectedText) }
                        .accessibilityLabel(saveLabel ?? saveTitle).buttonStyle(.borderedProminent)
                        .tint(disabled || busy ? ReppyTheme.button : ReppyTheme.lime).disabled(disabled || busy)
                }
            }
            .alert("Выйти из редактора?", isPresented: $confirmExit) {
                if allowsKeepDraft { Button("Сохранить черновик и выйти") { dismiss() } }
                Button("Удалить изменения", role: .destructive, action: discard)
                Button("Продолжить редактирование", role: .cancel) {}
            } message: { Text("Черновик хранится на этом iPhone. Сохранённые данные изменятся только после сохранения формы.") }
    }
}
extension View {
    func reppyFormActions(saveTitle: String = "Сохранить", saveLabel: String? = nil, cancelTitle: String = "Отмена", cancelIcon: Bool = true, showsCancel: Bool = true, disabled: Bool = false, busy: Bool = false, hasChanges: Bool = true, allowsKeepDraft: Bool = true, save: @escaping () -> Void, discard: @escaping () -> Void) -> some View {
        modifier(ReppyFormActions(saveTitle: saveTitle, saveLabel: saveLabel, cancelTitle: cancelTitle, cancelIcon: cancelIcon, showsCancel: showsCancel, disabled: disabled, busy: busy, hasChanges: hasChanges, allowsKeepDraft: allowsKeepDraft, save: save, discard: discard))
    }
}
struct ReppyInvitationInput: View {
    @Binding var text: String
    var body: some View {
        ReppyStack {
            ReppyField(title: "Приглашение", text: $text, keyboard: .URL)
                .textInputAutocapitalization(.never).autocorrectionDisabled()
            PasteButton(payloadType: String.self) { values in
                if let value = values.first { text = value.trimmingCharacters(in: .whitespacesAndNewlines) }
            }.buttonStyle(.bordered).accessibilityLabel("Вставить приглашение")
        }
    }
}

// Read-only sheets and pickers always expose a reachable native close action.
struct ReppySecondaryToolbarStyle: ViewModifier {
    @ViewBuilder func body(content: Content) -> some View {
        if #available(iOS 26.0, *) { content.buttonStyle(.automatic) }
        else { content.buttonStyle(.bordered) }
    }
}
struct ReppyDismissAction: ViewModifier {
    var title = "Закрыть"
    var disabled = false
    @Environment(\.dismiss) private var dismiss
    func body(content: Content) -> some View {
        content.toolbar {
            ToolbarItem(placement: .confirmationAction) {
                Button(title) { dismiss() }.modifier(ReppySecondaryToolbarStyle()).disabled(disabled)
            }
        }
    }
}
extension View {
    func reppyDismissAction(title: String = "Закрыть", disabled: Bool = false) -> some View { modifier(ReppyDismissAction(title: title, disabled: disabled)) }
}

struct ReppyActionGroup<Content: View>: View {
    @Environment(\.dynamicTypeSize) private var typeSize
    @ViewBuilder var content: () -> Content
    var body: some View {
        if typeSize.isAccessibilitySize {
            VStack(spacing: ReppyMetrics.space12, content: content)
        } else {
            ViewThatFits(in: .horizontal) {
                HStack(spacing: ReppyMetrics.space12, content: content).fixedSize(horizontal: true, vertical: false)
                VStack(spacing: ReppyMetrics.space12, content: content)
            }.frame(maxWidth: .infinity, alignment: .leading)
        }
    }
}

struct ReppyWorkoutSuccessArt: View {
    var body: some View {
        Image("WorkoutSuccess").resizable().scaledToFit()
            .frame(height: (ReppyMetrics.space16 * 2) * 4).frame(maxWidth: .infinity)
            .accessibilityLabel("Динозавр показывает большой палец")
    }
}
