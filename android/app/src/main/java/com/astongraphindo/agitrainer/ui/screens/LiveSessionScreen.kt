package com.astongraphindo.agitrainer.ui.screens

import android.Manifest
import android.content.pm.PackageManager
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
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
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import com.astongraphindo.agitrainer.audio.ReplyPlayer
import com.astongraphindo.agitrainer.audio.VoiceRecorder
import com.astongraphindo.agitrainer.data.TrainerApi
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.File

private enum class Phase { IDLE, LISTENING, THINKING, SPEAKING, DONE }

private data class Bubble(val fromSales: Boolean, val text: String)

/**
 * Live voice roleplay (PRD §11–§14, §21, §22).
 *
 * Loop: tap once → record until the sales stops talking (energy VAD) → send audio
 * → server does STT + roleplay + TTS → play the customer's reply → listen again.
 * No button is needed between turns; the single tap is only the start.
 *
 * Barge-in: tapping while the AI speaks stops playback and starts listening.
 */
@Composable
fun LiveSessionScreen(
    api: TrainerApi,
    scenarioId: Int,
    scenarioName: String,
    onFinished: (Int) -> Unit,
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val bubbles = remember { mutableStateListOf<Bubble>() }
    val listState = rememberLazyListState()

    var phase by remember { mutableStateOf(Phase.IDLE) }
    var sessionId by remember { mutableStateOf(0) }
    var resistance by remember { mutableStateOf(3) }
    var error by remember { mutableStateOf<String?>(null) }
    var nudge by remember { mutableStateOf(false) }

    val recorder = remember { VoiceRecorder(onSilence = { nudge = true }) }
    val player = remember { ReplyPlayer() }

    var hasPermission by remember {
        mutableStateOf(
            ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO) ==
                PackageManager.PERMISSION_GRANTED,
        )
    }

    val permissionLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission(),
    ) { granted -> hasPermission = granted }

    // Start the session once, on first composition with permission.
    LaunchedEffect(hasPermission) {
        if (!hasPermission) {
            permissionLauncher.launch(Manifest.permission.RECORD_AUDIO)
            return@LaunchedEffect
        }
        if (sessionId != 0) return@LaunchedEffect
        try {
            val started = api.startSession(scenarioId)
            sessionId = started.sessionId
            resistance = started.resistance
            bubbles.add(Bubble(fromSales = false, text = started.opening))
            phase = Phase.IDLE
        } catch (e: Exception) {
            error = e.message ?: "Gagal memulai sesi."
        }
    }

    LaunchedEffect(bubbles.size) {
        if (bubbles.isNotEmpty()) listState.animateScrollToItem(bubbles.lastIndex)
    }

    /**
     * Abort an in-flight recording.
     *
     * recorder.stop() flips its internal `running` flag, which makes the blocking
     * recordUntilSilence() loop exit and return null — the coroutine then treats
     * it as "no speech" and returns to IDLE. Without this the user is trapped in
     * "Mendengarkan…" until the VAD fires or the 60s cap expires.
     */
    fun cancelListening() {
        recorder.stop()
        phase = Phase.IDLE
        error = null
    }

    fun listen() {
        if (sessionId == 0) return
        nudge = false
        error = null
        phase = Phase.LISTENING
        player.stop() // barge-in

        scope.launch {
            val file = File(context.cacheDir, "turn_${System.currentTimeMillis()}.wav")
            val captured = withContext(Dispatchers.IO) {
                if (!recorder.start()) null else recorder.recordUntilSilence(file)
            }
            recorder.stop()

            if (captured == null) {
                phase = Phase.IDLE
                error = "Tidak ada suara terdeteksi. Coba bicara lebih dekat ke mikrofon."
                return@launch
            }

            phase = Phase.THINKING
            try {
                val turn = api.voiceTurn(sessionId, captured, resistance)
                resistance = turn.resistance
                if (turn.transcript.isNotBlank()) {
                    bubbles.add(Bubble(fromSales = true, text = turn.transcript))
                }
                bubbles.add(Bubble(fromSales = false, text = turn.reply))

                if (turn.audio.isNotEmpty()) {
                    phase = Phase.SPEAKING
                    val audioFile = File(context.cacheDir, "reply_${System.currentTimeMillis()}.mp3")
                    withContext(Dispatchers.Main) {
                        player.play(turn.audio, audioFile) {
                            phase = if (turn.done) Phase.DONE else Phase.IDLE
                        }
                    }
                } else {
                    phase = if (turn.done) Phase.DONE else Phase.IDLE
                }
            } catch (e: Exception) {
                error = e.message ?: "Gagal memproses suara."
                phase = Phase.IDLE
            } finally {
                captured.delete()
            }
        }
    }

    Column(Modifier.fillMaxSize()) {
        // Header
        Box(
            Modifier
                .fillMaxWidth()
                .background(MaterialTheme.colorScheme.primary)
                .padding(16.dp),
        ) {
            Column {
                Text(
                    scenarioName,
                    style = MaterialTheme.typography.titleMedium,
                    color = MaterialTheme.colorScheme.onPrimary,
                    fontWeight = FontWeight.SemiBold,
                )
                Text(
                    "Resistensi customer: $resistance/5",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onPrimary,
                )
            }
        }

        if (resistance > 0) {
            LinearProgressIndicator(
                progress = { resistance / 5f },
                modifier = Modifier.fillMaxWidth(),
            )
        }

        // Conversation
        LazyColumn(
            state = listState,
            modifier = Modifier.weight(1f),
            contentPadding = PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            items(bubbles.size) { i ->
                val b = bubbles[i]
                Row(
                    Modifier.fillMaxWidth(),
                    horizontalArrangement = if (b.fromSales) Arrangement.End else Arrangement.Start,
                ) {
                    Box(
                        Modifier
                            .fillMaxWidth(0.85f)
                            .background(
                                if (b.fromSales) {
                                    MaterialTheme.colorScheme.primaryContainer
                                } else {
                                    MaterialTheme.colorScheme.surfaceVariant
                                },
                                shape = androidx.compose.foundation.shape.RoundedCornerShape(14.dp),
                            )
                            .padding(12.dp),
                    ) {
                        Column {
                            Text(
                                if (b.fromSales) "Anda" else "Customer",
                                style = MaterialTheme.typography.labelSmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                            Spacer(Modifier.height(2.dp))
                            Text(b.text, style = MaterialTheme.typography.bodyMedium)
                        }
                    }
                }
            }
        }

        // Status + controls
        Column(
            Modifier.fillMaxWidth().padding(16.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            nudge.takeIf { it }?.let {
                Text(
                    "Customer menunggu… silakan bicara.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.error,
                )
                Spacer(Modifier.height(6.dp))
            }

            error?.let {
                Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error)
                Spacer(Modifier.height(6.dp))
            }

            Text(
                when (phase) {
                    Phase.IDLE -> "Tekan untuk mulai bicara"
                    Phase.LISTENING -> "Mendengarkan…"
                    Phase.THINKING -> "Customer sedang menjawab…"
                    Phase.SPEAKING -> "Customer berbicara… (tekan untuk memotong)"
                    Phase.DONE -> "Percakapan selesai"
                },
                style = MaterialTheme.typography.bodyMedium,
            )
            Spacer(Modifier.height(14.dp))

            when (phase) {
                Phase.DONE -> {
                    Button(
                        onClick = {
                            player.stop()
                            scope.launch {
                                try {
                                    api.finish(sessionId)
                                } catch (_: Exception) {
                                    // Finishing is best-effort; evaluation still works.
                                }
                                onFinished(sessionId)
                            }
                        },
                        modifier = Modifier.fillMaxWidth(),
                    ) { Text("Selesai & Lihat Penilaian") }
                }

                Phase.LISTENING, Phase.THINKING -> {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Box(
                            Modifier
                                .size(84.dp)
                                .background(MaterialTheme.colorScheme.primary, CircleShape),
                            contentAlignment = Alignment.Center,
                        ) {
                            CircularProgressIndicator(
                                color = MaterialTheme.colorScheme.onPrimary,
                                strokeWidth = 3.dp,
                            )
                        }
                        if (phase == Phase.LISTENING) {
                            // Escape hatch: without this the user is stuck in
                            // "Mendengarkan…" until VAD decides, with no way out.
                            Spacer(Modifier.height(10.dp))
                            Button(onClick = { cancelListening() }) { Text("Batal") }
                        }
                    }
                }

                else -> {
                    Button(
                        onClick = { listen() },
                        enabled = hasPermission && sessionId != 0,
                        modifier = Modifier.size(96.dp),
                        shape = CircleShape,
                    ) {
                        Text(if (phase == Phase.SPEAKING) "POTONG" else "BICARA")
                    }
                }
            }
        }
    }
}
