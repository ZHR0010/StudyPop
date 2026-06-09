package com.studypop.android.model

import org.json.JSONArray
import org.json.JSONObject
import java.util.UUID

enum class StudySection(
    val id: String,
    val title: String,
    val emoji: String,
    val greeting: String,
) {
    STUDY(
        "study",
        "Study",
        "✨",
        "Send notes and I'll make a summary, flashcards, and a mini quiz.",
    ),
    GENERAL("general", "General", "💬", "Ask anything. I'll keep the answer clear and friendly."),
    MATH("math", "Math", "±", "I'm focused on Math in this room."),
    HISTORY("history", "History", "🏛", "I'm focused on History in this room."),
    BIOLOGY("biology", "Biology", "🧬", "I'm focused on Biology in this room."),
    PHYSICS("physics", "Physics", "⚛", "I'm focused on Physics in this room."),
    ECONOMICS("economics", "Economics", "📈", "I'm focused on Economics in this room."),
    CHEMISTRY("chemistry", "Chemistry", "⚗", "I'm focused on Chemistry in this room."),
    LITERATURE("literature", "Literature", "📖", "I'm focused on Literature in this room."),
    GOVERNMENT("government", "Government", "⚖", "I'm focused on Government in this room.");

    val starterPrompts: List<String>
        get() = when (this) {
            STUDY -> listOf("Summarize my notes", "Make flashcards from this topic")
            GENERAL -> listOf("Why is the sky blue?", "Explain AI simply")
            MATH -> listOf("Solve 3x + 5 = 20", "Explain square roots")
            HISTORY -> listOf("What caused World War I?", "Make a quick timeline")
            BIOLOGY -> listOf("How does photosynthesis work?", "What does DNA do?")
            PHYSICS -> listOf("Explain Newton's laws", "What is velocity?")
            ECONOMICS -> listOf("What is inflation?", "Explain supply and demand")
            CHEMISTRY -> listOf("Explain ionic bonds", "What is the pH scale?")
            LITERATURE -> listOf("Help analyze a poem", "What is a literary theme?")
            GOVERNMENT -> listOf("Explain separation of powers", "What is democracy?")
        }

    companion object {
        fun fromId(id: String): StudySection = entries.firstOrNull { it.id == id } ?: STUDY
    }
}

enum class StudyTheme(val id: String, val label: String) {
    LIGHT("light", "Light"),
    PINK("pink", "Pink"),
    PURPLE("purple", "Purple"),
    BLUE("blue", "Blue"),
    RED("red", "Red"),
    DARK("dark", "Dark");

    companion object {
        fun fromId(id: String): StudyTheme = entries.firstOrNull { it.id == id } ?: PINK
    }
}

enum class Companion(
    val id: String,
    val displayName: String,
    val assetName: String,
    val encouragement: String,
) {
    GOJO("gojo", "Gojo", "companion_gojo", "No pressure. We'll make it click."),
    TANJIRO("tanjiro", "Tanjiro", "companion_tanjiro", "One calm step at a time."),
    PROFESSOR("professor", "Professor", "companion_professor", "Curiosity switched on!"),
    ELEVEN("eleven", "Eleven", "companion_eleven", "Hard question? We can handle it."),
    HARRY("harry", "Harry Potter", "companion_harry", "Let's work a little study magic.");

    companion object {
        fun fromId(id: String): Companion = entries.firstOrNull { it.id == id } ?: GOJO
    }
}

data class ChatMessage(
    val id: String = UUID.randomUUID().toString(),
    val role: String,
    val text: String,
    val hadImages: Boolean = false,
    val createdAt: String = java.time.Instant.now().toString(),
) {
    fun toJson(): JSONObject = JSONObject()
        .put("id", id)
        .put("role", role)
        .put("text", text)
        .put("hadImages", hadImages)
        .put("createdAt", createdAt)

    companion object {
        fun fromJson(json: JSONObject): ChatMessage = ChatMessage(
            id = json.optString("id").ifBlank { UUID.randomUUID().toString() },
            role = json.optString("role", "assistant"),
            text = json.optString("text"),
            hadImages = json.optBoolean("hadImages"),
            createdAt = json.optString("createdAt").ifBlank { java.time.Instant.now().toString() },
        )
    }
}

