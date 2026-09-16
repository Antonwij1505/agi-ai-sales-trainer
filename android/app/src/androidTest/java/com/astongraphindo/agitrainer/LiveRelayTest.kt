package com.astongraphindo.agitrainer

import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.astongraphindo.agitrainer.data.LiveClient
import com.astongraphindo.agitrainer.data.TokenStore
import com.astongraphindo.agitrainer.data.TrainerApi
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Assume.assumeTrue
import org.junit.Test
import org.junit.runner.RunWith
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicInteger
import java.util.concurrent.atomic.AtomicReference

/**
 * End-to-end test of the speech-to-speech path, without a microphone.
 *
 * WHY THIS SHAPE
 * --------------
 * The emulator on this host cannot accept microphone input (the audio backend is
 * unavailable — see docs/EMULATOR_TESTING.md), so a normal "speak into the phone"
 * test is impossible here. But everything AFTER capture can still be exercised: this
 * test feeds a pre-recorded PCM file through the real LiveClient to the real relay
 * and asserts that streamed audio and transcripts come back.
 *
 * That covers the parts most likely to be wrong — protocol, auth, base64 framing,
 * streaming, transcript persistence — and leaves only "does the mic produce bytes"
 * unverified, which the physical-phone test covers.
 *
 * Requires a live backend and a real login. If the device cannot reach the backend
 * (offline emulator), the test SKIPS rather than failing, so it is safe in CI.
 */
@RunWith(AndroidJUnit4::class)
class LiveRelayTest {

    private val ctx = InstrumentationRegistry.getInstrumentation().targetContext

    private fun readUtterance(): ByteArray =
        InstrumentationRegistry.getInstrumentation().context.assets
            .open("sales_utterance.pcm")
            .use { it.readBytes() }

    @Test
    fun streamsAudioAndReceivesSpokenReply() {
        val tokenStore = TokenStore(ctx)
        val api = TrainerApi(tokenStore)

        // Reuse a stored session token when the device is already logged in.
        // Otherwise accept credentials as instrumentation arguments, so no password
        // is ever committed to the repository:
        //   adb shell am instrument -e username admin -e password '***' ...
        var token = tokenStore.token()
        if (token.isNullOrBlank()) {
            val args = InstrumentationRegistry.getArguments()
            val user = args.getString("username")
            val pass = args.getString("password")
            if (!user.isNullOrBlank() && !pass.isNullOrBlank()) {
                token = runCatching { runBlocking { api.login(user, pass).first } }
                    .getOrNull()
            }
        }
        assumeTrue(
            "tidak ada token — jalankan dengan -e username/-e password, uji dilewati",
            !token.isNullOrBlank(),
        )

        // scenario 2 exists in the seeded data.
        val started = runBlocking {
            runCatching { api.startSession(2) }.getOrNull()
        }
        assumeTrue("backend tidak terjangkau — uji dilewati", started != null)
        val sessionId = started!!.sessionId

        val client = LiveClient()
        val ready = CountDownLatch(1)
        val turnDone = CountDownLatch(1)
        val audioChunks = AtomicInteger(0)
        val audioBytes = AtomicInteger(0)
        val salesText = AtomicReference("")
        val csText = AtomicReference("")
        val failure = AtomicReference<String?>(null)

        val pcm = readUtterance()
        assertEquals(
            "aset audio harus 9,7s PCM16 16kHz mono",
            9.7 * 16000 * 2,
            pcm.size.toDouble(),
            2000.0,
        )

        // Collector runs on its own thread so the latch logic stays readable.
        val collector = Thread {
            runBlocking {
                client.events.collect { ev ->
                    when (ev) {
                        is LiveClient.Event.Ready -> ready.countDown()
                        is LiveClient.Event.Audio -> {
                            audioChunks.incrementAndGet()
                            audioBytes.addAndGet(ev.pcm.size)
                        }
                        is LiveClient.Event.Transcript ->
                            if (ev.fromSales) {
                                salesText.set(salesText.get() + ev.text)
                            } else {
                                csText.set(csText.get() + ev.text)
                            }
                        is LiveClient.Event.TurnEnd -> turnDone.countDown()
                        is LiveClient.Event.Failure -> failure.set(ev.message)
                        is LiveClient.Event.Closed -> Unit
                    }
                }
            }
        }.also { it.isDaemon = true; it.start() }

        try {
            client.connect(sessionId, token!!)
            assertTrue("relay tidak siap dalam 30s", ready.await(30, TimeUnit.SECONDS))

            // Stream the recording in 100 ms chunks, as the mic would.
            client.sendTurnStart()
            val chunk = 16000 * 2 / 10
            var offset = 0
            while (offset < pcm.size) {
                val end = minOf(offset + chunk, pcm.size)
                client.sendAudio(pcm.copyOfRange(offset, end))
                offset = end
                Thread.sleep(100)
            }
            client.sendTurnEnd()

            assertTrue("tidak ada balasan dalam 60s", turnDone.await(60, TimeUnit.SECONDS))
            failure.get()?.let { throw AssertionError("relay melaporkan error: $it") }

            // The whole utterance must have been heard — this is the regression guard
            // for the mid-sentence truncation found with Gemini's automatic VAD.
            val heard = salesText.get().lowercase()
            assertTrue(
                "sales tidak terdengar utuh (didengar: '$heard')",
                heard.contains("pengadaan"),
            )

            // A spoken reply must arrive as MANY chunks, not one lump.
            assertTrue(
                "audio balasan tidak streaming (hanya ${audioChunks.get()} chunk)",
                audioChunks.get() > 5,
            )
            assertTrue("audio balasan kosong", audioBytes.get() > 8000)
            assertTrue("CS tidak menjawab apa pun", csText.get().isNotBlank())
        } finally {
            client.stop()
            client.disconnect()
        }
    }
}
