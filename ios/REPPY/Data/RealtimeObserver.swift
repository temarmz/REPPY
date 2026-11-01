import Foundation

@MainActor final class RealtimeObserver {
    private let api: SupabaseAPI
    private let onChange: () -> Void
    private var socket: URLSessionWebSocketTask?
    private var task: Task<Void, Never>?
    private var heartbeat: Task<Void, Never>?
    init(api: SupabaseAPI, onChange: @escaping () -> Void) { self.api = api; self.onChange = onChange }
    func start() {
        stop()
        task = Task { [weak self] in
            guard let self else { return }
            var delay: UInt64 = 1
            while !Task.isCancelled {
                do {
                    let token = try await self.api.token()
                    var url = URLComponents(url: self.api.configuration.url.appendingPathComponent("realtime/v1/websocket"), resolvingAgainstBaseURL: false)!
                    url.scheme = "wss"; url.queryItems = [URLQueryItem(name: "apikey", value: self.api.configuration.key), URLQueryItem(name: "vsn", value: "1.0.0")]
                    let socket = URLSession.shared.webSocketTask(with: url.url!); self.socket = socket; socket.resume()
                    let tables = ["students", "trainer_student_relationships", "exercise_definitions", "assignments", "workout_sessions", "set_results", "subscription_entries", "trainer_notes"]
                    try await self.send(["topic": "realtime:reppy-ios", "event": "phx_join", "ref": "1", "payload": ["access_token": token,
                        "config": ["broadcast": ["self": false], "presence": ["key": ""], "postgres_changes": tables.map { ["event": "*", "schema": "public", "table": $0] }]]], socket: socket)
                    self.heartbeat = Task { [weak self] in
                        while !Task.isCancelled {
                            try? await Task.sleep(for: .seconds(25))
                            guard !Task.isCancelled, let self else { return }
                            do {
                                let token = try await self.api.token()
                                try await self.send(["topic": "phoenix", "event": "heartbeat", "payload": [:], "ref": UUID().uuidString], socket: socket)
                                try await self.send(["topic": "realtime:reppy-ios", "event": "access_token", "payload": ["access_token": token], "ref": UUID().uuidString], socket: socket)
                            } catch { socket.cancel(with: .goingAway, reason: nil); return }
                        }
                    }
                    while !Task.isCancelled {
                        let message = try await socket.receive()
                        try Task.checkCancellation()
                        let bytes: Data
                        switch message { case .string(let text): bytes = Data(text.utf8); case .data(let data): bytes = data; @unknown default: continue }
                        let json = (try? JSONSerialization.jsonObject(with: bytes)) as? [String: Any]
                        if json?["event"] as? String == "postgres_changes" { self.onChange() }
                        if json?["event"] as? String == "phx_reply", json?["ref"] as? String == "1" {
                            let payload = json?["payload"] as? [String: Any]
                            guard payload?["status"] as? String == "ok" else { throw APIError.invalidResponse }
                            delay = 1; self.onChange()
                        }
                        if ["phx_error", "phx_close"].contains(json?["event"] as? String ?? "") { throw APIError.invalidResponse }
                    }
                } catch { /* Reconnect with backoff; foreground also reloads the authoritative snapshot. */ }
                self.heartbeat?.cancel(); self.socket?.cancel(with: .goingAway, reason: nil)
                guard !Task.isCancelled else { return }
                try? await Task.sleep(nanoseconds: delay * 1_000_000_000); delay = min(delay * 2, 30)
            }
        }
    }
    private func send(_ value: [String: Any], socket: URLSessionWebSocketTask) async throws {
        let data = try JSONSerialization.data(withJSONObject: value)
        try await socket.send(.string(String(decoding: data, as: UTF8.self)))
    }
    func stop() { task?.cancel(); task = nil; heartbeat?.cancel(); heartbeat = nil; socket?.cancel(with: .goingAway, reason: nil); socket = nil }
}
