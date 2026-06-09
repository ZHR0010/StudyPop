package com.studypop.android.data

import com.studypop.android.BuildConfig
import com.studypop.android.model.ChatMessage
import com.studypop.android.model.StudyKit
import com.studypop.android.model.StudyPopState
import com.studypop.android.model.StudyCompanion
import com.studypop.android.model.StudySection
import org.json.JSONArray
import org.json.JSONObject

class StudyPopApi(private val auth: FirebaseAuthService) {
    private val baseUrl = BuildConfig.STUDYPOP_API_BASE_URL.trimEnd('/')
    private var stateVersion = 0

    suspend fun bootstrap() = run {
        val config = request("/api/v1/config")
        val firebase = config.optJSONObject("firebase")
        val publicConfig = firebase?.optJSONObject("config")
        if (firebase?.optBoolean("configured") != true || publicConfig == null) {
            throw StudyPopException(
                "StudyPop accounts are temporarily unavailable.",
                statusCode = 503,
                code = "FIREBASE_NOT_CONFIGURED",
            )
        }
        auth.configure(publicConfig.getString("apiKey"))
        auth.restoreUser()
    }

    suspend fun loadState(): StudyPopState? {
        val response = request("/api/v1/state", authenticated = true)
        stateVersion = response.optInt("version")
        return response.optJSONObject("state")?.let(StudyPopState::fromJson)
    }

    suspend fun saveState(state: StudyPopState) {
        val response = request(
            path = "/api/v1/state",
            method = "PUT",
            body = JSONObject()
                .put("state", state.toJson())
                .put("version", stateVersion),
            authenticated = true,
        )
        stateVersion = response.optInt("version", stateVersion + 1)
    }

    suspend fun deleteState() {
        request("/api/v1/state", method = "DELETE", authenticated = true)
        stateVersion = 0
    }

    suspend fun answer(
        section: StudySection,
        question: String,
        images: List<String>,
        history: List<ChatMessage>,
        companion: StudyCompanion,
        studyKit: StudyKit?,
    ): String {
        val body = JSONObject()
            .put("section", section.id)
            .put("question", question)
            .put("images", JSONArray(images))
            .put(
                "history",
                JSONArray().apply {
                    history.takeLast(8).forEach {
                        put(JSONObject().put("role", it.role).put("text", it.text))
                    }
                },
            )
            .put("companion", companion.displayName)
            .put("studyContext", studyKit?.toJson() ?: JSONObject.NULL)
        return request(
            path = "/api/v1/ai/answer",
            method = "POST",
            body = body,
            authenticated = auth.currentUser != null,
        ).getString("answer")
    }

    suspend fun createStudyKit(note: String, images: List<String>): StudyKit {
        val body = JSONObject()
            .put("note", note)
            .put("images", JSONArray(images))
        val response = request(
            path = "/api/v1/ai/study-kit",
            method = "POST",
            body = body,
            authenticated = auth.currentUser != null,
        )
        return StudyKit.fromJson(response.getJSONObject("kit"))
    }

    suspend fun transcribe(audioDataUrl: String, mimeType: String): String {
        val response = request(
            path = "/api/v1/ai/transcribe",
            method = "POST",
            body = JSONObject()
                .put("audio", audioDataUrl)
                .put("mimeType", mimeType),
            authenticated = auth.currentUser != null,
        )
        return response.getString("text")
    }

    fun resetVersion() {
        stateVersion = 0
    }

    private suspend fun request(
        path: String,
        method: String = "GET",
        body: JSONObject? = null,
        authenticated: Boolean = false,
    ): JSONObject {
        val execute: suspend (Boolean) -> JSONObject = { forceRefresh ->
            val token = if (authenticated) auth.idToken(forceRefresh) else null
            HttpClient.request(
                url = "$baseUrl$path",
                method = method,
                body = body?.toString(),
                bearerToken = token,
            )
        }
        return try {
            execute(false)
        } catch (error: StudyPopException) {
            if (authenticated && error.statusCode == 401) execute(true) else throw error
        }
    }
}
