import PhotosUI
import SwiftUI
import UIKit

struct ComposerView: View {
    @EnvironmentObject private var store: AppStore
    @StateObject private var recorder = VoiceRecorder()
    @Binding var draft: String
    @Binding var imageDataURLs: [String]
    @Binding var photoItems: [PhotosPickerItem]
    @Binding var showingCamera: Bool
    @State private var isTranscribing = false

    var body: some View {
        VStack(spacing: 10) {
            if !imageDataURLs.isEmpty {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack {
                        ForEach(Array(imageDataURLs.enumerated()), id: \.offset) { index, dataURL in
                            ZStack(alignment: .topTrailing) {
                                if let image = image(from: dataURL) {
                                    Image(uiImage: image)
                                        .resizable()
                                        .scaledToFill()
                                        .frame(width: 72, height: 58)
                                        .clipShape(RoundedRectangle(cornerRadius: 10))
                                }
                                Button {
                                    imageDataURLs.remove(at: index)
                                } label: {
                                    Image(systemName: "xmark.circle.fill")
                                        .symbolRenderingMode(.palette)
                                        .foregroundStyle(.white, .black.opacity(0.65))
                                }
                                .offset(x: 5, y: -5)
                            }
                        }
                    }
                }
            }

            if recorder.isRecording || isTranscribing {
                HStack {
                    Image(systemName: recorder.isRecording ? "waveform" : "text.bubble")
                        .symbolEffect(.pulse, isActive: recorder.isRecording)
                    Text(
                        recorder.isRecording
                            ? "Recording \(formatted(recorder.elapsedSeconds))"
                            : "Turning your voice into text..."
                    )
                    .font(.footnote.bold())
                    Spacer()
                }
                .foregroundStyle(recorder.isRecording ? .red : store.accentColor)
            }

            TextField(placeholder, text: $draft, axis: .vertical)
                .lineLimit(1...5)
                .textFieldStyle(.roundedBorder)

            HStack(spacing: 6) {
                PhotosPicker(
                    selection: $photoItems,
                    maxSelectionCount: 5,
                    matching: .images
                ) {
                    Label("Image", systemImage: "photo.badge.plus")
                }
                .onChange(of: photoItems) {
                    Task { await loadPhotos() }
                }

                Button {
                    guard UIImagePickerController.isSourceTypeAvailable(.camera) else {
                        store.errorMessage = "A camera is not available on this device."
                        return
                    }
                    showingCamera = true
                } label: {
                    Label("Snap", systemImage: "camera")
                }

                Button {
                    Task { await toggleRecording() }
                } label: {
                    Label(
                        recorder.isRecording ? "Stop" : "Voice",
                        systemImage: recorder.isRecording ? "stop.fill" : "mic"
                    )
                }
                .foregroundStyle(recorder.isRecording ? .red : .primary)
                .disabled(isTranscribing)

                Spacer()

                Button {
                    let question = draft
                    let images = imageDataURLs
                    draft = ""
                    imageDataURLs = []
                    photoItems = []
                    Task { await store.submit(question: question, images: images) }
                } label: {
                    Image(systemName: "arrow.up")
                        .font(.headline.bold())
                        .frame(width: 38, height: 38)
                        .foregroundStyle(.white)
                        .background(store.accentColor)
                        .clipShape(Circle())
                }
                .disabled(
                    store.isSending
                        || (draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                            && imageDataURLs.isEmpty)
                )
            }
            .font(.caption.bold())

            HStack {
                Image(systemName: store.user == nil ? "iphone" : "icloud")
                Text(store.syncMessage)
                Spacer()
                if store.user == nil {
                    Button("Sign up to sync") {
                        store.showingAuth = true
                    }
                }
            }
            .font(.caption2)
            .foregroundStyle(.secondary)
        }
        .padding(12)
        .background(.ultraThinMaterial)
        .overlay(alignment: .top) { Divider() }
    }

    private var placeholder: String {
        if store.selectedSection == .study {
            return store.state.studyKit == nil
                ? "Paste notes, type a topic, or add a photo..."
                : "Ask a follow-up about your notes..."
        }
        return "Ask a \(store.selectedSection.title.lowercased()) question..."
    }

    private func loadPhotos() async {
        var loaded: [String] = []
        for item in photoItems.prefix(5) {
            guard
                let data = try? await item.loadTransferable(type: Data.self),
                let image = UIImage(data: data),
                let dataURL = image.studyPopDataURL()
            else { continue }
            loaded.append(dataURL)
        }
        imageDataURLs = loaded
    }

    private func toggleRecording() async {
        do {
            if recorder.isRecording {
                let data = try recorder.stop()
                isTranscribing = true
                defer { isTranscribing = false }
                let text = try await store.transcribe(data: data, mimeType: "audio/mp4")
                draft = [draft, text]
                    .filter { !$0.trimmingCharacters(in: .whitespaces).isEmpty }
                    .joined(separator: " ")
            } else {
                try await recorder.start()
            }
        } catch {
            store.errorMessage = error.localizedDescription
            recorder.cancel()
        }
    }

    private func image(from dataURL: String) -> UIImage? {
        guard
            let comma = dataURL.firstIndex(of: ","),
            let data = Data(base64Encoded: String(dataURL[dataURL.index(after: comma)...]))
        else { return nil }
        return UIImage(data: data)
    }

    private func formatted(_ seconds: Int) -> String {
        String(format: "%02d:%02d", seconds / 60, seconds % 60)
    }
}

