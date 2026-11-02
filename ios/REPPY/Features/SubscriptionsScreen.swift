import SwiftUI

struct BalanceCard: View {
    @EnvironmentObject private var store: AppStore
    var relationshipID: String
    var body: some View {
        ReppySubscriptionSummary(balance: store.data.balance(relationshipID), entries: store.data.subscriptions.filter { $0.relationship_id == relationshipID }, trainer: store.isTrainer, relationshipID: relationshipID)
    }
}
private struct PaymentDraft: Codable {
    var id: String; var lessons: String; var amount: String; var method: String
    var date: Date; var comment: String; var original: SubscriptionEntry?
}
struct PaymentFormScreen: View {
    @EnvironmentObject private var store: AppStore
    @Environment(\.presentationMode) private var presentation
    var relationshipID: String
    var original: SubscriptionEntry? = nil
    @State private var id = UUID().uuidString.lowercased()
    @State private var lessons = "8"
    @State private var amount = "11400"
    @State private var method = "cash"
    @State private var date = Date()
    @State private var comment = ""
    @State private var initialized = false
    @State private var confirmDelete = false
    @State private var draftOriginal: SubscriptionEntry?
    @State private var attempted = false
    @State private var initialDraft: PaymentDraft?
    private var hasChanges: Bool {
        guard let initialDraft else { return false }
        return lessons != initialDraft.lessons || amount != initialDraft.amount || method != initialDraft.method || date != initialDraft.date || comment != initialDraft.comment
    }
    private var lessonsError: String? { (Int(lessons) ?? 0) > 0 ? nil : "Укажи целое количество занятий больше нуля." }
    private var amountError: String? { ReppyValidation.number(amount) != nil ? nil : "Укажи корректную стоимость." }
    private var draftKey: String { "payment:\(original?.id ?? relationshipID + ":new")" }
    var body: some View {
        ReppyPage(back: true, title: "Пополнение") {
            if let relationship = store.data.relationships.first(where: { $0.id == relationshipID }), let student = store.data.students.first(where: { $0.id == relationship.student_id }) { ReppyCaption(text: student.name) }
            ReppyCard {
                ReppyRow(alignment: .top) {
                    ReppyField(title: "Количество занятий", text: $lessons, keyboard: .numberPad, error: attempted ? lessonsError : nil)
                    ReppyField(title: "Стоимость, ₽", text: $amount, keyboard: .decimalPad, error: attempted ? amountError : nil)
                }
                ReppyPaymentMethodPicker(selection: $method)
                ReppyDateField(title: "Дата оплаты", date: $date)
                ReppyField(title: "Комментарий", text: $comment, multiline: true)
                ReppyCaption(text: "\(comment.count)/240 · необязательно")
            }
            if original != nil { ReppyButton(title: "Удалить это пополнение", icon: "trash", kind: .danger, disabled: store.busy) { confirmDelete = true } }
        }.reppyFormActions(saveTitle: original == nil ? "Добавить" : "Сохранить", saveLabel: original == nil ? "Добавить пополнение" : "Сохранить изменения", busy: store.busy, hasChanges: hasChanges, save: {
                attempted = true
                guard lessonsError == nil, amountError == nil else { return }
                Task {
                    let saved = await store.run {
                        guard let count = Int(lessons), count > 0, let total = ReppyValidation.number(amount) else { throw APIError.message("Укажи целое количество занятий и неотрицательную сумму.") }
                        try await store.savePayment(id: draftOriginal?.id ?? id, relationshipID: relationshipID, lessons: count, amount: total, method: method, date: date, comment: comment, original: draftOriginal)
                        try DraftStorage.remove(account: store.accountKey, key: draftKey)
                    }
                    if saved { presentation.wrappedValue.dismiss() }
                }
            }, discard: {
                do { try DraftStorage.remove(account: store.accountKey, key: draftKey); presentation.wrappedValue.dismiss() } catch { store.present(error) }
            }).onAppear {
            guard !initialized else { return }; initialized = true
            draftOriginal = original
            let latest = original ?? store.data.subscriptions.filter { $0.relationship_id == relationshipID && $0.kind == "payment" }.max { $0.occurred_at < $1.occurred_at }
            if let latest { lessons = String(latest.lesson_delta); amount = (latest.amount_rub ?? 0).reppyNumber; method = latest.payment_method ?? "cash" }
            if let original { date = ReppySubscriptionDate.value(original.occurred_at); comment = original.comment ?? "" }
            initialDraft = PaymentDraft(id: id, lessons: lessons, amount: amount, method: method, date: date, comment: comment, original: draftOriginal)
            if let draft: PaymentDraft = store.restoreDraft(key: draftKey) {
                id = draft.id; lessons = draft.lessons; amount = draft.amount; method = draft.method; date = draft.date; comment = draft.comment; draftOriginal = draft.original
            }

        }.onChange(of: [lessons, amount, method]) { _, _ in saveDraft() }
            .onChange(of: comment) { _, _ in if comment.count > 240 { comment = String(comment.prefix(240)) }; saveDraft() }
            .onChange(of: date) { _, _ in saveDraft() }
        .confirmationDialog("Удалить пополнение? Баланс будет пересчитан, списания тренировок сохранятся.", isPresented: $confirmDelete, titleVisibility: .visible) {
            Button("Удалить", role: .destructive) { Task { if let draftOriginal, await store.run({
                try await store.deletePayment(draftOriginal); try DraftStorage.remove(account: store.accountKey, key: draftKey)
            }) { presentation.wrappedValue.dismiss() } } }
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
    @Environment(\.presentationMode) private var presentation
    var relationshipID: String
    @State private var confirmClear = false
    @State private var selectedPayment: SubscriptionEntry?
    @State private var editingPayment = false
    var body: some View {
        ReppyPage(back: true, title: "История абонемента") {
            if let relationship = store.data.relationships.first(where: { $0.id == relationshipID }), let student = store.data.students.first(where: { $0.id == relationship.student_id }) { ReppyCaption(text: student.name) }
            let entries = store.data.subscriptions.filter { $0.relationship_id == relationshipID }.sorted { $0.occurred_at == $1.occurred_at ? $0.created_at > $1.created_at : $0.occurred_at > $1.occurred_at }
            ReppyLedgerSummary(balance: store.data.balance(relationshipID), hasEntries: !entries.isEmpty) {
                ReppyButton(title: "Добавить пополнение", icon: "plus", kind: .primary) { selectedPayment = nil; editingPayment = true }
            }
            if entries.isEmpty { ReppyEmpty(title: "История пока пуста", message: "Добавь первое пополнение абонемента.", icon: "clock.arrow.circlepath") }
            ReppyConnectedList(items: entries) { entry in
                if entry.kind == "payment" {
                    Button { selectedPayment = entry; editingPayment = true } label: {
                        ReppySubscriptionEntry(entry: entry, balanceAfter: balance(after: entry, entries: entries), card: false)
                    }.buttonStyle(.plain)
                } else { ReppySubscriptionEntry(entry: entry, balanceAfter: balance(after: entry, entries: entries), card: false) }
            }
            if !entries.isEmpty {
                ReppyCard {
                    ReppyHeading(text: "Удаление абонемента")
                    ReppyCaption(text: "Тренировки и результаты ученика останутся на месте.")
                    ReppyButton(title: "Удалить полностью", icon: "trash", kind: .danger, disabled: store.busy) { confirmClear = true }
                }
            }
        }.navigationDestination(isPresented: $editingPayment) {
            PaymentFormScreen(relationshipID: relationshipID, original: selectedPayment)
        }.confirmationDialog("Удалить абонемент полностью? Баланс и вся история оплат, списаний и возвратов будут удалены. Тренировки и результаты сохранятся.", isPresented: $confirmClear, titleVisibility: .visible) {
            Button("Удалить абонемент", role: .destructive) { Task { if await store.run({ try await store.deleteSubscription(relationshipID) }) { presentation.wrappedValue.dismiss() } } }
            Button("Отмена", role: .cancel) {}
        }
    }
    private func balance(after entry: SubscriptionEntry, entries: [SubscriptionEntry]) -> Int {
        guard let index = entries.firstIndex(where: { $0.id == entry.id }) else { return 0 }
        return entries[index...].reduce(0) { $0 + $1.lesson_delta }
    }
}
