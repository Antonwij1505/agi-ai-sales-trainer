#!/usr/bin/env python3
"""
test_live_multiturn.py — does the relay survive a real multi-turn conversation?

The earlier relay test used ONE turn. A live training session is 5-10 turns, so the
risks that matter are different: does the upstream session stay open, does explicit
turn control keep working, do transcripts accumulate correctly per turn, and does
latency stay acceptable as history grows.

Reuses one socket for every turn, exactly as the app does.
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

# A realistic gatekeeper conversation: opening, value, ask, fallback, close.
TURNS = [
    "Selamat pagi Pak, saya Adi dari Orimax. Boleh bicara dengan bagian pengadaan IT?",
    "Kami supplier printer dan laptop untuk instansi, Pak. Bisa saya kirim proposalnya?",
    "Kalau boleh, saya minta nomor kontak Pak Agus ya Pak untuk follow up.",
    "Baik Pak, kalau Pak Agus sedang di luar, boleh saya tahu nama beliau dan jam beliau biasanya ada?",
    "Terima kasih Pak, saya kirim proposal ke email resmi dinas ya. Selamat pagi.",
]


def tts(text: str) -> bytes:
    subprocess.run(
        ['/home/agi/.hermes/hermes-agent/venv/bin/edge-tts',
         '--voice', 'id-ID-ArdiNeural', '--rate=+8%', '--text', text,
         '--write-media', '/tmp/_mt.mp3'], capture_output=True, check=True)
    return subprocess.run(
        ['ffmpeg', '-v', 'error', '-i', '/tmp/_mt.mp3', '-ar', str(IN_RATE),
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

    print(f'sesi {args.session} · {len(TURNS)} giliran')
    print(f'total ucapan sales: {sum(len(p) for p in pcms)/2/IN_RATE:.1f}s')
    print()

    async with websockets.connect(ws_url, max_size=None, open_timeout=30) as ws:
        while True:
            m = json.loads(await asyncio.wait_for(ws.recv(), 30))
            if m.get('t') == 'ready':
                print('relay siap\n')
                break
            if m.get('t') == 'error':
                raise SystemExit(f'relay error: {m["message"]}')

        ttfas: list[int] = []
        for n, pcm in enumerate(pcms, 1):
            await ws.send(json.dumps({'t': 'turn_start'}))
            chunk = int(IN_RATE * 2 * 0.1)
            for i in range(0, len(pcm), chunk):
                await ws.send(json.dumps({
                    't': 'audio',
                    'pcm': base64.b64encode(pcm[i:i + chunk]).decode(),
                }))
                await asyncio.sleep(0.1)
            await ws.send(json.dumps({'t': 'turn_end'}))
            t_end = time.perf_counter()

            out = bytearray()
            chunks = 0
            ttfa = None
            sales_tx, cs_tx = [], []
            deadline = time.perf_counter() + 45
            while True:
                rem = deadline - time.perf_counter()
                if rem <= 0:
                    print('  TIMEOUT')
                    break
                m = json.loads(await asyncio.wait_for(ws.recv(), timeout=rem))
                t = m.get('t')
                if t == 'audio':
                    if ttfa is None:
                        ttfa = round((time.perf_counter() - t_end) * 1000)
                    out.extend(base64.b64decode(m['pcm']))
                    chunks += 1
                elif t == 'transcript':
                    (sales_tx if m['speaker'] == 'SALES' else cs_tx).append(m['text'])
                elif t == 'error':
                    print(f'  error: {m["message"]}')
                    break
                elif t == 'turn_end':
                    break

            if ttfa is not None:
                ttfas.append(ttfa)
            print(f'giliran {n}: ttfa={ttfa}ms chunk={chunks} '
                  f'balasan={len(out)/2/24000:.1f}s')
            print(f'  dengar: {"".join(sales_tx)[:78]}')
            print(f'  balas : {"".join(cs_tx)[:95]}')

        await ws.send(json.dumps({'t': 'stop'}))

    print()
    print('── RINGKASAN ───────────────────────────────────────────')
    print(f'  giliran berhasil : {len(ttfas)}/{len(TURNS)}')
    if ttfas:
        print(f'  ttfa             : {ttfas}')
        print(f'  median           : {sorted(ttfas)[len(ttfas)//2]}ms')
        print(f'  terburuk         : {max(ttfas)}ms')
    print('  pembanding       : pipeline lama ~3700ms (pernah 22000ms)')


if __name__ == '__main__':
    asyncio.run(main())
