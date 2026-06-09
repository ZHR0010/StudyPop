import SwiftUI

struct StudyKitView: View {
    @EnvironmentObject private var store: AppStore
    let kit: StudyKit
    @State private var cardIndex = 0
    @State private var cardFlipped = false
    @State private var quizIndex = 0
    @State private var quizAnswer = ""
    @State private var answerChecked = false

    var body: some View {
        VStack(spacing: 16) {
            HStack {
                VStack(alignment: .leading) {
                    Text("Study kit")
                        .font(.caption.bold())
                        .foregroundStyle(store.accentColor)
                    Text("Your notes, made snack-sized")
                        .font(.title3.bold())
                }
                Spacer()
                Button("New kit", systemImage: "arrow.counterclockwise") {
                    store.resetStudyKit()
                }
                .font(.caption.bold())
            }

            VStack(alignment: .leading, spacing: 10) {
                Label("Summary", systemImage: "text.alignleft")
                    .font(.headline)
                Text(kit.summary)
                ForEach(kit.keyPoints, id: \.self) { point in
                    Label(point, systemImage: "checkmark.circle.fill")
                        .font(.subheadline)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .popCard()

            if !kit.cards.isEmpty {
                let card = kit.cards[min(cardIndex, kit.cards.count - 1)]
                Button {
                    withAnimation(.snappy) { cardFlipped.toggle() }
                } label: {
                    VStack(spacing: 12) {
                        Text(cardFlipped ? "Answer" : "Question")
                            .font(.caption.bold())
                            .foregroundStyle(.secondary)
                        Text(cardFlipped ? card.back : card.front)
                            .font(.headline)
                            .multilineTextAlignment(.center)
                        Label("Tap to flip", systemImage: "arrow.triangle.2.circlepath")
                            .font(.caption)
                    }
                    .frame(maxWidth: .infinity, minHeight: 160)
                }
                .buttonStyle(.plain)
                .popCard()

                HStack {
                    Button("Previous", systemImage: "arrow.left") {
                        cardIndex = (cardIndex - 1 + kit.cards.count) % kit.cards.count
                        cardFlipped = false
                    }
                    Spacer()
                    Text("\(cardIndex + 1) of \(kit.cards.count)")
                        .font(.caption.bold())
                    Spacer()
                    Button("Next", systemImage: "arrow.right") {
                        cardIndex = (cardIndex + 1) % kit.cards.count
                        cardFlipped = false
                    }
                    .labelStyle(.titleAndIcon)
                }
            }

            if !kit.questions.isEmpty {
                VStack(alignment: .leading, spacing: 12) {
                    Label("Mini quiz", systemImage: "questionmark.circle")
                        .font(.headline)
                    Text(kit.questions[min(quizIndex, kit.questions.count - 1)])
                        .fontWeight(.semibold)
                    TextField("Type what you think...", text: $quizAnswer, axis: .vertical)
                        .textFieldStyle(.roundedBorder)
                    if answerChecked {
                        Text("Nice try! Compare your idea with the summary, then ask about anything fuzzy.")
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                    }
                    Button(answerChecked ? "Next question" : "Check my answer") {
                        if answerChecked {
                            quizIndex = (quizIndex + 1) % kit.questions.count
                            quizAnswer = ""
                        }
                        answerChecked.toggle()
                    }
                    .buttonStyle(.borderedProminent)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .popCard()
            }
        }
    }
}

