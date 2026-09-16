package com.astongraphindo.agitrainer.ui.theme

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

/**
 * Frosted-glass surface.
 *
 * WHY THIS IS AN APPROXIMATION, NOT A TRUE BACKDROP BLUR
 * -----------------------------------------------------
 * The reference design uses CSS `backdrop-filter: blur(15px)`, which blurs whatever
 * sits BEHIND the element. Compose has no equivalent: `Modifier.blur()` blurs the
 * element's own content. A true backdrop blur needs either a RenderEffect against a
 * captured backdrop (API 31+, and fiddly) or a custom shader.
 *
 * The visual result is still very close here because the backdrop is a smooth
 * gradient, not a photo — there is no detail behind the card for a blur to remove.
 * What sells the glass in the reference is really the translucent white fill, the
 * hairline border, and the soft shadow, and all three are reproduced exactly.
 *
 * If a future screen puts busy content behind a card and the effect looks flat,
 * that is the moment to reach for `Modifier.blur()` on the backdrop or a RenderEffect
 * — not before.
 */
@Composable
fun GlassCard(
    modifier: Modifier = Modifier,
    shape: Shape = GlassShapes.card,
    /** Stronger fill for cards that sit on the pale background instead of on the gradient. */
    strong: Boolean = false,
    /** Adds a diagonal highlight, imitating light catching the top-left edge. */
    sheen: Boolean = true,
    elevation: Dp = 18.dp,
    content: @Composable BoxScope.() -> Unit,
) {
    val fill = if (strong) GlassColors.GlassFillStrong else GlassColors.GlassFill
    val border = if (strong) GlassColors.GlassBorderOnLight else GlassColors.GlassBorder

    Box(
        modifier = modifier
            // Shadow before clip: clipping first would cut the shadow off.
            .shadow(
                elevation = elevation,
                shape = shape,
                ambientColor = GlassColors.ShadowTint,
                spotColor = GlassColors.ShadowTint,
            )
            .clip(shape)
            .background(fill)
            .then(
                if (sheen) {
                    Modifier.background(
                        Brush.linearGradient(
                            listOf(Color(0x33FFFFFF), Color(0x00FFFFFF)),
                        ),
                    )
                } else {
                    Modifier
                },
            )
            .border(1.dp, border, shape),
        content = content,
    )
}

/**
 * Page background: off-white base with soft colour blobs.
 *
 * The blobs are painted as radial gradients at very low alpha. They give the glass
 * cards something to sit on — on a flat background the translucency is invisible.
 */
@Composable
fun GlassBackground(
    modifier: Modifier = Modifier,
    content: @Composable BoxScope.() -> Unit,
) {
    Box(
        modifier = modifier
            .fillMaxSize()
            .background(GlassGradients.background),
    ) {
        // Decorative blobs. Purely visual, so they are behind everything and
        // excluded from semantics by having no content.
        Box(
            Modifier
                .fillMaxSize()
                .background(
                    Brush.radialGradient(
                        colors = listOf(GlassColors.BlobBlue, Color.Transparent),
                        radius = 900f,
                    ),
                ),
        )
        Box(
            Modifier
                .fillMaxSize()
                .background(
                    Brush.radialGradient(
                        colors = listOf(GlassColors.BlobCyan, Color.Transparent),
                        center = androidx.compose.ui.geometry.Offset(1100f, 1900f),
                        radius = 800f,
                    ),
                ),
        )
        Box(
            Modifier
                .fillMaxSize()
                .background(
                    Brush.radialGradient(
                        colors = listOf(GlassColors.BlobGreen, Color.Transparent),
                        center = androidx.compose.ui.geometry.Offset(200f, 2300f),
                        radius = 700f,
                    ),
                ),
        )
        content()
    }
}

/** A pill-shaped button surface filled with the primary gradient. */
@Composable
fun GradientButtonSurface(
    modifier: Modifier = Modifier,
    shape: Shape = GlassShapes.button,
    brush: Brush = GlassGradients.primary,
    content: @Composable BoxScope.() -> Unit,
) {
    Surface(
        modifier = modifier,
        shape = shape,
        color = Color.Transparent,
    ) {
        Box(
            Modifier
                .background(brush)
                .then(Modifier),
            contentAlignment = androidx.compose.ui.Alignment.Center,
            content = content,
        )
    }
}
