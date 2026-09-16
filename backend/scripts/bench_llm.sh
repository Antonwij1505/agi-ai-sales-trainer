#!/usr/bin/env bash
# Benchmark LLM candidates for the roleplay turn using the REAL system prompt
# shape, so latency is measured under the conditions the app actually runs.
set -uo pipefail

KEY=$(docker exec orimax-sirup-postgres-1 psql -U orimax -d sirup -t -A -c "select value from filter_config where key='ai_api_key';")
URL="https://9router.orimax.co.id/v1/chat/completions"

SYS='Kamu adalah customer instansi pemerintah Indonesia dalam simulasi latihan telemarketing. Peranmu: Ibu Sari, Staf Front Office di Dinas Pendidikan Provinsi. Kamu sibuk, agak curiga pada telemarketing.

BATAS PANJANG: Maksimal 2 kalimat pendek, di bawah 25 kata.
CONTOH: Sales: "Selamat pagi Bu, saya Adi dari ORIMAX." Kamu: "Pagi. Dari mana ya, Pak?"
JANGAN menyapa ulang. JANGAN memakai markdown. Balas HANYA ucapanmu sebagai CS.'

USER='SALES: Selamat pagi bu. Saya Adi dari Orimas. Kami supplier solusi IT untuk instansi pemerintah.
Balas sebagai CS (1-2 kalimat, bahasa Indonesia lisan):'

bench() {
  local model="$1"
  local total=0 ok=0 words=0
  for i in 1 2 3; do
    local body
    body=$(python3 -c "
import json,sys
print(json.dumps({'model':'$model','messages':[{'role':'system','content':sys.argv[1]},{'role':'user','content':sys.argv[2]}],'temperature':0.9,'max_tokens':200}))
" "$SYS" "$USER")
    local out t
    out=$(curl -s -m 60 -w "\n__T__%{time_total}" -X POST "$URL" \
      -H "Authorization: Bearer $KEY" -H 'Content-Type: application/json' \
      -d "$body" 2>/dev/null)
    t=$(echo "$out" | grep -o '__T__[0-9.]*' | sed 's/__T__//')
    local txt
    txt=$(echo "$out" | python3 -c "
import sys,json
raw=sys.stdin.read().split('__T__')[0]
try:
    d=json.loads(raw)
    c=d.get('choices',[{}])[0].get('message',{}).get('content','') or ''
    print(c.strip().replace(chr(10),' ')[:70])
except Exception as e:
    print('ERR')
" 2>/dev/null)
    if [ -n "$t" ]; then
      total=$(python3 -c "print($total + $t)")
      ok=$((ok+1))
    fi
    printf "    run%d: %-7s  %s\n" "$i" "${t:-fail}" "$txt"
  done
  if [ "$ok" -gt 0 ]; then
    python3 -c "print('    RATA-RATA: %.2f detik' % ($total/$ok))"
  fi
}

for m in "$@"; do
  echo "── $m"
  bench "$m"
  echo
done
