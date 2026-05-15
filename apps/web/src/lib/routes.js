export const APP_ROUTES = {
  login: '/login',
  dashboard: '/dashboard',
  rental: '/rental',
  return: '/return',
  inventory: '/inventory',
  history: '/history',
  customers: '/customers',
  users: '/users',
  branches: '/branches',
  account: '/account',
};

export const PAGE_INFO = {
  [APP_ROUTES.dashboard]: {
    title: 'Dashboard',
    subtitle: 'Status inventaris dan penyewaan hari ini.',
  },
  [APP_ROUTES.rental]: {
    title: 'Sewa Barang',
    subtitle: 'Proses transaksi peminjaman baru.',
  },
  [APP_ROUTES.return]: {
    title: 'Pengembalian',
    subtitle: 'Kembalikan barang dan hitung denda.',
  },
  [APP_ROUTES.inventory]: {
    title: 'Inventaris',
    subtitle: 'Kelola stok peralatan outdoor.',
  },
  [APP_ROUTES.history]: {
    title: 'Riwayat',
    subtitle: 'Data transaksi penyewaan sebelumnya.',
  },
  [APP_ROUTES.customers]: {
    title: 'Data Customer',
    subtitle: 'Pencarian dan daftar pelanggan yang tersimpan otomatis.',
  },
  [APP_ROUTES.users]: {
    title: 'Manajemen User',
    subtitle: 'Kelola akun admin dan kasir.',
  },
  [APP_ROUTES.branches]: {
    title: 'Cabang & Akses',
    subtitle: 'Kelola cabang toko dan hak akses user per cabang.',
  },
  [APP_ROUTES.account]: {
    title: 'Akun Saya',
    subtitle: 'Ubah password dan pengaturan profil toko.',
  },
};
