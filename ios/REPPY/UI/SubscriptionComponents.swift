import SwiftUI

struct ReppySubscriptionEntry: View {
    var entry: SubscriptionEntry
    var balanceAfter: Int
    var card = true
    var body: some View {
        Group { if card { ReppyCard { row } } else { row.padding(ReppyMetrics.space16) } }.foregroundStyle(ReppyTheme.text)
    }
    private var row: some View {
        ReppyRow {
            Text("\(entry.lesson_delta > 0 ? "+" : "")\(entry.lesson_delta)").reppyTypography(.setNumber).monospacedDigit()
                .foregroundStyle(entry.lesson_delta > 0 ? ReppyTheme.trendUp : ReppyTheme.secondary)
                .frame(minWidth: ReppyMetrics.small, minHeight: ReppyMetrics.small)
            ReppyStack(compact: true) {
                ReppyHeading(text: entry.kind == "payment" ? "Пополнение на \(entry.lesson_delta) \(ReppySubscriptionSummary.lessonWord(entry.lesson_delta))" : entry.kind == "session-refund" ? "Возврат занятия" : "Занятие списано")
                let detail = entry.kind == "payment" ? "\((entry.amount_rub ?? 0).formatted(.number.locale(Locale(identifier: "ru_RU")))) ₽ · \(entry.payment_method == "transfer" ? "перевод" : "наличные")" : entry.workout_name ?? "Тренировка"
                ReppyCaption(text: detail + " · " + ReppySubscriptionDate.label(entry.occurred_at))
                if let comment = entry.comment, !comment.isEmpty { ReppyText(text: comment, tone: .secondary) }
                ReppyCaption(text: "Баланс после операции: \(balanceAfter)")
            }
            if entry.kind == "payment" { Image(systemName: "pencil").accessibilityLabel("Изменить пополнение") }
        }
    }
}
enum ReppySubscriptionDate {
    static func value(_ value: String) -> Date { ReppyDate.parse(value) ?? ReppyDate.fromDay(value) }
    static func label(_ value: String) -> String { self.value(value).formatted(.dateTime.day().month(.wide).year().locale(Locale(identifier: "ru_RU"))) }
}
struct ReppyConnectedList<Item: Identifiable, Content: View>: View {
    var items: [Item]
    @ViewBuilder var content: (Item) -> Content
    var body: some View {
        VStack(spacing: 0) {
            ForEach(Array(items.enumerated()), id: \.element.id) { index, item in
                content(item)
                if index < items.count - 1 { Divider().overlay(ReppyTheme.divider) }
            }
        }.background(ReppyTheme.surface, in: RoundedRectangle(cornerRadius: ReppyMetrics.cardRadius))
    }
}
struct ReppyLedgerSummary<Action: View>: View {
    var balance: Int
    var hasEntries: Bool
    @ViewBuilder var action: () -> Action
    var body: some View {
        ReppyCard { ReppyCaption(text: "ТЕКУЩИЙ БАЛАНС"); ReppyHeading(text: ReppySubscriptionSummary.balanceLabel(balance, hasEntries: hasEntries)); action() }
    }
}
struct ReppyPaymentMethodPicker: View {
    @Binding var selection: String
    var body: some View {
        ReppyStack(compact: true) {
            ReppyCaption(text: "Способ оплаты")
            Picker("Способ оплаты", selection: $selection) { Text("Наличные").tag("cash"); Text("Перевод").tag("transfer") }.pickerStyle(.segmented).frame(minHeight: ReppyMetrics.compact)
        }
    }
}
struct ReppyInvitationReady: View {
    var name: String
    var link: String
    var expiresAt: Date?
    var demo: Bool
    var onDone: () -> Void
    @State private var copied = false
    var body: some View {
        ReppyCard {
            Image(systemName: "person.badge.plus").font(.largeTitle).foregroundStyle(ReppyTheme.trendUp).accessibilityHidden(true)
            ReppyHeading(text: "\(name) почти в команде")
            ReppyText(text: demo ? "Демо-приглашение: подключение ученика доступно после входа в рабочий аккаунт." : "Отправь эту одноразовую ссылку ученику.", tone: .secondary)
            if let expiresAt, !demo { ReppyCaption(text: "Действует до \(expiresAt.formatted(.dateTime.day().month(.wide).hour().minute().locale(Locale(identifier: "ru_RU"))))") }
            Text(link).reppyTypography(.body).textSelection(.enabled).fixedSize(horizontal: false, vertical: true).padding(ReppyMetrics.space16)
                .frame(maxWidth: .infinity, alignment: .leading).background(ReppyTheme.field, in: RoundedRectangle(cornerRadius: ReppyMetrics.radius))
            ReppyButton(title: copied ? "Ссылка скопирована" : "Скопировать ссылку", icon: copied ? "checkmark" : "doc.on.doc", kind: .primary, disabled: demo) { UIPasteboard.general.string = link; copied = true }
            if !demo { ReppyShare(title: "Поделиться приглашением", item: link, kind: .secondary) }
            ReppyButton(title: "Готово", icon: "checkmark", action: onDone)
        }
    }
}

