# Audit Kode Kasir AviaOutdoor - 2026-07-21

## Ringkasan Arsitektur

Project ini adalah monorepo:

- `apps/web`: React 19 + Vite. State utama aplikasi masih disimpan di `App.jsx`.
- `apps/api`: Node HTTP server custom, Prisma ORM, PostgreSQL, Zod validation, JWT auth.
- `packages/shared`: placeholder shared package.

Data inti mengalir lewat REST API:

- Web menyimpan token dan context tenant/cabang di `localStorage`.
- Request authenticated mengirim `Authorization`, `x-tenant-id`, dan `x-branch-id`.
- API menyelesaikan context tenant/cabang lewat `resolveTenantBranchContextForUser`.
- Prisma query memakai helper `withTenantScope` dan `withTenantBranchScope`.

## State Management Web

State global sekarang berada di `App.jsx`:

- `inventory`
- `categories`
- `rentals`
- `cart`
- `tenantSettings`
- `branchSettings`
- `tenantOptions`
- `branchOptions`
- `activeTenantId`
- `activeBranchId`
- `currentUser`

Halaman menerima state dan action via props. Belum ada store terpusat seperti Zustand/Redux/React Query. Untuk ukuran aplikasi sekarang masih bisa jalan, tetapi risiko mulai muncul:

- refresh data berulang tersebar di `App.jsx`;
- checkout, return, delete rental bergantung pada refresh manual;
- background sync 15 detik bisa bertabrakan secara mental dengan action user walau ada guard `isBackgroundSyncingRef`;
- error sync global bisa bercampur dengan error action spesifik.

## Cara Kerja Checkout Saat Ini

1. User memilih barang di `Rental.jsx`.
2. Cart disimpan di state `cart` milik `App.jsx`; draft transaksi juga disimpan di `localStorage` oleh halaman Rental.
3. Saat konfirmasi, `Rental.jsx` membuat payload:
   - data customer;
   - items berisi `id`, `qty`, `notes`;
   - durasi dan rentang waktu;
   - payment.
4. `App.jsx` memanggil `createRental(payload)`.
5. API route `POST /api/rentals` validasi dengan Zod.
6. `createRental` di `db.js` menjalankan Prisma transaction:
   - resolve tenant dan branch dari request context;
   - upsert customer by phone;
   - gabungkan item duplikat di payload;
   - cek stok dan decrement dengan `updateMany` plus `stock >= qty`;
   - create `Rental` dan `RentalItem`.
7. Web melakukan refresh data untuk mengambil stok dan transaksi terbaru.

Bagian stok cukup aman karena decrement dilakukan atomik di database.

## Bug Kritis Yang Ditemukan

### 1. Checkout sukses bisa dianggap gagal jika refresh data gagal

Sebelumnya `App.jsx` melakukan:

```js
const createdRental = await createRental(payload)
await refreshData()
return createdRental
```

Jika `createRental` sukses tetapi `refreshData` gagal, UI masuk `catch`, menampilkan gagal menyimpan transaksi, dan cart tidak dikosongkan. Akibatnya user bisa menekan simpan lagi dan membuat transaksi dobel, stok berkurang lagi, lalu aplikasi tampak makin rusak.

Perbaikan:

- save transaksi dan refresh dipisah;
- jika save sukses tapi refresh gagal, transaksi tetap dianggap sukses;
- error refresh hanya masuk banner sinkronisasi.

### 2. Draft transaksi tidak dihapus setelah checkout sukses

`Rental.jsx` sudah punya `clearSavedDraft()`, tapi tidak dipanggil setelah transaksi berhasil. Draft lama dapat muncul lagi setelah reload/crash, lalu bisa tersimpan ulang.

Perbaikan:

- `clearSavedDraft()` dipanggil setelah checkout sukses.

### 3. Risiko double submit sebelum `isSubmitting` sempat render

`isSubmitting` adalah React state, jadi klik cepat bisa terjadi sebelum tombol disabled ter-render. Ini membuka peluang request dobel.

Perbaikan:

- ditambah `checkoutInFlightRef` sebagai lock sinkron.

### 4. Error render dapat membuat aplikasi blank

Belum ada error boundary. Jika ada data rental/item yang bentuknya tidak sesuai dan komponen render crash, React bisa menampilkan layar blank sehingga terasa seperti aplikasi keluar.

Perbaikan:

- ditambah `ErrorBoundary` di area utama aplikasi.

### 5. ID transaksi terlalu sempit untuk operasi cepat

ID lama: `TX-${Date.now()}-${random 0..9999}`. Collision kecil, tetapi tidak perlu ditanggung.

Perbaikan:

- suffix ID diganti ke `randomUUID().slice(0, 12)`.

### 6. Tenant settings "current" mengabaikan tenant aktif

Endpoint tenant current settings sebelumnya selalu resolve tenant pertama/current server-side, bukan header `x-tenant-id`. Item/rental sudah mengikuti header. Ini bisa membuat settings/receipt/subscription tidak sesuai tenant aktif.

Perbaikan:

- `GET/PATCH /api/tenants/current/settings` dan `GET /api/tenants/current/subscription` memakai `x-tenant-id || current`.

## Risiko Lanjutan

- Belum ada test otomatis untuk flow checkout tiga kali berurutan.
- Tidak ada idempotency key untuk checkout. Lock client membantu, tetapi API tetap sebaiknya punya proteksi idempotency untuk retry jaringan.
- `App.jsx` sudah terlalu besar dan memegang terlalu banyak state. Lebih aman jika data server memakai query cache layer seperti React Query atau minimal custom hooks per domain.
- Banyak komponen masih berasumsi `rental.customer`, `rental.items`, dan `item.price` selalu valid. Error boundary menahan crash, tetapi normalisasi DTO/test tetap perlu diperkuat.
- API error semua non-Zod/non-auth menjadi 400. Untuk observability production, perlu structured logging dan error code.
- Docker/Postgres lokal tidak aktif saat audit, jadi reproduksi runtime end-to-end belum dilakukan.

## Verifikasi

- `npm run lint`: pass.
- `npm run build`: pass.

