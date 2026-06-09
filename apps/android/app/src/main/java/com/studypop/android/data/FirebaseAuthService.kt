package com.studypop.android.data

import android.content.Context
import com.studypop.android.model.AuthUser
import kotlinx.coroutines.sync.Mutex
import org.json.JSONObject
import java.net.URLEncoder
import java.nio.charset.StandardCharsets

class FirebaseAuthService(context: Context) {
    private data class Session(
        val idToken: String,
        val refreshToken: String,
        val expiresAt: Long,
        val user: AuthUser,
    ) {
        fun toJson(): JSONObject = JSONObject()
            .put("idToken", idToken)
            .put("refreshToken", refreshToken)
            .put("expiresAt", expiresAt)
            .put("user", user.toJson())

        companion object {
            fun fromJson(json: JSONObject) = Session(
                idToken = json.optString("idToken"),
                refreshToken = json.optString("refreshToken"),
                expiresAt = json.optLong("expiresAt"),
                user = AuthUser.fromJson(json.getJSONObject("user")),
            )
        }
    }

    private val store = SecureSessionStore(context)
    private val mutex = Mutex()
    private var apiKey = ""
    private var session = store.load()?.let {
        runCatching { Session.fromJson(JSONObject(it)) }.getOrNull()
    }

    val currentUser: AuthUser? get() = session?.user

    fun configure(apiKey: String) {
        this.apiKey = apiKey
    }

    suspend fun restoreUser(): AuthUser? {
        val existing = session ?: return null
        return runCatching {
            val token = idToken()
            val payload = firebaseRequest("accounts:lookup", JSONObject().put("idToken", token))
            val record = payload.optJSONArray("users")?.optJSONObject(0)
            if (record != null) {
                val updated = userFromRecord(record)
                save(existing.copy(user = updated))
                updated
            } else {
                existing.user
            }
        }.getOrElse {
            if (it is StudyPopException && it.statusCode in listOf(400, 401)) signOut()
            null
        }
    }

    suspend fun signUp(name: String, email: String, password: String): AuthUser {
        val created = firebaseRequest(
            "accounts:signUp",
            JSONObject()
                .put("email", email)
                .put("password", password)
                .put("returnSecureToken", true),
        )
        val updated = firebaseRequest(
            "accounts:update",
            JSONObject()
                .put("idToken", created.getString("idToken"))
                .put("displayName", name)
                .put("returnSecureToken", true),
        )
        return persist(updated, created.optString("refreshToken"))
    }

    suspend fun signIn(email: String, password: String): AuthUser {
        val payload = firebaseRequest(
            "accounts:signInWithPassword",
            JSONObject()
                .put("email", email)
                .put("password", password)
                .put("returnSecureToken", true),
        )
        return persist(payload)
    }

    suspend fun sendPasswordReset(email: String) {
        firebaseRequest(
            "accounts:sendOobCode",
            JSONObject()
                .put("requestType", "PASSWORD_RESET")
                .put("email", email),
        )
    }

    suspend fun deleteAccount() {
        firebaseRequest(
            "accounts:delete",
            JSONObject().put("idToken", idToken()),
        )
        signOut()
    }

    fun signOut() {
        session = null
        store.clear()
    }

    suspend fun idToken(forceRefresh: Boolean = false): String {
        mutex.lock()
        try {
            val existing = session ?: throw StudyPopException(
                "Log in to continue.",
                statusCode = 401,
                code = "AUTH_REQUIRED",
            )
            if (forceRefresh || existing.expiresAt <= System.currentTimeMillis() + 60_000) {
                refresh(existing)
            }
            return session?.idToken ?: throw StudyPopException(
                "Your session expired. Please log in again.",
                statusCode = 401,
                code = "AUTH_REQUIRED",
            )
        } finally {
            mutex.unlock()
        }
    }

    private suspend fun refresh(existing: Session) {
        requireConfigured()
        val body = "grant_type=refresh_token&refresh_token=" + URLEncoder.encode(
            existing.refreshToken,
            StandardCharsets.UTF_8.toString(),
        )
        val payload = HttpClient.request(
            url = "https://securetoken.googleapis.com/v1/token?key=${encode(apiKey)}",
            method = "POST",
            body = body,
            contentType = "application/x-www-form-urlencoded",
        )
        save(
            existing.copy(
                idToken = payload.getString("id_token"),
                refreshToken = payload.optString("refresh_token", existing.refreshToken),
                expiresAt = System.currentTimeMillis() +
                    payload.optLong("expires_in", 3600) * 1000,
            ),
        )
    }

    private suspend fun firebaseRequest(path: String, body: JSONObject): JSONObject {
        requireConfigured()
        return try {
            HttpClient.request(
                url = "https://identitytoolkit.googleapis.com/v1/$path?key=${encode(apiKey)}",
                method = "POST",
                body = body.toString(),
            )
        } catch (error: StudyPopException) {
            val rawCode = error.message.substringBefore(" : ")
            val friendly = mapOf(
                "EMAIL_EXISTS" to "An account with that email already exists.",
                "INVALID_LOGIN_CREDENTIALS" to "Email or password is incorrect.",
                "EMAIL_NOT_FOUND" to "Email or password is incorrect.",
                "INVALID_PASSWORD" to "Email or password is incorrect.",
                "INVALID_EMAIL" to "Enter a valid email address.",
                "WEAK_PASSWORD" to "Use a stronger password with at least 8 characters.",
                "TOO_MANY_ATTEMPTS_TRY_LATER" to "Too many attempts. Try again shortly.",
                "USER_DISABLED" to "This account has been disabled.",
            )
            throw StudyPopException(
                message = friendly[rawCode] ?: error.message,
                statusCode = error.statusCode,
                code = rawCode,
            )
        }
    }

    private fun persist(payload: JSONObject, fallbackRefreshToken: String = ""): AuthUser {
        val user = userFromRecord(payload)
        val next = Session(
            idToken = payload.getString("idToken"),
            refreshToken = payload.optString("refreshToken").ifBlank { fallbackRefreshToken },
            expiresAt = System.currentTimeMillis() +
                payload.optLong("expiresIn", 3600) * 1000,
            user = user,
        )
        save(next)
        return user
    }

    private fun userFromRecord(record: JSONObject): AuthUser {
        val email = record.optString("email")
        return AuthUser(
            id = record.optString("localId"),
            email = email,
            name = record.optString("displayName").ifBlank {
                email.substringBefore("@").ifBlank { "Student" }
            },
            emailVerified = record.optBoolean("emailVerified"),
        )
    }

    private fun save(next: Session) {
        session = next
        store.save(next.toJson().toString())
    }

    private fun requireConfigured() {
        if (apiKey.isBlank()) {
            throw StudyPopException(
                "StudyPop accounts are temporarily unavailable.",
                statusCode = 503,
                code = "FIREBASE_NOT_CONFIGURED",
            )
        }
    }

    private fun encode(value: String): String = URLEncoder.encode(
        value,
        StandardCharsets.UTF_8.toString(),
    )
}
