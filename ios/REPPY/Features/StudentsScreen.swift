import SwiftUI

struct StudentsScreen: View {
    @EnvironmentObject private var store: AppStore
    @State private var search = ""
    var body: some View {
        ReppyPage {
            ReppyTitle(text: "Ученики")
            ReppyLink(title: "Пригласить ученика", icon: "person.badge.plus") { InviteStudentScreen() }
            ReppySearch(text: $search)
            let students = store.data.students.filter { search.isEmpty || $0.name.localizedCaseInsensitiveContains(search) }.sorted { $0.name.localizedCompare($1.name) == .orderedAscending }
            if students.isEmpty { ReppyEmpty(title: "Пока никого нет", message: "Создай приглашение для первого ученика.", icon: "person.2") }
            ForEach(students) { student in
                ReppyCard {
                    ReppyHeading(text: student.name)
                    if let relationship = store.data.relationship(for: student.id) {
                        ReppyCaption(text: relationship.status == "invited" ? "Приглашён" : "Активный ученик")
                        ReppyText(text: "Баланс: \(store.data.balance(relationship.id)) занятий", tone: .secondary)
                    }
                    ReppyLink(title: "Открыть профиль") { StudentScreen(studentID: student.id) }
                }
            }
        }.refreshable { await store.reload() }
    }
}
struct StudentScreen: View {
    @EnvironmentObject private var store: AppStore
    var studentID: String
    @State private var section = "data"
    var body: some View {
        ReppyPage(back: true) {
            if let student = store.data.students.first(where: { $0.id == studentID }), let relationship = store.data.relationship(for: studentID) {
                ReppyTitle(text: student.name)
                ReppyStudentDetails(student: student)
                if relationship.status == "active" { ReppyProfileSegments(selection: $section) }
                if section == "progress" && relationship.status == "active" { ExerciseProgressSummary(relationshipID: relationship.id) }
                else {
                if store.isTrainer {
                    ReppyLink(title: "Назначить тренировку", icon: "plus") { AssignmentEditorScreen(relationshipID: relationship.id) }
                    if relationship.status == "invited" { ReppyLink(title: "Создать новую ссылку приглашения", icon: "person.badge.plus") { InviteStudentScreen(existing: relationship, initialName: student.name) } }
                }
                BalanceCard(relationshipID: relationship.id)
                ReppyLink(title: "История тренировок", icon: "clock.arrow.circlepath") { HistoryScreen(relationshipID: relationship.id, back: true) }
                ReppyHeading(text: "Предстоящие тренировки")
                ForEach(store.data.assignments.filter { $0.relationship_id == relationship.id && $0.status == "assigned" }.sorted { $0.scheduled_for < $1.scheduled_for }) { AssignmentAgendaRow(assignment: $0) }
                ReppyHeading(text: "Последняя активность")
                let assignmentIDs = Set(store.data.assignments.filter { $0.relationship_id == relationship.id }.map(\.id))
                let recent = store.data.sessions.filter { assignmentIDs.contains($0.assignment_id) && $0.completed_at != nil }.sorted { ($0.completed_at ?? "") > ($1.completed_at ?? "") }
                if recent.isEmpty { ReppyEmpty(title: "Ещё нет результатов", message: "Завершённые тренировки ученика появятся в этом блоке.") }
                ForEach(Array(recent.prefix(3))) { session in
                    ReppyAgendaLink(title: session.workout_snapshot.name, subtitle: ReppyDate.display(session.completed_at ?? ""), completed: true) { SessionResultScreen(sessionID: session.id) }
                }
                }
            } else { ReppyEmpty(title: "Ученик не найден", message: "Обнови данные и вернись к списку.") }
        }
    }
}
struct StudentDetailsCard: View {
    var student: Student
    var body: some View {
        ReppyCard {
            if let phone = student.phone, !phone.isEmpty { ReppyText(text: phone) }
            if let height = student.height_cm { ReppyText(text: "Рост: \(height.reppyNumber) см") }
            if let weight = student.weight_kg { ReppyText(text: "Вес: \(weight.reppyNumber) кг") }
            if let notes = student.contraindications, !notes.isEmpty { ReppyHeading(text: "Ограничения по здоровью"); ReppyText(text: notes, tone: .secondary) }
            if student.height_cm == nil && student.weight_kg == nil && (student.contraindications ?? "").isEmpty { ReppyCaption(text: "Личные данные ещё не заполнены.") }
        }
    }
}
struct StudentFormScreen: View {
    @EnvironmentObject private var store: AppStore
    @Environment(\.dismiss) private var dismiss
    @State var student: Student
    @State private var height = ""
    @State private var weight = ""
    @State private var restored = false
    var body: some View {
        ReppyPage(back: true) {
            ReppyTitle(text: "Личные данные")
            ReppyCard {
                ReppyField(title: "Имя", text: $student.name)
                ReppyField(title: "Телефон", text: Binding(get: { student.phone ?? "" }, set: { student.phone = $0 }), keyboard: .phonePad)
                ReppyField(title: "Рост, см", text: $height, keyboard: .decimalPad)
                ReppyField(title: "Вес, кг", text: $weight, keyboard: .decimalPad)
                ReppyPicker(title: "Пол", selection: Binding(get: { student.gender ?? "not-specified" }, set: { student.gender = $0 })) {
                    Text("Не указан").tag("not-specified"); Text("Мужской").tag("male"); Text("Женский").tag("female")
                }
                ReppyField(title: "Противопоказания и ограничения", text: Binding(get: { student.contraindications ?? "" }, set: { student.contraindications = $0 }), multiline: true)
            }
            ReppyButton(title: store.busy ? "Сохраняем…" : "Сохранить", kind: .primary, disabled: store.busy) {
                Task {
                    let saved = await store.run {
                        let edited = try StudentFormDraft(student: student, height: height, weight: weight).validatedStudent()
                        try await store.saveStudent(edited)
                        try DraftStorage.remove(account: store.accountKey, key: "student:\(student.id)")
                    }
                    if saved { dismiss() }
                }
            }
            ReppyButton(title: "Отмена", disabled: store.busy) {
                do { try DraftStorage.remove(account: store.accountKey, key: "student:\(student.id)"); dismiss() } catch { store.present(error) }
            }
        }.onAppear {
            guard !restored else { return }; restored = true
            if let draft: StudentFormDraft = store.restoreDraft(key: "student:\(student.id)") { student = draft.student; height = draft.height; weight = draft.weight }
            else { height = student.height_cm?.reppyNumber ?? ""; weight = student.weight_kg?.reppyNumber ?? "" }
        }.onChange(of: student) { _, _ in saveDraft() }.onChange(of: height) { _, _ in saveDraft() }.onChange(of: weight) { _, _ in saveDraft() }
        .onDisappear { /* A successful save explicitly removes the draft. */ }
    }
    private func saveDraft() {
        let draft = StudentFormDraft(student: student, height: height, weight: weight)
        do { try DraftStorage.save(draft, account: store.accountKey, key: "student:\(student.id)") } catch { store.present(error) }
    }
}
struct InviteStudentScreen: View {
    @EnvironmentObject private var store: AppStore
    var existing: Relationship? = nil
    var initialName = ""
    @State private var name = ""
    @State private var link = ""
    var body: some View {
        ReppyPage(back: true) {
            ReppyTitle(text: "Пригласить ученика")
            ReppyCard {
                ReppyField(title: "Имя ученика", text: $name)
                ReppyCaption(text: "Приглашение действует 48 часов. Ученик примет его через Telegram.")
                if link.isEmpty {
                    ReppyButton(title: "Создать приглашение", kind: .primary, disabled: store.busy || name.trimmingCharacters(in: .whitespacesAndNewlines).count < 2) {
                        Task { await store.run { link = try await store.createInvitation(name: name, existing: existing) } }
                    }
                } else { ReppyText(text: link); ReppyShare(title: "Поделиться приглашением", item: link) }
            }
        }.onAppear { name = initialName }
    }
}
