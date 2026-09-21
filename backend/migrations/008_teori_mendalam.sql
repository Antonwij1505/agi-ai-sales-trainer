-- 008: Perdalam teori & arahan kelulusan untuk seluruh skenario B2G.
-- Sebelumnya theory_briefing hanya 163-234 karakter (2-3 kalimat) -> terlalu tipis.
-- Sekarang: kerangka kerja, contoh kalimat siap pakai, dan kesalahan umum.

BEGIN;

ALTER TABLE trainer_scenarios ADD COLUMN IF NOT EXISTS theory_briefing TEXT;
ALTER TABLE trainer_scenarios ADD COLUMN IF NOT EXISTS passing_tips TEXT;

-- ============ MOD-01: First Call ke PPK berdasarkan Kode RUP ============
UPDATE trainer_scenarios SET
theory_briefing = $t$APA ITU COLD CALL B2G?
Cold call ke pemerintah bukan "jualan", tapi MEMBUKA RELEVANSI berbasis data. PPK menerima puluhan telepon vendor per bulan. Yang diingat adalah yang datang membawa data spesifik: nama paket, kode RUP, pagu, dan jadwal — bukan yang langsung menawarkan harga.

MENGAPA KRUSIAL
- PPK sudah punya pagu & paket di SirUP. Tugas sales bukan "menciptakan kebutuhan", tapi masuk sebagai mitra yang membantu paket itu berjalan sesuai aturan.
- 15 detik pertama menentukan. Sales umum ("kami ingin menawarkan produk") langsung menabrak tembok. Sales berbasis data ("saya terkait paket RUP ...") langsung dapat atensi.

KERANGKA 4 LANGKAH (RUP-3 MENIT)
1. BUKA — sebut nama, perusahaan, dan bahwa Anda menghubungi terkait paket RUP spesifik.
2. BUKTI — sebut nama paket / kode RUP / jenis barang; tunjukkan Anda sudah riset.
3. TANYA — ajukan 1 pertanyaan teknis atau jadwal (bukan penawaran). Pertanyaan membuat PPK berbicara, dan PPK yang berbicara = PPK yang engage.
4. MINTA AKSES — minta waktu 10 menit diskusi teknis, atau izin mengirim ringkasan spesifikasi.

CONTOH KALIMAT
"Selamat pagi Pak, saya [Nama] dari PT Aston Graphindo Indonesia. Saya menghubungi terkait paket [nama paket] untuk [barang] yang masuk di RUP tahun ini. Saya ingin memastikan spesifikasi teknisnya sudah sesuai kebutuhan dinas — boleh saya pinjam 10 menit Bapak?"

KESALAHAN UMUM
- Langsung menyebut harga/diskon di menit pertama → posisi jatuh jadi vendor, bukan konsultan.
- Tidak menyiapkan kode/nama RUP → terlihat seperti telemarketing massal.
- Sales berbicara 80% waktu → PPK bosan, tidak merasa didengar.$t$,
passing_tips = $p$1. Sebelum menelepon, catat: nama paket, kode RUP, jenis barang, pagu, dan jadwal dari SirUP.
2. Buka dengan kalimat "terkait paket RUP ..." dalam 10 detik pertama.
3. Ajukan minimal 1 pertanyaan terbuka soal kebutuhan/jadwal, lalu DIAM dan dengarkan.
4. Jangan menyebut harga atau diskon di panggilan pertama.
5. Tutup dengan permintaan konkret: jadwal diskusi 10 menit, atau izin mengirim spesifikasi.
6. Catat hasil: nama PIC, jabatan, langkah berikutnya, dan tanggal follow-up.$p$
WHERE id = 7;

-- ============ MOD-02: Konsultasi TKDN & Spesifikasi IFP ============
UPDATE trainer_scenarios SET
theory_briefing = $t$PERAN SALES = KONSULTAN KEPATUHAN
Di pengadaan pemerintah, pejabat takut temuan audit BPK/Inspektorat — terutama bila spesifikasi dianggap "mengarahkan" ke satu merek. Di sinilah TKDN menjadi tameng legal: spesifikasi bisa dibenarkan karena mengacu pada kewajiban penggunaan produk dalam negeri (P3DN), bukan karena preferensi merek.

