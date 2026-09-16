package com.astongraphindo.agitrainer.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.astongraphindo.agitrainer.ui.theme.GlassBackground
import com.astongraphindo.agitrainer.ui.theme.GlassCard
import com.astongraphindo.agitrainer.ui.theme.GlassColors
import com.astongraphindo.agitrainer.ui.theme.GlassGradients
import com.astongraphindo.agitrainer.ui.theme.GlassShapes

/**
 * Login screen, restyled to the "glass gradient" reference.
 *
 * The layout follows the reference's sign-in screen: a circular brand mark, a title
 * and subtitle, then the fields and a pill button on a frosted card.
 */
@Composable
fun LoginScreen(
    loading: Boolean,
    error: String?,
    onLogin: (String, String) -> Unit,
) {
    var username by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }

    GlassBackground {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(24.dp),
            verticalArrangement = Arrangement.Center,
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            // Brand mark — a gradient circle, like the reference's avatar badge.
            Box(
                Modifier
                    .size(84.dp)
                    .background(GlassGradients.primary, CircleShape),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    "AGI",
                    style = MaterialTheme.typography.titleLarge,
                    fontWeight = FontWeight.Bold,
                    color = GlassColors.OnGradient,
                )
            }

            Spacer(Modifier.height(18.dp))
            Text(
                "AGI AI Sales Trainer",
                style = MaterialTheme.typography.headlineSmall,
                color = GlassColors.TextDark,
                textAlign = TextAlign.Center,
            )
            Spacer(Modifier.height(6.dp))
            Text(
                "Latihan telemarketing dengan AI",
                style = MaterialTheme.typography.bodyMedium,
                color = GlassColors.TextMuted,
                textAlign = TextAlign.Center,
            )
            Spacer(Modifier.height(28.dp))

            GlassCard(Modifier.fillMaxWidth(), strong = true) {
                Column(
                    Modifier.padding(22.dp),
                    verticalArrangement = Arrangement.spacedBy(14.dp),
                ) {
                    Text(
                        "Masuk",
                        style = MaterialTheme.typography.titleMedium,
                        color = GlassColors.TextDark,
                    )

                    OutlinedTextField(
                        value = username,
                        onValueChange = { username = it },
                        label = { Text("Username") },
                        singleLine = true,
                        enabled = !loading,
                        shape = GlassShapes.field,
                        colors = OutlinedTextFieldDefaults.colors(
                            focusedContainerColor = GlassColors.GlassFillStrong,
                            unfocusedContainerColor = GlassColors.GlassFillStrong,
                        ),
                        modifier = Modifier.fillMaxWidth(),
                        keyboardOptions = KeyboardOptions(imeAction = ImeAction.Next),
                    )

                    OutlinedTextField(
                        value = password,
                        onValueChange = { password = it },
                        label = { Text("Password") },
                        singleLine = true,
                        enabled = !loading,
                        shape = GlassShapes.field,
                        colors = OutlinedTextFieldDefaults.colors(
                            focusedContainerColor = GlassColors.GlassFillStrong,
                            unfocusedContainerColor = GlassColors.GlassFillStrong,
                        ),
                        visualTransformation = PasswordVisualTransformation(),
                        modifier = Modifier.fillMaxWidth(),
                        keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done),
                    )

                    if (error != null) {
                        Text(
                            error,
                            color = MaterialTheme.colorScheme.error,
                            style = MaterialTheme.typography.bodySmall,
                        )
                    }

                    Spacer(Modifier.height(2.dp))
                    Button(
                        onClick = { onLogin(username, password) },
                        enabled = !loading,
                        shape = GlassShapes.button,
                        colors = ButtonDefaults.buttonColors(
                            containerColor = GlassColors.BlueStart,
                            contentColor = GlassColors.OnGradient,
                        ),
                        modifier = Modifier.fillMaxWidth().height(52.dp),
                    ) {
                        if (loading) {
                            CircularProgressIndicator(
                                modifier = Modifier.size(20.dp),
                                strokeWidth = 2.dp,
                                color = GlassColors.OnGradient,
                            )
                        } else {
                            Text("Masuk", style = MaterialTheme.typography.labelLarge)
                        }
                    }
                }
            }
        }
    }
}
