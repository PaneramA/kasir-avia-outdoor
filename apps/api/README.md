# API App (Backend)

Backend AviaOutdoor berbasis Node.js + Prisma + PostgreSQL.

## Stack

- Prisma ORM (`@prisma/client`, `prisma`)
- PostgreSQL (datasource utama)
- Zod (request validation)
- JWT (auth endpoint dan proteksi write routes)

## Setup

1. Salin env:

```bash
copy .env.example .env
```

2. Sesuaikan `DATABASE_URL` di `.env`.

Jika belum punya PostgreSQL lokal, jalankan via Docker Compose dari root project:

```bash
docker compose up -d
```

3. Generate Prisma client + push schema + seed:

```bash
npm run prisma:generate --workspace @avia/api
npm run prisma:push --workspace @avia/api
npm run seed --workspace @avia/api
```

4. Jalankan API:

```bash
npm run dev:api
```

## Security Hardening Wajib

Sebelum push ke production, ubah nilai ini di `.env`:

- `CORS_ORIGIN`
- `ADMIN_USERNAME`
- `ADMIN_PASSWORD`
- `JWT_SECRET`
- `PASSWORD_PEPPER`
- `LOGIN_RATE_LIMIT_MAX_ATTEMPTS`
- `LOGIN_RATE_LIMIT_WINDOW_MS`
- `LOGIN_RATE_LIMIT_BLOCK_MS`

Server akan menampilkan warning saat nilai default masih dipakai.

Catatan: hash password lama akan di-upgrade otomatis ke format hash terbaru saat user berhasil login.
Catatan: endpoint login akan mengembalikan `429 Too Many Requests` saat limit gagal login terlampaui.
Catatan: `CORS_ORIGIN` mendukung beberapa origin dengan format comma-separated.

## Endpoint

Public:

- `GET /health`
- `GET /api/schema`
- `POST /api/auth/login`

Protected (Bearer token):

- `GET /api/auth/me`
- `GET /api/categories`
- `POST /api/categories`
- `DELETE /api/categories/:name`
- `GET /api/items`
- `POST /api/items`
- `PATCH /api/items/:id`
- `DELETE /api/items/:id`
- `GET /api/rentals`
- `POST /api/rentals`
- `GET /api/returns`
- `POST /api/returns`
- `GET /api/users` (admin only)
- `POST /api/users` (admin only)
- `PATCH /api/users/:id` (admin only)
- `DELETE /api/users/:id` (admin only)
- `PATCH /api/users/me/password`
- `PATCH /api/users/:id/password` (admin only)
- `GET /api/tenants` (list tenant yang bisa diakses user)
- `POST /api/tenants` (superuser only)
- `PATCH /api/tenants/:tenantId` (superuser only)
- `GET /api/branches?tenantId=<id|current>`
- `POST /api/branches` (admin only)
- `PATCH /api/branches/:branchId` (admin only)
- `GET /api/branches/current/settings`
- `PATCH /api/branches/current/settings` (admin only)
- `GET /api/branches/:branchId/settings`
- `PATCH /api/branches/:branchId/settings` (admin only)
- `GET /api/tenant-memberships?tenantId=<id|current>` (admin only)
- `POST /api/tenant-memberships` (admin only)
- `PATCH /api/tenant-memberships/:membershipId` (admin only)
- `GET /api/branch-access?tenantId=<id|current>` (admin only)
- `POST /api/branch-access` (admin only)
- `DELETE /api/branch-access/:accessId` (admin only)
- `GET /api/tenants/current/settings`
- `PATCH /api/tenants/current/settings` (admin only)
- `GET /api/tenants/:tenantId/settings`
- `PATCH /api/tenants/:tenantId/settings` (admin only)

Catatan otorisasi tenant:

- `superuser` dapat mengelola semua tenant.
- `admin` dan `kasir` hanya dapat mengakses tenant yang punya membership aktif.
- Aksi manajemen tenant (settings, cabang, membership, branch access) membutuhkan role membership tenant `owner/admin` atau `superuser`.
- Perubahan membership role `owner` hanya boleh oleh `owner` tenant terkait atau `superuser`.

Smoke test tenant guard:

```bash
npm run test:tenant-access --workspace @avia/api
```

## API Contract

Sudah disiapkan sekarang melalui:

- Prisma schema: `apps/api/prisma/schema.prisma`
- SQL migration awal: `apps/api/prisma/migrations/0001_init/migration.sql`
- OpenAPI dasar: `apps/api/openapi.yaml`

## Catatan

Request logger aktif otomatis saat `NODE_ENV` bukan `production`.
