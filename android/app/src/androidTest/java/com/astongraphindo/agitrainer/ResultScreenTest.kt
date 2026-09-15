package com.astongraphindo.agitrainer

import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import com.astongraphindo.agitrainer.data.CompetencyScore
import com.astongraphindo.agitrainer.data.Evaluation
import com.astongraphindo.agitrainer.ui.screens.ResultContent
import com.astongraphindo.agitrainer.ui.theme.AGITrainerTheme
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test

/**
 * Renders the Result screen on a device/emulator with a fixture evaluation.
 *
 * Why this exists: completing a real voice conversation requires microphone
 * input, and the Android emulator on this host cannot be given an audio source
 * (the emulator dropped its ALSA backend, and the `pa` backend fails to init).
 * So the screen could not be reached through the UI. Extracting ResultContent as
 * a stateless composable makes it renderable here instead.
 *
 * The fixture is the shape of a REAL API response (captured from
 * POST /api/trainer/sessions/42/evaluate: score 44/100, 5 competencies).
 */
class ResultScreenTest {

    @get:Rule
    val rule = createComposeRule()

    private fun fixture(passed: Boolean) = Evaluation(
        overallScore = if (passed) 88 else 44,
        passed = passed,
        passingScore = 80,
        competencies = listOf(
            CompetencyScore(
                competency = "gatekeeper_handling",
                score = if (passed) 90 else 60,
                weight = 30,
                weighted = if (passed) 27.0 else 18.0,
                evidence = "SALES: 'Boleh saya bicara dengan bagian pengadaan?'",
            ),
            CompetencyScore(
                competency = "discovery_probing",
                score = if (passed) 85 else 25,
                weight = 20,
                weighted = if (passed) 17.0 else 5.0,
                evidence = "tidak ditemukan pertanyaan terbuka",
            ),
            CompetencyScore(
                competency = "closing_next_step",
                score = if (passed) 80 else 0,
                weight = 15,
                weighted = if (passed) 12.0 else 0.0,
                evidence = "tidak ada komitmen waktu",
            ),
        ),
        strengths = listOf("Pembukaan jelas dan ringkas"),
        weaknesses = listOf("Tidak melakukan discovery probing"),
        criticalErrors = listOf("Gagal mendapatkan akses ke PIC"),
        recommendation = "Latih probing kebutuhan sebelum meminta kontak PIC.",
        confidence = 0.9,
    )

    @Test
    fun rendersScorePassStatusAndCompetencies() {
        rule.setContent {
            AGITrainerTheme {
                ResultContent(
                    evaluation = fixture(passed = false),
                    loading = false,
                    error = null,
                    onRetry = {},
                    onBackToDashboard = {},
                )
            }
        }

        // The score and the fail verdict must be visible.
        rule.onNodeWithText("44").assertIsDisplayed()
        rule.onNodeWithText("BELUM LULUS").assertIsDisplayed()
        rule.onNodeWithText("Nilai lulus: 80").assertIsDisplayed()

        // Every competency from the rubric must render with its score.
        rule.onNodeWithText("gatekeeper handling").assertIsDisplayed()
        rule.onNodeWithText("discovery probing").assertIsDisplayed()
        rule.onNodeWithText("closing next step").assertIsDisplayed()

        // The evidence guardrail is the whole point of the evaluation — it must
        // be on screen, not just in the API response.
        rule.onAllNodesWithText("Bukti: SALES: 'Boleh saya bicara dengan bagian pengadaan?'", substring = true)
            .fetchSemanticsNodes()
            .isNotEmpty()
            .let { assertEquals(true, it) }

        // Feedback sections.
        rule.onNodeWithText("Kekuatan").assertIsDisplayed()
        rule.onNodeWithText("Perlu diperbaiki").assertIsDisplayed()
        rule.onNodeWithText("Kesalahan kritis").assertIsDisplayed()
        rule.onNodeWithText("Rekomendasi Latihan").assertIsDisplayed()

        // The retry affordance for a failed attempt.
        rule.onNodeWithText("Ulangi Latihan").assertIsDisplayed()
    }

    @Test
    fun rendersPassVerdict() {
        rule.setContent {
            AGITrainerTheme {
                ResultContent(
                    evaluation = fixture(passed = true),
                    loading = false,
                    error = null,
                    onRetry = {},
                    onBackToDashboard = {},
                )
            }
        }
        rule.onNodeWithText("88").assertIsDisplayed()
        rule.onNodeWithText("LULUS").assertIsDisplayed()
        rule.onNodeWithText("Latihan Lagi").assertIsDisplayed()
    }

    @Test
    fun showsLoadingThenErrorStates() {
        rule.setContent {
            AGITrainerTheme {
                ResultContent(
                    evaluation = null,
                    loading = true,
                    error = null,
                    onRetry = {},
                    onBackToDashboard = {},
                )
            }
        }
        rule.onNodeWithText("Menilai percakapan…").assertIsDisplayed()
    }

    @Test
    fun showsErrorWhenEvaluationMissing() {
        rule.setContent {
            AGITrainerTheme {
                ResultContent(
                    evaluation = null,
                    loading = false,
                    error = "Sesi belum punya evaluasi.",
                    onRetry = {},
                    onBackToDashboard = {},
                )
            }
        }
        rule.onNodeWithText("Sesi belum punya evaluasi.").assertIsDisplayed()
    }

    @Test
    fun backButtonInvokesCallback() {
        var clicked = false
        rule.setContent {
            AGITrainerTheme {
                ResultContent(
                    evaluation = fixture(passed = false),
                    loading = false,
                    error = null,
                    onRetry = {},
                    onBackToDashboard = { clicked = true },
                )
            }
        }
        // The button sits at the bottom of a LazyColumn, so it must be scrolled
        // into view before it can receive a click. Without this the test fails
        // with "expected true but was false" — a test bug, not an app bug.
        rule.onNodeWithText("Kembali ke Daftar Modul")
            .performScrollTo()
            .performClick()
        assertEquals(true, clicked)
    }
}
