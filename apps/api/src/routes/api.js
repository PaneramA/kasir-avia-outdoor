import { ZodError } from 'zod';
import {
  changeOwnPassword,
  changeUserPasswordByAdmin,
  assertRentalInContext,
  archiveItem,
  createCategory,
  upsertCustomer,
  createItem,
  createRental,
  onboardTenantForPlatformAdmin,
  createTenantUserForUser,
  createUser,
  deleteRentalByAdmin,
  deleteCategory,
  deleteUserByAdmin,
  deleteTenantForPlatformAdmin,
  findUserById,
  findUserByUsername,
  getTenantSettingsForUser,
  getTenantSubscriptionSummaryForUser,
  getBranchSettingsForUser,
  getDashboardSummary,
  getFinancialRecapPage,
  updateBranchSettingsByIdForUser,
  getSchemaSummary,
  getUserTenantMembershipSummary,
  createBranchForUser,
  createPlanForPlatformAdmin,
  updateBranchForUser,
  updatePlanForPlatformAdmin,
  updateTenantSubscriptionForPlatformAdmin,
  updateTenantForSuperuser,
  listBranchAccessForUser,
  listPlansForPlatformAdmin,
  upsertBranchAccessForUser,
  removeBranchAccessForUser,
  restoreItem,
  listTenantMembershipsForUser,
  upsertTenantMembershipForUser,
  updateTenantMembershipForUser,
  listBranchesForUser,
  listTenantSubscriptionsForPlatformAdmin,
  listTenantsForUser,
  listPublicActiveTenants,
  listCategories,
  listCustomers,
  listItems,
  listItemsPage,
  listRentals,
  listRentalHistoryPage,
  listReturns,
  listUsers,
  listTenantUsersForUser,
  processReturn,
  verifyUserPasswordById,
  rehashUserPassword,
  updateCustomerById,
  updateTenantSettingsByTenantId,
  resolveTenantBranchContextForUser,
  deleteCustomerById,
  updateUserByAdmin,
  updateItem,
} from '../data/db.js';
import { createAccessToken, verifyAccessToken } from '../auth/jwt.js';
import { assertFeatureEnabled, assertTenantManager } from '../auth/authorization.js';
import { createLoginRateLimiter, resolveLoginClientIp } from '../auth/loginRateLimiter.js';
import { needsPasswordRehash, verifyPassword } from '../auth/password.js';
import { createExpiringVerificationStore } from '../auth/verificationStore.js';
import {
  adminChangePasswordSchema,
  createCategorySchema,
  createCustomerSchema,
  updateCustomerSchema,
  createItemSchema,
  createUserSchema,
  createTenantUserSchema,
  createRentalSchema,
  loginSchema,
  processReturnSchema,
  onboardTenantSchema,
  deleteRentalByAdminSchema,
  verifyRentalDeleteSchema,
  selfChangePasswordSchema,
  updateUserSchema,
  updateTenantSchema,
  deleteTenantSchema,
  updateTenantSettingsSchema,
  updateBranchSettingsSchema,
  createBranchSchema,
  createPlanSchema,
  updateBranchSchema,
  updatePlanSchema,
  updateTenantSubscriptionSchema,
  upsertBranchAccessSchema,
  upsertTenantMembershipSchema,
  updateTenantMembershipSchema,
  updateItemSchema,
} from '../validation/schemas.js';
import { parsePath, readJsonBody, sendJson } from '../utils/http.js';

const RENTAL_DELETE_VERIFICATION_TTL_MS = 5 * 60 * 1000;
const rentalDeleteVerifications = createExpiringVerificationStore({
  ttlMs: RENTAL_DELETE_VERIFICATION_TTL_MS,
  maxEntries: 1_000,
});
let loginRateLimiter;
let loginRateLimiterSignature = '';
let inFlightLoginHashes = 0;
const inFlightLoginHashesByKey = new Map();

function normalizeUsername(value) {
  return String(value || '').trim().toLowerCase();
}

function isConfiguredPlatformAdmin(user, env) {
  return normalizeRole(user?.role) === 'superuser'
    && normalizeUsername(user?.username) === normalizeUsername(env.adminUsername);
}

function getEffectiveUserRole(user, env) {
  const role = normalizeRole(user?.role);
  if (role === 'superuser' && !isConfiguredPlatformAdmin(user, env)) {
    return 'kasir';
  }

  return role;
}

function createLoginRateLimitKey(type, value) {
  return `${type}:${String(value || '').trim().toLowerCase() || 'unknown'}`;
}

function getLoginRateLimiter(env) {
  const signature = [
    env.loginRateLimitWindowMs,
    env.loginRateLimitBlockMs,
    env.loginRateLimitMaxAttempts,
    env.loginRateLimitMaxBuckets,
  ].join(':');
  if (!loginRateLimiter || loginRateLimiterSignature !== signature) {
    loginRateLimiter = createLoginRateLimiter({
      windowMs: env.loginRateLimitWindowMs,
      blockMs: env.loginRateLimitBlockMs,
      maxAttempts: env.loginRateLimitMaxAttempts,
      maxBuckets: env.loginRateLimitMaxBuckets,
    });
    loginRateLimiterSignature = signature;
  }

  return loginRateLimiter;
}

