import XCTest
@testable import StudyPop

final class StudyModelsTests: XCTestCase {
    func testStateRoundTripPreservesConversationAndStudyKit() throws {
        var state = StudyPopState()
        state.selectedTheme = .purple
        state.selectedCompanion = .professor
        state.chats[StudySection.math.rawValue] = [
            ChatMessage(role: .user, text: "What is the square root of 81?"),
            ChatMessage(role: .assistant, text: "The answer is 9."),
        ]
        state.studyKit = StudyKit(
            summary: "A small summary",
            keyPoints: ["One key point"],
            cards: [Flashcard(front: "Question", back: "Answer")],
            questions: ["What is the main idea?"]
        )

        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        let data = try encoder.encode(state)
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        let restored = try decoder.decode(StudyPopState.self, from: data)

        XCTAssertEqual(restored, state)
        XCTAssertEqual(restored.messages(for: .math).count, 2)
    }

    func testEverySectionHasAStableIdentifierAndSymbol() {
        XCTAssertEqual(Set(StudySection.allCases.map(\.id)).count, StudySection.allCases.count)
        XCTAssertTrue(StudySection.allCases.allSatisfy { !$0.symbol.isEmpty })
    }
}

