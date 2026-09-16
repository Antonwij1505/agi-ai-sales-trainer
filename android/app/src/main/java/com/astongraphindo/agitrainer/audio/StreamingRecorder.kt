package com.astongraphindo.agitrainer.audio

import android.annotation.SuppressLint
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import android.media.audiofx.AcousticEchoCanceler
import android.media.audiofx.NoiseSuppressor
import android.util.Log
import kotlin.math.sqrt

/**
 * Microphone capture that STREAMS raw PCM continuously for full-duplex hands-free calls.
 *
 * Output format is fixed by Gemini Live API: PCM16, mono, 16 kHz.
 *
 * VOICE_COMMUNICATION audio source + AcousticEchoCanceler are used so the phone's
 * speaker output is cancelled out by hardware/OS before reaching the microphone.
 */
class StreamingRecorder(
    private val onLevel: ((Double) -> Unit)? = null,
) {
    companion object {
        private const val TAG = "StreamingRecorder"
        const val SAMPLE_RATE = 16_000

        /** Emit audio in ~100 ms chunks. */
        private const val CHUNK_MS = 100
    }

    private var record: AudioRecord? = null
    private var aec: AcousticEchoCanceler? = null
    private var ns: NoiseSuppressor? = null

    @Volatile private var running = false

    @SuppressLint("MissingPermission")
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
                MediaRecorder.AudioSource.VOICE_COMMUNICATION,
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

        val audioSessionId = rec.audioSessionId
        if (audioSessionId != 0) {
            runCatching {
                if (AcousticEchoCanceler.isAvailable()) {
                    aec = AcousticEchoCanceler.create(audioSessionId)?.apply {
                        enabled = true
                        Log.i(TAG, "Hardware AcousticEchoCanceler enabled")
                    }
                }
            }
            runCatching {
                if (NoiseSuppressor.isAvailable()) {
                    ns = NoiseSuppressor.create(audioSessionId)?.apply {
                        enabled = true
                        Log.i(TAG, "Hardware NoiseSuppressor enabled")
                    }
                }
            }
        }

        record = rec
        running = true
        rec.startRecording()
        return true
    }

    /**
     * Continuous audio streaming loop. Runs until [stop] is called.
     */
    fun streamContinuous(onChunk: (ByteArray) -> Unit) {
        val rec = record ?: return
        val samplesPerChunk = SAMPLE_RATE * CHUNK_MS / 1000
        val buffer = ShortArray(samplesPerChunk)
        val bytes = ByteArray(samplesPerChunk * 2)

        while (running) {
            var filled = 0
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

            for (i in 0 until filled) {
                val s = buffer[i].toInt()
                bytes[i * 2] = (s and 0xff).toByte()
                bytes[i * 2 + 1] = ((s shr 8) and 0xff).toByte()
            }
            onChunk(bytes.copyOf(filled * 2))
        }
    }

    fun stop() {
        running = false
        runCatching { aec?.release() }
        runCatching { ns?.release() }
        aec = null
        ns = null

        record?.let {
            runCatching {
                if (it.recordingState == AudioRecord.RECORDSTATE_RECORDING) it.stop()
            }
            runCatching { it.release() }
        }
        record = null
    }
}
