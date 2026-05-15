# Multi Tenant Blueprint V2

Dokumen ini adalah rencana teknis implementasi multi-tenant + cabang untuk `kasir-aviaoutdoor`.
Fokus:

1. Admin platform dapat menjual aplikasi ke banyak toko.
2. Setiap toko punya user, pengaturan toko, dan data transaksi sendiri.
3. Tiap toko bisa punya subtenant/cabang.
4. Fondasi siap dinaikkan ke database terpisah per tenant/cabang.

## 1) Keputusan Arsitektur

### Tahap awal (direkomendasikan)

Gunakan **shared database** dengan isolasi data kuat:

- Semua tabel bisnis punya `tenantId`.
- Tabel yang operasional cabang punya `branchId`.
- Semua query API wajib scoped ke `tenantId` dan `branchId`.

Kenapa:

- Waktu implementasi lebih cepat.
- Risiko operasional lebih rendah.
- Mudah divalidasi test dan observability.

### Tahap lanjut

Naik ke **separate database per tenant/cabang** setelah shared-db stabil.

## 2) Skema Prisma V2 (Usulan)

Catatan:

- Ini target schema, bukan patch final langsung.
- Tetap migrasi bertahap (lihat bagian migrasi).

```prisma
model Tenant {
  id                String             @id @default(cuid())
  slug              String             @unique
  name              String
  status            String             @default("active") // active | suspended
  createdAt         DateTime           @default(now())
  updatedAt         DateTime           @updatedAt

  branches          Branch[]
  users             UserMembership[]
  settings          TenantSettings?
  categories        Category[]
  items             Item[]
  rentals           Rental[]
  returnRecords     ReturnRecord[]
  customers         Customer[]
  auditLogs         AuditLog[]
}

model Branch {
  id                String             @id @default(cuid())
  tenantId          String
  code              String
  name              String
  status            String             @default("active") // active | inactive
  createdAt         DateTime           @default(now())
  updatedAt         DateTime           @updatedAt

  tenant            Tenant             @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  users             UserBranchAccess[]
  settings          BranchSettings?
  items             Item[]
  rentals           Rental[]
  returnRecords     ReturnRecord[]
  customers         Customer[]
  auditLogs         AuditLog[]

  @@unique([tenantId, code])
  @@index([tenantId, status])
}

model TenantSettings {
  tenantId          String             @id
  storeName         String
  addressLines      Json               // ["alamat 1", "alamat 2"]
  phone             String?
  legalFooterLines  Json               // ["line 1", "line 2"]
  timezone          String             @default("Asia/Jakarta")
  currency          String             @default("IDR")
  createdAt         DateTime           @default(now())
  updatedAt         DateTime           @updatedAt

  tenant            Tenant             @relation(fields: [tenantId], references: [id], onDelete: Cascade)
}

model BranchSettings {
  branchId          String             @id
  storeName         String?
  addressLines      Json?
  phone             String?
  legalFooterLines  Json?
  createdAt         DateTime           @default(now())
  updatedAt         DateTime           @updatedAt

  branch            Branch             @relation(fields: [branchId], references: [id], onDelete: Cascade)
}

model User {
  id                String             @id @default(cuid())
  username          String             @unique
  passwordHash      String
  role              String             // global role: platform_admin | platform_support | user
  createdAt         DateTime           @default(now())
  updatedAt         DateTime           @updatedAt

  memberships       UserMembership[]
  branchAccesses    UserBranchAccess[]
  deletedRentals    Rental[]           @relation("RentalDeletedByUser")
  auditLogs         AuditLog[]
}

model UserMembership {
  id                String             @id @default(cuid())
  userId            String
  tenantId          String
  role              String             // owner | admin | kasir
  status            String             @default("active")
  createdAt         DateTime           @default(now())
  updatedAt         DateTime           @updatedAt

  user              User               @relation(fields: [userId], references: [id], onDelete: Cascade)
  tenant            Tenant             @relation(fields: [tenantId], references: [id], onDelete: Cascade)

  @@unique([userId, tenantId])
  @@index([tenantId, role, status])
}

model UserBranchAccess {
  id                String             @id @default(cuid())
  userId            String
  branchId          String
  role              String             @default("kasir") // optional override
  createdAt         DateTime           @default(now())

  user              User               @relation(fields: [userId], references: [id], onDelete: Cascade)
  branch            Branch             @relation(fields: [branchId], references: [id], onDelete: Cascade)

  @@unique([userId, branchId])
  @@index([branchId, role])
}
```

