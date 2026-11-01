#if canImport(UIKit)
import XCTest
@testable import REPPY

private func nativeSnapshotFixture() throws -> AppData { try TestFixtures.load() }

private final class MemorySessionVault: SessionVault {
    var session: AuthSession?
    func read() throws -> AuthSession? { session }
    func save(_ value: AuthSession?) throws { session = value }
}

private final class NativeHTTPStub: URLProtocol {
    private let loadingLock = NSLock()
    private var stopped = false
    private var cancellation: (() -> Void)?
    private final class HandlerState: @unchecked Sendable {
        let lock = NSLock()
        var handler: ((NativeHTTPStub) -> Void)?
    }
    private static let state = HandlerState()
    static func configure(_ next: ((NativeHTTPStub) -> Void)?) { state.lock.lock(); defer { state.lock.unlock() }; state.handler = next }
    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() {
        Self.state.lock.lock(); let handle = Self.state.handler; Self.state.lock.unlock()
        if let handle { handle(self) } else { fail(URLError(.unsupportedURL)) }
    }
    override func stopLoading() { loadingLock.lock(); stopped = true; let action = cancellation; loadingLock.unlock(); action?() }
    func onCancellation(_ action: @escaping () -> Void) { loadingLock.lock(); cancellation = action; loadingLock.unlock() }
    func respond(_ value: Any, status: Int = 200) {
        loadingLock.lock(); let stopped = stopped; loadingLock.unlock(); guard !stopped else { return }
        let response = HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: "HTTP/1.1", headerFields: ["Content-Type": "application/json"])!
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: try! JSONSerialization.data(withJSONObject: value))
        client?.urlProtocolDidFinishLoading(self)
    }
    func fail(_ error: Error) { client?.urlProtocol(self, didFailWithError: error) }
    var body: [String: Any] {
        var data = request.httpBody ?? Data()
        if data.isEmpty, let stream = request.httpBodyStream {
            stream.open(); defer { stream.close() }
            var buffer = [UInt8](repeating: 0, count: 4096)
            while stream.hasBytesAvailable { let count = stream.read(&buffer, maxLength: buffer.count); if count <= 0 { break }; data.append(contentsOf: buffer.prefix(count)) }
        }
        return (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] ?? [:]
    }
}

private final class SnapshotTestServer {
    private let lock = NSLock()
    private let responses: [String: Any]
    private var held: [(NativeHTTPStub, Any)] = []
    private var holding = true
    private var cancellations = 0
    private var onFirstRequest: (() -> Void)?
    init(data: AppData, onFirstRequest: @escaping () -> Void) throws {
        func json<T: Encodable>(_ value: T) throws -> Any { try JSONSerialization.jsonObject(with: JSONEncoder().encode(value)) }
        responses = try [
            "/rest/v1/students": json(data.students), "/rest/v1/trainer_student_relationships": json(data.relationships),
            "/rest/v1/assignments": json(data.assignments), "/rest/v1/workout_sessions": json(data.sessions),
            "/rest/v1/set_results": json(data.results), "/rest/v1/exercise_definitions": json(data.definitions),
            "/rest/v1/rpc/get_trainer_subscription_entries": json(data.subscriptions),
        ]
        self.onFirstRequest = onFirstRequest
    }
    var cancelledRequests: Int { lock.lock(); defer { lock.unlock() }; return cancellations }
    func handle(_ stub: NativeHTTPStub) {
        lock.lock()
        guard let response = responses[stub.request.url?.path ?? ""] else { lock.unlock(); stub.fail(URLError(.unsupportedURL)); return }
        let first = onFirstRequest; onFirstRequest = nil
        if holding {
            held.append((stub, response)); stub.onCancellation { [weak self] in self?.recordCancellation() }
            lock.unlock(); first?()
        } else { lock.unlock(); stub.respond(response) }
    }
    private func recordCancellation() { lock.lock(); cancellations += 1; lock.unlock() }
    func release() { lock.lock(); holding = false; let requests = held; held = []; lock.unlock(); for (stub, response) in requests { stub.respond(response) } }
}

