#!/usr/bin/env python3
"""
diag_turncontrol.py — mode VAD-off (kontrol giliran eksplisit) lewat relay.

Klien mengirim turn_start saat mulai bicara dan turn_end setelah hening lokal.
Ini yang akan dilakukan aplikasi Android. Yang diukur:
  - transkrip SALES pertama muncul kapan (relatif ke awal bicara) — keluhan utama
  - transkrip utuh meski ada jeda berpikir di tengah
  - TTFA setelah turn_end
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

PART_A = "Selamat pagi Pak, saya Adi dari Orimax,"
PART_B = "boleh bicara dengan bagian pengadaan IT?"


def tts(text: str) -> bytes:
    subprocess.run(
        ['/home/agi/.hermes/installs/d355804af649e50e/environments/'
         '9ac9f237e78a47d599363f332fe2ba26/venv/bin/edge-tts',
         '--voice', 'id-ID-ArdiNeural', '--rate=+8%', '--text', text,
         '--write-media', '/tmp/_tc.mp3'], capture_output=True, check=True)
    return subprocess.run(
        ['/home/agi/.hermes/tools/ffmpeg-9.0.1-linux-x64/bin/ffmpeg',
         '-v', 'error', '-i', '/tmp/_tc.mp3', '-ar', str(IN_RATE),
         '-ac', '1', '-f', 's16le', '-acodec', 'pcm_s16le', '-'],
        capture_output=True, check=True).stdout


async def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument('--url', default='ws://127.0.0.1:4100')
    ap.add_argument('--token', required=True)
    ap.add_argument('--session', type=int, required=True)
    ap.add_argument('--pause-ms', type=int, default=900)
    ap.add_argument('--hold-ms', type=int, default=1200)
    args = ap.parse_args()

    a, b = tts(PART_A), tts(PART_B)
    ws_url = f'{args.url}/api/trainer/live/{args.session}?token={args.token}'

    async with websockets.connect(ws_url, max_size=None, open_timeout=30) as ws:
        while True:
            m = json.loads(await asyncio.wait_for(ws.recv(), 30))
            if m.get('t') == 'ready':
                break
            if m.get('t') == 'error':
                raise SystemExit(f'relay error: {m["message"]}')

        events: list[tuple[float, dict]] = []
        stop = asyncio.Event()

        async def reader() -> None:
            try:
                while not stop.is_set():
                    m = json.loads(await asyncio.wait_for(ws.recv(), 45))
                    events.append((time.perf_counter(), m))
                    if m.get('t') == 'turn_end':
                        return
            except Exception as e:  # noqa: BLE001
                events.append((time.perf_counter(), {'t': f'reader_end: {e}'}))

        task = asyncio.create_task(reader())
        await asyncio.sleep(0.05)

        chunk = int(IN_RATE * 2 * 0.1)
        t0 = time.perf_counter()

        # Sales mulai bicara -> activityStart (seperti VAD lokal mendeteksi suara).
        await ws.send(json.dumps({'t': 'turn_start'}))

        async def send(pcm: bytes) -> None:
            for i in range(0, len(pcm), chunk):
                await ws.send(json.dumps({
                    't': 'audio',
                    'pcm': base64.b64encode(pcm[i:i + chunk]).decode(),
                }))
                await asyncio.sleep(0.1)

        await send(a)
        t_pause_start = time.perf_counter() - t0
        await send(b'\x00\x00' * int(IN_RATE * args.pause_ms / 1000))  # jeda berpikir
        await send(b)
        t_spoken = time.perf_counter() - t0

        # Hening lokal -> activityEnd (seperti VAD lokal menutup giliran).
        await send(b'\x00\x00' * int(IN_RATE * args.hold_ms / 1000))
        await ws.send(json.dumps({'t': 'turn_end'}))
        t_turn_end = time.perf_counter() - t0

        try:
            await asyncio.wait_for(task, 40)
        except asyncio.TimeoutError:
            pass

        first_sales = first_audio = None
        sales = cs = ''
        for ts, m in events:
            rel = ts - t0
            if m.get('t') == 'transcript':
                if m.get('speaker') == 'SALES':
                    if first_sales is None:
                        first_sales = rel
                    sales += m.get('text', '')
                else:
                    cs += m.get('text', '')
            elif m.get('t') == 'audio' and first_audio is None:
                first_audio = rel

        print(f'ucapan A={len(a)/2/IN_RATE:.1f}s  jeda={args.pause_ms}ms  B={len(b)/2/IN_RATE:.1f}s  hold={args.hold_ms}ms')
        print(f'  selesai bicara     : {t_spoken:.2f}s')
        print(f'  turn_end dikirim   : {t_turn_end:.2f}s')
        print(f'  transkrip SALES -1 : {first_sales:.2f}s' if first_sales else '  transkrip SALES -1 : -')
        print(f'  audio CS -1        : {first_audio:.2f}s' if first_audio else '  audio CS -1        : -')
        if first_audio:
            print(f'  TTFA dari turn_end : {(first_audio - t_turn_end)*1000:.0f}ms')
        print(f'  SALES: {sales.strip()}')
        print(f'  CS   : {cs.strip()}')

        stop.set()
        task.cancel()
        await ws.send(json.dumps({'t': 'stop'}))


if __name__ == '__main__':
    asyncio.run(main())
