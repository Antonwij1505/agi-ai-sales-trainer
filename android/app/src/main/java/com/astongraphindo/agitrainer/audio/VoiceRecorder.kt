package com.astongraphindo.agitrainer.audio

import android.annotation.SuppressLint
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import android.util.Log
import java.io.File
import kotlin.math.sqrt

/**
 * Microphone capture with simple energy-based voice activity detection.
 *
 * The product requires free speech, not button presses (PRD §15), so the app has
 * to decide for itself when the sales has started and stopped talking:
 *   - recording begins on the first frame above [startThreshold],
 *   - it stops after [silenceHoldMs] of continuous silence once speech was seen.
 *
 * The same energy measure feeds the "5 s silence" nudge required by PRD §22,
 * exposed through [onSilence].
 *
 * Output is 16 kHz mono 16-bit PCM in a WAV container — exactly what whisper
 * endpoints expect, so no server-side transcoding is needed.
 */
class VoiceRecorder(
    private val onSilence: (() -> Unit)? = null,
) {
    companion object {
        private const val TAG = "VoiceRecorder"
        private const val SAMPLE_RATE = 16_000
        private const val CHANNEL = AudioFormat.CHANNEL_IN_MONO
        private const val ENCODING = AudioFormat.ENCODING_PCM_16BIT

        /** RMS above this counts as speech. Tuned for a phone mic at arm's length. */
        private const val START_THRESHOLD = 900.0

        /** Stop after this much continuous silence, once speech has been heard. */
        private const val SILENCE_HOLD_MS = 1_200L

        /** Fire the nudge callback after this much silence with no speech at all. */
        private const val NUDGE_AFTER_MS = 5_000L
    }

    private var record: AudioRecord? = null
    @Volatile private var running = false

    /** True once the sales has been heard during this capture. */
    @Volatile var speechDetected = false
        private set

    /** Peak RMS observed — surfaced in the UI as a level meter. */
    @Volatile var level: Double = 0.0
        private set

    @SuppressLint("MissingPermission") // Caller checks RECORD_AUDIO before starting.
    fun start(): Boolean {
        val minBuf = AudioRecord.getMinBufferSize(SAMPLE_RATE, CHANNEL, ENCODING)
        if (minBuf <= 0) {
            Log.e(TAG, "AudioRecord tidak mendukung 16kHz mono PCM16")
            return false
        }

        val rec = try {
            AudioRecord(
                MediaRecorder.AudioSource.VOICE_RECOGNITION,
                SAMPLE_RATE,
                CHANNEL,
                ENCODING,
                minBuf * 2,
            )
        } catch (e: Exception) {
            Log.e(TAG, "Gagal membuat AudioRecord: ${e.message}")
            return false
        }

        if (rec.state != AudioRecord.STATE_INITIALIZED) {
            rec.release()
            Log.e(TAG, "AudioRecord tidak terinisialisasi")
            return false
        }

        record = rec
        speechDetected = false
        level = 0.0
        running = true
        rec.startRecording()
        return true
    }

    /**
     * Blocking capture loop. Call from a background thread. Returns the WAV file,
     * or null when nothing usable was captured.
     */
    fun recordUntilSilence(outFile: File): File? {
        val rec = record ?: return null
        val minBuf = AudioRecord.getMinBufferSize(SAMPLE_RATE, CHANNEL, ENCODING)
        val buffer = ShortArray(minBuf / 2)

        val pcm = ArrayList<Short>(SAMPLE_RATE * 30)
        var silentMs = 0L
        var totalMs = 0L
        var nudged = false

        while (running) {
            val read = rec.read(buffer, 0, buffer.size)
            if (read <= 0) continue

            pcm.addAll(buffer.take(read))

            val rms = sqrt(buffer.take(read).sumOf { it.toDouble() * it.toDouble() } / read)
            if (rms > level) level = rms

            val frameMs = (read * 1000L) / SAMPLE_RATE
            totalMs += frameMs

            if (rms > START_THRESHOLD) {
                speechDetected = true
                silentMs = 0
            } else {
                silentMs += frameMs
                // Nothing said yet for 5 s -> let the caller nudge the user.
                if (!nudged && !speechDetected && totalMs >= NUDGE_AFTER_MS) {
                    nudged = true
                    onSilence?.invoke()
                }
                // Heard speech, then quiet -> the utterance is finished.
                if (speechDetected && silentMs >= SILENCE_HOLD_MS) break
            }

            // Hard cap so a stuck capture cannot grow without bound.
            if (totalMs >= 60_000) break
        }

        return if (speechDetected && pcm.isNotEmpty()) writeWav(outFile, pcm) else null
    }

    fun stop() {
        running = false
        record?.let {
            runCatching { if (it.recordingState == AudioRecord.RECORDSTATE_RECORDING) it.stop() }
            runCatching { it.release() }
        }
        record = null
    }

    /** Write 16-bit mono PCM into a canonical 44-byte-header WAV file. */
    private fun writeWav(out: File, samples: List<Short>): File {
        val dataSize = samples.size * 2
        val byteRate = SAMPLE_RATE * 2

        out.outputStream().buffered().use { os ->
            fun le32(v: Int) = byteArrayOf(
                (v and 0xff).toByte(),
                ((v shr 8) and 0xff).toByte(),
                ((v shr 16) and 0xff).toByte(),
                ((v shr 24) and 0xff).toByte(),
            )
            fun le16(v: Int) = byteArrayOf((v and 0xff).toByte(), ((v shr 8) and 0xff).toByte())

            os.write("RIFF".toByteArray())
            os.write(le32(36 + dataSize))
            os.write("WAVE".toByteArray())
            os.write("fmt ".toByteArray())
            os.write(le32(16))          // PCM chunk size
            os.write(le16(1))           // PCM
            os.write(le16(1))           // mono
            os.write(le32(SAMPLE_RATE))
            os.write(le32(byteRate))
            os.write(le16(2))           // block align
            os.write(le16(16))          // bits per sample
            os.write("data".toByteArray())
            os.write(le32(dataSize))

            val bytes = ByteArray(dataSize)
            samples.forEachIndexed { i, s ->
                bytes[i * 2] = (s.toInt() and 0xff).toByte()
                bytes[i * 2 + 1] = ((s.toInt() shr 8) and 0xff).toByte()
            }
            os.write(bytes)
        }
        return out
    }
}