private final class NotesTestServer {
    private let lock = NSLock()
    private var writes: [[String: Any]] = []
    private var tokens: [String] = []
    private var remote: [String: Any]?
    private var loseResponse = false
    private var rejectWrite = false
    private var held: NativeHTTPStub?
    private var onHeldWrite: (() -> Void)?
    func setRemote(_ value: [String: Any]?) { lock.lock(); defer { lock.unlock() }; remote = value }
    func loseNextResponse() { lock.lock(); defer { lock.unlock() }; loseResponse = true }
    func conflictNextWrite() { lock.lock(); defer { lock.unlock() }; rejectWrite = true }
    func holdNextWrite(_ action: @escaping () -> Void) { lock.lock(); defer { lock.unlock() }; onHeldWrite = action }
    var recordedWrites: [[String: Any]] { lock.lock(); defer { lock.unlock() }; return writes }
    var recordedTokens: [String] { lock.lock(); defer { lock.unlock() }; return tokens }
    func releaseWrite() {
        lock.lock(); let request = held; held = nil; let response = remote; lock.unlock()
        request?.respond(response.map { [$0] } ?? [])
    }
    func handle(_ stub: NativeHTTPStub) {
        lock.lock(); defer { lock.unlock() }
        guard stub.request.url?.host == "native-tests.supabase.co" else { stub.fail(URLError(.unsupportedURL)); return }
        if stub.request.url?.path == "/rest/v1/trainer_notes" { stub.respond(remote.map { [$0] } ?? []); return }
        guard stub.request.url?.path == "/rest/v1/rpc/save_trainer_note" else { stub.fail(URLError(.unsupportedURL)); return }
        let body = stub.body; writes.append(body); tokens.append(stub.request.value(forHTTPHeaderField: "Authorization") ?? "")
        if rejectWrite { rejectWrite = false; stub.respond(["code": "40001"], status: 409); return }
        if remote?["mutation_id"] as? String != body["p_mutation_id"] as? String {
            remote = ["note_date": body["p_note_date"]!, "content": body["p_content"]!, "revision": (body["p_expected_revision"] as? Int ?? 0) + 1, "mutation_id": body["p_mutation_id"]!]
        }
        if let onHeldWrite { self.onHeldWrite = nil; held = stub; onHeldWrite(); return }
        if loseResponse { loseResponse = false; stub.fail(URLError(.networkConnectionLost)); return }
        stub.respond(remote.map { [$0] } ?? [])
    }
}

