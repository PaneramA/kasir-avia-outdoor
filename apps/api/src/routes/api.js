import { ZodError } from 'zod';
import {
  changeOwnPassword,
  changeUserPasswordByAdmin,
  createCategory,
  upsertCustomer,
  createItem,
  createRental,
  createUser,
  deleteRentalByAdmin,
  deleteCategory,
  deleteItem,
  deleteUserByAdmin,
  findUserById,
  findUserByUsername,
  getSchemaSummary,
  listCategories,
  listCustomers,
  listItems,
  listRentals,
  listReturns,
  listUsers,
  processReturn,
  verifyUserPasswordById,
  rehashUserPassword,
  updateCustomerById,
  deleteCustomerById,
  updateUserByAdmin,
  updateItem,
} from '../data/db.js';
import { createAccessToken, verifyAccessToken } from '../auth/jwt.js';
import { needsPasswordRehash, verifyPassword } from '../auth/password.js';
import {
  adminChangePasswordSchema,
  createCategorySchema,
  createCustomerSchema,
  updateCustomerSchema,
  createItemSchema,
  createUserSchema,
  createRentalSchema,
  loginSchema,
  processReturnSchema,
  deleteRentalByAdminSchema,
  verifyRentalDeleteSchema,
  selfChangePasswordSchema,
  updateUserSchema,
  updateItemSchema,
} from '../validation/schemas.js';
import { parsePath, readJsonBody, sendJson } from '../utils/http.js';

const loginRateLimitBuckets = new Map();
const rentalDeleteVerificationBuckets = new Map();
const RENTAL_DELETE_VERIFICATION_TTL_MS = 5 * 60 * 1000;

function cleanupLoginRateLimitEntry(key, entry, env, now) {
  const maxIdleMs = Math.max(env.loginRateLimitWindowMs, env.loginRateLimitBlockMs);
  if (now - entry.updatedAtMs > maxIdleMs) {
    loginRateLimitBuckets.delete(key);
    return true;
  }

  return false;
}

function getRequestClientIp(req) {
  const forwardedFor = req.headers['x-forwarded-for'];
  if (typeof forwardedFor === 'string' && forwardedFor.trim()) {
    return forwardedFor.split(',')[0].trim();
  }

  return req.socket?.remoteAddress || 'unknown';
}

function createLoginRateLimitKey(type, value) {
  return `${type}:${String(value || '').trim().toLowerCase() || 'unknown'}`;
}

function getLoginRateLimitRetrySeconds(key, env) {
  const now = Date.now();
  const entry = loginRateLimitBuckets.get(key);
  if (!entry) {
    return 0;
  }

  if (entry.blockedUntilMs <= now) {
    if (!cleanupLoginRateLimitEntry(key, entry, env, now)) {
      entry.blockedUntilMs = 0;
      loginRateLimitBuckets.set(key, entry);
    }
    return 0;
  }

  return Math.max(1, Math.ceil((entry.blockedUntilMs - now) / 1000));
}

function registerLoginFailure(key, env) {
  const now = Date.now();
  const entry = loginRateLimitBuckets.get(key) || {
    attempts: 0,
    windowStartedAtMs: now,
    blockedUntilMs: 0,
    updatedAtMs: now,
  };

  if (entry.blockedUntilMs > now) {
    return Math.max(1, Math.ceil((entry.blockedUntilMs - now) / 1000));
  }

  if (now - entry.windowStartedAtMs >= env.loginRateLimitWindowMs) {
    entry.attempts = 0;
    entry.windowStartedAtMs = now;
  }

  entry.attempts += 1;
  entry.updatedAtMs = now;

  if (entry.attempts >= env.loginRateLimitMaxAttempts) {
    entry.attempts = 0;
    entry.blockedUntilMs = now + env.loginRateLimitBlockMs;
  }

  loginRateLimitBuckets.set(key, entry);

  return entry.blockedUntilMs > now
    ? Math.max(1, Math.ceil((entry.blockedUntilMs - now) / 1000))
    : 0;
}

function clearLoginFailures(key) {
  loginRateLimitBuckets.delete(key);
}

function createRentalDeleteVerificationKey(actorUserId, rentalId) {
  return `${String(actorUserId || '').trim()}:${String(rentalId || '').trim()}`;
}

function markRentalDeleteVerified(actorUserId, rentalId) {
  const key = createRentalDeleteVerificationKey(actorUserId, rentalId);
  rentalDeleteVerificationBuckets.set(key, Date.now() + RENTAL_DELETE_VERIFICATION_TTL_MS);
}

