package com.studypop.android.ui

import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import com.studypop.android.AppViewModel
import com.studypop.android.R
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AuthDialog(viewModel: AppViewModel, onDismiss: () -> Unit) {
    val scope = rememberCoroutineScope()
    var signup by remember { mutableStateOf(true) }
    var name by remember { mutableStateOf("") }
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf("") }
    var resetSent by remember { mutableStateOf(false) }

    AlertDialog(
        onDismissRequest = { if (!busy) onDismiss() },
        title = { Text(if (signup) "Keep every study win" else "Welcome back") },
        text = {
            Column(
                modifier = Modifier.verticalScroll(rememberScrollState()),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                Image(
                    painter = painterResource(R.drawable.mascot),
                    contentDescription = "StudyPop mascot",
                    modifier = Modifier.size(90.dp),
                )
                Text("Your chats, study kits, themes, and companion sync across devices.")
                SingleChoiceSegmentedButtonRow(Modifier.fillMaxWidth()) {
                    listOf("Sign up", "Log in").forEachIndexed { index, label ->
                        SegmentedButton(
                            selected = signup == (index == 0),
                            onClick = {
                                signup = index == 0
                                error = ""
                                resetSent = false
                            },
                            shape = SegmentedButtonDefaults.itemShape(index, 2),
                        ) { Text(label) }
                    }
                }
                if (signup) {
                    OutlinedTextField(
                        value = name,
                        onValueChange = { name = it },
                        label = { Text("Your name") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth(),
                    )
                }
                OutlinedTextField(
                    value = email,
                    onValueChange = { email = it },
                    label = { Text("Email address") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
                OutlinedTextField(
                    value = password,
                    onValueChange = { password = it },
                    label = { Text("Password") },
                    visualTransformation = PasswordVisualTransformation(),
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
                if (!signup) {
                    Button(
                        onClick = {
                            error = ""
                            if (!email.contains("@")) {
                                error = "Enter your email address first."
                            } else {
                                scope.launch {
                                    runCatching { viewModel.sendPasswordReset(email) }
                                        .onSuccess { resetSent = true }
                                        .onFailure { error = it.message.orEmpty() }
                                }
                            }
                        },
                    ) { Text("Forgot password?") }
                }
                if (error.isNotBlank()) Text(error, color = MaterialTheme.colorScheme.error)
                if (resetSent) Text("Password reset email sent.")
            }
        },
        confirmButton = {
            Button(
                enabled = !busy,
                onClick = {
                    error = ""
                    if (!email.contains("@") || password.length < 8) {
                        error = "Enter a valid email and a password with at least 8 characters."
                        return@Button
                    }
                    if (signup && name.trim().length < 2) {
                        error = "Add a name with at least 2 characters."
                        return@Button
                    }
                    busy = true
                    scope.launch {
                        runCatching {
                            if (signup) viewModel.signUp(name, email, password)
                            else viewModel.signIn(email, password)
                        }.onSuccess {
                            onDismiss()
                        }.onFailure {
                            error = it.message ?: "The account request did not work."
                        }
                        busy = false
                    }
                },
            ) {
                Row(
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    if (busy) CircularProgressIndicator(Modifier.size(18.dp))
                    Text(if (busy) "One moment..." else if (signup) "Create account" else "Log in")
                }
            }
        },
        dismissButton = {
            Button(enabled = !busy, onClick = onDismiss) { Text("Close") }
        },
    )
}
