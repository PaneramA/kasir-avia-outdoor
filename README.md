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

2. Periksa bagian `unresolved`. Selesaikan akun `partial-assignment`, `ambiguous-tenant`, atau `ambiguous-branch` secara manual. Jangan restart API selama daftar ini belum kosong.

3. Terapkan assignment yang tidak ambigu:

```bash
npm run db:backfill:access --workspace @avia/api -- --apply
```

4. Jalankan dry-run sekali lagi. Hasil yang aman sebelum restart adalah `assignments: []` dan `unresolved: []`.

Command ini idempotent. Mode default selalu dry-run; perubahan database hanya terjadi bila argumen `--apply` diberikan.
