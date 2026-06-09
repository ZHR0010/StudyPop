package com.studypop.android.media

import android.content.Context
import android.hardware.camera2.CameraCharacteristics
import android.hardware.camera2.CameraManager

class TorchController(context: Context) {
    private val manager = context.getSystemService(CameraManager::class.java)
    private val cameraId = manager.cameraIdList.firstOrNull { id ->
        val details = manager.getCameraCharacteristics(id)
        details.get(CameraCharacteristics.LENS_FACING) == CameraCharacteristics.LENS_FACING_BACK &&
            details.get(CameraCharacteristics.FLASH_INFO_AVAILABLE) == true
    }

    var isOn: Boolean = false
        private set

    val isAvailable: Boolean get() = cameraId != null

    fun toggle(): Boolean {
        val id = cameraId ?: throw IllegalStateException(
            "A flashlight is not available on this device.",
        )
        isOn = !isOn
        manager.setTorchMode(id, isOn)
        return isOn
    }

    fun turnOff() {
        if (!isOn) return
        cameraId?.let { runCatching { manager.setTorchMode(it, false) } }
        isOn = false
    }
}
