import SwiftUI

struct BalanceCard: View {
    @EnvironmentObject private var store: AppStore
    var relationshipID: String
    var body: some View {
        ReppyCard {
            let balance = store.data.balance(relationshipID)
            ReppyHeading(text: "Абонемент")
            ReppyNumber(value: "\(balance) занятий")
            ReppyCaption(text: "Без срока действия")
            if balance <= 0 { ReppyText(text: balance < 0 ? "Есть занятия в долг" : "Абонемент закончился", tone: .warning) }
            if store.isTrainer {
                ReppyLink(title: "Продлить", icon: "plus") { PaymentFormScreen(relationshipID: relationshipID) }
                ReppyLink(title: "История операций", icon: "clock.arrow.circlepath") { SubscriptionHistoryScreen(relationshipID: relationshipID) }
            } else {
                ForEach(store.data.subscriptions.filter { $0.relationship_id == relationshipID && $0.kind == "payment" }.sorted { $0.occurred_at > $1.occurred_at }.prefix(3)) { entry in
                    ReppyText(text: "+\(entry.lesson_delta) занятий · \((entry.amount_rub ?? 0).reppyNumber) ₽")
                    ReppyCaption(text: "\(ReppyDate.display(entry.occurred_at)) · \(entry.payment_method == "cash" ? "Наличные" : "Перевод")")
                }
            }
        }
    }
}
private struct PaymentDraft: Codable {
    var id: String; var lessons: String; var amount: String; var method: String
    var date: Date; var comment: String; var original: SubscriptionEntry?
}
struct PaymentFormScreen: View {
    @EnvironmentObject private var store: AppStore
    @Environment(\.dismiss) private var dismiss
    var relationshipID: String
    var original: SubscriptionEntry? = nil
    @State private var id = UUID().uuidString.lowercased()
    @State private var lessons = "8"
    @State private var amount = ""
    @State private var method = "transfer"
    @State private var date = Date()
    @State private var comment = ""
    @State private var initialized = false
    @State private var confirmDelete = false
    @State private var draftOriginal: SubscriptionEntry?
    private var draftKey: String { "payment:\(original?.id ?? relationshipID + ":new")" }
    var body: some View {
        ReppyPage(back: true) {
            ReppyTitle(text: original == nil ? "Пополнить абонемент" : "Изменить пополнение")
            ReppyCard {
                ReppyField(title: "Количество занятий", text: $lessons, keyboard: .numberPad)
                ReppyField(title: "Сумма, ₽", text: $amount, keyboard: .decimalPad)
                ReppyPicker(title: "Способ оплаты", selection: $method) { Text("Наличные").tag("cash"); Text("Перевод").tag("transfer") }
                ReppyDateField(title: "Дата оплаты", date: $date)
                ReppyField(title: "Комментарий", text: $comment, multiline: true)
            }
            ReppyButton(title: store.busy ? "Сохраняем…" : "Сохранить", kind: .primary, disabled: store.busy) {
                Task {
                    let saved = await store.run {
                        guard let count = Int(lessons), count > 0, let total = ReppyValidation.number(amount) else { throw APIError.message("Укажи целое количество занятий и неотрицательную сумму.") }
                        try await store.savePayment(id: draftOriginal?.id ?? id, relationshipID: relationshipID, lessons: count, amount: total, method: method, date: date, comment: comment, original: draftOriginal)
                        try DraftStorage.remove(account: store.accountKey, key: draftKey)
                    }
                    if saved { dismiss() }
                }
            }
            ReppyButton(title: "Отмена", disabled: store.busy) {
                do { try DraftStorage.remove(account: store.accountKey, key: draftKey); dismiss() } catch { store.present(error) }
            }
            if original != nil { ReppyButton(title: "Удалить пополнение", kind: .danger, disabled: store.busy) { confirmDelete = true } }
        }.onAppear {
            guard !initialized else { return }; initialized = true
            if let draft: PaymentDraft = store.restoreDraft(key: draftKey) {
                id = draft.id; lessons = draft.lessons; amount = draft.amount; method = draft.method; date = draft.date; comment = draft.comment; draftOriginal = draft.original; return
            }
            draftOriginal = original
            let latest = original ?? store.data.subscriptions.filter { $0.relationship_id == relationshipID && $0.kind == "payment" }.max { $0.occurred_at < $1.occurred_at }
            if let latest { lessons = String(latest.lesson_delta); amount = (latest.amount_rub ?? 0).reppyNumber; method = latest.payment_method ?? "transfer" }
            if let original { date = ReppyDate.parse(original.occurred_at) ?? Date(); comment = original.comment ?? "" }
        }.onChange(of: [lessons, amount, method, comment]) { _, _ in saveDraft() }.onChange(of: date) { _, _ in saveDraft() }
        .confirmationDialog("Удалить это пополнение? Баланс будет пересчитан.", isPresented: $confirmDelete, titleVisibility: .visible) {
            Button("Удалить", role: .destructive) { Task { if let draftOriginal, await store.run({
                try await store.deletePayment(draftOriginal); try DraftStorage.remove(account: store.accountKey, key: draftKey)
            }) { dismiss() } } }
            Button("Отмена", role: .cancel) {}
        }
    }
    private func saveDraft() {
        guard initialized else { return }
        do { try DraftStorage.save(PaymentDraft(id: id, lessons: lessons, amount: amount, method: method, date: date, comment: comment, original: draftOriginal), account: store.accountKey, key: draftKey) } catch { store.present(error) }
    }
}
struct SubscriptionHistoryScreen: View {
    @EnvironmentObject private var store: AppStore
    @Environment(\.dismiss) private var dismiss
    var relationshipID: String
    @State private var confirmClear = false
    var body: some View {
        ReppyPage(back: true) {
            ReppyTitle(text: "История абонемента")
            let entries = store.data.subscriptions.filter { $0.relationship_id == relationshipID }.sorted { $0.occurred_at == $1.occurred_at ? $0.created_at > $1.created_at : $0.occurred_at > $1.occurred_at }
            ReppyBalanceSummary(balance: store.data.balance(relationshipID))
            ReppyLink(title: "Добавить пополнение", icon: "plus") { PaymentFormScreen(relationshipID: relationshipID) }
            if entries.isEmpty { ReppyEmpty(title: "Нет операций", message: "Пополнения и списания появятся здесь.", icon: "creditcard") }
            ForEach(entries) { entry in
                if entry.kind == "payment" {
                    NavigationLink { PaymentFormScreen(relationshipID: relationshipID, original: entry) } label: {
                        ReppySubscriptionEntry(entry: entry, balanceAfter: balance(after: entry, entries: entries))
                    }.buttonStyle(.plain)
                } else { ReppySubscriptionEntry(entry: entry, balanceAfter: balance(after: entry, entries: entries)) }
            }
            if !entries.isEmpty { ReppyButton(title: "Удалить абонемент", kind: .danger, disabled: store.busy) { confirmClear = true } }
        }.confirmationDialog("Удалить все операции этого абонемента?", isPresented: $confirmClear, titleVisibility: .visible) {
            Button("Удалить абонемент", role: .destructive) { Task { if await store.run({ try await store.deleteSubscription(relationshipID) }) { dismiss() } } }
            Button("Отмена", role: .cancel) {}
        }
    }
    private func balance(after entry: SubscriptionEntry, entries: [SubscriptionEntry]) -> Int {
        guard let index = entries.firstIndex(where: { $0.id == entry.id }) else { return 0 }
        return entries[index...].reduce(0) { $0 + $1.lesson_delta }
    }
}
