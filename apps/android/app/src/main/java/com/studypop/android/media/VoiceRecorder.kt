package com.studypop.android.media

import android.content.Context
import android.media.MediaRecorder
import android.os.Build
import java.io.File

class VoiceRecorder(private val context: Context) {
    private var recorder: MediaRecorder? = null
    private var outputFile: File? = null

    val isRecording: Boolean get() = recorder != null

    @Suppress("DEPRECATION")
    fun start() {
        if (recorder != null) return
        val file = File.createTempFile("studypop-voice-", ".m4a", context.cacheDir)
        val next = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            MediaRecorder(context)
        } else {
            MediaRecorder()
        }
        next.setAudioSource(MediaRecorder.AudioSource.MIC)
        next.setOutputFormat(MediaRecorder.OutputFormat.MPEG_4)
        next.setAudioEncoder(MediaRecorder.AudioEncoder.AAC)
        next.setAudioEncodingBitRate(96_000)
        next.setAudioSamplingRate(44_100)
        next.setOutputFile(file.absolutePath)
        next.prepare()
        next.start()
        recorder = next
        outputFile = file
    }

    fun stop(): ByteArray {
        val current = recorder ?: throw IllegalStateException("No recording is active.")
        val file = outputFile ?: throw IllegalStateException("The recording file is missing.")
        recorder = null
        outputFile = null
        return try {
            current.stop()
            current.release()
            file.readBytes()
        } finally {
            file.delete()
        }
    }

    fun cancel() {
        runCatching { recorder?.stop() }
        recorder?.release()
        recorder = null
        outputFile?.delete()
        outputFile = null
    }
}
