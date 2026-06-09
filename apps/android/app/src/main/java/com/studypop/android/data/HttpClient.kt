package com.studypop.android.data

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

class StudyPopException(
    override val message: String,
    val statusCode: Int = 500,
    val code: String = "REQUEST_FAILED",
) : Exception(message)

object HttpClient {
    suspend fun request(
        url: String,
        method: String = "GET",
        body: String? = null,
        bearerToken: String? = null,
        contentType: String = "application/json",
    ): JSONObject = withContext(Dispatchers.IO) {
        val connection = URL(url).openConnection() as HttpURLConnection
        try {
            connection.requestMethod = method
            connection.connectTimeout = 20_000
            connection.readTimeout = 120_000
            connection.setRequestProperty("Accept", "application/json")
            if (!bearerToken.isNullOrBlank()) {
                connection.setRequestProperty("Authorization", "Bearer $bearerToken")
            }
            if (body != null) {
                connection.doOutput = true
                connection.setRequestProperty("Content-Type", contentType)
                connection.outputStream.use { it.write(body.toByteArray(Charsets.UTF_8)) }
            }

            val status = connection.responseCode
            val stream = if (status in 200..299) connection.inputStream else connection.errorStream
            val text = stream?.bufferedReader()?.use { it.readText() }.orEmpty()
            val payload = if (text.isBlank()) JSONObject() else runCatching {
                JSONObject(text)
            }.getOrElse { JSONObject().put("raw", text) }

            if (status !in 200..299) {
                val error = payload.opt("error")
                val details = error as? JSONObject
                val message = details?.optString("message")
                    ?.takeIf { it.isNotBlank() }
                    ?: (error as? String)
                    ?: "StudyPop could not complete that request."
                throw StudyPopException(
                    message = message,
                    statusCode = status,
                    code = details?.optString("code")
                        ?.takeIf { it.isNotBlank() }
                        ?: "API_REQUEST_FAILED",
                )
            }
            payload
        } finally {
            connection.disconnect()
        }
    }
}
