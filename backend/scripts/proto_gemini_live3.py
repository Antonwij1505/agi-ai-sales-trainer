#!/usr/bin/env python3
"""
proto_gemini_live3.py — can TTFA be reduced below ~3.3s?

Measured so far:
  - implicit VAD   : median 3346ms
  - explicit turns : median 3766ms  (no better)

So turn detection is NOT the cause; the time goes into generation. Gemini 2.5
models spend time on internal "thinking" before emitting audio. Test whether
thinkingConfig.thinkingBudget=0 removes that, and whether a trailing silence
chunk helps the implicit VAD close the turn sooner.

Every variant runs N times; report min and median so one slow outlier cannot
decide the conclusion.
"""
from __future__ import annotations

import argparse
import asyncio
import base64
import json
import re
import sqlite3
import statistics
import subprocess
import time

import websockets

WS_URL = (
    "wss://generativelanguage.googleapis.com/ws/"
    "google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent"
)
MODEL = "models/gemini-2.5-flash-native-audio-latest"
IN_RATE, OUT_RATE = 16000, 24000
PERSONA = (
    "Kamu adalah Ibu Sari, staf front office (CS) di Dinas Pendidikan Kabupaten, "
    "menerima telepon dari sales perusahaan IT. Bicaralah seperti orang Indonesia "
    "sungguhan di telepon: santai, singkat, 1-2 kalimat. Jangan menyapa ulang. "
    "Jangan kaku/birokratis, jangan pakai markdown."
)


def load_key() -> str:
    con = sqlite3.connect("file:/home/agi/9router/data/db/data.sqlite?mode=ro", uri=True)
    for (data,) in con.execute("select data from providerConnections"):
        if isinstance(data, str):
            for m in re.finditer(r"(AIza[0-9A-Za-z_\-]{30,})", data):
                ctx = data[max(0, m.start() - 400):m.start() + 400].lower()
                if "gemini" in ctx or "google" in ctx:
                    con.close()
                    return m.group(1)
    con.close()
    raise SystemExit("no key")


def to_pcm(p: str, rate: int) -> bytes:
    return subprocess.run(
        ["ffmpeg", "-v", "error", "-i", p, "-ar", str(rate), "-ac", "1",
         "-f", "s16le", "-acodec", "pcm_s16le", "-"],
        capture_output=True, check=True).stdout


async def one(audio: str, voice: str, thinking: bool, trail_ms: int,
              chunk_ms: int = 100) -> dict:
    key = load_key()
    pcm = to_pcm(audio, IN_RATE)
    chunk = int(IN_RATE * 2 * chunk_ms / 1000)
    silence = b"\x00" * int(IN_RATE * 2 * trail_ms / 1000) if trail_ms else b""

    setup: dict = {
        "model": MODEL,
        "generationConfig": {
            "responseModalities": ["AUDIO"],
            "speechConfig": {"voiceConfig": {
                "prebuiltVoiceConfig": {"voiceName": voice}}},
        },
        "systemInstruction": {"parts": [{"text": PERSONA}]},
        "inputAudioTranscription": {},
        "outputAudioTranscription": {},
    }
    if not thinking:
        setup["generationConfig"]["thinkingConfig"] = {"thinkingBudget": 0}

    r: dict = {"thinking": thinking, "trail_ms": trail_ms}
    async with websockets.connect(f"{WS_URL}?key={key}", max_size=None,
                                  open_timeout=30) as ws:
        await ws.send(json.dumps({"setup": setup}))
        while True:
            m = json.loads(await asyncio.wait_for(ws.recv(), 30))
            if "setupComplete" in m:
                break
            if "error" in m:
                r["setup_error"] = m["error"]
                return r

        t_send = time.perf_counter()
        for i in range(0, len(pcm), chunk):
            await ws.send(json.dumps({"realtimeInput": {"mediaChunks": [{
                "mimeType": f"audio/pcm;rate={IN_RATE}",
                "data": base64.b64encode(pcm[i:i + chunk]).decode()}]}}))
            await asyncio.sleep(chunk_ms / 1000)
        if silence:
            for i in range(0, len(silence), chunk):
                await ws.send(json.dumps({"realtimeInput": {"mediaChunks": [{
                    "mimeType": f"audio/pcm;rate={IN_RATE}",
                    "data": base64.b64encode(silence[i:i + chunk]).decode()}]}}))
                await asyncio.sleep(chunk_ms / 1000)
        t_end = time.perf_counter()

        out = bytearray()
        t_first = None
        tx: list[str] = []
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
        r["reply_s"] = round(len(out) / 2 / OUT_RATE, 2)
        r["tx"] = "".join(tx).strip()
        if out:
            r["mp3"] = f"/tmp/live3_{int(thinking)}_{trail_ms}.mp3"
            subprocess.run(["ffmpeg", "-y", "-v", "error", "-f", "s16le", "-ar",
                            str(OUT_RATE), "-ac", "1", "-i", "-",
                            "-codec:a", "libmp3lame", "-b:a", "64k", r["mp3"]],
                           input=bytes(out), check=True)
    return r


VARIANTS = [
    ("thinking=on  trail=0ms", True, 0),
    ("thinking=OFF trail=0ms", False, 0),
    ("thinking=OFF trail=700ms", False, 700),
]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--audio", default="/tmp/t2.mp3")
    ap.add_argument("--voice", default="Aoede")
    ap.add_argument("--runs", type=int, default=3)
    a = ap.parse_args()

    print(f"model={MODEL} voice={a.voice} runs={a.runs}")
    print()
    for label, think, trail in VARIANTS:
        vals, txs = [], []
        for i in range(a.runs):
            r = asyncio.run(one(a.audio, a.voice, think, trail))
            if r.get("setup_error"):
                print(f"  [{label}] SETUP ERROR: {r['setup_error']}")
                break
            vals.append(r.get("ttfa_ms", -1))
            txs.append(r.get("tx", ""))
            print(f"  [{label}] run{i+1}: TTFA={r.get('ttfa_ms')}ms "
                  f"reply={r.get('reply_s')}s | {r.get('tx','')[:60]}")
        ok = [v for v in vals if v and v > 0]
        if ok:
            print(f"  → {label}: min={min(ok)} median={int(statistics.median(ok))}ms")
        print()


if __name__ == "__main__":
    main()