data class Flashcard(val front: String, val back: String) {
    fun toJson(): JSONObject = JSONObject().put("front", front).put("back", back)

    companion object {
        fun fromJson(json: JSONObject) = Flashcard(
            front = json.optString("front"),
            back = json.optString("back"),
        )
    }
}

data class StudyKit(
    val summary: String,
    val keyPoints: List<String>,
    val cards: List<Flashcard>,
    val questions: List<String>,
) {
    fun toJson(): JSONObject = JSONObject()
        .put("summary", summary)
        .put("keyPoints", JSONArray(keyPoints))
        .put("cards", JSONArray().apply { cards.forEach { put(it.toJson()) } })
        .put("questions", JSONArray(questions))

    companion object {
        fun fromJson(json: JSONObject): StudyKit = StudyKit(
            summary = json.optString("summary"),
            keyPoints = json.optJSONArray("keyPoints").stringList(),
            cards = json.optJSONArray("cards").objectList().map(Flashcard::fromJson),
            questions = json.optJSONArray("questions").stringList(),
        )
    }
}

data class StudyPopState(
    val theme: String = StudyTheme.PINK.id,
    val companion: String = Companion.GOJO.id,
    val chats: Map<String, List<ChatMessage>> = emptyMap(),
    val studyKit: StudyKit? = null,
    val streak: Int = 3,
) {
    val selectedTheme: StudyTheme get() = StudyTheme.fromId(theme)
    val selectedCompanion: Companion get() = Companion.fromId(companion)

    fun messages(section: StudySection): List<ChatMessage> = chats[section.id].orEmpty()

    fun toJson(): JSONObject = JSONObject()
        .put("theme", theme)
        .put("companion", companion)
        .put(
            "chats",
            JSONObject().apply {
                chats.forEach { (section, messages) ->
                    put(section, JSONArray().apply { messages.forEach { put(it.toJson()) } })
                }
            },
        )
        .put("studyKit", studyKit?.toJson() ?: JSONObject.NULL)
        .put("streak", streak)

    companion object {
        fun fromJson(json: JSONObject): StudyPopState {
            val chats = buildMap {
                val rawChats = json.optJSONObject("chats") ?: JSONObject()
                rawChats.keys().forEach { key ->
                    put(key, rawChats.optJSONArray(key).objectList().map(ChatMessage::fromJson))
                }
            }
            val rawKit = json.opt("studyKit")
            return StudyPopState(
                theme = json.optString("theme", StudyTheme.PINK.id),
                companion = json.optString("companion", Companion.GOJO.id),
                chats = chats,
                studyKit = if (rawKit is JSONObject) StudyKit.fromJson(rawKit) else null,
                streak = json.optInt("streak", 3),
            )
        }
    }
}

data class AuthUser(
    val id: String,
    val email: String,
    val name: String,
    val emailVerified: Boolean = false,
) {
    fun toJson(): JSONObject = JSONObject()
        .put("id", id)
        .put("email", email)
        .put("name", name)
        .put("emailVerified", emailVerified)

    companion object {
        fun fromJson(json: JSONObject): AuthUser = AuthUser(
            id = json.optString("id"),
            email = json.optString("email"),
            name = json.optString("name").ifBlank {
                json.optString("email").substringBefore("@").ifBlank { "Student" }
            },
            emailVerified = json.optBoolean("emailVerified"),
        )
    }
}

fun JSONArray?.stringList(): List<String> {
    if (this == null) return emptyList()
    return (0 until length()).map { optString(it) }
}

fun JSONArray?.objectList(): List<JSONObject> {
    if (this == null) return emptyList()
    return (0 until length()).mapNotNull { optJSONObject(it) }
}
