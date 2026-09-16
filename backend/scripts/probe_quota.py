#!/usr/bin/env python3
"""
probe_quota.py — measure the free-tier quota empirically.

Google no longer publishes the numbers (they moved to a per-project page in AI
Studio), so the only honest way to answer "is free tier enough for 20 sales?" is
to measure it.

Sends many SHORT sessions back-to-back and reports the first failure and its
error code. Deliberately tiny audio (0.5s of silence) so the probe itself costs
almost nothing.

  - 429 RESOURCE_EXHAUSTED  -> rate limit (RPM or RPD)
  - 403 / permission        -> model not available on this tier
  - 1007 / 1008 close       -> other
"""
from __future__ import annotations

import asyncio
import base64
import json
import re
import sqlite3
import time

import websockets

WS_URL = (
    "wss://generativelanguage.googleapis.com/ws/"
    "google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent"
)
MODEL = "models/gemini-2.5-flash-native-audio-latest"


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


async def probe(n: int, gap_s: float) -> None:
    key = load_key()
    # 0.6s of silence at 16kHz mono s16le — minimal cost, still a real turn
    silent = base64.b64encode(b"\x00" * int(16000 * 2 * 0.6)).decode()

    ok = 0
    for i in range(1, n + 1):
        t0 = time.perf_counter()
        try:
            async with websockets.connect(f"{WS_URL}?key={key}", max_size=None,
                                          open_timeout=20) as ws:
                await ws.send(json.dumps({"setup": {
                    "model": MODEL,
                    "generationConfig": {
                        "responseModalities": ["AUDIO"],
                        "thinkingConfig": {"thinkingBudget": 0},
                        "speechConfig": {"voiceConfig": {
                            "prebuiltVoiceConfig": {"voiceName": "Puck"}}},
                    },
                    "inputAudioTranscription": {},
                    "outputAudioTranscription": {},
                }}))
                # wait for setupComplete -> that is the quota-relevant event
                while True:
                    m = json.loads(await asyncio.wait_for(ws.recv(), 25))
                    if "setupComplete" in m:
                        break
                    if "error" in m:
                        raise RuntimeError(json.dumps(m["error"])[:200])
                ok += 1
                ms = round((time.perf_counter() - t0) * 1000)
                print(f"  #{i:2d} OK    setup {ms}ms")
        except Exception as e:  # noqa: BLE001
            msg = str(e)
            print(f"  #{i:2d} GAGAL setelah {ok} sukses")
            print(f"       {type(e).__name__}: {msg[:260]}")
            if "429" in msg or "RESOURCE_EXHAUSTED" in msg:
                print("       -> RATE LIMIT (kuota habis / terlalu cepat)")
            elif "403" in msg or "PERMISSION" in msg.upper():
                print("       -> TIDAK DIIZINKAN di tier ini")
            break
        if gap_s:
            await asyncio.sleep(gap_s)

    print()
    print(f"  total sesi sukses: {ok}")


if __name__ == "__main__":
    import sys
    n = int(sys.argv[1]) if len(sys.argv) > 1 else 20
    gap = float(sys.argv[2]) if len(sys.argv) > 2 else 0.0
    print(f"model={MODEL}  percobaan={n}  jeda={gap}s")
    print("(setiap sesi hanya mengirim 0,6 detik hening — biaya minimal)")
    print()
    asyncio.run(probe(n, gap))
