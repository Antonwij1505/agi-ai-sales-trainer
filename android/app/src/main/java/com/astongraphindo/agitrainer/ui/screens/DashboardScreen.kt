package com.astongraphindo.agitrainer.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
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
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.astongraphindo.agitrainer.data.ProgressEntry
import com.astongraphindo.agitrainer.data.TrainingModule
import com.astongraphindo.agitrainer.data.User
import com.astongraphindo.agitrainer.ui.theme.GlassBackground
import com.astongraphindo.agitrainer.ui.theme.GlassCard
import com.astongraphindo.agitrainer.ui.theme.GlassColors
import com.astongraphindo.agitrainer.ui.theme.GlassGradients

/**
 * Dashboard, restyled to the "glass gradient" reference.
 *
 * The header keeps the greeting but now sits on the gradient itself, and each module
 * is a frosted card — matching the reference's product cards.
 */
@Composable
fun DashboardScreen(
    user: User,
    modules: List<TrainingModule>,
    progress: List<ProgressEntry>,
    loading: Boolean,
    error: String?,
    onOpenModule: (Int) -> Unit,
    onOpenProgress: () -> Unit,
    onLogout: () -> Unit,
) {
    GlassBackground {
        Column(Modifier.fillMaxSize()) {
            // ── header on the gradient ───────────────────────────────────────
            Box(
                Modifier
                    .fillMaxWidth()
                    .background(GlassGradients.primary)
                    .padding(horizontal = 24.dp, vertical = 28.dp),
            ) {
                Row(
                    Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    // Avatar badge, like the reference's user chip.
                    Box(
                        Modifier
                            .size(46.dp)
                            .background(GlassColors.GlassBorder, CircleShape),
                        contentAlignment = Alignment.Center,
                    ) {
                        Text(
                            user.namaLengkap.ifBlank { user.username }
                                .firstOrNull()?.uppercase() ?: "?",
                            style = MaterialTheme.typography.titleMedium,
                            color = GlassColors.OnGradient,
                            fontWeight = FontWeight.Bold,
                        )
                    }
                    Spacer(Modifier.size(14.dp))
                    Column(Modifier.weight(1f)) {
                        Text(
                            "Halo, ${user.namaLengkap.ifBlank { user.username }}",
                            style = MaterialTheme.typography.titleLarge,
                            color = GlassColors.OnGradient,
                        )
                        Text(
                            "Pilih modul latihan untuk mulai",
                            style = MaterialTheme.typography.bodySmall,
                            color = GlassColors.OnGradient,
                        )
                    }
                }
            }

            Row(
                Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 4.dp),
                horizontalArrangement = Arrangement.End,
            ) {
                TextButton(onClick = onOpenProgress) { Text("Progres Saya") }
                TextButton(onClick = onLogout) { Text("Keluar") }
            }

            if (loading && modules.isEmpty()) {
                Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator()
                }
                return@Column
            }

            if (error != null) {
                Text(
                    error,
                    color = MaterialTheme.colorScheme.error,
                    modifier = Modifier.padding(20.dp),
                    style = MaterialTheme.typography.bodySmall,
                )
            }

            LazyColumn(
                modifier = Modifier.fillMaxSize(),
                contentPadding = PaddingValues(16.dp),
                verticalArrangement = Arrangement.spacedBy(14.dp),
            ) {
                items(modules, key = { it.id }) { m ->
                    val p = progress.firstOrNull { it.moduleId == m.id }
                    ModuleCard(m, p) { onOpenModule(m.id) }
                }
            }
        }
    }
}

@Composable
private fun ModuleCard(m: TrainingModule, p: ProgressEntry?, onClick: () -> Unit) {
    GlassCard(
        modifier = Modifier.fillMaxWidth().clickable { onClick() },
        strong = true,
    ) {
        Column(Modifier.padding(18.dp)) {
            Row(
                Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column(Modifier.weight(1f)) {
                    // Code as a small gradient chip, mirroring the reference's tags.
                    Box(
                        Modifier
                            .background(GlassGradients.primary, CircleShape)
                            .padding(horizontal = 10.dp, vertical = 3.dp),
                    ) {
                        Text(
                            m.code,
                            style = MaterialTheme.typography.labelSmall,
                            color = GlassColors.OnGradient,
                        )
                    }
                    Spacer(Modifier.height(8.dp))
                    Text(
                        m.name,
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Bold,
                        color = GlassColors.TextDark,
                    )
                }
                if (p?.latestScore != null) {
                    Column(horizontalAlignment = Alignment.End) {
                        Text(
                            "${p.latestScore}",
                            style = MaterialTheme.typography.headlineSmall,
                            fontWeight = FontWeight.Bold,
                            color = if (p.passStatus == "passed") {
                                GlassColors.BlueStart
                            } else {
                                MaterialTheme.colorScheme.error
                            },
                        )
                        Text(
                            "nilai terakhir",
                            style = MaterialTheme.typography.labelSmall,
                            color = GlassColors.TextMuted,
                        )
                    }
                }
            }

            m.description?.let {
                Spacer(Modifier.height(8.dp))
                Text(
                    it,
                    style = MaterialTheme.typography.bodySmall,
                    color = GlassColors.TextMuted,
                    maxLines = 2,
                )
            }

            Spacer(Modifier.height(12.dp))
            Text(
                buildString {
                    append("${m.scenarioCount} skenario")
                    append(" · lulus ≥ ${m.passingScore}")
                    append(" · maks ${m.maxAttempt}x percobaan")
                    if (p != null) append(" · sudah ${p.attempts}x")
                },
                style = MaterialTheme.typography.labelSmall,
                color = GlassColors.TextMuted,
            )
        }
    }
}
