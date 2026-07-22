import { afterEach, describe, expect, it } from 'vitest';
import * as envConfig from './env.js';

const { getEnv, getSecurityWarnings } = envConfig;

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
    expect(env.requestBodyLimitBytes).toBe(1_048_576);
    expect(env.requestBodyTimeoutMs).toBe(10_000);
    expect(env.serverRequestTimeoutMs).toBe(15_000);
    expect(env.serverHeadersTimeoutMs).toBe(10_000);
    expect(env.serverKeepAliveTimeoutMs).toBe(5_000);
    expect(env.serverMaxRequestsPerSocket).toBe(1_000);
    expect(env.loginRateLimitMaxBuckets).toBe(10_000);
    expect(env.trustProxy).toBe(false);
    expect(env.host).toBe('0.0.0.0');
  });

  it('binds production to loopback by default', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.HOST;

    expect(getEnv().host).toBe('127.0.0.1');
  });

  it('reads explicit deployment values', () => {
    process.env.PORT = '4100';
    process.env.HOST = '127.0.0.1';
    process.env.CORS_ORIGIN = 'https://one.test,https://two.test';
    process.env.LOGIN_RATE_LIMIT_MAX_ATTEMPTS = '7';
    process.env.REQUEST_BODY_LIMIT_BYTES = '2048';
    process.env.REQUEST_BODY_TIMEOUT_MS = '3000';
    process.env.LOGIN_RATE_LIMIT_MAX_BUCKETS = '250';
    process.env.SERVER_REQUEST_TIMEOUT_MS = '8000';
    process.env.SERVER_HEADERS_TIMEOUT_MS = '7000';
    process.env.SERVER_KEEP_ALIVE_TIMEOUT_MS = '2000';
    process.env.SERVER_MAX_REQUESTS_PER_SOCKET = '500';
    process.env.TRUST_PROXY = 'true';
    process.env.ALLOW_INSECURE_LOOPBACK_CORS = 'true';

    const env = getEnv();
    expect(env.port).toBe(4100);
    expect(env.host).toBe('127.0.0.1');
    expect(env.corsOrigin).toContain('https://two.test');
    expect(env.loginRateLimitMaxAttempts).toBe(7);
    expect(env.requestBodyLimitBytes).toBe(2048);
    expect(env.requestBodyTimeoutMs).toBe(3000);
    expect(env.loginRateLimitMaxBuckets).toBe(250);
    expect(env.serverRequestTimeoutMs).toBe(8000);
    expect(env.serverHeadersTimeoutMs).toBe(7000);
    expect(env.serverKeepAliveTimeoutMs).toBe(2000);
    expect(env.serverMaxRequestsPerSocket).toBe(500);
    expect(env.trustProxy).toBe(true);
    expect(env.allowInsecureLoopbackCors).toBe(true);
  });

  it('warns about insecure production settings', () => {
    const warnings = getSecurityWarnings({
      nodeEnv: 'production',
      databaseUrl: 'postgresql://postgres:postgres@localhost:5432/aviaoutdoor',
      corsOrigin: '*,http://localhost:5173',
      jwtSecret: 'short',
      passwordPepper: 'short',
      adminUsername: 'admin@gmail.com',
      adminPassword: 'adminavo123',
      loginRateLimitMaxAttempts: 20,
    });

    expect(warnings).toHaveLength(7);
    expect(warnings.join(' ')).toContain('wildcard');
    expect(warnings.join(' ')).toContain('production');
  });

  it('accepts hardened settings without warnings', () => {
    expect(getSecurityWarnings({
      nodeEnv: 'production',
      databaseUrl: 'postgresql://avia_app:strong-password@db.internal:5432/aviaoutdoor',
      corsOrigin: 'https://kasir.example.com',
      jwtSecret: 'strong-jwt-secret-at-least-16',
      passwordPepper: 'strong-password-pepper-at-least-16',
      adminUsername: 'platform-owner',
      adminPassword: 'long-random-admin-password',
      loginRateLimitMaxAttempts: 5,
    })).toEqual([]);
  });

  it('allows the configured admin email when its credentials are hardened', () => {
    expect(getSecurityWarnings({
      nodeEnv: 'production',
      databaseUrl: 'postgresql://avia_app:strong-password@db.internal:5432/aviaoutdoor',
      corsOrigin: 'https://kasir.example.com',
      jwtSecret: 'strong-jwt-secret-at-least-16',
      passwordPepper: 'strong-password-pepper-at-least-16',
      adminUsername: 'admin@gmail.com',
      adminPassword: 'long-random-admin-password',
      loginRateLimitMaxAttempts: 5,
    })).toEqual([]);
  });

  it('fails production startup when known insecure defaults remain', () => {
    expect(typeof envConfig.assertSecureProductionConfig).toBe('function');
    expect(() => envConfig.assertSecureProductionConfig({
      nodeEnv: 'production',
      databaseUrl: 'postgresql://postgres:postgres@localhost:5432/aviaoutdoor',
      corsOrigin: '*',
      jwtSecret: 'change-me-jwt-secret',
      passwordPepper: 'change-me-pepper',
      adminUsername: 'admin@gmail.com',
      adminPassword: 'adminavo123',
      loginRateLimitMaxAttempts: 5,
    })).toThrow('Insecure production configuration');
  });

  it('accepts hardened production configuration', () => {
    expect(typeof envConfig.assertSecureProductionConfig).toBe('function');
    expect(() => envConfig.assertSecureProductionConfig({
      nodeEnv: 'production',
      databaseUrl: 'postgresql://avia_app:strong-password@db.internal:5432/aviaoutdoor',
      corsOrigin: 'https://kasir.example.com',
      jwtSecret: 'strong-jwt-secret-at-least-16',
      passwordPepper: 'strong-password-pepper-at-least-16',
      adminUsername: 'platform-owner',
      adminPassword: 'long-random-admin-password',
      loginRateLimitMaxAttempts: 5,
    })).not.toThrow();
  });

  it('rejects non-HTTPS production CORS origins by default', () => {
    const warnings = getSecurityWarnings({
      nodeEnv: 'production',
      databaseUrl: 'postgresql://avia_app:strong-password@db.internal:5432/aviaoutdoor',
      corsOrigin: 'http://kasir.example.com',
      jwtSecret: 'strong-jwt-secret-at-least-16',
      passwordPepper: 'strong-password-pepper-at-least-16',
      adminUsername: 'platform-owner',
      adminPassword: 'long-random-admin-password',
      loginRateLimitMaxAttempts: 5,
      allowInsecureLoopbackCors: false,
    });

    expect(warnings.join(' ')).toContain('HTTPS');
  });

  it('permits only an explicit loopback HTTP CORS escape', () => {
    const secureBase = {
      nodeEnv: 'production',
      databaseUrl: 'postgresql://avia_app:strong-password@db.internal:5432/aviaoutdoor',
      jwtSecret: 'strong-jwt-secret-at-least-16',
      passwordPepper: 'strong-password-pepper-at-least-16',
      adminUsername: 'platform-owner',
      adminPassword: 'long-random-admin-password',
      loginRateLimitMaxAttempts: 5,
      allowInsecureLoopbackCors: true,
    };

    expect(getSecurityWarnings({
      ...secureBase,
      corsOrigin: 'http://127.0.0.1:5173',
    })).toEqual([]);
    expect(getSecurityWarnings({
      ...secureBase,
      corsOrigin: 'http://kasir.example.com',
    }).join(' ')).toContain('HTTPS');
  });

  it('rejects excessive production request and server resource limits', () => {
    const warnings = getSecurityWarnings({
      nodeEnv: 'production',
      databaseUrl: 'postgresql://avia_app:strong-password@db.internal:5432/aviaoutdoor',
      corsOrigin: 'https://kasir.example.com',
      jwtSecret: 'strong-jwt-secret-at-least-16',
      passwordPepper: 'strong-password-pepper-at-least-16',
      adminUsername: 'platform-owner',
      adminPassword: 'long-random-admin-password',
      loginRateLimitMaxAttempts: 5,
      requestBodyLimitBytes: 10_485_761,
      requestBodyTimeoutMs: 60_001,
      serverRequestTimeoutMs: 120_001,
      serverHeadersTimeoutMs: 60_001,
      serverKeepAliveTimeoutMs: 60_001,
      serverMaxRequestsPerSocket: 10_001,
    });

    expect(warnings).toEqual(expect.arrayContaining([
      expect.stringContaining('REQUEST_BODY_LIMIT_BYTES'),
      expect.stringContaining('REQUEST_BODY_TIMEOUT_MS'),
      expect.stringContaining('SERVER_REQUEST_TIMEOUT_MS'),
      expect.stringContaining('SERVER_HEADERS_TIMEOUT_MS'),
      expect.stringContaining('SERVER_KEEP_ALIVE_TIMEOUT_MS'),
      expect.stringContaining('SERVER_MAX_REQUESTS_PER_SOCKET'),
    ]));
  });

  it('rejects trusted proxy mode on a publicly bound production API', () => {
    const secureBase = {
      nodeEnv: 'production',
      databaseUrl: 'postgresql://avia_app:strong-password@db.internal:5432/aviaoutdoor',
      corsOrigin: 'https://kasir.example.com',
      jwtSecret: 'strong-jwt-secret-at-least-16',
      passwordPepper: 'strong-password-pepper-at-least-16',
      adminUsername: 'admin@gmail.com',
      adminPassword: 'long-random-admin-password',
      loginRateLimitMaxAttempts: 5,
      trustProxy: true,
    };

    expect(getSecurityWarnings({ ...secureBase, host: '0.0.0.0' }).join(' '))
      .toContain('loopback');
    expect(getSecurityWarnings({ ...secureBase, host: '127.0.0.1' })).toEqual([]);
  });
});
