# Monorepo Kasir AviaOutdoor

Struktur monorepo ini dipisah agar frontend dan backend bisa berkembang tanpa rewrite besar.

## Struktur

- `apps/web`: aplikasi frontend React + Vite
- `apps/api`: backend API Node.js
- `packages/shared`: shared types/schema/utilities lintas app
- `archive/legacy-vite-template`: arsip scaffold lama agar histori tidak hilang

## Menjalankan

```bash
npm install
npm run dev:web
npm run dev:api
```

Atau jalankan frontend default:

```bash
npm run dev
```

## Build & Lint

```bash
npm run lint
npm run build
```

## Migrasi Akses Pengguna

Versi ini menolak akses kasir yang belum memiliki membership tenant dan assignment cabang aktif. Jalankan preflight berikut di VPS setelah menarik kode baru, tetapi sebelum me-restart API.

1. Tampilkan rencana tanpa mengubah database:

```bash
npm run db:backfill:access --workspace @avia/api
```

2. Periksa bagian `unresolved`. Selesaikan tenant/cabang ambigu, membership inactive, assignment cabang inactive, atau akses cabang tanpa membership secara manual. Jangan restart API selama daftar ini belum kosong.

Command keluar dengan status `2` bila masih ada akun `unresolved`, termasuk pada dry-run, sehingga dapat dipakai sebagai gate deployment.

3. Terapkan assignment yang tidak ambigu:

```bash
npm run db:backfill:access --workspace @avia/api -- --apply
```

4. Jalankan dry-run sekali lagi. Hasil yang aman sebelum restart adalah `assignments: []` dan `unresolved: []`.

Command ini idempotent. Mode default selalu dry-run; perubahan database hanya terjadi bila argumen `--apply` diberikan.

## Kompresi Production

API tidak melakukan gzip di proses Node agar serialisasi response tidak memblokir event loop. Aktifkan kompresi JSON di Nginx:

```nginx
gzip on;
gzip_min_length 1024;
gzip_types application/json;
```

## Smoke Test Beban API

Jalankan dari VPS atau staging. Mode default hanya menguji pembacaan dashboard, inventaris, dan riwayat transaksi. Setiap request memiliki timeout 10 detik; ubah secara terbatas dengan `LOAD_TEST_REQUEST_TIMEOUT_MS` bila diperlukan.

```bash
API_BASE_URL=http://127.0.0.1:4000 \
LOAD_TEST_TENANT_ID=<tenant-id> \
LOAD_TEST_BRANCH_ID=<branch-id> \
LOAD_TEST_USERNAME=<username> \
LOAD_TEST_PASSWORD=<password> \
npm run test:load --workspace @avia/api
```

Untuk turut menguji checkout-return paralel, pilih barang aktif dengan stok minimal sebanyak jumlah siklus dan aktifkan mode transaksi secara eksplisit:

```bash
LOAD_TEST_ITEM_ID=<item-id> LOAD_TEST_CYCLE_COUNT=5 \
npm run test:load --workspace @avia/api
```

Mode transaksi hanya memakai `API_BASE_URL`: pembacaan stok, checkout, return cleanup, dan verifikasi stok akhir tidak mengakses `DATABASE_URL`. Ini mencegah cleanup berjalan pada database yang berbeda dari API yang sedang diuji. Transaksi `LOAD-...` yang sudah dikembalikan tetap ada di riwayat sebagai audit trail.

Sebelum checkout pertama, skrip mencetak run prefix dan menyimpan manifest tanpa token/password di `.load-smoke-recovery/`. `SIGINT`, `SIGTERM`, request timeout, dan kegagalan lain memicu cleanup terbatas waktu. Manifest hanya dihapus setelah return cleanup berhasil dan stok kembali ke nilai awal. Bila manifest tertinggal, jangan mulai mode transaksi baru; pulihkan dengan konfigurasi API dan kredensial yang sama:

```bash
LOAD_TEST_RECOVERY_FILE="<path-manifest>" \
npm run test:load --workspace @avia/api
```

Gunakan `LOAD_TEST_CLEANUP_TIMEOUT_MS` untuk batas cleanup (default 20000 ms). Gate gagal bila error rate di atas 1%, p95 pembacaan di atas 1500 ms, cleanup gagal, atau stok akhir berbeda dari stok awal.

Verifikasi gzip public proxy bersifat eksplisit agar akses langsung ke Node di localhost tidak gagal palsu. Arahkan ke URL HTTPS publik dan endpoint JSON yang responsnya cukup besar untuk melewati `gzip_min_length`:

```bash
API_BASE_URL=https://kasir.example.com \
LOAD_TEST_EXPECT_GZIP=true \
LOAD_TEST_GZIP_PATH=/api/items \
npm run test:load --workspace @avia/api
```

Saat aktif, gate memeriksa header response `Content-Encoding` sebelum body dibaca dan mewajibkan nilai `gzip`.
