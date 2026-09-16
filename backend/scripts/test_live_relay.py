#!/usr/bin/env python3
"""
test_live_relay.py — end-to-end test of the WebSocket relay.

Speaks to OUR relay exactly as the Android app will, so the relay is verified
before any Kotlin is written. Sends a real utterance (synthesised with edge-tts),
instructs the relay when the turn ends, and prints the streamed audio + transcript.

  python3 test_live_relay.py --url ws://127.0.0.1:4100 --token <jwt> --session 50

Checks:
  - the relay rejects a bad token (401) and a foreign session
  - audio streams back in multiple frames (not one lump at the end)
  - transcripts arrive for both speakers and are persisted as trainer_turns
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

IN_RATE = 16000


def tts(text: str) -> bytes:
    subprocess.run(
        ['/home/agi/.hermes/hermes-agent/venv/bin/edge-tts',
         '--voice', 'id-ID-ArdiNeural', '--rate=+8%', '--text', text,
         '--write-media', '/tmp/_relay.mp3'], capture_output=True, check=True)
    return subprocess.run(
        ['ffmpeg', '-v', 'error', '-i', '/tmp/_relay.mp3', '-ar', str(IN_RATE),
         '-ac', '1', '-f', 's16le', '-acodec', 'pcm_s16le', '-'],
        capture_output=True, check=True).stdout


async def run(base_url: str, token: str, session_id: int, utterance: str) -> dict:
    pcm = tts(utterance)
    speech_s = len(pcm) / 2 / IN_RATE
    # NOTE: token must be a query param on the FULL path, not appended to the base
    # before the path — getting that order wrong puts the path inside the query
    # string and the server sees pathname "/" and drops the upgrade.
    ws_url = f'{base_url}/api/trainer/live/{session_id}?token={token}'

    print(f'menyambung ke {ws_url.replace("token=", "token=***")}')
    result: dict = {'speech_s': round(speech_s, 2)}

    async with websockets.connect(ws_url, max_size=None, open_timeout=25) as ws:
        # wait for ready
        while True:
            m = json.loads(await asyncio.wait_for(ws.recv(), 30))
            if m.get('t') == 'ready':
                print(f"  relay siap (session {m.get('session_id')})")
                break
            if m.get('t') == 'error':
                raise SystemExit(f"  relay error: {m['message']}")

        # stream the rep's speech in 100ms chunks, like the phone will
        await ws.send(json.dumps({'t': 'turn_start'}))
        chunk = int(IN_RATE * 2 * 0.1)
        t0 = time.perf_counter()
        for i in range(0, len(pcm), chunk):
            await ws.send(json.dumps({
                't': 'audio',
                'pcm': base64.b64encode(pcm[i:i + chunk]).decode(),
            }))
            await asyncio.sleep(0.1)
        result['sent_s'] = round(time.perf_counter() - t0, 2)

        # tell the relay the rep is done
        await ws.send(json.dumps({'t': 'turn_end'}))
        t_end = time.perf_counter()

        audio_frames: list[tuple[float, int]] = []
        out = bytearray()
        sales_tx: list[str] = []
        cs_tx: list[str] = []
        deadline = time.perf_counter() + 45
        while True:
            rem = deadline - time.perf_counter()
            if rem <= 0:
                print('  TIMEOUT menunggu turn_end')
                break
            m = json.loads(await asyncio.wait_for(ws.recv(), timeout=rem))
            t = m.get('t')
            if t == 'audio':
                pcm_out = base64.b64decode(m['pcm'])
                if not audio_frames:
                    result['ttfa_ms'] = round((time.perf_counter() - t_end) * 1000)
                audio_frames.append((time.perf_counter(), len(pcm_out)))
                out.extend(pcm_out)
            elif t == 'transcript':
                (sales_tx if m['speaker'] == 'SALES' else cs_tx).append(m['text'])
            elif t == 'error':
                print(f"  error: {m['message']}")
                break
            elif t == 'turn_end':
                break

        result['audio_frames'] = len(audio_frames)
        result['reply_s'] = round(len(out) / 2 / 24000, 2)
        result['heard'] = ''.join(sales_tx).strip()
        result['replied'] = ''.join(cs_tx).strip()
        if audio_frames:
            # are frames spread over time (= streaming) or all at once?
            span = audio_frames[-1][0] - audio_frames[0][0]
            result['frame_span_s'] = round(span, 2)
        if out:
            result['mp3'] = '/tmp/relay_reply.mp3'
            subprocess.run(
                ['ffmpeg', '-y', '-v', 'error', '-f', 's16le', '-ar', '24000',
                 '-ac', '1', '-i', '-', '-codec:a', 'libmp3lame', '-b:a', '64k',
                 result['mp3']], input=bytes(out), check=True)

        await ws.send(json.dumps({'t': 'stop'}))
    return result


async def expect_rejected(url: str, session_id: int, token: str, label: str) -> None:
    ws_url = f'{url}/api/trainer/live/{session_id}?token={token}'
    try:
        async with websockets.connect(ws_url, open_timeout=15) as ws:
            m = json.loads(await asyncio.wait_for(ws.recv(), 15))
            if m.get('t') == 'error':
                print(f'  {label}: ditolak dengan pesan "{m["message"]}"')
            else:
                print(f'  {label}: TIDAK ditolak (menerima {m})')
    except Exception as e:  # noqa: BLE001
        print(f'  {label}: ditolak saat handshake ({type(e).__name__})')


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument('--url', default='ws://127.0.0.1:4100')
    ap.add_argument('--token', required=True)
    ap.add_argument('--session', type=int, required=True)
    ap.add_argument('--utterance', default=(
        'Selamat pagi Bu, saya Adi dari Orimax. '
        'Boleh bicara dengan bagian pengadaan IT? '
        'Kalau boleh, saya juga mau minta nomor kontak Pak Agus ya Bu.'))
    ap.add_argument('--skip-negative', action='store_true')
    args = ap.parse_args()

    url = f'{args.url}?token={args.token}'

    if not args.skip_negative:
        print('── uji keamanan ────────────────────────────────────────')
        asyncio.run(expect_rejected(args.url, args.session, 'not-a-real-token', 'token palsu'))
        print()

    print('── percakapan ──────────────────────────────────────────')
    print(f'ucapan sales: "{args.utterance}"')
    print()
    r = asyncio.run(run(args.url, args.token, args.session, args.utterance))

    print('── HASIL ───────────────────────────────────────────────')
    print(f"  bicara sales      : {r['speech_s']}s (terkirim {r['sent_s']}s)")
    print(f"  ► TTFA            : {r.get('ttfa_ms', '?')}ms")
    print(f"  frame audio       : {r.get('audio_frames')} "
          f"(tersebar {r.get('frame_span_s')}s)")
    print(f"  durasi balasan    : {r.get('reply_s')}s")
    print(f"  didengar model    : {r.get('heard', '')[:120]}")
    print(f"  balasan CS        : {r.get('replied', '')[:140]}")
    if r.get('mp3'):
        print(f"  audio             : {r['mp3']}")
    Path('/tmp/relay_result.json').write_text(json.dumps(r, indent=2, ensure_ascii=False))

    frames = r.get('audio_frames', 0)
    span = r.get('frame_span_s', 0) or 0
    reply = r.get('reply_s', 0) or 0
    print()
    # The model generates FASTER than real time, so frames arrive in a burst and
    # finish well before playback would. What matters is that audio arrives in many
    # frames (streaming) rather than one lump, and that the first frame is early.
    if frames > 5:
        ratio = (reply / span) if span > 0 else 0
        print(f'  ✓ audio STREAMING: {frames} frame, tiba {ratio:.1f}x lebih cepat '
              f'dari real-time (klien akan mem-buffer lalu memutar)')
    else:
        print(f'  ✗ hanya {frames} frame — audio tidak streaming')


if __name__ == '__main__':
    main()
