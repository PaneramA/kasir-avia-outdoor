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

- `ADMIN_USERNAME`
- `ADMIN_PASSWORD`
- `JWT_SECRET`
- `PASSWORD_PEPPER`

Server akan menampilkan warning saat nilai default masih dipakai.

## Endpoint

Public:

- `GET /health`
- `GET /api/schema`
- `GET /api/categories`
- `GET /api/items`
- `GET /api/rentals`
- `GET /api/returns`
- `POST /api/auth/login`

Protected (Bearer token):

- `GET /api/auth/me`
- `POST /api/categories`
- `DELETE /api/categories/:name`
- `POST /api/items`
- `PATCH /api/items/:id`
- `DELETE /api/items/:id`
- `POST /api/rentals`
- `POST /api/returns`
- `GET /api/users` (admin only)
- `POST /api/users` (admin only)
- `PATCH /api/users/me/password`
- `PATCH /api/users/:id/password` (admin only)

## API Contract

Sudah disiapkan sekarang melalui:

- Prisma schema: `apps/api/prisma/schema.prisma`
- SQL migration awal: `apps/api/prisma/migrations/0001_init/migration.sql`
- OpenAPI dasar: `apps/api/openapi.yaml`

## Catatan

Request logger aktif otomatis saat `NODE_ENV` bukan `production`.
