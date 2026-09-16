#!/usr/bin/env python3
"""
diag_vad.py — does automatic VAD fire MID-SENTENCE?

Suspicion: in the previous run the reply arrived +1ms after we stopped sending, and
one reply ignored the second half of the rep's sentence. Both are explained if the
model's automatic VAD treats the natural pause inside a sentence as end-of-turn:
it starts generating early, the audio is buffered, and our recv() sees it instantly
while the reply only answers the first half.

Test the same utterance two ways, real-time paced in both cases:
  A) automatic VAD (default)          -> if the hypothesis holds, replies miss the tail
  B) explicit turn control (VAD off)  -> the app decides when the turn ended

Compare what the model replies to, and when the audio arrives.
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
    "menerima telepon dari sales perusahaan IT. Bicarakan seperti orang Indonesia "
    "sungguhan di telepon: santai, singkat, 1-2 kalimat. Jangan menyapa ulang."
)
# A sentence with a clear mid-sentence pause, then a distinct SECOND request.
# If VAD fires at the pause, the model will answer only the first part.
UTTERANCE = (
    "Selamat pagi Bu, saya Adi dari Orimax. "
    "Boleh bicara dengan bagian pengadaan IT? "
    "Kalau boleh, saya juga mau minta nomor kontak Pak Agus ya Bu."
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


def tts(text: str) -> bytes:
    subprocess.run(
        ["/home/agi/.hermes/hermes-agent/venv/bin/edge-tts",
         "--voice", "id-ID-ArdiNeural", "--rate=+8%", "--text", text,
         "--write-media", "/tmp/_vad.mp3"], capture_output=True, check=True)
    return subprocess.run(
        ["ffmpeg", "-v", "error", "-i", "/tmp/_vad.mp3", "-ar", str(IN_RATE),
         "-ac", "1", "-f", "s16le", "-acodec", "pcm_s16le", "-"],
        capture_output=True, check=True).stdout


async def run(mode: str) -> dict:
    key = load_key()
    pcm = tts(UTTERANCE)
    speech_s = len(pcm) / 2 / IN_RATE
    explicit = mode == "explicit"

    cfg: dict = {
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
    }
    if explicit:
        cfg["realtimeInputConfig"] = {
            "automaticActivityDetection": {"disabled": True}}

    out: dict = {"mode": mode, "speech_s": round(speech_s, 2)}
    async with websockets.connect(f"{WS}?key={key}", max_size=None,
                                  open_timeout=30) as ws:
        await ws.send(json.dumps({"setup": cfg}))
        while True:
            if "setupComplete" in json.loads(await asyncio.wait_for(ws.recv(), 30)):
                break

        if explicit:
            await ws.send(json.dumps({"realtimeInput": {"activityStart": {}}}))

        chunk = int(IN_RATE * 2 * 0.1)
        t_start = time.perf_counter()
        for i in range(0, len(pcm), chunk):
            await ws.send(json.dumps({"realtimeInput": {"mediaChunks": [{
                "mimeType": f"audio/pcm;rate={IN_RATE}",
                "data": base64.b64encode(pcm[i:i + chunk]).decode()}]}}))
            await asyncio.sleep(0.1)
        t_stop = time.perf_counter()
        out["send_s"] = round(t_stop - t_start, 2)

        if explicit:
            await ws.send(json.dumps({"realtimeInput": {"activityEnd": {}}}))

        # keep receiving; record when the FIRST audio arrives and what was said
        audio_events: list[tuple[float, int]] = []
        in_tx: list[str] = []
        out_tx: list[str] = []
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
                out_tx.append(sc["outputTranscription"]["text"])
            for p in (sc.get("modelTurn") or {}).get("parts", []):
                d = (p.get("inlineData") or {}).get("data")
                if d:
                    audio_events.append((time.perf_counter(), len(base64.b64decode(d))))
            if sc.get("turnComplete"):
                break

        if audio_events:
            out["first_audio_ms"] = round((audio_events[0][0] - t_stop) * 1000)
            out["audio_s"] = round(sum(b for _, b in audio_events) / 2 / OUT_RATE, 2)
        out["heard"] = "".join(in_tx).strip()
        out["replied"] = "".join(out_tx).strip()
    return out


async def main() -> None:
    print("kalimat sales (ada jeda di tengah, lalu permintaan KEDUA):")
    print(f'  "{UTTERANCE}"')
    print()
    print("Permintaan kedua = 'minta nomor kontak Pak Agus'.")
    print("Kalau balasan CS mengabaikannya, VAD menyala di tengah kalimat.")
    print()
    for mode in ("auto", "explicit"):
        r = await run(mode)
        print(f"═══ mode={mode} ═══")
        print(f"  bicara sales     : {r['speech_s']}s (terkirim {r['send_s']}s)")
        print(f"  audio pertama    : {r.get('first_audio_ms','-')}ms setelah selesai kirim")
        print(f"  durasi balasan   : {r.get('audio_s','-')}s")
        print(f"  didengar model   : {r['heard'][:130]}")
        print(f"  balasan CS       : {r['replied'][:160]}")
        tail = r["replied"].lower()
        addressed = any(k in tail for k in ("nomor", "kontak", "agus", "tidak bisa"))
        print(f"  → menjawab permintaan KEDUA (nomor kontak)? "
              f"{'YA' if addressed else 'TIDAK — mengabaikannya'}")
        print()


if __name__ == "__main__":
    asyncio.run(main())
