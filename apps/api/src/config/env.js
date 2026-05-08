const DEFAULT_JWT_SECRET = 'change-me-jwt-secret';
const DEFAULT_PASSWORD_PEPPER = 'change-me-pepper';
const DEFAULT_ADMIN_USERNAME = 'admin';
const DEFAULT_ADMIN_PASSWORD = 'admin123';
const INSECURE_JWT_SECRETS = new Set([DEFAULT_JWT_SECRET, 'change-this-in-production']);
const INSECURE_PASSWORD_PEPPERS = new Set([DEFAULT_PASSWORD_PEPPER, 'change-this-too']);

function toPositiveInteger(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed < 1) {
    return fallback;
  }

  return parsed;
}

function parseOriginList(raw) {
  return String(raw || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

export function getEnv() {
  return {
    port: Number(process.env.PORT || 4000),
    nodeEnv: process.env.NODE_ENV || 'development',
    corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:5173',
    databaseUrl: process.env.DATABASE_URL || '',
    jwtSecret: process.env.JWT_SECRET || DEFAULT_JWT_SECRET,
    jwtExpiresIn: process.env.JWT_EXPIRES_IN || '8h',
    passwordPepper: process.env.PASSWORD_PEPPER || DEFAULT_PASSWORD_PEPPER,
    adminUsername: process.env.ADMIN_USERNAME || DEFAULT_ADMIN_USERNAME,
    adminPassword: process.env.ADMIN_PASSWORD || DEFAULT_ADMIN_PASSWORD,
    loginRateLimitMaxAttempts: toPositiveInteger(process.env.LOGIN_RATE_LIMIT_MAX_ATTEMPTS, 5),
    loginRateLimitWindowMs: toPositiveInteger(process.env.LOGIN_RATE_LIMIT_WINDOW_MS, 10 * 60 * 1000),
    loginRateLimitBlockMs: toPositiveInteger(process.env.LOGIN_RATE_LIMIT_BLOCK_MS, 15 * 60 * 1000),
  };
}

export function getSecurityWarnings(env) {
  const warnings = [];
  const corsOrigins = parseOriginList(env.corsOrigin);

  if (INSECURE_JWT_SECRETS.has(env.jwtSecret) || env.jwtSecret.length < 16) {
    warnings.push('JWT_SECRET masih default atau terlalu pendek.');
  }

  if (INSECURE_PASSWORD_PEPPERS.has(env.passwordPepper) || env.passwordPepper.length < 16) {
    warnings.push('PASSWORD_PEPPER masih default atau terlalu pendek.');
  }

  if (env.adminPassword === DEFAULT_ADMIN_PASSWORD || env.adminPassword.length < 10) {
    warnings.push('ADMIN_PASSWORD masih default atau terlalu lemah.');
  }

  if (env.adminUsername === DEFAULT_ADMIN_USERNAME) {
    warnings.push('ADMIN_USERNAME masih default.');
  }

  if (env.loginRateLimitMaxAttempts > 10) {
    warnings.push('LOGIN_RATE_LIMIT_MAX_ATTEMPTS terlalu longgar untuk production.');
  }

  if (corsOrigins.length === 0) {
    warnings.push('CORS_ORIGIN kosong. Frontend browser tidak akan bisa mengakses API.');
  }

  if (corsOrigins.includes('*')) {
    warnings.push('CORS_ORIGIN menggunakan wildcard (*). Batasi origin spesifik untuk production.');
  }

  if (env.nodeEnv === 'production' && corsOrigins.some((origin) => origin.includes('localhost'))) {
    warnings.push('CORS_ORIGIN masih mengandung localhost pada mode production.');
  }

  return warnings;
}
