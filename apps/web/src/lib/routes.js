export const APP_ROUTES = {
  login: '/login',
  dashboard: '/dashboard',
  settingsAccount: '/settings/account',
  settingsBranches: '/settings/branches',
  settingsTeam: '/settings/team',
  admin: '/admin',
  adminStores: '/admin/stores',
  adminRegistrations: '/admin/registrations',
  adminPlans: '/admin/plans',
  adminUsers: '/admin/users',
  adminBranches: '/admin/branches',
  adminAccount: '/admin/account',
  rental: '/rental',
  return: '/return',
  inventory: '/inventory',
  history: '/history',
  financial: '/financial',
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
  [APP_ROUTES.settingsAccount]: {
    title: 'Settings • Akun',
    subtitle: 'Kelola akun, paket tenant, dan pengaturan toko kamu.',
  },
  [APP_ROUTES.settingsBranches]: {
    title: 'Settings • Cabang',
    subtitle: 'Kelola daftar cabang toko dan status operasional tenant kamu.',
  },
  [APP_ROUTES.settingsTeam]: {
    title: 'Settings • Tim & Akses',
    subtitle: 'Kelola user toko, membership tenant, dan akses user per cabang.',
  },
  [APP_ROUTES.admin]: {
    title: 'Admin Panel',
    subtitle: 'Pusat kontrol approval tenant dan pengaturan paket platform.',
  },
  [APP_ROUTES.adminRegistrations]: {
    title: 'Admin • Pendaftaran Toko',
    subtitle: 'Pantau tenant baru yang mendaftar dan berikan approval.',
  },
  [APP_ROUTES.adminStores]: {
    title: 'Kelola Toko',
    subtitle: 'Atur status toko, paket langganan, dan masa aktif subscription.',
  },
  [APP_ROUTES.adminPlans]: {
    title: 'Paket & Fitur',
    subtitle: 'Atur harga, kuota, dan fitur yang tersedia untuk setiap paket.',
  },
  [APP_ROUTES.adminUsers]: {
    title: 'Admin • User',
    subtitle: 'Kelola akun, role, reset password, dan akses user.',
  },
  [APP_ROUTES.adminBranches]: {
    title: 'Admin • Cabang & Akses',
    subtitle: 'Kelola cabang, membership tenant, dan approval tenant baru.',
  },
  [APP_ROUTES.adminAccount]: {
    title: 'Akun Admin',
    subtitle: 'Kelola keamanan akun administrator platform.',
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
  [APP_ROUTES.financial]: {
    title: 'Recap Keuangan',
    subtitle: 'Ringkasan pendapatan bulanan dan rentang tanggal transaksi.',
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

export function resolvePageInfo(pathname) {
  const normalizedPath = String(pathname || '').trim();

  if (PAGE_INFO[normalizedPath]) {
    return PAGE_INFO[normalizedPath];
  }

  if (normalizedPath.startsWith(`${APP_ROUTES.settingsAccount}/`)) {
    return PAGE_INFO[APP_ROUTES.settingsAccount];
  }

  if (normalizedPath.startsWith(`${APP_ROUTES.settingsBranches}/`)) {
    return PAGE_INFO[APP_ROUTES.settingsBranches];
  }

  if (normalizedPath.startsWith(`${APP_ROUTES.settingsTeam}/`)) {
    return PAGE_INFO[APP_ROUTES.settingsTeam];
  }

  if (normalizedPath.startsWith(`${APP_ROUTES.adminUsers}/`)) {
    return PAGE_INFO[APP_ROUTES.adminUsers];
  }

  if (normalizedPath.startsWith(`${APP_ROUTES.adminRegistrations}/`)) {
    return PAGE_INFO[APP_ROUTES.adminRegistrations];
  }

  if (normalizedPath.startsWith(`${APP_ROUTES.adminStores}/`)) {
    return PAGE_INFO[APP_ROUTES.adminStores];
  }

  if (normalizedPath.startsWith(`${APP_ROUTES.adminPlans}/`)) {
    return PAGE_INFO[APP_ROUTES.adminPlans];
  }

  if (normalizedPath.startsWith(`${APP_ROUTES.adminBranches}/`)) {
    return PAGE_INFO[APP_ROUTES.adminBranches];
  }

  if (normalizedPath.startsWith(`${APP_ROUTES.adminAccount}/`)) {
    return PAGE_INFO[APP_ROUTES.adminAccount];
  }

  if (normalizedPath.startsWith(`${APP_ROUTES.admin}/`)) {
    return PAGE_INFO[APP_ROUTES.admin];
  }

  return PAGE_INFO[APP_ROUTES.dashboard];
}
