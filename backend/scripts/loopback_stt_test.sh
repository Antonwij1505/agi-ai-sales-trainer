#!/usr/bin/env bash
# =============================================================================
# loopback_stt_test.sh — prove the virtual microphone path end to end.
#
# Records from the `agimic` loopback while playing an Indonesian clip into it,
# then transcribes the result with the SAME STT provider the app uses. If the
# transcript matches the spoken text, the emulator will be able to hear.
#
# Usage: bash loopback_stt_test.sh <audio-file>
# =============================================================================
set -uo pipefail

SRC="${1:?usage: loopback_stt_test.sh <audio-file>}"
WAV=/tmp/loop_turn.wav
PG_CONTAINER="${PG_CONTAINER:-orimax-sirup-postgres-1}"

# Normalise the clip to 16 kHz mono PCM — what the emulator and whisper expect.
ffmpeg -y -loglevel error -i "$SRC" -ar 16000 -ac 1 /tmp/feed_turn.wav || exit 1

# Record first, feed second: the sink must have a live reader before playback
# starts, otherwise the monitor reports silence.
( sleep 1; paplay --device=agimic /tmp/feed_turn.wav; sleep 2 ) &
FEED=$!
timeout 15 arecord -D agimic -f S16_LE -r 16000 -c 1 -d 12 "$WAV" >/dev/null 2>&1
wait "$FEED" 2>/dev/null || true

if [ ! -s "$WAV" ]; then
  echo "FAIL: nothing captured from agimic"
  exit 1
fi

LEVEL=$(ffmpeg -hide_banner -i "$WAV" -af volumedetect -f null /dev/null 2>&1 \
  | grep mean_volume | sed 's/.*mean_volume: //')
echo "captured level: $LEVEL"

KEY=$(docker exec -i "$PG_CONTAINER" psql -U orimax -d sirup -t -c \
  "select value from filter_config where key='stt_api_key';" | xargs)
if [ -z "$KEY" ]; then
  echo "FAIL: no stt_api_key in filter_config"
  exit 1
fi

echo "--- transcript ---"
curl -s -m 60 https://api.groq.com/openai/v1/audio/transcriptions \
  -H "Authorization: Bearer $KEY" \
  -F "file=@$WAV" \
  -F "model=whisper-large-v3" \
  -F "language=id" \
  -F "response_format=json" \
  | python3 -c 'import json,sys; print(json.load(sys.stdin).get("text","(none)"))'
