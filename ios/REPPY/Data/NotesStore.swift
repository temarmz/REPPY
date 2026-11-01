import SwiftUI

struct PersonalNote: Codable {
    var note_date: String
    var content: String
    var revision: Int
    var mutation_id: String
}
struct NoteDraft: Codable {
    var content: String
    var revision: Int
    var mutationID: String
    // Preserve an in-flight write across edits and lost HTTP responses.
    var pending: PersonalNote?
}

@MainActor final class NotesStore: ObservableObject {
    @Published var notes: [String: PersonalNote] = [:]
    @Published var drafts: [String: NoteDraft] = [:]
    @Published var errors: [String: String] = [:]
    @Published var conflicts: [String: PersonalNote] = [:]
    @Published var storageError: String?
    @Published private(set) var firstDay = ReppyDate.day()
    @Published private(set) var loaded = false
    var canEdit: Bool { loaded && writable && ownsSession }
    var markedDays: [String: Int] {
        var contents = notes.mapValues(\.content)
        for (day, draft) in drafts { contents[day] = draft.content }
        return contents.mapValues { $0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? 0 : 1 }
    }
    private var account = ""
    private var api: SupabaseAPI?
    private var demo = false
    private var tasks: [String: Task<Void, Never>] = [:]
    private var saving: Set<String> = []
    private var observer: RealtimeObserver?
    private var writable = true
    private var stopped = false
    private let observeChanges: Bool
    private var ownsSession: Bool { !stopped && !account.isEmpty && (demo || api?.session?.user.id == account) }
    init(observeChanges: Bool = true) { self.observeChanges = observeChanges }

