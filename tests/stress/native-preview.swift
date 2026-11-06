import Foundation
import Darwin
private final class StressVault: SessionVault {
    var value: AuthSession?
    func read() throws -> AuthSession? { value }
    func save(_ session: AuthSession?) throws { value = session }
}
@main struct NativePreviewProbe {
    @MainActor static func main() async {
        do { try await run() } catch { FileHandle.standardError.write(Data(String(describing: error).utf8)); exit(1) }
    }
    struct CrashDraft: Codable { let revision: Int; let account: String; let padding: String }
    static func draft(_ revision: Int, _ account: String) -> CrashDraft { CrashDraft(revision: revision, account: account, padding: String(repeating: "\(account):\(revision);", count: 3000)) }
    @MainActor static func run() async throws {
        guard CommandLine.arguments.count > 1 else { throw APIError.invalidResponse }
        if CommandLine.arguments[1] == "--draft-writer" {
            let store = FileDraftStore(root: URL(fileURLWithPath: CommandLine.arguments[2]))
            for revision in 1...10000 { for account in ["account-a", "account-b"] { try store.save(draft(revision, account), account: account, key: "workout") } }
            return
        }
        if CommandLine.arguments[1] == "--draft-chaos" {
            let root = FileManager.default.temporaryDirectory.appendingPathComponent("reppy-draft-chaos-" + UUID().uuidString)
            defer { try? FileManager.default.removeItem(at: root) }
            let store = FileDraftStore(root: root)
            for account in ["account-a", "account-b"] { try store.save(draft(0, account), account: account, key: "workout") }
            for iteration in 0..<30 {
                let child = Process(); child.executableURL = URL(fileURLWithPath: CommandLine.arguments[0]); child.arguments = ["--draft-writer", root.path]
                child.standardOutput = FileHandle.nullDevice; child.standardError = FileHandle.nullDevice
                try child.run(); usleep(useconds_t(20000 + (iteration % 5) * 20000)); kill(child.processIdentifier, SIGKILL); child.waitUntilExit()
                for account in ["account-a", "account-b"] {
                    guard let saved: CrashDraft = try store.load(account: account, key: "workout"), saved.account == account, saved.padding == draft(saved.revision, account).padding else { throw APIError.message("Corrupted or cross-account draft after kill") }
                }
            }
            print("{\"forcedKills\":30,\"accounts\":2,\"corruptedDrafts\":0}"); return
        }
        let config = try JSONSerialization.jsonObject(with: Data(contentsOf: URL(fileURLWithPath: CommandLine.arguments[1]))) as! [String: Any]
        guard config["url"] as? String == "https://nueevatykajichtakdnc.supabase.co" else { throw APIError.invalidResponse }
        let api = SupabaseAPI(configuration: AppConfiguration(url: URL(string: config["url"] as! String)!, key: config["anon"] as! String), vault: StressVault())
        try api.accept(JSONDecoder().decode(AuthSession.self, from: JSONSerialization.data(withJSONObject: config["session"]!)))
        if let body = config["save"] as? [String: Any] {
            struct Saved: Decodable { let revision: Int }
            do {
                let saved: Saved = try await api.rpc("save_session_progress", body)
                print("{\"success\":true,\"revision\":\(saved.revision)}")
            } catch APIError.conflict { print("{\"success\":false,\"code\":\"PT409\"}") }
            return
        }
        let started = Date()
        let snapshot = try await AppSnapshotLoader(api: api).data(for: .trainer)
        let rows = snapshot.assignments
        let entries = snapshot.subscriptions
        let result: [String: Any] = ["resultsAt91": snapshot.results.filter { $0.actual_reps == 91 }.count, "balance": entries.reduce(0) { $0 + $1.lesson_delta }, "results": snapshot.results.count, "completedSessions": snapshot.sessions.filter { $0.completed_at != nil }.count, "subscriptions": entries.count, "assignments": rows.count, "unique": Set(rows.map(\.id)).count, "milliseconds": Date().timeIntervalSince(started) * 1000]
        print(String(data: try JSONSerialization.data(withJSONObject: result), encoding: .utf8)!)
    }
}
