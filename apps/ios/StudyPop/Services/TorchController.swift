import AVFoundation
import Combine
import Foundation

@MainActor
final class TorchController: ObservableObject {
    @Published var isOn = false

    func toggle() throws {
        guard
            let device = AVCaptureDevice.default(for: .video),
            device.hasTorch,
            device.isTorchAvailable,
            device.isTorchModeSupported(.on),
            device.isTorchModeSupported(.off)
        else {
            throw APIError(
                message: "This device does not have an available flashlight.",
                statusCode: 400,
                code: "TORCH_UNAVAILABLE"
            )
        }
        try device.lockForConfiguration()
        defer { device.unlockForConfiguration() }
        if device.torchMode == .on {
            device.torchMode = .off
            isOn = false
        } else {
            try device.setTorchModeOn(level: 0.8)
            isOn = true
        }
    }

    func turnOff() {
        guard let device = AVCaptureDevice.default(for: .video), device.hasTorch else {
            return
        }
        do {
            try device.lockForConfiguration()
            defer { device.unlockForConfiguration() }
            if device.isTorchModeSupported(.off) {
                device.torchMode = .off
            }
        } catch {
            return
        }
        isOn = false
    }
}
