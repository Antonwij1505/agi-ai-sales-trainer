package com.astongraphindo.agitrainer.audio

/**
 * Local voice-activity controller for the full-duplex Live call.
 *
 * WHY THIS EXISTS
 * Gemini's automatic VAD closes a turn at the first natural pause. Measured with
 * `backend/scripts/sweep_pause.py` (a 0.9s thinking pause inside one sentence):
 * every automatic-VAD setting tried (silence 300–1600ms) truncated the utterance
 * to "…saya Adi dari Orimas." — the tail ("boleh bicara dengan bagian pengadaan
 * IT?") was dropped and the CS answered the wrong half. Only a 2000ms window kept
 * the sentence whole, but that adds ~2s of dead air to EVERY reply.
 *
 * So the server runs with automatic VAD OFF and the app owns the turn boundary,
 * reusing the same [TurnDetector] rule that is already unit-tested.
 */
class TurnController(
    /** Frame size the capture loop reports at. */
    private val frameMs: Long = 50,
    silenceHoldMs: Long = DEFAULT_SILENCE_HOLD_MS,
    private val onSpeechStart: () -> Unit,
    private val onSpeechEnd: () -> Unit,
) {
    companion object {
        /**
         * Shorter than the 2500ms used by the push-to-talk screen: here the mic is
         * always open, so a long hold would add dead air to every turn. 1000ms still
         * clears the measured intra-sentence pauses (~0.4–1.1s).
         */
        const val DEFAULT_SILENCE_HOLD_MS = 1000L
    }

    private val detector = TurnDetector(silenceHoldMs = silenceHoldMs)
    private var active = false

    /** Feed one RMS frame from the capture loop (called on the IO thread). */
    @Synchronized
    fun onLevel(rms: Double) {
        val ended = detector.onFrame(rms, frameMs)
        if (!active) {
            if (detector.speechDetected) {
                active = true
                onSpeechStart()
            } else {
                // Idle: keep the detector fresh so its 60s hard cap can never fire
                // while nobody is talking (it would end the next turn instantly).
                if (ended) detector.reset()
                return
            }
        }
        if (ended) {
            active = false
            detector.reset()
            onSpeechEnd()
        }
    }

    /** Force the current turn closed (used when hanging up mid-sentence). */
    @Synchronized
    fun close() {
        if (active) {
            active = false
            detector.reset()
            onSpeechEnd()
        }
    }
}
