#!/usr/bin/env python3
"""
diag_ttfa_true.py — the honest latency number.

My earlier figures (~991ms, ~1.7s perceived) were measured with automatic VAD on.
diag_vad.py showed that auto-VAD fires at a natural mid-sentence pause, so the model
started answering a TRUNCATED turn — which makes it look fast. Those numbers are
therefore not comparable to the pipeline's 3.7s, which always processes the whole
utterance.

This measures TTFA with explicit turn control (VAD off), so the model always hears
the full utterance, and reports the number alongside the pipeline for an
apples-to-apples comparison.

Also checks whether the trailing-silence trick is still needed when turns are
explicit (it should not be).
"""
from __future__ import annotations

import asyncio
import base64
import json
import re
import sqlite3
import statistics
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
    "sungguhan di telepon: santai, singkat, 1-2 kalimat. Jangan menyapa ulang. "
    "Jangan kaku/birokratis, jangan pakai markdown."
)

UTTERANCES = {
    "pendek (3,4s)": "Selamat pagi Bu, saya Adi dari Orimax.",
    "sedang (6,3s)": "Selamat pagi Bu, saya Adi dari Orimax. Boleh bicara dengan bagian pengadaan IT?",
    "panjang+jeda (9,7s)": (
        "Selamat pagi Bu, saya Adi dari Orimax. "
        "Boleh bicara dengan bagian pengadaan IT? "
        "Kalau boleh, saya juga mau minta nomor kontak Pak Agus ya Bu."),
}


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
        ["/home/agi/.hermes/hermes-agent/venv/bin/edge-tts",
         "--voice", "id-ID-ArdiNeural", "--rate=+8%", "--text", text,
         "--write-media", "/tmp/_true.mp3"], capture_output=True, check=True)
    return subprocess.run(
        ["ffmpeg", "-v", "error", "-i", "/tmp/_true.mp3", "-ar", str(IN_RATE),
         "-ac", "1", "-f", "s16le", "-acodec", "pcm_s16le", "-"],
        capture_output=True, check=True).stdout


async def one(pcm: bytes, trail_ms: int) -> dict:
    """Explicit turn control: VAD off, we decide when the turn ends."""
    key = load_key()
    chunk = int(IN_RATE * 2 * 0.1)
    silence = b"\x00" * int(IN_RATE * 2 * trail_ms / 1000)

    r: dict = {"trail_ms": trail_ms, "speech_s": round(len(pcm) / 2 / IN_RATE, 2)}
    async with websockets.connect(f"{WS}?key={key}", max_size=None,
                                  open_timeout=30) as ws:
        await ws.send(json.dumps({"setup": {
            "model": MODEL,
            "generationConfig": {
                "responseModalities": ["AUDIO"],
                "thinkingConfig": {"thinkingBudget": 0},
                "speechConfig": {"voiceConfig": {
                    "prebuiltVoiceConfig": {"voiceName": "Puck"}}},
            },
            "systemInstruction": {"parts": [{"text": PERSONA}]},
            "inputAudioTranscription": {},
            "outputAudioTranscription": {},
            # required for activityStart/activityEnd
            "realtimeInputConfig": {"automaticActivityDetection": {"disabled": True}},
        }}))
        while True:
            if "setupComplete" in json.loads(await asyncio.wait_for(ws.recv(), 30)):
                break

        await ws.send(json.dumps({"realtimeInput": {"activityStart": {}}}))

        async def send(buf: bytes) -> None:
            for i in range(0, len(buf), chunk):
                await ws.send(json.dumps({"realtimeInput": {"mediaChunks": [{
                    "mimeType": f"audio/pcm;rate={IN_RATE}",
                    "data": base64.b64encode(buf[i:i + chunk]).decode()}]}}))
                await asyncio.sleep(0.1)

        await send(pcm)
        if silence:
            await send(silence)
        t_end = time.perf_counter()
        # the app decides the turn is over
        await ws.send(json.dumps({"realtimeInput": {"activityEnd": {}}}))

        out = bytearray()
        tx, in_tx = [], []
        t_first = None
        deadline = time.perf_counter() + 40
        while True:
            rem = deadline - time.perf_counter()
            if rem <= 0:
                break
            try:
                m = json.loads(await asyncio.wait_for(ws.recv(), timeout=rem))
            except asyncio.TimeoutError:
                break
            sc = m.get("serverContent") or {}
            if sc.get("inputTranscription", {}).get("text"):
                in_tx.append(sc["inputTranscription"]["text"])
            if sc.get("outputTranscription", {}).get("text"):
                tx.append(sc["outputTranscription"]["text"])
            for p in (sc.get("modelTurn") or {}).get("parts", []):
                d = (p.get("inlineData") or {}).get("data")
                if d:
                    if t_first is None:
                        t_first = time.perf_counter()
                        r["ttfa_ms"] = round((t_first - t_end) * 1000)
                    out.extend(base64.b64decode(d))
            if sc.get("turnComplete"):
                break

        r["audio_s"] = round(len(out) / 2 / OUT_RATE, 2)
        r["heard"] = "".join(in_tx).strip()
        r["replied"] = "".join(tx).strip()
    return r


async def main() -> None:
    print(f"model={MODEL} voice=Puck   VAD=OFF (kontrol giliran eksplisit)")
    print("Semua angka = jeda setelah sales selesai bicara.")
    print()
    summary: dict[str, list[int]] = {}
    for label, text in UTTERANCES.items():
        pcm = tts(text)
        real_s = len(pcm) / 2 / IN_RATE
        print(f"═══ {label} — bicara {real_s:.1f}s ═══")
        vals = []
        for trail in (0, 200):
            v = []
            for i in range(2):
                r = await one(pcm, trail)
                v.append(r.get("ttfa_ms", -1))
                if i == 0:
                    print(f"  trail={trail}ms: didengar='{r['heard'][:60]}'")
                    print(f"                  balas  ='{r['replied'][:70]}'")
            ok = [x for x in v if x and x > 0]
            if ok:
                med = int(statistics.median(ok))
                vals.append(med)
                print(f"  trail={trail}ms: TTFA {v} median={med}ms")
        if vals:
            summary[label] = vals
            print(f"  → TTFA terbaik: {min(vals)}ms")
        print()

    print("── RINGKASAN (VAD off, kalimat utuh) ───────────────────")
    for k, v in summary.items():
        print(f"  {k:22s}: {v} ms")
    print()
    print("  pembanding pipeline sekarang: ~3700ms (dan pernah 22000ms)")


if __name__ == "__main__":
    asyncio.run(main())