function clearRentalDeleteVerification(actorUserId, rentalId) {
  const key = createRentalDeleteVerificationKey(actorUserId, rentalId);
  rentalDeleteVerificationBuckets.delete(key);
}

function isRentalDeleteVerified(actorUserId, rentalId) {
  const key = createRentalDeleteVerificationKey(actorUserId, rentalId);
  const expiresAt = rentalDeleteVerificationBuckets.get(key);
  if (!expiresAt) {
    return false;
  }

  if (Date.now() > expiresAt) {
    rentalDeleteVerificationBuckets.delete(key);
    return false;
  }

  return true;
}

function sendError(res, statusCode, message, details) {
  sendJson(res, statusCode, {
    ok: false,
    message,
    ...(details ? { details } : {}),
  });
}

function sendSuccess(res, statusCode, data) {
  sendJson(res, statusCode, {
    ok: true,
    data,
  });
}

function normalizeRole(rawRole) {
  return String(rawRole || '').trim().toLowerCase();
}

function getBearerToken(req) {
  const authHeader = req.headers.authorization || '';
  if (!authHeader.startsWith('Bearer ')) {
    return '';
  }

  return authHeader.slice('Bearer '.length).trim();
}

function isWriteMethod(method) {
  return ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method);
}

function shouldSkipAuth(pathname) {
  return pathname === '/api/auth/login';
}

async function authenticateRequest(req, env) {
  const token = getBearerToken(req);
  if (!token) {
    throw new Error('Unauthorized');
  }

  const decoded = verifyAccessToken(token, env);
  if (!decoded || typeof decoded !== 'object') {
    throw new Error('Unauthorized');
  }

  if (
    typeof decoded.sub !== 'string' ||
    typeof decoded.username !== 'string' ||
    typeof decoded.role !== 'string'
  ) {
    throw new Error('Unauthorized');
  }

  const user = await findUserById(decoded.sub);
  if (!user) {
    throw new Error('Unauthorized');
  }

  return {
    id: user.id,
    username: user.username,
    role: normalizeRole(user.role),
  };
}

