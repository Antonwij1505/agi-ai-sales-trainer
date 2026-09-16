#!/usr/bin/env python3
"""
proto_gemini_live4.py — find the minimum trailing silence that still closes the turn.

Measured: thinking=off + 700ms trailing silence gives TTFA ~990ms (vs ~3300ms with
thinking on). But that silence is streamed in real time, so the user FEELS
trail + TTFA. Total perceived gap = trail + TTFA, which at 700ms is ~1.7s.

Sweep the trail to find the smallest value that still triggers the reply, and
report the perceived gap, which is the number that actually matters.
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
    for (d,) in con.execute("select data from providerConnections"):
        if isinstance(d, str):
            for m in re.finditer(r"(AIza[0-9A-Za-z_\-]{30,})", d):
                c = d[max(0, m.start() - 400):m.start() + 400].lower()
                if "gemini" in c or "google" in c:
                    con.close()
                    return m.group(1)
    con.close()
    raise SystemExit("no key")


def to_pcm(p: str) -> bytes:
    return subprocess.run(
        ["ffmpeg", "-v", "error", "-i", p, "-ar", str(IN_RATE), "-ac", "1",
         "-f", "s16le", "-acodec", "pcm_s16le", "-"],
        capture_output=True, check=True).stdout


async def one(audio: str, voice: str, trail_ms: int, chunk_ms: int = 100) -> dict:
    key = load_key()
    pcm = to_pcm(audio)
    chunk = int(IN_RATE * 2 * chunk_ms / 1000)
    silence = b"\x00" * int(IN_RATE * 2 * trail_ms / 1000)

    r: dict = {"trail_ms": trail_ms}
    async with websockets.connect(f"{WS_URL}?key={key}", max_size=None,
                                  open_timeout=30) as ws:
        await ws.send(json.dumps({"setup": {
            "model": MODEL,
            "generationConfig": {
                "responseModalities": ["AUDIO"],
                "thinkingConfig": {"thinkingBudget": 0},
                "speechConfig": {"voiceConfig": {
                    "prebuiltVoiceConfig": {"voiceName": voice}}},
            },
            "systemInstruction": {"parts": [{"text": PERSONA}]},
            "inputAudioTranscription": {},
            "outputAudioTranscription": {},
        }}))
        while True:
            if "setupComplete" in json.loads(await asyncio.wait_for(ws.recv(), 30)):
                break

        async def send(buf: bytes) -> None:
            for i in range(0, len(buf), chunk):
                await ws.send(json.dumps({"realtimeInput": {"mediaChunks": [{
                    "mimeType": f"audio/pcm;rate={IN_RATE}",
                    "data": base64.b64encode(buf[i:i + chunk]).decode()}]}}))
                await asyncio.sleep(chunk_ms / 1000)

        await send(pcm)
        t_stop = time.perf_counter()
        if silence:
            await send(silence)
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
                        r["ttfa_after_trail_ms"] = round((t_first - t_end) * 1000)
                        # what the user actually feels: from their last word
                        r["perceived_ms"] = round((t_first - t_stop) * 1000)
                    out.extend(base64.b64decode(d))
            if sc.get("turnComplete"):
                break

        r["reply_s"] = round(len(out) / 2 / OUT_RATE, 2)
        r["tx"] = "".join(tx).strip()
        r["got_audio"] = len(out) > 0
        if out:
            r["mp3"] = f"/tmp/live4_{trail_ms}.mp3"
            subprocess.run(["ffmpeg", "-y", "-v", "error", "-f", "s16le", "-ar",
                            str(OUT_RATE), "-ac", "1", "-i", "-",
                            "-codec:a", "libmp3lame", "-b:a", "64k", r["mp3"]],
                           input=bytes(out), check=True)
    return r


def main() -> None:
    print(f"model={MODEL} thinking=OFF")
    print("mencari hening minimum yang masih memicu balasan")
    print()
    best = None
    for trail in (200, 400, 600, 800, 1000):
        vals, percs, tx = [], [], ""
        for i in range(3):
            r = asyncio.run(one("/tmp/t2.mp3", "Aoede", trail))
            if r.get("got_audio"):
                vals.append(r["ttfa_after_trail_ms"])
                percs.append(r["perceived_ms"])
                tx = r["tx"]
            else:
                vals.append(None)
            print(f"  trail={trail:4d}ms run{i+1}: "
                  f"ttfa={r.get('ttfa_after_trail_ms','-')}ms "
                  f"perceived={r.get('perceived_ms','-')}ms "
                  f"audio={'ya' if r.get('got_audio') else 'TIDAK'}")
        ok = [v for v in vals if v]
        okp = [v for v in percs if v]
        if ok:
            med = int(statistics.median(ok))
            medp = int(statistics.median(okp))
            print(f"  → trail={trail}ms: ttfa_median={med}ms "
                  f"PERCEIVED_median={medp}ms")
            print(f"     '{tx[:70]}'")
            if best is None or medp < best[1]:
                best = (trail, medp, med)
        else:
            print(f"  → trail={trail}ms: TIDAK ada balasan")
        print()
    if best:
        print(f"TERBAIK: trail={best[0]}ms → perceived={best[1]}ms "
              f"(ttfa={best[2]}ms)")


if __name__ == "__main__":
    main()
