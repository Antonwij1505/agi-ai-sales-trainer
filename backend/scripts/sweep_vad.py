#!/usr/bin/env python3
"""
sweep_vad.py — cari setelan VAD otomatis Gemini yang paling pas untuk latihan sales.

Masalah yang diukur: transkrip suara sales muncul terlambat dan terpotong di
tengah kalimat ("Orimas, Bu" padahal "Orimax"). Penyebabnya VAD otomatis Gemini
menutup giliran pada jeda alami di tengah kalimat.

Skrip ini bicara langsung ke Gemini Live (bukan lewat relay) dan menyapu beberapa
kombinasi `automaticActivityDetection`, mengukur:
  - transkrip SALES pertama muncul kapan (relatif ke awal bicara)
  - apakah transkrip utuh (berisi kata terakhir)
  - TTFA (audio balasan pertama)
  - berapa potongan transkrip (fragmentasi)

Audio ucapan + ekor hening dikirim real-time, seperti aplikasi.
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
IN_RATE, OUT_RATE = 16000, 24000

PERSONA = (
    "Kamu adalah Ibu Sari, staf front office (CS) di Dinas Pendidikan Kabupaten, "
    "menerima telepon dari sales perusahaan IT. Bicaralah seperti orang Indonesia "
    "sungguhan di telepon: santai, singkat, 1-2 kalimat. Jangan menyapa ulang."
)

# Ucapan dengan jeda alami di tengah (setelah koma) — ini yang biasanya dipotong VAD.
UTTERANCE = ("Selamat pagi Pak, saya Adi dari Orimax, "
             "boleh bicara dengan bagian pengadaan IT?")
KEYWORD_AKHIR = "pengadaan"


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
         '--write-media', '/tmp/_sv.mp3'], capture_output=True, check=True)
    return subprocess.run(
        ['/home/agi/.hermes/tools/ffmpeg-9.0.1-linux-x64/bin/ffmpeg',
         '-v', 'error', '-i', '/tmp/_sv.mp3', '-ar', str(IN_RATE),
         '-ac', '1', '-f', 's16le', '-acodec', 'pcm_s16le', '-'],
        capture_output=True, check=True).stdout


async def one_run(api_key: str, vad: dict, pcm: bytes, trail_ms: int) -> dict:
    url = f"{WS}?key={api_key}"
    result: dict = {"vad": vad, "trail_ms": trail_ms}

    async with websockets.connect(url, max_size=None, open_timeout=30) as ws:
        setup = {
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
        }
        await ws.send(json.dumps({"setup": setup}))
        while True:
            m = json.loads(await asyncio.wait_for(ws.recv(), 30))
            if "setupComplete" in m:
                break
            if m.get("error"):
                result["error"] = m["error"].get("message")
                return result

        t0 = time.perf_counter()
        events: list[tuple[float, dict]] = []
        done = asyncio.Event()

        async def reader() -> None:
            try:
                while not done.is_set():
                    m = json.loads(await asyncio.wait_for(ws.recv(), 40))
                    events.append((time.perf_counter(), m))
                    sc = m.get("serverContent") or {}
                    if sc.get("turnComplete"):
                        done.set()
                        return
            except Exception as e:  # noqa: BLE001
                result["reader_error"] = str(e)

        task = asyncio.create_task(reader())

        chunk = int(IN_RATE * 2 * 0.1)  # 100 ms
        for i in range(0, len(pcm), chunk):
            await ws.send(json.dumps({
                "realtimeInput": {"mediaChunks": [{
                    "mimeType": f"audio/pcm;rate={IN_RATE}",
                    "data": base64.b64encode(pcm[i:i + chunk]).decode(),
                }]},
            }))
            await asyncio.sleep(0.1)
        t_spoken = time.perf_counter()

        silence = b"\x00\x00" * int(IN_RATE * trail_ms / 1000)
        for i in range(0, len(silence), chunk):
            await ws.send(json.dumps({
                "realtimeInput": {"mediaChunks": [{
                    "mimeType": f"audio/pcm;rate={IN_RATE}",
                    "data": base64.b64encode(silence[i:i + chunk]).decode(),
                }]},
            }))
            await asyncio.sleep(0.1)

        try:
            await asyncio.wait_for(done.wait(), 20)
        except asyncio.TimeoutError:
            result["timeout"] = True

        sales_parts: list[str] = []
        first_sales = None
        first_audio = None
        cs_text = ""
        for ts, m in events:
            sc = m.get("serverContent") or {}
            it = (sc.get("inputTranscription") or {}).get("text")
            if it:
                if first_sales is None:
                    first_sales = ts - t0
                sales_parts.append(it)
            ot = (sc.get("outputTranscription") or {}).get("text")
            if ot:
                cs_text += ot
            if sc.get("modelTurn"):
                if first_audio is None:
                    first_audio = ts - t0

        sales = "".join(sales_parts).strip()
        result.update({
            "spoken_s": round(t_spoken - t0, 2),
            "first_sales_s": round(first_sales, 2) if first_sales else None,
            "first_audio_s": round(first_audio, 2) if first_audio else None,
            "sales_fragments": len(sales_parts),
            "sales_text": sales,
            "sales_complete": KEYWORD_AKHIR in sales.lower(),
            "cs_text": cs_text.strip(),
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
    ap.add_argument("--trail-ms", type=int, default=600)
    args = ap.parse_args()

    key = load_key()
    pcm = tts(UTTERANCE)

    configs = [
        ("default (no config)", {}),
        ("silence=800 low/low", {"silenceDurationMs": 800,
                                 "startOfSpeechSensitivity": "START_SENSITIVITY_LOW",
                                 "endOfSpeechSensitivity": "END_SENSITIVITY_LOW",
                                 "prefixPaddingMs": 20}),
        ("silence=500 high/low", {"silenceDurationMs": 500,
                                  "startOfSpeechSensitivity": "START_SENSITIVITY_HIGH",
                                  "endOfSpeechSensitivity": "END_SENSITIVITY_LOW",
                                  "prefixPaddingMs": 20}),
        ("silence=300 high/high", {"silenceDurationMs": 300,
                                   "startOfSpeechSensitivity": "START_SENSITIVITY_HIGH",
                                   "endOfSpeechSensitivity": "END_SENSITIVITY_HIGH",
                                   "prefixPaddingMs": 20}),
    ]

    for label, vad in configs:
        try:
            r = await one_run(key, vad, pcm, args.trail_ms)
        except Exception as e:  # noqa: BLE001
            print(f"{label}: ERROR {e}")
            continue
        print(f"--- {label} ---")
        print(f"  transkrip pertama : {r.get('first_sales_s')}s   audio pertama: {r.get('first_audio_s')}s")
        print(f"  fragmentasi       : {r.get('sales_fragments')}   utuh: {r.get('sales_complete')}")
        print(f"  SALES: {r.get('sales_text')}")
        print(f"  CS   : {r.get('cs_text')}")
        if r.get("error"):
            print(f"  error: {r['error']}")
        print()


if __name__ == "__main__":
    asyncio.run(main())
