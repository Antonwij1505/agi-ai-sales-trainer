#!/usr/bin/env python3
"""
diag_transcript_timing.py — kapan transkrip suara sales MULAI muncul?

Keluhan: "respon menerima suara saya lambat dalam mentranskrip".

Skrip ini mengalirkan satu ucapan dengan pace real-time, lalu mencatat kapan
setiap event tiba (relatif ke awal ucapan):
  - transkrip SALES pertama / terakhir
  - audio balasan CS pertama
Jika transkrip SALES pertama baru muncul SETELAH ucapan selesai + jeda, berarti
VAD Gemini menahan transkrip sampai giliran ditutup -> itulah lag yang dirasakan.
"""
from __future__ import annotations

import argparse
import asyncio
import base64
import json
import subprocess
import time

import websockets

IN_RATE = 16000


def tts(text: str) -> bytes:
    subprocess.run(
        ['/home/agi/.hermes/installs/d355804af649e50e/environments/'
         '9ac9f237e78a47d599363f332fe2ba26/venv/bin/edge-tts',
         '--voice', 'id-ID-ArdiNeural', '--rate=+8%', '--text', text,
         '--write-media', '/tmp/_tt.mp3'], capture_output=True, check=True)
    return subprocess.run(
        ['/home/agi/.hermes/tools/ffmpeg-9.0.1-linux-x64/bin/ffmpeg',
         '-v', 'error', '-i', '/tmp/_tt.mp3', '-ar', str(IN_RATE),
         '-ac', '1', '-f', 's16le', '-acodec', 'pcm_s16le', '-'],
        capture_output=True, check=True).stdout


async def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument('--url', default='ws://127.0.0.1:4100')
    ap.add_argument('--token', required=True)
    ap.add_argument('--session', type=int, required=True)
    ap.add_argument('--text', default='Selamat pagi Pak, saya Adi dari Orimax, boleh bicara dengan bagian pengadaan IT?')
    args = ap.parse_args()

    pcm = tts(args.text)
    ws_url = f'{args.url}/api/trainer/live/{args.session}?token={args.token}'

    async with websockets.connect(ws_url, max_size=None, open_timeout=30) as ws:
        while True:
            m = json.loads(await asyncio.wait_for(ws.recv(), 30))
            if m.get('t') == 'ready':
                break
            if m.get('t') == 'error':
                raise SystemExit(f'relay error: {m["message"]}')

        events: list[tuple[float, str]] = []
        stop = asyncio.Event()

        async def reader() -> None:
            try:
                while not stop.is_set():
                    m = json.loads(await asyncio.wait_for(ws.recv(), 30))
                    events.append((time.perf_counter(), json.dumps(m)[:160]))
                    if m.get('t') == 'turn_end':
                        return
            except Exception as e:  # noqa: BLE001
                events.append((time.perf_counter(), f'reader end: {e}'))

        task = asyncio.create_task(reader())
        await asyncio.sleep(0.05)

        t0 = time.perf_counter()
        chunk = int(IN_RATE * 2 * 0.1)
        for i in range(0, len(pcm), chunk):
            await ws.send(json.dumps({
                't': 'audio',
                'pcm': base64.b64encode(pcm[i:i + chunk]).decode(),
            }))
            await asyncio.sleep(0.1)
        t_spoken = time.perf_counter()

        # Keep streaming silence like a real microphone.
        silence = b'\x00\x00' * int(IN_RATE * 1.5)
        for i in range(0, len(silence), chunk):
            await ws.send(json.dumps({
                't': 'audio',
                'pcm': base64.b64encode(silence[i:i + chunk]).decode(),
            }))
            await asyncio.sleep(0.1)

        print(f'ucapan: {len(pcm)/2/IN_RATE:.1f}s  ("{args.text[:60]}...")')
        print()
        first_sales = None
        first_cs = None
        first_audio = None
        for ts, raw in events:
            rel = ts - t0
            obj = json.loads(raw) if raw.startswith('{') else {}
            kind = obj.get('t', '?')
            if kind == 'transcript':
                who = obj.get('speaker')
                txt = obj.get('text', '')
                if who == 'SALES' and first_sales is None:
                    first_sales = rel
                if who == 'CS' and first_cs is None:
                    first_cs = rel
                print(f'  {rel:6.2f}s  transcript {who:5s} "{txt}"')
            elif kind == 'audio':
                if first_audio is None:
                    first_audio = rel
                    print(f'  {rel:6.2f}s  audio CS mulai')
            elif kind == 'turn_end':
                print(f'  {rel:6.2f}s  turn_end')
                break
            else:
                print(f'  {rel:6.2f}s  {kind}')

        print()
        print(f'ucapan selesai pada        : {t_spoken - t0:.2f}s')
        print(f'transkrip SALES pertama    : {first_sales:.2f}s' if first_sales else 'transkrip SALES pertama    : -')
        print(f'audio CS pertama           : {first_audio:.2f}s' if first_audio else 'audio CS pertama           : -')
        if first_audio:
            print(f'jeda SETELAH ucapan selesai: {(first_audio - (t_spoken - t0)):.2f}s')

        stop.set()
        task.cancel()
        await ws.send(json.dumps({'t': 'stop'}))


if __name__ == '__main__':
    asyncio.run(main())
