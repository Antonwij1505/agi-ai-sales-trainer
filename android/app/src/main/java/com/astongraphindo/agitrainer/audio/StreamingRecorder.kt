package com.astongraphindo.agitrainer.audio

import android.annotation.SuppressLint
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import android.util.Log
import kotlin.math.sqrt

/**
 * Microphone capture that STREAMS raw PCM instead of writing a file.
 *
 * Why a separate class from [VoiceRecorder]: that one buffers a whole utterance into
 * a WAV and is still used by the HTTP fallback path. This one exists for Gemini Live,
 * where audio must reach the server as it is spoken (speech-to-speech), and where the
 * reply starts arriving while the rep is still finishing.
 *
 * Output format is fixed by the Live API: PCM16, mono, 16 kHz.
 *
 * TURN DETECTION — the important part.
 * Gemini's own automatic VAD was measured truncating turns at a natural mid-sentence
 * pause (see backend/scripts/diag_vad.py): a 9.7 s utterance was heard as its first
 * ~2 s, and the second request inside it was ignored. So automatic VAD is disabled
 * server-side and THIS class decides when a turn ends, using local energy:
 *   - [silenceHoldMs] of continuous silence after speech  -> turn over
 *   - the UI also exposes a manual "Selesai bicara" button, because no energy
 *     threshold is right for every room.
 */
class StreamingRecorder(
    private val onLevel: ((Double) -> Unit)? = null,
) {
    companion object {
        private const val TAG = "StreamingRecorder"
        const val SAMPLE_RATE = 16_000

        /** Emit audio in ~100 ms chunks: small enough to feel live. */
        private const val CHUNK_MS = 100
    }

    private var record: AudioRecord? = null

    @Volatile private var running = false
    @Volatile private var speechSeen = false

    /** Turn-boundary rule, shared with the unit tests. */
    private val detector = TurnDetector()

    /** True once speech has been detected during this capture. */
    val speechDetected: Boolean get() = speechSeen

    @SuppressLint("MissingPermission") // caller checks RECORD_AUDIO first
    fun start(): Boolean {
        val minBuf = AudioRecord.getMinBufferSize(
            SAMPLE_RATE, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT,
        )
        if (minBuf <= 0) {
            Log.e(TAG, "16kHz mono PCM16 tidak didukung")
            return false
        }
        val rec = try {
            AudioRecord(
                MediaRecorder.AudioSource.VOICE_RECOGNITION,
                SAMPLE_RATE,
                AudioFormat.CHANNEL_IN_MONO,
                AudioFormat.ENCODING_PCM_16BIT,
                minBuf * 4,
            )
        } catch (e: Exception) {
            Log.e(TAG, "gagal membuat AudioRecord: ${e.message}")
            return false
        }
        if (rec.state != AudioRecord.STATE_INITIALIZED) {
            rec.release()
            return false
        }
        record = rec
        running = true
        speechSeen = false
        rec.startRecording()
        return true
    }

    /**
     * Blocking capture loop. Call from a background thread.
     *
     * [onChunk] receives raw little-endian PCM16 bytes, ready to base64 and send.
     * Returns true if any speech was detected before the turn ended.
     */
    fun streamUntilTurnEnd(onChunk: (ByteArray) -> Unit): Boolean {
        val rec = record ?: return false
        val samplesPerChunk = SAMPLE_RATE * CHUNK_MS / 1000
        val buffer = ShortArray(samplesPerChunk)
        val bytes = ByteArray(samplesPerChunk * 2)

        while (running) {
            var filled = 0
            // AudioRecord.read may return fewer samples than asked; loop until the
            // chunk is full so the stream stays evenly paced.
            while (filled < buffer.size && running) {
                val read = rec.read(buffer, filled, buffer.size - filled)
                if (read <= 0) break
                filled += read
            }
            if (filled <= 0) continue

            var sumSq = 0.0
            for (i in 0 until filled) {
                val s = buffer[i]
                sumSq += s.toDouble() * s.toDouble()
            }
            val rms = sqrt(sumSq / filled)
            onLevel?.invoke(rms)

            // pack to little-endian PCM16
            for (i in 0 until filled) {
                val s = buffer[i].toInt()
                bytes[i * 2] = (s and 0xff).toByte()
                bytes[i * 2 + 1] = ((s shr 8) and 0xff).toByte()
            }
            onChunk(bytes.copyOf(filled * 2))

            val frameMs = (filled * 1000L) / SAMPLE_RATE

            // The turn rule lives in TurnDetector so it is unit-tested; see that
            // class for why the threshold is what it is.
            if (detector.onFrame(rms, frameMs)) break
            speechSeen = detector.speechDetected
        }
        speechSeen = detector.speechDetected
        return speechSeen
    }

    fun stop() {
        running = false
        record?.let {
            runCatching {
                if (it.recordingState == AudioRecord.RECORDSTATE_RECORDING) it.stop()
            }
            runCatching { it.release() }
        }
        record = null
    }
}
