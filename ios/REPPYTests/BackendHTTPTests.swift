import XCTest
#if canImport(ReppyCore)
@testable import ReppyCore
#else
@testable import REPPY
#endif

final class BackendHTTPTests: XCTestCase {
    private let url = URL(string: "https://example.supabase.co")!
    private func configuration() throws -> PublicBackendConfiguration { try PublicBackendConfiguration(url: url, key: "sb_publishable_test") }
    private func jwt(role: String) -> String {
        let payload = Data("{\"role\":\"\(role)\"}".utf8).base64EncodedString().replacingOccurrences(of: "=", with: "").replacingOccurrences(of: "+", with: "-").replacingOccurrences(of: "/", with: "_")
        return "e30.\(payload).c2ln"
    }
    func testOnlyPublicKeysCanBeUsedByTheApp() throws {
        XCTAssertNoThrow(try configuration())
        XCTAssertNoThrow(try PublicBackendConfiguration(url: url, key: jwt(role: "anon")))
        for key in ["", "sb_secret_private", jwt(role: "service_role"), jwt(role: "authenticated"), "$(SUPABASE_KEY)", "sb_publishable_", "sb_publishable_test\r\nx-private: value"] {
            XCTAssertThrowsError(try PublicBackendConfiguration(url: url, key: key), key)
        }
    }
    func testConfigurationRejectsCredentialsPathsAndUnencryptedEndpoints() {
        for address in ["http://example.supabase.co", "https://user:password@example.supabase.co", "https://example.supabase.co/rest", "https://example.supabase.co?apikey=secret", "https://example.supabase.co#secret"] {
            XCTAssertThrowsError(try PublicBackendConfiguration(url: URL(string: address)!, key: "sb_publishable_test"))
        }
    }
    func testRevisionQueryPreservesTimezoneOffsetAndSpecialCharacters() throws {
        let query = ["updated_at": "eq.2026-10-29T12:00:00+03:00", "name": "eq.Жим + тяга & кор"]
        let request = try BackendHTTP.request(configuration: configuration(), path: "rest/v1/students", query: query, bearer: "access")
        let encoded = try XCTUnwrap(request.url?.absoluteString)
        XCTAssertTrue(encoded.contains("%2B03:00")); XCTAssertFalse(encoded.contains("+"))
        let decoded = URLComponents(url: try XCTUnwrap(request.url), resolvingAgainstBaseURL: false)!.queryItems!
        XCTAssertEqual(Dictionary(uniqueKeysWithValues: decoded.map { ($0.name, $0.value ?? "") }), query)
        XCTAssertEqual(request.value(forHTTPHeaderField: "Authorization"), "Bearer access")
        XCTAssertEqual(request.value(forHTTPHeaderField: "apikey"), "sb_publishable_test")
    }
    func testRequestPreservesMutationMethodBodyAndPreference() throws {
        let body = Data("{\"revision\":7}".utf8)
        let request = try BackendHTTP.request(configuration: configuration(), path: "rest/v1/assignments", method: "PATCH", query: ["revision": "eq.7"], body: body, prefer: "return=representation")
        XCTAssertEqual(request.httpMethod, "PATCH"); XCTAssertEqual(request.httpBody, body)
        XCTAssertEqual(request.value(forHTTPHeaderField: "Prefer"), "return=representation")
        XCTAssertEqual(request.value(forHTTPHeaderField: "Authorization"), "Bearer sb_publishable_test")
    }
    func testPathsCannotEscapeTheConfiguredBackend() throws {
        let config = try configuration()
        for path in ["", "//evil.test", "https://evil.test", "../auth", "rest/v1/../../auth", "rest?apikey=other", "rest#fragment"] {
            XCTAssertThrowsError(try BackendHTTP.request(configuration: config, path: path))
        }
    }
    func testConflictAndPublicAuthorizationErrorsRemainDistinct() throws {
        let denied = HTTPURLResponse(url: url, statusCode: 401, httpVersion: nil, headerFields: nil)!
        let payload = Data("{\"error\":\"Telegram не подтвердил вход\"}".utf8)
        XCTAssertThrowsError(try BackendHTTP.validate(payload, response: denied, requiresSession: true)) { XCTAssertEqual($0 as? APIError, .signedOut) }
        XCTAssertThrowsError(try BackendHTTP.validate(payload, response: denied, requiresSession: false)) { XCTAssertEqual($0 as? APIError, .message("Telegram не подтвердил вход")) }
        let conflict = HTTPURLResponse(url: url, statusCode: 409, httpVersion: nil, headerFields: nil)!
        XCTAssertThrowsError(try BackendHTTP.validate(Data("{\"code\":\"40001\"}".utf8), response: conflict, requiresSession: true)) { XCTAssertEqual($0 as? APIError, .conflict) }
    }
    func testEmptySuccessAndMalformedErrorResponses() throws {
        let success = HTTPURLResponse(url: url, statusCode: 204, httpVersion: nil, headerFields: nil)!
        XCTAssertEqual(try BackendHTTP.validate(Data(), response: success, requiresSession: true), Data())
        let failed = HTTPURLResponse(url: url, statusCode: 503, httpVersion: nil, headerFields: nil)!
        XCTAssertThrowsError(try BackendHTTP.validate(Data("<html>unavailable</html>".utf8), response: failed, requiresSession: true)) { XCTAssertEqual($0 as? APIError, .message("Ошибка сервера (503).")) }
    }
    func testSessionExpiryIsNormalizedOnceAndRefreshedBeforeExpiration() throws {
        let data = Data("{\"access_token\":\"a\",\"refresh_token\":\"r\",\"expires_in\":3600,\"user\":{\"id\":\"account\"}}".utf8)
        let initial = try JSONDecoder().decode(AuthSession.self, from: data)
        let normalized = try initial.normalized(now: Date(timeIntervalSince1970: 1000))
        XCTAssertEqual(normalized.expires_at, 4600)
        XCTAssertFalse(normalized.needsRefresh(now: Date(timeIntervalSince1970: 4000)))
        XCTAssertTrue(normalized.needsRefresh(now: Date(timeIntervalSince1970: 4550)))
        XCTAssertEqual(try normalized.normalized(now: Date(timeIntervalSince1970: 6000)).expires_at, 4600)
    }
}
