const APP_USER_ROLES = new Set(['admin', 'kasir', 'superuser']);
const TENANT_MEMBERSHIP_ROLES = new Set(['owner', 'admin', 'kasir']);

function normalizeRole(value, fallback) {
  const normalized = String(value || '').trim().toLowerCase();
  return normalized || fallback;
}

function toSeedUser(input, defaults = {}) {
  const username = String(input?.username || '').trim();
  const password = String(input?.password || '').trim();
  const role = normalizeRole(input?.role, defaults.role || 'kasir');
  const membershipRole = normalizeRole(input?.membershipRole, defaults.membershipRole || 'kasir');

  if (!username) {
    throw new Error('Seed user username tidak boleh kosong.');
  }

  if (!password) {
    throw new Error(`Seed user "${username}" password tidak boleh kosong.`);
  }

  if (!APP_USER_ROLES.has(role)) {
    throw new Error(`Role user "${username}" tidak valid: ${role}`);
  }

  if (!TENANT_MEMBERSHIP_ROLES.has(membershipRole)) {
    throw new Error(`Membership role user "${username}" tidak valid: ${membershipRole}`);
  }

  return {
    username,
    password,
    role,
    membershipRole,
  };
}

export function getSeedUsers({ adminUsername, adminPassword } = {}) {
  const defaults = {
    adminUsername: String(adminUsername || 'admin').trim() || 'admin',
    adminPassword: String(adminPassword || 'admin123').trim() || 'admin123',
  };

  return [
    toSeedUser({
      username: defaults.adminUsername,
      password: defaults.adminPassword,
      role: 'admin',
      membershipRole: 'owner',
    }),

    // Tambahkan user hardcode baru di bawah ini.
    // Contoh:
    // toSeedUser({
    //   username: 'kasir.pusat',
    //   password: 'kasir12345',
    //   role: 'kasir',
    //   membershipRole: 'kasir',
    // }),
  ];
}
