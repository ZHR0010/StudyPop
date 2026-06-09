import Foundation
import SwiftUI

@MainActor
final class AppStore: ObservableObject {
    enum Phase {
        case loading
        case ready
    }

    @Published var phase: Phase = .loading
    @Published var user: AuthUser?
    @Published var state = StudyPopState()
    @Published var selectedSection: StudySection = .study
    @Published var isSending = false
    @Published var syncMessage = "Saved on this device"
    @Published var errorMessage = ""
    @Published var showingAuth = false
    @Published var showingSettings = false

    private let auth: FirebaseAuthService
    private let api: StudyPopAPI
    private var saveTask: Task<Void, Never>?
    private let localStateKey = "studypop.state.v1"

    init() {
        let auth = FirebaseAuthService()
        self.auth = auth
        api = StudyPopAPI(auth: auth)
        loadLocalState()
    }

    var colorScheme: ColorScheme? {
        state.selectedTheme == .dark ? .dark : nil
    }

    var accentColor: Color {
        state.selectedTheme.color
    }

    var companion: Companion {
        state.selectedCompanion
    }

    func messages(for section: StudySection? = nil) -> [ChatMessage] {
        state.messages(for: section ?? selectedSection)
    }

    func bootstrap() async {
        defer { phase = .ready }
        do {
            user = try await api.bootstrap()
            if user != nil, let cloudState = try await api.loadState() {
                state = cloudState
                saveLocalState()
                syncMessage = "Synced across your devices"
            }
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func signUp(name: String, email: String, password: String) async throws {
        user = try await auth.signUp(name: name, email: email, password: password)
        await api.resetVersion()
        try await api.saveState(state)
        showingAuth = false
        syncMessage = "Account created and synced"
    }

    func signIn(email: String, password: String) async throws {
        user = try await auth.signIn(email: email, password: password)
        await api.resetVersion()
        if let cloudState = try await api.loadState() {
            state = cloudState
            saveLocalState()
        } else {
            try await api.saveState(state)
        }
        showingAuth = false
        syncMessage = "Synced across your devices"
    }

    func sendPasswordReset(email: String) async throws {
        try await auth.sendPasswordReset(email: email)
    }

    func signOut() async {
        await auth.signOut()
        await api.resetVersion()
        user = nil
        syncMessage = "Saved on this device"
        showingSettings = false
    }

    func selectTheme(_ theme: StudyTheme) {
        state.selectedTheme = theme
        stateDidChange()
    }

    func selectCompanion(_ companion: Companion) {
        state.selectedCompanion = companion
        stateDidChange()
    }

    func clearConversation() {
        state.chats[selectedSection.rawValue] = []
        stateDidChange()
    }

    func submit(question: String, images: [String]) async {
        let trimmed = question.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty || !images.isEmpty, !isSending else { return }

        let userText = trimmed.isEmpty ? "Please look at this picture." : trimmed
        append(ChatMessage(role: .user, text: userText), to: selectedSection)
        isSending = true
        defer { isSending = false }

        do {
            if selectedSection == .study, state.studyKit == nil {
                let kit = try await api.createStudyKit(note: trimmed, images: images)
                state.studyKit = kit
                append(
                    ChatMessage(
                        role: .assistant,
                        text: "Done! I made \(kit.cards.count) flashcards and a mini quiz."
                    ),
                    to: .study
                )
            } else {
                let answer = try await api.answer(
                    section: selectedSection,
                    question: trimmed,
                    images: images,
                    history: messages(),
                    companion: companion,
                    studyKit: selectedSection == .study ? state.studyKit : nil
                )
                append(ChatMessage(role: .assistant, text: answer), to: selectedSection)
            }
        } catch {
            append(
                ChatMessage(
                    role: .assistant,
                    text: "\(error.localizedDescription) Try once more when you're ready."
                ),
                to: selectedSection
            )
        }
    }

    func resetStudyKit() {
        state.studyKit = nil
        stateDidChange()
    }

    func transcribe(data: Data, mimeType: String) async throws -> String {
        let dataURL = "data:\(mimeType);base64,\(data.base64EncodedString())"
        return try await api.transcribe(audioDataURL: dataURL, mimeType: mimeType)
    }

    private func append(_ message: ChatMessage, to section: StudySection) {
        state.chats[section.rawValue, default: []].append(message)
        stateDidChange()
    }

    private func stateDidChange() {
        saveLocalState()
        guard user != nil else {
            syncMessage = "Saved on this device"
            return
        }

        syncMessage = "Syncing..."
        saveTask?.cancel()
        let snapshot = state
        saveTask = Task {
            try? await Task.sleep(for: .milliseconds(500))
            guard !Task.isCancelled else { return }
            do {
                try await api.saveState(snapshot)
                syncMessage = "Synced across your devices"
            } catch {
                syncMessage = "Sync will retry"
            }
        }
    }

    private func saveLocalState() {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        guard let data = try? encoder.encode(state) else { return }
        UserDefaults.standard.set(data, forKey: localStateKey)
    }

    private func loadLocalState() {
        guard let data = UserDefaults.standard.data(forKey: localStateKey) else { return }
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        if let restored = try? decoder.decode(StudyPopState.self, from: data) {
            state = restored
        }
    }
}

