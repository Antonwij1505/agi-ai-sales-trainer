# Arsitektur Unified Voice AI Engine (Robot Sales & Sales Trainer)

Dokumen ini mencatat penyatuan arsitektur mesin AI suara antara **Robot Sales** dan **AGI AI Sales Trainer** ke dalam satu backend terpusat di `orimax-sirup-dashboard`.

---

## 1. Latar Belakang & Motivasi

Sebelum penyatuan, terdapat dua backend service dan server port yang berjalan terpisah di Proxmox:
1. `orimax-sirup-backend-1` (Port 4000): Melayani SIRUP Dashboard, Rapor Sales, Odoo CRM, dan Robot Sales.
2. `agi-trainer-api` (Port 4100): Melayani roleplay suara mobile sales trainer.

Penyatuan mesin ini dilakukan untuk mencapai:
* **Single Source of Truth:** Knowledge base katalog produk Orimax (TKDN, ISO, harga) dan evaluasi transkrip terpusat di satu database.
* **Efisiensi Server:** Menghapus beban proses ganda (container port 4100 dipensiunkan).
* **Zero Cross-Service Friction:** Integrasi rapor coaching ke modul latihan sales berjalan instan tanpa perlu callback webhook antar-port.
* **Satu Domain API Resmi:** Seluruh lalu lintas mobile dan web diarahkan ke `https://sirup-api.orimax.co.id`.

---

## 2. Arsitektur Terpadu (Unified Architecture)

Mesin suara menggunakan model **Unified Voice Conversational Engine**:

```
                       ┌───────────────────────────────────────────────┐
                       │          ORIMAX UNIFIED VOICE ENGINE          │
                       │           (sirup-api.orimax.co.id)            │
                       │             Backend: Port 4000                │
                       └───────────────────────┬───────────────────────┘
                                               │
               ┌───────────────────────────────┴───────────────────────────────┐
               ▼                                                               ▼
   ┌───────────────────────┐                                       ┌───────────────────────┐
   │   MODE: ROBOT SALES   │                                       │  MODE: SALES TRAINER  │
   │  (/api/robot-sales/*) │                                       │    (/api/trainer/*)   │
   ├───────────────────────┤                                       ├───────────────────────┤
   │ Peran AI: Sales Orimax│                                       │ Peran AI: Klien/Dinas │
   │ Lawan: Pejabat Riil   │                                       │ Lawan: Salesman (HP)  │
   │ Target: Probing Lead  │                                       │ Target: Menguji Skill │
   │ Akses: Web Dashboard  │                                       │ Akses: Android APK    │
   └───────────────────────┘                                       └───────────────────────┘
```

---

## 3. Struktur Endpoint Terintegrasi (`/api/trainer/*`)

Semua endpoint yang sebelumnya di port 4100 kini aktif dan dilayani oleh `orimax-sirup-backend` di port 4000:

| Method | Endpoint | Fungsi |
| :--- | :--- | :--- |
| `GET` | `/api/trainer/modules` | Menampilkan 5 modul aktif beserta jumlah skenario riil. |
| `GET` | `/api/trainer/modules/:id` | Detail modul, daftar skenario, dan rubrik penilaian berbobot. |
| `POST` | `/api/trainer/sessions` | Memulai sesi roleplay baru (in-progress) dengan opening turn instan. |
| `GET` | `/api/trainer/sessions/:id` | Mengambil status dan riwayat turn sesi latihan. |
| `POST` | `/api/trainer/sessions/:id/turns` | Mengirim giliran percakapan teks / audio STT. |
| `POST` | `/api/trainer/sessions/:id/end` | Mengakhiri percakapan roleplay. |
| `GET` | `/api/trainer/sessions/:id/eval` | Hasil evaluasi 6 rubrik objektif berbasis bukti (*evidence quote*). |
| `WS` | `/api/trainer/live/:sessionId` | WebSocket relay Gemini Live Speech-to-Speech (PCM16 16kHz). |
| `GET` | `/api/trainer/progress` | Rekap skor kelulusan dan badge kompetensi sales. |
| `GET` | `/api/trainer/theory/:scenarioId` | Panduan teori, tips lulus, dan briefing kasus. |

---

## 4. Konfigurasi Aplikasi Mobile Android (`AGI Trainer`)

Aplikasi Android (`android/app/build.gradle.kts`) telah diperbarui untuk mengarah langsung ke domain API terpadu:
* **API_BASE_URL:** `https://sirup-api.orimax.co.id/`
* **AUTH_BASE_URL:** `https://sirup-api.orimax.co.id/`
* **Live WebSocket:** `wss://sirup-api.orimax.co.id/api/trainer/live/:sessionId`
* **Status Build APK:** `app-release.apk` (12 MB) berhasil dikompilasi dan siap didistribusikan ke tim sales.

---

## 5. Status Verifikasi Produksi

1. **HTTP Modules:** `curl -s https://sirup-api.orimax.co.id/api/trainer/modules` $\rightarrow$ `HTTP 200 (Count: 5)`.
2. **Session Creation:** `POST /api/trainer/sessions` $\rightarrow$ `HTTP 200 (Session ID 109 created, resistance level 4)`.
3. **Container Pensiun:** Container lama `agi-trainer-api` (Port 4100) telah dimatikan (`docker stop`). Seluruh beban sekarang ditangani secara efisien oleh `orimax-sirup-backend-1`.
