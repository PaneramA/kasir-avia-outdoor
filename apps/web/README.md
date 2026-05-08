# Web App (Frontend)

Frontend utama kasir AviaOutdoor berbasis React + Vite + TailwindCSS.

## Scripts

```bash
npm run dev --workspace @avia/web
npm run build --workspace @avia/web
npm run lint --workspace @avia/web
```

## Backend Connection

Buat file `.env` dari `.env.example`:

```bash
VITE_API_BASE_URL=http://localhost:4000
```

Frontend menyediakan halaman login UI (`/login`) dan akan meminta username/password user backend lewat form.

## Responsive Guideline

- Lihat pedoman implementasi di [docs/responsive-spec.md](./docs/responsive-spec.md).
