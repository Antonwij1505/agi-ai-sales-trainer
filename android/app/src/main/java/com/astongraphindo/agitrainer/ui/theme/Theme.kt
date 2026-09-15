package com.astongraphindo.agitrainer.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

// ORIMAX corporate blue.
private val BrandBlue = Color(0xFF0B4DA2)
private val BrandBlueDark = Color(0xFF062E63)
private val BrandAccent = Color(0xFF1E88E5)

private val LightColors = lightColorScheme(
    primary = BrandBlue,
    onPrimary = Color.White,
    secondary = BrandAccent,
    onSecondary = Color.White,
)

private val DarkColors = darkColorScheme(
    primary = BrandAccent,
    onPrimary = Color.White,
    secondary = BrandBlueDark,
    onSecondary = Color.White,
)

@Composable
fun AGITrainerTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit,
) {
    MaterialTheme(
        colorScheme = if (darkTheme) DarkColors else LightColors,
        content = content,
    )
}
