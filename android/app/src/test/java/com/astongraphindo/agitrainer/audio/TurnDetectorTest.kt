package com.astongraphindo.agitrainer.audio

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Regression tests for the turn boundary.
 *
 * These exist because of a real field report: the customer interrupted the rep
 * after only a brief pause. The fix is a threshold, and thresholds silently drift
 * back if nothing pins them — so the behaviour is asserted here with the measured
 * speech rhythm rather than a magic number.
 *
 * Runs as a plain JVM test (no device, no microphone).
 */
class TurnDetectorTest {

    private val speech = 5_000.0 // comfortably above the threshold
    private val quiet = 10.0     // room noise, well below

    @Test
    fun `does not end the turn during a natural mid-sentence pause`() {
        // A person thinking mid-sentence pauses LONGER than a TTS voice does.
        // Measured TTS pauses reach 1.07s; a human "baru jeda dikit" is easily
        // 1.5-2.0s. The old 1.2s threshold cut in here — that is the reported bug.
        //
        // NOTE: this must use a pause LONGER than the old threshold, otherwise it
        // passes under both the buggy and the fixed code and guards nothing.
        val d = TurnDetector()
        assertFalse("harus ada suara dulu", d.onFrame(speech, 500))
        var ended = false
        repeat(18) { // 1.8s of silence, in 100ms steps
            if (d.onFrame(quiet, 100)) ended = true
        }
        assertFalse(
            "jeda 1.8s (manusia berpikir) tidak boleh mengakhiri giliran — " +
                "dengan ambang lama 1.2s ini akan terpotong",
            ended,
        )
    }

    @Test
    fun `would have caught the old 1200ms threshold`() {
        // Explicit guard: build a detector with the OLD value and show the same
        // 1.8s pause DOES end the turn. This documents why the value was raised and
        // fails loudly if anyone reintroduces it.
        val old = TurnDetector(silenceHoldMs = 1_200L)
        old.onFrame(speech, 500)
        var ended = false
        repeat(18) { if (old.onFrame(quiet, 100)) ended = true }
        assertTrue("ambang lama memang memotong di jeda 1.8s", ended)
    }

    @Test
    fun `ends the turn after a genuine pause`() {
        val d = TurnDetector()
        d.onFrame(speech, 800)
        var ended = false
        // 2.6s of silence: beyond the 2.5s hold.
        repeat(26) { if (d.onFrame(quiet, 100)) ended = true }
        assertTrue("jeda 2.6s harus mengakhiri giliran", ended)
    }

    @Test
    fun `silence before any speech does not end the turn`() {
        // The rep may open the app and stay quiet; that must not count as a turn.
        val d = TurnDetector()
        var ended = false
        repeat(60) { if (d.onFrame(quiet, 100)) ended = true }
        assertFalse("hening sebelum bicara bukan akhir giliran", ended)
        assertFalse(d.speechDetected)
    }

    @Test
    fun `a new sound resets the silence counter`() {
        val d = TurnDetector()
        d.onFrame(speech, 500)
        repeat(20) { d.onFrame(quiet, 100) } // 2.0s quiet — not yet a turn end
        assertFalse(d.onFrame(speech, 200))  // rep starts again
        var ended = false
        repeat(20) { if (d.onFrame(quiet, 100)) ended = true } // another 2.0s
        assertFalse("penghitung harus tereset setelah ada suara baru", ended)
    }

    @Test
    fun `caps a runaway capture`() {
        // Someone leaves the phone recording; capture must not grow without bound.
        val d = TurnDetector()
        var ended = false
        repeat(700) { if (d.onFrame(speech, 100)) ended = true } // 70s of continuous speech
        assertTrue("capture harus berhenti di batas maksimum", ended)
    }

    @Test
    fun `threshold matches the documented value`() {
        // Guards against a silent revert to the 1.2s value that caused the report.
        assertTrue(
            "ambang harus >= 2s agar jeda alami tidak memotong",
            TurnDetector.DEFAULT_SILENCE_HOLD_MS >= 2_000L,
        )
    }
}
