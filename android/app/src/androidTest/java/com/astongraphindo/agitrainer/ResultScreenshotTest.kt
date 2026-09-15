package com.astongraphindo.agitrainer

import android.graphics.Bitmap
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.test.captureToImage
import androidx.compose.ui.graphics.asAndroidBitmap
import androidx.test.platform.app.InstrumentationRegistry
import com.astongraphindo.agitrainer.data.CompetencyScore
import com.astongraphindo.agitrainer.data.Evaluation
import com.astongraphindo.agitrainer.ui.screens.ResultContent
import com.astongraphindo.agitrainer.ui.theme.AGITrainerTheme
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import java.io.File

/**
 * Captures a PNG of the Result screen so the rendering can be inspected as an
 * artefact rather than only asserted on.
 *
 * Written to the app's own external files dir, NOT /sdcard/Download: on Android
 * 14 that path is blocked by scoped storage and the write fails with
 * "EACCES (Permission denied)". The app-scoped directory is always writable and
 * is pullable with adb from
 * /sdcard/Android/data/<package>/files/.
 */
class ResultScreenshotTest {

    @get:Rule
    val rule = createComposeRule()

    private val fixture = Evaluation(
        overallScore = 44,
        passed = false,
        passingScore = 80,
        competencies = listOf(
            CompetencyScore(
                "gatekeeper_handling", 60, 30, 18.0,
                "SALES: 'Boleh saya bicara dengan bagian pengadaan?'",
            ),
            CompetencyScore(
                "discovery_probing", 25, 20, 5.0,
                "tidak ditemukan pertanyaan terbuka tentang kebutuhan instansi",
            ),
            CompetencyScore(
                "objection_handling", 40, 20, 8.0,
                "SALES: 'Baik Bu, saya kirim proposalnya via email.'",
            ),
            CompetencyScore(
                "opening_credibility", 85, 15, 12.75,
                "SALES: 'Selamat pagi Bu, saya Ady dari ORIMAX.'",
            ),
            CompetencyScore(
                "closing_next_step", 0, 15, 0.0,
                "tidak ada komitmen waktu konkret",
            ),
        ),
        strengths = listOf(
            "Pembukaan jelas dan ringkas: menyebut nama, perusahaan, dan tujuan.",
            "Nada sopan dan tidak memaksa saat menghadapi gatekeeper.",
        ),
        weaknesses = listOf(
            "Tidak melakukan discovery probing sama sekali.",
            "Tidak mendapatkan nama/jabatan PIC atau komitmen waktu konkret.",
        ),
        criticalErrors = listOf(
            "Gagal mendapatkan akses ke PIC pengadaan.",
        ),
        recommendation = "Perbaiki dengan: (1) probing kebutuhan instansi sebelum meminta kontak, " +
            "(2) tanyakan nama/jabatan PIC serta waktu terbaik untuk follow-up, " +
            "(3) konfirmasi alamat email resmi dan jadwal.",
        confidence = 0.9,
    )

    @Test
    fun captureResultScreen() {
        rule.setContent {
            AGITrainerTheme {
                ResultContent(
                    evaluation = fixture,
                    loading = false,
                    error = null,
                    onRetry = {},
                    onBackToDashboard = {},
                )
            }
        }
        rule.waitForIdle()

        val bitmap = rule.onRoot().captureToImage().asAndroidBitmap()
        val dir = InstrumentationRegistry.getInstrumentation()
            .targetContext.getExternalFilesDir(null)
            ?: error("no external files dir")
        val out = File(dir, "result_screen.png")
        out.outputStream().use { bitmap.compress(Bitmap.CompressFormat.PNG, 100, it) }

        assertTrue("screenshot was not written: $out", out.exists() && out.length() > 0)
        println("SCREENSHOT_PATH=${out.absolutePath}")
    }
}
