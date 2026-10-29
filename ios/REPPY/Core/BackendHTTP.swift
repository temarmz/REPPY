import Foundation

public enum APIError: LocalizedError, Equatable {
    case message(String), conflict, signedOut, invalidResponse
    public var errorDescription: String? {
        switch self {
        case .message(let message): return message
        case .conflict: return "Данные изменились на другом устройстве. Загрузи актуальную версию перед сохранением."
        case .signedOut: return "Сессия истекла. Войди через Telegram снова."
        case .invalidResponse: return "Сервер вернул неожиданный ответ. Попробуй ещё раз."
        }
    }
}

public struct PublicBackendConfiguration {
    public let url: URL
    public let key: String

    public init(url: URL, key: String) throws {
        guard url.scheme == "https", url.host != nil, url.user == nil, url.password == nil,
              url.query == nil, url.fragment == nil, url.path.isEmpty || url.path == "/" else {
            throw APIError.message("Укажи HTTPS-адрес проекта Supabase без пути и параметров.")
        }
        guard !key.contains("$("), key.rangeOfCharacter(from: .whitespacesAndNewlines) == nil else {
            throw APIError.message("Публичный ключ Supabase не настроен.")
        }
        if key.hasPrefix("sb_publishable_") {
            guard key.count > "sb_publishable_".count else { throw APIError.message("Публичный ключ Supabase пуст.") }
        } else {
            let parts = key.split(separator: ".", omittingEmptySubsequences: false)
            guard parts.count == 3 else { throw APIError.message("Приложению нужен публичный publishable или anon ключ Supabase.") }
            var payload = String(parts[1]).replacingOccurrences(of: "-", with: "+").replacingOccurrences(of: "_", with: "/")
            payload += String(repeating: "=", count: (4 - payload.count % 4) % 4)
            guard let bytes = Data(base64Encoded: payload),
                  let claims = try? JSONSerialization.jsonObject(with: bytes) as? [String: Any],
                  claims["role"] as? String == "anon" else {
                throw APIError.message("Секретные и service-role ключи нельзя включать в приложение.")
            }
        }
        self.url = url; self.key = key
    }
}

public enum BackendHTTP {
    public static func request(configuration: PublicBackendConfiguration, path: String, method: String = "GET",
                               query: [String: String] = [:], body: Data? = nil, bearer: String? = nil,
                               contentType: String = "application/json", prefer: String? = nil,
                               timeout: TimeInterval = 30) throws -> URLRequest {
        guard !path.isEmpty, !path.hasPrefix("/"), !path.contains("://"), !path.contains(".."),
              !path.contains("?"), !path.contains("#") else { throw APIError.invalidResponse }
        guard var parts = URLComponents(url: configuration.url.appendingPathComponent(path), resolvingAgainstBaseURL: false) else { throw APIError.invalidResponse }
        if !query.isEmpty { parts.queryItems = query.sorted { $0.key < $1.key }.map { URLQueryItem(name: $0.key, value: $0.value) } }
        // '+' belongs to a timezone or query value, never form-encoded whitespace.
        parts.percentEncodedQuery = parts.percentEncodedQuery?.replacingOccurrences(of: "+", with: "%2B")
        guard let url = parts.url, url.host == configuration.url.host else { throw APIError.invalidResponse }
        var request = URLRequest(url: url); request.httpMethod = method; request.timeoutInterval = timeout
        request.httpBody = body
        request.setValue(configuration.key, forHTTPHeaderField: "apikey")
        request.setValue("Bearer \(bearer ?? configuration.key)", forHTTPHeaderField: "Authorization")
        request.setValue(contentType, forHTTPHeaderField: "Content-Type")
        if let prefer = prefer { request.setValue(prefer, forHTTPHeaderField: "Prefer") }
        return request
    }

    public static func validate(_ data: Data, response: URLResponse, requiresSession: Bool) throws -> Data {
        guard let http = response as? HTTPURLResponse else { throw APIError.invalidResponse }
        guard !(200..<300).contains(http.statusCode) else { return data }
        let payload = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
        if payload?["code"] as? String == "40001" { throw APIError.conflict }
        if http.statusCode == 401 && requiresSession { throw APIError.signedOut }
        let message = ["error_description", "message", "error"].compactMap { payload?[$0] as? String }.first { !$0.isEmpty }
        throw APIError.message(message ?? "Ошибка сервера (\(http.statusCode)).")
    }
}

public struct AuthSession: Codable {
    public struct User: Codable { public let id: String }
    public var access_token: String
    public var refresh_token: String
    public var expires_at: Double?
    public var expires_in: Double?
    public var user: User
    public func needsRefresh(now: Date = Date()) -> Bool { (expires_at ?? 0) < now.timeIntervalSince1970 + 60 }
    public func normalized(now: Date = Date()) throws -> AuthSession {
        guard !access_token.isEmpty, !refresh_token.isEmpty, !user.id.isEmpty else { throw APIError.invalidResponse }
        var copy = self
        if copy.expires_at == nil { copy.expires_at = now.timeIntervalSince1970 + (expires_in ?? 3600) }
        guard let expiry = copy.expires_at, expiry.isFinite else { throw APIError.invalidResponse }
        return copy
    }
}
