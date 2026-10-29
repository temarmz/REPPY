import Foundation
import Security

protocol SessionVault {
    func read() throws -> AuthSession?
    func save(_ session: AuthSession?) throws
}

struct SessionKeychain: SessionVault {
    private var service: String { (Bundle.main.bundleIdentifier ?? "app.reppy.ios") + ".auth" }
    func read() throws -> AuthSession? {
        var result: CFTypeRef?
        let status = SecItemCopyMatching([kSecClass: kSecClassGenericPassword, kSecAttrService: service,
            kSecAttrAccount: "supabase", kSecReturnData: true, kSecMatchLimit: kSecMatchLimitOne] as CFDictionary, &result)
        if status == errSecItemNotFound { return nil }
        guard status == errSecSuccess, let data = result as? Data else { throw APIError.message("Не удалось открыть защищённое хранилище входа.") }
        return try JSONDecoder().decode(AuthSession.self, from: data)
    }
    func save(_ session: AuthSession?) throws {
        let query = [kSecClass: kSecClassGenericPassword, kSecAttrService: service, kSecAttrAccount: "supabase"] as [CFString: Any]
        guard let session else {
            let status = SecItemDelete(query as CFDictionary)
            guard status == errSecSuccess || status == errSecItemNotFound else { throw APIError.message("Не удалось удалить сохранённый вход.") }; return
        }
        let data = try JSONEncoder().encode(session)
        let status = SecItemUpdate(query as CFDictionary, [kSecValueData: data] as CFDictionary)
        if status == errSecItemNotFound {
            var values = query; values[kSecValueData] = data
            values[kSecAttrAccessible] = kSecAttrAccessibleWhenUnlockedThisDeviceOnly
            guard SecItemAdd(values as CFDictionary, nil) == errSecSuccess else { throw APIError.message("Не удалось сохранить защищённый вход.") }
        } else if status != errSecSuccess { throw APIError.message("Не удалось обновить защищённый вход.") }
    }
}