MENGAPA KRUSIAL
- Anda bukan mendorong merek; Anda membantu pejabat menyusun spesifikasi yang AMAN DIPERIKSA.
- Sertifikat TKDN memberi produk Anda keunggulan yang sah di mata aturan — pesaing tanpa TKDN tidak bisa ikut bertanding.

KERANGKA AUDIT-SAFE (4 LANGKAH)
1. GALI — tanyakan barang eksisting yang dipakai dan masalahnya (usia, kerusakan, biaya perawatan).
2. KAITKAN — hubungkan kebutuhan itu dengan kewajiban TKDN/P3DN.
3. BUKTIKAN — tunjukkan sertifikat TKDN produk ORIMAX (nomor, persentase, masa berlaku).
4. SUSUN BERSAMA — bantu PPTK merumuskan spesifikasi berbasis kebutuhan teknis + syarat TKDN, bukan merek.

CARA MEMBACA SERTIFIKAT TKDN
- Lihat persentase TKDN: harus memenuhi ambang yang dipersyaratkan paket.
- Pastikan masa berlaku masih aktif saat pengadaan berjalan.
- Pastikan nama produk/tipe di sertifikat SAMA dengan yang ditawarkan.

CONTOH KALIMAT
"Pak, spesifikasi ini sebaiknya disusun berbasis kebutuhan teknis dan syarat TKDN. Dengan begitu kalau ada pemeriksaan, dasarnya kuat — bukan karena mengarah ke merek tertentu."

KESALAHAN UMUM
- Mendikte merek di dokumen spesifikasi → membahayakan pejabat, paket bisa digugurkan.
- Mengklaim "TKDN kami besar" tanpa bisa menunjukkan sertifikatnya.
- Tidak tahu barang eksisting dinas, jadi tidak bisa mengaitkan kebutuhan.$t$,
passing_tips = $p$1. Siapkan file sertifikat TKDN produk (PDF) dan hafalkan persentasenya.
2. Mulai dengan pertanyaan tentang barang eksisting & masalahnya — bukan tentang produk Anda.
3. Kaitkan kebutuhan dinas dengan kewajiban TKDN; posisikan diri sebagai pelindung dari temuan audit.
4. Tawarkan bantuan menyusun draf spesifikasi teknis berbasis kebutuhan + TKDN.
5. Jangan pernah menulis merek di draf spesifikasi.
6. Target lulus: PPTK menyetujui spesifikasi ORIMAX untuk masuk dokumen pemilihan.$p$
WHERE id = 8;

-- ============ MOD-03 #1: Tembus CS Dinas — Minta Nama PIC ============
UPDATE trainer_scenarios SET
theory_briefing = $t$FILOSOFI GATEKEEPER
CS/front office bukan musuh — mereka pelindung. Tugas mereka menyaring. Kalau Anda melawan, mereka menutup. Kalau Anda membuat pekerjaan mereka lebih mudah, mereka membantu. Kuncinya: bersikap seperti orang yang SUDAH punya urusan resmi, bukan orang yang sedang mencari-cari.

KERANGKA "3 LAPIS TANYA"
Jangan langsung tanya "siapa PIC pengadaan?" — terlalu cepat, memicu kewaspadaan. Naik bertahap:
1. LAPIS 1 — JABATAN: "Untuk pengadaan barang, biasanya ditangani bagian apa ya, Bu/Pak?"
2. LAPIS 2 — NAMA: "Biasanya yang menangani paket [barang] itu siapa ya? Supaya saya tidak salah kirim dokumen."
3. LAPIS 3 — KONTAK: "Boleh saya dibantu dihubungkan, atau minta nomor/email beliau supaya surat resmi saya sampai ke orang yang tepat?"

PRINSIP
- Beri ALASAN yang menguntungkan instansi, bukan alasan Anda ("saya mau jualan").
- Gunakan frasa "supaya dokumen resmi sampai ke orang yang tepat" — alasan administratif yang wajar.
- Nada ramah dan sopan, tapi percaya diri — seperti orang yang memang biasa berurusan dengan instansi.

