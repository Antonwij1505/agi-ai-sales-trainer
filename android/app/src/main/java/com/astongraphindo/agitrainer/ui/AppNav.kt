package com.astongraphindo.agitrainer.ui

import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.platform.LocalContext
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import com.astongraphindo.agitrainer.ui.screens.DashboardScreen
import com.astongraphindo.agitrainer.ui.screens.LiveSessionScreen
import com.astongraphindo.agitrainer.ui.screens.LoginScreen
import com.astongraphindo.agitrainer.ui.screens.ModuleDetailScreen
import com.astongraphindo.agitrainer.ui.screens.ProgressScreen
import com.astongraphindo.agitrainer.ui.screens.ResultScreen

object Routes {
    const val LOGIN = "login"
    const val DASHBOARD = "dashboard"
    const val PROGRESS = "progress"
    const val MODULE = "module/{moduleId}"
    const val SESSION = "session/{scenarioId}/{scenarioName}"
    const val RESULT = "result/{sessionId}"

    fun module(id: Int) = "module/$id"
    fun session(scenarioId: Int, name: String) =
        "session/$scenarioId/${java.net.URLEncoder.encode(name, "UTF-8")}"
    fun result(sessionId: Int) = "result/$sessionId"
}

@Composable
fun AppNav() {
    val vm: TrainerViewModel = viewModel()
    val nav = rememberNavController()

    val auth by vm.auth.collectAsState()
    val catalog by vm.catalog.collectAsState()
    val detail by vm.detail.collectAsState()
    val progress by vm.progress.collectAsState()

    val start = if (auth.loggedIn) Routes.DASHBOARD else Routes.LOGIN

    NavHost(navController = nav, startDestination = start) {
        composable(Routes.LOGIN) {
            LoginScreen(
                loading = auth.loading,
                error = auth.error,
                onLogin = { u, p -> vm.login(u, p) },
            )
            // Navigate as soon as a session exists.
            if (auth.loggedIn) {
                nav.navigate(Routes.DASHBOARD) { popUpTo(Routes.LOGIN) { inclusive = true } }
            }
        }

        composable(Routes.DASHBOARD) {
            val user = auth.user
            if (user == null) {
                nav.navigate(Routes.LOGIN) { popUpTo(Routes.DASHBOARD) { inclusive = true } }
            } else {
                DashboardScreen(
                    user = user,
                    modules = catalog.modules,
                    progress = progress.progress,
                    loading = catalog.loading,
                    error = catalog.error,
                    onOpenModule = { id ->
                        vm.loadModule(id)
                        nav.navigate(Routes.module(id))
                    },
                    onOpenProgress = {
                        vm.loadProgress()
                        nav.navigate(Routes.PROGRESS)
                    },
                    onLogout = {
                        vm.logout()
                        nav.navigate(Routes.LOGIN) { popUpTo(0) }
                    },
                )
                // Refresh the catalog (and progress badges) on entry.
                androidx.compose.runtime.LaunchedEffect(Unit) {
                    vm.loadCatalog()
                    vm.loadProgress()
                }
            }
        }

        composable(Routes.PROGRESS) {
            ProgressScreen(
                progress = progress.progress,
                history = progress.history,
                loading = progress.loading,
                error = progress.error,
                onLoad = { vm.loadProgress() },
            )
        }

        composable(
            Routes.MODULE,
            arguments = listOf(navArgument("moduleId") { type = NavType.IntType }),
        ) { entry ->
            val id = entry.arguments?.getInt("moduleId") ?: 0
            ModuleDetailScreen(
                detail = detail.detail,
                loading = detail.loading,
                error = detail.error,
                onStart = { scenarioId ->
                    val name = detail.detail?.scenarios
                        ?.firstOrNull { it.id == scenarioId }?.name ?: "Latihan"
                    nav.navigate(Routes.session(scenarioId, name))
                },
            )
            androidx.compose.runtime.LaunchedEffect(id) { vm.loadModule(id) }
        }

        composable(
            Routes.SESSION,
            arguments = listOf(
                navArgument("scenarioId") { type = NavType.IntType },
                navArgument("scenarioName") { type = NavType.StringType },
            ),
        ) { entry ->
            val scenarioId = entry.arguments?.getInt("scenarioId") ?: 0
            val rawName = entry.arguments?.getString("scenarioName").orEmpty()
            val scenarioName = java.net.URLDecoder.decode(rawName, "UTF-8")
            LiveSessionScreen(
                api = vm.api,
                scenarioId = scenarioId,
                scenarioName = scenarioName,
                onFinished = { sessionId ->
                    nav.navigate(Routes.result(sessionId)) {
                        popUpTo(Routes.DASHBOARD)
                    }
                },
            )
        }

        composable(
            Routes.RESULT,
            arguments = listOf(navArgument("sessionId") { type = NavType.IntType }),
        ) { entry ->
            val sessionId = entry.arguments?.getInt("sessionId") ?: 0
            ResultScreen(
                api = vm.api,
                sessionId = sessionId,
                onRetry = {
                    // Back to the module so the sales can pick a scenario again.
                    nav.popBackStack(Routes.DASHBOARD, inclusive = false)
                },
                onBackToDashboard = {
                    vm.loadProgress()
                    nav.popBackStack(Routes.DASHBOARD, inclusive = false)
                },
            )
        }
    }

    // Keep LocalContext referenced so the VM is created with the right context.
    LocalContext.current
}
