package com.studypop.android

import android.app.Application
import android.content.Context
import android.util.Base64
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.studypop.android.data.FirebaseAuthService
import com.studypop.android.data.StudyPopApi
import com.studypop.android.model.AuthUser
import com.studypop.android.model.ChatMessage
import com.studypop.android.model.Companion
import com.studypop.android.model.StudyPopState
import com.studypop.android.model.StudySection
import com.studypop.android.model.StudyTheme
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

class AppViewModel(application: Application) : AndroidViewModel(application) {
    enum class Phase { LOADING, READY }

    private val auth = FirebaseAuthService(application)
    private val api = StudyPopApi(auth)
    private val preferences = application.getSharedPreferences(
        "studypop.local",
        Context.MODE_PRIVATE,
    )
    private var saveJob: Job? = null

    var phase by mutableStateOf(Phase.LOADING)
        private set
    var user by mutableStateOf<AuthUser?>(null)
        private set
    var state by mutableStateOf(loadLocalState())
        private set
    var selectedSection by mutableStateOf(StudySection.STUDY)
    var isSending by mutableStateOf(false)
        private set
    var syncMessage by mutableStateOf("Saved on this device")
        private set
    var errorMessage by mutableStateOf("")
    var showAuth by mutableStateOf(false)
    var showSettings by mutableStateOf(false)
    var companionActionIndex by mutableIntStateOf(0)
        private set

    val companion: Companion get() = state.selectedCompanion
    val theme: StudyTheme get() = state.selectedTheme
    val messages: List<ChatMessage> get() = state.messages(selectedSection)
    val companionActions = listOf(
        "is cheering you on",
        "is ready for your next question",
        "is organizing your notes",
        "is thinking of a simpler explanation",
        "says you've got this",
    )

    init {
        viewModelScope.launch { bootstrap() }
        viewModelScope.launch {
            while (true) {
                delay(3_500)
                companionActionIndex = (companionActionIndex + 1) % companionActions.size
            }
        }
    }

    suspend fun signUp(name: String, email: String, password: String) {
        user = auth.signUp(name.trim(), email.trim(), password)
        api.resetVersion()
        api.saveState(state)
        syncMessage = "Account created and synced"
        showAuth = false
    }

    suspend fun signIn(email: String, password: String) {
        user = auth.signIn(email.trim(), password)
        api.resetVersion()
        val cloud = api.loadState()
        if (cloud != null) setState(cloud, sync = false) else api.saveState(state)
        syncMessage = "Synced across your devices"
        showAuth = false
    }

    suspend fun sendPasswordReset(email: String) {
        auth.sendPasswordReset(email.trim())
    }

    fun signOut() {
        auth.signOut()
        api.resetVersion()
        user = null
        syncMessage = "Saved on this device"
        showSettings = false
    }

    suspend fun deleteAccount() {
        api.deleteState()
        auth.deleteAccount()
        user = null
        state = StudyPopState()
        preferences.edit().remove(LOCAL_STATE_KEY).apply()
        syncMessage = "Saved on this device"
        showSettings = false
    }

    fun selectTheme(theme: StudyTheme) {
        setState(state.copy(theme = theme.id))
    }

    fun selectCompanion(companion: Companion) {
        companionActionIndex = 0
        setState(state.copy(companion = companion.id))
    }

    fun selectSection(section: StudySection) {
        selectedSection = section
    }

    fun clearConversation() {
        setState(state.copy(chats = state.chats + (selectedSection.id to emptyList())))
    }

    fun resetStudyKit() {
        setState(state.copy(studyKit = null))
    }

    fun submit(question: String, images: List<String>) {
        val trimmed = question.trim()
        if ((trimmed.isBlank() && images.isEmpty()) || isSending) return
        val userText = trimmed.ifBlank { "Please look at this picture." }
        append(
            ChatMessage(role = "user", text = userText, hadImages = images.isNotEmpty()),
            selectedSection,
        )
        val targetSection = selectedSection
        val targetHistory = state.messages(targetSection)
        isSending = true

        viewModelScope.launch {
            try {
                if (targetSection == StudySection.STUDY && state.studyKit == null) {
                    val kit = api.createStudyKit(trimmed, images)
                    state = state.copy(studyKit = kit)
                    append(
                        ChatMessage(
                            role = "assistant",
                            text = "Done! I made ${kit.cards.size} flashcards and a mini quiz.",
                        ),
                        StudySection.STUDY,
                    )
                } else {
                    val answer = api.answer(
                        section = targetSection,
                        question = trimmed,
                        images = images,
                        history = targetHistory,
                        companion = companion,
                        studyKit = if (targetSection == StudySection.STUDY) {
                            state.studyKit
                        } else {
                            null
                        },
                    )
                    append(ChatMessage(role = "assistant", text = answer), targetSection)
                }
            } catch (error: Exception) {
                append(
                    ChatMessage(
                        role = "assistant",
                        text = "${error.message ?: "That did not work."} Try once more when you're ready.",
                    ),
                    targetSection,
                )
            } finally {
                isSending = false
            }
        }
    }

    suspend fun transcribe(audio: ByteArray, mimeType: String): String {
        val encoded = Base64.encodeToString(audio, Base64.NO_WRAP)
        return api.transcribe("data:$mimeType;base64,$encoded", mimeType)
    }

    private suspend fun bootstrap() {
        try {
            user = api.bootstrap()
            if (user != null) {
                api.loadState()?.let { setState(it, sync = false) }
                syncMessage = "Synced across your devices"
            }
        } catch (error: Exception) {
            errorMessage = error.message ?: "StudyPop could not finish opening."
        } finally {
            phase = Phase.READY
        }
    }

    private fun append(message: ChatMessage, section: StudySection) {
        val nextMessages = state.messages(section) + message
        setState(state.copy(chats = state.chats + (section.id to nextMessages)))
    }

    private fun setState(next: StudyPopState, sync: Boolean = true) {
        state = next
        saveLocalState()
        if (!sync) return
        if (user == null) {
            syncMessage = "Saved on this device"
            return
        }
        syncMessage = "Syncing..."
        saveJob?.cancel()
        val snapshot = state
        saveJob = viewModelScope.launch {
            delay(500)
            runCatching { api.saveState(snapshot) }
                .onSuccess { syncMessage = "Synced across your devices" }
                .onFailure { syncMessage = "Sync will retry" }
        }
    }

    private fun saveLocalState() {
        preferences.edit().putString(LOCAL_STATE_KEY, state.toJson().toString()).apply()
    }

    private fun loadLocalState(): StudyPopState = runCatching {
        val raw = preferences.getString(LOCAL_STATE_KEY, null) ?: return StudyPopState()
        StudyPopState.fromJson(org.json.JSONObject(raw))
    }.getOrDefault(StudyPopState())

    private companion object {
        const val LOCAL_STATE_KEY = "studypop.state.v1"
    }
}
