package com.astongraphindo.agitrainer.ui.screens

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
import androidx.compose.material3.Card
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.astongraphindo.agitrainer.data.HistoryEntry
import com.astongraphindo.agitrainer.data.ProgressEntry

/** Progress + attempt history (PRD §57). */
@Composable
fun ProgressScreen(
    progress: List<ProgressEntry>,
    history: List<HistoryEntry>,
    loading: Boolean,
    error: String?,
    onLoad: () -> Unit,
) {
    LaunchedEffect(Unit) { onLoad() }

    if (loading && progress.isEmpty() && history.isEmpty()) {
        Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
        return
    }

    LazyColumn(
        Modifier.fillMaxSize(),
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        error?.let {
            item { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) }
        }

        if (progress.isEmpty()) {
            item {
                Text(
                    "Belum ada penilaian. Selesaikan satu latihan untuk melihat progres.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }

        items(progress.size) { i ->
            val p = progress[i]
            Card(Modifier.fillMaxWidth(), shape = RoundedCornerShape(14.dp)) {
                Column(Modifier.padding(16.dp)) {
                    Row(
                        Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Column(Modifier.weight(1f)) {
                            Text(p.moduleCode, style = MaterialTheme.typography.labelSmall)
                            Text(p.moduleName, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
                        }
                        Text(
                            if (p.passStatus == "passed") "LULUS" else "BELUM",
                            style = MaterialTheme.typography.labelMedium,
                            fontWeight = FontWeight.Bold,
                            color = if (p.passStatus == "passed") {
                                MaterialTheme.colorScheme.primary
                            } else {
                                MaterialTheme.colorScheme.error
                            },
                        )
                    }

                    Spacer(Modifier.height(10.dp))
                    p.latestScore?.let { latest ->
                        LinearProgressIndicator(
                            progress = { (latest / 100f).coerceIn(0f, 1f) },
                            modifier = Modifier.fillMaxWidth(),
                        )
                        Spacer(Modifier.height(6.dp))
                    }

                    Text(
                        buildString {
                            append("Terakhir: ${p.latestScore ?: "-"} / 100")
                            append(" · Tertinggi: ${p.highestScore ?: "-"}")
                            append(" · Percobaan: ${p.attempts}x")
                            p.improvement?.let {
                                append(" · Perubahan: ")
                                append(if (it >= 0) "+$it" else "$it")
                            }
                        },
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        }

        if (history.isNotEmpty()) {
            item {
                Text(
                    "Riwayat Percobaan",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.SemiBold,
                    modifier = Modifier.padding(top = 8.dp),
                )
            }
            items(history.size) { i ->
                val h = history[i]
                Row(
                    Modifier.fillMaxWidth().padding(vertical = 6.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                ) {
                    Column(Modifier.weight(1f)) {
                        Text(h.scenarioName, style = MaterialTheme.typography.bodySmall, maxLines = 1)
                        Text(
                            "${h.moduleCode} · percobaan ${h.attempt} · ${h.evalStatus}",
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                    Text(
                        h.overallScore?.let { "$it" } ?: "—",
                        style = MaterialTheme.typography.titleSmall,
                        fontWeight = FontWeight.SemiBold,
                        color = when {
                            h.passed == true -> MaterialTheme.colorScheme.primary
                            h.overallScore != null -> MaterialTheme.colorScheme.error
                            else -> MaterialTheme.colorScheme.onSurfaceVariant
                        },
                    )
                }
            }
        }
    }
}
