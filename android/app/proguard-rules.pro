# Keep the Compose runtime and Kotlin metadata.
-keep class androidx.compose.** { *; }
-dontwarn androidx.compose.**

# No provider API keys are ever embedded in the APK (PRD §78), so there is
# nothing secret to strip here. Verify with:
#   unzip -p app-release.apk classes.dex | strings | grep -iE "api[_-]?key|sk-"
