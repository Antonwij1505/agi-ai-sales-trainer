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
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
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
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import com.astongraphindo.agitrainer.audio.StreamingPlayer
import com.astongraphindo.agitrainer.audio.StreamingRecorder
import com.astongraphindo.agitrainer.data.LiveClient
import com.astongraphindo.agitrainer.data.TokenStore
import com.astongraphindo.agitrainer.data.TrainerApi
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

private enum class LivePhase { CONNECTING, IDLE, LISTENING, WAITING, SPEAKING, DONE }

private data class VoiceBubble(val fromSales: Boolean, val text: String)

/**
 * Speech-to-speech roleplay (Gemini Live).
 *
 * Replaces the STT -> LLM -> TTS pipeline for this screen. Two things differ from
 * [LiveSessionScreen]:
 *
 *  1. Audio is streamed both ways. The rep's speech goes up as it is spoken, and the
 *     customer's reply is played while it is still being generated — no waiting for a
 *     complete file.
 *  2. The rep says when the turn is over. Gemini's automatic VAD was measured cutting
 *     turns at a mid-sentence pause, so it is disabled and this screen drives the
 *     turn boundary: local silence detection ends it, and a "Selesai bicara" button
 *     is always available because no threshold suits every room.
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
    var level by remember { mutableStateOf(0.0) }
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

    // ── start the session once ───────────────────────────────────────────────
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

    // ── relay events ─────────────────────────────────────────────────────────
    // Single collector: SharedFlow with replay=0 fans out to every collector, so a
    // second collector for "who is speaking" would race with this one.
    var partialFromSales by remember { mutableStateOf(false) }

    LaunchedEffect(sessionId) {
        if (sessionId == 0) return@LaunchedEffect
        live.events.collect { ev ->
            when (ev) {
                is LiveClient.Event.Ready -> phase = LivePhase.IDLE

                is LiveClient.Event.Audio -> {
                    // Barge-in: while the rep is speaking we must NOT play incoming
                    // audio. The model keeps emitting for the interrupted turn, and
                    // without this guard each late chunk would restart playback —
                    // the customer would talk over the rep.
                    if (phase == LivePhase.LISTENING) {
                        // ignore
                    } else {
                        if (!player.isPlaying) player.start()
                        player.write(ev.pcm)
                        phase = LivePhase.SPEAKING
                    }
                }

                is LiveClient.Event.Transcript -> {
                    // Frames arrive per word, and the speaker can change between
                    // turns — flush the buffer whenever it does.
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
                    phase = if (player.isPlaying) LivePhase.SPEAKING else LivePhase.IDLE
                }

                is LiveClient.Event.Failure -> {
                    error = ev.message
                    phase = LivePhase.IDLE
                }

                is LiveClient.Event.Closed -> {
                    if (phase != LivePhase.DONE) phase = LivePhase.IDLE
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

    /** End the rep's turn: stop capturing and tell the server to answer. */
    fun endTurn() {
        recorder.stop()
        live.sendTurnEnd()
        phase = LivePhase.WAITING
    }

    fun listen() {
        if (sessionId == 0) return
        error = null
        partial = ""
        player.stop() // barge-in
        phase = LivePhase.LISTENING

        scope.launch {
            val ok = withContext(Dispatchers.IO) {
                if (!recorder.start()) {
                    false
                } else {
                    live.sendTurnStart()
                    val heard = recorder.streamUntilTurnEnd { chunk ->
                        live.sendAudio(chunk)
                    }
                    recorder.stop()
                    heard
                }
            }
            if (phase != LivePhase.LISTENING) return@launch // already ended manually
            if (!ok) {
                phase = LivePhase.IDLE
                error = "Tidak ada suara terdeteksi. Coba lagi lebih dekat ke mikrofon."
                return@launch
            }
            endTurn()
        }
    }

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
                    "Suara langsung (Gemini Live) · Resistensi $resistance/5",
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
            Modifier.fillMaxWidth().padding(16.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            error?.let {
                Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error)
                Spacer(Modifier.height(6.dp))
            }

            Text(
                when (phase) {
                    LivePhase.CONNECTING -> "Menyiapkan…"
                    LivePhase.IDLE -> "Tekan BICARA lalu bicara seperti menelepon"
                    // Tell the rep about the button here: without it they wait for
                    // the silence detector, which is deliberately patient (2.5s) so
                    // that thinking mid-sentence is not treated as "finished".
                    LivePhase.LISTENING -> "Mendengarkan… tekan \"Selesai bicara\" kalau sudah selesai"
                    LivePhase.WAITING -> "Customer sedang menjawab…"
                    LivePhase.SPEAKING -> "Customer berbicara… (tekan POTONG untuk memotong)"
                    LivePhase.DONE -> "Percakapan selesai"
                },
                style = MaterialTheme.typography.bodyMedium,
            )
            Spacer(Modifier.height(14.dp))

            when (phase) {
                LivePhase.DONE -> Button(
                    onClick = {
                        player.stop()
                        scope.launch {
                            runCatching { api.finish(sessionId) }
                            onFinished(sessionId)
                        }
                    },
                    modifier = Modifier.fillMaxWidth(),
                ) { Text("Selesai & Lihat Penilaian") }

                LivePhase.LISTENING -> Column(horizontalAlignment = Alignment.CenterHorizontally) {
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
                    Spacer(Modifier.height(10.dp))
                    // The rep controls the turn boundary — never leave them stuck.
                    Button(
                        onClick = { endTurn() },
                        modifier = Modifier.fillMaxWidth(),
                    ) { Text("Selesai bicara") }
                }

                LivePhase.WAITING -> Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    CircularProgressIndicator()
                    Spacer(Modifier.height(8.dp))
                    Text("Menunggu balasan…", style = MaterialTheme.typography.bodySmall)
                }

                else -> Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Button(
                        onClick = { listen() },
                        enabled = hasPermission && sessionId != 0 && phase != LivePhase.CONNECTING,
                        modifier = Modifier.size(96.dp),
                        shape = CircleShape,
                        colors = if (phase == LivePhase.SPEAKING) {
                            ButtonDefaults.buttonColors(
                                containerColor = MaterialTheme.colorScheme.error,
                            )
                        } else {
                            ButtonDefaults.buttonColors()
                        },
                    ) {
                        Text(if (phase == LivePhase.SPEAKING) "POTONG" else "BICARA")
                    }
                    if (phase == LivePhase.SPEAKING) {
                        Spacer(Modifier.height(10.dp))
                        OutlinedButton(onClick = {
                            scope.launch {
                                runCatching { api.finish(sessionId) }
                                onFinished(sessionId)
                            }
                        }) { Text("Akhiri & nilai") }
                    }
                }
            }
        }
    }
}
