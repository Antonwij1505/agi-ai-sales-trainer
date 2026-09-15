package com.astongraphindo.agitrainer

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.astongraphindo.agitrainer.ui.theme.AGITrainerTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            AGITrainerTheme {
                Scaffold(modifier = Modifier.fillMaxSize()) { inner ->
                    Placeholder(
                        modifier = Modifier
                            .fillMaxSize()
                            .padding(inner),
                    )
                }
            }
        }
    }
}

/**
 * Temporary landing screen — proves the toolchain, theme and Compose setup
 * build. Stage 9 replaces this with Login → Dashboard → LiveSession flow.
 */
@Composable
private fun Placeholder(modifier: Modifier = Modifier) {
    Column(
        modifier = modifier.padding(24.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp, Alignment.CenterVertically),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(
            text = "AGI AI Sales Trainer",
            style = MaterialTheme.typography.headlineMedium,
        )
        Text(
            text = "Latihan telemarketing dengan AI",
            style = MaterialTheme.typography.bodyMedium,
        )
        Text(
            text = "Backend: ${BuildConfig.API_BASE_URL}",
            style = MaterialTheme.typography.bodySmall,
        )
    }
}