CONTOH KALIMAT
"Selamat pagi Bu, saya [Nama] dari PT Aston Graphindo. Saya ingin mengirim dokumen terkait pengadaan [barang] di RUP. Supaya tidak salah alamat, biasanya yang menangani paket ini siapa ya, Bu? Boleh saya minta nomor atau dibantu dihubungkan?"

KESALAHAN UMUM
- Langsung minta "nama PIC" di detik pertama → CS langsung memasang tameng.
- Berbicara seolah menawarkan produk → masuk kategori telemarketing.
- Menyerah setelah satu penolakan — padahal sering butuh 2-3 kali tanya halus.$t$,
passing_tips = $p$1. Siapkan kalimat pembuka ramah + alasan administratif yang wajar (mengirim dokumen resmi).
2. Gunakan teknik 3 lapis: jabatan → nama → kontak. Jangan melompat langsung ke nama.
3. Dengarkan baik-baik nama yang disebut CS — sering nama PIC "bocor" tanpa diminta.
4. Minta dibantu dihubungkan ATAU minta nomor/email — beri dua pilihan.
5. Ucapkan terima kasih spesifik ("terima kasih Bu Rina, sangat membantu") agar CS mengingat Anda.
6. Target lulus: dapat nama lengkap + jabatan + nomor kontak PIC.$p$
WHERE id = 2;

-- ============ MOD-03 #2: CS Bertanya "Ini Perusahaan Apa?" ============
UPDATE trainer_scenarios SET
theory_briefing = $t$MOMEN KREDIBILITAS
Saat CS bertanya "ini perusahaan apa?", itu bukan penolakan — itu PINTU. CS sedang mengecek apakah Anda layak disambungkan. Anda punya sekitar 20 detik untuk membuktikan Anda vendor nyata, bukan telemarketing abal-abal.

KERANGKA "KREDIBILITAS 20 DETIK"
1. NAMA LEGAL — sebut nama PT lengkap, bukan singkatan.
2. JEJAK NYATA — sebut bahwa perusahaan terdaftar di e-Katalog/LKPP, produk bersertifikat TKDN, atau sudah menangani instansi sejenis.
3. RELEVANSI — kaitkan dengan paket RUP yang ada di instansi mereka.
4. MINTA LANGKAH KECIL — minta dihubungkan, bukan minta penjelasan.

MENGAPA KRUSIAL
- CS takut salah menyambungkan telemarketing ke pimpinan. Kalau Anda terlihat kredibel, CS justru merasa aman membantu Anda.
- Kredibilitas = bukti yang bisa dicek: e-Katalog, sertifikat TKDN, pengalaman instansi.

CONTOH KALIMAT
"Bu, PT Aston Graphindo Indonesia — kami terdaftar di e-Katalog LKPP dan produk kami sudah bersertifikat TKDN. Kami sudah beberapa kali menangani pengadaan di dinas pendidikan. Terkait paket [barang] di RUP, boleh saya dibantu dihubungkan ke bagian pengadaan?"

KESALAHAN UMUM
- Menjawab "perusahaan IT, Bu" → terlalu umum, tidak membangun kepercayaan.
- Membaca profil perusahaan panjang lebar → CS tidak punya waktu.
- Terdengar ragu atau bertele-tele saat menyebut nama perusahaan.$t$,
passing_tips = $p$1. Hafalkan 1 kalimat kredibilitas 20 detik: nama PT + e-Katalog + TKDN + pengalaman instansi sejenis.
2. Sebut bukti yang BISA DICEK (e-Katalog, sertifikat), bukan klaim kosong.
3. Kaitkan langsung dengan paket RUP instansi mereka.
4. Suara mantap, tempo tenang — keraguan terdengar seperti tidak profesional.
5. Minta dihubungkan ke bagian pengadaan setelah kredibilitas tersampaikan.
6. Target lulus: CS yakin dan memberi akses ke PIC.$p$
WHERE id = 3;

