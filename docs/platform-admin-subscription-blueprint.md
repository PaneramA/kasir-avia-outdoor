# Platform Admin Subscription Blueprint

Dokumen ini melengkapi `docs/multitenant-blueprint-v2.md` dengan fokus baru:

1. Admin platform hanya mengurus approval tenant dan pengaturan paket.
2. Tenant owner mengurus cabang, staff, inventory, dan operasional tokonya sendiri.
3. Limit paket wajib dienforce di backend.

## 1. Batas Tanggung Jawab

### Admin platform

- Melihat tenant baru yang self-register
- Approve atau menahan tenant
- Mengatur plan/paket
- Mengatur limit dan feature entitlement
- Memantau subscription tenant

### Tenant owner / admin tenant

- Mengatur cabang toko
- Menambah user toko
- Mengatur akses user ke cabang
- Mengelola inventory, transaksi, dan setting toko

## 2. Status Tenant yang Disarankan

Status `Tenant.status` sebaiknya berkembang dari:

- `active`
- `suspended`

Menjadi:

- `pending_approval`
- `active`
- `suspended`
- `rejected`

Kalau migrasi status belum ingin dilakukan sekarang, fase transisi bisa tetap memakai `suspended` sebagai pengganti `pending_approval`.

## 3. Model Paket yang Disarankan

```prisma
model Plan {
  id          String   @id @default(cuid())
  code        String   @unique
  name        String
  description String?
  priceAmount Int
  pricePeriod String   // monthly | yearly | custom
  status      String   @default("active")
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  features      PlanFeature[]
  subscriptions TenantSubscription[]
}

model PlanFeature {
  id         String   @id @default(cuid())
  planId     String
  key        String
  valueType  String   // boolean | integer | string
  valueJson  Json
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt

  plan       Plan     @relation(fields: [planId], references: [id], onDelete: Cascade)

  @@unique([planId, key])
  @@index([key])
}

model TenantSubscription {
  id             String   @id @default(cuid())
  tenantId        String   @unique
  planId          String
  status          String   @default("trial")
  startsAt        DateTime @default(now())
  endsAt          DateTime?
  graceEndsAt     DateTime?
  billingNotes    String?
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  tenant          Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  plan            Plan     @relation(fields: [planId], references: [id], onDelete: Restrict)
  usageSnapshots  TenantUsageSnapshot[]

  @@index([planId, status])
}

model TenantUsageSnapshot {
  id                   String   @id @default(cuid())
  tenantSubscriptionId String
  periodKey            String   // contoh: 2026-06
  branchCount          Int      @default(0)
  itemCount            Int      @default(0)
  monthlyTransactionCount Int   @default(0)
  activeUserCount      Int      @default(0)
  createdAt            DateTime @default(now())
  updatedAt            DateTime @updatedAt

  tenantSubscription   TenantSubscription @relation(fields: [tenantSubscriptionId], references: [id], onDelete: Cascade)

  @@unique([tenantSubscriptionId, periodKey])
}
```

## 4. Entitlement Keys yang Disarankan

### Quota

- `maxBranches`
- `maxItems`
- `maxMonthlyTransactions`
- `maxTenantUsers`

### Feature flags

- `canManageBranches`
- `canManageStaff`
- `canUseFinancialRecap`
- `canUseMultiBranch`
- `canExportData`
- `canUseAdvancedReporting`

### Behavior flags

- `allowOverageTransactions`
- `allowInactiveGracePeriod`

## 5. Aturan Enforcement

Semua limit harus divalidasi di backend:

- Saat `POST /api/branches`, cek `maxBranches`
- Saat `POST /api/items`, cek `maxItems`
- Saat `POST /api/rentals`, cek `maxMonthlyTransactions`
- Saat `POST /api/users/tenant`, cek `maxTenantUsers`

Jika limit terlampaui:

- return `403` bila fitur tidak diizinkan
- return `409` bila kuota habis / limit terlampaui

## 6. Service Layer yang Perlu Ditambah

Target helper:

- `getTenantSubscriptionForTenant(tenantId)`
- `getTenantEntitlements(tenantId)`
- `assertTenantCanCreateBranch(tenantId)`
- `assertTenantCanCreateItem(tenantId)`
- `assertTenantCanCreateRental(tenantId)`
- `refreshTenantUsageSnapshot(tenantId, periodKey)`

## 7. Endpoint Admin Platform yang Disarankan

- `GET /api/admin/registrations`
- `PATCH /api/admin/registrations/:tenantId`
- `GET /api/admin/plans`
- `POST /api/admin/plans`
- `PATCH /api/admin/plans/:planId`
- `GET /api/admin/subscriptions`
- `PATCH /api/admin/subscriptions/:tenantId`

Catatan:

- Fase awal masih boleh memakai endpoint existing `GET /api/tenants` dan `PATCH /api/tenants/:tenantId`
- Endpoint `/api/admin/*` bisa ditambahkan setelah modul platform admin stabil

## 8. Saran UI

### Admin platform

- `/admin`
- `/admin/registrations`
- `/admin/plans`
- `/admin/subscriptions`

### Tenant self-service

- `/account`
- `/settings/branches`
- `/settings/team`
- `/settings/subscription`

## 9. Urutan Implementasi Aman

1. Pisahkan halaman admin platform dari self-service tenant
2. Buat halaman approval tenant
3. Tambah model paket + subscription
4. Tambah entitlement resolver di backend
5. Enforce limit pada create branch/item/rental/user
6. Buat admin CRUD paket
7. Buat halaman tenant untuk melihat paket aktif dan sisa kuota
