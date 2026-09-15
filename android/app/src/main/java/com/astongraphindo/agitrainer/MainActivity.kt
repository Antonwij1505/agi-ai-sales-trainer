package com.astongraphindo.agitrainer

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Scaffold
import androidx.compose.ui.Modifier
import com.astongraphindo.agitrainer.ui.AppNav
import com.astongraphindo.agitrainer.ui.theme.AGITrainerTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            AGITrainerTheme {
                Scaffold(modifier = Modifier.fillMaxSize()) { inner ->
                    Box(
                        Modifier
                            .fillMaxSize()
                            .padding(inner),
                    ) {
                        AppNav()
                    }
                }
            }
        }
    }
}