function reserveLoginHashCapacity({ ipKey, userKey, env }) {
  const globalLimit = Math.max(1, Math.min(8, Number(env.loginRateLimitMaxAttempts) || 1));
  const ipLimit = Math.max(1, Math.min(2, globalLimit));
  const userLimit = 1;
  if (
    inFlightLoginHashes >= globalLimit
    || (inFlightLoginHashesByKey.get(ipKey) || 0) >= ipLimit
    || (inFlightLoginHashesByKey.get(userKey) || 0) >= userLimit
  ) {
    return null;
  }

  inFlightLoginHashes += 1;
  inFlightLoginHashesByKey.set(ipKey, (inFlightLoginHashesByKey.get(ipKey) || 0) + 1);
  inFlightLoginHashesByKey.set(userKey, (inFlightLoginHashesByKey.get(userKey) || 0) + 1);
  let released = false;
  return () => {
    if (released) {
      return;
    }
    released = true;
    inFlightLoginHashes -= 1;
    for (const key of [ipKey, userKey]) {
      const nextCount = (inFlightLoginHashesByKey.get(key) || 1) - 1;
      if (nextCount > 0) {
        inFlightLoginHashesByKey.set(key, nextCount);
      } else {
        inFlightLoginHashesByKey.delete(key);
      }
    }
  };
}

function createRentalDeleteVerificationKey(actorUserId, rentalId) {
  return `${String(actorUserId || '').trim()}:${String(rentalId || '').trim()}`;
}

function markRentalDeleteVerified(actorUserId, rentalId) {
  const key = createRentalDeleteVerificationKey(actorUserId, rentalId);
  rentalDeleteVerifications.mark(key);
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

function getTenantIdFromSettingsPath(pathname) {
  if (!pathname.startsWith('/api/tenants/') || !pathname.endsWith('/settings')) {
    return '';
  }

  const tenantId = pathname
    .replace('/api/tenants/', '')
    .replace('/settings', '')
    .trim();

  return decodeURIComponent(tenantId);
}

function getBranchIdFromSettingsPath(pathname) {
  if (!pathname.startsWith('/api/branches/') || !pathname.endsWith('/settings')) {
    return '';
  }

  const branchId = pathname
    .replace('/api/branches/', '')
    .replace('/settings', '')
    .trim();

  return decodeURIComponent(branchId);
}

function getHeaderValue(req, headerName) {
  const raw = req.headers[headerName];
  if (Array.isArray(raw)) {
    return String(raw[0] || '').trim();
  }

  return String(raw || '').trim();
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
    role: getEffectiveUserRole(user, env),
  };
}

