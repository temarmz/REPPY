import Foundation

@MainActor final class AppRefreshCoordinator {
    private let api: SupabaseAPI?
    private let observeChanges: Bool
    private let allowed: () -> Bool
    private let currentAccount: () -> String?
    private let load: () async throws -> Void
    private let report: (Error) -> Void
    private var gate = SnapshotRefreshGate()
    private var observer: RealtimeObserver?
    private var active = true
    private var reloadTask: Task<Void, Never>?
    private var reloadID: UUID?

    init(api: SupabaseAPI?, observeChanges: Bool, allowed: @escaping () -> Bool,
         currentAccount: @escaping () -> String?,
         load: @escaping () async throws -> Void, report: @escaping (Error) -> Void) {
        self.api = api
        self.observeChanges = observeChanges
        self.allowed = allowed
        self.currentAccount = currentAccount
        self.load = load
        self.report = report
    }

    var revision: UInt64 { gate.revision }
    func accepts(_ revision: UInt64) -> Bool { gate.accepts(revision) }
    func invalidate() { gate.invalidate() }
    func reset() {
        gate.reset()
        stopObserver()
        cancelScheduledRefresh()
    }
    func request() { gate.request(); schedule() }
    func retryAfterCancellation() { gate.request() }

    func foreground(account: String) async {
        active = true
        gate.request()
        await drain()
        startObserver(account: account)
    }
    func activate() { active = true }
    func background() {
        active = false
        cancelScheduledRefresh()
        stopObserver()
    }
    func startObserver(account: String) {
        guard observeChanges, let api, active, currentAccount() == account else { return }
        stopObserver()
        observer = RealtimeObserver(api: api) { [weak self] in
            guard let self, self.currentAccount() == account else { return }
            self.request()
        }
        observer?.start()
    }
    private func stopObserver() { observer?.stop(); observer = nil }
    private func cancelScheduledRefresh() { reloadTask?.cancel(); reloadTask = nil; reloadID = nil }
    func schedule() {
        guard gate.pending, !gate.isReading, reloadTask == nil, active, allowed() else { return }
        let id = UUID(); reloadID = id
        reloadTask = Task { [weak self] in
            guard let self else { return }
            defer {
                if self.reloadID == id { self.reloadTask = nil; self.reloadID = nil; self.schedule() }
            }
            try? await Task.sleep(for: .milliseconds(350))
            guard !Task.isCancelled else { return }
            await self.drain()
            if self.observer == nil, let account = self.currentAccount() { self.startObserver(account: account) }
        }
    }
    private func drain() async {
        guard let ticket = gate.begin(allowed: active && allowed()) else { return }
        defer { gate.finish(ticket); schedule() }
        do { try await load() }
        catch where gate.accepts(ticket) {
            if APIError.isCancellation(error) { gate.request() }
            else { report(error) }
        } catch {}
    }
}
