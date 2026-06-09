import SwiftUI

struct SettingsView: View {
    @EnvironmentObject private var store: AppStore
    @Environment(\.dismiss) private var dismiss
    @State private var confirmingDeletion = false
    @State private var isDeleting = false

    var body: some View {
        NavigationStack {
            Form {
                Section("Theme") {
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack {
                            ForEach(StudyTheme.allCases) { theme in
                                Button {
                                    store.selectTheme(theme)
                                } label: {
                                    VStack(spacing: 6) {
                                        Circle()
                                            .fill(theme.color)
                                            .frame(width: 34, height: 34)
                                            .overlay {
                                                if store.state.selectedTheme == theme {
                                                    Image(systemName: "checkmark")
                                                        .foregroundStyle(.white)
                                                }
                                            }
                                        Text(theme.rawValue.capitalized)
                                            .font(.caption2)
                                    }
                                }
                                .buttonStyle(.plain)
                            }
                        }
                    }
                }

                Section("Companion") {
                    ForEach(Companion.allCases) { companion in
                        Button {
                            store.selectCompanion(companion)
                        } label: {
                            HStack {
                                CompanionImage(companion: companion, size: 44)
                                Text(companion.name)
                                Spacer()
                                if store.companion == companion {
                                    Image(systemName: "checkmark.circle.fill")
                                }
                            }
                        }
                        .buttonStyle(.plain)
                    }
                }

                Section("Account") {
                    if let user = store.user {
                        LabeledContent("Name", value: user.name)
                        LabeledContent("Email", value: user.email)
                        Button("Log out", role: .destructive) {
                            Task {
                                await store.signOut()
                                dismiss()
                            }
                        }
                        Button("Delete account and synced data", role: .destructive) {
                            confirmingDeletion = true
                        }
                        .disabled(isDeleting)
                    } else {
                        Button("Sign up or log in") {
                            dismiss()
                            store.showingAuth = true
                        }
                    }
                }

                Section {
                    Text(store.syncMessage)
                        .foregroundStyle(.secondary)
                } header: {
                    Text("Synchronization")
                }
            }
            .navigationTitle("Your StudyPop")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") { dismiss() }
                }
            }
            .confirmationDialog(
                "Delete your StudyPop account?",
                isPresented: $confirmingDeletion,
                titleVisibility: .visible
            ) {
                Button("Delete account", role: .destructive) {
                    Task {
                        isDeleting = true
                        defer { isDeleting = false }
                        do {
                            try await store.deleteAccount()
                            dismiss()
                        } catch {
                            store.errorMessage = error.localizedDescription
                        }
                    }
                }
                Button("Cancel", role: .cancel) {}
            } message: {
                Text("Your account and synchronized study data will be permanently deleted.")
            }
        }
    }
}
