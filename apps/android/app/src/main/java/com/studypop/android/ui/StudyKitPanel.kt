package com.studypop.android.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.studypop.android.model.StudyKit

@Composable
fun StudyKitPanel(kit: StudyKit, onReset: () -> Unit) {
    var cardIndex by remember { mutableIntStateOf(0) }
    var flipped by remember { mutableStateOf(false) }
    var quizIndex by remember { mutableIntStateOf(0) }
    var quizAnswer by remember { mutableStateOf("") }
    var checked by remember { mutableStateOf(false) }

    Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text("Study kit", color = MaterialTheme.colorScheme.primary)
                Text("Your notes, made snack-sized", style = MaterialTheme.typography.titleLarge)
            }
            Button(onClick = onReset) {
                Icon(Icons.Default.Refresh, contentDescription = null)
                Text("New kit")
            }
        }

        Card {
            Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("Summary", style = MaterialTheme.typography.titleMedium)
                Text(kit.summary)
                kit.keyPoints.forEach { point ->
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Icon(
                            Icons.Default.CheckCircle,
                            contentDescription = null,
                            tint = MaterialTheme.colorScheme.primary,
                        )
                        Text(point)
                    }
                }
            }
        }

        if (kit.cards.isNotEmpty()) {
            val card = kit.cards[cardIndex.coerceIn(0, kit.cards.lastIndex)]
            Card(
                modifier = Modifier
                    .fillMaxWidth()
                    .heightIn(min = 170.dp)
                    .clickable { flipped = !flipped },
            ) {
                Column(
                    modifier = Modifier.fillMaxWidth().padding(24.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    Text(if (flipped) "Answer" else "Question")
                    Text(
                        if (flipped) card.back else card.front,
                        textAlign = TextAlign.Center,
                        fontWeight = FontWeight.Bold,
                    )
                    Text("Tap to flip")
                }
            }
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Button(onClick = {
                    cardIndex = (cardIndex - 1 + kit.cards.size) % kit.cards.size
                    flipped = false
                }) { Text("Previous") }
                Text("${cardIndex + 1} of ${kit.cards.size}")
                Button(onClick = {
                    cardIndex = (cardIndex + 1) % kit.cards.size
                    flipped = false
                }) { Text("Next") }
            }
        }

        if (kit.questions.isNotEmpty()) {
            Card {
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Text("Mini quiz", style = MaterialTheme.typography.titleMedium)
                    Text(kit.questions[quizIndex.coerceIn(0, kit.questions.lastIndex)])
                    OutlinedTextField(
                        value = quizAnswer,
                        onValueChange = { quizAnswer = it },
                        label = { Text("Type what you think...") },
                        modifier = Modifier.fillMaxWidth(),
                    )
                    if (checked) {
                        Text("Nice try! Compare your idea with the summary, then ask about anything fuzzy.")
                    }
                    Button(onClick = {
                        if (checked) {
                            quizIndex = (quizIndex + 1) % kit.questions.size
                            quizAnswer = ""
                        }
                        checked = !checked
                    }) { Text(if (checked) "Next question" else "Check my answer") }
                }
            }
        }
    }
}
