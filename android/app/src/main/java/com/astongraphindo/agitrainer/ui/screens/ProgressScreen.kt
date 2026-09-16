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
import com.astongraphindo.agitrainer.ui.theme.GlassBackground
import com.astongraphindo.agitrainer.ui.theme.GlassCard
import com.astongraphindo.agitrainer.ui.theme.GlassColors

/** Progress + attempt history (PRD §57), in the glass-gradient style. */
@Composable
fun ProgressScreen(
    progress: List<ProgressEntry>,
    history: List<HistoryEntry>,
    loading: Boolean,
    error: String?,
    onLoad: () -> Unit,
) {
    LaunchedEffect(Unit) { onLoad() }

    GlassBackground {
        if (loading && progress.isEmpty() && history.isEmpty()) {
            Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                CircularProgressIndicator()
            }
            return@GlassBackground
        }

        LazyColumn(
            Modifier.fillMaxSize(),
            contentPadding = PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            item {
                Text(
                    "Progres Saya",
                    style = MaterialTheme.typography.headlineSmall,
                    color = GlassColors.TextDark,
                    modifier = Modifier.padding(start = 4.dp, top = 6.dp),
                )
            }

            error?.let {
                item {
                    Text(
                        it,
                        color = MaterialTheme.colorScheme.error,
                        style = MaterialTheme.typography.bodySmall,
                    )
                }
            }

            if (progress.isEmpty()) {
                item {
                    GlassCard(Modifier.fillMaxWidth(), strong = true) {
                        Text(
                            "Belum ada penilaian. Selesaikan satu latihan untuk melihat progres.",
                            style = MaterialTheme.typography.bodyMedium,
                            color = GlassColors.TextMuted,
                            modifier = Modifier.padding(18.dp),
                        )
                    }
                }
            }

            items(progress.size) { i ->
                val p = progress[i]
                GlassCard(Modifier.fillMaxWidth(), strong = true) {
                    Column(Modifier.padding(18.dp)) {
                        Row(
                            Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Column(Modifier.weight(1f)) {
                                Text(
                                    p.moduleCode,
                                    style = MaterialTheme.typography.labelSmall,
                                    color = GlassColors.TextMuted,
                                )
                                Text(
                                    p.moduleName,
                                    style = MaterialTheme.typography.titleSmall,
                                    fontWeight = FontWeight.Bold,
                                    color = GlassColors.TextDark,
                                )
                            }
                            Text(
                                if (p.passStatus == "passed") "LULUS" else "BELUM",
                                style = MaterialTheme.typography.labelMedium,
                                fontWeight = FontWeight.Bold,
                                color = if (p.passStatus == "passed") {
                                    GlassColors.BlueStart
                                } else {
                                    MaterialTheme.colorScheme.error
                                },
                            )
                        }

                        p.latestScore?.let { latest ->
                            Spacer(Modifier.height(12.dp))
                            LinearProgressIndicator(
                                progress = { (latest / 100f).coerceIn(0f, 1f) },
                                modifier = Modifier.fillMaxWidth().height(8.dp),
                                trackColor = GlassColors.GlassBorderOnLight,
                            )
                            Spacer(Modifier.height(8.dp))
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
                            color = GlassColors.TextMuted,
                        )
                    }
                }
            }

            if (history.isNotEmpty()) {
                item {
                    Text(
                        "Riwayat Percobaan",
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Bold,
                        color = GlassColors.TextDark,
                        modifier = Modifier.padding(top = 10.dp, start = 4.dp),
                    )
                }
                items(history.size) { i ->
                    val h = history[i]
                    GlassCard(Modifier.fillMaxWidth(), strong = true, elevation = 10.dp) {
                        Row(
                            Modifier.fillMaxWidth().padding(16.dp),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Column(Modifier.weight(1f)) {
                                Text(
                                    h.scenarioName,
                                    style = MaterialTheme.typography.bodyMedium,
                                    color = GlassColors.TextDark,
                                    maxLines = 1,
                                )
                                Text(
                                    "${h.moduleCode} · percobaan ${h.attempt} · ${h.evalStatus}",
                                    style = MaterialTheme.typography.labelSmall,
                                    color = GlassColors.TextMuted,
                                )
                            }
                            Text(
                                h.overallScore?.let { "$it" } ?: "—",
                                style = MaterialTheme.typography.titleMedium,
                                fontWeight = FontWeight.Bold,
                                color = when {
                                    h.passed == true -> GlassColors.BlueStart
                                    h.overallScore != null -> MaterialTheme.colorScheme.error
                                    else -> GlassColors.TextMuted
                                },
                            )
                        }
                    }
                }
            }
        }
    }
}
