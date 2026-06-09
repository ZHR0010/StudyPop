import SwiftUI

struct RootView: View {
    @EnvironmentObject private var store: AppStore

    var body: some View {
        Group {
            switch store.phase {
            case .loading:
                VStack(spacing: 12) {
                    Image("AppMascot")
                        .resizable()
                        .scaledToFit()
                        .frame(width: 110, height: 110)
                    Text("StudyPop")
                        .font(.title.bold())
                    ProgressView("Opening your study space...")
                }
            case .ready:
                HomeView()
            }
        }
        .tint(store.accentColor)
        .task {
            await store.bootstrap()
        }
        .sheet(isPresented: $store.showingAuth) {
            AuthView()
        }
        .sheet(isPresented: $store.showingSettings) {
            SettingsView()
        }
        .alert(
            "StudyPop",
            isPresented: Binding(
                get: { !store.errorMessage.isEmpty },
                set: { if !$0 { store.errorMessage = "" } }
            )
        ) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(store.errorMessage)
        }
    }
}