@MainActor final class NativeAccountTests: XCTestCase {
    private let day = "2035-05-17"
    private func session(_ account: String) -> AuthSession {
        AuthSession(access_token: "test-access-" + account, refresh_token: "test-refresh", expires_at: Date().timeIntervalSince1970 + 3600, user: .init(id: account))
    }
    private func fixture(_ server: NotesTestServer) throws -> (AppStore, NotesStore, String, URLSession) {
        let account = "native-test-" + UUID().uuidString.lowercased()
        let configuration = URLSessionConfiguration.ephemeral; configuration.protocolClasses = [NativeHTTPStub.self]
        let transport = URLSession(configuration: configuration)
        NativeHTTPStub.configure(server.handle)
        let store = AppStore(configuration: AppConfiguration(url: URL(string: "https://native-tests.supabase.co")!, key: "sb_publishable_test"), transport: transport, vault: MemorySessionVault(), observeChanges: false)
        store.profile = Profile(id: account, role: .trainer, display_name: "Transport test")
        try store.api!.accept(session(account))
        return (store, NotesStore(observeChanges: false), account, transport)
    }
    private func cleanup(_ notes: NotesStore, _ account: String, _ transport: URLSession) {
        notes.stop(); transport.invalidateAndCancel(); NativeHTTPStub.configure(nil)
        try? DraftStorage.remove(account: account, key: "personal-notes")
        try? DraftStorage.remove(account: account, key: "notes-range")
    }
    func testKeychainRoundTripUsesAnIsolatedService() throws {
        let vault = SessionKeychain(service: "app.reppy.tests." + UUID().uuidString)
        defer { try? vault.save(nil) }
        XCTAssertNil(try vault.read())
        try vault.save(session("keychain-test"))
        XCTAssertEqual(try vault.read()?.user.id, "keychain-test")
        try vault.save(nil); XCTAssertNil(try vault.read())
    }
    func testRealtimeBurstDoesNotCancelSnapshotOrLeaveExercisesEmpty() async throws {
        let (store, notes, account, transport) = try fixture(NotesTestServer())
        defer { store.background(); cleanup(notes, account, transport) }
        let sample = try nativeSnapshotFixture(), started = expectation(description: "snapshot started")
        let server = try SnapshotTestServer(data: sample) { started.fulfill() }
        NativeHTTPStub.configure(server.handle)
        store.requestRefresh(); await fulfillment(of: [started], timeout: 3)
        store.requestRefresh(); store.requestRefresh()
        try await Task.sleep(for: .milliseconds(450))
        XCTAssertEqual(server.cancelledRequests, 0)
        server.release()
        for _ in 0..<100 { if !store.data.definitions.isEmpty { break }; try await Task.sleep(for: .milliseconds(20)) }
        XCTAssertEqual(store.data.definitions.count, sample.definitions.count)
        XCTAssertEqual(store.data.sessions.count, sample.sessions.count)
        XCTAssertEqual(store.data.results.count, sample.results.count)
        XCTAssertNil(store.error)
    }
    func testBackgroundCancellationRecoversOnForegroundWithoutErrorBanner() async throws {
        let (store, notes, account, transport) = try fixture(NotesTestServer())
        defer { store.background(); cleanup(notes, account, transport) }
        let sample = try nativeSnapshotFixture(), started = expectation(description: "snapshot started")
        let server = try SnapshotTestServer(data: sample) { started.fulfill() }
        NativeHTTPStub.configure(server.handle)
        store.requestRefresh(); await fulfillment(of: [started], timeout: 3)
        store.background(); server.release()
        try await Task.sleep(for: .milliseconds(50))
        XCTAssertNil(store.error)
        await store.foreground()
        for _ in 0..<100 { if !store.data.definitions.isEmpty { break }; try await Task.sleep(for: .milliseconds(20)) }
        XCTAssertEqual(store.data.definitions.count, sample.definitions.count)
        XCTAssertEqual(store.data.assignments.count, sample.assignments.count)
        XCTAssertNil(store.error)
    }
    func testOldNotebookCannotWriteUsingAnotherAccountOrAfterStop() async throws {
        let server = NotesTestServer(); let (store, notes, account, transport) = try fixture(server)
        defer { cleanup(notes, account, transport) }
        await notes.start(store: store); notes.edit(day, "Private account A text")
        try store.api!.accept(session("account-B"))
        XCTAssertFalse(notes.canEdit)
        await notes.flush(); await notes.resolve(day, keepMine: true)
        XCTAssertTrue(server.recordedWrites.isEmpty)
        XCTAssertEqual(notes.text(day), "Private account A text")
        try store.api!.accept(session(account)); notes.stop(); await notes.flush()
        XCTAssertTrue(server.recordedWrites.isEmpty)
        let restored: [String: NoteDraft]? = try DraftStorage.load(account: account, key: "personal-notes")
        XCTAssertEqual(restored?[day]?.content, "Private account A text")
    }
    func testLateAcknowledgementDoesNotDiscardOldAccountDraft() async throws {
        let server = NotesTestServer(); let (store, notes, account, transport) = try fixture(server)
        defer { cleanup(notes, account, transport) }
        await notes.start(store: store); notes.edit(day, "Retain until account A confirms")
        let sent = expectation(description: "old account request sent")
        server.holdNextWrite { sent.fulfill() }
        let saving = Task { await notes.save(day) }
        await fulfillment(of: [sent], timeout: 3)
        notes.stop(); try store.api!.accept(session("account-B")); server.releaseWrite(); await saving.value
        XCTAssertNotNil(notes.drafts[day]?.pending)
        XCTAssertNil(notes.notes[day])
        XCTAssertEqual(server.recordedTokens, ["Bearer test-access-" + account])
        let restored: [String: NoteDraft]? = try DraftStorage.load(account: account, key: "personal-notes")
        XCTAssertNotNil(restored?[day]?.pending)
    }
    func testLostResponseRetriesSameMutationAndClearsAcknowledgedDraft() async throws {
        let server = NotesTestServer(); let (store, notes, account, transport) = try fixture(server)
        defer { cleanup(notes, account, transport) }
        await notes.start(store: store); notes.edit(day, "A committed note")
        server.loseNextResponse(); await notes.save(day)
        XCTAssertNotNil(notes.drafts[day]?.pending); XCTAssertNotNil(notes.errors[day])
        await notes.save(day)
        let writes = server.recordedWrites
        XCTAssertEqual(writes.count, 2)
        XCTAssertEqual(writes.first?["p_mutation_id"] as? String, writes.last?["p_mutation_id"] as? String)
        XCTAssertEqual(writes.last?["p_expected_revision"] as? Int, 0)
        XCTAssertEqual(notes.notes[day]?.revision, 1); XCTAssertNil(notes.drafts[day]); XCTAssertNil(notes.errors[day])
    }
    func testConflictRequiresSeeingNewRemoteVersionBeforeWriting() async throws {
        let server = NotesTestServer(); let (store, notes, account, transport) = try fixture(server)
        defer { cleanup(notes, account, transport) }
        await notes.start(store: store); notes.edit(day, "My note")
        server.setRemote(["note_date": day, "content": "Other device", "revision": 4, "mutation_id": "remote-4"])
        server.conflictNextWrite(); await notes.save(day)
        XCTAssertEqual(notes.conflicts[day]?.revision, 4)
        server.setRemote(["note_date": day, "content": "Changed again", "revision": 5, "mutation_id": "remote-5"])
        await notes.resolve(day, keepMine: true)
        XCTAssertEqual(notes.conflicts[day]?.revision, 5); XCTAssertEqual(server.recordedWrites.count, 1)
        await notes.resolve(day, keepMine: true)
        XCTAssertNil(notes.conflicts[day]); XCTAssertEqual(notes.notes[day]?.content, "My note")
        XCTAssertEqual(server.recordedWrites.last?["p_expected_revision"] as? Int, 5)
    }
}
#endif
