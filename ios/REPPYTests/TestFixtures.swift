import Foundation
#if canImport(ReppyCore)
@testable import ReppyCore
#else
@testable import REPPY
#endif

enum TestFixtures {
    private final class ResourceBundle: NSObject {}
    static func load() throws -> AppData {
        try load(AppData.self, name: "WebContract")
    }
    static func load<T: Decodable>(_ type: T.Type, name: String) throws -> T {
        #if SWIFT_PACKAGE
        let url = URL(fileURLWithPath: #filePath).deletingLastPathComponent().appendingPathComponent("Fixtures/\(name).json")
        #else
        guard let url = Bundle(for: ResourceBundle.self).url(forResource: name, withExtension: "json") else { throw APIError.invalidResponse }
        #endif
        return try JSONDecoder().decode(type, from: Data(contentsOf: url))
    }
}
