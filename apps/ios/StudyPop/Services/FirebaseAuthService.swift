import Foundation

actor FirebaseAuthService {
    private struct Session: Codable {
        var idToken: String
        var refreshToken: String
        var expiresAt: Date
        var user: AuthUser
    }

    private struct FirebaseAuthResponse: Decodable {
        let idToken: String?
        let refreshToken: String?
        let expiresIn: String?
        let localId: String?
        let email: String?
        let displayName: String?
    }

    private struct RefreshResponse: Decodable {
        let idToken: String
        let refreshToken: String
        let expiresIn: String
        let userId: String

        enum CodingKeys: String, CodingKey {
            case idToken = "id_token"
            case refreshToken = "refresh_token"
            case expiresIn = "expires_in"
            case userId = "user_id"
        }
    }

    private let keychain = KeychainStore(service: "com.studypop.ios")
    private let sessionAccount = "firebase-session"
    private var apiKey = ""
    private var session: Session?

    init() {
        if let data = keychain.load(account: sessionAccount) {
            session = try? JSONDecoder().decode(Session.self, from: data)
        }
    }

    func configure(apiKey: String) {
        self.apiKey = apiKey
    }

    func currentUser() -> AuthUser? {
        session?.user
    }

    func signUp(name: String, email: String, password: String) async throws -> AuthUser {
        let created: FirebaseAuthResponse = try await authRequest(
            path: "accounts:signUp",
            body: [
                "email": email,
                "password": password,
                "returnSecureToken": true,
            ]
        )
        guard let idToken = created.idToken else {
            throw authError("Firebase did not return a session.")
        }

        let updated: FirebaseAuthResponse = try await authRequest(
            path: "accounts:update",
            body: [
                "idToken": idToken,
                "displayName": name,
                "returnSecureToken": true,
            ]
        )
        return try persist(response: updated, fallbackRefreshToken: created.refreshToken ?? "")
    }

    func signIn(email: String, password: String) async throws -> AuthUser {
        let response: FirebaseAuthResponse = try await authRequest(
            path: "accounts:signInWithPassword",
            body: [
                "email": email,
                "password": password,
                "returnSecureToken": true,
            ]
        )
        return try persist(response: response)
    }

    func sendPasswordReset(email: String) async throws {
        let _: FirebaseAuthResponse = try await authRequest(
            path: "accounts:sendOobCode",
            body: [
                "requestType": "PASSWORD_RESET",
                "email": email,
            ]
        )
    }

    func deleteAccount() async throws {
        let token = try await idToken()
        let _: FirebaseAuthResponse = try await authRequest(
            path: "accounts:delete",
            body: ["idToken": token]
        )
        signOut()
    }

    func signOut() {
        session = nil
        keychain.delete(account: sessionAccount)
    }

    func idToken(forceRefresh: Bool = false) async throws -> String {
        guard session != nil else {
            throw APIError(message: "Log in to continue.", statusCode: 401, code: "AUTH_REQUIRED")
        }
        if forceRefresh || session!.expiresAt <= Date().addingTimeInterval(60) {
            try await refresh()
        }
        return session!.idToken
    }

    private func authRequest<Response: Decodable>(
        path: String,
        body: [String: Any]
    ) async throws -> Response {
        guard !apiKey.isEmpty else {
            throw APIError(
                message: "Firebase authentication is not configured.",
                statusCode: 503,
                code: "FIREBASE_NOT_CONFIGURED"
            )
        }
        var components = URLComponents(
            string: "https://identitytoolkit.googleapis.com/v1/\(path)"
        )!
        components.queryItems = [URLQueryItem(name: "key", value: apiKey)]
        var request = URLRequest(url: components.url!)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONSerialization.data(withJSONObject: body)
        return try await decode(request)
    }

    private func refresh() async throws {
        guard let existing = session else { return }
        var components = URLComponents(
            string: "https://securetoken.googleapis.com/v1/token"
        )!
        components.queryItems = [URLQueryItem(name: "key", value: apiKey)]
        var request = URLRequest(url: components.url!)
        request.httpMethod = "POST"
        request.setValue(
            "application/x-www-form-urlencoded",
            forHTTPHeaderField: "Content-Type"
        )
        request.httpBody = "grant_type=refresh_token&refresh_token=\(existing.refreshToken.urlEncoded)"
            .data(using: .utf8)
        let response: RefreshResponse = try await decode(request)
        session = Session(
            idToken: response.idToken,
            refreshToken: response.refreshToken,
            expiresAt: Date().addingTimeInterval(TimeInterval(response.expiresIn) ?? 3600),
            user: existing.user
        )
        try saveSession()
    }

    private func persist(
        response: FirebaseAuthResponse,
        fallbackRefreshToken: String = ""
    ) throws -> AuthUser {
        guard
            let idToken = response.idToken,
            let localId = response.localId,
            let email = response.email
        else {
            throw authError("Firebase returned an incomplete session.")
        }
        let user = AuthUser(
            id: localId,
            email: email,
            name: response.displayName ?? email.components(separatedBy: "@").first ?? "Student"
        )
        session = Session(
            idToken: idToken,
            refreshToken: response.refreshToken ?? fallbackRefreshToken,
            expiresAt: Date().addingTimeInterval(TimeInterval(response.expiresIn ?? "") ?? 3600),
            user: user
        )
        try saveSession()
        return user
    }

    private func saveSession() throws {
        guard let session else { return }
        try keychain.save(try JSONEncoder().encode(session), account: sessionAccount)
    }

    private func decode<Response: Decodable>(_ request: URLRequest) async throws -> Response {
        let (data, response) = try await URLSession.shared.data(for: request)
        let status = (response as? HTTPURLResponse)?.statusCode ?? 500
        guard (200..<300).contains(status) else {
            throw firebaseError(data: data, status: status)
        }
        return try JSONDecoder().decode(Response.self, from: data)
    }

    private func firebaseError(data: Data, status: Int) -> APIError {
        let object = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
        let error = object?["error"] as? [String: Any]
        let rawCode = (error?["message"] as? String)?.components(separatedBy: " : ").first
            ?? "FIREBASE_REQUEST_FAILED"
        let messages = [
            "EMAIL_EXISTS": "An account with that email already exists.",
            "INVALID_LOGIN_CREDENTIALS": "Email or password is incorrect.",
            "INVALID_EMAIL": "Enter a valid email address.",
            "WEAK_PASSWORD": "Use a stronger password with at least 8 characters.",
            "TOO_MANY_ATTEMPTS_TRY_LATER": "Too many attempts. Try again shortly.",
        ]
        return APIError(
            message: messages[rawCode] ?? "The account request could not be completed.",
            statusCode: status,
            code: rawCode
        )
    }

    private func authError(_ message: String) -> APIError {
        APIError(message: message, statusCode: 500, code: "AUTH_RESPONSE_INVALID")
    }
}

private extension String {
    var urlEncoded: String {
        addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? self
    }
}
