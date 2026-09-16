package com.astongraphindo.agitrainer.data

import com.astongraphindo.agitrainer.BuildConfig
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.MultipartBody
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.asRequestBody
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.util.concurrent.TimeUnit

/**
 * HTTP client for the trainer backend.
 *
 * The app talks ONLY to our own backend; provider keys (LLM/STT/TTS) live on the
 * server and are never shipped to the device (PRD §8, §78).
 */
class TrainerApi(private val tokenStore: TokenStore) {

    private val json = "application/json; charset=utf-8".toMediaType()

    // Roleplay voice calls do STT + LLM + TTS server-side, so the read timeout is
    // generous — a short one would abort a legitimate turn.
    private val client = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .writeTimeout(60, TimeUnit.SECONDS)
        .readTimeout(180, TimeUnit.SECONDS)
        .build()

    class ApiException(val status: Int, message: String) : Exception(message)

    private fun base(): String = BuildConfig.API_BASE_URL.trimEnd('/')

    private fun authed(path: String): Request.Builder {
        val b = Request.Builder().url("${base()}$path")
        tokenStore.token()?.let { b.header("Authorization", "Bearer $it") }
        return b
    }

    private suspend fun execute(req: Request): JSONObject = withContext(Dispatchers.IO) {
        client.newCall(req).execute().use { res ->
            val body = res.body?.string().orEmpty()
            if (!res.isSuccessful) {
                val msg = runCatching { JSONObject(body).optString("error") }
                    .getOrNull()
                    ?.ifBlank { null }
                    ?: "HTTP ${res.code}"
                throw ApiException(res.code, msg)
            }
            if (body.isBlank()) JSONObject() else JSONObject(body)
        }
    }

    // ── Auth ────────────────────────────────────────────────────────────────

    /**
     * The trainer shares the Sales Analytics JWT contract, so login is proxied to
     * the analytics backend rather than duplicated here.
     */
    suspend fun login(username: String, password: String): Pair<String, User> {
        val payload = JSONObject()
            .put("username", username)
            .put("password", password)
            .toString()
            .toRequestBody(json)

        // Auth lives on the analytics service; the trainer validates the same token.
        val authBase = BuildConfig.AUTH_BASE_URL.trimEnd('/')
        val req = Request.Builder()
            .url("$authBase/api/auth/login")
            .post(payload)
            .build()

        val o = execute(req)
        val t = o.optString("token")
        val u = o.optJSONObject("user") ?: JSONObject()
        val user = User(
            id = u.optLong("id"),
            username = u.optString("username"),
            role = u.optString("role", "sales"),
            namaLengkap = u.optString("nama_lengkap"),
        )
        if (t.isBlank()) throw ApiException(401, "Token tidak diterima dari server.")
        return t to user
    }

    // ── Catalog ─────────────────────────────────────────────────────────────

    suspend fun modules(): List<TrainingModule> {
        val o = execute(authed("/api/trainer/modules").get().build())
        val arr = o.optJSONArray("modules") ?: JSONArray()
        return (0 until arr.length()).map { TrainingModule.from(arr.getJSONObject(it)) }
    }

    suspend fun askTheory(scenarioId: Int, question: String): String = withContext(Dispatchers.IO) {
        val payload = JSONObject()
            .put("scenarioId", scenarioId)
            .put("question", question)
            .toString()
            .toRequestBody(json)
        val req = authed("/api/trainer/theory/ask").post(payload).build()
        val o = execute(req)
        o.optString("answer", "Tidak ada jawaban.")
    }

    suspend fun moduleDetail(id: Int): ModuleDetail {
        val o = execute(authed("/api/trainer/modules/$id").get().build())
        val m = TrainingModule.from(o.getJSONObject("module"))
        val sArr = o.optJSONArray("scenarios") ?: JSONArray()
        val rArr = o.optJSONArray("rubric") ?: JSONArray()
        return ModuleDetail(
            module = m,
            scenarios = (0 until sArr.length()).map { Scenario.from(sArr.getJSONObject(it)) },
            rubric = (0 until rArr.length()).map { RubricCriterion.from(rArr.getJSONObject(it)) },
        )
    }

