export function getEnv() {
  return {
    port: Number(process.env.PORT || 4000),
    nodeEnv: process.env.NODE_ENV || 'development',
    corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:5173',
    databaseUrl: process.env.DATABASE_URL || '',
    jwtSecret: process.env.JWT_SECRET || 'change-me-jwt-secret',
    jwtExpiresIn: process.env.JWT_EXPIRES_IN || '8h',
    passwordPepper: process.env.PASSWORD_PEPPER || 'change-me-pepper',
    adminUsername: process.env.ADMIN_USERNAME || 'admin',
    adminPassword: process.env.ADMIN_PASSWORD || 'admin123',
  };
}

export function getSecurityWarnings(env) {
  const warnings = [];

  if (env.jwtSecret === 'change-this-in-production' || env.jwtSecret.length < 16) {
    warnings.push('JWT_SECRET masih default atau terlalu pendek.');
  }

  if (env.passwordPepper === 'change-this-too' || env.passwordPepper.length < 16) {
    warnings.push('PASSWORD_PEPPER masih default atau terlalu pendek.');
  }

  if (env.adminPassword === 'admin123' || env.adminPassword.length < 10) {
    warnings.push('ADMIN_PASSWORD masih default atau terlalu lemah.');
  }

  if (env.adminUsername === 'admin') {
    warnings.push('ADMIN_USERNAME masih default.');
  }

  return warnings;
}
