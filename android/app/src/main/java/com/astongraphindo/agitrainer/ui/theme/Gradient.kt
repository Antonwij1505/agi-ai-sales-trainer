package com.astongraphindo.agitrainer.ui.theme

import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color

/** Reusable gradients. */
object GlassGradients {
    val primary = Brush.linearGradient(listOf(GlassColors.BlueStart, GlassColors.BlueEnd))
    val success = Brush.linearGradient(listOf(GlassColors.CyanStart, GlassColors.GreenEnd))
    val background = Brush.linearGradient(
        listOf(GlassColors.Background, Color(0xFFEFF4FB)),
    )
}
