package com.astongraphindo.agitrainer.audio

import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioManager
import android.media.AudioTrack
import android.util.Log
import java.util.concurrent.ArrayBlockingQueue
import java.util.concurrent.TimeUnit

/**
 * Plays PCM16 mono audio as it streams in, instead of waiting for a whole file.
 *
 * Why not MediaPlayer (used by [ReplyPlayer]): that needs a complete, seekable
 * source. Gemini Live emits 24 kHz PCM while still generating, and waiting for the
 * last byte would add seconds of dead air — the exact complaint we are fixing.
 *
 * A single feeder thread drains a bounded queue into an [AudioTrack] in streaming
 * mode. The queue is bounded so a fast producer cannot grow memory without limit;
 * when it is full, [write] blocks, which applies natural back-pressure.
 */
class StreamingPlayer {

    companion object {
        private const val TAG = "StreamingPlayer"

        /** Matches the Live API's output rate. */
        const val SAMPLE_RATE = 24_000

        /** ~1 s of audio buffered at 24 kHz mono 16-bit. */
        private const val QUEUE_BYTES = SAMPLE_RATE * 2
    }

    private var track: AudioTrack? = null
    private var feeder: Thread? = null
    private val queue = ArrayBlockingQueue<ByteArray>(64)

    @Volatile private var playing = false
    @Volatile private var draining = false

    /** True while the track is running (used by the UI for the barge-in button). */
    val isPlaying: Boolean get() = playing

    @Synchronized
    fun clear() {
        queue.clear()
        runCatching {
            track?.pause()
            track?.flush()
            track?.play()
        }
    }

    @Synchronized
    fun start() {
        stop()
        val minBuf = AudioTrack.getMinBufferSize(
            SAMPLE_RATE,
            AudioFormat.CHANNEL_OUT_MONO,
            AudioFormat.ENCODING_PCM_16BIT,
        )
        val bufSize = maxOf(minBuf, QUEUE_BYTES)
        val t = try {
            AudioTrack.Builder()
                .setAudioAttributes(
                    AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_MEDIA)
                        .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                        .build(),
                )
                .setAudioFormat(
                    AudioFormat.Builder()
                        .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
                        .setSampleRate(SAMPLE_RATE)
                        .setChannelMask(AudioFormat.CHANNEL_OUT_MONO)
                        .build(),
                )
                .setBufferSizeInBytes(bufSize)
                .setTransferMode(AudioTrack.MODE_STREAM)
                .build()
        } catch (e: Exception) {
            Log.e(TAG, "gagal membuat AudioTrack: ${e.message}")
            return
        }

        track = t
        draining = true
        playing = true
        t.play()

        feeder = Thread {
            val out = ByteArray(4096)
            while (draining) {
                // Poll with a timeout so stop() is honoured promptly.
                val chunk = try {
                    queue.poll(120, TimeUnit.MILLISECONDS)
                } catch (_: InterruptedException) {
                    break
                } ?: continue
                var offset = 0
                while (offset < chunk.size && draining) {
                    val n = minOf(out.size, chunk.size - offset)
                    System.arraycopy(chunk, offset, out, 0, n)
                    val written = t.write(out, 0, n, AudioTrack.WRITE_BLOCKING)
                    if (written < 0) {
                        Log.e(TAG, "AudioTrack.write gagal: $written")
                        break
                    }
                    offset += written
                }
            }
            playing = false
        }.also { it.isDaemon = true; it.start() }
    }

    /** Queue a chunk of PCM16 bytes. Safe to call from any thread. */
    fun write(pcm: ByteArray) {
        if (pcm.isEmpty() || !draining) return
        // offer() with a short wait rather than put(): never block the WebSocket
        // read loop for long, drop only if the consumer is hopelessly behind.
        try {
            queue.offer(pcm, 250, TimeUnit.MILLISECONDS)
        } catch (_: InterruptedException) {
            Thread.currentThread().interrupt()
        }
    }

    /** Stop and release. Called on barge-in and when leaving the screen. */
    @Synchronized
    fun stop() {
        draining = false
        playing = false
        queue.clear()
        feeder?.let {
            it.interrupt()
            runCatching { it.join(300) }
        }
        feeder = null
        track?.let {
            runCatching { if (it.state == AudioTrack.STATE_INITIALIZED) it.stop() }
            runCatching { it.release() }
        }
        track = null
    }

    /** Set output volume (0f..1f) — used to duck while the rep is speaking. */
    fun setVolume(v: Float) {
        track?.let { runCatching { it.setVolume(v) } }
    }

    /** Best-effort check that audio output is available at all. */
    fun canPlay(): Boolean = AudioManager.STREAM_MUSIC >= 0
}
