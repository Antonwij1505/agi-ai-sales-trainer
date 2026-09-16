package com.astongraphindo.agitrainer.ui.screens

import android.speech.tts.TextToSpeech
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.astongraphindo.agitrainer.data.ModuleDetail
import com.astongraphindo.agitrainer.data.Scenario
import com.astongraphindo.agitrainer.ui.theme.GlassBackground
import com.astongraphindo.agitrainer.ui.theme.GlassCard
import com.astongraphindo.agitrainer.ui.theme.GlassColors
import com.astongraphindo.agitrainer.ui.theme.GlassGradients
import com.astongraphindo.agitrainer.ui.theme.GlassShapes
import kotlinx.coroutines.launch
import java.util.Locale

/** Module detail, in the glass-gradient style. */
@Composable
fun ModuleDetailScreen(
    detail: ModuleDetail?,
    loading: Boolean,
    error: String?,
    onStart: (Int) -> Unit,
    onStartLive: (Int) -> Unit,
    onAskTheory: (Int, String, (String) -> Unit, (String) -> Unit) -> Unit = { _, _, _, _ -> },
) {
    GlassBackground {
        if (loading || detail == null) {
            Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                if (error != null) {
                    Text(
                        error,
                        color = MaterialTheme.colorScheme.error,
                        modifier = Modifier.padding(20.dp),
                    )
                } else {
                    CircularProgressIndicator()
                }
            }
            return@GlassBackground
        }

        LazyColumn(
            modifier = Modifier.fillMaxSize(),
            contentPadding = PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            item {
                GlassCard(Modifier.fillMaxWidth(), strong = true) {
                    Column(Modifier.padding(20.dp)) {
                        Box(
                            Modifier
                                .background(GlassGradients.primary, CircleShape)
                                .padding(horizontal = 12.dp, vertical = 4.dp),
                        ) {
                            Text(
                                detail.module.code,
                                style = MaterialTheme.typography.labelSmall,
                                color = GlassColors.OnGradient,
                            )
                        }
                        Spacer(Modifier.height(10.dp))
                        Text(
                            detail.module.name,
                            style = MaterialTheme.typography.headlineSmall,
                            fontWeight = FontWeight.Bold,
                            color = GlassColors.TextDark,
                        )
                        detail.module.description?.let {
                            Spacer(Modifier.height(6.dp))
                            Text(
                                it,
                                style = MaterialTheme.typography.bodyMedium,
                                color = GlassColors.TextMuted,
                            )
                        }
                        Spacer(Modifier.height(10.dp))
                        Text(
                            "Lulus ≥ ${detail.module.passingScore} · maks ${detail.module.maxAttempt}x percobaan",
                            style = MaterialTheme.typography.labelSmall,
                            color = GlassColors.TextMuted,
                        )
                    }
                }
            }

            item {
                Text(
                    "Skenario (${detail.scenarios.size})",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold,
                    color = GlassColors.TextDark,
                    modifier = Modifier.padding(top = 8.dp, start = 4.dp),
                )
            }

            items(detail.scenarios, key = { it.id }) { s ->
                ScenarioCard(
                    s,
                    onStart = { onStart(s.id) },
                    onStartLive = { onStartLive(s.id) },
                    onAskTheory = onAskTheory,
                )
            }

            item {
                Text(
                    "Penilaian (bobot)",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold,
                    color = GlassColors.TextDark,
                    modifier = Modifier.padding(top = 12.dp, start = 4.dp),
                )
            }
            items(detail.rubric) { r ->
                GlassCard(Modifier.fillMaxWidth(), strong = true, elevation = 8.dp) {
                    Row(
                        Modifier.fillMaxWidth().padding(14.dp),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Column(Modifier.weight(1f)) {
                            Text(
                                r.competency.replace('_', ' '),
                                style = MaterialTheme.typography.bodyMedium,
                                color = GlassColors.TextDark,
                            )
                            r.criteria?.let {
                                Text(
                                    it,
                                    style = MaterialTheme.typography.labelSmall,
                                    color = GlassColors.TextMuted,
                                )
                            }
                        }
                        Spacer(Modifier.padding(horizontal = 8.dp))
                        Text(
                            "${r.weight}%",
                            fontWeight = FontWeight.Bold,
                            color = GlassColors.BlueStart,
                            style = MaterialTheme.typography.titleSmall,
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun ScenarioCard(
    s: Scenario,
    onStart: () -> Unit,
    onStartLive: () -> Unit,
    onAskTheory: (Int, String, (String) -> Unit, (String) -> Unit) -> Unit,
) {
    var showTheory by remember { mutableStateOf(false) }

    GlassCard(Modifier.fillMaxWidth(), strong = true) {
        Column(Modifier.padding(18.dp)) {
            Text(
                s.name,
                style = MaterialTheme.typography.titleSmall,
                fontWeight = FontWeight.Bold,
                color = GlassColors.TextDark,
            )
            s.description?.let {
                Spacer(Modifier.height(6.dp))
                Text(
                    it,
                    style = MaterialTheme.typography.bodySmall,
                    color = GlassColors.TextMuted,
                )
            }

            Spacer(Modifier.height(10.dp))
            Text(
                buildString {
                    append("AI: ${s.persona.name ?: "CS"}")
                    s.persona.role?.let { append(" — $it") }
                    append(" · resistensi ${s.resistanceLevel}/5")
                },
                style = MaterialTheme.typography.labelSmall,
                color = GlassColors.TextMuted,
            )

            s.objective?.let {
                Spacer(Modifier.height(6.dp))
                Text(
                    "Tujuan: $it",
                    style = MaterialTheme.typography.labelSmall,
                    color = GlassColors.TextMuted,
                )
            }

            if (!s.theoryBriefing.isNullOrBlank() || !s.passingTips.isNullOrBlank()) {
                Spacer(Modifier.height(10.dp))
                TextButton(
                    onClick = { showTheory = true },
                    modifier = Modifier.padding(0.dp)
                ) {
                    Text(
                        "🔊 Dengar Teori & Tanya Mentor",
                        color = GlassColors.BlueStart,
                        style = MaterialTheme.typography.labelMedium,
                    )
                }
            }

            Spacer(Modifier.height(14.dp))
            Button(
                onClick = onStartLive,
                shape = GlassShapes.button,
                colors = ButtonDefaults.buttonColors(
                    containerColor = GlassColors.BlueStart,
                    contentColor = GlassColors.OnGradient,
                ),
                modifier = Modifier.fillMaxWidth().height(50.dp),
            ) {
                Text("Latihan Suara Langsung", style = MaterialTheme.typography.labelLarge)
            }
            Spacer(Modifier.height(8.dp))
            OutlinedButton(
                onClick = onStart,
                shape = GlassShapes.button,
                modifier = Modifier.fillMaxWidth().height(48.dp),
            ) {
                Text("Mode Lama (per giliran)")
            }
        }
    }

    if (showTheory) {
        TheoryDialog(
            s = s,
            onDismiss = { showTheory = false },
            onAskTheory = onAskTheory,
        )
    }
}

/**
 * Dialog teori: TTS native Android membacakan teori + jawaban mentor,
 * pertanyaan sales dijawab AI dengan guardrail dibatasi materi skenario ini.
 */
@Composable
private fun TheoryDialog(
    s: Scenario,
    onDismiss: () -> Unit,
    onAskTheory: (Int, String, (String) -> Unit, (String) -> Unit) -> Unit,
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var userQuestion by remember { mutableStateOf("") }
    var aiAnswer by remember { mutableStateOf<String?>(null) }
    var askLoading by remember { mutableStateOf(false) }
    var askError by remember { mutableStateOf<String?>(null) }
    var speaking by remember { mutableStateOf(false) }

    // ponytail: native Android TTS, no new dependency; upgrade to server edge-tts voice when branding needs it.
    var tts by remember { mutableStateOf<TextToSpeech?>(null) }
    DisposableEffect(context) {
        val engine = TextToSpeech(context) { status ->
            if (status == TextToSpeech.SUCCESS) {
                tts?.language = Locale("id", "ID")
            }
        }
        tts = engine
        onDispose {
            engine.stop()
            engine.shutdown()
        }
    }

    fun speak(text: String) {
        val engine = tts ?: return
        speaking = true
        engine.speak(text, TextToSpeech.QUEUE_FLUSH, null, "theory")
    }
    fun stopSpeak() {
        tts?.stop()
        speaking = false
    }

    fun ask() {
        val q = userQuestion.trim()
        if (q.isBlank() || askLoading) return
        askLoading = true
        askError = null
        aiAnswer = null
        stopSpeak()
        scope.launch {
            // Kept callback-style so AppNav passes vm without importing it here.
            // ponytail: ceiling 1 callback layer; switch to direct vm param when AppNav grows more actions.
            onAskTheory(
                s.id, q,
                { ans ->
                    askLoading = false
                    aiAnswer = ans
                    speak(ans)
                },
                { err ->
                    askLoading = false
                    askError = err
                },
            )
        }
    }

    AlertDialog(
        onDismissRequest = {
            stopSpeak()
            onDismiss()
        },
        title = { Text("Teori & Mentor AI", fontWeight = FontWeight.Bold) },
        text = {
            Column(Modifier.verticalScroll(rememberScrollState())) {
                s.theoryBriefing?.let {
                    Text("Teori materi ini:", fontWeight = FontWeight.Bold, color = GlassColors.TextDark)
                    Spacer(Modifier.height(4.dp))
                    Text(it, style = MaterialTheme.typography.bodyMedium, color = GlassColors.TextMuted)
                    Spacer(Modifier.height(8.dp))
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Button(onClick = { speak(it) }) {
                            Text(if (speaking) "Memutar..." else "🔊 Dengarkan Teori")
                        }
                        if (speaking) {
                            OutlinedButton(onClick = { stopSpeak() }) { Text("Stop") }
                        }
                    }
                    Spacer(Modifier.height(12.dp))
                }
                s.passingTips?.let {
                    Text("Arahan agar lulus:", fontWeight = FontWeight.Bold, color = GlassColors.TextDark)
                    Spacer(Modifier.height(4.dp))
                    Text(it, style = MaterialTheme.typography.bodyMedium, color = GlassColors.TextMuted)
                    Spacer(Modifier.height(12.dp))
                }
                Text(
                    "Tanya mentor (hanya seputar materi \"${s.name}\"):",
                    fontWeight = FontWeight.Bold,
                    color = GlassColors.TextDark,
                )
                Spacer(Modifier.height(6.dp))
                OutlinedTextField(
                    value = userQuestion,
                    onValueChange = { userQuestion = it },
                    placeholder = { Text("Contoh: gimana buka telepon 15 detik pertama?") },
                    modifier = Modifier.fillMaxWidth(),
                    maxLines = 3,
                )
                Spacer(Modifier.height(8.dp))
                Button(
                    onClick = { ask() },
                    enabled = !askLoading && userQuestion.isNotBlank(),
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Text(if (askLoading) "Mentor menjawab..." else "Tanya Mentor")
                }
                if (askLoading) {
                    Spacer(Modifier.height(8.dp))
                    CircularProgressIndicator()
                }
                askError?.let {
                    Spacer(Modifier.height(6.dp))
                    Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
                }
                aiAnswer?.let { ans ->
                    Spacer(Modifier.height(8.dp))
                    Text("Jawaban mentor:", fontWeight = FontWeight.Bold, color = GlassColors.TextDark)
                    Spacer(Modifier.height(4.dp))
                    Text(ans, style = MaterialTheme.typography.bodyMedium, color = GlassColors.TextMuted)
                    Spacer(Modifier.height(8.dp))
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Button(onClick = { speak(ans) }) { Text("🔊 Dengarkan Jawaban") }
                        OutlinedButton(onClick = { stopSpeak() }) { Text("Stop") }
                    }
                }
            }
        },
        confirmButton = {
            Button(onClick = {
                stopSpeak()
                onDismiss()
            }) {
                Text("Paham & Mulai Latihan")
            }
        }
    )
}
