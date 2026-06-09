import SwiftUI

struct PopCardModifier: ViewModifier {
    @EnvironmentObject private var store: AppStore

    func body(content: Content) -> some View {
        content
            .padding(16)
            .background(.regularMaterial)
            .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
            .overlay {
                RoundedRectangle(cornerRadius: 22, style: .continuous)
                    .stroke(store.accentColor.opacity(0.18), lineWidth: 1)
            }
    }
}

extension View {
    func popCard() -> some View {
        modifier(PopCardModifier())
    }
}

struct CompanionImage: View {
    let companion: Companion
    var size: CGFloat = 68

    var body: some View {
        Image(companion.assetName)
            .resizable()
            .scaledToFill()
            .frame(width: size, height: size)
            .clipShape(Circle())
            .overlay {
                Circle().stroke(.white.opacity(0.8), lineWidth: 3)
            }
            .shadow(color: .black.opacity(0.12), radius: 12, y: 5)
            .accessibilityLabel(companion.name)
    }
}

