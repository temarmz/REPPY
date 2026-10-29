import Foundation

public enum InvitationToken {
    public static func parse(_ raw: String) -> String? {
        let text = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        var token = text
        if let parts = URLComponents(string: text), parts.scheme != nil {
            if parts.scheme == "reppy", parts.host == "invite" { token = parts.queryItems?.first { $0.name == "token" }?.value ?? "" }
            else if parts.scheme == "https", parts.host == "temarmz.github.io", parts.path == "/REPPY/", let fragment = parts.fragment, fragment.hasPrefix("/invite/") {
                token = String(fragment.dropFirst("/invite/".count)).components(separatedBy: "/")[0].components(separatedBy: "?")[0]
            } else { return nil }
        }
        guard (40...128).contains(token.count), token.range(of: "^[A-Za-z0-9_-]+$", options: .regularExpression) != nil else { return nil }
        return token
    }
}
