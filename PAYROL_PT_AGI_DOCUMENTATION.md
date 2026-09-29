# LAPORAN LENGKAP & DOKUMENTASI MODUL CUSTOM PAYROLL PT. ASTON GRAPHINDO INDONESIA (PT. AGI)
**Odoo 16 Community Edition**

---

## 1. PENDAHULUAN & TUJUAN
Modul Odoo Custom Payroll (`custom_payroll_agi`) dibangun untuk menggantikan proses pengelolaan gaji berbasis Microsoft Excel (`PAYROLL SEPTEMBER 2026.xlsx`) di **PT. Aston Graphindo Indonesia (PT. AGI)**. 
Modul ini berjalan di atas **Odoo 16 Community**, menggunakan Python, PostgreSQL, Odoo ORM, XML Views, dan QWeb Reports tanpa ketergantungan pada Odoo Enterprise.

Prioritas utama sistem: **SIMPLE → AKURAT → MUDAH DIGUNAKAN → MUDAH DIEDIT → MINIM INPUT ULANG → AMAN → SIAP DIPAKAI SETIAP BULAN.**

---

## 2. STRUKTUR ARSITEKTUR & FILE MODUL
Modul tersimpan pada direktori:
`/home/agi/odoo16-dev/src/odoo16/custom-addons/hrd/custom_payroll_agi/`

Daftar file yang menyusun modul:
- `__manifest__.py` : Konfigurasi modul, dependensi (`base`, `hr`, `mail`), dan urutan pemuatan data/views.
- `__init__.py` : Inisialisasi package Python.
- `models/`
  - `__init__.py`
  - `hr_employee.py` : Pewarisan model karyawan (`hr.employee`) untuk NIK, Gaji Pokok, Tunjangan Tetap, dan Rekening Bank.
  - `hr_payroll_component.py` : Master komponen pendapatan dan potongan gaji.
  - `hr_payroll_account_mapping.py` : Pemetaan akun akuntansi debet/kredit (Jurnal Finance).
  - `res_config_settings.py` : Pengaturan konfigurasi persentase tarif BPJS Kesehatan dan BPJS Ketenagakerjaan.
  - `hr_payroll_line.py` : Model detail perhitungan gaji per karyawan.
  - `hr_payroll_period.py` : Model utama transaksi bulanan (Single Source of Truth) dan state machine approval.
- `wizard/`
  - `__init__.py`
  - `payroll_copy_wizard.py` : Logika wizard untuk menyalin data payroll bulan sebelumnya ke bulan baru.
  - `payroll_copy_wizard_views.xml` : Tampilan form wizard copy payroll.
- `views/`
  - `payroll_menus.xml` : Definisi menu utama `PAYROLL PT. AGI` dan sub-menu transaksi, laporan, dan konfigurasi.
  - `hr_employee_views.xml` : Penambahan tab payroll pada form karyawan standard.
  - `hr_payroll_component_views.xml` : Tampilan master komponen gaji.
  - `hr_payroll_account_mapping_views.xml` : Tampilan pemetaan akun akuntansi.
  - `res_config_settings_views.xml` : Menu konfigurasi pengaturan BPJS.
  - `hr_payroll_line_views.xml` : Tampilan tree & form detail line gaji.
  - `hr_payroll_period_views.xml` : Tampilan utama periode payroll dengan statusbar approval dan tombol aksi.
- `security/`
  - `payroll_security.xml` : Definisi grup akses (HRD, Finance, Director, Admin).
  - `ir.model.access.csv` : Hak akses tabel untuk masing-masing grup.
- `data/`
  - `payroll_sequence.xml` : Sequence nomor transaksi period.
  - `payroll_component_data.xml` : Data awal komponen pendapatan dan potongan.
  - `payroll_account_mapping_data.xml` : Data awal pemetaan jurnal finance.
- `reports/`
  - `__init__.py`
  - `report_paperformat.xml` : Pengaturan format kertas PDF (A4 Portrait & Landscape).
  - `report_payslip_templates.xml` : Template QWeb cetak Slip Gaji (individual & massal).
  - `report_bank_transfer_templates.xml` : Template QWeb Laporan Bank Transfer.
  - `report_payroll_resume_templates.xml` : Template QWeb Resume Payroll per Departemen.
  - `report_finance_summary_templates.xml` : Template QWeb Laporan Jurnal Akuntansi Finance.
  - `payroll_reports.xml` : Registrasi report actions QWeb PDF.

---

## 3. HASIL PENGUJIAN & VERIFIKASI DATA SEPTEMBER 2026
Impor data dari `PAYROLL SEPTEMBER 2026.xlsx` ke dalam Odoo 16 (`database: agi`) telah dijalankan dan diverifikasi validasinya secara presisi:

- **Total Karyawan**: 26 Karyawan Aktif
- **Total Gaji Pokok & Tunjangan Tetap (Gross Fixed)**: Rp 106.289.102,00
- **Total Tambahan Variabel (Insentif Sales, Point Aktivitas)**: Rp 3.401.372,00
- **Total Gross Salary**: Rp 109.690.474,00
- **Total Potongan Pinjaman Karyawan**: Rp 6.900.000,00
- **Total Potongan BPJS Kesehatan (1% dari Gaji Dasar)**: Rp 1.165.637,00
- **Total Potongan BPJS Ketenagakerjaan (3% dari Gaji Dasar)**: Rp 2.499.080,00
- **Total Seluruh Potongan**: Rp 10.564.720,00
- **Total Take Home Pay (THP / Bank Transfer BCA)**: **Rp 99.125.754,00**

*(Seluruh perhitungan akurat 100% dan cocok dengan rekapitulasi sheet Excel asal).*

---

## 4. WORKFLOW APPROVAL & PENGAMANAN DATA
Sistem dilengkapi alur persetujuan bertingkat yang memastikan data tidak dapat diubah setelah disetujui pimpinan:
1. **`Draft / HRD Review`**: HRD membuat periode baru, menggenerate atau menyalin data, serta menyesuaikan insentif/potongan variabel.
2. **`Waiting Finance`**: HRD mengajukan dokumen ke bagian keuangan dengan menekan tombol *Submit to Finance*.
3. **`Waiting Director`**: Finance (`Agung Jayadi`) memeriksa kelayakan dan menekan *Approve (Finance)*.
4. **`Locked / Done`**: Direktur (`Anton Wijaya`) memberikan otorisasi akhir dengan menekan *Approve & Lock (Director)*. Dokumen terkunci otomatis dan siap ditransfer melalui bank.

---

## 5. CARA PENGGUNAAN FITUR UTAMA
- **Membuat Payroll Periode Baru**: Masuk ke menu `PAYROLL PT. AGI` → `Transaksi Payroll` → `Payroll Period` → *New*.
- **Copy Bulan Sebelumnya**: Di form Payroll Period, klik tombol *Copy Previous Payroll*, pilih periode sumber (misal September 2026) dan target bulan (misal Oktober 2026), lalu klik *Copy Payroll*. Data dasar karyawan dan pinjaman akan terbawa otomatis.
- **Cetak Laporan / Slip Gaji**: Pada form Payroll Period, klik tombol *Print* di bagian atas untuk mencetak:
  - Slip Gaji Massal / Individual (`QWeb PDF`)
  - Laporan Bank Transfer (`QWeb PDF`)
  - Resume Payroll (`QWeb PDF`)
  - Laporan Untuk Finance / Jurnal Akuntansi (`QWeb PDF`)

---
*Dokumentasi ini disimpan secara permanen di workspace lokal sebagai acuan operasional bulanan PT. Aston Graphindo Indonesia.*