    data class Started(val sessionId: Int, val opening: String, val resistance: Int)

    suspend fun startSession(scenarioId: Int): Started {
        val body = JSONObject().put("scenario_id", scenarioId).toString().toRequestBody(json)
        val o = execute(authed("/api/trainer/sessions").post(body).build())
        val s = o.getJSONObject("session")
        val op = o.optJSONObject("opening")
        return Started(
            sessionId = s.optInt("id"),
            opening = op?.optString("reply").orEmpty(),
            resistance = op?.optInt("resistance", 3) ?: 3,
        )
    }

    /** Voice turn: send recorded audio, receive transcript + reply + reply audio. */
    data class VoiceTurn(
        val transcript: String,
        val reply: String,
        val resistance: Int,
        val state: String,
        val done: Boolean,
        val audio: ByteArray,
    )

    suspend fun voiceTurn(sessionId: Int, audio: File, resistance: Int): VoiceTurn {
        val audioBody = audio.asRequestBody("audio/mpeg".toMediaType())
        val multipart = MultipartBody.Builder()
            .setType(MultipartBody.FORM)
            .addFormDataPart("audio", audio.name, audioBody)
            .addFormDataPart("resistance", resistance.toString())
            .build()

        val o = execute(authed("/api/trainer/sessions/$sessionId/voice").post(multipart).build())
        val r = o.getJSONObject("reply")
        val b64 = r.optString("audio_base64")
        return VoiceTurn(
            transcript = o.optString("transcript"),
            reply = r.optString("reply"),
            resistance = r.optInt("resistance", resistance),
            state = r.optString("state"),
            done = r.optBoolean("done"),
            audio = if (b64.isBlank()) ByteArray(0) else android.util.Base64.decode(b64, android.util.Base64.DEFAULT),
        )
    }

    suspend fun finish(sessionId: Int): Unit {
        execute(authed("/api/trainer/sessions/$sessionId/finish").post(EMPTY).build())
    }

    suspend fun evaluate(sessionId: Int): Evaluation {
        val o = execute(authed("/api/trainer/sessions/$sessionId/evaluate").post(EMPTY).build())
        return Evaluation.from(o.getJSONObject("evaluation"))
    }

    // ── Progress ────────────────────────────────────────────────────────────

    suspend fun progress(): List<ProgressEntry> {
        val o = execute(authed("/api/trainer/progress").get().build())
        val arr = o.optJSONArray("progress") ?: JSONArray()
        return (0 until arr.length()).map { i ->
            val p = arr.getJSONObject(i)
            ProgressEntry(
                moduleId = p.optInt("module_id"),
                moduleCode = p.optString("module_code"),
                moduleName = p.optString("module_name"),
                latestScore = if (p.isNull("latest_score")) null else p.optInt("latest_score"),
                highestScore = if (p.isNull("highest_score")) null else p.optInt("highest_score"),
                attempts = p.optInt("attempts"),
                improvement = if (p.isNull("improvement")) null else p.optInt("improvement"),
                passStatus = p.optString("pass_status"),
                passingScore = p.optInt("passing_score", 80),
            )
        }
    }

    suspend fun history(): List<HistoryEntry> {
        val o = execute(authed("/api/trainer/history").get().build())
        val arr = o.optJSONArray("history") ?: JSONArray()
        return (0 until arr.length()).map { i ->
            val h = arr.getJSONObject(i)
            HistoryEntry(
                sessionId = h.optInt("session_id"),
                scenarioName = h.optString("scenario_name"),
                moduleCode = h.optString("module_code"),
                attempt = h.optInt("attempt"),
                startedAt = h.optString("started_at"),
                overallScore = if (h.isNull("overall_score")) null else h.optInt("overall_score"),
                passed = if (h.isNull("passed")) null else h.optBoolean("passed"),
                evalStatus = h.optString("eval_status"),
            )
        }
    }

    private companion object {
        val EMPTY = ByteArray(0).toRequestBody(null)
    }
}
