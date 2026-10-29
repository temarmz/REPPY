import Foundation

struct AppConfiguration {
    let url: URL
    let key: String
    let webURL = URL(string: "https://temarmz.github.io/REPPY/")!
    static var current: AppConfiguration? {
        guard let value = Bundle.main.object(forInfoDictionaryKey: "SUPABASE_URL") as? String,
              let url = URL(string: value), url.scheme == "https", url.host != nil,
              let key = Bundle.main.object(forInfoDictionaryKey: "SUPABASE_PUBLISHABLE_KEY") as? String,
              !key.isEmpty, !key.contains("$(") else { return nil }
        guard (try? PublicBackendConfiguration(url: url, key: key)) != nil else { return nil }
        return AppConfiguration(url: url, key: key)
    }
    var backend: PublicBackendConfiguration { get throws { try PublicBackendConfiguration(url: url, key: key) } }
}

@MainActor final class SupabaseAPI {
    let configuration: AppConfiguration
    private(set) var session: AuthSession?
    private var refreshTask: Task<AuthSession, Error>?
    private var refreshID: UUID?
    private var sessionGeneration = UUID()
    private let transport: URLSession
    private let vault: any SessionVault
    init(configuration: AppConfiguration, transport: URLSession = .shared, vault: any SessionVault = SessionKeychain()) {
        self.configuration = configuration; self.transport = transport; self.vault = vault
    }
    func restore() throws {
        let restored = try vault.read()?.normalized()
        cancelRefresh()
        sessionGeneration = UUID(); session = restored
    }
    func accept(_ next: AuthSession) throws {
        try persist(next)
        cancelRefresh()
    }
    private func persist(_ next: AuthSession) throws {
        let next = try next.normalized()
        try vault.save(next); session = next; sessionGeneration = UUID()
    }
    private func cancelRefresh() { refreshTask?.cancel(); refreshTask = nil; refreshID = nil }
    func signOut() async throws {
        // Capture the token, then close the local account before any network wait.
        // A failed revocation cannot strand the user inside an expired account.
        let accessToken = session?.access_token
        try vault.save(nil)
        session = nil; sessionGeneration = UUID(); cancelRefresh()
        if let accessToken, let configuration = try? self.configuration.backend {
            let transport = self.transport
            Task {
                if let request = try? BackendHTTP.request(configuration: configuration, path: "auth/v1/logout", method: "POST", query: ["scope": "local"], bearer: accessToken, timeout: 10) {
                    _ = try? await transport.data(for: request)
                }
            }
        }
    }
    func token() async throws -> String {
        guard let current = session else { throw APIError.signedOut }
        if !current.needsRefresh() { return current.access_token }
        if let refreshTask { return try await refreshTask.value.access_token }
        let generation = sessionGeneration
        let refreshID = UUID(); self.refreshID = refreshID
        let task = Task<AuthSession, Error> {
            let data = try await self.request("auth/v1/token", method: "POST", query: ["grant_type": "refresh_token"], body: ["refresh_token": current.refresh_token], authenticated: false)
            let next = try JSONDecoder().decode(AuthSession.self, from: data).normalized()
            try Task.checkCancellation()
            guard self.sessionGeneration == generation else { throw CancellationError() }
            try self.persist(next); return next
        }
        refreshTask = task
        defer { if self.refreshID == refreshID { refreshTask = nil; self.refreshID = nil } }
        return try await task.value.access_token
    }
    func request(_ path: String, method: String = "GET", query: [String: String] = [:], body: [String: Any]? = nil,
                 rawBody: Data? = nil, contentType: String = "application/json", authenticated: Bool = true,
                 prefer: String? = nil) async throws -> Data {
        let accessToken = authenticated ? try await token() : nil
        let bytes = try body.map { try JSONSerialization.data(withJSONObject: $0, options: [.sortedKeys]) } ?? rawBody
        let request = try BackendHTTP.request(configuration: configuration.backend, path: path, method: method, query: query,
            body: bytes, bearer: accessToken, contentType: contentType, prefer: prefer)
        let (data, response) = try await transport.data(for: request)
        return try BackendHTTP.validate(data, response: response, requiresSession: authenticated || path == "auth/v1/token")
    }
    func upload(_ path: String, file: URL, contentType: String) async throws {
        let accessToken = try await token()
        let request = try BackendHTTP.request(configuration: configuration.backend, path: path, method: "POST", bearer: accessToken, contentType: contentType, timeout: 120)
        let (data, response) = try await transport.upload(for: request, fromFile: file)
        _ = try BackendHTTP.validate(data, response: response, requiresSession: true)
    }
    func rows<T: Decodable>(_ table: String, query: [String: String] = [:]) async throws -> [T] {
        var rows: [T] = []; var offset = 0
        while true {
            var page = query; page["select"] = page["select"] ?? "*"; page["limit"] = "1000"; page["offset"] = String(offset)
            page["order"] = page["order"] ?? (table == "set_results" ? "session_id,exercise_instance_id,set_number" : "id")
            let data = try await request("rest/v1/\(table)", query: page)
            let batch = try JSONDecoder().decode([T].self, from: data); rows += batch
            if batch.count < 1000 { break }; offset += batch.count
        }
        return rows
    }
    func rpc<T: Decodable>(_ name: String, _ body: [String: Any] = [:], authenticated: Bool = true) async throws -> T {
        let data = try await request("rest/v1/rpc/\(name)", method: "POST", body: body, authenticated: authenticated)
        return try JSONDecoder().decode(T.self, from: data)
    }
    func call(_ name: String, _ body: [String: Any] = [:]) async throws {
        _ = try await request("rest/v1/rpc/\(name)", method: "POST", body: body)
    }
    func insert(_ table: String, _ values: [String: Any]) async throws {
        let response = try await request("rest/v1/\(table)", method: "POST", query: ["on_conflict": "id"], body: values, prefer: "resolution=ignore-duplicates,return=representation")
        if let rows = try JSONSerialization.jsonObject(with: response) as? [[String: Any]], let row = rows.first,
           DatabaseAcknowledgement.matches(row: row, intended: values) { return }
        guard let id = values["id"] as? String else { throw APIError.invalidResponse }
        let remote = try await request("rest/v1/\(table)", query: ["id": "eq.\(id)", "select": "*"])
        guard let row = (try JSONSerialization.jsonObject(with: remote) as? [[String: Any]])?.first,
              DatabaseAcknowledgement.matches(row: row, intended: values) else { throw APIError.conflict }
    }
    func update<T: Decodable>(_ table: String, id: String, revision: Int, values: [String: Any]) async throws -> T {
        let data = try await request("rest/v1/\(table)", method: "PATCH", query: ["id": "eq.\(id)", "revision": "eq.\(revision)"], body: values, prefer: "return=representation")
        if let row = try JSONDecoder().decode([T].self, from: data).first { return row }
        let remote = try await request("rest/v1/\(table)", query: ["id": "eq.\(id)", "select": "*"])
        guard let rows = try JSONSerialization.jsonObject(with: remote) as? [[String: Any]], let row = rows.first,
              DatabaseAcknowledgement.matches(row: row, intended: values),
              let typed = try JSONDecoder().decode([T].self, from: remote).first else { throw APIError.conflict }
        return typed
    }
}

func jsonObject<T: Encodable>(_ value: T) throws -> [String: Any] {
    guard let object = try JSONSerialization.jsonObject(with: JSONEncoder().encode(value)) as? [String: Any] else { throw APIError.invalidResponse }
    return object
}
func nullable<T>(_ value: T?) -> Any { value.map { $0 as Any } ?? NSNull() }
