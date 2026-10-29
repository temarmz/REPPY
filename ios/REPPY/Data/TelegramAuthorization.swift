import AuthenticationServices
import CryptoKit
import Security
import UIKit

// The exact native redirect must be registered in BotFather and deployed in the
// Edge Function's allowlist. A custom scheme supports local simulator signing;
// HTTPS callbacks additionally require a domain with AASA/webcredentials.
@MainActor final class TelegramAuthorization: NSObject, ASWebAuthenticationPresentationContextProviding {
    private var session: ASWebAuthenticationSession?
    private var continuation: CheckedContinuation<(String, String), Error>?
    private var timeoutTask: Task<Void, Never>?
    private var requestID = UUID()
    func authorize(api: SupabaseAPI) async throws -> (idToken: String, nonce: String) {
        guard continuation == nil else { throw APIError.message("Вход уже открыт.") }
        struct Config: Decodable { var clientId: String; var redirectFlowConfigured: Bool; var nativeRedirectConfigured: Bool? }
        let data = try await api.request("functions/v1/telegram-auth", method: "POST", body: ["action": "config"], authenticated: false)
        let config = try JSONDecoder().decode(Config.self, from: data)
        guard config.redirectFlowConfigured else { throw APIError.message("Вход через Telegram временно не настроен.") }
        guard config.nativeRedirectConfigured == true else { throw APIError.message("Для входа с iPhone нужно опубликовать обновление функции telegram-auth и зарегистрировать адрес reppy://auth/telegram в BotFather.") }
        let verifier = try randomToken(), state = try randomToken(), nonce = try randomToken()
        let challenge = Data(SHA256.hash(data: Data(verifier.utf8))).base64URL
        let requestID = UUID(); self.requestID = requestID
        let redirect = URL(string: "reppy://auth/telegram")!
        var url = URLComponents(string: "https://oauth.telegram.org/auth")!
        url.queryItems = ["response_type": "code", "client_id": config.clientId, "redirect_uri": redirect.absoluteString,
            "scope": "openid profile telegram:bot_access", "state": state, "nonce": nonce,
            "code_challenge": challenge, "code_challenge_method": "S256", "lang": "ru"].map { URLQueryItem(name: $0.key, value: $0.value) }
        let (code, returnedState) = try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<(String, String), Error>) in
            self.continuation = continuation
            let callback = ASWebAuthenticationSession.Callback.customScheme("reppy")
            let session = ASWebAuthenticationSession(url: url.url!, callback: callback) { [weak self] url, error in
                Task { @MainActor in
                    guard let self, self.requestID == requestID else { return }
                    guard error == nil, let url, url.scheme == "reppy", url.host == "auth", url.path == "/telegram",
                          let parts = URLComponents(url: url, resolvingAgainstBaseURL: false),
                          let code = parts.queryItems?.first(where: { $0.name == "code" })?.value,
                          let state = parts.queryItems?.first(where: { $0.name == "state" })?.value else {
                        self.finish(.failure(APIError.message("Вход через Telegram отменён. Можно попробовать снова."))); return
                    }
                    self.finish(.success((code, state)))
                }
            }
            session.presentationContextProvider = self; session.prefersEphemeralWebBrowserSession = false
            self.session = session
            if !session.start() { finish(.failure(APIError.message("Не удалось открыть вход через Telegram."))); return }
            timeoutTask = Task { [weak self] in
                try? await Task.sleep(for: .seconds(300))
                if !Task.isCancelled, self?.requestID == requestID { self?.session?.cancel(); self?.finish(.failure(APIError.message("Время ожидания входа истекло."))) }
            }
        }
        guard returnedState == state else { throw APIError.message("Не удалось подтвердить ответ Telegram. Начни вход заново.") }
        let exchanged = try await api.request("functions/v1/telegram-auth", method: "POST", body: ["action": "exchange-code", "code": code,
            "verifier": verifier, "nonce": nonce, "redirectUri": redirect.absoluteString], authenticated: false)
        struct Token: Decodable { var idToken: String }
        return (try JSONDecoder().decode(Token.self, from: exchanged).idToken, nonce)
    }
    private func finish(_ result: Result<(String, String), Error>) {
        requestID = UUID()
        let continuation = continuation; self.continuation = nil; session = nil
        timeoutTask?.cancel(); timeoutTask = nil; continuation?.resume(with: result)
    }
    func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.flatMap(\.windows).first { $0.isKeyWindow } ?? ASPresentationAnchor()
    }
    private func randomToken() throws -> String {
        var bytes = [UInt8](repeating: 0, count: 48)
        guard SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes) == errSecSuccess else { throw APIError.invalidResponse }
        return Data(bytes).base64URL
    }
}
private extension Data {
    var base64URL: String { base64EncodedString().replacingOccurrences(of: "+", with: "-").replacingOccurrences(of: "/", with: "_").replacingOccurrences(of: "=", with: "") }
}
