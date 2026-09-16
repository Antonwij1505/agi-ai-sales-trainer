#!/usr/bin/env python3
"""
probe_session.py — one realistic multi-turn training session.

Answers "is free tier enough for 20 sales?" with a measurement instead of a guess:
runs a 5-turn roleplay as a single persistent Live session (the way the app would),
and reports wall-clock duration and any usageMetadata the server sends.

Reuses the same audio file for each turn so the script is self-contained.
"""
from __future__ import annotations

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
    "sungguhan di telepon: santai, singkat, 1-2 kalimat. Jangan menyapa ulang. "
    "Jangan kaku/birokratis, jangan pakai markdown."
)
# five things a sales rep would actually say, in order
TURNS = [
    "Selamat pagi Bu, saya Adi dari Orimax. Boleh bicara dengan bagian pengadaan IT?",
    "Kami supplier printer dan laptop untuk instansi, Bu. Bisa saya kirimkan proposalnya?",
    "Kalau boleh, saya minta nomor kontak Pak Agus ya Bu untuk follow up.",
    "Baik Bu, kalau begitu saya kirim ke alamat email resmi dinas saja ya.",
    "Terima kasih banyak Bu atas waktunya. Selamat pagi.",
]


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
    """Sales rep speech -> PCM16 mono 16k, via edge-tts (same engine as today)."""
    subprocess.run(
        ["/home/agi/.hermes/hermes-agent/venv/bin/edge-tts",
         "--voice", "id-ID-ArdiNeural", "--rate=+8%",
         "--text", text, "--write-media", "/tmp/_probe_turn.mp3"],
        capture_output=True, check=True)
    return subprocess.run(
        ["ffmpeg", "-v", "error", "-i", "/tmp/_probe_turn.mp3",
         "-ar", str(IN_RATE), "-ac", "1", "-f", "s16le", "-acodec", "pcm_s16le", "-"],
        capture_output=True, check=True).stdout


async def main() -> None:
    key = load_key()
    pcm_turns = [tts(t) for t in TURNS]
    print(f"model={MODEL} voice=Puck  giliran={len(TURNS)}")
    print(f"total ucapan sales: {sum(len(p) for p in pcm_turns)/2/IN_RATE:.1f}s")
    print()

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
        }}))
        while True:
            if "setupComplete" in json.loads(await asyncio.wait_for(ws.recv(), 30)):
                break

        t_session = time.perf_counter()
        total_audio_out = 0
        total_reply_s = 0.0
        ttfas: list[int] = []
        from_start: list[int] = []

        for n, pcm in enumerate(pcm_turns, 1):
            chunk = int(IN_RATE * 2 * 0.1)  # 100ms
            t_send_start = time.perf_counter()
            for i in range(0, len(pcm), chunk):
                await ws.send(json.dumps({"realtimeInput": {"mediaChunks": [{
                    "mimeType": f"audio/pcm;rate={IN_RATE}",
                    "data": base64.b64encode(pcm[i:i + chunk]).decode()}]}}))
                await asyncio.sleep(0.1)
            # 200ms trailing silence closes the turn (measured optimum)
            for _ in range(2):
                await ws.send(json.dumps({"realtimeInput": {"mediaChunks": [{
                    "mimeType": f"audio/pcm;rate={IN_RATE}",
                    "data": base64.b64encode(b"\x00" * chunk).decode()}]}}))
                await asyncio.sleep(0.1)
            t_stop = time.perf_counter()
            # The model may answer BEFORE we finish streaming (it processes faster
            # than real time), which makes "first audio after t_stop" meaningless
            # or even negative. Measure from the START of this turn's speech, which
            # is what a human perceives, and keep both numbers honest.
            speech_s = len(pcm) / 2 / IN_RATE

            out = bytearray()
            tx, in_tx = [], []
            t_first = None
            deadline = time.perf_counter() + 45
            while True:
                rem = deadline - time.perf_counter()
                if rem <= 0:
                    break
                try:
                    m = json.loads(await asyncio.wait_for(ws.recv(), timeout=rem))
                except asyncio.TimeoutError:
                    break
                if "usageMetadata" in m:
                    print(f"    [usage] {json.dumps(m['usageMetadata'])[:220]}")
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
                            # gap after the rep's last word (negative = the model
                            # started speaking before the rep finished)
                            ttfas.append(round((t_first - t_stop) * 1000))
                            from_start.append(round((t_first - t_send_start) * 1000))
                        out.extend(base64.b64decode(d))
                if sc.get("turnComplete"):
                    break

            total_audio_out += len(out)
            rs = len(out) / 2 / OUT_RATE
            total_reply_s += rs
            print(f"  giliran {n}: jeda_setelah_bicara={ttfas[-1] if ttfas else '?'}ms "
                  f"dari_awal_bicara={from_start[-1] if from_start else '?'}ms "
                  f"balasan={rs:.1f}s")
            print(f"    dengar: {''.join(in_tx)[:80]}")
            print(f"    balas : {''.join(tx)[:110]}")

        dur = time.perf_counter() - t_session

    print()
    print("── RINGKASAN SESI ──────────────────────────────────────")
    print(f"  durasi sesi          : {dur:.1f}s")
    print(f"  jeda setelah sales berhenti bicara: {ttfas}  median={sorted(ttfas)[len(ttfas)//2]}ms")
    print(f"  jeda dari sales MULAI bicara      : {from_start}  median={sorted(from_start)[len(from_start)//2]}ms")
    print(f"  total audio balasan  : {total_reply_s:.1f}s")
    print(f"  audio masuk (sales)  : {sum(len(p) for p in pcm_turns)/2/IN_RATE:.1f}s")
    # 25 tokens per second of audio, per Google's docs
    in_tok = sum(len(p) for p in pcm_turns) / 2 / IN_RATE * 25
    out_tok = total_reply_s * 25
    print(f"  perkiraan token audio: masuk {in_tok:.0f}, keluar {out_tok:.0f}")
    print(f"  (Google: 25 token per detik audio)")


if __name__ == "__main__":
    asyncio.run(main())
