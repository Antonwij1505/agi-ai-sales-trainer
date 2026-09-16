package com.astongraphindo.agitrainer.ui.screens

import android.Manifest
import android.content.pm.PackageManager
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
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
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.scale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import com.astongraphindo.agitrainer.audio.StreamingPlayer
import com.astongraphindo.agitrainer.audio.StreamingRecorder
import com.astongraphindo.agitrainer.data.LiveClient
import com.astongraphindo.agitrainer.data.TokenStore
import com.astongraphindo.agitrainer.data.TrainerApi
import com.astongraphindo.agitrainer.ui.theme.GlassColors
import com.astongraphindo.agitrainer.ui.theme.GlassShapes
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

private enum class LivePhase { CONNECTING, ACTIVE, SPEAKING, DONE }

private data class VoiceBubble(val fromSales: Boolean, val text: String)

/**
 * Hands-Free Full-Duplex Speech-to-Speech (ChatGPT Advanced Voice style).
 *
 * Runs continuous microphone capture with hardware AEC (Acoustic Echo Cancellation)
 * and Neural Auto-VAD. No buttons to press — talk naturally like a real phone call.
 */
@Composable
fun LiveVoiceScreen(
    api: TrainerApi,
    tokenStore: TokenStore,
    scenarioId: Int,
    scenarioName: String,
    onFinished: (Int) -> Unit,
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val bubbles = remember { mutableStateListOf<VoiceBubble>() }
    val listState = rememberLazyListState()

    val live = remember { LiveClient() }
    val recorder = remember { StreamingRecorder() }
    val player = remember { StreamingPlayer() }

    var phase by remember { mutableStateOf(LivePhase.CONNECTING) }
    var sessionId by remember { mutableStateOf(0) }
    var resistance by remember { mutableStateOf(3) }
    var error by remember { mutableStateOf<String?>(null) }
    var partial by remember { mutableStateOf("") }

    var hasPermission by remember {
        mutableStateOf(
            ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO) ==
                PackageManager.PERMISSION_GRANTED,
        )
    }
    val permissionLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission(),
    ) { hasPermission = it }

    // ── start the session ───────────────────────────────────────────────────
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
            bubbles.add(VoiceBubble(false, started.opening))
            val token = tokenStore.token()
            if (token.isNullOrBlank()) {
                error = "Sesi login berakhir. Silakan masuk lagi."
                return@LaunchedEffect
            }
            live.connect(started.sessionId, token)
        } catch (e: Exception) {
            error = e.message ?: "Gagal memulai sesi."
        }
    }

    // ── relay events & continuous mic capture ────────────────────────────────
    var partialFromSales by remember { mutableStateOf(false) }

    LaunchedEffect(sessionId) {
        if (sessionId == 0) return@LaunchedEffect
        live.events.collect { ev ->
            when (ev) {
                is LiveClient.Event.Ready -> {
                    phase = LivePhase.ACTIVE
                    // Start continuous background mic streaming
                    scope.launch(Dispatchers.IO) {
                        if (recorder.start()) {
                            recorder.streamContinuous { chunk ->
                                live.sendAudio(chunk)
                            }
                        }
                    }
                }

                is LiveClient.Event.Audio -> {
                    if (!player.isPlaying) player.start()
                    player.write(ev.pcm)
                    phase = LivePhase.SPEAKING
                }

                is LiveClient.Event.Transcript -> {
                    if (ev.fromSales) {
                        // User spoke -> instant barge-in interrupt
                        player.clear()
                    }
                    if (ev.fromSales != partialFromSales && partial.isNotBlank()) {
                        bubbles.add(VoiceBubble(partialFromSales, partial.trim()))
                        partial = ""
                    }
                    partialFromSales = ev.fromSales
                    partial += ev.text
                }

                is LiveClient.Event.TurnEnd -> {
                    val text = partial.trim()
                    if (text.isNotEmpty()) bubbles.add(VoiceBubble(partialFromSales, text))
                    partial = ""
                    phase = if (player.isPlaying) LivePhase.SPEAKING else LivePhase.ACTIVE
                }

                is LiveClient.Event.Failure -> {
                    error = ev.message
                    phase = LivePhase.ACTIVE
                }

                is LiveClient.Event.Closed -> {
                    if (phase != LivePhase.DONE) phase = LivePhase.ACTIVE
                }
            }
        }
    }

    LaunchedEffect(bubbles.size, partial) {
        val target = bubbles.size + if (partial.isNotBlank()) 1 else 0
        if (target > 0) listState.animateScrollToItem((target - 1).coerceAtLeast(0))
    }

    DisposableEffect(Unit) {
        onDispose {
            recorder.stop()
            player.stop()
            live.stop()
            live.disconnect()
        }
    }

    // Call wave pulse animation
    val infiniteTransition = rememberInfiniteTransition(label = "pulse")
    val pulseScale by infiniteTransition.animateFloat(
        initialValue = 0.95f,
        targetValue = 1.15f,
        animationSpec = infiniteRepeatable(
            animation = tween(800, easing = FastOutSlowInEasing),
            repeatMode = RepeatMode.Reverse,
        ),
        label = "scale",
    )

    // ── UI ───────────────────────────────────────────────────────────────────
    Column(Modifier.fillMaxSize()) {
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
                    "Panggilan Telepon Langsung (ChatGPT Style) · Resistensi $resistance/5",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onPrimary,
                )
            }
        }

        LinearProgressIndicator(
            progress = { resistance / 5f },
            modifier = Modifier.fillMaxWidth(),
        )

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
                                if (b.fromSales) MaterialTheme.colorScheme.primaryContainer
                                else MaterialTheme.colorScheme.surfaceVariant,
                                shape = RoundedCornerShape(14.dp),
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
            if (partial.isNotBlank()) {
                item {
                    Row(
                        Modifier.fillMaxWidth(),
                        horizontalArrangement = if (partialFromSales) Arrangement.End else Arrangement.Start,
                    ) {
                        Box(
                            Modifier
                                .fillMaxWidth(0.85f)
                                .background(
                                    MaterialTheme.colorScheme.surfaceVariant,
                                    shape = RoundedCornerShape(14.dp),
                                )
                                .padding(12.dp),
                        ) {
                            Text(
                                partial,
                                style = MaterialTheme.typography.bodyMedium,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                    }
                }
            }
        }

        Column(
            Modifier.fillMaxWidth().padding(18.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            error?.let {
                Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error)
                Spacer(Modifier.height(8.dp))
            }

            // Call pulse indicator
            Box(
                Modifier
                    .size(68.dp)
                    .scale(if (phase == LivePhase.ACTIVE || phase == LivePhase.SPEAKING) pulseScale else 1f)
                    .background(
                        if (phase == LivePhase.SPEAKING) GlassColors.BlueStart else MaterialTheme.colorScheme.primary,
                        CircleShape,
                    ),
                contentAlignment = Alignment.Center,
            ) {
                if (phase == LivePhase.CONNECTING) {
                    CircularProgressIndicator(
                        color = MaterialTheme.colorScheme.onPrimary,
                        strokeWidth = 3.dp,
                    )
                } else {
                    Text(
                        if (phase == LivePhase.SPEAKING) "..." else "LIVE",
                        color = MaterialTheme.colorScheme.onPrimary,
                        fontWeight = FontWeight.Bold,
                        style = MaterialTheme.typography.labelMedium,
                    )
                }
            }

            Spacer(Modifier.height(10.dp))

            Text(
                when (phase) {
                    LivePhase.CONNECTING -> "Menghubungkan panggilan..."
                    LivePhase.SPEAKING -> "Customer berbicara... (Bicara untuk memotong)"
                    LivePhase.DONE -> "Panggilan selesai"
                    else -> "Panggilan telepon aktif — Bicara langsung kapan saja"
                },
                style = MaterialTheme.typography.bodyMedium,
                fontWeight = FontWeight.Medium,
            )

            Spacer(Modifier.height(16.dp))

            Button(
                onClick = {
                    phase = LivePhase.DONE
                    recorder.stop()
                    player.stop()
                    scope.launch {
                        runCatching { api.finish(sessionId) }
                        onFinished(sessionId)
                    }
                },
                shape = GlassShapes.button,
                colors = ButtonDefaults.buttonColors(
                    containerColor = MaterialTheme.colorScheme.error,
                    contentColor = MaterialTheme.colorScheme.onError,
                ),
                modifier = Modifier.fillMaxWidth().height(52.dp),
            ) {
                Text("Akhiri & Lihat Penilaian", style = MaterialTheme.typography.labelLarge)
            }
        }
    }
}