### Perubahan model existing

Tambahkan field berikut:

- `Category`: `tenantId`
- `Item`: `tenantId`, `branchId?`
- `Rental`: `tenantId`, `branchId`
- `RentalItem`: implicit lewat `rentalId` (opsional tambah `tenantId` untuk audit cepat)
- `ReturnRecord`: `tenantId`, `branchId`
- `Customer`: `tenantId`, `branchId?`
- `AuditLog`: `tenantId`, `branchId?`

Contoh constraint penting:

- `Category`: `@@unique([tenantId, name])`
- `Customer`: `@@unique([tenantId, phone])`
- index operasional: `@@index([tenantId, branchId, createdAt])` pada `Rental`, `ReturnRecord`, `Item`.

## 3) Desain Auth + Tenant Context

### JWT payload (v2)

```json
{
  "sub": "user_id",
  "username": "...",
  "globalRole": "user",
  "activeTenantId": "tn_xxx",
  "activeBranchId": "br_xxx"
}
```

### Aturan context

1. User login -> backend kirim daftar tenant membership + branch access.
2. Frontend pilih tenant/cabang aktif (tenant switcher).
3. Frontend kirim header tambahan:
   - `x-tenant-id`
   - `x-branch-id`
4. Backend middleware validasi:
   - user punya membership tenant tsb.
   - branch milik tenant tsb.
   - user punya akses branch tsb.

### Middleware baru (target file)

- `apps/api/src/routes/api.js`:
  - `authenticateRequest` tetap.
  - tambah `resolveTenantContext(req, authUser)`.
  - tambah `ensureTenantRole(...roles)`.

## 4) Rancangan Endpoint Baru

Prefix yang disarankan: tetap `/api`, tenant dibawa via header/context.

### A. Tenant management

- `GET /api/tenants` -> daftar tenant yang bisa diakses user.
- `POST /api/tenants` -> create tenant (platform admin).
- `PATCH /api/tenants/:tenantId` -> update status/nama.
- `GET /api/tenants/:tenantId/settings`
- `PATCH /api/tenants/:tenantId/settings`

### B. Branch management

- `GET /api/branches?tenantId=...`
- `POST /api/branches`
- `PATCH /api/branches/:branchId`
- `PATCH /api/branches/:branchId/settings`
- `DELETE /api/branches/:branchId` (soft delete/inactive recommended)

### C. User access management

- `GET /api/tenant-memberships?tenantId=...`
- `POST /api/tenant-memberships`
- `PATCH /api/tenant-memberships/:id`
- `GET /api/branch-access?tenantId=...`
- `POST /api/branch-access`
- `DELETE /api/branch-access/:id`

### D. Existing endpoints yang wajib di-scope

Semua endpoint ini harus filter tenant/cabang:

- categories, items, customers, rentals, returns, audit log.

Contoh:

- `GET /api/items` => `where: { tenantId: ctx.tenantId, branchId: ctx.branchId }`
- `POST /api/rentals` => set `tenantId`, `branchId` dari context, bukan dari body user.

## 5) Perubahan Frontend

Target area:

- `apps/web/src/App.jsx`
- `apps/web/src/lib/api.js`
- halaman setting baru: `apps/web/src/pages/StoreSettings.jsx` (baru)
- komponen switcher tenant/cabang: `apps/web/src/components/TenantBranchSwitcher.jsx` (baru)

### Fitur frontend minimal v2

1. Tenant/cabang switcher di header.
2. Page Pengaturan Toko:
   - nama toko
   - alamat (multi-line)
   - telepon
   - footer legal receipt
3. Page Cabang:
   - tambah/ubah/nonaktifkan cabang
4. Page Akses User:
   - assign user ke tenant dan cabang.

## 6) Receipt Customization (Tenant Aware)

`apps/web/src/lib/receipt.js` saat ini sudah punya `DEFAULT_RECEIPT_PROFILE`.
V2:

1. Profile dibaca dari API tenant settings.
2. Branch settings boleh override.
3. Fallback ke default jika setting belum ada.

Prioritas sumber profile:

