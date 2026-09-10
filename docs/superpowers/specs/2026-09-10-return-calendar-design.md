# Kalender Pengembalian

## Status

Design disetujui untuk dilanjutkan ke implementation plan. Dokumen ini
menjadi batasan perilaku dan UX sebelum perubahan kode dimulai.

## Tujuan

Mengubah halaman Pengembalian dari daftar rental aktif menjadi satu layar
berbasis kalender. Kasir dapat melihat beban pengembalian berdasarkan tanggal,
mencari rental, memfilter status, lalu membuka proses pengembalian dari event
kalender tanpa berpindah halaman.

## Batasan

- Tidak ada integrasi Google Calendar atau iCal pada fase ini.
- Tidak ada perubahan model database yang diperlukan untuk versi awal.
- Rental aktif ditampilkan berdasarkan plannedReturnDate.
- Event kalender tidak dapat digeser atau diubah dengan drag and drop.
- Proses return, edit rental, pembayaran, denda, dan catatan tetap memakai
  aturan backend yang sudah ada.

## Desain UX

Header halaman berisi judul Pengembalian, ringkasan jumlah terlambat, jatuh
tempo hari ini, akan datang, dan belum lunas. Di area kontrol tersedia search
customer/nomor transaksi/nama barang, filter status, navigasi tanggal, tombol
Hari Ini, serta segmented view Hari, Minggu, dan Bulan.

Tampilan Bulan menjadi default. Setiap tanggal berisi event ringkas yang
menampilkan jam jatuh tempo, nama customer, jumlah item, dan badge pembayaran
atau kartu identitas bila relevan. Status menggunakan warna dan teks:
merah untuk terlambat, kuning untuk hari ini, hijau untuk akan datang, dan
badge terpisah untuk belum lunas. Jika event melebihi ruang sel, gunakan
indikator event lainnya yang membuka daftar rental pada tanggal tersebut.

Klik event membuka modal detail pengembalian. Modal menampilkan customer,
barang, jumlah, waktu sewa, jatuh tempo, status pembayaran, sisa pembayaran,
status kartu identitas, estimasi keterlambatan, denda, dan catatan. Aksi yang
tersedia adalah Catat Pembayaran, Edit Sewa, dan Proses Pengembalian. Setelah
return berhasil, event dihapus dari kalender melalui refresh cache SWR dan
receipt dapat diteruskan ke alur yang sudah ada.

Pada layar kecil, view Bulan dapat diganti menjadi view Hari atau List Minggu
agar detail event tetap terbaca. Shell halaman tetap memenuhi viewport; hanya
area kalender yang boleh scroll sehingga tidak muncul dua scrollbar pada
seluruh halaman.

## Library Kalender

Gunakan FullCalendar React dengan plugin standar yang diperlukan:
daygrid, timegrid, dan list. interaction hanya dipakai bila date click atau
selection dibutuhkan. Tidak menggunakan plugin Scheduler premium.

Referensi:

- https://fullcalendar.io/docs/react
- https://fullcalendar.io/docs/plugin-index
- https://fullcalendar.io/docs/eventClick
- https://fullcalendar.io/docs/event-object
- https://fullcalendar.io/docs/list-view

## Kontrak Data dan Timezone

Adapter event memetakan satu rental aktif menjadi satu event pada tanggal
plannedReturnDate. Data tambahan disimpan di extendedProps, minimal:
rentalId, customerName, itemCount, paymentStatus, remainingAmount,
identityCardHeld, dan dueStatus.

Tanggal dan waktu harus diperlakukan sebagai waktu operasional Indonesia:
Asia/Jakarta. Backend mengirim timestamp ISO dengan offset yang jelas.
Date key untuk filter tetap menggunakan format YYYY-MM-DD. Helper tanggal
yang sudah ada dipakai kembali agar perhitungan jatuh tempo tidak tersebar di
komponen.

## Fetch dan State Management

Versi awal dapat memakai cache rental aktif yang sudah dimuat App. Untuk
pertumbuhan data, tambahkan endpoint berbasis rentang:

GET /api/rentals/calendar?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD&status=Active

Search dan filter status dapat dikirim ke backend setelah jumlah data besar.
Query wajib tetap tenant dan branch scoped, memilih field yang diperlukan,
dan mengurutkan berdasarkan plannedReturnDate.

Gunakan SWR dengan key yang stabil berdasarkan tenant, branch, view, rentang
tanggal, search yang sudah debounce, dan status filter. Gunakan
keepPreviousData agar kalender tidak kosong ketika berpindah periode.
Setelah return, edit rental, atau pembayaran, panggil mutate untuk cache
kalender terkait. Hindari fetch ulang semua rental dan hindari request pada
setiap karakter search tanpa debounce sekitar 250-300 ms.

## Error dan Keamanan

- Rental dari tenant atau branch lain tidak boleh masuk ke event list.
- Event tanpa plannedReturnDate tidak ditampilkan sebagai tanggal valid;
  tampilkan jumlah data tanpa tanggal bila dibutuhkan untuk audit.
- Proses return tetap divalidasi ulang oleh backend untuk mencegah double
  return, konflik stok, dan perubahan data lama.
- Loading, error, empty state, dan tanggal tanpa rental harus memiliki state
  UI yang jelas.

## Tahapan Implementasi

1. Buat adapter event dan test status tanggal.
2. Pasang FullCalendar dan styling sesuai design system Sewantara.
3. Integrasikan search, filter, navigasi, dan view Hari/Minggu/Bulan.
4. Hubungkan event click ke modal pengembalian yang sudah ada.
5. Tambahkan refresh SWR setelah return, edit, dan pembayaran.
6. Tambahkan endpoint calendar berbasis rentang bila diperlukan oleh ukuran
   data.
7. Optimalkan mobile, scroll container, aksesibilitas, dan empty state.
8. Jalankan test, lint, build, dan verifikasi manual pada beberapa tanggal.

## Kriteria Penerimaan

- Kasir dapat melihat rental aktif pada tanggal jatuh tempo yang benar.
- Perpindahan Hari, Minggu, dan Bulan tidak mengubah data rental.
- Search dan filter hanya menampilkan event yang sesuai.
- Klik event membuka rental yang benar dalam modal.
- Return berhasil menghapus event dari kalender tanpa reload halaman.
- Denda, pembayaran, kartu identitas, dan catatan tetap terlihat.
- Waktu tidak bergeser saat browser menggunakan timezone berbeda.
- Halaman tidak memiliki scrollbar ganda.
- Semua test existing tetap lulus dan bundle tidak memasukkan asset gambar.

