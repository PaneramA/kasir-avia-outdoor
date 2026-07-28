# Image Optimization Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep inventory images lightweight by auditing existing image data first, then moving new and old inventory images through a compressed WebP storage pipeline.

**Architecture:** The API owns image processing and storage. The database stores item image references and metadata, not large base64 payloads. Implementation is phased so legacy data is measured before any mutation occurs.

**Tech Stack:** Node.js ESM, Prisma, Vitest, `sharp` for image resize/WebP conversion in later tasks.

## Global Constraints

- Do not mutate existing `Item.image` values in Task 1.
- Treat base64 `data:image/...` values as highest priority because they bloat PostgreSQL rows and backups.
- New optimized inventory images should target small files over visual quality: max detail width `800px`, thumbnail width `320px`, WebP quality `55-65`.
- Database should store paths/URLs and metadata, not image binary/blob/base64 content.
- All scripts must be safe to run with `node --env-file=.env`.

---

### Task 1: Legacy Image Audit Dry-Run

**Files:**
- Create: `apps/api/src/images/itemImageAudit.js`
- Create: `apps/api/src/images/itemImageAudit.test.js`
- Create: `apps/api/scripts/audit-item-images.mjs`
- Modify: `apps/api/package.json`

**Interfaces:**
- Produces: `classifyItemImage(value)` returning `{ kind, estimatedBytes, mimeType, reason }`.
- Produces: `summarizeItemImages(items, options)` returning counts, byte totals, and largest image entries.
- Produces CLI script `npm run images:audit --workspace @avia/api`.

- [ ] **Step 1: Write failing tests for classifying empty, URL, storage path, base64 image, non-image base64, and unknown strings.**
- [ ] **Step 2: Run `npx vitest run apps/api/src/images/itemImageAudit.test.js --maxWorkers=1` and verify it fails because module/functions do not exist.**
- [ ] **Step 3: Implement `classifyItemImage` and `summarizeItemImages` with no database dependency.**
- [ ] **Step 4: Run the focused test and verify it passes.**
- [ ] **Step 5: Add CLI script that reads `Item.id`, `Item.name`, `Item.tenantId`, `Item.branchId`, and `Item.image`, then prints one JSON summary line.**
- [ ] **Step 6: Add `images:audit` package script.**
- [ ] **Step 7: Run `npm run lint --workspace @avia/api`, focused tests, and `npm run build --workspace @avia/api`.**

### Task 2: Server-Side Image Processor

**Files:**
- Create: `apps/api/src/images/itemImageProcessor.js`
- Create: `apps/api/src/images/itemImageProcessor.test.js`

**Interfaces:**
- Consumes: raw image `Buffer`.
- Produces: `{ detailBuffer, thumbnailBuffer, metadata }`.

- [ ] Add `sharp` dependency to `@avia/api`.
- [ ] Test max dimension resize, WebP output, metadata stripping, max input protection, and invalid input rejection.
- [ ] Implement conversion to low-quality WebP and thumbnail WebP.

### Task 3: Local Storage Adapter

**Files:**
- Create: `apps/api/src/images/itemImageStorage.js`
- Create: `apps/api/src/images/itemImageStorage.test.js`
- Modify: `apps/api/src/config/env.js`
- Modify: `apps/api/src/config/env.test.js`

**Interfaces:**
- Produces: `saveItemImageSet({ tenantId, itemId, detailBuffer, thumbnailBuffer })`.

- [ ] Add `ITEM_IMAGE_STORAGE_DIR` and `PUBLIC_UPLOADS_BASE_URL` env handling.
- [ ] Save images under tenant/item scoped paths.
- [ ] Return stable public URLs or app paths.

### Task 4: Upload Endpoint and Inventory UI

**Files:**
- Modify: `apps/api/src/routes/api.js`
- Modify: `apps/web/src/pages/Inventory.jsx`
- Modify: `apps/web/src/lib/api.js`

**Interfaces:**
- Produces: authenticated upload endpoint for item image files.
- Produces: UI file input that sends multipart upload and stores returned image URL/path.

- [ ] Enforce size and MIME allowlist server-side.
- [ ] Convert upload before item save/update.
- [ ] Keep inventory list using optimized thumbnail where available.

### Task 5: Legacy Backfill Apply Mode

**Files:**
- Create: `apps/api/scripts/backfill-item-images.mjs`
- Create: `apps/api/src/images/itemImageBackfill.js`
- Create: `apps/api/src/images/itemImageBackfill.test.js`
- Modify: `apps/api/package.json`

**Interfaces:**
- Consumes: Task 1 classifier, Task 2 processor, Task 3 storage adapter.
- Produces: dry-run/apply batch migration for base64 legacy images.

- [ ] Keep default mode dry-run.
- [ ] Add `--apply`, `--limit`, and `--tenant-id` options.
- [ ] Update DB only after file write succeeds.
- [ ] Skip URL/path images by default.
