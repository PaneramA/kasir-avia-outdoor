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