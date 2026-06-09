package com.studypop.android.model

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Test

class StudyModelsTest {
    @Test
    fun stateRoundTripPreservesConversationAndStudyKit() {
        val original = StudyPopState(
            theme = StudyTheme.PURPLE.id,
            companion = StudyCompanion.PROFESSOR.id,
            chats = mapOf(
                StudySection.MATH.id to listOf(
                    ChatMessage(role = "user", text = "Solve x + 2 = 5"),
                    ChatMessage(role = "assistant", text = "x = 3"),
                ),
            ),
            studyKit = StudyKit(
                summary = "Plants use light to make food.",
                keyPoints = listOf("Light energy", "Carbon dioxide"),
                cards = listOf(Flashcard("What is photosynthesis?", "Making food with light.")),
                questions = listOf("Why do plants need light?"),
            ),
            streak = 7,
        )

        val restored = StudyPopState.fromJson(original.toJson())

        assertEquals(StudyTheme.PURPLE, restored.selectedTheme)
        assertEquals(StudyCompanion.PROFESSOR, restored.selectedCompanion)
        assertEquals("x = 3", restored.messages(StudySection.MATH)[1].text)
        assertEquals(7, restored.streak)
        assertNotNull(restored.studyKit)
        assertEquals("What is photosynthesis?", restored.studyKit.cards.first().front)
    }

    @Test
    fun unknownIdsUseFriendlyDefaults() {
        val state = StudyPopState(theme = "mystery", companion = "unknown")

        assertEquals(StudyTheme.PINK, state.selectedTheme)
        assertEquals(StudyCompanion.GOJO, state.selectedCompanion)
        assertEquals(StudySection.STUDY, StudySection.fromId("not-a-room"))
    }
}
