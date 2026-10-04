#!/usr/bin/env python3
"""
sweep_pause.py — apakah VAD memotong kalimat saat sales berhenti sejenak?

Ini risiko yang paling mahal: sales sering berhenti 0,5–1 detik untuk berpikir
di tengah kalimat. Kalau VAD menutup giliran di situ, CS menjawab separuh
pertanyaan — bug yang jauh lebih buruk daripada balasan lambat 0,3 detik.

Skrip ini menyisipkan hening di tengah kalimat (setelah "Orimax,") sepanjang
P_MS, lalu melaporkan apakah transkrip tetap utuh (mengandung "pengadaan") dan
berapa banyak giliran yang terbentuk.
"""
from __future__ import annotations

import argparse
import asyncio
import base64
import json
import re
import sqlite3
import subprocess
import time

import websockets

WS = ("wss://generativelanguage.googleapis.com/ws/"
      "google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent")
MODEL = "models/gemini-2.5-flash-native-audio-latest"
IN_RATE = 16000

PERSONA = (
    "Kamu adalah Ibu Sari, staf front office (CS) di Dinas Pendidikan Kabupaten, "
    "menerima telepon dari sales perusahaan IT. Bicaralah seperti orang Indonesia "
    "sungguhan di telepon: santai, singkat, 1-2 kalimat. Jangan menyapa ulang."
)

PART_A = "Selamat pagi Pak, saya Adi dari Orimax,"
PART_B = "boleh bicara dengan bagian pengadaan IT?"


def load_key() -> str:
    con = sqlite3.connect("file:/home/agi/9router/data/db/data.sqlite?mode=ro", uri=True)
    for (d,) in con.execute("select data from providerConnections"):
        if isinstance(d, str):
            for m in re.finditer(r"(AIza[0-9A-Za-z_\-]{30,})", d):
                c = d[max(0, m.start() - 400):m.start() + 400].lower()
                if "gemini" in c or "google" in c:
                    con.close()
                    return m.group(1)
    con.close()
    raise SystemExit("no key")


def tts(text: str) -> bytes:
    subprocess.run(
        ['/home/agi/.hermes/installs/d355804af649e50e/environments/'
         '9ac9f237e78a47d599363f332fe2ba26/venv/bin/edge-tts',
         '--voice', 'id-ID-ArdiNeural', '--rate=+8%', '--text', text,
         '--write-media', '/tmp/_sp.mp3'], capture_output=True, check=True)
    return subprocess.run(
        ['/home/agi/.hermes/tools/ffmpeg-9.0.1-linux-x64/bin/ffmpeg',
         '-v', 'error', '-i', '/tmp/_sp.mp3', '-ar', str(IN_RATE),
         '-ac', '1', '-f', 's16le', '-acodec', 'pcm_s16le', '-'],
        capture_output=True, check=True).stdout