export async function apiRoute(req, res, env) {
  const { pathname, searchParams } = parsePath(req);
  let authUser = null;

  const ensureAuth = async () => {
    if (authUser) {
      return authUser;
    }

    authUser = await authenticateRequest(req, env);
    return authUser;
  };

  const ensureAdmin = async () => {
    const user = await ensureAuth();
    const role = normalizeRole(user.role);
    if (role !== 'admin' && role !== 'superuser') {
      throw new Error('Forbidden');
    }

    return user;
  };

  try {
    if (req.method === 'POST' && pathname === '/api/auth/login') {
      const loginIpKey = createLoginRateLimitKey('ip', getRequestClientIp(req));
      const ipRetryAfterSeconds = getLoginRateLimitRetrySeconds(loginIpKey, env);
      if (ipRetryAfterSeconds > 0) {
        res.setHeader('Retry-After', String(ipRetryAfterSeconds));
        sendError(res, 429, 'Too many login attempts. Please try again later.');
        return true;
      }

      const body = loginSchema.parse(await readJsonBody(req));
      const normalizedUsername = body.username.trim().toLowerCase();
      const loginUserKey = createLoginRateLimitKey('user', normalizedUsername);
      const userRetryAfterSeconds = getLoginRateLimitRetrySeconds(loginUserKey, env);
      if (userRetryAfterSeconds > 0) {
        res.setHeader('Retry-After', String(userRetryAfterSeconds));
        sendError(res, 429, 'Too many login attempts. Please try again later.');
        return true;
      }

      const user = await findUserByUsername(normalizedUsername);

      if (!user || !verifyPassword(body.password, user.passwordHash, env.passwordPepper)) {
        const nextIpRetryAfterSeconds = registerLoginFailure(loginIpKey, env);
        const nextUserRetryAfterSeconds = registerLoginFailure(loginUserKey, env);
        const retryAfterSeconds = Math.max(nextIpRetryAfterSeconds, nextUserRetryAfterSeconds);
        if (retryAfterSeconds > 0) {
          res.setHeader('Retry-After', String(retryAfterSeconds));
          sendError(res, 429, 'Too many login attempts. Please try again later.');
          return true;
        }

        sendError(res, 401, 'Invalid username or password');
        return true;
      }

      clearLoginFailures(loginUserKey);

      if (needsPasswordRehash(user.passwordHash)) {
        try {
          await rehashUserPassword(user.id, body.password, env.passwordPepper);
        } catch (rehashError) {
          const message = rehashError instanceof Error ? rehashError.message : String(rehashError);
          console.warn(`[api] failed to rehash password for user ${user.id}: ${message}`);
        }
      }

      const token = createAccessToken(
        {
          sub: user.id,
          username: user.username,
          role: normalizeRole(user.role),
        },
        env,
      );

      sendSuccess(res, 200, {
        token,
        user: {
          id: user.id,
          username: user.username,
          role: normalizeRole(user.role),
        },
      });
      return true;
    }

    if (isWriteMethod(req.method) && !shouldSkipAuth(pathname)) {
      await ensureAuth();
    }

    if (req.method === 'GET' && pathname === '/api/auth/me') {
      const user = await ensureAuth();
      sendSuccess(res, 200, user);
      return true;
    }

    if (req.method === 'GET' && pathname === '/api/users') {
      await ensureAdmin();
      sendSuccess(res, 200, await listUsers());
      return true;
    }

    if (req.method === 'POST' && pathname === '/api/users') {
      await ensureAdmin();
      const body = createUserSchema.parse(await readJsonBody(req));
      const created = await createUser(body, env.passwordPepper);
      sendSuccess(res, 201, created);
      return true;
    }

    if (req.method === 'PATCH' && pathname.startsWith('/api/users/') && !pathname.endsWith('/password')) {
      await ensureAdmin();
      const userId = decodeURIComponent(pathname.replace('/api/users/', ''));
      const body = updateUserSchema.parse(await readJsonBody(req));
      const updated = await updateUserByAdmin(userId, body);
      sendSuccess(res, 200, updated);
      return true;
    }

    if (req.method === 'DELETE' && pathname.startsWith('/api/users/') && !pathname.endsWith('/password')) {
      const adminUser = await ensureAdmin();
      const userId = decodeURIComponent(pathname.replace('/api/users/', ''));
      const removed = await deleteUserByAdmin(adminUser.id, userId);
      sendSuccess(res, 200, removed);
      return true;
    }

    if (req.method === 'PATCH' && pathname === '/api/users/me/password') {
      const user = await ensureAuth();
      const body = selfChangePasswordSchema.parse(await readJsonBody(req));
      const result = await changeOwnPassword(user.id, body.currentPassword, body.newPassword, env.passwordPepper);
      sendSuccess(res, 200, result);
      return true;
    }

    if (req.method === 'PATCH' && pathname.startsWith('/api/users/') && pathname.endsWith('/password')) {
      await ensureAdmin();
      const userId = decodeURIComponent(pathname.replace('/api/users/', '').replace('/password', ''));
      const body = adminChangePasswordSchema.parse(await readJsonBody(req));
      const result = await changeUserPasswordByAdmin(userId, body.newPassword, env.passwordPepper);
      sendSuccess(res, 200, result);
      return true;
    }

    if (req.method === 'GET' && pathname === '/api/categories') {
      sendSuccess(res, 200, await listCategories());
      return true;
    }

    if (req.method === 'GET' && pathname === '/api/customers') {
      await ensureAuth();
      const query = (searchParams.get('q') || '').trim();
      sendSuccess(res, 200, await listCustomers({ query }));
      return true;
    }

    if (req.method === 'POST' && pathname === '/api/customers') {
      const body = createCustomerSchema.parse(await readJsonBody(req));
      const savedCustomer = await upsertCustomer(body);
      sendSuccess(res, 201, savedCustomer);
      return true;
    }

    if (req.method === 'PATCH' && pathname.startsWith('/api/customers/')) {
      const customerId = decodeURIComponent(pathname.replace('/api/customers/', ''));
      const body = updateCustomerSchema.parse(await readJsonBody(req));
      const updatedCustomer = await updateCustomerById(customerId, body);
      sendSuccess(res, 200, updatedCustomer);
      return true;
    }

    if (req.method === 'DELETE' && pathname.startsWith('/api/customers/')) {
      const customerId = decodeURIComponent(pathname.replace('/api/customers/', ''));
      const deleted = await deleteCustomerById(customerId);
      sendSuccess(res, 200, deleted);
      return true;
    }

    if (req.method === 'GET' && pathname === '/api/schema') {
      sendSuccess(res, 200, await getSchemaSummary());
      return true;
    }

    if (req.method === 'POST' && pathname === '/api/categories') {
      const body = createCategorySchema.parse(await readJsonBody(req));
      const category = await createCategory(body.name);
      sendSuccess(res, 201, category);
      return true;
    }

    if (req.method === 'DELETE' && pathname.startsWith('/api/categories/')) {
      const categoryName = decodeURIComponent(pathname.replace('/api/categories/', ''));
      const removed = await deleteCategory(categoryName);
      sendSuccess(res, 200, removed);
      return true;
    }

    if (req.method === 'GET' && pathname === '/api/items') {
      sendSuccess(res, 200, await listItems());
      return true;
    }

    if (req.method === 'POST' && pathname === '/api/items') {
      const body = createItemSchema.parse(await readJsonBody(req));
      const item = await createItem(body);
      sendSuccess(res, 201, item);
      return true;
    }

    if (req.method === 'PATCH' && pathname.startsWith('/api/items/')) {
      const itemId = decodeURIComponent(pathname.replace('/api/items/', ''));
      const body = updateItemSchema.parse(await readJsonBody(req));
      const item = await updateItem(itemId, body);
      sendSuccess(res, 200, item);
      return true;
    }

    if (req.method === 'DELETE' && pathname.startsWith('/api/items/')) {
      const itemId = decodeURIComponent(pathname.replace('/api/items/', ''));
      const removed = await deleteItem(itemId);
      sendSuccess(res, 200, removed);
      return true;
    }

    if (req.method === 'GET' && pathname === '/api/rentals') {
      await ensureAuth();
      const status = searchParams.get('status') || undefined;
      sendSuccess(res, 200, await listRentals({ status }));
      return true;
    }

    if (req.method === 'POST' && pathname === '/api/rentals') {
      const body = createRentalSchema.parse(await readJsonBody(req));
      const rental = await createRental(body);
      sendSuccess(res, 201, rental);
      return true;
    }

    if (req.method === 'POST' && pathname.startsWith('/api/rentals/') && pathname.endsWith('/delete-verify')) {
      const adminUser = await ensureAdmin();
      const rentalId = decodeURIComponent(pathname.replace('/api/rentals/', '').replace('/delete-verify', ''));
      const body = verifyRentalDeleteSchema.parse(await readJsonBody(req));
      const validPassword = await verifyUserPasswordById(adminUser.id, body.password, env.passwordPepper);

      if (!validPassword) {
        throw new Error('Invalid password');
      }

      markRentalDeleteVerified(adminUser.id, rentalId);
      sendSuccess(res, 200, { verified: true });
      return true;
    }

    if (req.method === 'DELETE' && pathname.startsWith('/api/rentals/')) {
      const adminUser = await ensureAdmin();
      const rentalId = decodeURIComponent(pathname.replace('/api/rentals/', ''));
      const body = deleteRentalByAdminSchema.parse(await readJsonBody(req));
      const expectedConfirmation = `HAPUS ${rentalId}`.toUpperCase();
      const actualConfirmation = body.confirmationText.trim().toUpperCase();

      if (actualConfirmation !== expectedConfirmation) {
        throw new Error(`Confirmation text must be exactly: HAPUS ${rentalId}`);
      }

      if (!isRentalDeleteVerified(adminUser.id, rentalId)) {
        throw new Error('Password verification expired. Please verify again.');
      }

      const deleted = await deleteRentalByAdmin({
        actorUserId: adminUser.id,
        rentalId,
        reason: body.reason,
      });

      clearRentalDeleteVerification(adminUser.id, rentalId);
      sendSuccess(res, 200, deleted);
      return true;
    }

    if (req.method === 'GET' && pathname === '/api/returns') {
      await ensureAuth();
      sendSuccess(res, 200, await listReturns());
      return true;
    }

    if (req.method === 'POST' && pathname === '/api/returns') {
      const body = processReturnSchema.parse(await readJsonBody(req));
      const result = await processReturn(body);
      sendSuccess(res, 200, result);
      return true;
    }
  } catch (error) {
    if (error instanceof ZodError) {
      sendError(res, 400, 'Validation failed', error.issues);
      return true;
    }

    const message = error instanceof Error ? error.message : 'Unexpected error';

    if (message === 'Unauthorized' || message.toLowerCase().includes('jwt')) {
      sendError(res, 401, 'Unauthorized');
      return true;
    }

    if (message === 'Invalid password') {
      sendError(res, 401, message);
      return true;
    }

    if (message === 'Forbidden') {
      sendError(res, 403, 'Forbidden');
      return true;
    }

    if (
      message.includes('not found') ||
      message.includes('does not exist')
    ) {
      sendError(res, 404, message);
      return true;
    }

    sendError(res, 400, message);
    return true;
  }

  return false;
}
