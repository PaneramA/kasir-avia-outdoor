import { describe, expect, it } from 'vitest';
import { createAccessToken, verifyAccessToken } from './jwt.js';

describe('JWT access tokens', () => {
  const env = { jwtSecret: 'unit-test-jwt-secret-long-enough', jwtExpiresIn: '1h' };

  it('round-trips the authenticated user payload', () => {
    const token = createAccessToken({ sub: 'user-1', username: 'owner', role: 'kasir' }, env);
    const decoded = verifyAccessToken(token, env);

    expect(decoded).toMatchObject({ sub: 'user-1', username: 'owner', role: 'kasir' });
    expect(decoded.exp).toBeGreaterThan(decoded.iat);
  });

  it('rejects tokens signed with another secret', () => {
    const token = createAccessToken({ sub: 'user-1' }, env);
    expect(() => verifyAccessToken(token, { ...env, jwtSecret: 'another-long-unit-test-secret' })).toThrow();
  });
});
