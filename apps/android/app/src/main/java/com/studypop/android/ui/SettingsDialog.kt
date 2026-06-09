package com.studypop.android.ui

import androidx.compose.foundation.Image
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import com.studypop.android.AppViewModel
import com.studypop.android.R
import com.studypop.android.model.StudyCompanion
import com.studypop.android.model.StudyTheme
import kotlinx.coroutines.launch

@Composable
fun SettingsDialog(viewModel: AppViewModel, onDismiss: () -> Unit) {
    val scope = rememberCoroutineScope()
    var confirmDelete by remember { mutableStateOf(false) }
    var busy by remember { mutableStateOf(false) }

    Dialog(onDismissRequest = { if (!busy) onDismiss() }) {
        Surface(
            shape = MaterialTheme.shapes.extraLarge,
            tonalElevation = 8.dp,
            modifier = Modifier.fillMaxWidth(),
        ) {
            Column(
                modifier = Modifier
                    .padding(20.dp)
                    .verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(16.dp),
            ) {
                Text("Your StudyPop", style = MaterialTheme.typography.headlineSmall)
                Text("Theme", style = MaterialTheme.typography.titleMedium)
                Row(
                    modifier = Modifier.horizontalScroll(rememberScrollState()),
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    StudyTheme.entries.forEach { theme ->
                        Column(
                            horizontalAlignment = Alignment.CenterHorizontally,
                            modifier = Modifier.clickable { viewModel.selectTheme(theme) },
                        ) {
                            Surface(
                                color = theme.accent(),
                                shape = CircleShape,
                                modifier = Modifier.size(42.dp),
                            ) {
                                if (viewModel.theme == theme) {
                                    Icon(
                                        Icons.Default.Check,
                                        contentDescription = null,
                                        tint = Color.White,
                                        modifier = Modifier.padding(10.dp),
                                    )
                                }
                            }
                            Text(theme.label, style = MaterialTheme.typography.labelSmall)
                        }
                    }
                }

                Text("Companion", style = MaterialTheme.typography.titleMedium)
                StudyCompanion.entries.forEach { companion ->
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clickable { viewModel.selectCompanion(companion) }
                            .padding(vertical = 5.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(12.dp),
                    ) {
                        CompanionImage(companion, 48)
                        Text(companion.displayName, modifier = Modifier.weight(1f))
                        if (viewModel.companion == companion) {
                            Icon(Icons.Default.Check, contentDescription = "Selected")
                        }
                    }
                }

                Text("Account", style = MaterialTheme.typography.titleMedium)
                val user = viewModel.user
                if (user == null) {
                    Button(onClick = {
                        onDismiss()
                        viewModel.showAuth = true
                    }) { Text("Sign up or log in") }
                } else {
                    Text(user.name)
                    Text(user.email, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    OutlinedButton(onClick = {
                        viewModel.signOut()
                        onDismiss()
                    }) { Text("Log out") }
                    OutlinedButton(onClick = { confirmDelete = true }) {
                        Text("Delete account and synced data")
                    }
                }

                Text(viewModel.syncMessage, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Button(onClick = onDismiss, modifier = Modifier.fillMaxWidth()) { Text("Done") }
            }
        }
    }

    if (confirmDelete) {
        AlertDialog(
            onDismissRequest = { if (!busy) confirmDelete = false },
            title = { Text("Delete your StudyPop account?") },
            text = { Text("Your account and synchronized study data will be permanently deleted.") },
            confirmButton = {
                Button(
                    enabled = !busy,
                    onClick = {
                        busy = true
                        scope.launch {
                            runCatching { viewModel.deleteAccount() }
                                .onSuccess {
                                    confirmDelete = false
                                    onDismiss()
                                }
                                .onFailure { viewModel.errorMessage = it.message.orEmpty() }
                            busy = false
                        }
                    },
                ) { Text(if (busy) "Deleting..." else "Delete account") }
            },
            dismissButton = {
                Button(enabled = !busy, onClick = { confirmDelete = false }) { Text("Cancel") }
            },
        )
    }
}

@Composable
fun CompanionImage(companion: StudyCompanion, size: Int) {
    val drawable = when (companion) {
        StudyCompanion.GOJO -> R.drawable.companion_gojo
        StudyCompanion.TANJIRO -> R.drawable.companion_tanjiro
        StudyCompanion.PROFESSOR -> R.drawable.companion_professor
        StudyCompanion.ELEVEN -> R.drawable.companion_eleven
        StudyCompanion.HARRY -> R.drawable.companion_harry
    }
    Image(
        painter = painterResource(drawable),
        contentDescription = companion.displayName,
        contentScale = ContentScale.Crop,
        modifier = Modifier.size(size.dp).clip(CircleShape),
    )
}