-- ============ MOD-03 #3: CS Menolak Sambungkan (Soft Resistance) ============
UPDATE trainer_scenarios SET
theory_briefing = $t$JANGAN LAWAN, BELOK
"Sedang rapat" hampir selalu jawaban sopan untuk "saya tidak mau sambungkan". Kalau Anda mendesak, CS mengeras. Kalau Anda menerima lalu langsung pamit, Anda kehilangan lead. Teknik yang benar: TERIMA penolakannya, lalu MINTA KOMITMEN KECIL (waktu atau kontak).

KERANGKA "TERIMA — BELOK — KUNCI"
1. TERIMA: "Baik Bu, saya paham, mungkin sedang sibuk." (turunkan tensi)
2. BELOK: alihkan ke permintaan administratif — kapan waktu yang lebih baik, atau minta nomor/WA PIC.
3. KUNCI: pastikan ada sesuatu yang didapat sebelum menutup telepon (jadwal atau kontak).

JENIS SOFT RESISTANCE & JAWABANNYA
- "Sedang rapat / sedang keluar" → "Baik Bu, kira-kira beliau biasanya kosong jam berapa ya? Supaya saya tidak mengganggu."
- "Bapak sedang tidak di tempat" → "Baik, boleh saya minta nomor atau WA beliau supaya saya hubungi di waktu yang tepat?"
- "Kirim WA saja, nanti saya sampaikan" → "Siap Bu, tapi supaya tepat sasaran boleh saya minta nomor PIC pengadaannya?"

PRINSIP
- Setiap penolakan = permintaan terselubung akan pendekatan yang lebih tepat.
- Jangan pernah menutup telepon tanpa SATU dari ini: nama PIC, kontak, atau jadwal follow-up.$t$,
passing_tips = $p$1. Siapkan 3 kalimat "belok" untuk 3 penolakan paling umum.
2. Saat ditolak: akui dulu ("saya paham Bu"), jangan membantah.
3. Selalu alihkan ke permintaan administratif kecil (kapan / ke mana).
4. Jangan menutup telepon sebelum dapat jadwal follow-up atau kontak PIC.
5. Nada tetap hangat walau ditolak — CS mengingat kesopanan Anda untuk panggilan berikutnya.
6. Target lulus: komitmen waktu follow-up ATAU nomor kontak PIC.$p$
WHERE id = 4;

-- ============ MOD-03 #4: Gatekeeper dengan Konteks RUP ============
UPDATE trainer_scenarios SET
theory_briefing = $t$LEVERAGE DATA PUBLIK
SirUP adalah data publik — paket instansi terlihat siapa saja. Ini senjata Anda: saat menyebut paket RUP milik instansi MEREKA, Anda berhenti jadi telemarketing dan berubah menjadi pihak yang paham urusan mereka. CS pun sulit menolak karena Anda bicara soal pekerjaan instansi sendiri.

MENGAPA KRUSIAL
- CS tahu instansinya punya paket di RUP (sering ramai dibicarakan internal).
- Menyebut paket RUP spesifik = bukti Anda serius, bukan asal menelepon.
- Membuka pintu lebih halus: "saya perlu bicara soal paket X", bukan "saya mau jualan".

KERANGKA "PAKET → PIC"
1. RISET — catat nama paket, kode RUP, jenis barang, dan tahun anggaran.
2. BUKA DENGAN PAKET — sebut paket RUP mereka di kalimat pembuka.
3. KAITKAN KE PIC — "yang mengurus paket ini biasanya siapa ya, Bu?" Pertanyaan ini wajar karena Anda bicara soal paket nyata.
4. KUNCI KONTAK — minta dihubungkan atau minta nomor PIC untuk koordinasi teknis.

CONTOH KALIMAT
"Bu, saya lihat di RUP ada paket [nama paket] untuk [barang] tahun ini. Saya dari PT Aston Graphindo, ingin koordinasi teknis soal spesifikasinya. Biasanya yang menangani paket ini siapa ya, Bu? Boleh dibantu dihubungkan?"

