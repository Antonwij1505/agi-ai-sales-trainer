package com.astongraphindo.agitrainer.ui.screens

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
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.astongraphindo.agitrainer.data.Evaluation
import com.astongraphindo.agitrainer.data.TrainerApi

/**
 * Result + feedback screen (PRD §39–§49).
 *
 * Evaluation runs on entry (idempotent server-side, so re-entering is free) and
 * shows the score, the pass/fail against the module's passing score, every
 * competency with its evidence quote, and the recommended next step.
 */
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

    if (loading) {
        Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                CircularProgressIndicator()
                Spacer(Modifier.height(12.dp))
                Text("Menilai percakapan…", style = MaterialTheme.typography.bodyMedium)
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

    LazyColumn(
        Modifier.fillMaxSize(),
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item {
            Box(
                Modifier
                    .fillMaxWidth()
                    .background(
                        if (ev.passed) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.error,
                        RoundedCornerShape(16.dp),
                    )
                    .padding(20.dp),
            ) {
                Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.fillMaxWidth()) {
                    Text(
                        "${ev.overallScore}",
                        style = MaterialTheme.typography.displayMedium,
                        fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.onPrimary,
                    )
                    Text(
                        if (ev.passed) "LULUS" else "BELUM LULUS",
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.SemiBold,
                        color = MaterialTheme.colorScheme.onPrimary,
                    )
                    Text(
                        "Nilai lulus: ${ev.passingScore}",
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onPrimary,
                    )
                }
            }
        }

        item {
            Text("Penilaian per Kompetensi", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
        }

        items(ev.competencies.size) { i ->
            val c = ev.competencies[i]
            Card(Modifier.fillMaxWidth(), shape = RoundedCornerShape(12.dp)) {
                Column(Modifier.padding(14.dp)) {
                    Row(
                        Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                    ) {
                        Text(
                            c.competency.replace('_', ' '),
                            style = MaterialTheme.typography.bodyMedium,
                            fontWeight = FontWeight.SemiBold,
                            modifier = Modifier.weight(1f),
                        )
                        Text(
                            "${c.score}",
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.Bold,
                            color = when {
                                c.score >= 80 -> MaterialTheme.colorScheme.primary
                                c.score >= 50 -> MaterialTheme.colorScheme.tertiary
                                else -> MaterialTheme.colorScheme.error
                            },
                        )
                    }
                    Text(
                        "bobot ${c.weight}% · kontribusi ${c.weighted}",
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    Spacer(Modifier.height(6.dp))
                    Text(
                        "Bukti: ${c.evidence}",
                        style = MaterialTheme.typography.bodySmall,
                    )
                }
            }
        }

        if (ev.strengths.isNotEmpty()) {
            item { SectionList("Kekuatan", ev.strengths, MaterialTheme.colorScheme.primary) }
        }
        if (ev.weaknesses.isNotEmpty()) {
            item { SectionList("Perlu diperbaiki", ev.weaknesses, MaterialTheme.colorScheme.tertiary) }
        }
        if (ev.criticalErrors.isNotEmpty()) {
            item { SectionList("Kesalahan kritis", ev.criticalErrors, MaterialTheme.colorScheme.error) }
        }

        if (ev.recommendation.isNotBlank()) {
            item {
                Card(Modifier.fillMaxWidth(), shape = RoundedCornerShape(12.dp)) {
                    Column(Modifier.padding(14.dp)) {
                        Text("Rekomendasi Latihan", fontWeight = FontWeight.SemiBold)
                        Spacer(Modifier.height(6.dp))
                        Text(ev.recommendation, style = MaterialTheme.typography.bodySmall)
                    }
                }
            }
        }

        item {
            Spacer(Modifier.height(4.dp))
            Button(onClick = onRetry, modifier = Modifier.fillMaxWidth()) {
                Text(if (ev.passed) "Latihan Lagi" else "Ulangi Latihan")
            }
            Spacer(Modifier.height(8.dp))
            Button(onClick = onBackToDashboard, modifier = Modifier.fillMaxWidth()) {
                Text("Kembali ke Daftar Modul")
            }
        }
    }
}

@Composable
private fun SectionList(title: String, items: List<String>, color: androidx.compose.ui.graphics.Color) {
    Column(Modifier.fillMaxWidth()) {
        Text(title, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold, color = color)
        Spacer(Modifier.height(4.dp))
        items.forEach { s ->
            Row(Modifier.fillMaxWidth().padding(vertical = 2.dp)) {
                Text("•  ", color = color)
                Text(s, style = MaterialTheme.typography.bodySmall, modifier = Modifier.weight(1f))
            }
        }
    }
}
