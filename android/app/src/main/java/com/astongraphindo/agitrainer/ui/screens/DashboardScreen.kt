package com.astongraphindo.agitrainer.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Card
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
    Column(Modifier.fillMaxSize()) {
        // Header
        Box(
            Modifier
                .fillMaxWidth()
                .background(MaterialTheme.colorScheme.primary)
                .padding(20.dp),
        ) {
            Column {
                Text(
                    "Halo, ${user.namaLengkap.ifBlank { user.username }}",
                    style = MaterialTheme.typography.titleLarge,
                    color = MaterialTheme.colorScheme.onPrimary,
                    fontWeight = FontWeight.SemiBold,
                )
                Text(
                    "Pilih modul latihan untuk mulai",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onPrimary,
                )
            }
        }

        Row(
            Modifier.fillMaxWidth().padding(horizontal = 8.dp),
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
            contentPadding = androidx.compose.foundation.layout.PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            items(modules, key = { it.id }) { m ->
                val p = progress.firstOrNull { it.moduleId == m.id }
                ModuleCard(m, p) { onOpenModule(m.id) }
            }
        }
    }
}

@Composable
private fun ModuleCard(m: TrainingModule, p: ProgressEntry?, onClick: () -> Unit) {
    Card(
        Modifier.fillMaxWidth().clickable { onClick() },
        shape = RoundedCornerShape(14.dp),
    ) {
        Column(Modifier.padding(16.dp)) {
            Row(
                Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column(Modifier.weight(1f)) {
                    Text(m.code, style = MaterialTheme.typography.labelSmall)
                    Text(m.name, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                }
                if (p?.latestScore != null) {
                    Column(horizontalAlignment = Alignment.End) {
                        Text(
                            "${p.latestScore}",
                            style = MaterialTheme.typography.titleLarge,
                            fontWeight = FontWeight.Bold,
                            color = if (p.passStatus == "passed") {
                                MaterialTheme.colorScheme.primary
                            } else {
                                MaterialTheme.colorScheme.error
                            },
                        )
                        Text("nilai terakhir", style = MaterialTheme.typography.labelSmall)
                    }
                }
            }

            m.description?.let {
                Spacer(Modifier.height(6.dp))
                Text(it, style = MaterialTheme.typography.bodySmall, maxLines = 2)
            }

            Spacer(Modifier.height(10.dp))
            Text(
                buildString {
                    append("${m.scenarioCount} skenario")
                    append(" · lulus ≥ ${m.passingScore}")
                    append(" · maks ${m.maxAttempt}x percobaan")
                    if (p != null) append(" · sudah ${p.attempts}x")
                },
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}