KESALAHAN UMUM
- Menyebut RUP tanpa detail (nama paket/kode) → tidak meyakinkan.
- Tidak riset dulu → salah menyebut paket, kredibilitas jatuh.
- Berhenti di "ada paket" tanpa melanjutkan minta PIC.$t$,
passing_tips = $p$1. Riset SirUP sebelum menelepon: minimal nama paket + jenis barang + tahun anggaran.
2. Buka dengan menyebut paket RUP instansi mereka dalam 10 detik pertama.
3. Gunakan paket itu sebagai alasan wajar menanyakan PIC ("siapa yang mengurus paket ini?").
4. Jika CS ragu, sebut kode RUP sebagai bukti Anda tidak asal bicara.
5. Minta dihubungkan atau minta kontak PIC untuk "koordinasi teknis".
6. Target lulus: dapat nama PIC pengadaan + kontak.$p$
WHERE id = 5;

-- ============ MOD-03 #5: CS Minta Proposal Dikirim Dulu ============
UPDATE trainer_scenarios SET
theory_briefing = $t$PROPOSAL = TIKET, BUKAN TUJUAN
Saat CS bilang "kirim proposal dulu", itu bukan penolakan — itu KESEMPATAN. Masalahnya banyak sales langsung menurut, mengirim ke email umum (info@ / cs@), lalu proposal hilang tanpa jejak. Yang harus Anda rebut sekarang: KONTAK PIC, supaya proposal sampai ke orang yang benar.

MENGAPA KRUSIAL
- Email umum = kuburan proposal. Tidak ada yang bertanggung jawab membacanya.
- Momen "kirim proposal" adalah alasan paling wajar untuk meminta nama & email PIC — CS sulit menolak karena Anda sedang memenuhi permintaan mereka.

KERANGKA "YA — TAPI"
1. YA — setujui permintaannya: "Siap Bu, akan saya kirim proposalnya."
2. TAPI — segera minta kontak tujuan: "Supaya tepat sasaran, boleh saya dikirimkan nama dan email PIC pengadaannya?"
3. AMANKAN — konfirmasi nama, jabatan, email/nomor, lalu sebutkan Anda akan follow-up.
4. JADWALKAN — "Saya kirim hari ini, boleh saya konfirmasi lagi 2 hari lagi?"

CONTOH KALIMAT
"Siap Bu, proposalnya saya kirim hari ini. Supaya tidak nyasar ke email umum dan langsung sampai ke yang berwenang, boleh saya minta nama dan email PIC pengadaan? Nanti saya konfirmasi lagi supaya pasti dibaca."

KESALAHAN UMUM
- Langsung mengirim ke email umum tanpa mendapatkan kontak PIC → lead hilang.
- Menutup telepon tanpa nama PIC.
- Tidak follow-up setelah mengirim → proposal tidak pernah dibuka.$t$,
passing_tips = $p$1. Setujui permintaan proposal — JANGAN menolak.
2. Sebelum menutup telepon, minta nama + email/nomor PIC dengan alasan "supaya tepat sasaran".
3. Konfirmasi ulang kontaknya dengan mengulang/mengeja nama agar tidak salah.
4. Kirim proposal di hari yang sama, lalu WA/telepon konfirmasi 2 hari kemudian.
5. Sertakan nama PIC di subjek email agar mudah ditemukan.
6. Target lulus: dapat alamat email/nomor PIC (bukan email umum).$p$
WHERE id = 6;

-- ============ MOD-04: Follow-Up Bulan ke-2 (Ghosting) ============
UPDATE trainer_scenarios SET
theory_briefing = $t$NURTURING, BUKAN MENAGIH
Di siklus B2G yang panjang (1-3 bulan), diam bukan berarti tidak minat — sering karena anggaran belum turun, sedang rapat, atau prioritas bergeser. Sales pemula menagih ("sudah dibaca belum Pak?") dan jadi mengganggu. Sales profesional MEMBERI NILAI setiap kali menghubungi, sehingga kehadirannya dinanti, bukan dihindari.

