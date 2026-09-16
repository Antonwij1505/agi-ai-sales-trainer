# Gemini Live (speech-to-speech) — hasil prototipe

Tanggal: 2026-09-16
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
/home/agi/.hermes/hermes-agent/venv/bin/python scripts/proto_gemini_live.py \
  --audio /tmp/t2.mp3 --voice Aoede --realtime
```

## Hasil

Model: `models/gemini-2.5-flash-native-audio-latest`
Audio uji: 4,3 detik ucapan sales ("Boleh saya tahu Bapak atau Ibu yang menangani pengadaan IT di dinas ini?")

### 1. Kualitas bahasa — jauh lebih manusiawi

| | Pipeline sekarang | Gemini Live |
|---|---|---|
| Balasan | "Baik, saya bantu arahkan. Untuk pengadaan IT, biasanya ditangani oleh..." | "Oh, soal pengadaan IT? Biasanya Pak Agus di bagian perencanaan **sih** yang urus." |
| Partikel lisan | tidak ada | "sih", "kok", "ya?", "Pak" |
| Panjang | 23–29 kata | 6–11 kata |
| Nada | memo kebijakan | orang di telepon |

Transkrip balik lewat Deepgram **100% cocok** → pengucapannya jelas.

### 2. Latensi — ada dua temuan penting

**Temuan A: `thinkingConfig.thinkingBudget = 0` memotong TTFA lebih dari separuh.**

| Konfigurasi | TTFA median |
|---|---|
| thinking aktif (default) | ~3.994ms |
| thinking OFF | ~1.796ms |
| thinking OFF + hening akhir | **~991ms** |

**Temuan B: kontrol giliran eksplisit (`activityEnd`) TIDAK membantu.**

| Mode | TTFA median |
|---|---|
| implicit VAD | 3.346ms |
| explicit `activityEnd` | 3.766ms |

Dugaan awal saya bahwa VAD yang menyebabkan lambat **salah** — waktunya habis di
generasi model, bukan di deteksi giliran.

**Temuan C: yang dirasakan pengguna = hening + TTFA, dan itu stabil ~1,6–1,8 detik.**

| Hening | TTFA | **Dirasakan** |
|---|---|---|
| 200ms | 1.404ms | **1.606ms** |
| 600ms | 1.214ms | 1.819ms |
| 1000ms | 686ms | 1.695ms |

Hening 200ms sudah cukup; menambah hening hanya memindahkan jeda, tidak menghilangkannya.

### 3. Perbandingan langsung

| | Pipeline sekarang | Gemini Live |
|---|---|---|
| Arsitektur | 3 tahap berurutan | 1 model |
| Latensi normal | ~3.700ms | **~1.700ms** |
| Latensi terburuk | ~22.000ms | belum terlihat |
| Nada/emosi terbawa | tidak (hilang di teks) | ya |
| Partikel lisan | tidak ada | ada |
| Biaya | Deepgram + LLM + edge-tts | Gemini Live |

## Keterbatasan yang harus diselesaikan sebelum produksi

1. **Kredensial**: key dibaca dari sqlite 9router. Harus pindah ke `filter_config`.
2. **Kuota free tier**: belum diuji berapa kuota hariannya. Google **memakai data
   free tier untuk melatih model** — perlu persetujuan manajemen untuk data internal.
3. **Streaming di Android**: sekarang app mengirim file MP3 utuh lalu menunggu balasan
   utuh. Live API butuh WebSocket dua arah. Ini perubahan besar:
   - `VoiceRecorder` harus mengirim PCM 16kHz berkelanjutan, bukan menyimpan file
   - `ReplyPlayer` harus memutar audio sambil diterima, bukan menunggu selesai
   - Perlu penanganan interupsi (barge-in)
4. **Evaluasi**: harus dipastikan transkrip tetap tersedia untuk penilaian per-kompetensi.
   Gemini Live bisa mengeluarkan `inputAudioTranscription` dan `outputAudioTranscription`.
5. **Biaya per sesi** belum dihitung.
6. **Belum diuji di HP sungguhan** — hanya di server, audio dari file, bukan mikrofon.

## Kesimpulan

Gemini Live **menjawab keluhan secara nyata**: bahasa jauh lebih luwes dan latensi
turun ~2x. Tapi ini perubahan arsitektur, bukan penggantian voice — dan butuh
pekerjaan Android yang signifikan sebelum bisa dipakai sales.
