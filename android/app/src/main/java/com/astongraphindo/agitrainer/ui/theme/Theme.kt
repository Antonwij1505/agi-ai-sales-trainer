package com.astongraphindo.agitrainer.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

/**
 * App theme — "glass gradient" look.
 *
 * The reference design is a light theme: an off-white page with soft blue blobs and
 * frosted white cards over a blue→cyan gradient. The brand blue is kept as the
 * primary so ORIMAX identity survives, but its tone is shifted toward the reference
 * (#0081FF) rather than the previous darker #0B4DA2.
 *
 * Dark mode is still supported because Android users expect it; the gradient and
 * glass values are defined for light, and dark mode falls back to a sensible dark
 * scheme rather than trying to fake glass on black.
 */

// ORIMAX identity, tuned to the reference gradient.
private val BrandBlue = Color(0xFF0081FF)
private val BrandCyan = Color(0xFF00D2FF)
private val BrandDeep = Color(0xFF0B4DA2)
private val BrandGreen = Color(0xFF2AF598)

private val LightColors = lightColorScheme(
    primary = BrandBlue,
    onPrimary = Color.White,
    primaryContainer = Color(0xFFD6EBFF),
    onPrimaryContainer = Color(0xFF00325B),
    secondary = BrandCyan,
    onSecondary = Color.White,
    secondaryContainer = Color(0xFFD9F6FF),
    onSecondaryContainer = Color(0xFF00363F),
    tertiary = BrandGreen,
    onTertiary = Color(0xFF00391F),
    // Surfaces are translucent-friendly: cards layer their own fill on top.
    background = GlassColors.Background,
    onBackground = GlassColors.TextDark,
    surface = Color.White,
    onSurface = GlassColors.TextDark,
    surfaceVariant = Color(0xFFEDF2F9),
    onSurfaceVariant = GlassColors.TextMuted,
    outline = Color(0xFFB8C4D6),
    error = Color(0xFFD92D20),
    onError = Color.White,
)

private val DarkColors = darkColorScheme(
    primary = BrandCyan,
    onPrimary = Color(0xFF003544),
    primaryContainer = Color(0xFF00506B),
    onPrimaryContainer = Color(0xFFD9F6FF),
    secondary = BrandBlue,
    onSecondary = Color.White,
    tertiary = BrandGreen,
    onTertiary = Color(0xFF00391F),
    background = Color(0xFF0B1220),
    onBackground = Color(0xFFE6EDF7),
    surface = Color(0xFF131C2B),
    onSurface = Color(0xFFE6EDF7),
    surfaceVariant = Color(0xFF1C2739),
    onSurfaceVariant = Color(0xFFA7B4C7),
    outline = Color(0xFF3A4759),
    error = Color(0xFFFF6B6B),
    onError = Color(0xFF3A0000),
)

@Composable
fun AGITrainerTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit,
) {
    MaterialTheme(
        colorScheme = if (darkTheme) DarkColors else LightColors,
        typography = AGITypography,
        shapes = AGIShapes,
        content = content,
    )
}

/** Convenience for code that needs the brand gradient outside a composable. */
object Brand {
    val gradientStart = BrandBlue
    val gradientEnd = BrandCyan
    val deep = BrandDeep
    val success = BrandGreen
}
