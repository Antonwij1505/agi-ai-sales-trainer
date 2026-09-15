plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
}

android {
    namespace = "com.astongraphindo.agitrainer"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.astongraphindo.agitrainer"
        minSdk = 26          // AudioRecord + EncryptedSharedPreferences requirements
        targetSdk = 35
        versionCode = 1
        versionName = "0.1.0"

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"

        // Base URLs for the trainer backend and the auth service.
        //
        // Defaults target the Android EMULATOR (10.0.2.2 = the host machine), so
        // the committed values stay correct for local runs and CI. Every piece is
        // overridable at build time, because a physical phone needs different
        // addresses — and in production the two services live on DIFFERENT
        // hostnames (trainer.orimax.co.id and sirup-api.orimax.co.id), which is
        // why they are configured separately rather than derived from one host.
        //
        //   # emulator (default)
        //   ./gradlew assembleDebug
        //
        //   # physical phone on the office LAN
        //   ./gradlew assembleDebug -PapiHost=192.168.88.12
        //
        //   # production, over the internet via Cloudflare
        //   ./gradlew assembleDebug -PapiScheme=https \
        //     -PapiHost=trainer.orimax.co.id -PapiPort= \
        //     -PauthHost=sirup-api.orimax.co.id -PauthPort=
        fun url(scheme: String, host: String, port: String) =
            if (port.isEmpty()) "$scheme://$host/" else "$scheme://$host:$port/"

        val apiScheme = (project.findProperty("apiScheme") as String?) ?: "http"
        val apiHost = (project.findProperty("apiHost") as String?) ?: "10.0.2.2"
        val apiPort = (project.findProperty("apiPort") as String?) ?: "4100"

        val authScheme = (project.findProperty("authScheme") as String?) ?: apiScheme
        val authHost = (project.findProperty("authHost") as String?) ?: apiHost
        val authPort = (project.findProperty("authPort") as String?) ?: "4000"

        buildConfigField("String", "API_BASE_URL", "\"${url(apiScheme, apiHost, apiPort)}\"")
        // Auth is served by the Sales Analytics backend (shared JWT contract).
        buildConfigField("String", "AUTH_BASE_URL", "\"${url(authScheme, authHost, authPort)}\"")
    }

    buildTypes {
        debug {
            isMinifyEnabled = false
        }
        release {
            isMinifyEnabled = true
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro",
            )
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }

    packaging {
        resources {
            excludes += "/META-INF/{AL2.0,LGPL2.1}"
        }
    }
}

dependencies {
    val composeBom = platform("androidx.compose:compose-bom:2024.12.01")
    implementation(composeBom)

    implementation("androidx.core:core-ktx:1.15.0")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.8.7")
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.8.7")
    implementation("androidx.activity:activity-compose:1.9.3")

    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.ui:ui-graphics")
    implementation("androidx.compose.ui:ui-tooling-preview")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.material:material-icons-extended")

    // Navigation + secure token storage (no provider secrets ever live here)
    implementation("androidx.navigation:navigation-compose:2.8.5")
    implementation("androidx.security:security-crypto:1.1.0-alpha06")

    // HTTP + JSON. org.json ships with Android, so no serialization library is
    // needed — the wire format is small and hand-mapped in data/Models.kt.
    implementation("com.squareup.okhttp3:okhttp:4.12.0")

    debugImplementation("androidx.compose.ui:ui-tooling")
    debugImplementation("androidx.compose.ui:ui-test-manifest")

    testImplementation("junit:junit:4.13.2")
    androidTestImplementation(composeBom)
    androidTestImplementation("androidx.test.ext:junit:1.2.1")
    androidTestImplementation("androidx.compose.ui:ui-test-junit4")
}