export async function apiRoute(req, res, env) {
  const { pathname, searchParams } = parsePath(req);
  let authUser = null;
  let requestContext = null;
  const readBody = (request) => readJsonBody(request, {
    limitBytes: env.requestBodyLimitBytes,
    timeoutMs: env.requestBodyTimeoutMs,
  });

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

  const ensureSuperuser = async () => {
    const user = await ensureAuth();
    const role = normalizeRole(user.role);
    if (role !== 'superuser') {
      throw new Error('Forbidden');
    }

    return user;
  };

  const ensurePlatformAdmin = async () => {
    return ensureSuperuser();
  };

  const requireScope = (value, message) => {
    if (!value) {
      const error = new Error(message);
      error.statusCode = 400;
      throw error;
    }
    return value;
  };

  const ensureRequestContext = async ({
    requestedTenantId,
    requestedBranchId,
    requireBranch = true,
    requireExplicitScope = false,
  } = {}) => {
    if (requestContext) {
      return requestContext;
    }

    const user = await ensureAuth();
    const explicitTenantId = requestedTenantId || getHeaderValue(req, 'x-tenant-id');
    const targetBranchId = requestedBranchId || getHeaderValue(req, 'x-branch-id');
    if (requireExplicitScope && !explicitTenantId && !targetBranchId) {
      requireScope('', 'Explicit tenant scope is required');
    }
    if (requireExplicitScope && requireBranch) {
      requireScope(targetBranchId, 'Explicit branch scope is required');
    }
    const targetTenantId = explicitTenantId || 'current';

    requestContext = await resolveTenantBranchContextForUser({
      userId: user.id,
      role: user.role,
      requestedTenantId: targetTenantId,
      requestedBranchId: targetBranchId,
    });

    return requestContext;
  };

  const ensureTenantManagerContext = async (options) => {
    const context = await ensureRequestContext({
      ...options,
      requireExplicitScope: true,
    });
    assertTenantManager(context.membershipRole);
    return context;
  };

  try {
    if (req.method === 'POST' && pathname === '/api/auth/register') {
      sendError(res, 404, 'Route not found');
      return true;
    }

    if (req.method === 'POST' && pathname === '/api/auth/login') {
      const limiter = getLoginRateLimiter(env);
      const clientIp = resolveLoginClientIp(req, { trustProxy: env.trustProxy });
      const loginIpKey = createLoginRateLimitKey('ip', clientIp);
      const ipRetryAfterSeconds = limiter.retryAfter(loginIpKey);
      if (ipRetryAfterSeconds > 0) {
        res.setHeader('Retry-After', String(ipRetryAfterSeconds));
        sendError(res, 429, 'Too many login attempts. Please try again later.');
        return true;
      }

      const body = loginSchema.parse(await readBody(req));
      const normalizedUsername = body.username.trim().toLowerCase();
      const loginUserKey = createLoginRateLimitKey('user', normalizedUsername);
      const userRetryAfterSeconds = limiter.retryAfter(loginUserKey);
      if (userRetryAfterSeconds > 0) {
        res.setHeader('Retry-After', String(userRetryAfterSeconds));
        sendError(res, 429, 'Too many login attempts. Please try again later.');
        return true;
      }

      const releaseLoginHash = reserveLoginHashCapacity({
        ipKey: loginIpKey,
        userKey: loginUserKey,
        env,
      });
      if (!releaseLoginHash) {
        res.setHeader('Retry-After', '1');
        sendError(res, 429, 'Too many login attempts. Please try again later.');
        return true;
      }

      let user;
      let passwordMatches = false;
      try {
        user = await findUserByUsername(normalizedUsername);
        passwordMatches = user
          ? await verifyPassword(body.password, user.passwordHash, env.passwordPepper)
          : false;
      } finally {
        releaseLoginHash();
      }
      if (!passwordMatches) {
        const nextIpRetryAfterSeconds = limiter.registerFailure(loginIpKey);
        const nextUserRetryAfterSeconds = limiter.registerFailure(loginUserKey);
        const retryAfterSeconds = Math.max(nextIpRetryAfterSeconds, nextUserRetryAfterSeconds);
        if (retryAfterSeconds > 0) {
          res.setHeader('Retry-After', String(retryAfterSeconds));
          sendError(res, 429, 'Too many login attempts. Please try again later.');
          return true;
        }

        sendError(res, 401, 'Invalid username or password');
        return true;
      }

      limiter.clear(loginUserKey);

      const membershipSummary = await getUserTenantMembershipSummary(user.id);
      if (
        membershipSummary.total > 0
        && membershipSummary.activeOnActiveTenant === 0
        && getEffectiveUserRole(user, env) !== 'superuser'
      ) {
        sendError(
          res,
          403,
          'Akun kamu masih menunggu approval admin. Silakan selesaikan pembayaran lalu tunggu aktivasi toko.',
        );
        return true;
      }

      if (needsPasswordRehash(user.passwordHash)) {
        try {
          await rehashUserPassword(
            user.id,
            body.password,
            env.passwordPepper,
            user.passwordHash,
          );
        } catch (rehashError) {
          const message = rehashError instanceof Error ? rehashError.message : String(rehashError);
          console.warn(`[api] failed to rehash password for user ${user.id}: ${message}`);
        }
      }

      const token = createAccessToken(
        {
          sub: user.id,
          username: user.username,
          role: getEffectiveUserRole(user, env),
        },
        env,
      );

      sendSuccess(res, 200, {
        token,
        user: {
          id: user.id,
          username: user.username,
          role: getEffectiveUserRole(user, env),
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

    if (req.method === 'GET' && pathname === '/api/tenants') {
      const user = await ensureAuth();
      const tenants = await listTenantsForUser({
        userId: user.id,
        role: user.role,
      });
      sendSuccess(res, 200, tenants);
      return true;
    }

    if (req.method === 'GET' && pathname === '/api/plans') {
      await ensurePlatformAdmin();
      sendSuccess(res, 200, await listPlansForPlatformAdmin());
      return true;
    }

    if (req.method === 'POST' && pathname === '/api/plans') {
      await ensurePlatformAdmin();
      const body = createPlanSchema.parse(await readBody(req));
      const created = await createPlanForPlatformAdmin(body);
      sendSuccess(res, 201, created);
      return true;
    }

    if (req.method === 'PATCH' && pathname.startsWith('/api/plans/')) {
      await ensurePlatformAdmin();
      const planId = decodeURIComponent(pathname.replace('/api/plans/', ''));
      const body = updatePlanSchema.parse(await readBody(req));
      const updated = await updatePlanForPlatformAdmin(planId, body);
      sendSuccess(res, 200, updated);
      return true;
    }

    if (req.method === 'GET' && pathname === '/api/subscriptions') {
      await ensurePlatformAdmin();
      sendSuccess(res, 200, await listTenantSubscriptionsForPlatformAdmin());
      return true;
    }

    if (req.method === 'PATCH' && pathname.startsWith('/api/subscriptions/')) {
      await ensurePlatformAdmin();
      const tenantId = decodeURIComponent(pathname.replace('/api/subscriptions/', ''));
      const body = updateTenantSubscriptionSchema.parse(await readBody(req));
      const updated = await updateTenantSubscriptionForPlatformAdmin(tenantId, body);
      sendSuccess(res, 200, updated);
      return true;
    }

    if (req.method === 'GET' && pathname === '/api/branches') {
      const user = await ensureAuth();
      const requestedTenantId = (searchParams.get('tenantId') || '').trim() || 'current';
      const branches = await listBranchesForUser({
        userId: user.id,
        role: user.role,
        tenantId: requestedTenantId,
      });
      sendSuccess(res, 200, branches);
      return true;
    }

    if (req.method === 'GET' && pathname === '/api/branches/current/settings') {
      const user = await ensureAuth();
      const requestedTenantId = requireScope(
        getHeaderValue(req, 'x-tenant-id'),
        'Explicit tenant scope is required',
      );
      const requestedBranchId = requireScope(
        getHeaderValue(req, 'x-branch-id'),
        'Explicit branch scope is required',
      );
      const settings = await getBranchSettingsForUser({
        userId: user.id,
        role: user.role,
        requestedTenantId,
        requestedBranchId,
      });
      sendSuccess(res, 200, settings);
      return true;
    }

    if (req.method === 'PATCH' && pathname === '/api/branches/current/settings') {
      const user = await ensureAuth();
      const context = await ensureTenantManagerContext();
      const body = updateBranchSettingsSchema.parse(await readBody(req));
      const updated = await updateBranchSettingsByIdForUser({
        actorUserId: user.id,
        actorRole: user.role,
        branchId: context.branchId,
        payload: body,
      });
      sendSuccess(res, 200, updated);
      return true;
    }

    if (req.method === 'GET' && pathname.startsWith('/api/branches/') && pathname.endsWith('/settings')) {
      const user = await ensureAuth();
      const branchId = getBranchIdFromSettingsPath(pathname);
      if (!branchId) {
        throw new Error('Branch id is required');
      }

      const settings = await getBranchSettingsForUser({
        userId: user.id,
        role: user.role,
        requestedTenantId: getHeaderValue(req, 'x-tenant-id') || 'current',
        requestedBranchId: branchId,
      });
      sendSuccess(res, 200, settings);
      return true;
    }

    if (req.method === 'PATCH' && pathname.startsWith('/api/branches/') && pathname.endsWith('/settings')) {
      const user = await ensureAuth();
      const branchId = getBranchIdFromSettingsPath(pathname);
      if (!branchId) {
        throw new Error('Branch id is required');
      }

      await ensureTenantManagerContext({ requestedBranchId: branchId });
      const body = updateBranchSettingsSchema.parse(await readBody(req));
      const updated = await updateBranchSettingsByIdForUser({
        actorUserId: user.id,
        actorRole: user.role,
        branchId,
        payload: body,
      });
      sendSuccess(res, 200, updated);
      return true;
    }

    if (req.method === 'POST' && pathname === '/api/branches') {
      const user = await ensureAuth();
      const body = createBranchSchema.parse(await readBody(req));
      await ensureTenantManagerContext({ requestedTenantId: body.tenantId, requireBranch: false });
      const created = await createBranchForUser({
        userId: user.id,
        role: user.role,
        tenantId: body.tenantId || 'current',
        payload: body,
      });
      sendSuccess(res, 201, created);
      return true;
    }

    if (req.method === 'PATCH' && pathname.startsWith('/api/branches/')) {
      const user = await ensureAuth();
      const branchId = decodeURIComponent(pathname.replace('/api/branches/', ''));
      await ensureTenantManagerContext({ requestedBranchId: branchId });
      const body = updateBranchSchema.parse(await readBody(req));
      const updated = await updateBranchForUser({
        userId: user.id,
        role: user.role,
        branchId,
        payload: body,
      });
      sendSuccess(res, 200, updated);
      return true;
    }

    if (req.method === 'GET' && pathname === '/api/tenant-memberships') {
      const user = await ensureAuth();
      const requestedTenantId = (searchParams.get('tenantId') || '').trim() || 'current';
      const memberships = await listTenantMembershipsForUser({
        userId: user.id,
        role: user.role,
        tenantId: requestedTenantId,
      });
      sendSuccess(res, 200, memberships);
      return true;
    }

    if (req.method === 'POST' && pathname === '/api/tenant-memberships') {
      const user = await ensureAuth();
      const body = upsertTenantMembershipSchema.parse(await readBody(req));
      await ensureTenantManagerContext({ requestedTenantId: body.tenantId, requireBranch: false });
      const saved = await upsertTenantMembershipForUser({
        actorUserId: user.id,
        actorRole: user.role,
        tenantId: body.tenantId || 'current',
        payload: body,
      });
      sendSuccess(res, 201, saved);
      return true;
    }

    if (req.method === 'PATCH' && pathname.startsWith('/api/tenant-memberships/')) {
      const user = await ensureAuth();
      const membershipId = decodeURIComponent(pathname.replace('/api/tenant-memberships/', ''));
      const body = updateTenantMembershipSchema.parse(await readBody(req));
      const updated = await updateTenantMembershipForUser({
        actorUserId: user.id,
        actorRole: user.role,
        membershipId,
        payload: body,
      });
      sendSuccess(res, 200, updated);
      return true;
    }

    if (req.method === 'GET' && pathname === '/api/branch-access') {
      const user = await ensureAuth();
      const requestedTenantId = (searchParams.get('tenantId') || '').trim() || 'current';
      const accesses = await listBranchAccessForUser({
        userId: user.id,
        role: user.role,
        tenantId: requestedTenantId,
      });
      sendSuccess(res, 200, accesses);
      return true;
    }

    if (req.method === 'POST' && pathname === '/api/branch-access') {
      const user = await ensureAuth();
      const body = upsertBranchAccessSchema.parse(await readBody(req));
      await ensureTenantManagerContext({
        requestedTenantId: body.tenantId,
        requestedBranchId: body.branchId,
      });
      const saved = await upsertBranchAccessForUser({
        actorUserId: user.id,
        actorRole: user.role,
        tenantId: body.tenantId || 'current',
        payload: body,
      });
      sendSuccess(res, 201, saved);
      return true;
    }

    if (req.method === 'DELETE' && pathname.startsWith('/api/branch-access/')) {
      const user = await ensureAuth();
      const accessId = decodeURIComponent(pathname.replace('/api/branch-access/', ''));
      const removed = await removeBranchAccessForUser({
        actorUserId: user.id,
        actorRole: user.role,
        accessId,
      });
      sendSuccess(res, 200, removed);
      return true;
    }

    if (req.method === 'GET' && pathname === '/api/tenants/current/settings') {
      const user = await ensureAuth();
      const requestedTenantId = requireScope(
        getHeaderValue(req, 'x-tenant-id'),
        'Explicit tenant scope is required',
      );
      const settings = await getTenantSettingsForUser({
        userId: user.id,
        role: user.role,
        requestedTenantId,
      });
      sendSuccess(res, 200, settings);
      return true;
    }

    if (req.method === 'POST' && pathname === '/api/admin/tenants/onboard') {
      await ensurePlatformAdmin();
      const body = onboardTenantSchema.parse(await readBody(req));
      const created = await onboardTenantForPlatformAdmin(body, env.passwordPepper);
      sendSuccess(res, 201, created);
      return true;
    }

    if (req.method === 'GET' && pathname === '/api/tenants/current/subscription') {
      const user = await ensureAuth();
      const requestedTenantId = requireScope(
        getHeaderValue(req, 'x-tenant-id'),
        'Explicit tenant scope is required',
      );
      const subscriptionSummary = await getTenantSubscriptionSummaryForUser({
        userId: user.id,
        role: user.role,
        requestedTenantId,
      });
      sendSuccess(res, 200, subscriptionSummary);
      return true;
    }

    if (req.method === 'PATCH' && pathname === '/api/tenants/current/settings') {
      const user = await ensureAuth();
      const context = await ensureTenantManagerContext({ requireBranch: false });
      const body = updateTenantSettingsSchema.parse(await readBody(req));
      const updated = await updateTenantSettingsByTenantId(context.tenantId, body, {
        userId: user.id,
        role: user.role,
      });
      sendSuccess(res, 200, updated);
      return true;
    }

    if (req.method === 'GET' && pathname.startsWith('/api/tenants/') && pathname.endsWith('/settings')) {
      const user = await ensureAuth();
      const tenantId = getTenantIdFromSettingsPath(pathname);
      if (!tenantId) {
        throw new Error('Tenant id is required');
      }

      const settings = await getTenantSettingsForUser({
        userId: user.id,
        role: user.role,
        requestedTenantId: tenantId,
      });
      sendSuccess(res, 200, settings);
      return true;
    }

    if (req.method === 'PATCH' && pathname.startsWith('/api/tenants/') && pathname.endsWith('/settings')) {
      const user = await ensureAuth();
      const tenantId = getTenantIdFromSettingsPath(pathname);
      if (!tenantId) {
        throw new Error('Tenant id is required');
      }

      await ensureTenantManagerContext({ requestedTenantId: tenantId, requireBranch: false });
      const body = updateTenantSettingsSchema.parse(await readBody(req));
      const updated = await updateTenantSettingsByTenantId(tenantId, body, {
        userId: user.id,
        role: user.role,
      });
      sendSuccess(res, 200, updated);
      return true;
    }

    if (
      req.method === 'PATCH'
      && pathname.startsWith('/api/tenants/')
      && !pathname.endsWith('/settings')
    ) {
      await ensurePlatformAdmin();
      const tenantId = decodeURIComponent(pathname.replace('/api/tenants/', ''));
      if (!tenantId) {
        throw new Error('Tenant id is required');
      }

      const body = updateTenantSchema.parse(await readBody(req));
      const updated = await updateTenantForSuperuser(tenantId, body);
      sendSuccess(res, 200, updated);
      return true;
    }

    if (
      req.method === 'DELETE'
      && pathname.startsWith('/api/tenants/')
      && !pathname.endsWith('/settings')
    ) {
      const adminUser = await ensurePlatformAdmin();
      const tenantId = decodeURIComponent(pathname.replace('/api/tenants/', ''));
      if (!tenantId) {
        throw new Error('Tenant id is required');
      }

      const body = deleteTenantSchema.parse(await readBody(req));
      const tenantList = await listTenantsForUser({
        userId: adminUser.id,
        role: adminUser.role,
      });
      const targetTenant = tenantList.find((tenant) => tenant.id === tenantId);
      if (!targetTenant) {
        throw new Error('Tenant not found');
      }

      if (body.confirmationText.trim() !== targetTenant.name.trim()) {
        throw new Error(`Confirmation text must be exactly: ${targetTenant.name}`);
      }

      const validPassword = await verifyUserPasswordById(adminUser.id, body.password, env.passwordPepper);
      if (!validPassword) {
        throw new Error('Invalid password');
      }

      const removed = await deleteTenantForPlatformAdmin(tenantId, body.confirmationText);
      sendSuccess(res, 200, removed);
      return true;
    }

    if (req.method === 'GET' && pathname === '/api/users') {
      await ensurePlatformAdmin();
      sendSuccess(res, 200, await listUsers());
      return true;
    }

    if (req.method === 'GET' && pathname === '/api/public/tenants') {
      sendSuccess(res, 200, await listPublicActiveTenants());
      return true;
    }

    if (req.method === 'GET' && pathname === '/api/users/tenant') {
      const user = await ensureAuth();
      const requestedTenantId = (searchParams.get('tenantId') || '').trim() || 'current';
      const tenantUsers = await listTenantUsersForUser({
        userId: user.id,
        role: user.role,
        tenantId: requestedTenantId,
      });
      sendSuccess(res, 200, tenantUsers);
      return true;
    }

    if (req.method === 'POST' && pathname === '/api/users/tenant') {
      const user = await ensureAuth();
      const body = createTenantUserSchema.parse(await readBody(req));
      await ensureTenantManagerContext({ requestedTenantId: body.tenantId, requireBranch: false });
      const created = await createTenantUserForUser({
        actorUserId: user.id,
        actorRole: user.role,
        tenantId: body.tenantId || 'current',
        payload: body,
        passwordPepper: env.passwordPepper,
      });
      sendSuccess(res, 201, created);
      return true;
    }

    if (req.method === 'POST' && pathname === '/api/users') {
      await ensurePlatformAdmin();
      const body = createUserSchema.parse(await readBody(req));
      const created = await createUser(body, env.passwordPepper);
      sendSuccess(res, 201, created);
      return true;
    }

    if (req.method === 'PATCH' && pathname.startsWith('/api/users/') && !pathname.endsWith('/password')) {
      await ensurePlatformAdmin();
      const userId = decodeURIComponent(pathname.replace('/api/users/', ''));
      const body = updateUserSchema.parse(await readBody(req));
      const updated = await updateUserByAdmin(userId, body);
      sendSuccess(res, 200, updated);
      return true;
    }

    if (req.method === 'DELETE' && pathname.startsWith('/api/users/') && !pathname.endsWith('/password')) {
      const adminUser = await ensurePlatformAdmin();
      const userId = decodeURIComponent(pathname.replace('/api/users/', ''));
      const removed = await deleteUserByAdmin(adminUser.id, userId);
      sendSuccess(res, 200, removed);
      return true;
    }

    if (req.method === 'PATCH' && pathname === '/api/users/me/password') {
      const user = await ensureAuth();
      const body = selfChangePasswordSchema.parse(await readBody(req));
      const result = await changeOwnPassword(user.id, body.currentPassword, body.newPassword, env.passwordPepper);
      sendSuccess(res, 200, result);
      return true;
    }

    if (req.method === 'PATCH' && pathname.startsWith('/api/users/') && pathname.endsWith('/password')) {
      await ensurePlatformAdmin();
      const userId = decodeURIComponent(pathname.replace('/api/users/', '').replace('/password', ''));
      const body = adminChangePasswordSchema.parse(await readBody(req));
      const result = await changeUserPasswordByAdmin(userId, body.newPassword, env.passwordPepper);
      sendSuccess(res, 200, result);
      return true;
    }

    if (req.method === 'GET' && pathname === '/api/categories') {
      await ensureAuth();
      const context = await ensureRequestContext();
      sendSuccess(res, 200, await listCategories(context));
      return true;
    }

    if (req.method === 'GET' && pathname === '/api/customers') {
      await ensureAuth();
      const context = await ensureRequestContext();
      const query = (searchParams.get('q') || '').trim();
      sendSuccess(res, 200, await listCustomers({ query }, context));
      return true;
    }

    if (req.method === 'POST' && pathname === '/api/customers') {
      await ensureAuth();
      const context = await ensureRequestContext();
      const body = createCustomerSchema.parse(await readBody(req));
      const savedCustomer = await upsertCustomer(body, context);
      sendSuccess(res, 201, savedCustomer);
      return true;
    }

    if (req.method === 'PATCH' && pathname.startsWith('/api/customers/')) {
      await ensureAuth();
      const context = await ensureRequestContext();
      const customerId = decodeURIComponent(pathname.replace('/api/customers/', ''));
      const body = updateCustomerSchema.parse(await readBody(req));
      const updatedCustomer = await updateCustomerById(customerId, body, context);
      sendSuccess(res, 200, updatedCustomer);
      return true;
    }

    if (req.method === 'DELETE' && pathname.startsWith('/api/customers/')) {
      await ensureAuth();
      const context = await ensureTenantManagerContext();
      const customerId = decodeURIComponent(pathname.replace('/api/customers/', ''));
      const deleted = await deleteCustomerById(customerId, context);
      sendSuccess(res, 200, deleted);
      return true;
    }

    if (req.method === 'GET' && pathname === '/api/schema') {
      sendSuccess(res, 200, await getSchemaSummary());
      return true;
    }

    if (req.method === 'POST' && pathname === '/api/categories') {
      await ensureAuth();
      const context = await ensureRequestContext();
      const body = createCategorySchema.parse(await readBody(req));
      const category = await createCategory(body.name, context);
      sendSuccess(res, 201, category);
      return true;
    }

    if (req.method === 'DELETE' && pathname.startsWith('/api/categories/')) {
      await ensureAuth();
      const context = await ensureTenantManagerContext();
      const categoryName = decodeURIComponent(pathname.replace('/api/categories/', ''));
      const removed = await deleteCategory(categoryName, context);
      sendSuccess(res, 200, removed);
      return true;
    }

    if (req.method === 'GET' && pathname === '/api/items') {
      await ensureAuth();
      const context = await ensureRequestContext();
      sendSuccess(res, 200, await listItems(context));
      return true;
    }

    if (req.method === 'POST' && pathname === '/api/items') {
      await ensureAuth();
      const context = await ensureRequestContext();
      const body = createItemSchema.parse(await readBody(req));
      const item = await createItem(body, context);
      sendSuccess(res, 201, item);
      return true;
    }

    if (req.method === 'PATCH' && pathname.startsWith('/api/items/')) {
      await ensureAuth();
      const context = await ensureRequestContext();
      const itemId = decodeURIComponent(pathname.replace('/api/items/', ''));
      const body = updateItemSchema.parse(await readBody(req));
      const item = await updateItem(itemId, body, context);
      sendSuccess(res, 200, item);
      return true;
    }

    if (req.method === 'POST' && pathname.startsWith('/api/items/') && pathname.endsWith('/restore')) {
      const user = await ensureAuth();
      const context = await ensureTenantManagerContext();
      const itemId = decodeURIComponent(pathname.replace('/api/items/', '').replace('/restore', ''));
      const restored = await restoreItem(itemId, { ...context, actorUserId: user.id });
      sendSuccess(res, 200, restored);
      return true;
    }

    if (req.method === 'DELETE' && pathname.startsWith('/api/items/')) {
      const user = await ensureAuth();
      const context = await ensureTenantManagerContext();
      const itemId = decodeURIComponent(pathname.replace('/api/items/', ''));
      const archived = await archiveItem(itemId, { ...context, actorUserId: user.id });
      sendSuccess(res, 200, archived);
      return true;
    }

    if (req.method === 'GET' && pathname === '/api/rentals/history') {
      await ensureAuth();
      const context = await ensureRequestContext();
      const history = await listRentalHistoryPage({
        status: searchParams.get('status') || undefined,
        query: searchParams.get('q') || undefined,
        startDate: searchParams.get('startDate') || undefined,
        endDate: searchParams.get('endDate') || undefined,
        cursor: searchParams.get('cursor') || undefined,
        limit: searchParams.get('limit') || undefined,
      }, context);
      sendSuccess(res, 200, history);
      return true;
    }

    if (req.method === 'GET' && pathname === '/api/items/page') {
      await ensureAuth();
      const context = await ensureRequestContext();
      sendSuccess(res, 200, await listItemsPage({
        query: searchParams.get('query') || undefined,
        cursor: searchParams.get('cursor') || undefined,
        limit: searchParams.get('limit') || undefined,
        status: searchParams.get('status') || undefined,
      }, context));
      return true;
    }

    if (req.method === 'GET' && pathname === '/api/dashboard/summary') {
      await ensureAuth();
      const context = await ensureRequestContext();
      const summary = await getDashboardSummary({
        recentStatus: searchParams.get('recentStatus') || undefined,
      }, context);
      sendSuccess(res, 200, summary);
      return true;
    }

    if (req.method === 'GET' && pathname === '/api/financial/recap') {
      await ensureAuth();
      const context = await ensureRequestContext();
      assertFeatureEnabled(context.subscription, 'canUseFinancialRecap');
      const recap = await getFinancialRecapPage({
        startDate: searchParams.get('startDate') || undefined,
        endDate: searchParams.get('endDate') || undefined,
        cursor: searchParams.get('cursor') || undefined,
        limit: searchParams.get('limit') || undefined,
      }, context);
      sendSuccess(res, 200, recap);
      return true;
    }

    if (req.method === 'GET' && pathname === '/api/rentals') {
      await ensureAuth();
      const context = await ensureRequestContext();
      const status = searchParams.get('status') || undefined;
      sendSuccess(res, 200, await listRentals({ status }, context));
      return true;
    }

    if (req.method === 'POST' && pathname === '/api/rentals') {
      await ensureAuth();
      const context = await ensureRequestContext();
      const body = createRentalSchema.parse(await readBody(req));
      const rental = await createRental(body, context);
      sendSuccess(res, 201, rental);
      return true;
    }

    if (req.method === 'POST' && pathname.startsWith('/api/rentals/') && pathname.endsWith('/delete-verify')) {
      const adminUser = await ensureAuth();
      const context = await ensureTenantManagerContext();
      const rentalId = decodeURIComponent(pathname.replace('/api/rentals/', '').replace('/delete-verify', ''));
      await assertRentalInContext(rentalId, context);
      const body = verifyRentalDeleteSchema.parse(await readBody(req));
      const validPassword = await verifyUserPasswordById(adminUser.id, body.password, env.passwordPepper);

      if (!validPassword) {
        throw new Error('Invalid password');
      }

      markRentalDeleteVerified(adminUser.id, rentalId);
      sendSuccess(res, 200, { verified: true });
      return true;
    }

    if (req.method === 'DELETE' && pathname.startsWith('/api/rentals/')) {
      const adminUser = await ensureAuth();
      const context = await ensureTenantManagerContext();
      const rentalId = decodeURIComponent(pathname.replace('/api/rentals/', ''));
      const body = deleteRentalByAdminSchema.parse(await readBody(req));
      const expectedConfirmation = `HAPUS ${rentalId}`.toUpperCase();
      const actualConfirmation = body.confirmationText.trim().toUpperCase();

      if (actualConfirmation !== expectedConfirmation) {
        throw new Error(`Confirmation text must be exactly: HAPUS ${rentalId}`);
      }

      const verificationKey = createRentalDeleteVerificationKey(adminUser.id, rentalId);
      if (!rentalDeleteVerifications.consume(verificationKey)) {
        throw new Error('Password verification expired. Please verify again.');
      }

      const deleted = await deleteRentalByAdmin({
        actorUserId: adminUser.id,
        rentalId,
        reason: body.reason,
        context,
      });

      sendSuccess(res, 200, deleted);
      return true;
    }

    if (req.method === 'GET' && pathname === '/api/returns') {
      await ensureAuth();
      const context = await ensureRequestContext();
      sendSuccess(res, 200, await listReturns(context));
      return true;
    }

    if (req.method === 'POST' && pathname === '/api/returns') {
      await ensureAuth();
      const context = await ensureRequestContext();
      const body = processReturnSchema.parse(await readBody(req));
      const result = await processReturn(body, context);
      sendSuccess(res, 200, result);
      return true;
    }
  } catch (error) {
    if (Number.isInteger(error?.statusCode)) {
      sendError(res, error.statusCode, error.message);
      return true;
    }

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
      message === 'Tenant membership is required'
      || message === 'Tenant membership is inactive'
      || message === 'Branch access is required'
    ) {
      sendError(res, 403, message);
      return true;
    }

    if (message === 'Tenant is not active') {
      sendError(res, 403, 'Tenant belum aktif. Menunggu approval admin.');
      return true;
    }

    if (message.startsWith('Tenant subscription')) {
      sendError(res, 403, 'Langganan toko tidak aktif atau sudah berakhir. Hubungi administrator.');
      return true;
    }

    if (message.startsWith('Feature not available in current plan:')) {
      sendError(res, 403, message);
      return true;
    }

    if (message.startsWith('Plan limit exceeded:')) {
      sendError(res, 409, message);
      return true;
    }

    if (message.includes(' is archived')) {
      sendError(res, 409, message);
      return true;
    }

    if (message.startsWith('Item changed after it was loaded')) {
      sendError(res, 409, message);
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
