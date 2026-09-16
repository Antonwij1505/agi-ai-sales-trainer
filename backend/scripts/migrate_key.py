#!/usr/bin/env python3
"""
migrate_key.py — move the Google key from 9router's store into filter_config.

Reads the key from 9router's sqlite, writes it to the trainer's filter_config row,
and never prints the value. This is the step that removes the prototype's
dependency on another service's credential store.

Run once, from the repo root, as a user that can read 9router's data dir.
"""
import re
import sqlite3
import subprocess
import sys

ROUTER_DB = '/home/agi/9router/data/db/data.sqlite'
PG_CONTAINER = 'orimax-sirup-postgres-1'
PG_USER = 'orimax'
PG_DB = 'sirup'


def read_key() -> str:
    con = sqlite3.connect(f'file:{ROUTER_DB}?mode=ro', uri=True)
    for (d,) in con.execute('select data from providerConnections'):
        if isinstance(d, str):
            for m in re.finditer(r'(AIza[0-9A-Za-z_\-]{30,})', d):
                ctx = d[max(0, m.start() - 400):m.start() + 400].lower()
                if 'gemini' in ctx or 'google' in ctx:
                    con.close()
                    return m.group(1)
    con.close()
    raise SystemExit('no Google key found in 9router store')


def upsert(key: str, value: str) -> None:
    # Pass the value via stdin so it never appears in argv or shell history.
    sql = (
        "INSERT INTO filter_config (key, value, updated_at) "
        "VALUES (:'k', :'v', now()) "
        "ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();"
    )
    psql = (
        f"\\set k '{key}'\n"
        f"\\set v '{value}'\n"
        f"{sql}\n"
    )
    proc = subprocess.run(
        ['docker', 'exec', '-i', PG_CONTAINER, 'psql', '-U', PG_USER, '-d', PG_DB,
         '-v', 'ON_ERROR_STOP=1', '-q', '-f', '-'],
        input=psql, capture_output=True, text=True,
    )
    if proc.returncode != 0:
        # scrub anything that looks like a key from the error before printing
        err = re.sub(r'AIza[0-9A-Za-z_\-]{30,}', 'AIza***', proc.stderr)
        raise SystemExit(f'psql failed: {err[:400]}')


def main() -> None:
    key = read_key()
    print(f'key dibaca dari 9router: len={len(key)} prefix=AIza suffix=...{key[-4:]}')

    upsert('trainer_live_api_key', key)
    upsert('trainer_live_model', 'models/gemini-2.5-flash-native-audio-latest')
    upsert('trainer_live_voice', 'Puck')
    upsert('trainer_live_disable_auto_vad', 'true')
    print('tersimpan ke filter_config: trainer_live_api_key, _model, _voice, _disable_auto_vad')

    # verify presence without revealing the value
    out = subprocess.run(
        ['docker', 'exec', PG_CONTAINER, 'psql', '-U', PG_USER, '-d', PG_DB,
         '-t', '-A', '-F', '|', '-c',
         "select key, length(value), right(value,4) from filter_config "
         "where key like 'trainer_live%' order by key;"],
        capture_output=True, text=True, check=True,
    ).stdout.strip()
    print('\nverifikasi (panjang + 4 karakter terakhir saja):')
    for line in out.splitlines():
        print('  ', line)


if __name__ == '__main__':
    main()
