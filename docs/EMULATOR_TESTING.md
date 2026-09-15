# Android emulator: rendering & testing

Notes on how the APK is run and verified, including the Result screen, which
cannot be reached through the normal UI on this host.

## Why the Result screen needed a different approach

The Result screen only appears after a completed voice conversation. Completing
one requires the app to capture speech through the microphone, and **the Android
emulator on this host cannot be given an audio source**:

- `-audio alsa` → `Unknown audio driver 'alsa'`. Emulator 37.1.11 dropped the
  ALSA backend; `-help-all` lists only `pa`, `sdl`, `oss`, `none`.
- `sdl` → the help text states it does not support audio input.
- `pa` → `Could not init 'pa' audio driver`, even with
  `PULSE_SERVER=unix:/run/user/1000/pulse/native` and
  `QEMU_PA_SINK/QEMU_PA_SOURCE` set.

So the screen was extracted into a stateless `ResultContent` composable and
rendered by an instrumented Compose test instead. This is the standard way to
cover a screen whose precondition cannot be produced in the emulator.

## What DOES work: a virtual microphone loopback on the host

Even though the emulator cannot consume it, the loopback itself is verified and
useful for testing the STT path without a device:

```bash
# one-time: null sink whose monitor acts as a fake mic
pactl load-module module-null-sink sink_name=agimic \
       sink_properties=device.description=AGI_Mic

# prove it end to end: play a clip in, capture it out, transcribe it
bash backend/scripts/loopback_stt_test.sh /path/to/indonesian_clip.mp3
```

Measured result: captured level **-18.8 dB** (not silence), and Groq
`whisper-large-v3` transcribed it correctly as
*"Selamat pagi Bu, saya Adi dari Orimas. Kami supplier Solusi IT untuk instansi
pemerintah. Boleh saya bicara dengan bagian pengadaan?"*

`~/.asoundrc` routes ALSA's default device to PulseAudio so `arecord -D agimic`
works. Remove that file to revert.

## Running the tests

```bash
# start a headless emulator
export ANDROID_HOME="$HOME/Android/Sdk"
"$ANDROID_HOME/emulator/emulator" -avd agi_test -no-window -no-audio \
  -no-boot-anim -gpu swiftshader_indirect -no-snapshot -port 5554 &

adb wait-for-device
until [ "$(adb shell getprop sys.boot_completed | tr -d '\r')" = "1" ]; do sleep 5; done

# run instrumented tests (includes ResultScreenTest + ResultScreenshotTest)
cd android && gradle connectedDebugAndroidTest

# pull the captured screenshot (app-scoped dir — /sdcard/Download is blocked by
# Android 14 scoped storage and fails with EACCES)
adb pull /sdcard/Android/data/com.astongraphindo.agitrainer/files/result_screen.png \
  /tmp/result_screen.png
```

## A note on the Result screen test

The screen was previously laid out with a `LazyColumn`. That only composes the
items currently on screen, so on the CI emulator (which reports
`androidboot.qemu.skin=320x640`) the lower sections were **not in the semantics
tree at all** — `performScrollTo()` could not find the back button. The suite
passed on a 1080x2400 emulator and failed on the runner.

It is now a plain `Column` + `verticalScroll`: the page has a fixed, small number
of items, so lazy virtualisation bought nothing and only cost correctness. Tests
use `assertIsDisplayed()` only for content above the fold and `assertExists()` for
the rest, so they no longer depend on display size.

## Emulator setup (one time)

```bash
sdkmanager "emulator" "system-images;android-34;google_apis;x86_64"
avdmanager create avd -n agi_test \
  -k "system-images;android-34;google_apis;x86_64" -d pixel_6
```

KVM is required and available here (`/dev/kvm`, `kvm_intel` loaded, nested=Y).
