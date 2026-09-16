#!/usr/bin/env python3
"""
proto_gemini_live2.py — same as v1, but sends an explicit activityEnd.

WHY: v1 measured TTFA of 2.0-4.1s. That is NOT faster than the existing pipeline
(3.7s), which would make the whole migration pointless on latency grounds. The
likely cause is turn detection: without an explicit end-of-speech signal, the
model waits for its internal VAD timeout before it starts answering.

Live API supports explicit turn control:
  activityStart  -> "the user began speaking"
  activityEnd    -> "the user stopped; answer now"

If TTFA drops materially with activityEnd, the migration is worth it on latency
too. If it does not, the migration is justified only by naturalness, and I should
say so plainly instead of overselling it.
"""
from __future__ import annotations

import argparse
import asyncio
import base64
import json
import subprocess
import time
from pathlib import Path

import websockets

WS_URL = (
    "wss://generativelanguage.googleapis.com/ws/"
    "google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent"
)
MODEL = "models/gemini-2.5-flash-native-audio-latest"
IN_RATE, OUT_RATE = 16000, 24000

PERSONA = (
    "Kamu adalah Ibu Sari, staf front office (CS) di Dinas Pendidikan Kabupaten. "
    "Kamu sedang menerima telepon dari seorang sales perusahaan IT. "
    "Bicaralah seperti orang Indonesia sungguhan di telepon: santai, singkat, "
    "1-2 kalimat saja. Jangan pernah menyapa ulang di setiap balasan. "
    "Kadang agak sibuk dan sedikit ketus, tapi tetap sopan. "
    "Jangan pakai bahasa kaku/birokratis, jangan pakai markdown atau daftar."
)


def load_key() -> str:
    import re, sqlite3
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


def to_pcm(path: str, rate: int) -> bytes:
    return subprocess.run(
        ["ffmpeg", "-v", "error", "-i", path, "-ar", str(rate), "-ac", "1",
         "-f", "s16le", "-acodec", "pcm_s16le", "-"],
        capture_output=True, check=True).stdout


async def run(audio: str, voice: str, mode: str, chunk_ms: int) -> dict:
    key = load_key()
    pcm = to_pcm(audio, IN_RATE)
    chunk = int(IN_RATE * 2 * chunk_ms / 1000)
    r: dict = {"mode": mode, "voice": voice}

    async with websockets.connect(f"{WS_URL}?key={key}", max_size=None,
                                  open_timeout=30) as ws:
        await ws.send(json.dumps({"setup": {
            "model": MODEL,
            "generationConfig": {
                "responseModalities": ["AUDIO"],
                "speechConfig": {"voiceConfig": {
                    "prebuiltVoiceConfig": {"voiceName": voice}}},
            },
            "systemInstruction": {"parts": [{"text": PERSONA}]},
            "inputAudioTranscription": {},
            "outputAudioTranscription": {},
            # Explicit turn control requires automatic VAD to be OFF. The API
            # rejects activityStart/activityEnd otherwise (close code 1007).
            "realtimeInputConfig": {
                "automaticActivityDetection": {"disabled": mode == "explicit"},
            },
        }}))
        while True:
            if "setupComplete" in json.loads(await asyncio.wait_for(ws.recv(), 30)):
                break

        # explicit turn boundaries when requested
        if mode == "explicit":
            await ws.send(json.dumps({"realtimeInput": {"activityStart": {}}}))

        t_send = time.perf_counter()
        for i in range(0, len(pcm), chunk):
            await ws.send(json.dumps({"realtimeInput": {"mediaChunks": [{
                "mimeType": f"audio/pcm;rate={IN_RATE}",
                "data": base64.b64encode(pcm[i:i + chunk]).decode()}]}}))
            await asyncio.sleep(chunk_ms / 1000)
        t_end = time.perf_counter()
        r["send_s"] = round(t_end - t_send, 2)

        if mode == "explicit":
            await ws.send(json.dumps({"realtimeInput": {"activityEnd": {}}}))
            r["activity_end_sent"] = True
        else:
            r["activity_end_sent"] = False

        out = bytearray()
        in_tx, out_tx = [], []
        t_first = None
        deadline = time.perf_counter() + 45
        while True:
            rem = deadline - time.perf_counter()
            if rem <= 0:
                break
            try:
                msg = json.loads(await asyncio.wait_for(ws.recv(), timeout=rem))
            except asyncio.TimeoutError:
                break
            sc = msg.get("serverContent") or {}
            if sc.get("inputTranscription", {}).get("text"):
                in_tx.append(sc["inputTranscription"]["text"])
            if sc.get("outputTranscription", {}).get("text"):
                out_tx.append(sc["outputTranscription"]["text"])
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
        r["in_tx"] = "".join(in_tx).strip()
        r["out_tx"] = "".join(out_tx).strip()
        if out:
            mp3 = f"/tmp/live_{mode}_{voice}.mp3"
            subprocess.run(["ffmpeg", "-y", "-v", "error", "-f", "s16le", "-ar",
                            str(OUT_RATE), "-ac", "1", "-i", "-",
                            "-codec:a", "libmp3lame", "-b:a", "64k", mp3],
                           input=bytes(out), check=True)
            r["mp3"] = mp3
    return r


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--audio", required=True)
    ap.add_argument("--voice", default="Aoede")
    ap.add_argument("--chunk-ms", type=int, default=100)
    ap.add_argument("--runs", type=int, default=3)
    args = ap.parse_args()

    print(f"membandingkan mode implicit vs explicit ({args.runs}x masing-masing)")
    print()
    summary = {}
    for mode in ("implicit", "explicit"):
        vals = []
        last: dict = {}
        for i in range(args.runs):
            r = asyncio.run(run(args.audio, args.voice, mode, args.chunk_ms))
            vals.append(r.get("ttfa_ms", -1))
            print(f"  [{mode} run{i+1}] TTFA={r.get('ttfa_ms')}ms "
                  f"balasan={r['reply_s']}s | {r['out_tx'][:70]}")
            last = r
        valid = [v for v in vals if v and v > 0]
        summary[mode] = {
            "ttfa": vals,
            "median": sorted(valid)[len(valid)//2] if valid else None,
            "mp3": last.get("mp3"),
            "tx": last["out_tx"],
        }
    print()
    print("── RINGKASAN ───────────────────────────────────────────")
    for m, s in summary.items():
        print(f"  {m:9s}: TTFA {s['ttfa']}  median={s['median']}ms")
        print(f"            '{s['tx'][:80]}'")
    print()
    print(json.dumps(summary, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
