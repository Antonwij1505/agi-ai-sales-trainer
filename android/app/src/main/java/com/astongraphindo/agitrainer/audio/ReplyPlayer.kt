package com.astongraphindo.agitrainer.audio

import android.media.AudioAttributes
import android.media.MediaPlayer
import android.util.Log
import java.io.File

/**
 * Plays the AI customer's reply.
 *
 * Supports barge-in (PRD §21): [stop] is called the moment the sales starts
 * speaking, so the customer can be interrupted mid-sentence.
 */
class ReplyPlayer {

    private var player: MediaPlayer? = null

    /** Play an MP3 byte array written to [tempFile]. [onDone] fires on completion. */
    fun play(bytes: ByteArray, tempFile: File, onDone: (() -> Unit)? = null) {
        stop()
        if (bytes.isEmpty()) {
            onDone?.invoke()
            return
        }
        try {
            tempFile.writeBytes(bytes)
            val mp = MediaPlayer()
            mp.setAudioAttributes(
                AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_MEDIA)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                    .build(),
            )
            mp.setDataSource(tempFile.absolutePath)
            mp.setOnCompletionListener {
                it.release()
                if (player === it) player = null
                onDone?.invoke()
            }
            mp.setOnErrorListener { p, what, extra ->
                Log.e("ReplyPlayer", "MediaPlayer error what=$what extra=$extra")
                p.release()
                if (player === p) player = null
                onDone?.invoke()
                true
            }
            mp.prepare()
            mp.start()
            player = mp
        } catch (e: Exception) {
            Log.e("ReplyPlayer", "Gagal memutar balasan: ${e.message}")
            onDone?.invoke()
        }
    }

    fun isPlaying(): Boolean = player?.isPlaying == true

    fun stop() {
        player?.let {
            runCatching { if (it.isPlaying) it.stop() }
            runCatching { it.release() }
        }
        player = null
    }
}
