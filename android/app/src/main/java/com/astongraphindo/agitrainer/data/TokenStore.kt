package com.astongraphindo.agitrainer.data

import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey

/**
 * Stores the JWT in EncryptedSharedPreferences (AES-256, key in the Android
 * Keystore). The token is a session credential, so it must not sit in plain
 * SharedPreferences.
 *
 * No provider API key is ever stored here — the app has none (PRD §78).
 */
class TokenStore(context: Context) {

    private val prefs: SharedPreferences = run {
        val masterKey = MasterKey.Builder(context)
            .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
            .build()
        EncryptedSharedPreferences.create(
            context,
            "agi_trainer_secure",
            masterKey,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
        )
    }

    fun save(token: String, user: User) {
        prefs.edit()
            .putString(KEY_TOKEN, token)
            .putLong(KEY_USER_ID, user.id)
            .putString(KEY_USERNAME, user.username)
            .putString(KEY_ROLE, user.role)
            .putString(KEY_NAME, user.namaLengkap)
            .apply()
    }

    fun token(): String? = prefs.getString(KEY_TOKEN, null)

    fun user(): User? {
        val token = token() ?: return null
        if (token.isBlank()) return null
        return User(
            id = prefs.getLong(KEY_USER_ID, 0L),
            username = prefs.getString(KEY_USERNAME, "") ?: "",
            role = prefs.getString(KEY_ROLE, "sales") ?: "sales",
            namaLengkap = prefs.getString(KEY_NAME, "") ?: "",
        )
    }

    fun clear() {
        prefs.edit().clear().apply()
    }

    private companion object {
        const val KEY_TOKEN = "jwt"
        const val KEY_USER_ID = "user_id"
        const val KEY_USERNAME = "username"
        const val KEY_ROLE = "role"
        const val KEY_NAME = "nama_lengkap"
    }
}