KERANGKA "3 SENTUHAN NILAI"
Setiap follow-up harus membawa sesuatu, bukan sekadar menagih:
1. SENTUHAN INFO — kabar baru yang berguna (jadwal e-Katalog dibuka, update aturan TKDN, info pelatihan).
2. SENTUHAN BANTUAN — tawarkan bantuan konkret (bantu siapkan draf spesifikasi, cek ketersediaan stok).
3. SENTUHAN TENGGAT — ingatkan jadwal penting (batas waktu penginputan, akhir tahun anggaran).

PRINSIP JEDA
- Jangan menagih lebih cepat dari 3-5 hari kerja.
- Ganti-ganti kanal: telepon → WA → email (jangan spam satu kanal).
- Selalu akhiri dengan pertanyaan ringan yang mudah dijawab (ya/tidak), bukan pertanyaan berat.

CONTOH KALIMAT (setelah 3 minggu diam)
"Selamat pagi Pak Bambang, saya [Nama] dari Aston Graphindo. Mohon maaf mengganggu. Saya hanya ingin mengabari bahwa periode penginputan e-Katalog untuk [barang] sudah dibuka — kalau Bapak butuh bantuan menyiapkan dokumennya, saya siap membantu. Apakah minggu ini ada waktu saya jelaskan singkat?"

KESALAHAN UMUM
- "Pak, sudah dipikirkan belum?" → terasa menagih.
- Menghubungi tiap hari → dianggap spam, bisa diblokir.
- Tidak membawa info atau nilai apa pun saat menghubungi.$t$,
passing_tips = $p$1. Susun jadwal follow-up: hari ke-4, ke-10, ke-20 (jangan lebih cepat).
2. Setiap follow-up WAJIB membawa nilai: info, bantuan, atau pengingat tenggat.
3. Ganti kanal tiap sentuhan (telepon → WA → email).
4. Akhiri dengan pertanyaan ringan yang mudah dijawab.
5. Jangan pernah mengeluh atau menyindir ("kok tidak dibalas ya Pak?").
6. Target lulus: dapat kejelasan status anggaran & jadwal pengikatan e-Katalog.$p$
WHERE id = 9;

-- ============ MOD-05 #1: Bimbingan Klik E-Katalog & Komparasi Merek ============
UPDATE trainer_scenarios SET
theory_briefing = $t$PERAN "TUTOR KLIK"
Di tahap akhir, banyak pejabat gagal bukan karena tidak mau membeli, tapi karena TIDAK TAHU CARA klik di e-Katalog/e-Purchasing. Sales yang menang adalah yang SABAR MEMBIMBING langkah demi langkah — bukan yang hanya mengirim link lalu menghilang.

MENGAPA KRUSIAL
- Satu klik yang salah (paket salah, jumlah salah, spesifikasi beda) bisa menggagalkan transaksi atau menimbulkan temuan.
- Pejabat sibuk; kemudahan proses menjadi faktor penentu keputusan. Anda yang mempermudah = Anda yang dipilih.

KERANGKA "TEMANI SAMPAI KLIK"
1. PASTIKAN PAKET — cocokkan nama paket, spesifikasi, dan jumlah dengan RUP.
2. PANDU LANGKAH — dampingi saat mencari produk, memasukkan ke keranjang, sampai checkout (via telepon atau screenshare bila perlu).
3. ANTISIPASI ERROR — siapkan solusi untuk masalah umum (akun LPSE, verifikasi, produk toko daring tidak muncul).
4. KONFIRMASI BERSAMA — pastikan paket sudah benar sebelum klik final.

MENANGANI KOMPARASI MEREK
- Jangan menjelekkan pesaing. Tunjukkan PERBEDAAN yang relevan: TKDN, garansi lokal, layanan purna jual, ketersediaan suku cadang.
- Kaitkan dengan risiko: merek tanpa layanan lokal = risiko saat rusak dan potensi temuan audit.

CONTOH KALIMAT
"Pak, saya pandu ya. Pertama buka toko daringnya, cari produk [nama]. Setelah muncul, pastikan spesifikasinya [X] dan jumlahnya [Y]. Kalau sudah, saya temani sampai klik terakhir supaya tidak ada kesalahan."

