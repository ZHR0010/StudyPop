package com.studypop.android.ui

import android.Manifest
import android.content.pm.PackageManager
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material.icons.filled.AccountCircle
import androidx.compose.material.icons.filled.AddPhotoAlternate
import androidx.compose.material.icons.filled.CameraAlt
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.FlashOff
import androidx.compose.material.icons.filled.FlashOn
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material.icons.filled.Stop
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.core.content.ContextCompat
import com.studypop.android.AppViewModel
import com.studypop.android.R
import com.studypop.android.media.CameraCaptureScreen
import com.studypop.android.media.ImageAttachment
import com.studypop.android.media.ImageUtils
import com.studypop.android.media.TorchController
import com.studypop.android.media.VoiceRecorder
import com.studypop.android.model.ChatMessage
import com.studypop.android.model.StudySection
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

@Composable
fun StudyPopRoot(viewModel: AppViewModel) {
    StudyPopTheme(viewModel.theme) {
        when (viewModel.phase) {
            AppViewModel.Phase.LOADING -> SplashScreen()
            AppViewModel.Phase.READY -> StudyPopHome(viewModel)
        }
    }
}

@Composable
private fun SplashScreen() {
    Box(
        Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background),
        contentAlignment = Alignment.Center,
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Image(
                painterResource(R.drawable.mascot),
                contentDescription = null,
                modifier = Modifier.size(130.dp),
            )
            Text("StudyPop", style = MaterialTheme.typography.headlineMedium)
            Text("Opening your study space...")
            Spacer(Modifier.height(16.dp))
            CircularProgressIndicator()
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun StudyPopHome(viewModel: AppViewModel) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val attachments = remember { mutableStateListOf<ImageAttachment>() }
    val recorder = remember { VoiceRecorder(context) }
    val torch = remember { TorchController(context) }
    var draft by remember { mutableStateOf("") }
    var showCamera by remember { mutableStateOf(false) }
    var isRecording by remember { mutableStateOf(false) }
    var isTranscribing by remember { mutableStateOf(false) }
    var elapsed by remember { mutableIntStateOf(0) }
    var torchOn by remember { mutableStateOf(false) }

    val photoPicker = rememberLauncherForActivityResult(
        ActivityResultContracts.GetMultipleContents(),
    ) { uris ->
        scope.launch {
            uris.take(4).mapNotNull { ImageUtils.fromUri(context, it) }.forEach {
                if (attachments.size < 4) attachments.add(it)
            }
        }
    }
    val cameraPermission = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission(),
    ) { granted ->
        if (granted) showCamera = true
        else viewModel.errorMessage = "Camera access is needed only when you snap a question."
    }
    val audioPermission = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission(),
    ) { granted ->
        if (granted) {
            runCatching { recorder.start() }
                .onSuccess {
                    isRecording = true
                    elapsed = 0
                }
                .onFailure { viewModel.errorMessage = "The microphone could not start." }
        } else {
            viewModel.errorMessage = "Microphone access is needed only while recording a question."
        }
    }
    val torchPermission = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission(),
    ) { granted ->
        if (granted) {
            runCatching { torch.toggle() }
                .onSuccess { torchOn = it }
                .onFailure { viewModel.errorMessage = it.message.orEmpty() }
        } else {
            viewModel.errorMessage = "Camera permission is needed to control the flashlight."
        }
    }

    LaunchedEffect(isRecording) {
        while (isRecording) {
            delay(1_000)
            elapsed += 1
        }
    }
    DisposableEffect(Unit) {
        onDispose {
            recorder.cancel()
            torch.turnOff()
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Image(
                            painterResource(R.drawable.mascot),
                            contentDescription = null,
                            modifier = Modifier.size(42.dp),
                        )
                        Spacer(Modifier.width(8.dp))
                        Column {
                            Text("StudyPop", fontWeight = FontWeight.Bold)
                            Text(
                                viewModel.selectedSection.title,
                                style = MaterialTheme.typography.labelMedium,
                            )
                        }
                    }
                },
                actions = {
                    IconButton(
                        onClick = {
                            if (!torch.isAvailable) {
                                viewModel.errorMessage =
                                    "A flashlight is not available on this device."
                            } else if (
                                ContextCompat.checkSelfPermission(
                                    context,
                                    Manifest.permission.CAMERA,
                                ) == PackageManager.PERMISSION_GRANTED
                            ) {
                                runCatching { torch.toggle() }
                                    .onSuccess { torchOn = it }
                                    .onFailure { viewModel.errorMessage = it.message.orEmpty() }
                            } else {
                                torchPermission.launch(Manifest.permission.CAMERA)
                            }
                        },
                    ) {
                        Icon(
                            if (torchOn) Icons.Default.FlashOff else Icons.Default.FlashOn,
                            contentDescription = "Toggle flashlight",
                        )
                    }
                    IconButton(onClick = { viewModel.showSettings = true }) {
                        Icon(Icons.Default.AccountCircle, contentDescription = "Account settings")
                    }
                },
            )
        },
        bottomBar = {
            Composer(
                draft = draft,
                onDraftChange = { draft = it },
                attachments = attachments,
                isRecording = isRecording,
                isTranscribing = isTranscribing,
                elapsed = elapsed,
                isSending = viewModel.isSending,
                syncMessage = viewModel.syncMessage,
                loggedIn = viewModel.user != null,
                section = viewModel.selectedSection,
                onPickImages = { photoPicker.launch("image/*") },
                onCamera = {
                    if (
                        ContextCompat.checkSelfPermission(
                            context,
                            Manifest.permission.CAMERA,
                        ) == PackageManager.PERMISSION_GRANTED
                    ) {
                        showCamera = true
                    } else {
                        cameraPermission.launch(Manifest.permission.CAMERA)
                    }
                },
                onVoice = {
                    if (isRecording) {
                        runCatching { recorder.stop() }
                            .onSuccess { bytes ->
                                isRecording = false
                                isTranscribing = true
                                scope.launch {
                                    runCatching { viewModel.transcribe(bytes, "audio/mp4") }
                                        .onSuccess { text ->
                                            draft = listOf(draft, text)
                                                .filter { it.isNotBlank() }
                                                .joinToString(" ")
                                        }
                                        .onFailure {
                                            viewModel.errorMessage =
                                                it.message ?: "Voice transcription did not work."
                                        }
                                    isTranscribing = false
                                }
                            }
                            .onFailure {
                                recorder.cancel()
                                isRecording = false
                                viewModel.errorMessage = "The recording could not be finished."
                            }
                    } else if (
                        ContextCompat.checkSelfPermission(
                            context,
                            Manifest.permission.RECORD_AUDIO,
                        ) == PackageManager.PERMISSION_GRANTED
                    ) {
                        runCatching { recorder.start() }
                            .onSuccess {
                                isRecording = true
                                elapsed = 0
                            }
                            .onFailure {
                                viewModel.errorMessage = "The microphone could not start."
                            }
                    } else {
                        audioPermission.launch(Manifest.permission.RECORD_AUDIO)
                    }
                },
                onSend = {
                    viewModel.submit(draft, attachments.map { it.dataUrl })
                    draft = ""
                    attachments.clear()
                },
                onLogin = { viewModel.showAuth = true },
            )
        },
    ) { padding ->
        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding),
            contentPadding = PaddingValues(horizontal = 16.dp, vertical = 12.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            item {
                SectionPicker(
                    selected = viewModel.selectedSection,
                    onSelected = {
                        viewModel.selectSection(it)
                        draft = ""
                        attachments.clear()
                    },
                )
            }
            item { CompanionHeader(viewModel) }

            if (viewModel.messages.isEmpty() && viewModel.state.studyKit == null) {
                item {
                    StarterCard(viewModel.selectedSection) { draft = it }
                }
            } else if (viewModel.messages.isNotEmpty()) {
                item {
                    Row(
                        Modifier.fillMaxWidth(),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text(
                            "Our chat",
                            style = MaterialTheme.typography.titleMedium,
                            modifier = Modifier.weight(1f),
                        )
                        IconButton(onClick = viewModel::clearConversation) {
                            Icon(Icons.Default.Delete, contentDescription = "Clear conversation")
                        }
                    }
                }
                items(viewModel.messages, key = { it.id }) { message ->
                    MessageBubble(message, viewModel)
                }
                if (viewModel.isSending) {
                    item {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(10.dp),
                        ) {
                            CompanionImage(viewModel.companion, 36)
                            CircularProgressIndicator(Modifier.size(22.dp))
                            Text("${viewModel.companion.displayName} is thinking...")
                        }
                    }
                }
            }

            if (
                viewModel.selectedSection == StudySection.STUDY &&
                viewModel.state.studyKit != null
            ) {
                item {
                    StudyKitPanel(
                        kit = viewModel.state.studyKit!!,
                        onReset = viewModel::resetStudyKit,
                    )
                }
            }
            item { Spacer(Modifier.height(8.dp)) }
        }
    }

    if (showCamera) {
        Dialog(
            onDismissRequest = { showCamera = false },
            properties = DialogProperties(
                usePlatformDefaultWidth = false,
                decorFitsSystemWindows = false,
            ),
        ) {
            CameraCaptureScreen(
                onCaptured = {
                    if (attachments.size < 4) attachments.add(it)
                    showCamera = false
                },
                onError = { viewModel.errorMessage = it },
                onClose = { showCamera = false },
            )
        }
    }
    if (viewModel.showAuth) {
        AuthDialog(viewModel) { viewModel.showAuth = false }
    }
    if (viewModel.showSettings) {
        SettingsDialog(viewModel) { viewModel.showSettings = false }
    }
    if (viewModel.errorMessage.isNotBlank()) {
        AlertDialog(
            onDismissRequest = { viewModel.errorMessage = "" },
            title = { Text("A tiny pause") },
            text = { Text(viewModel.errorMessage) },
            confirmButton = {
                Button(onClick = { viewModel.errorMessage = "" }) { Text("Okay") }
            },
        )
    }
}

