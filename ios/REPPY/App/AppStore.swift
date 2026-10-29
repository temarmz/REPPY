import SwiftUI
import Network

struct FailedDraft {
    var account: String
    var key: String
}

@MainActor final class AppStore: ObservableObject {
    @Published var profile: Profile?
    @Published var data = AppData()
    @Published var loading = true
    @Published var busy = false
    @Published var error: String?
    @Published var conflict = false
    @Published var isDemo = false
    @Published var pendingRegistration = false
    @Published var invitation = ""
    @Published var registrationName = ""
    @Published var networkAvailable = true
    @Published var failedDraft: FailedDraft?
    let api: SupabaseAPI?
    private let authorization = TelegramAuthorization()
    private var pendingTelegram: (idToken: String, nonce: String)?
    private var realtime: RealtimeObserver?
    private var refreshGate = SnapshotRefreshGate()
    private var active = true
    private var reloadTask: Task<Void, Never>?
    private let network = NWPathMonitor()
    var accountKey: String { isDemo ? "demo" : (profile?.id ?? "anonymous") }
    var ownStudent: Student? { data.students.first { $0.account_id == profile?.id } ?? (isDemo ? data.students.first : nil) }
    var ownRelationship: Relationship? { ownStudent.flatMap { data.relationship(for: $0.id) } }
    var isTrainer: Bool { profile?.role == .trainer }
    init(configuration: AppConfiguration? = .current) {
        api = configuration.map { SupabaseAPI(configuration: $0) }
        network.pathUpdateHandler = { [weak self] path in
            let available = path.status == .satisfied
            Task { @MainActor [weak self] in
                guard let self else { return }
                let recovered = !self.networkAvailable && available
                self.networkAvailable = available
                if recovered { await self.foreground() }
            }
        }
        network.start(queue: DispatchQueue(label: "app.reppy.connectivity"))
    }
    deinit { network.cancel() }
    func bootstrap() async {
        defer { loading = false }
        do {
            if ProcessInfo.processInfo.arguments.contains("--demo-trainer") { try openDemo(.trainer); return }
            if ProcessInfo.processInfo.arguments.contains("--demo-student") { try openDemo(.student); return }
            guard let api else { return }
            try api.restore()
            if api.session != nil { try await loadProfile(); try await loadData(); startRealtime() }
        } catch { present(error) }
    }
    func openDemo(_ role: Role) throws {
        guard let url = Bundle.main.url(forResource: "DemoData", withExtension: "json") else { throw APIError.invalidResponse }
        let fixture = try JSONDecoder().decode(AppData.self, from: Data(contentsOf: url))
        refreshGate.reset(); realtime?.stop(); realtime = nil
        isDemo = true; data = fixture.rebasedDemo()
        profile = Profile(id: role == .trainer ? "trainer-demo" : "student-demo", role: role, display_name: role == .trainer ? "Евгений Ч." : fixture.students.first?.name ?? "Ученик")
        error = nil; conflict = false; failedDraft = nil
    }
    func login(register: Bool = false) async {
        await run {
            guard let api = self.api else { throw APIError.message("Укажи подключение к Supabase в Config/Local.xcconfig.") }
            if !self.invitation.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty, self.invitationToken == nil { throw APIError.message("Проверь приглашение: вставь полную ссылку REPPY или токен от тренера.") }
            let credentials: (idToken: String, nonce: String)
            if register, let pending = self.pendingTelegram { credentials = pending }
            else { credentials = try await self.authorization.authorize(api: api) }
            var body: [String: Any] = ["action": register ? "register-trainer" : (self.invitationToken == nil ? "login" : "accept-student-invitation"),
                "idToken": credentials.idToken, "nonce": credentials.nonce]
            if register { body["displayName"] = self.registrationName.trimmingCharacters(in: .whitespacesAndNewlines) }
            if let token = self.invitationToken { body["invitationToken"] = token }
            let response = try await api.request("functions/v1/telegram-auth", method: "POST", body: body, authenticated: false)
            struct Reply: Decodable { var status: String?; var tokenHash: String?; var telegram: TelegramInfo? }
            struct TelegramInfo: Decodable { var displayName: String? }
            let reply = try JSONDecoder().decode(Reply.self, from: response)
            if reply.status == "registration-required" {
                self.pendingTelegram = credentials; self.pendingRegistration = true
                self.registrationName = reply.telegram?.displayName ?? ""; return
            }
            guard let hash = reply.tokenHash else { throw APIError.invalidResponse }
            let session = try await api.request("auth/v1/verify", method: "POST", body: ["token_hash": hash, "type": "magiclink"], authenticated: false)
            try api.accept(JSONDecoder().decode(AuthSession.self, from: session))
            try await self.loadProfile(); try await self.loadData(); self.startRealtime()
            self.pendingTelegram = nil; self.pendingRegistration = false; self.invitation = ""
        }
    }
    var invitationToken: String? {
        InvitationToken.parse(invitation)
    }
    func signOut() async {
        await run {
            if !self.isDemo { try await self.api?.signOut() }
            self.refreshGate.reset(); self.realtime?.stop(); self.realtime = nil; self.reloadTask?.cancel()
            self.profile = nil; self.data = AppData(); self.isDemo = false; self.pendingTelegram = nil; self.pendingRegistration = false
            self.failedDraft = nil
        }
    }
    private func loadProfile() async throws {
        guard let api, let id = api.session?.user.id else { throw APIError.signedOut }
        let rows: [Profile] = try await api.rows("profiles", query: ["id": "eq.\(id)"])
        guard let profile = rows.first else { throw APIError.message("Профиль аккаунта не найден.") }
        if self.profile?.id != profile.id { refreshGate.reset() }
        self.profile = profile
    }
    func loadData() async throws {
        guard let api, let profile, !isDemo else { return }
        let version = refreshGate.revision; let account = profile.id
        async let students: [Student] = api.rows("students")
        async let relationships: [Relationship] = api.rows("trainer_student_relationships")
        async let assignments: [Assignment] = api.rows("assignments")
        async let sessions: [WorkoutSession] = api.rows("workout_sessions")
        async let results: [SetResult] = api.rows("set_results")
        async let definitions: [ExerciseDefinition] = api.rows("exercise_definitions", query: ["archived_at": "is.null"])
        let subscriptions: [SubscriptionEntry]
        if profile.role == .trainer { subscriptions = try await api.rpc("get_trainer_subscription_entries") }
        else { subscriptions = try await api.rows("subscription_entries") }
        var next = AppData()
        next.students = try await students; next.relationships = try await relationships
        next.assignments = try await assignments; next.sessions = try await sessions
        next.results = try await results; next.definitions = try await definitions; next.subscriptions = subscriptions
        try Task.checkCancellation()
        guard refreshGate.accepts(version), self.profile?.id == account else { return }
        data = next
    }
    func reload() async {
        guard !busy else { return }
        let hadConflict = conflict
        if !(await run { try await self.loadData() }), hadConflict { conflict = true }
    }
    func foreground() async {
        active = true
        guard profile != nil, !isDemo else { return }
        refreshGate.request(); await drainRefresh(); startRealtime()
    }
    func background() { active = false; reloadTask?.cancel(); realtime?.stop(); realtime = nil }
    private func startRealtime() {
        guard let api, let account = profile?.id, active, !isDemo else { return }
        realtime?.stop()
        realtime = RealtimeObserver(api: api) { [weak self] in
            guard let self, self.profile?.id == account else { return }
            self.refreshGate.request(); self.scheduleRefresh()
        }
        realtime?.start()
    }
    private func scheduleRefresh() {
        guard refreshGate.pending, active, !busy, !conflict, !isDemo, profile != nil else { return }
        reloadTask?.cancel()
        reloadTask = Task { [weak self] in
            try? await Task.sleep(for: .milliseconds(350))
            guard !Task.isCancelled, let self else { return }
            await self.drainRefresh()
        }
    }
    private func drainRefresh() async {
        guard let ticket = refreshGate.begin(allowed: active && !busy && !conflict && !isDemo && profile != nil) else { return }
        defer { refreshGate.finish(ticket); scheduleRefresh() }
        do { try await loadData() }
        catch { if refreshGate.accepts(ticket), self.error == nil { present(error) } }
    }
    func present(_ reason: Error) {
        if reason is CancellationError { return }
        conflict = (reason as? APIError).map { if case .conflict = $0 { return true }; return false } ?? false
        error = reason.localizedDescription
    }
    @discardableResult func run(_ operation: () async throws -> Void) async -> Bool {
        guard !busy else { return false }
        busy = true; refreshGate.invalidate(); error = nil; conflict = false
        defer { busy = false; scheduleRefresh() }
        do { try await operation(); return true } catch { present(error); return false }
    }
    func requireTrainer() throws { guard isTrainer else { throw APIError.message("Это действие доступно тренеру.") } }
    func restoreDraft<T: Decodable>(key: String) -> T? {
        do { return try DraftStorage.load(account: accountKey, key: key) }
        catch { failedDraft = FailedDraft(account: accountKey, key: key); present(error); return nil }
    }
    func discardFailedDraft() {
        guard let failedDraft, failedDraft.account == accountKey else { return }
        do {
            try DraftStorage.remove(account: failedDraft.account, key: failedDraft.key)
            self.failedDraft = nil; error = nil
        } catch { present(error) }
    }
}