async def one_run(key: str, vad: dict, pcm_a: bytes, pcm_b: bytes, pause_ms: int) -> dict:
    url = f"{WS}?key={key}"
    result: dict = {"vad": vad, "pause_ms": pause_ms}
    silence = b"\x00\x00" * int(IN_RATE * pause_ms / 1000)
    trail = b"\x00\x00" * int(IN_RATE * 1.2)
    stream = pcm_a + silence + pcm_b + trail

    async with websockets.connect(url, max_size=None, open_timeout=30) as ws:
        await ws.send(json.dumps({"setup": {
            "model": MODEL,
            "generationConfig": {
                "responseModalities": ["AUDIO"],
                "thinkingConfig": {"thinkingBudget": 0},
                "speechConfig": {"voiceConfig": {"prebuiltVoiceConfig": {"voiceName": "Puck"}}},
            },
            "systemInstruction": {"parts": [{"text": PERSONA}]},
            "inputAudioTranscription": {},
            "outputAudioTranscription": {},
            "realtimeInputConfig": {"automaticActivityDetection": vad},
        }}))
        while True:
            m = json.loads(await asyncio.wait_for(ws.recv(), 30))
            if "setupComplete" in m:
                break
            if m.get("error"):
                result["error"] = m["error"].get("message")
                return result

        events: list[dict] = []
        done = asyncio.Event()

        async def reader() -> None:
            try:
                while not done.is_set():
                    m = json.loads(await asyncio.wait_for(ws.recv(), 45))
                    events.append(m)
                    if (m.get("serverContent") or {}).get("turnComplete"):
                        done.set()
                        return
            except Exception as e:  # noqa: BLE001
                result["reader_error"] = str(e)

        task = asyncio.create_task(reader())

        chunk = int(IN_RATE * 2 * 0.1)
        t0 = time.perf_counter()
        for i in range(0, len(stream), chunk):
            await ws.send(json.dumps({
                "realtimeInput": {"mediaChunks": [{
                    "mimeType": f"audio/pcm;rate={IN_RATE}",
                    "data": base64.b64encode(stream[i:i + chunk]).decode(),
                }]},
            }))
            await asyncio.sleep(0.1)

        try:
            await asyncio.wait_for(done.wait(), 25)
        except asyncio.TimeoutError:
            result["timeout"] = True

        sales = ""
        cs = ""
        turn_completes = 0
        first_audio = None
        for m in events:
            sc = m.get("serverContent") or {}
            it = (sc.get("inputTranscription") or {}).get("text")
            if it:
                sales += it
            ot = (sc.get("outputTranscription") or {}).get("text")
            if ot:
                cs += ot
            if sc.get("modelTurn") and first_audio is None:
                first_audio = time.perf_counter() - t0
            if sc.get("turnComplete"):
                turn_completes += 1

        result.update({
            "sales": sales.strip(),
            "cs": cs.strip(),
            "utuh": "pengadaan" in sales.lower(),
            "turn_completes": turn_completes,
        })
        done.set()
        task.cancel()
        try:
            await ws.close()
        except Exception:  # noqa: BLE001
            pass
    return result


async def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--pauses", default="600,900")
    args = ap.parse_args()

    key = load_key()
    a = tts(PART_A)
    b = tts(PART_B)

    configs = [
        ("silence=1200 high/low", {"silenceDurationMs": 1200,
                                   "startOfSpeechSensitivity": "START_SENSITIVITY_HIGH",
                                   "endOfSpeechSensitivity": "END_SENSITIVITY_LOW",
                                   "prefixPaddingMs": 20}),
        ("silence=1600 high/low", {"silenceDurationMs": 1600,
                                   "startOfSpeechSensitivity": "START_SENSITIVITY_HIGH",
                                   "endOfSpeechSensitivity": "END_SENSITIVITY_LOW",
                                   "prefixPaddingMs": 20}),
        ("silence=2000 low/low", {"silenceDurationMs": 2000,
                                  "startOfSpeechSensitivity": "START_SENSITIVITY_LOW",
                                  "endOfSpeechSensitivity": "END_SENSITIVITY_LOW",
                                  "prefixPaddingMs": 20}),
    ]

    for pause_ms in [int(p) for p in args.pauses.split(",")]:
        for label, vad in configs:
            try:
                r = await one_run(key, vad, a, b, pause_ms)
            except Exception as e:  # noqa: BLE001
                print(f"jeda {pause_ms}ms | {label}: ERROR {e}")
                continue
            print(f"jeda {pause_ms}ms | {label}")
            print(f"   utuh={r.get('utuh')}  giliran={r.get('turn_completes')}  timeout={r.get('timeout')}")
            print(f"   SALES: {r.get('sales')}")
            print(f"   CS   : {r.get('cs')[:110]}")
            if r.get("error"):
                print(f"   error: {r['error']}")
            print()


if __name__ == "__main__":
    asyncio.run(main())
