# Responsive Spec (Mobile + Desktop)

Dokumen ini jadi acuan tunggal untuk semua PR responsive di `apps/web`.

## 1) Breakpoints

- Base (`<640px`): mobile default.
- `sm` (`>=640px`): large mobile / small tablet.
- `md` (`>=768px`): tablet.
- `lg` (`>=1024px`): desktop.
- `xl` (`>=1280px`): desktop wide.

## 2) Layout Shell

- Sidebar:
  - Mobile (`<lg`): off-canvas drawer + overlay.
  - Desktop (`>=lg`): sidebar statis di kiri.
- Header:
  - Mobile: tombol hamburger wajib terlihat.
  - Search bar dan action harus tetap usable tanpa overflow.
- Content wrapper:
  - Gunakan padding bertingkat: `px-4 sm:px-6 lg:px-10`.
  - Hindari fixed height yang memblokir scroll mobile.

## 3) Spacing & Touch Targets

- Minimum tap target tombol/icon: `44px`.
- Jarak antar kontrol form minimum: `8px`.
- Gunakan `min-w-0` pada container flex yang menampung teks panjang.

## 4) Table Strategy

- Semua tabel wajib dibungkus `overflow-x-auto`.
- Untuk layar kecil, prioritaskan:
  - ringkas kolom non-prioritas, atau
  - sediakan mode card/list jika tabel sulit dibaca.

## 5) Form & Modal

- Input/select/textarea minimum tinggi `40px` (ideal `44px`).
- Modal mobile:
  - `w-full` + `max-w-*` wajar.
  - Jika form panjang, konten modal harus bisa scroll internal.

## 6) Responsive QA Checklist (Wajib per PR)

- Viewport test:
  - `360x800`
  - `390x844`
  - `768x1024`
  - `1366x768`
- Tidak ada horizontal scroll liar.
- Komponen inti tetap bisa diakses saat keyboard mobile terbuka.
- Tidak ada elemen penting tertutup header/sidebar.
- Alur utama lolos smoke test: login -> rental -> return -> inventory.
