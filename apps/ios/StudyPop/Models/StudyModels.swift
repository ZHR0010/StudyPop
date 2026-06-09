import Foundation
import SwiftUI

enum StudySection: String, CaseIterable, Codable, Identifiable, Sendable {
    case study
    case general
    case math
    case history
    case biology
    case physics
    case economics
    case chemistry
    case literature
    case government

    var id: String { rawValue }

    var title: String {
        rawValue.prefix(1).uppercased() + rawValue.dropFirst()
    }

    var symbol: String {
        switch self {
        case .study: "sparkles"
        case .general: "message"
        case .math: "function"
        case .history: "building.columns"
        case .biology: "microbe"
        case .physics: "atom"
        case .economics: "chart.line.uptrend.xyaxis"
        case .chemistry: "flask"
        case .literature: "book"
        case .government: "scale.3d"
        }
    }
}

enum StudyTheme: String, CaseIterable, Codable, Identifiable, Sendable {
    case light
    case pink
    case purple
    case blue
    case red
    case dark

    var id: String { rawValue }

    var color: Color {
        switch self {
        case .light: Color(red: 1.0, green: 0.98, blue: 0.94)
        case .pink: Color(red: 1.0, green: 0.45, blue: 0.68)
        case .purple: Color(red: 0.55, green: 0.42, blue: 0.91)
        case .blue: Color(red: 0.31, green: 0.56, blue: 0.96)
        case .red: Color(red: 0.94, green: 0.38, blue: 0.38)
        case .dark: Color(red: 0.16, green: 0.14, blue: 0.23)
        }
    }
}

enum Companion: String, CaseIterable, Codable, Identifiable, Sendable {
    case gojo
    case tanjiro
    case professor
    case eleven
    case harry

    var id: String { rawValue }

    var name: String {
        switch self {
        case .gojo: "Gojo"
        case .tanjiro: "Tanjiro"
        case .professor: "Professor"
        case .eleven: "Eleven"
        case .harry: "Harry Potter"
        }
    }

    var assetName: String {
        "companion-\(rawValue)"
    }

    var encouragement: String {
        switch self {
        case .gojo: "No pressure. We'll make it click."
        case .tanjiro: "One calm step at a time."
        case .professor: "Curiosity switched on!"
        case .eleven: "Hard question? We can handle it."
        case .harry: "Let's work a little study magic."
        }
    }
}

struct ChatMessage: Codable, Identifiable, Equatable, Sendable {
    enum Role: String, Codable, Sendable {
        case user
        case assistant
    }

    var id: UUID = UUID()
    let role: Role
    let text: String
    var images: [String] = []
    var createdAt: Date = Date()
}

struct Flashcard: Codable, Equatable, Sendable {
    let front: String
    let back: String
}

struct StudyKit: Codable, Equatable, Sendable {
    let summary: String
    let keyPoints: [String]
    let cards: [Flashcard]
    let questions: [String]
}

struct StudyPopState: Codable, Equatable, Sendable {
    var theme: String = StudyTheme.pink.rawValue
    var companion: String = Companion.gojo.rawValue
    var chats: [String: [ChatMessage]] = [:]
    var studyKit: StudyKit?
    var streak: Int = 3

    var selectedTheme: StudyTheme {
        get { StudyTheme(rawValue: theme) ?? .pink }
        set { theme = newValue.rawValue }
    }

    var selectedCompanion: Companion {
        get { Companion(rawValue: companion) ?? .gojo }
        set { companion = newValue.rawValue }
    }

    func messages(for section: StudySection) -> [ChatMessage] {
        chats[section.rawValue] ?? []
    }
}

struct AuthUser: Codable, Equatable, Sendable {
    let id: String
    let email: String
    let name: String
    var emailVerified: Bool = false
}

struct APIError: LocalizedError, Sendable {
    let message: String
    let statusCode: Int
    let code: String

    var errorDescription: String? { message }
}
