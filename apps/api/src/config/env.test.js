import { afterEach, describe, expect, it } from 'vitest';
import { getEnv, getSecurityWarnings } from './env.js';

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
});

describe('environment configuration', () => {
  it('normalizes defaults and invalid positive integers', () => {
    delete process.env.PORT;
    delete process.env.JWT_SECRET;
    process.env.LOGIN_RATE_LIMIT_MAX_ATTEMPTS = '0';

    const env = getEnv();
    expect(env.port).toBe(4000);
    expect(env.loginRateLimitMaxAttempts).toBe(5);
    expect(env.corsOrigin).toBe('http://localhost:5173');
  });

  it('reads explicit deployment values', () => {
    process.env.PORT = '4100';
    process.env.CORS_ORIGIN = 'https://one.test,https://two.test';
    process.env.LOGIN_RATE_LIMIT_MAX_ATTEMPTS = '7';

    const env = getEnv();
    expect(env.port).toBe(4100);
    expect(env.corsOrigin).toContain('https://two.test');
    expect(env.loginRateLimitMaxAttempts).toBe(7);
  });

  it('warns about insecure production settings', () => {
    const warnings = getSecurityWarnings({
      nodeEnv: 'production',
      corsOrigin: '*,http://localhost:5173',
      jwtSecret: 'short',
      passwordPepper: 'short',
      adminUsername: 'admin',
      adminPassword: 'admin123',
      loginRateLimitMaxAttempts: 20,
    });

    expect(warnings).toHaveLength(7);
    expect(warnings.join(' ')).toContain('wildcard');
    expect(warnings.join(' ')).toContain('production');
  });

  it('accepts hardened settings without warnings', () => {
    expect(getSecurityWarnings({
      nodeEnv: 'production',
      corsOrigin: 'https://kasir.example.com',
      jwtSecret: 'strong-jwt-secret-at-least-16',
      passwordPepper: 'strong-password-pepper-at-least-16',
      adminUsername: 'platform-owner',
      adminPassword: 'long-random-admin-password',
      loginRateLimitMaxAttempts: 5,
    })).toEqual([]);
  });
});
