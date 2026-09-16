# Gemini Live (speech-to-speech) — hasil prototipe

Tanggal: 2026-09-16
Voice yang dipilih user: **Puck**
Tujuan: menguji apakah Gemini Live menjawab keluhan *"suara seperti robot, dan lambat sekali"*,
sebelum menyentuh aplikasi Android.

## Kenapa diuji

Aplikasi sekarang memakai pipeline 3 tahap berurutan:

```
STT (Deepgram) → LLM (deepseek-v4.1-flash) → TTS (edge-tts)
```

Setiap tahap di-`await`, jadi totalnya jumlah ketiganya. Terukur di server ini
**~3,7 detik** normal, dan sampai **22 detik** ketika Deepgram melambat.

ChatGPT terasa luwes karena memakai **speech-to-speech**: satu model, audio masuk →
audio keluar, tidak pernah jadi teks. Nada bicara tidak hilang.

## Cara menjalankan

Key Google dibaca dari store kredensial 9router (read-only, tidak pernah dicetak).
Untuk produksi harus pindah ke `filter_config` / `.env` seperti provider lain,
dan **tidak boleh** masuk ke APK (PRD §78).

```bash
cd backend
PY=/home/agi/.hermes/hermes-agent/venv/bin/python

# satu balasan
$PY scripts/proto_gemini_live.py --audio /tmp/t2.mp3 --voice Puck --realtime

# sesi latihan penuh 5 giliran
$PY scripts/probe_session.py

# cek kuota
$PY scripts/probe_quota.py 60 0
```

## Hasil

Model: `models/gemini-2.5-flash-native-audio-latest`

### 1. Kualitas bahasa — ini kemenangan utamanya

| | Pipeline sekarang | Gemini Live |
|---|---|---|
| Balasan | "Baik, saya bantu arahkan. Untuk pengadaan IT, biasanya ditangani oleh..." | "Oh, soal pengadaan IT? Biasanya Pak Agus di bagian perencanaan **sih** yang urus." |
| Partikel lisan | tidak ada | "sih", "kok", "ya?", "nih", "Hmm" |
| Panjang | 23–29 kata | 6–11 kata |
| Nada | memo kebijakan | orang di telepon |

Transkrip balik lewat Deepgram **100% cocok** → pengucapannya jelas.

### 2. Latensi — KOREKSI PENTING

**Angka yang saya laporkan pertama kali (~991ms, ~1,7 detik) SALAH.** Angka itu
diukur dengan VAD otomatis menyala, dan `diag_vad.py` membuktikan VAD menyala di
**tengah kalimat** — model menjawab giliran yang **terpotong**, sehingga terlihat cepat.

Bukti dari `diag_vad.py` (satu kalimat 9,7 detik dengan permintaan kedua di akhir):

| Mode | Yang didengar model | Audio pertama |
|---|---|---|
| auto VAD | *"Selamat pagi, Bu. Saya Adi dari Orimas."* — **hanya 2 detik pertama** | 1ms |
| eksplisit (VAD off) | seluruh kalimat, termasuk permintaan nomor kontak | 3527ms |

Dalam mode auto, CS **mengabaikan** permintaan kedua sales. Dalam mode eksplisit,
CS menjawabnya.

**Angka yang benar** (VAD off, kalimat utuh, `diag_ttfa_true.py`, 2 run masing-masing):

| Panjang ucapan | TTFA median |
|---|---|
| pendek (3,3s) | 2.424–2.605ms |
| sedang (6,0s) | 2.106–2.740ms |
| panjang + jeda (9,7s) | 3.086–3.333ms |

| | Pipeline sekarang | Gemini Live (VAD off) |
|---|---|---|
| Latensi normal | ~3.700ms | **~2.100–3.300ms** |
| Perbaikan | — | **~1,2–1,6× lebih cepat** |

Jadi latensi membaik, tapi **tidak** 2–4× seperti yang saya klaim sebelumnya.
Keuntungan utamanya adalah **kehalusan bahasa**, bukan kecepatan.

### 3. Temuan teknis lain

**`thinkingConfig.thinkingBudget = 0` memotong TTFA lebih dari separuh** — ini tetap
berlaku, diukur dengan VAD off juga.

**Hening di akhir (`trail`) tidak diperlukan saat VAD off.** Dengan kontrol giliran
eksplisit, trail=0ms sama baiknya (bahkan sedikit lebih baik) daripada trail=200ms.
Ini masuk akal: aplikasi sendiri yang menentukan kapan giliran selesai.

