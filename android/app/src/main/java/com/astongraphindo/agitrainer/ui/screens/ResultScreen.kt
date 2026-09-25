package com.astongraphindo.agitrainer.ui.screens

import android.speech.tts.TextToSpeech
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.astongraphindo.agitrainer.data.Evaluation
import com.astongraphindo.agitrainer.data.TrainerApi
import com.astongraphindo.agitrainer.ui.theme.GlassColors
import com.astongraphindo.agitrainer.ui.theme.GlassShapes
import java.util.Locale

@Composable
fun ResultScreen(
    api: TrainerApi,
    sessionId: Int,
    onRetry: () -> Unit,
    onBackToDashboard: () -> Unit,
) {
    var evaluation by remember { mutableStateOf<Evaluation?>(null) }
    var loading by remember { mutableStateOf(true) }
    var error by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(sessionId) {
        try {
            evaluation = api.evaluate(sessionId)
        } catch (e: Exception) {
            error = e.message ?: "Gagal mengevaluasi sesi."
        } finally {
            loading = false
        }
    }

    ResultContent(
        evaluation = evaluation,
        loading = loading,
        error = error,
        onRetry = onRetry,
        onBackToDashboard = onBackToDashboard,
    )
}

@Composable
fun ResultContent(
    evaluation: Evaluation?,
    loading: Boolean,
    error: String?,
    onRetry: () -> Unit,
    onBackToDashboard: () -> Unit,
) {
    val context = LocalContext.current
    var tts by remember { mutableStateOf<TextToSpeech?>(null) }
    var isSpeaking by remember { mutableStateOf(false) }

    DisposableEffect(Unit) {
        val t = TextToSpeech(context) { status ->
            if (status == TextToSpeech.SUCCESS) {
                // Indonesian TTS
            }
        }
        t.language = Locale("id", "ID")
        tts = t
        onDispose {
            t.stop()
            t.shutdown()
        }
    }

    fun speakText(text: String) {
        tts?.let {
            if (it.isSpeaking) {
                it.stop()
                isSpeaking = false
            } else {
                it.language = Locale("id", "ID")
                it.speak(text, TextToSpeech.QUEUE_FLUSH, null, "eval_audio")
                isSpeaking = true
            }
        }
    }

    fun stopSpeaking() {
        tts?.stop()
        isSpeaking = false
    }

    if (loading) {
        Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                CircularProgressIndicator(color = GlassColors.Amber)
                Spacer(Modifier.height(12.dp))
                Text("AI Coach sedang menganalisis sesi Anda…", style = MaterialTheme.typography.bodyMedium, color = GlassColors.TextDark)
            }
        }
        return
    }

    val ev = evaluation
    if (ev == null) {
        Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            Text(
                error ?: "Evaluasi tidak tersedia.",
                color = MaterialTheme.colorScheme.error,
                modifier = Modifier.padding(24.dp),
            )
        }
        return
    }

    Column(
        Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        // SCORE BANNER
        Box(
            Modifier
                .fillMaxWidth()
                .background(
                    if (ev.passed) GlassColors.Emerald else GlassColors.Coral,
                    RoundedCornerShape(16.dp),
                )
                .padding(20.dp),
        ) {
            Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.fillMaxWidth()) {
                Text(
                    "${ev.overallScore}",
                    style = MaterialTheme.typography.displayMedium,
                    fontWeight = FontWeight.Bold,
                    color = Color.White,
                )
                Text(
                    if (ev.passed) "🏆 LULUS STANDAR B2G" else "⚠️ BELUM LULUS (PERBAIKI SKRIP)",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold,
                    color = Color.White,
                )
                Text(
                    "Batas lulus: ${ev.passingScore} · Standar ketat B2G",
                    style = MaterialTheme.typography.labelSmall,
                    color = Color.White.copy(alpha = 0.9f),
                )
            }
        }

        // REKOMENDASI DAN CONTOH KALIMAT YANG BENAR (HIGHLIGHT PALING ATAS)
        if (ev.recommendation.isNotBlank()) {
            Card(
                Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(14.dp),
                colors = CardDefaults.cardColors(containerColor = GlassColors.Amber.copy(alpha = 0.15f)),
            ) {
                Column(Modifier.padding(16.dp)) {
                    Row(
                        Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(
                            "💡 Ajaran & Contoh Kalimat yang Benar",
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.Bold,
                            color = GlassColors.TextDark,
                            modifier = Modifier.weight(1f)
                        )
                    }
                    Spacer(Modifier.height(8.dp))
                    Text(
                        ev.recommendation,
                        style = MaterialTheme.typography.bodyMedium,
                        color = GlassColors.TextDark,
                        fontWeight = FontWeight.Medium
                    )
                    Spacer(Modifier.height(12.dp))
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Button(
                            onClick = { speakText(ev.recommendation) },
                            colors = ButtonDefaults.buttonColors(containerColor = GlassColors.Amber, contentColor = GlassColors.TextDark),
                        ) {
                            Text(if (isSpeaking) "🔊 Menjelaskan..." else "🔊 Dengarkan Arahan Coach AI", fontWeight = FontWeight.Bold)
                        }
                        if (isSpeaking) {
                            OutlinedButton(onClick = { stopSpeaking() }) {
                                Text("Stop")
                            }
                        }
                    }
                }
            }
        }

        // CRITICAL ERRORS (KESALAHAN FATAL)
        if (ev.criticalErrors.isNotEmpty()) {
            SectionBox(
                title = "🚨 Kesalahan Fatal B2G (Hindari Bicara Seperti Ini):",
                items = ev.criticalErrors,
                bgColor = GlassColors.Coral.copy(alpha = 0.12f),
                textColor = GlassColors.Coral,
            )
        }

        // WEAKNESSES (KEKURANGAN SALES)
        if (ev.weaknesses.isNotEmpty()) {
            SectionBox(
                title = "🔴 Hal yang Harus Diperbaiki:",
                items = ev.weaknesses,
                bgColor = Color(0xFFFFF3E0),
                textColor = Color(0xFFE65100),
            )
        }

        // STRENGTHS (POIN POSITIF)
        if (ev.strengths.isNotEmpty()) {
            SectionBox(
                title = "🟢 Poin yang Sudah Baik:",
                items = ev.strengths,
                bgColor = GlassColors.Emerald.copy(alpha = 0.12f),
                textColor = Color(0xFF1B5E20),
            )
        }

        // PENILAIAN PER RUBRIK
        Text(
            "📊 Detail Penilaian Indikator Kompetensi",
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.Bold,
            color = GlassColors.TextDark
        )

        ev.competencies.forEach { c ->
            Card(
                Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(12.dp),
                colors = CardDefaults.cardColors(containerColor = Color.White),
            ) {
                Column(Modifier.padding(14.dp)) {
                    Row(
                        Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                    ) {
                        Text(
                            c.competency.replace('_', ' ').uppercase(),
                            style = MaterialTheme.typography.bodyMedium,
                            fontWeight = FontWeight.Bold,
                            color = GlassColors.TextDark,
                            modifier = Modifier.weight(1f),
                        )
                        Text(
                            "${c.score}",
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.Bold,
                            color = when {
                                c.score >= 75 -> GlassColors.Emerald
                                c.score >= 50 -> Color(0xFFF57C00)
                                else -> GlassColors.Coral
                            },
                        )
                    }
                    Text(
                        "Bobot ${c.weight}% · Kontribusi ${c.weighted} poin",
                        style = MaterialTheme.typography.labelSmall,
                        color = GlassColors.TextMuted,
                    )
                    if (c.evidence.isNotBlank()) {
                        Spacer(Modifier.height(6.dp))
                        Text(
                            "Kutipan Bukti: ${c.evidence}",
                            style = MaterialTheme.typography.bodySmall,
                            color = GlassColors.TextMuted,
                        )
                    }
                }
            }
        }

        Spacer(Modifier.height(10.dp))
        Button(
            onClick = {
                stopSpeaking()
                onRetry()
            },
            shape = GlassShapes.button,
            colors = ButtonDefaults.buttonColors(
                containerColor = GlassColors.Amber,
                contentColor = GlassColors.TextDark,
            ),
            modifier = Modifier.fillMaxWidth().height(50.dp),
        ) {
            Text(
                if (ev.passed) "Latihan Ulang (Asah Lagi)" else "🔄 Latih Ulang dengan Skrip yang Benar",
                style = MaterialTheme.typography.labelLarge,
                fontWeight = FontWeight.Bold,
            )
        }

        OutlinedButton(
            onClick = {
                stopSpeaking()
                onBackToDashboard()
            },
            shape = GlassShapes.button,
            modifier = Modifier.fillMaxWidth().height(50.dp),
        ) {
            Text("Kembali ke Daftar Modul", style = MaterialTheme.typography.labelLarge)
        }
        Spacer(Modifier.height(20.dp))
    }
}

@Composable
private fun SectionBox(
    title: String,
    items: List<String>,
    bgColor: Color,
    textColor: Color,
) {
    Card(
        Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(12.dp),
        colors = CardDefaults.cardColors(containerColor = bgColor),
    ) {
        Column(Modifier.padding(14.dp)) {
            Text(title, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold, color = textColor)
            Spacer(Modifier.height(6.dp))
            items.forEach { s ->
                Row(Modifier.fillMaxWidth().padding(vertical = 3.dp)) {
                    Text("• ", color = textColor, fontWeight = FontWeight.Bold)
                    Text(s, style = MaterialTheme.typography.bodySmall, color = GlassColors.TextDark, modifier = Modifier.weight(1f))
                }
            }
        }
    }
}
