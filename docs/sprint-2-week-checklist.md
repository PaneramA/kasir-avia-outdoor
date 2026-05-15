# Sprint 2 Minggu - Checklist Eksekusi

Dokumen ini adalah checklist harian yang bisa langsung dieksekusi.

## Aturan Main Sprint

- Prioritas utama: stabilitas flow bisnis inti.
- Setiap task wajib lolos lint/build sebelum ditutup.
- Semua perubahan permission tenant/cabang harus dites minimal 1 skenario `success` dan 1 skenario `forbidden`.
- Jika ada bug blocker, hentikan task baru dan selesaikan blocker dulu.

## Definition Of Done (DoD)

- [ ] Kode lolos `npm run lint:api` dan `npm run lint:web`.
- [ ] Kode lolos `npm run build:web`.
- [ ] Ada bukti test manual atau otomatis.
- [ ] Tidak ada regresi pada flow: login -> sewa -> receipt -> return -> riwayat.
- [ ] Dokumentasi endpoint/flow diperbarui jika ada perubahan kontrak.

## Week 1 - Stabilitas Inti

### Day 1 - Baseline QA dan Scope Freeze

- [ ] Freeze scope sprint (tidak tambah fitur di luar checklist).
- [ ] Buat checklist test manual flow utama.
- [ ] Catat baseline bug yang sudah diketahui.
- [ ] Tentukan prioritas bug: `blocker`, `high`, `medium`.

Output:

- [ ] Dokumen QA baseline tersedia.
- [ ] Daftar bug baseline tersedia.

### Day 2 - Edge Case Checkout Sewa

- [ ] Validasi stok race condition saat checkout.
- [ ] Validasi input customer/item di UI sebelum submit.
- [ ] Pastikan error message checkout jelas dan actionable.

Output:

- [ ] Semua skenario checkout gagal tampil pesan yang benar.

### Day 3 - Edge Case Pengembalian

- [ ] Cegah double return.
- [ ] Validasi denda tidak negatif.
- [ ] Sinkronkan status return ke riwayat secara konsisten.

Output:

- [ ] Tidak ada transaksi yang bisa diproses return dua kali.

### Day 4 - Hardening Receipt

- [ ] Verifikasi fallback profile `branch > tenant > default`.
- [ ] Uji print receipt di browser yang dipakai produksi.
- [ ] Uji share WhatsApp pada data customer valid/tidak valid.

Output:

- [ ] Receipt konsisten di modal preview, print, dan WhatsApp.

### Day 5 - Integration Test API Batch 1

- [ ] Tambah test auth (`login`, `me`, unauthorized).
- [ ] Tambah test tenant isolation endpoint read utama.
- [ ] Tambah test branch access read scope.

Output:

- [ ] Test batch 1 hijau.

### Day 6 - Integration Test API Batch 2

- [ ] Tambah test membership guard owner/admin/superuser.
- [ ] Tambah test update settings tenant/cabang sesuai role.
- [ ] Tambah test forbidden path lintas tenant.

Output:

- [ ] Test batch 2 hijau.

### Day 7 - Bugfix + RC Internal

- [ ] Tutup bug dari Day 1-6.
- [ ] Retest end-to-end flow utama.
- [ ] Buat release candidate internal.

Output:

- [ ] RC internal siap dipakai.

## Week 2 - Operasional dan Monitoring

### Day 8 - Laporan Harian Dasar

- [ ] Tambah ringkasan metrik harian (transaksi, omzet, rental aktif, return).
- [ ] Tambah filter tenant/cabang aktif.

Output:

- [ ] Laporan harian tampil dan sesuai data riwayat.

### Day 9 - Laporan Keterlambatan

- [ ] Tambah daftar rental overdue.
- [ ] Tambah aksi cepat ke halaman return.

Output:

- [ ] Overdue list valid dan bisa ditindak dari UI.

### Day 10 - Export Data

- [ ] Tambah export CSV riwayat transaksi.
- [ ] Tambah export CSV customer.
- [ ] Uji hasil CSV di spreadsheet.

Output:

- [ ] File export valid dan terbaca normal.

### Day 11 - Audit Log Admin Action

- [ ] Catat aksi admin penting: branch, membership, branch access, tenant update.
- [ ] Pastikan audit log membawa tenantId + branchId bila relevan.

Output:

- [ ] Audit trail bisa dipakai untuk trace perubahan.

### Day 12 - Monitoring Dasar

- [ ] Rapikan format log server (minimal level + context).
- [ ] Tambah panduan cek error cepat.
- [ ] Tambah alarm sederhana (manual/proxy) untuk error spike.

Output:

- [ ] Ada playbook troubleshooting cepat.

### Day 13 - Backup/Restore Drill

- [ ] Simulasikan backup DB.
- [ ] Simulasikan restore di environment non-prod.
- [ ] Catat waktu restore dan kendala.

Output:

- [ ] Runbook backup/restore tervalidasi.

### Day 14 - Stabilization dan Release Notes

- [ ] Full regression test.
- [ ] Final bugfix minor.
- [ ] Susun release note sprint.

Output:

- [ ] Sprint selesai dan siap lanjut sprint berikutnya.

## Risk Log (Isi Saat Sprint Berjalan)

- [ ] Risiko 1:
- [ ] Risiko 2:
- [ ] Risiko 3:

## Catatan Harian

- Day 1:
- Day 2:
- Day 3:
- Day 4:
- Day 5:
- Day 6:
- Day 7:
- Day 8:
- Day 9:
- Day 10:
- Day 11:
- Day 12:
- Day 13:
- Day 14:
