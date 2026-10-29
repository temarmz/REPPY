import Foundation

public enum DraftStorageFailure: LocalizedError, Equatable {
    case invalidIdentity, corrupted, unsupportedVersion, wrongIdentity
    public var errorDescription: String? {
        switch self {
        case .invalidIdentity: return "Не удалось определить аккаунт или форму черновика."
        case .corrupted: return "Не удалось прочитать сохранённый черновик. Файл сохранён на этом устройстве."
        case .unsupportedVersion: return "Черновик создан другой версией приложения. Файл сохранён на этом устройстве."
        case .wrongIdentity: return "Сохранённый черновик относится к другому аккаунту или форме."
        }
    }
}

/// The same filesystem and envelope logic runs in the app and in portable tests.
/// Only a missing file means no draft; protected, unreadable or invalid files fail.
public final class FileDraftStore {
    private struct Envelope: Codable {
        var version: Int
        var account: String
        var key: String
        var savedAt: Date
        var payload: Data
    }
    private let root: URL
    private let files: FileManager
    public init(root: URL, files: FileManager = .default) { self.root = root; self.files = files }

    public func save<T: Codable>(_ value: T, account: String, key: String) throws {
        let url = try location(account: account, key: key)
        // Never overwrite a file that could not be restored. An explicit remove
        // (the form's discard action) is required before starting it over.
        let _: T? = try load(account: account, key: key)
        try files.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true, attributes: [.posixPermissions: 0o700])
        var directory = url.deletingLastPathComponent()
        var attributes = URLResourceValues(); attributes.isExcludedFromBackup = true
        try directory.setResourceValues(attributes)
        let envelope = Envelope(version: 1, account: account, key: key, savedAt: Date(), payload: try JSONEncoder().encode(value))
        var options: Data.WritingOptions = [.atomic]
        #if os(iOS)
        options.insert(.completeFileProtection)
        #endif
        try JSONEncoder().encode(envelope).write(to: url, options: options)
        try files.setAttributes([.posixPermissions: 0o600], ofItemAtPath: url.path)
    }

    public func load<T: Decodable>(account: String, key: String) throws -> T? {
        let url = try location(account: account, key: key)
        let bytes: Data
        do { bytes = try Data(contentsOf: url) }
        catch { if isMissing(error) { return nil }; throw error }
        let envelope: Envelope
        do { envelope = try JSONDecoder().decode(Envelope.self, from: bytes) }
        catch { throw DraftStorageFailure.corrupted }
        guard envelope.version == 1 else { throw DraftStorageFailure.unsupportedVersion }
        guard envelope.account == account, envelope.key == key else { throw DraftStorageFailure.wrongIdentity }
        do { return try JSONDecoder().decode(T.self, from: envelope.payload) }
        catch { throw DraftStorageFailure.corrupted }
    }

    public func remove(account: String, key: String) throws {
        do { try files.removeItem(at: location(account: account, key: key)) }
        catch { if !isMissing(error) { throw error } }
    }

    private func location(account: String, key: String) throws -> URL {
        guard root.isFileURL, !account.isEmpty, !key.isEmpty else { throw DraftStorageFailure.invalidIdentity }
        func component(_ text: String) -> String {
            Data(text.utf8).base64EncodedString().replacingOccurrences(of: "+", with: "-")
                .replacingOccurrences(of: "/", with: "_").replacingOccurrences(of: "=", with: "")
        }
        return root.appendingPathComponent(component(account), isDirectory: true).appendingPathComponent(component(key) + ".json")
    }
    private func isMissing(_ error: Error) -> Bool {
        let error = error as NSError
        return error.domain == NSCocoaErrorDomain && (error.code == NSFileReadNoSuchFileError || error.code == NSFileNoSuchFileError)
    }
}
