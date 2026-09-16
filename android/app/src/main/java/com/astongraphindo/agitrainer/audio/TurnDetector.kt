package com.astongraphindo.agitrainer.audio

/**
 * Decides when the sales rep has finished a turn.
 *
 * Extracted from [StreamingRecorder] so the rule can be unit-tested without a
 * microphone — this host's emulator cannot accept audio input, so logic buried in
 * the capture loop would otherwise never be covered.
 *
 * WHY THIS EXISTS
 * A field report said the customer kept cutting in: "baru jeda dikit" (only a short
 * pause). The cause was a threshold that sat too close to normal speech rhythm.
 * Measured pauses inside a single spoken sentence run 0.41s, 0.91s, 0.92s, 1.07s —
 * a 1.2s threshold was only 0.13-0.29s above them, so thinking mid-sentence looked
 * like finishing. This class encodes the corrected rule and the reasoning.
 */
class TurnDetector(
    /** RMS above which a frame counts as speech. */
    private val speechRms: Double = DEFAULT_SPEECH_RMS,
    /** Continuous silence after speech that ends the turn. */
    private val silenceHoldMs: Long = DEFAULT_SILENCE_HOLD_MS,
) {
    companion object {
        const val DEFAULT_SPEECH_RMS = 900.0

        /**
         * Measured natural pauses inside one sentence peak at ~1.07s. 2500ms keeps
         * a wide margin so a pause to think is never mistaken for finishing.
         * A rep who is truly done presses "Selesai bicara" rather than waiting.
         */
        const val DEFAULT_SILENCE_HOLD_MS = 2_500L

        /** Hard cap: a stuck capture must not run forever. */
        private const val MAX_TURN_MS = 60_000L
    }

    private var silentMs = 0L
    private var totalMs = 0L
    private var heardSpeech = false

    /** True once any frame exceeded [speechRms] during this turn. */
    val speechDetected: Boolean get() = heardSpeech

    /** Reset internal state for a new turn. */
    fun reset() {
        silentMs = 0L
        totalMs = 0L
        heardSpeech = false
    }

    /**
     * Feed one frame.
     *
     * @return true when the turn is over and capture should stop.
     */
    fun onFrame(rms: Double, frameMs: Long): Boolean {
        totalMs += frameMs
        if (rms > speechRms) {
            heardSpeech = true
            silentMs = 0
        } else {
            silentMs += frameMs
            if (heardSpeech && silentMs >= silenceHoldMs) return true
        }
        // Hard cap: a stuck capture must not run forever.
        return totalMs >= MAX_TURN_MS
    }
}