**VAD otomatis tidak cocok untuk aplikasi ini.** Sales sering berhenti sebentar di
tengah kalimat. Kalau VAD menyala di situ, CS menjawab separuh pertanyaan — bug yang
akan sangat terasa saat latihan. **Kontrol giliran harus eksplisit**, dan aplikasi
harus tahu kapan sales benar-benar selesai (tombol "selesai bicara" atau VAD sendiri
di Android).

### 4. Kuota free tier — diukur, bukan ditebak

Google tidak lagi mencantumkan angkanya di halaman rate limit (dipindah ke AI Studio).
Jadi saya ukur dengan `probe_quota.py`:

| Uji | Hasil |
|---|---|
| 20 sesi beruntun, tanpa jeda | **semua sukses** |
| 60 sesi beruntun, tanpa jeda | **semua sukses** |

**Belum ditemukan batasnya.** Ini kabar baik, tapi juga berarti kuota harian
sebenarnya belum diketahui — 60 sesi setup bukan 60 sesi latihan penuh.

### 5. Pemakaian token per sesi latihan

Satu sesi 5 giliran (`probe_session.py`), terukur dari `usageMetadata`:

| | Nilai |
|---|---|
| Durasi sesi | 26,5 detik |
| Ucapan sales | 25,1 detik |
| Balasan CS | 15,5 detik |
| Token audio masuk | ~626 |
| Token audio keluar | ~387 |

Google menagih **25 token per detik audio**. Sesi 5 giliran ≈ 1.000 token audio.
Ini belum dihitung terhadap harga tier berbayar.

## Keterbatasan yang harus diselesaikan sebelum produksi

1. **Kredensial**: key dibaca dari sqlite 9router. Harus pindah ke `filter_config`.
2. **Kuota free tier**: 60 sesi setup lolos, tapi batas harian belum diketahui.
   Google **memakai data free tier untuk melatih model** — perlu keputusan manajemen
   untuk rekaman latihan sales internal.
3. **Streaming di Android**: sekarang app mengirim file MP3 utuh lalu menunggu balasan
   utuh. Live API butuh WebSocket dua arah:
   - `VoiceRecorder` harus mengirim PCM 16kHz berkelanjutan, bukan menyimpan file
   - `ReplyPlayer` harus memutar audio sambil diterima, bukan menunggu selesai
   - **Harus ada penanda giliran yang andal** (VAD otomatis Gemini terbukti salah
     memotong kalimat) — misalnya tombol "selesai bicara" atau VAD lokal
4. **Evaluasi**: transkrip harus tetap tersedia untuk penilaian per-kompetensi.
   Gemini Live bisa mengeluarkan `inputAudioTranscription` dan `outputAudioTranscription`
   — sudah diverifikasi bekerja.
5. **Belum diuji di HP sungguhan** — hanya di server, audio dari file, bukan mikrofon.

## Kesimpulan

Gemini Live **menjawab keluhan secara nyata**, tapi bukan karena kecepatan:

- **Kehalusan bahasa**: ya, jelas dan terukur. Ini yang membuat terasa seperti manusia.
- **Latensi**: membaik ~1,2–1,6×, **bukan** 2–4× seperti klaim awal saya.
- **Bug VAD otomatis**: ditemukan lewat pengujian ini. Kalau tidak ketahuan, akan
  membuat CS menjawab separuh pertanyaan sales saat latihan.

Ini perubahan arsitektur, bukan penggantian voice, dan butuh pekerjaan Android
yang signifikan sebelum bisa dipakai sales.

---

## Integrasi Android (setelah prototipe)

Prototipe di atas diuji dari server. Bagian ini mencatat integrasi sebenarnya ke
aplikasi Android dan apa yang sudah/belum terbukti.

### Arsitektur

Aplikasi **tidak** bicara langsung ke Google. HP membuka WebSocket ke backend kita,
backend memegang sesi Gemini, dan frame diteruskan dua arah:

```
Android  ──ws──>  trainer backend (:4100)  ──wss──>  Gemini Live
   ▲                      │
   └──── audio + transkrip ┘
```

Alasannya bukan sekadar kerapian:
1. PRD §78 — APK tidak boleh berisi kredensial. Key tetap di server.
2. Key bisa dirotasi dari `filter_config` tanpa merilis APK baru.
3. Backend perlu melihat transkrip agar penilaian per-kompetensi tetap jalan.

### Protokol relay

