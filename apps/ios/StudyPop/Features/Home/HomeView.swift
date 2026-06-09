import PhotosUI
import SwiftUI
import UIKit

struct HomeView: View {
    @EnvironmentObject private var store: AppStore
    @StateObject private var torch = TorchController()
    @State private var draft = ""
    @State private var imageDataURLs: [String] = []
    @State private var photoItems: [PhotosPickerItem] = []
    @State private var showingCamera = false

    var body: some View {
        NavigationStack {
            ZStack {
                background
                    .ignoresSafeArea()

                ScrollView {
                    LazyVStack(spacing: 18) {
                        sectionPicker
                        companionHeader

                        if !store.messages().isEmpty {
                            conversation
                        }

                        if store.selectedSection == .study, let kit = store.state.studyKit {
                            StudyKitView(kit: kit)
                        } else if store.messages().isEmpty {
                            starterCard
                        }
                    }
                    .padding(.horizontal, 16)
                    .padding(.bottom, 150)
                }
                .scrollDismissesKeyboard(.interactively)
            }
            .navigationTitle(store.selectedSection.title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItemGroup(placement: .topBarTrailing) {
                    Button {
                        do {
                            try torch.toggle()
                        } catch {
                            store.errorMessage = error.localizedDescription
                        }
                    } label: {
                        Image(systemName: torch.isOn ? "flashlight.off.fill" : "flashlight.on.fill")
                    }
                    .accessibilityLabel("Toggle flashlight")

                    Button {
                        store.showingSettings = true
                    } label: {
                        if let user = store.user {
                            Text(String(user.name.prefix(1)).uppercased())
                                .font(.caption.bold())
                                .frame(width: 28, height: 28)
                                .background(store.accentColor.opacity(0.18))
                                .clipShape(Circle())
                        } else {
                            Image(systemName: "person.crop.circle.badge.plus")
                        }
                    }
                    .accessibilityLabel(store.user == nil ? "Sign up or log in" : "Account settings")
                }
            }
            .safeAreaInset(edge: .bottom) {
                ComposerView(
                    draft: $draft,
                    imageDataURLs: $imageDataURLs,
                    photoItems: $photoItems,
                    showingCamera: $showingCamera
                )
            }
            .sheet(isPresented: $showingCamera) {
                CameraPicker(
                    onImage: { image in
                        if let value = image.studyPopDataURL() {
                            imageDataURLs.append(value)
                        }
                        showingCamera = false
                    },
                    onCancel: { showingCamera = false }
                )
                .ignoresSafeArea()
            }
            .onDisappear {
                torch.turnOff()
            }
        }
    }

    private var background: some View {
        LinearGradient(
            colors: [
                store.accentColor.opacity(store.state.selectedTheme == .dark ? 0.18 : 0.12),
                Color(uiColor: .systemBackground),
            ],
            startPoint: .topLeading,
            endPoint: .bottomTrailing
        )
    }

    private var sectionPicker: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(StudySection.allCases) { section in
                    Button {
                        withAnimation(.snappy) {
                            store.selectedSection = section
                            draft = ""
                            imageDataURLs = []
                        }
                    } label: {
                        Label(section.title, systemImage: section.symbol)
                            .font(.caption.bold())
                            .padding(.horizontal, 12)
                            .padding(.vertical, 9)
                            .background(
                                store.selectedSection == section
                                    ? store.accentColor
                                    : Color(uiColor: .secondarySystemBackground)
                            )
                            .foregroundStyle(store.selectedSection == section ? .white : .primary)
                            .clipShape(Capsule())
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.vertical, 2)
        }
    }

    private var companionHeader: some View {
        HStack(spacing: 14) {
            CompanionImage(companion: store.companion, size: 76)
            VStack(alignment: .leading, spacing: 5) {
                Text(store.companion.name)
                    .font(.caption.bold())
                    .foregroundStyle(store.accentColor)
                Text(store.companion.encouragement)
                    .font(.title3.bold())
                Text(greeting)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }
            Spacer(minLength: 0)
        }
        .popCard()
    }

    private var greeting: String {
        switch store.selectedSection {
        case .study:
            "Send notes and I'll make a summary, flashcards, and a mini quiz."
        case .general:
            "Ask anything. I'll keep the answer clear and friendly."
        default:
            "I'm focused on \(store.selectedSection.title) in this room."
        }
    }

    private var conversation: some View {
        VStack(spacing: 12) {
            HStack {
                Label("Our chat", systemImage: "bubble.left.and.bubble.right")
                    .font(.headline)
                Spacer()
                Button("Clear", systemImage: "trash", role: .destructive) {
                    store.clearConversation()
                }
                .font(.caption.bold())
            }

            ForEach(store.messages()) { message in
                MessageBubble(message: message)
            }

            if store.isSending {
                HStack(spacing: 10) {
                    CompanionImage(companion: store.companion, size: 34)
                    ProgressView()
                    Text("\(store.companion.name) is thinking...")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                    Spacer()
                }
            }
        }
        .popCard()
    }

    private var starterCard: some View {
        VStack(alignment: .leading, spacing: 12) {
            Label("Try a tiny first question", systemImage: "sparkles")
                .font(.headline)
            ForEach(starterPrompts, id: \.self) { prompt in
                Button(prompt) {
                    draft = prompt
                }
                .buttonStyle(.bordered)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .popCard()
    }

    private var starterPrompts: [String] {
        switch store.selectedSection {
        case .study:
            ["Summarize my notes", "Make flashcards from this topic"]
        case .general:
            ["Why is the sky blue?", "Explain AI simply"]
        case .math:
            ["Solve 3x + 5 = 20", "Explain square roots"]
        case .history:
            ["What caused World War I?", "Make a quick timeline"]
        case .biology:
            ["How does photosynthesis work?", "What does DNA do?"]
        case .physics:
            ["Explain Newton's laws", "What is velocity?"]
        case .economics:
            ["What is inflation?", "Explain supply and demand"]
        case .chemistry:
            ["Explain ionic bonds", "What is the pH scale?"]
        case .literature:
            ["Help analyze a poem", "What is a literary theme?"]
        case .government:
            ["Explain separation of powers", "What is democracy?"]
        }
    }
}

private struct MessageBubble: View {
    @EnvironmentObject private var store: AppStore
    let message: ChatMessage

    var body: some View {
        HStack(alignment: .top, spacing: 9) {
            if message.role == .assistant {
                CompanionImage(companion: store.companion, size: 34)
            } else {
                Spacer(minLength: 42)
            }

            VStack(alignment: .leading, spacing: 4) {
                Text(message.role == .assistant ? store.companion.name : "You")
                    .font(.caption2.bold())
                    .foregroundStyle(.secondary)
                Text(markdown: message.text)
                    .textSelection(.enabled)
            }
            .padding(12)
            .background(
                message.role == .assistant
                    ? Color(uiColor: .secondarySystemBackground)
                    : store.accentColor.opacity(0.18)
            )
            .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))

            if message.role == .assistant {
                Spacer(minLength: 22)
            }
        }
    }
}

private extension Text {
    init(markdown: String) {
        let attributed = (try? AttributedString(
            markdown: markdown,
            options: .init(interpretedSyntax: .inlineOnlyPreservingWhitespace)
        )) ?? AttributedString(markdown)
        self.init(attributed)
    }
}