1. Branch settings
2. Tenant settings
3. Default local profile

## 7) Blueprint Migrasi Aman (No Big Bang)

### Phase 0 - Persiapan

1. Backup DB production.
2. Freeze deploy schema-changing branch.
3. Tambah test baseline untuk endpoint existing.

### Phase 1 - Tambah tabel tenant core (tanpa mengubah query lama)

1. Buat tabel:
   - `Tenant`, `Branch`, `TenantSettings`, `BranchSettings`, `UserMembership`, `UserBranchAccess`.
2. Seed tenant default + branch default:
   - `tenant: "default-avia"`
   - `branch: "pusat"`
3. Buat membership admin existing ke tenant default.

### Phase 2 - Tambah kolom scoping di tabel existing (nullable dulu)

1. Tambah kolom nullable:
   - `tenantId` untuk Category/Item/Rental/ReturnRecord/Customer/AuditLog
   - `branchId` untuk Item/Rental/ReturnRecord/Customer/AuditLog
2. Tambah index sementara.

### Phase 3 - Backfill data lama

1. Isi semua row existing ke tenant default + branch default.
2. Verifikasi count before/after.
3. Buat script idempotent backfill.

### Phase 4 - Dual write

1. Update service create/update agar selalu set `tenantId`/`branchId`.
2. Query read tetap fallback untuk data lama (sementara).

### Phase 5 - Enforce non-null + unique baru

1. Setelah backfill tervalidasi:
   - set `tenantId`/`branchId` jadi NOT NULL (sesuai model).
2. Ganti unique global jadi unique per tenant:
   - `Customer.phone` -> `@@unique([tenantId, phone])`
   - `Category.name` -> `@@unique([tenantId, name])`

### Phase 6 - Tenant middleware enforcement

1. Aktifkan validasi context di semua endpoint.
2. Tolak request tanpa tenant/branch context valid.

### Phase 7 - Cleanup

1. Hapus fallback query lama.
2. Lengkapi audit log tenant aware.
3. Update OpenAPI dan dokumentasi.

## 8) Testing dan Anti Data Leak Checklist

Wajib ada test:

1. User tenant A tidak bisa baca data tenant B.
2. User cabang A1 tidak bisa akses cabang A2 tanpa grant.
3. Endpoint write selalu menimpa `tenantId`/`branchId` dari context, bukan body.
4. Receipt profile yang tampil sesuai tenant/cabang aktif.
5. Admin tenant tidak bisa manage tenant lain.

## 9) Rencana Separate Database per Tenant/Cabang

Setelah shared-db stabil:

1. Tambah `TenantDatabase` (control plane) berisi mapping koneksi.
2. Router prisma client berdasarkan `tenantId`/`branchId`.
3. Migrasi per-tenant via orchestrator.
4. Observability:
   - health per DB
   - migration status per DB
   - backup status per DB

Catatan:

- Ini menaikkan kompleksitas operasional signifikan.
- Disarankan hanya untuk tenant besar/enterprise.

## 10) Urutan Implementasi Praktis (Sprint)

1. Sprint 1:
   - schema phase 1-2
   - tenant default seed
   - store settings API
2. Sprint 2:
   - backfill + dual write
   - frontend settings toko
   - receipt dari tenant settings
3. Sprint 3:
   - branch + user access
   - tenant/branch switcher
4. Sprint 4:
   - enforce strict middleware
   - hardening tests + audit log

## 11) File yang Paling Banyak Tersentuh

- `apps/api/prisma/schema.prisma`
- `apps/api/src/data/db.js`
- `apps/api/src/routes/api.js`
- `apps/api/src/validation/schemas.js`
- `apps/web/src/lib/api.js`
- `apps/web/src/components/Header.jsx`
- `apps/web/src/lib/receipt.js`
- `apps/web/src/pages/Account.jsx` atau page setting baru

## 12) Catatan Eksekusi

Target realistis:

- **Bisa direalisasikan** dengan stabil.
- Bukan tanpa error sama sekali, tapi dengan migrasi bertahap + test ketat, risiko bisa ditekan rendah.

Dokumen ini jadi baseline. Langkah berikutnya adalah membuat:

1. RFC endpoint payload/response final.
2. PR schema phase-1.
3. Script backfill + integration test tenant isolation.
