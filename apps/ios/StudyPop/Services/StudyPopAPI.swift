import Foundation

actor StudyPopAPI {
    private struct ConfigResponse: Decodable {
        struct FirebaseBlock: Decodable {
            struct PublicConfig: Decodable {
                let apiKey: String
            }
            let configured: Bool
            let config: PublicConfig?
        }
        let firebase: FirebaseBlock
    }

    private struct StateResponse: Decodable {
        let state: StudyPopState?
        let version: Int
        let updatedAt: String?
    }

    private struct SaveResponse: Decodable {
        let saved: Bool
        let version: Int
        let updatedAt: String?
    }

    private struct AnswerResponse: Decodable {
        let answer: String
    }

    private struct StudyKitResponse: Decodable {
        let kit: StudyKit
    }

    private struct TranscriptionResponse: Decodable {
        let text: String
    }

    private let baseURL: URL
    private let auth: FirebaseAuthService
    private var stateVersion = 0

    init(auth: FirebaseAuthService) {
        let configured = Bundle.main.object(
            forInfoDictionaryKey: "STUDYPOP_API_BASE_URL"
        ) as? String
        baseURL = URL(string: configured ?? "https://studypop-flame.vercel.app")!
        self.auth = auth
    }

    func bootstrap() async throws -> AuthUser? {
        let config: ConfigResponse = try await request(path: "/api/v1/config")
        guard config.firebase.configured, let firebase = config.firebase.config else {
            throw APIError(
                message: "StudyPop accounts are temporarily unavailable.",
                statusCode: 503,
                code: "FIREBASE_NOT_CONFIGURED"
            )
        }
        await auth.configure(apiKey: firebase.apiKey)
        return await auth.currentUser()
    }

    func loadState() async throws -> StudyPopState? {
        let response: StateResponse = try await request(
            path: "/api/v1/state",
            authenticated: true
        )
        stateVersion = response.version
        return response.state
    }

    func saveState(_ state: StudyPopState) async throws {
        struct Body: Encodable {
            let state: StudyPopState
            let version: Int
        }
        let response: SaveResponse = try await request(
            path: "/api/v1/state",
            method: "PUT",
            body: Body(state: state, version: stateVersion),
            authenticated: true
        )
        stateVersion = response.version
    }

    func answer(
        section: StudySection,
        question: String,
        images: [String],
        history: [ChatMessage],
        companion: Companion,
        studyKit: StudyKit?
    ) async throws -> String {
        struct Body: Encodable {
            struct HistoryMessage: Encodable {
                let role: String
                let text: String
            }
            let section: String
            let question: String
            let images: [String]
            let history: [HistoryMessage]
            let companion: String
            let studyContext: StudyKit?
        }
        let body = Body(
            section: section.rawValue,
            question: question,
            images: images,
            history: history.suffix(8).map {
                .init(role: $0.role.rawValue, text: $0.text)
            },
            companion: companion.name,
            studyContext: studyKit
        )
        let response: AnswerResponse = try await request(
            path: "/api/v1/ai/answer",
            method: "POST",
            body: body,
            authenticated: await auth.currentUser() != nil
        )
        return response.answer
    }

    func createStudyKit(note: String, images: [String]) async throws -> StudyKit {
        struct Body: Encodable {
            let note: String
            let images: [String]
        }
        let response: StudyKitResponse = try await request(
            path: "/api/v1/ai/study-kit",
            method: "POST",
            body: Body(note: note, images: images),
            authenticated: await auth.currentUser() != nil
        )
        return response.kit
    }

    func transcribe(audioDataURL: String, mimeType: String) async throws -> String {
        struct Body: Encodable {
            let audio: String
            let mimeType: String
        }
        let response: TranscriptionResponse = try await request(
            path: "/api/v1/ai/transcribe",
            method: "POST",
            body: Body(audio: audioDataURL, mimeType: mimeType),
            authenticated: await auth.currentUser() != nil
        )
        return response.text
    }

    func resetVersion() {
        stateVersion = 0
    }

    private func request<Response: Decodable>(
        path: String,
        method: String = "GET",
        authenticated: Bool = false
    ) async throws -> Response {
        try await request(
            path: path,
            method: method,
            bodyData: nil,
            authenticated: authenticated
        )
    }

    private func request<Response: Decodable, Body: Encodable>(
        path: String,
        method: String,
        body: Body,
        authenticated: Bool
    ) async throws -> Response {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        return try await request(
            path: path,
            method: method,
            bodyData: encoder.encode(body),
            authenticated: authenticated
        )
    }

    private func request<Response: Decodable>(
        path: String,
        method: String,
        bodyData: Data?,
        authenticated: Bool
    ) async throws -> Response {
        var request = URLRequest(url: baseURL.appending(path: path))
        request.httpMethod = method
        if let bodyData {
            request.httpBody = bodyData
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        }
        if authenticated {
            request.setValue(
                "Bearer \(try await auth.idToken())",
                forHTTPHeaderField: "Authorization"
            )
        }

        let (data, response) = try await URLSession.shared.data(for: request)
        let status = (response as? HTTPURLResponse)?.statusCode ?? 500
        if status == 401, authenticated {
            request.setValue(
                "Bearer \(try await auth.idToken(forceRefresh: true))",
                forHTTPHeaderField: "Authorization"
            )
            let (retryData, retryResponse) = try await URLSession.shared.data(for: request)
            return try decode(retryData, response: retryResponse)
        }
        return try decode(data, response: response)
    }

    private func decode<Response: Decodable>(
        _ data: Data,
        response: URLResponse
    ) throws -> Response {
        let status = (response as? HTTPURLResponse)?.statusCode ?? 500
        guard (200..<300).contains(status) else {
            let object = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
            let rawError = object?["error"]
            let payload = rawError as? [String: Any]
            let message = payload?["message"] as? String
                ?? rawError as? String
                ?? "StudyPop could not complete that request."
            throw APIError(
                message: message,
                statusCode: status,
                code: payload?["code"] as? String ?? "API_REQUEST_FAILED"
            )
        }
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return try decoder.decode(Response.self, from: data)
    }
}