struct ReppyFormatPicker: View {
    @Binding var selection: TrainingFormat
    var body: some View {
        ReppyStack(compact: true) {
            ReppyCaption(text: "Формат")
            Picker("Формат", selection: $selection) { ForEach(TrainingFormat.allCases, id: \.self) { Text($0.title).tag($0) } }
                .pickerStyle(.segmented).frame(minHeight: ReppyMetrics.compact)
        }
    }
}
struct ReppyBalanceSummary: View {
    var balance: Int
    var body: some View {
        ReppyCard {
            ReppyRow {
                Image(systemName: balance <= 0 ? "exclamationmark.circle" : "checkmark").foregroundStyle(balance <= 2 ? ReppyTheme.warning : ReppyTheme.trendUp).accessibilityHidden(true)
                ReppyStack(compact: true) { ReppyCaption(text: "АБОНЕМЕНТ"); ReppyText(text: ReppySubscriptionSummary.balanceLabel(balance), tone: balance <= 0 ? .warning : .normal) }
            }
        }
    }
}
struct ReppySubscriptionSummary: View {
    var balance: Int
    var entries: [SubscriptionEntry]
    var trainer = false
    var relationshipID: String? = nil
    var body: some View {
        let payments = entries.filter { $0.kind == "payment" }.sorted { $0.occurred_at == $1.occurred_at ? $0.created_at > $1.created_at : $0.occurred_at > $1.occurred_at }
        return ReppyStack {
            ReppyCard {
            ReppyRow { ReppyCaption(text: "АБОНЕМЕНТ"); Spacer(minLength: 0); ReppyCaption(text: "Без срока действия") }
            ReppyHeading(text: Self.balanceLabel(balance, hasEntries: !entries.isEmpty))
            if entries.isEmpty { ReppyCaption(text: trainer ? "Добавь первое пополнение, чтобы начать учёт занятий." : "Тренер ещё не добавил пополнение.") }
            else if balance <= 0 { ReppyCaption(text: balance < 0 ? "Новые занятия будут добавляться к долгу." : "Следующую тренировку можно провести в долг.") }
            if !payments.isEmpty {
                ReppyCaption(text: trainer ? "ПОСЛЕДНЕЕ ПОПОЛНЕНИЕ" : "ПОСЛЕДНИЕ ПОПОЛНЕНИЯ")
                ForEach(Array(payments.prefix(trainer ? 1 : 3))) { entry in
                    ReppyStack(compact: true) {
                        ReppyHeading(text: "+\(entry.lesson_delta) \(Self.lessonWord(entry.lesson_delta))")
                        ReppyCaption(text: "\((entry.amount_rub ?? 0).formatted(.number.locale(Locale(identifier: "ru_RU")))) ₽ · \(entry.payment_method == "transfer" ? "перевод" : "наличные") · \(ReppySubscriptionDate.label(entry.occurred_at))")
                    }
                }
            }
            }
            if trainer, let relationshipID {
                ReppyActionGroup {
                    ReppyLink(title: payments.isEmpty ? "Добавить абонемент" : "Продлить", icon: "plus", kind: .primary) { PaymentFormScreen(relationshipID: relationshipID) }
                    ReppyLink(title: "История", icon: "clock.arrow.circlepath") { SubscriptionHistoryScreen(relationshipID: relationshipID) }
                }
            }
        }
    }
    static func lessonWord(_ value: Int) -> String {
        let count = abs(value), last = count % 10
        if (11...14).contains(count % 100) { return "занятий" }
        return last == 1 ? "занятие" : (2...4).contains(last) ? "занятия" : "занятий"
    }
    static func balanceLabel(_ balance: Int, hasEntries: Bool = true) -> String {
        guard hasEntries else { return "Абонемент не добавлен" }
        if balance == 0 { return "Абонемент закончился" }
        return balance > 0 ? "Осталось \(balance) \(lessonWord(balance))" : "\(abs(balance)) \(lessonWord(balance)) в долг"
    }
}
