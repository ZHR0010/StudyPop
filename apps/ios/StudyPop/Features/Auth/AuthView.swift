import SwiftUI

struct AuthView: View {
    enum Mode: String, CaseIterable {
        case signUp = "Sign up"
        case logIn = "Log in"
    }

    @EnvironmentObject private var store: AppStore
    @Environment(\.dismiss) private var dismiss
    @State private var mode: Mode = .signUp
    @State private var name = ""
    @State private var email = ""
    @State private var password = ""
    @State private var isBusy = false
    @State private var localError = ""
    @State private var resetSent = false

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 20) {
                    Image("AppMascot")
                        .resizable()
                        .scaledToFit()
                        .frame(width: 115, height: 115)

                    VStack(spacing: 6) {
                        Text(mode == .signUp ? "Keep every study win" : "Welcome back")
                            .font(.title2.bold())
                        Text("Your chats, study kits, themes, and companion sync across devices.")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                            .multilineTextAlignment(.center)
                    }

                    Picker("Account mode", selection: $mode) {
                        ForEach(Mode.allCases, id: \.self) { mode in
                            Text(mode.rawValue).tag(mode)
                        }
                    }
                    .pickerStyle(.segmented)

                    VStack(spacing: 14) {
                        if mode == .signUp {
                            TextField("Your name", text: $name)
                                .textContentType(.name)
                                .textFieldStyle(.roundedBorder)
                        }
                        TextField("Email address", text: $email)
                            .textContentType(.emailAddress)
                            .keyboardType(.emailAddress)
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled()
                            .textFieldStyle(.roundedBorder)
                        SecureField("Password", text: $password)
                            .textContentType(mode == .signUp ? .newPassword : .password)
                            .textFieldStyle(.roundedBorder)

                        if mode == .logIn {
                            Button("Forgot your password?") {
                                Task { await resetPassword() }
                            }
                            .font(.footnote.bold())
                            .frame(maxWidth: .infinity, alignment: .trailing)
                        }
                    }

                    if !localError.isEmpty {
                        Label(localError, systemImage: "exclamationmark.circle")
                            .font(.footnote)
                            .foregroundStyle(.red)
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }
                    if resetSent {
                        Label("Password reset email sent.", systemImage: "checkmark.circle")
                            .font(.footnote)
                            .foregroundStyle(.green)
                    }

                    Button {
                        Task { await submit() }
                    } label: {
                        HStack {
                            if isBusy { ProgressView().tint(.white) }
                            Text(isBusy ? "One moment..." : mode.rawValue)
                                .fontWeight(.bold)
                        }
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 13)
                    }
                    .buttonStyle(.borderedProminent)
                    .disabled(isBusy)
                }
                .padding(24)
            }
            .navigationTitle("StudyPop account")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Close") { dismiss() }
                }
            }
        }
    }

    private func submit() async {
        localError = ""
        resetSent = false
        guard email.contains("@"), password.count >= 8 else {
            localError = "Enter a valid email and a password with at least 8 characters."
            return
        }
        if mode == .signUp, name.trimmingCharacters(in: .whitespaces).count < 2 {
            localError = "Add a name with at least 2 characters."
            return
        }

        isBusy = true
        defer { isBusy = false }
        do {
            if mode == .signUp {
                try await store.signUp(name: name, email: email, password: password)
            } else {
                try await store.signIn(email: email, password: password)
            }
            dismiss()
        } catch {
            localError = error.localizedDescription
        }
    }

    private func resetPassword() async {
        localError = ""
        guard email.contains("@") else {
            localError = "Enter your email address first."
            return
        }
        do {
            try await store.sendPasswordReset(email: email)
            resetSent = true
        } catch {
            localError = error.localizedDescription
        }
    }
}

