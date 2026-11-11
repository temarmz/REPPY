import SwiftUI
import Network

struct FailedDraft {
    var account: String
    var key: String
}

@MainActor final class AppStore: ObservableObject {
    @Published var profile: Profile?
    @Published var data = AppData() {
        didSet { progressCache.removeAll() }
    }
    private var progressCache: [Set<String>: [ProgressGroup]] = [:]
    func progressGroups(relationshipIDs: Set<String>) -> [ProgressGroup] {
        if let cached = progressCache[relationshipIDs] { return cached }
        let groups = ExerciseProgress.collect(data: data, relationshipIDs: relationshipIDs)
        progressCache[relationshipIDs] = groups
        return groups
    }
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
    private var pendingRegistrationToken: String?
    private let observeChanges: Bool
    private lazy var refresh = AppRefreshCoordinator(api: api, observeChanges: observeChanges,
        allowed: { [weak self] in guard let self else { return false }; return !self.busy && !self.conflict && !self.isDemo && self.profile != nil },
        currentAccount: { [weak self] in self?.profile?.id },
        load: { [weak self] in guard let self else { return }; try await self.loadData() },
        report: { [weak self] error in guard let self, self.error == nil else { return }; self.present(error) })
    private let network = NWPathMonitor()
    var accountKey: String {
#if DEBUG
        if isDemo && ProcessInfo.processInfo.arguments.contains("--audit-screen") {
            let arguments = ProcessInfo.processInfo.arguments
            let namespace = arguments.firstIndex(of: "--audit-namespace").flatMap { arguments.indices.contains($0 + 1) ? arguments[$0 + 1] : nil }
            return "visual-audit-" + (profile?.role.rawValue ?? "demo") + (namespace.map { ":" + $0 } ?? "")
        }
#endif
        return isDemo ? "demo" : (profile?.id ?? "anonymous")
    }
    var ownStudent: Student? { data.students.first { $0.account_id == profile?.id } ?? (isDemo ? data.students.first : nil) }
    var ownRelationshipIDs: Set<String> { profile.map { data.relationshipIDs(forAccount: $0.id) } ?? [] }
    var ownSubscriptions: [SubscriptionEntry] { data.subscriptions.filter { ownRelationshipIDs.contains($0.relationship_id) } }
    var ownBalance: Int { ownSubscriptions.reduce(0) { $0 + $1.lesson_delta } }
    var isTrainer: Bool { profile?.role == .trainer }
    init(configuration: AppConfiguration? = .current, transport: URLSession = .shared, vault: any SessionVault = SessionKeychain(), observeChanges: Bool = true) {
        api = configuration.map { SupabaseAPI(configuration: $0, transport: transport, vault: vault) }
        self.observeChanges = observeChanges
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
#if DEBUG
            if ProcessInfo.processInfo.arguments.contains("--audit-sign-in") {
                pendingRegistration = ProcessInfo.processInfo.arguments.contains("--audit-registration")
                registrationName = pendingRegistration ? "Александр" : ""
                return
            }
#endif
            if ProcessInfo.processInfo.arguments.contains("--demo-trainer") { try openDemo(.trainer); return }
            if ProcessInfo.processInfo.arguments.contains("--demo-student") { try openDemo(.student); return }
            guard let api else { return }
            try api.restore()
            if api.session != nil { try await loadProfile(); try await loadData(); if let account = profile?.id { refresh.startObserver(account: account) } }
        } catch {
            present(error)
            if APIError.isCancellation(error), profile != nil { requestRefresh() }
        }
    }
    func openDemo(_ role: Role) throws {
        guard let url = Bundle.main.url(forResource: "DemoData", withExtension: "json") else { throw APIError.invalidResponse }
        let fixture = try JSONDecoder().decode(AppData.self, from: Data(contentsOf: url))
        refresh.reset()
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
            if register, let token = self.pendingRegistrationToken { body["registrationToken"] = token }
            if let token = self.invitationToken { body["invitationToken"] = token }
            let response = try await api.request("functions/v1/telegram-auth", method: "POST", body: body, authenticated: false)
            struct Reply: Decodable { var status: String?; var tokenHash: String?; var telegram: TelegramInfo?; var registrationToken: String? }
            struct TelegramInfo: Decodable { var displayName: String? }
            let reply = try JSONDecoder().decode(Reply.self, from: response)
            if reply.status == "registration-required" {
                self.pendingTelegram = credentials; self.pendingRegistration = true
                self.pendingRegistrationToken = reply.registrationToken
                self.registrationName = reply.telegram?.displayName ?? ""; return
            }
            guard let hash = reply.tokenHash else { throw APIError.invalidResponse }
            let session = try await api.request("auth/v1/verify", method: "POST", body: ["token_hash": hash, "type": "magiclink"], authenticated: false)
            try api.accept(JSONDecoder().decode(AuthSession.self, from: session))
            try await self.loadProfile(); try await self.loadData(); if let account = self.profile?.id { self.refresh.startObserver(account: account) }
            self.pendingTelegram = nil; self.pendingRegistration = false; self.invitation = ""
            self.pendingRegistrationToken = nil
        }
    }
    var invitationToken: String? {
        InvitationToken.parse(invitation)
    }
    func acceptPendingInvitation() async {
        await run {
            guard self.profile?.role == .student else { throw APIError.message("Приглашение можно принять только в аккаунте ученика.") }
            guard let api = self.api, let token = self.invitationToken else { throw APIError.message("Проверь ссылку приглашения.") }
            let _: Relationship = try await api.rpc("accept_student_invitation", ["p_token": token])
            try await self.loadData()
            self.invitation = ""
        }
    }
    func cancelRegistration() {
        guard !busy else { return }
        pendingTelegram = nil; pendingRegistration = false; registrationName = ""; error = nil
        pendingRegistrationToken = nil
    }
    func signOut() async {
        await run {
            if !self.isDemo { try await self.api?.signOut() }
            self.refresh.reset()
            self.profile = nil; self.data = AppData(); self.isDemo = false; self.pendingTelegram = nil; self.pendingRegistration = false
            self.pendingRegistrationToken = nil
            self.failedDraft = nil
        }
    }
    private func loadProfile() async throws {
        guard let api else { throw APIError.signedOut }
        let profile = try await AppSnapshotLoader(api: api).profile()
        if self.profile?.id != profile.id { refresh.reset() }
        self.profile = profile
    }
    func loadData() async throws {
        guard let api, let profile, !isDemo else { return }
        let version = refresh.revision; let account = profile.id
        let next = try await AppSnapshotLoader(api: api).data(for: profile.role)
        guard refresh.accepts(version), self.profile?.id == account else { return }
        data = next
    }
    func reload() async {
        guard !busy else { return }
        let hadConflict = conflict
        if !(await run { try await self.loadData() }), hadConflict { conflict = true }
    }
    func foreground() async {
        refresh.activate()
        guard profile != nil, !isDemo else { return }
        await refresh.foreground(account: profile!.id)
    }
    func background() { refresh.background() }
    func requestRefresh() { refresh.request() }
    func present(_ reason: Error) {
        if APIError.isCancellation(reason) { return }
        conflict = (reason as? APIError).map { if case .conflict = $0 { return true }; return false } ?? false
        ActivityLog.record("application.error", outcome: "error")
        error = reason.localizedDescription
    }
    @discardableResult func run(name: String = #function, _ operation: () async throws -> Void) async -> Bool {
        guard !busy else { return false }
        ActivityLog.record("operation." + name, outcome: "started")
        busy = true; refresh.invalidate(); error = nil; conflict = false
        defer { busy = false; refresh.schedule() }
        do { try await operation(); ActivityLog.record("operation." + name); return true } catch {
            ActivityLog.record("operation." + name, outcome: "error")
            present(error)
            if APIError.isCancellation(error), profile != nil { refresh.retryAfterCancellation() }
            return false
        }
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
