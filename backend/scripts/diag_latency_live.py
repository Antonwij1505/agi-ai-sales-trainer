#!/usr/bin/env python3
"""
diag_latency_live.py — ukur latensi relay yang SEBENARNYA, dari sisi klien.

Yang diukur per giliran (semua relatif ke saat `turn_end` dikirim):
  - SALES transcript final  : kapan transkrip suara sales selesai (yang dirasakan
                              sebagai "lambat mentranskrip")
  - TTFA                    : audio balasan CS pertama tiba
  - audio selesai           : byte terakhir audio balasan

Ini memakai relay produksi (ws://127.0.0.1:4100) dan Gemini asli, jadi angkanya
adalah yang benar-benar dirasakan aplikasi.
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

TURNS = [
    "Selamat pagi Pak, saya Adi dari Orimax.",
    "Boleh bicara dengan bagian pengadaan IT?",
    "Kalau boleh, saya minta nomor kontak Pak Agus ya Pak untuk follow up.",
]


def tts(text: str) -> bytes:
    subprocess.run(
        ['/home/agi/.hermes/installs/d355804af649e50e/environments/'
         '9ac9f237e78a47d599363f332fe2ba26/venv/bin/edge-tts',
         '--voice', 'id-ID-ArdiNeural', '--rate=+8%', '--text', text,
         '--write-media', '/tmp/_lat.mp3'], capture_output=True, check=True)
    return subprocess.run(
        ['/home/agi/.hermes/tools/ffmpeg-9.0.1-linux-x64/bin/ffmpeg',
         '-v', 'error', '-i', '/tmp/_lat.mp3', '-ar', str(IN_RATE),
         '-ac', '1', '-f', 's16le', '-acodec', 'pcm_s16le', '-'],
        capture_output=True, check=True).stdout


async def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument('--url', default='ws://127.0.0.1:4100')
    ap.add_argument('--token', required=True)
    ap.add_argument('--session', type=int, required=True)
    args = ap.parse_args()

    ws_url = f'{args.url}/api/trainer/live/{args.session}?token={args.token}'
    pcms = [tts(t) for t in TURNS]

    async with websockets.connect(ws_url, max_size=None, open_timeout=30) as ws:
        while True:
            m = json.loads(await asyncio.wait_for(ws.recv(), 30))
            if m.get('t') == 'ready':
                break
            if m.get('t') == 'error':
                raise SystemExit(f'relay error: {m["message"]}')

        for n, pcm in enumerate(pcms, 1):
            chunk = int(IN_RATE * 2 * 0.1)
            for i in range(0, len(pcm), chunk):
                await ws.send(json.dumps({
                    't': 'audio',
                    'pcm': base64.b64encode(pcm[i:i + chunk]).decode(),
                }))
                await asyncio.sleep(0.1)

            # A real microphone keeps streaming silence after the rep stops
            # talking; without this the server's VAD never sees end-of-speech.
            silence = b'\x00\x00' * int(IN_RATE * 1.2)
            for i in range(0, len(silence), chunk):
                await ws.send(json.dumps({
                    't': 'audio',
                    'pcm': base64.b64encode(silence[i:i + chunk]).decode(),
                }))
                await asyncio.sleep(0.1)

            t_end = time.perf_counter()

            t_sales_final = None
            t_first_audio = None
            audio_bytes = 0
            t_audio_done = None
            sales_text = ''
            cs_text = ''

            while True:
                m = json.loads(await asyncio.wait_for(ws.recv(), 30))
                kind = m.get('t')
                if kind == 'transcript':
                    if m.get('speaker') == 'SALES':
                        if t_sales_final is None:
                            t_sales_final = time.perf_counter() - t_end
                        sales_text += m.get('text', '')
                    else:
                        cs_text += m.get('text', '')
                elif kind == 'audio':
                    if t_first_audio is None:
                        t_first_audio = time.perf_counter() - t_end
                    audio_bytes += len(base64.b64decode(m.get('pcm', '')))
                    t_audio_done = time.perf_counter() - t_end
                elif kind == 'turn_end':
                    break
                elif kind == 'error':
                    print('ERROR:', m.get('message'))
                    break

            print(f'giliran {n}  ucapan={len(pcm)/2/IN_RATE:.1f}s')
            print(f'  SALES transcript final : {t_sales_final*1000:.0f}ms' if t_sales_final else '  SALES transcript final : -')
            print(f'  TTFA (audio pertama)   : {t_first_audio*1000:.0f}ms' if t_first_audio else '  TTFA                   : -')
            print(f'  audio selesai          : {t_audio_done*1000:.0f}ms ({audio_bytes}B)' if t_audio_done else '  audio selesai          : -')
            print(f'  SALES: {sales_text.strip()}')
            print(f'  CS   : {cs_text.strip()}')
            print()

        await ws.send(json.dumps({'t': 'stop'}))


if __name__ == '__main__':
    asyncio.run(main())