Klien → server: `{"t":"start"}` (implisit saat connect), `{"t":"audio","pcm":"<base64>"}`,
`{"t":"turn_start"}`, `{"t":"turn_end"}`, `{"t":"stop"}`

Server → klien: `{"t":"ready"}`, `{"t":"audio","pcm":"..."}`,
`{"t":"transcript","speaker":"SALES"|"CS","text":"..."}`, `{"t":"turn_end"}`,
`{"t":"error","message":"..."}`

### Yang sudah TERBUKTI

Diuji dari emulator Android sungguhan (bukan mock), lewat WebSocket, ke Gemini asli:

| Yang diuji | Hasil |
|---|---|
| Token palsu | ditolak saat handshake |
| Kalimat 9,7 detik | **didengar utuh** (tidak terpotong VAD) |
| Audio balasan | 133–184 chunk, tiba ~5× lebih cepat dari real-time |
| Transkrip | tersimpan ke `trainer_turns` |
| Lewat Cloudflare | `wss://trainer.orimax.co.id` berhasil |
| Audit APK | tidak ada key, tidak ada host Google |

Bukti transkrip dari sesi uji (session 67):

```
SALES: Selamat pagi, Bu. Saya Adi dari Orimas. Boleh bicara dengan bagian
       pengadaan IT? Kalau boleh, saya juga mau minta nomor kontak Pak Agus ya Bu.
CS   : Wah, Pak Agus lagi tidak ada nih. Bagian pengadaan juga sedang rapat.
```

Perhatikan: kalimat sales **utuh** sampai permintaan nomor kontak, dan CS menjawab
dengan partikel lisan ("nih"). Inilah yang membedakan dari pipeline lama.

### Keputusan: VAD otomatis dimatikan

Karena VAD otomatis Gemini terbukti memotong giliran di tengah kalimat, aplikasi
yang menentukan batas giliran:
- deteksi keheningan lokal (1,2 detik) mengakhiri giliran, dan
- tombol **"Selesai bicara"** selalu tersedia, karena tidak ada ambang batas energi
  yang cocok untuk semua ruangan.

### Yang BELUM terbukti

- **Belum pernah dijalankan di HP sungguhan.** Emulator di server ini tidak bisa
  menerima input mikrofon, jadi pengambilan suara dari mikrofon asli belum diuji.
  Yang sudah diuji adalah semua tahap SETELAH capture.
- Kuota harian free tier belum diketahui batasnya.
- Mode lama (per giliran) tetap dipertahankan sebagai cadangan untuk koneksi lemah.

### Penilaian tetap bekerja dari transkrip Live

Ini yang paling penting untuk dipastikan: transkrip yang dikumpulkan relay harus
bisa dinilai per-kompetensi seperti sebelumnya. Diuji dengan mengevaluasi sesi Live
nyata (session 67):

| | Hasil |
|---|---|
| HTTP | 200 |
| Skor | 11 / 100 (lulus ≥ 80) |
| Kompetensi | 5, dengan bukti kutipan transkrip |
| Tersimpan | ya, dengan `prompt_version_id` + `ai_model` |

Contoh bukti yang dihasilkan mesin penilai dari transkrip Live:

> gatekeeper_handling (bobot 30, skor 0): "Sales langsung meminta nomor kontak dan
> tidak mencari jalur alternatif, tidak mendapatkan nama/jabatan PIC lain, tidak
> menetapkan waktu konkret, dan percakapan berhenti tanpa hasil."

Skornya rendah karena uji ini hanya **satu giliran** — dan itu justru benar: satu
pertanyaan pembuka belum menunjukkan kemampuan menembus gatekeeper. Yang terbukti
di sini adalah **jalur evaluasinya berfungsi**, bukan nilai akhirnya.

Catatan: nama field di API adalah `overall_score` (bukan `score`), dan status
tersimpan di kolom `status`. Kesalahan baca skrip saya sendiri, bukan bug backend.

### Uji keamanan relay

| Uji | Hasil |
|---|---|
| Token tanpa tanda tangan sah | ditolak saat handshake (401) |
| Token sah tapi sesi milik orang lain | ditolak: "Sesi ini bukan milik Anda." |
| Sesi tidak ada | ditolak: "Sesi tidak ditemukan." |
| Token di query string | tidak masuk access log (morgan skip path relay) |

Cek kepemilikan memakai perbandingan `Number()` karena PostgreSQL mengembalikan
`bigint` sebagai string — perbandingan langsung akan selalu gagal.
