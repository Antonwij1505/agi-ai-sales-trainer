package com.astongraphindo.agitrainer.ui

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.astongraphindo.agitrainer.data.HistoryEntry
import com.astongraphindo.agitrainer.data.ModuleDetail
import com.astongraphindo.agitrainer.data.ProgressEntry
import com.astongraphindo.agitrainer.data.TokenStore
import com.astongraphindo.agitrainer.data.TrainerApi
import com.astongraphindo.agitrainer.data.TrainingModule
import com.astongraphindo.agitrainer.data.User
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

/** Auth state shared by the whole app. */
data class AuthState(
    val user: User? = null,
    val loading: Boolean = false,
    val error: String? = null,
) {
    val loggedIn: Boolean get() = user != null
}

data class CatalogState(
    val modules: List<TrainingModule> = emptyList(),
    val loading: Boolean = false,
    val error: String? = null,
)

data class DetailState(
    val detail: ModuleDetail? = null,
    val loading: Boolean = false,
    val error: String? = null,
)

data class ProgressState(
    val progress: List<ProgressEntry> = emptyList(),
    val history: List<HistoryEntry> = emptyList(),
    val loading: Boolean = false,
    val error: String? = null,
)

/**
 * Single ViewModel for the MVP screens.
 *
 * One instance keeps the session state (auth + catalog + progress) coherent and
 * avoids passing the token between screens. It is deliberately simple: the app is
 * thin by design (PRD §8) — all AI work happens server-side.
 */
class TrainerViewModel(app: Application) : AndroidViewModel(app) {

    val tokenStore = TokenStore(app)
    val api = TrainerApi(tokenStore)

    private val _auth = MutableStateFlow(AuthState(user = tokenStore.user()))
    val auth: StateFlow<AuthState> = _auth.asStateFlow()

    private val _catalog = MutableStateFlow(CatalogState())
    val catalog: StateFlow<CatalogState> = _catalog.asStateFlow()

    private val _detail = MutableStateFlow(DetailState())
    val detail: StateFlow<DetailState> = _detail.asStateFlow()

    private val _progress = MutableStateFlow(ProgressState())
    val progress: StateFlow<ProgressState> = _progress.asStateFlow()

    fun login(username: String, password: String) {
        if (username.isBlank() || password.isBlank()) {
            _auth.value = _auth.value.copy(error = "Username dan password wajib diisi.")
            return
        }
        _auth.value = _auth.value.copy(loading = true, error = null)
        viewModelScope.launch {
            try {
                val (token, user) = api.login(username.trim(), password)
                tokenStore.save(token, user)
                _auth.value = AuthState(user = user)
                loadCatalog()
            } catch (e: Exception) {
                _auth.value = AuthState(error = e.message ?: "Login gagal.")
            }
        }
    }

    suspend fun askTheory(scenarioId: Int, question: String): String {
        return api.askTheory(scenarioId, question)
    }

    fun logout() {
        tokenStore.clear()
        _auth.value = AuthState()
        _catalog.value = CatalogState()
        _detail.value = DetailState()
        _progress.value = ProgressState()
    }

    fun loadCatalog() {
        _catalog.value = _catalog.value.copy(loading = true, error = null)
        viewModelScope.launch {
            try {
                _catalog.value = CatalogState(modules = api.modules())
            } catch (e: Exception) {
                _catalog.value = CatalogState(error = e.message ?: "Gagal memuat modul.")
            }
        }
    }

    fun loadModule(id: Int) {
        _detail.value = DetailState(loading = true)
        viewModelScope.launch {
            try {
                _detail.value = DetailState(detail = api.moduleDetail(id))
            } catch (e: Exception) {
                _detail.value = DetailState(error = e.message ?: "Gagal memuat modul.")
            }
        }
    }

    fun loadProgress() {
        _progress.value = _progress.value.copy(loading = true, error = null)
        viewModelScope.launch {
            try {
                val p = api.progress()
                val h = api.history()
                _progress.value = ProgressState(progress = p, history = h)
            } catch (e: Exception) {
                _progress.value = ProgressState(error = e.message ?: "Gagal memuat progres.")
            }
        }
    }
}
