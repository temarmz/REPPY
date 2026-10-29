import Foundation

// Drafts are scoped to the authenticated account. Demo never shares its directory.
enum DraftStorage {
    private static func store() throws -> FileDraftStore {
        let directory = try FileManager.default.url(for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: true)
        return FileDraftStore(root: directory.appendingPathComponent("REPPY/Drafts-v1", isDirectory: true))
    }
    static func save<T: Codable>(_ value: T, account: String, key: String) throws {
        try store().save(value, account: account, key: key)
    }
    static func load<T: Decodable>(account: String, key: String) throws -> T? {
        try store().load(account: account, key: key)
    }
    static func remove(account: String, key: String) throws {
        try store().remove(account: account, key: key)
    }
}