@Composable
private fun SectionPicker(
    selected: StudySection,
    onSelected: (StudySection) -> Unit,
) {
    Row(
        modifier = Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        StudySection.entries.forEach { section ->
            Surface(
                onClick = { onSelected(section) },
                shape = RoundedCornerShape(50),
                color = if (selected == section) {
                    MaterialTheme.colorScheme.primary
                } else {
                    MaterialTheme.colorScheme.surfaceVariant
                },
            ) {
                Text(
                    "${section.emoji} ${section.title}",
                    modifier = Modifier.padding(horizontal = 13.dp, vertical = 9.dp),
                    color = if (selected == section) Color.White
                    else MaterialTheme.colorScheme.onSurface,
                )
            }
        }
    }
}

@Composable
private fun CompanionHeader(viewModel: AppViewModel) {
    Card {
        Row(
            modifier = Modifier.fillMaxWidth().padding(16.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            CompanionImage(viewModel.companion, 76)
            Column {
                Text(
                    viewModel.companion.displayName,
                    color = MaterialTheme.colorScheme.primary,
                    fontWeight = FontWeight.Bold,
                )
                Text(
                    viewModel.companion.encouragement,
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold,
                )
                Text(viewModel.selectedSection.greeting)
                Text(
                    "${viewModel.companion.displayName} " +
                        viewModel.companionActions[viewModel.companionActionIndex],
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}

@Composable
private fun StarterCard(section: StudySection, onPrompt: (String) -> Unit) {
    Card {
        Column(
            Modifier.fillMaxWidth().padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Text("Try a tiny first question", style = MaterialTheme.typography.titleMedium)
            section.starterPrompts.forEach { prompt ->
                Button(onClick = { onPrompt(prompt) }, modifier = Modifier.fillMaxWidth()) {
                    Text(prompt)
                }
            }
        }
    }
}

@Composable
private fun MessageBubble(message: ChatMessage, viewModel: AppViewModel) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = if (message.role == "user") Arrangement.End else Arrangement.Start,
        verticalAlignment = Alignment.Top,
    ) {
        if (message.role == "assistant") {
            CompanionImage(viewModel.companion, 34)
            Spacer(Modifier.width(8.dp))
        }
        Surface(
            shape = RoundedCornerShape(18.dp),
            color = if (message.role == "assistant") {
                MaterialTheme.colorScheme.surfaceVariant
            } else {
                MaterialTheme.colorScheme.primary.copy(alpha = 0.18f)
            },
            modifier = Modifier.fillMaxWidth(0.82f),
        ) {
            Column(Modifier.padding(13.dp)) {
                Text(
                    if (message.role == "assistant") {
                        viewModel.companion.displayName
                    } else {
                        "You"
                    },
                    style = MaterialTheme.typography.labelSmall,
                    fontWeight = FontWeight.Bold,
                )
                Text(message.text)
                if (message.hadImages) Text("📷 Image attached")
            }
        }
    }
}

@Composable
private fun Composer(
    draft: String,
    onDraftChange: (String) -> Unit,
    attachments: MutableList<ImageAttachment>,
    isRecording: Boolean,
    isTranscribing: Boolean,
    elapsed: Int,
    isSending: Boolean,
    syncMessage: String,
    loggedIn: Boolean,
    section: StudySection,
    onPickImages: () -> Unit,
    onCamera: () -> Unit,
    onVoice: () -> Unit,
    onSend: () -> Unit,
    onLogin: () -> Unit,
) {
    Surface(tonalElevation = 5.dp) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .navigationBarsPadding()
                .imePadding()
                .padding(12.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            if (attachments.isNotEmpty()) {
                Row(
                    modifier = Modifier.horizontalScroll(rememberScrollState()),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    attachments.forEachIndexed { index, attachment ->
                        Box {
                            Image(
                                bitmap = attachment.preview,
                                contentDescription = "Attached question image",
                                contentScale = ContentScale.Crop,
                                modifier = Modifier
                                    .size(68.dp)
                                    .clip(RoundedCornerShape(12.dp)),
                            )
                            IconButton(
                                onClick = { attachments.removeAt(index) },
                                modifier = Modifier
                                    .align(Alignment.TopEnd)
                                    .size(25.dp)
                                    .background(Color.Black.copy(alpha = 0.55f), CircleShape),
                            ) {
                                Icon(
                                    Icons.Default.Close,
                                    contentDescription = "Remove image",
                                    tint = Color.White,
                                )
                            }
                        }
                    }
                }
            }
            if (isRecording || isTranscribing) {
                Text(
                    if (isRecording) {
                        "● Recording %02d:%02d".format(elapsed / 60, elapsed % 60)
                    } else {
                        "Turning your voice into text..."
                    },
                    color = if (isRecording) Color(0xFFE34850)
                    else MaterialTheme.colorScheme.primary,
                )
            }
            OutlinedTextField(
                value = draft,
                onValueChange = onDraftChange,
                placeholder = {
                    Text(
                        if (section == StudySection.STUDY) {
                            "Paste notes, type a topic, or add a photo..."
                        } else {
                            "Ask a ${section.title.lowercase()} question..."
                        },
                    )
                },
                minLines = 1,
                maxLines = 4,
                modifier = Modifier.fillMaxWidth(),
            )
            Row(verticalAlignment = Alignment.CenterVertically) {
                IconButton(onClick = onPickImages) {
                    Icon(Icons.Default.AddPhotoAlternate, contentDescription = "Upload images")
                }
                IconButton(onClick = onCamera) {
                    Icon(Icons.Default.CameraAlt, contentDescription = "Snap a picture")
                }
                IconButton(enabled = !isTranscribing, onClick = onVoice) {
                    Icon(
                        if (isRecording) Icons.Default.Stop else Icons.Default.Mic,
                        contentDescription = if (isRecording) "Stop recording" else "Record voice",
                        tint = if (isRecording) Color(0xFFE34850)
                        else MaterialTheme.colorScheme.onSurface,
                    )
                }
                Spacer(Modifier.weight(1f))
                IconButton(
                    enabled = !isSending && (draft.isNotBlank() || attachments.isNotEmpty()),
                    onClick = onSend,
                    modifier = Modifier.background(MaterialTheme.colorScheme.primary, CircleShape),
                ) {
                    Icon(
                        Icons.AutoMirrored.Filled.Send,
                        contentDescription = "Send question",
                        tint = Color.White,
                    )
                }
            }
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    syncMessage,
                    style = MaterialTheme.typography.labelSmall,
                    modifier = Modifier.weight(1f),
                )
                if (!loggedIn) {
                    Text(
                        "Sign up to sync",
                        color = MaterialTheme.colorScheme.primary,
                        style = MaterialTheme.typography.labelMedium,
                        modifier = Modifier.clickable(onClick = onLogin).padding(4.dp),
                    )
                }
            }
        }
    }
}
