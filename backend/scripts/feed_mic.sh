#!/usr/bin/env bash
# =============================================================================
# feed_mic.sh — play an audio file into the Android emulator's microphone.
#
# How it works: `agimic` is a PulseAudio null sink. Its monitor is a valid
# capture source, and ~/.asoundrc routes ALSA's capture device to PulseAudio.
# So anything played INTO agimic can be recorded FROM agimic — which is exactly
# what the emulator's ALSA input backend does.
#
# Usage:  bash feed_mic.sh <audio-file> [seconds]
# =============================================================================
set -uo pipefail

FILE="${1:?usage: feed_mic.sh <audio-file> [seconds]}"
SECONDS_TO_PLAY="${2:-8}"

if [ ! -f "$FILE" ]; then
  echo "no such file: $FILE" >&2
  exit 1
fi

# Normalise to what the emulator/whisper path expects: 16 kHz mono PCM.
TMP_WAV=$(mktemp /tmp/feedmic-XXXXXX.wav)
trap 'rm -f "$TMP_WAV"' EXIT

ffmpeg -y -loglevel error -i "$FILE" -ar 16000 -ac 1 "$TMP_WAV" || {
  echo "ffmpeg failed to convert $FILE" >&2
  exit 1
}

echo "playing $FILE into agimic for ${SECONDS_TO_PLAY}s"
# paplay blocks until the clip finishes; run it in the background so the caller
# can start recording at the same time.
paplay --device=agimic "$TMP_WAV" &
PLAY_PID=$!

# Keep the sink "live" for the requested window even if the clip is shorter,
# otherwise the monitor goes IDLE and the emulator sees silence.
sleep "$SECONDS_TO_PLAY"
kill "$PLAY_PID" 2>/dev/null || true
wait "$PLAY_PID" 2>/dev/null || true

echo "done"
