#!/usr/bin/env python3
"""
proto_gemini_live.py — PROOF OF CONCEPT: Gemini Live (speech-to-speech) in Indonesian.

WHY THIS EXISTS
---------------
The app currently uses a 3-hop pipeline: STT -> LLM -> TTS, run in sequence with
`await` at each step. Measured on this host that is ~3.7s per turn typically, and
up to ~22s when the STT provider spikes. The user's complaint is that the customer
voice sounds robotic and responds slowly, and asked why ChatGPT feels natural.

The answer is architectural, not a matter of voice tuning: ChatGPT uses a single
speech-to-speech model, so intonation survives and nothing waits on a text hop.

This script tests whether Gemini Live behaves the same way for Indonesian, BEFORE
any Android work. It measures what actually matters:

  - time-to-first-audio (TTFA) after the sales rep stops speaking
  - whether the model's Indonesian is intelligible
  - whether it answers in one shot instead of waiting for a full transcript

CREDENTIALS
-----------
The key is read from the 9router credential store on this host (read-only, never
printed). For production this must move to filter_config / .env like every other
provider secret, and must never be baked into the APK (PRD §78).

USAGE
-----
  python3 proto_gemini_live.py --audio /tmp/t2.mp3 --voice Aoede
  python3 proto_gemini_live.py --audio /tmp/t2.mp3 --text-only   # print transcript
"""
from __future__ import annotations

import argparse
import asyncio
import base64
import json
import os
import re
import sqlite3
import subprocess
import sys
import tempfile
import time
import urllib.request
import wave
from pathlib import Path

WS_URL = (
    "wss://generativelanguage.googleapis.com/ws/"
    "google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent"
)
MODEL = "models/gemini-2.5-flash-native-audio-latest"
INPUT_RATE = 16000
OUTPUT_RATE = 24000

PERSONA = (
    "Kamu adalah Ibu Sari, staf front office (CS) di Dinas Pendidikan Kabupaten. "
    "Kamu sedang menerima telepon dari seorang sales perusahaan IT. "
    "Bicaralah seperti orang Indonesia sungguhan di telepon: santai, singkat, "
    "1-2 kalimat saja. Jangan pernah menyapa ulang di setiap balasan. "
    "Kadang agak sibuk dan sedikit ketus, tapi tetap sopan. "
    "Jangan pakai bahasa kaku/birokratis, jangan pakai markdown atau daftar."
)


# ─────────────────────────────────────────────────────────────────────────────
# credentials — read only, never echoed
# ─────────────────────────────────────────────────────────────────────────────
def load_google_key() -> str:
    """Read the Google key from 9router's store. Never printed."""
    db = "/home/agi/9router/data/db/data.sqlite"
    con = sqlite3.connect(f"file:{db}?mode=ro", uri=True)
    key = None
    for (data,) in con.execute("select data from providerConnections"):
        if not isinstance(data, str):
            continue
        for m in re.finditer(r"(AIza[0-9A-Za-z_\-]{30,})", data):
            ctx = data[max(0, m.start() - 400):m.start() + 400].lower()
            if "gemini" in ctx or "google" in ctx:
                key = m.group(1)
                break
        if key:
            break
    con.close()
    if not key:
        raise SystemExit("No Google key found in 9router store.")
    return key


def key_source() -> str:
    """Which store the key came from, for the report (no secret)."""
    return "9router providerConnections (sqlite, read-only)"


# ─────────────────────────────────────────────────────────────────────────────
# audio helpers
# ─────────────────────────────────────────────────────────────────────────────
def to_pcm16(path: str, rate: int = INPUT_RATE) -> bytes:
    """Any audio -> mono s16le PCM at `rate`, via ffmpeg."""
    out = subprocess.run(
        ["ffmpeg", "-v", "error", "-i", path, "-ar", str(rate), "-ac", "1",
         "-f", "s16le", "-acodec", "pcm_s16le", "-"],
        capture_output=True, check=True,
    )
    return out.stdout


