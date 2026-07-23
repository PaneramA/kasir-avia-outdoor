import { Readable } from 'node:stream';
import { afterEach, describe, expect, it, vi } from 'vitest';

const dbMocks = vi.hoisted(() => ({
  findUserById: vi.fn(),
  findUserByUsername: vi.fn(),
  getUserTenantMembershipSummary: vi.fn(),
  updateUserByAdmin: vi.fn(),
  deleteUserByAdmin: vi.fn(),
}));

const passwordMocks = vi.hoisted(() => ({
  verifyPassword: vi.fn(),
}));

vi.mock('../data/db.js', async () => {
  const actual = await vi.importActual('../data/db.js');
  return {
    ...actual,
    findUserById: dbMocks.findUserById,
    findUserByUsername: dbMocks.findUserByUsername,
    getUserTenantMembershipSummary: dbMocks.getUserTenantMembershipSummary,
    updateUserByAdmin: dbMocks.updateUserByAdmin,
    deleteUserByAdmin: dbMocks.deleteUserByAdmin,
  };
});

vi.mock('../auth/password.js', async () => {
  const actual = await vi.importActual('../auth/password.js');
  return {
    ...actual,
    verifyPassword: passwordMocks.verifyPassword,
  };
});

const { createAccessToken } = await import('../auth/jwt.js');
const { apiRoute, DUMMY_LOGIN_PASSWORD_HASH } = await import('./api.js');

function createResponse() {
  let status = 0;
  let rawBody = '';
  const headers = new Map();

  return {
    headers,
    get status() {
      return status;
    },
    get body() {
      return rawBody ? JSON.parse(rawBody) : null;
    },
    setHeader(name, value) {
      headers.set(String(name).toLowerCase(), value);
    },
    writeHead(nextStatus, nextHeaders = {}) {
      status = nextStatus;
      Object.entries(nextHeaders).forEach(([name, value]) => {
        headers.set(String(name).toLowerCase(), value);
      });
    },
    end(value = '') {
      rawBody = String(value);
    },
  };
}

async function callApi(method, url, { body, headers = {} } = {}, env = {}) {
  const chunks = body === undefined ? [] : [Buffer.from(JSON.stringify(body))];
  const req = Readable.from(chunks);
  req.method = method;
  req.url = url;
  req.headers = {
    ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    ...headers,
  };
  req.socket = { remoteAddress: '127.0.0.1' };
  const res = createResponse();
  await apiRoute(req, res, {
    jwtSecret: 'test-jwt-secret-with-at-least-thirty-two-characters',
    passwordPepper: 'test-password-pepper-with-at-least-thirty-two-characters',
    adminUsername: 'admin@gmail.com',
    loginRateLimitWindowMs: 60_000,
    loginRateLimitBlockMs: 60_000,
    loginRateLimitMaxAttempts: 5,
    loginRateLimitMaxBuckets: 100,
    trustProxy: false,
    ...env,
  });
  return res;
}

afterEach(() => {
  vi.clearAllMocks();
  dbMocks.getUserTenantMembershipSummary.mockResolvedValue({ total: 0, activeOnActiveTenant: 0 });
});

describe('runtime hardening routes', () => {
  it('uses a stable dummy hash for the first missing-user login path', async () => {
    dbMocks.findUserByUsername.mockResolvedValue(null);
    passwordMocks.verifyPassword.mockResolvedValue(false);

    const response = await callApi('POST', '/api/auth/login', {
      body: { username: 'missing-user', password: 'WrongPass123!' },
    });

    expect(response.status).toBe(401);
    expect(response.body).toMatchObject({ ok: false, message: 'Invalid username or password' });
    expect(passwordMocks.verifyPassword).toHaveBeenCalledWith(
      'WrongPass123!',
      DUMMY_LOGIN_PASSWORD_HASH,
      'test-password-pepper-with-at-least-thirty-two-characters',
    );
  });

  it('returns 409 instead of a generic 500 when demoting the last admin account', async () => {
    const actorUser = { id: 'platform-admin', username: 'admin@gmail.com', role: 'superuser' };
    const token = createAccessToken(
      { sub: actorUser.id, username: actorUser.username, role: actorUser.role },
      {
        jwtSecret: 'test-jwt-secret-with-at-least-thirty-two-characters',
        jwtExpiresIn: '8h',
      },
    );
    dbMocks.findUserById.mockResolvedValue(actorUser);
    dbMocks.updateUserByAdmin.mockRejectedValue(new Error('At least one admin account is required'));

    const response = await callApi('PATCH', '/api/users/user-1', {
      body: { username: 'target-admin', role: 'kasir' },
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({ ok: false, message: 'At least one admin account is required' });
  });

  it('returns 409 instead of a generic 500 when deleting the last admin account', async () => {
    const actorUser = { id: 'platform-admin', username: 'admin@gmail.com', role: 'superuser' };
    const token = createAccessToken(
      { sub: actorUser.id, username: actorUser.username, role: actorUser.role },
      {
        jwtSecret: 'test-jwt-secret-with-at-least-thirty-two-characters',
        jwtExpiresIn: '8h',
      },
    );
    dbMocks.findUserById.mockResolvedValue(actorUser);
    dbMocks.deleteUserByAdmin.mockRejectedValue(new Error('At least one admin account is required'));

    const response = await callApi('DELETE', '/api/users/user-1', {
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({ ok: false, message: 'At least one admin account is required' });
  });
});