    func start(store: AppStore) async {
        guard account.isEmpty else { return }
        account = store.isDemo ? "demo-notes-\(store.isTrainer ? "trainer" : "student")" : store.accountKey
#if DEBUG
        if store.isDemo && ProcessInfo.processInfo.arguments.contains("--audit-screen") { account = "visual-audit-notes-" + (store.isTrainer ? "trainer" : "student") }
#endif
        api = store.api; demo = store.isDemo
        do {
            drafts = try DraftStorage.load(account: account, key: "personal-notes") ?? [:]
            if demo { notes = try DraftStorage.load(account: account, key: "personal-notes-demo") ?? [:] }
        }
        catch { writable = false; storageError = "Не удалось прочитать черновики заметок. Файл сохранён: \(error.localizedDescription)" }
        do {
            let range: String? = try DraftStorage.load(account: account, key: "notes-range")
            if let range { firstDay = ReppyDate.day(ReppyDate.fromDay(range)) }
        } catch { if storageError == nil { storageError = "Не удалось восстановить выбранную дату: \(error.localizedDescription)" } }
        if observeChanges, !demo, let api {
            observer = RealtimeObserver(api: api) { [weak self] in Task { await self?.refresh() } }
            observer?.start()
        }
        await refresh()
    }
    func stop() { stopped = true; observer?.stop(); observer = nil; tasks.values.forEach { $0.cancel() } }
    func selectDay(_ date: Date) {
        guard ownsSession else { return }
        firstDay = ReppyDate.day(date)
        do { try DraftStorage.save(firstDay, account: account, key: "notes-range") }
        catch { storageError = "Не удалось запомнить выбранную дату: \(error.localizedDescription)" }
        Task { await flush() }
    }
    func text(_ day: String) -> String { drafts[day]?.content ?? notes[day]?.content ?? "" }
    func edit(_ day: String, _ text: String) {
        guard canEdit else { return }
        var draft = drafts[day] ?? NoteDraft(content: text, revision: notes[day]?.revision ?? 0, mutationID: UUID().uuidString)
        draft.content = String(text.prefix(50_000)); drafts[day] = draft
        persist()
        tasks[day]?.cancel()
        tasks[day] = Task { [weak self] in
            try? await Task.sleep(for: .milliseconds(650))
            guard !Task.isCancelled else { return }
            await self?.save(day)
        }
    }
    private func persist() {
        do { try DraftStorage.save(drafts, account: account, key: "personal-notes"); storageError = nil }
        catch { storageError = "Черновик не сохранён на iPhone: \(error.localizedDescription)" }
    }
    func refresh() async {
        guard ownsSession else { return }
        if !demo, let api {
            do {
                let rows: [PersonalNote] = try await api.rows("trainer_notes", query: ["order": "note_date"])
                guard ownsSession else { return }
                for row in rows { notes[row.note_date] = row }
            } catch { if ownsSession { storageError = "Не удалось обновить заметки: \(error.localizedDescription)" }; return }
        }
        loaded = true
        await flush()
    }
    func flush() async {
        guard ownsSession else { return }
        for day in Array(drafts.keys) where conflicts[day] == nil { await save(day) }
    }
    func save(_ day: String) async {
        guard ownsSession, writable, !saving.contains(day), conflicts[day] == nil, var draft = drafts[day] else { return }
        saving.insert(day)
        defer { saving.remove(day) }
        let write = draft.pending ?? PersonalNote(note_date: day, content: draft.content, revision: draft.revision, mutation_id: draft.mutationID)
        draft.pending = write; drafts[day] = draft; persist()
        do {
            let saved: PersonalNote
            if demo {
                saved = PersonalNote(note_date: day, content: write.content, revision: write.revision + 1, mutation_id: write.mutation_id)
                var confirmed = notes; confirmed[day] = saved
                try DraftStorage.save(confirmed, account: account, key: "personal-notes-demo")
            }
            else {
                guard let api else { throw APIError.signedOut }
                let rows: [PersonalNote] = try await api.rpc("save_trainer_note", ["p_note_date": day, "p_content": write.content, "p_expected_revision": write.revision, "p_mutation_id": write.mutation_id])
                guard ownsSession else { return }
                guard let first = rows.first else { throw APIError.invalidResponse }
                saved = first
            }
            notes[day] = saved; errors[day] = nil
            if drafts[day]?.content == write.content { drafts[day] = nil }
            else if var current = drafts[day] {
                current.revision = saved.revision; current.mutationID = UUID().uuidString; current.pending = nil; drafts[day] = current
            }
            persist()
            if drafts[day] != nil { tasks[day] = Task { [weak self] in await self?.save(day) } }
        } catch APIError.conflict {
            do {
                guard ownsSession else { return }
                guard let api else { throw APIError.signedOut }
                let rows: [PersonalNote] = try await api.rows("trainer_notes", query: ["note_date": "eq.\(day)", "order": "note_date"])
                guard ownsSession else { return }
                guard let remote = rows.first else { throw APIError.invalidResponse }
                conflicts[day] = remote; errors[day] = "Заметка изменена на другом устройстве. Выбери версию."
            } catch { if ownsSession { errors[day] = error.localizedDescription } }
        } catch { if ownsSession { errors[day] = error.localizedDescription } }
    }
    func resolve(_ day: String, keepMine: Bool) async {
        guard ownsSession else { return }
        do {
            guard let api else { return }
            let rows: [PersonalNote] = try await api.rows("trainer_notes", query: ["note_date": "eq.\(day)", "order": "note_date"])
            guard ownsSession else { return }
            guard let remote = rows.first else { throw APIError.invalidResponse }
            // If the remote text changed while the dialog was open, show it first.
            guard remote.mutation_id == conflicts[day]?.mutation_id else { conflicts[day] = remote; return }
            notes[day] = remote
            if keepMine, var draft = drafts[day] {
                draft.revision = remote.revision; draft.mutationID = UUID().uuidString; draft.pending = nil; drafts[day] = draft
            } else { drafts[day] = nil }
            conflicts[day] = nil; errors[day] = nil; persist()
            if keepMine { await save(day) }
        } catch { if ownsSession { errors[day] = error.localizedDescription } }
    }
}