KESALAHAN UMUM
- Hanya mengirim link lalu menghilang → pejabat bingung, transaksi macet.
- Menjelekkan merek pesaing → dianggap tidak profesional.
- Tidak memastikan paket sesuai RUP → berisiko temuan.$t$,
passing_tips = $p$1. Siapkan panduan klik singkat (langkah 1-2-3) yang mudah diikuti pejabat.
2. Dampingi langsung via telepon/WA saat pejabat melakukan klik — jangan ditinggal.
3. Pastikan nama paket, spesifikasi, dan jumlah SAMA dengan RUP sebelum klik final.
4. Siapkan solusi untuk error umum (akun, verifikasi, produk tidak muncul).
5. Saat dibandingkan merek lain: tonjolkan TKDN, garansi lokal, dan layanan purna jual.
6. Target lulus: PPK menyetujui paket dan melakukan pemesanan (klik e-Purchasing).$p$
WHERE id = 10;

-- ============ MOD-05 #2: Handling Keberatan Harga & Pagu Terbatas ============
UPDATE trainer_scenarios SET
theory_briefing = $t$HARGA MAHAL = MASALAH PERSEPSI NILAI, BUKAN ANGKA
Saat PPK bilang "merek lain lebih murah", jangan langsung memotong harga — itu membunuh marjin dan justru menurunkan kredibilitas (kalau bisa turun, berarti harga awal tidak wajar). Tugas Anda: menggeser percakapan dari HARGA ke TOTAL VALUE.

KERANGKA "NILAI SEBELUM ANGKA"
1. DENGARKAN & AKUI — "Saya paham Pak, anggarannya memang perlu dijaga." (jangan defensif)
2. GALI ALASAN — lebih mahal dibanding apa? merek mana? pagu berapa?
3. BANGUN NILAI — TKDN (aman audit) + garansi lokal + layanan purna jual + ketersediaan suku cadang + dukungan teknis.
4. HITUNG BERSAMA — bandingkan Total Cost of Ownership, bukan harga beli saja.
5. BARU BICARA HARGA — bila perlu, tawarkan nilai tambah (pelatihan, instalasi, perpanjangan garansi), bukan potong harga langsung.

ARGUMEN NILAI KHAS B2G
- TKDN: memenuhi syarat P3DN, aman dari temuan BPK/Inspektorat.
- Garansi & layanan lokal: tidak menunggu lama bila ada kerusakan.
- Risiko: merek murah tanpa layanan lokal = biaya perbaikan dan gangguan operasional di kemudian hari.

CONTOH KALIMAT
"Pak, saya paham soal anggaran. Tapi kalau kita lihat TKDN-nya, produk kami aman diperiksa dan mendukung P3DN. Garansi dan layanan purna jualnya juga lokal, jadi kalau ada kendala tidak mengganggu operasional dinas. Boleh saya bantu hitung nilai totalnya, Pak?"

KESALAHAN UMUM
- Langsung memberi diskon → marjin rusak, harga awal jadi tidak dipercaya.
- Menjelekkan merek pesaing → tidak profesional.
- Menjawab "harga kami memang segitu" tanpa membangun nilai.$t$,
passing_tips = $p$1. Akui keberatan harga dulu ("saya paham Pak"), jangan defensif.
2. Gali detailnya: lebih mahal dibanding merek apa, dan pagunya berapa.
3. Alihkan ke nilai: TKDN, garansi lokal, purna jual, suku cadang, dukungan teknis.
4. Bandingkan Total Cost of Ownership, bukan harga beli.
5. Utamakan menawarkan nilai tambah (pelatihan/instalasi/garansi) daripada memotong harga.
6. Pertahankan marjin: jangan pernah langsung memberi diskon di menit pertama.$p$
WHERE id = 11;

COMMIT;

-- Verifikasi
SELECT s.id, m.code, length(s.theory_briefing) AS teori, length(s.passing_tips) AS tips
FROM trainer_scenarios s JOIN trainer_modules m ON s.module_id = m.id
ORDER BY m.code, s.id;
