package com.astongraphindo.agitrainer.ui.theme

import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Shapes
import androidx.compose.ui.unit.dp

/**
 * Corner radii taken from the reference design.
 *
 * The large card radius is the single most recognisable part of the look, so it is
 * defined once here rather than repeated as a literal in every screen.
 */
object GlassShapes {
    /** Main cards — 28dp in the reference. */
    val card = RoundedCornerShape(28.dp)

    /** Buttons are fully rounded pills. */
    val button = RoundedCornerShape(50)

    /** Text fields. */
    val field = RoundedCornerShape(16.dp)

    /** Small icon tiles. */
    val icon = RoundedCornerShape(12.dp)

    /** Chips / pills inside content. */
    val chip = RoundedCornerShape(50)

    /** Chat bubbles: rounded, but with one corner tightened to show direction. */
    val bubbleFromMe = RoundedCornerShape(20.dp, 20.dp, 6.dp, 20.dp)
    val bubbleFromThem = RoundedCornerShape(20.dp, 20.dp, 20.dp, 6.dp)
}

/** Material shape slots, so default components inherit the same radii. */
val AGIShapes = Shapes(
    extraSmall = RoundedCornerShape(12.dp),
    small = RoundedCornerShape(16.dp),
    medium = RoundedCornerShape(20.dp),
    large = GlassShapes.card,
    extraLarge = RoundedCornerShape(32.dp),
)
