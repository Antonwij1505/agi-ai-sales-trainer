package com.astongraphindo.agitrainer.data

import android.util.Base64
import android.util.Log
import com.astongraphindo.agitrainer.BuildConfig
import kotlinx.coroutines.channels.BufferOverflow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import org.json.JSONObject
import java.util.concurrent.TimeUnit

/**
 * WebSocket client for the speech-to-speech relay.
 *
 * The device NEVER holds a provider key: it connects to our own backend, which owns
 * the upstream Gemini session (PRD §78). See backend/src/routes/live.routes.ts.
 *
 * Events are surfaced as a [SharedFlow] so the UI can react to each one as it
 * arrives — audio is played while it is still streaming, which is the whole point.
 */
class LiveClient {

    /** What the relay sends us. */
    sealed interface Event {
        data object Ready : Event
        /** PCM16 mono 24 kHz, ready for [com.astongraphindo.agitrainer.audio.StreamingPlayer]. */
        data class Audio(val pcm: ByteArray) : Event
        /** Partial transcript; [final] is false while the model is still talking. */
        data class Transcript(val fromSales: Boolean, val text: String) : Event
        /** The customer finished this turn — playback can drain naturally. */
        data object TurnEnd : Event
        data class Failure(val message: String) : Event
        data class Closed(val reason: String) : Event
    }

    companion object {
        private const val TAG = "LiveClient"
    }

    private var socket: WebSocket? = null

    // replay=0, extraBufferCapacity keeps the relay's read thread from blocking.
    private val _events = MutableSharedFlow<Event>(
        replay = 0,
        extraBufferCapacity = 256,
        onBufferOverflow = BufferOverflow.DROP_OLDEST,
    )
    val events: SharedFlow<Event> = _events

    private val client = OkHttpClient.Builder()
        // No read timeout: a live session is idle whenever nobody is speaking, and
        // OkHttp would otherwise kill a healthy socket during a long pause.
        .readTimeout(0, TimeUnit.MILLISECONDS)
        .connectTimeout(15, TimeUnit.SECONDS)
        .pingInterval(20, TimeUnit.SECONDS)
        .build()

    /**
     * Open the relay for [sessionId].
     *
     * The JWT goes in the Authorization header (OkHttp can set headers on a
     * handshake, unlike a browser). The relay also accepts ?token= for curl tests.
     */
    fun connect(sessionId: Int, token: String) {
        disconnect()
        val wsBase = BuildConfig.API_BASE_URL
            .trimEnd('/')
            .replaceFirst("https://", "wss://")
            .replaceFirst("http://", "ws://")
        val url = "$wsBase/api/trainer/live/$sessionId"

        val request = Request.Builder()
            .url(url)
            .header("Authorization", "Bearer $token")
            .build()

        socket = client.newWebSocket(request, object : WebSocketListener() {
            override fun onOpen(webSocket: WebSocket, response: Response) {
                Log.i(TAG, "relay tersambung")
            }

            override fun onMessage(webSocket: WebSocket, text: String) {
                handleFrame(text)
            }

            override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                Log.e(TAG, "relay gagal: ${t.message} (http=${response?.code})")
                _events.tryEmit(Event.Failure(t.message ?: "Koneksi terputus."))
            }

            override fun onClosing(webSocket: WebSocket, code: Int, reason: String) {
                webSocket.close(1000, null)
            }

            override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
                _events.tryEmit(Event.Closed(reason))
            }
        })
    }

    private fun handleFrame(text: String) {
        val obj = try {
            JSONObject(text)
        } catch (e: Exception) {
            Log.w(TAG, "frame tidak valid: ${e.message}")
            return
        }
        when (obj.optString("t")) {
            "ready" -> _events.tryEmit(Event.Ready)
            "audio" -> {
                val b64 = obj.optString("pcm")
                if (b64.isNotEmpty()) {
                    val pcm = runCatching { Base64.decode(b64, Base64.DEFAULT) }.getOrNull()
                    if (pcm != null) _events.tryEmit(Event.Audio(pcm))
                }
            }
            "transcript" -> _events.tryEmit(
                Event.Transcript(
                    fromSales = obj.optString("speaker") == "SALES",
                    text = obj.optString("text"),
                ),
            )
            "turn_end" -> _events.tryEmit(Event.TurnEnd)
            "error" -> _events.tryEmit(
                Event.Failure(obj.optString("message").ifBlank { "Terjadi kesalahan." }),
            )
            else -> Unit
        }
    }

    /** Send one chunk of PCM16 16 kHz audio, already base64-encoded. */
    fun sendAudio(pcm: ByteArray): Boolean {
        val b64 = Base64.encodeToString(pcm, Base64.NO_WRAP)
        return send("""{"t":"audio","pcm":"$b64"}""")
    }

    /** The rep began speaking (required because automatic VAD is disabled). */
    fun sendTurnStart(): Boolean = send("""{"t":"turn_start"}""")

    /** The rep finished — the customer should answer now. */
    fun sendTurnEnd(): Boolean = send("""{"t":"turn_end"}""")

    /** End the session and let the server flush the transcript. */
    fun stop(): Boolean = send("""{"t":"stop"}""")

    private fun send(json: String): Boolean = socket?.send(json) ?: false

    fun disconnect() {
        socket?.let {
            runCatching { it.close(1000, "client closed") }
        }
        socket = null
    }
}