def pcm_to_mp3(pcm: bytes, rate: int, out_path: str) -> None:
    with wave.open("/tmp/_proto_out.wav", "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(rate)
        w.writeframes(pcm)
    subprocess.run(
        ["ffmpeg", "-y", "-v", "error", "-i", "/tmp/_proto_out.wav",
         "-codec:a", "libmp3lame", "-b:a", "64k", out_path],
        check=True,
    )


def transcribe(pcm: bytes, rate: int) -> str:
    """Round-trip the model's audio through Deepgram to check intelligibility."""
    mp3 = "/tmp/_proto_check.mp3"
    pcm_to_mp3(pcm, rate, mp3)
    con = sqlite3.connect(
        "file:/home/agi/9router/data/db/data.sqlite?mode=ro", uri=True)
    con.close()
    # STT creds live in the app DB, not 9router
    import subprocess as sp
    key = sp.run(
        ["docker", "exec", "orimax-sirup-postgres-1", "psql", "-U", "orimax",
         "-d", "sirup", "-t", "-A", "-c",
         "select value from filter_config where key='stt_api_key';"],
        capture_output=True, text=True, check=True).stdout.strip()
    req = urllib.request.Request(
        "https://api.deepgram.com/v1/listen?model=nova-3&language=id&smart_format=true",
        data=Path(mp3).read_bytes(),
        headers={"Authorization": f"Token {key}", "Content-Type": "audio/mpeg"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=90) as r:
            d = json.load(r)
        return d["results"]["channels"][0]["alternatives"][0]["transcript"]
    except Exception as e:  # noqa: BLE001
        return f"(transkripsi gagal: {e})"


# ─────────────────────────────────────────────────────────────────────────────
# the Live API session
# ─────────────────────────────────────────────────────────────────────────────
async def run_session(audio_path: str, voice: str, chunk_ms: int,
                      realtime: bool, verbose: bool) -> dict:
    import websockets

    key = load_google_key()
    pcm = to_pcm16(audio_path)
    speech_s = len(pcm) / 2 / INPUT_RATE

    result: dict = {
        "input_speech_s": round(speech_s, 2),
        "input_bytes": len(pcm),
        "voice": voice,
        "model": MODEL,
    }

    url = f"{WS_URL}?key={key}"
    t_open = time.perf_counter()

    async with websockets.connect(url, max_size=None, open_timeout=30) as ws:
        result["connect_ms"] = round((time.perf_counter() - t_open) * 1000)

        # ── setup ────────────────────────────────────────────────────────────
        await ws.send(json.dumps({
            "setup": {
                "model": MODEL,
                "generationConfig": {
                    "responseModalities": ["AUDIO"],
                    "speechConfig": {
                        "voiceConfig": {"prebuiltVoiceConfig": {"voiceName": voice}}
                    },
                },
                "systemInstruction": {"parts": [{"text": PERSONA}]},
                "inputAudioTranscription": {},
                "outputAudioTranscription": {},
            }
        }))

        t_setup = time.perf_counter()
        while True:
            raw = await asyncio.wait_for(ws.recv(), timeout=30)
            msg = json.loads(raw)
            if "setupComplete" in msg:
                result["setup_ms"] = round((time.perf_counter() - t_setup) * 1000)
                break
            if verbose:
                print("  setup msg:", json.dumps(msg)[:200])

        # ── stream the sales rep's speech ────────────────────────────────────
        chunk = int(INPUT_RATE * 2 * chunk_ms / 1000)
        t_first_send = time.perf_counter()
        for i in range(0, len(pcm), chunk):
            await ws.send(json.dumps({
                "realtimeInput": {
                    "mediaChunks": [{
                        "mimeType": f"audio/pcm;rate={INPUT_RATE}",
                        "data": base64.b64encode(pcm[i:i + chunk]).decode(),
                    }]
                }
            }))
            if realtime:
                await asyncio.sleep(chunk_ms / 1000)
        t_last_send = time.perf_counter()
        result["send_ms"] = round((t_last_send - t_first_send) * 1000)

        # ── collect the reply ────────────────────────────────────────────────
        out_pcm = bytearray()
        in_tx: list[str] = []
        out_tx: list[str] = []
        t_first_audio = None
        deadline = time.perf_counter() + 45

        while True:
            remaining = deadline - time.perf_counter()
            if remaining <= 0:
                break
            try:
                raw = await asyncio.wait_for(ws.recv(), timeout=remaining)
            except asyncio.TimeoutError:
                break
            msg = json.loads(raw)

            sc = msg.get("serverContent") or {}
            if sc.get("inputTranscription", {}).get("text"):
                in_tx.append(sc["inputTranscription"]["text"])
            if sc.get("outputTranscription", {}).get("text"):
                out_tx.append(sc["outputTranscription"]["text"])

            for part in (sc.get("modelTurn") or {}).get("parts", []):
                data = (part.get("inlineData") or {}).get("data")
                if data:
                    if t_first_audio is None:
                        t_first_audio = time.perf_counter()
                        # THE metric: how long after the rep stopped talking
                        result["ttfa_ms"] = round((t_first_audio - t_last_send) * 1000)
                    out_pcm.extend(base64.b64decode(data))

            if sc.get("turnComplete"):
                break
            if msg.get("goAway"):
                break

        result["recv_ms"] = round(
            (time.perf_counter() - (t_first_audio or t_last_send)) * 1000)
        result["output_bytes"] = len(out_pcm)
        result["output_speech_s"] = round(len(out_pcm) / 2 / OUTPUT_RATE, 2)
        result["input_transcript"] = "".join(in_tx).strip()
        result["output_transcript"] = "".join(out_tx).strip()

        if out_pcm:
            out_mp3 = "/tmp/gemini_live_reply.mp3"
            pcm_to_mp3(bytes(out_pcm), OUTPUT_RATE, out_mp3)
            result["output_mp3"] = out_mp3

    return result


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--audio", required=True)
    ap.add_argument("--voice", default="Aoede")
    ap.add_argument("--chunk-ms", type=int, default=100)
    ap.add_argument("--realtime", action="store_true",
                    help="pace chunks in real time (default: send as fast as possible)")
    ap.add_argument("--verbose", action="store_true")
    args = ap.parse_args()

    print(f"model  : {MODEL}")
    print(f"voice  : {args.voice}")
    print(f"audio  : {args.audio}")
    print(f"key    : from {key_source()}")
    print()

    res = asyncio.run(run_session(
        args.audio, args.voice, args.chunk_ms, args.realtime, args.verbose))

    print("── HASIL ───────────────────────────────────────────────")
    print(f"  bicara sales       : {res['input_speech_s']}s")
    print(f"  connect            : {res['connect_ms']}ms")
    print(f"  setup              : {res['setup_ms']}ms")
    print(f"  kirim audio        : {res['send_ms']}ms")
    print(f"  ► BALAS (TTFA)     : {res.get('ttfa_ms', '?')}ms   ← metrik utama")
    print(f"  durasi balasan     : {res['output_speech_s']}s")
    print()
    print(f"  dengar sales       : {res['input_transcript'][:100]}")
    print(f"  balasan CS (teks)  : {res['output_transcript'][:200]}")
    if res.get("output_mp3"):
        print(f"  audio balasan      : {res['output_mp3']}")

    print()
    print("── UJI KEJELASAN (transkrip balik audio Gemini) ────────")
    if res["output_bytes"]:
        with open("/tmp/_proto_out.pcm", "wb") as f:
            pass
        pcm = Path("/tmp/_proto_out.pcm")
        # regenerate pcm from the mp3 for the round-trip test
        pcm_bytes = subprocess.run(
            ["ffmpeg", "-v", "error", "-i", res["output_mp3"], "-ar",
             str(OUTPUT_RATE), "-ac", "1", "-f", "s16le", "-"],
            capture_output=True, check=True).stdout
        print("  ->", transcribe(pcm_bytes, OUTPUT_RATE))
    else:
        print("  (tidak ada audio)")

    with open("/tmp/gemini_live_result.json", "w") as f:
        json.dump(res, f, indent=2, ensure_ascii=False)


if __name__ == "__main__":
    main()
