package com.studypop.android.media

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import android.util.Base64
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.ByteArrayOutputStream
import java.io.File

data class ImageAttachment(
    val dataUrl: String,
    val preview: ImageBitmap,
)

object ImageUtils {
    suspend fun fromUri(context: Context, uri: Uri): ImageAttachment? = withContext(Dispatchers.IO) {
        val bytes = context.contentResolver.openInputStream(uri)?.use { it.readBytes() }
            ?: return@withContext null
        fromBytes(bytes)
    }

    suspend fun fromFile(file: File): ImageAttachment? = withContext(Dispatchers.IO) {
        runCatching { fromBytes(file.readBytes()) }.getOrNull()
    }

    private fun fromBytes(bytes: ByteArray): ImageAttachment? {
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeByteArray(bytes, 0, bytes.size, bounds)
        if (bounds.outWidth <= 0 || bounds.outHeight <= 0) return null

        var sample = 1
        while (bounds.outWidth / sample > 1600 || bounds.outHeight / sample > 1600) {
            sample *= 2
        }
        val bitmap = BitmapFactory.decodeByteArray(
            bytes,
            0,
            bytes.size,
            BitmapFactory.Options().apply { inSampleSize = sample },
        ) ?: return null

        val output = ByteArrayOutputStream()
        bitmap.compress(Bitmap.CompressFormat.JPEG, 84, output)
        val compressed = output.toByteArray()
        return ImageAttachment(
            dataUrl = "data:image/jpeg;base64," +
                Base64.encodeToString(compressed, Base64.NO_WRAP),
            preview = bitmap.asImageBitmap(),
        )
    }
}
