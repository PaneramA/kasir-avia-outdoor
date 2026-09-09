import { Readable } from 'node:stream';
import { createHash } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { getEnv } from '../config/env.js';
import { createAccessToken } from '../auth/jwt.js';
import { hashPassword } from '../auth/password.js';
import {
  deleteRentalByAdmin,
  deleteTenantForPlatformAdmin,
  initDatabase,
  processReturn,
  rehashUserPassword,
} from '../data/db.js';
import { prisma } from '../data/prisma.js';
import { apiRoute } from './api.js';

const env = getEnv();

async function callApi(method, url, { token, tenantId, branchId, body } = {}) {
  const chunks = body === undefined ? [] : [Buffer.from(JSON.stringify(body))];
  const req = Readable.from(chunks);
  req.method = method;
  req.url = url;
  req.headers = {
    ...(token ? { authorization: `Bearer ${token}` } : {}),
    ...(tenantId ? { 'x-tenant-id': tenantId } : {}),
    ...(branchId ? { 'x-branch-id': branchId } : {}),
    ...(body === undefined ? {} : { 'content-type': 'application/json' }),
  };
  req.socket = { remoteAddress: '127.0.0.1' };

  let status = 0;
  let rawBody = '';
  const headers = new Map();
  const res = {
    setHeader(name, value) {
      headers.set(String(name).toLowerCase(), value);
    },
    writeHead(nextStatus, nextHeaders = {}) {
      status = nextStatus;
      Object.entries(nextHeaders).forEach(([name, value]) => headers.set(name.toLowerCase(), value));
    },
    end(value = '') {
      rawBody = String(value);
    },
  };

  const handled = await apiRoute(req, res, env);
  return {
    handled,
    status,
    headers,
    body: rawBody ? JSON.parse(rawBody) : null,
  };
}

function waitForBarrier(promise, label, timeoutMs = 5_000) {
  let timeoutId;
  const timeout = new Promise((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(`Timed out waiting for ${label}`)), timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timeoutId));
}

function installRentalRaceBarrier(rentalId, winnerTransactionIndex = 2) {
  const originalTransaction = prisma.$transaction.bind(prisma);
  let transactionIndex = 0;
  let initialReadCount = 0;
  let winnerClaimCount = 0;
  let releaseInitialReads;
  let releaseWinnerClaim;
  const initialReadsComplete = new Promise((resolve) => {
    releaseInitialReads = resolve;
  });
  const winnerClaimComplete = new Promise((resolve) => {
    releaseWinnerClaim = resolve;
  });

  const transactionSpy = vi.spyOn(prisma, '$transaction').mockImplementation(async (operation, options) => {
    if (typeof operation !== 'function') {
      return originalTransaction(operation, options);
    }

    transactionIndex += 1;
    const currentTransactionIndex = transactionIndex;
    return originalTransaction(async (tx) => {
      let interceptedInitialRead = false;
      const rentalDelegate = new Proxy(tx.rental, {
        get(target, property) {
          if (property === 'findUnique') {
            return async (args) => {
              const result = await target.findUnique(args);
              if (!interceptedInitialRead && args?.where?.id === rentalId) {
                interceptedInitialRead = true;
                initialReadCount += 1;
                if (initialReadCount === 2) {
                  releaseInitialReads();
                }
                await waitForBarrier(initialReadsComplete, 'both initial rental reads');
                if (currentTransactionIndex !== winnerTransactionIndex) {
                  await waitForBarrier(winnerClaimComplete, 'winning rental claim');
                }
              }
              return result;
            };
          }

          if (property === 'updateMany') {
            return async (args) => {
              const result = await target.updateMany(args);
              if (
                currentTransactionIndex === winnerTransactionIndex
                && args?.where?.id === rentalId
              ) {
                winnerClaimCount += 1;
                releaseWinnerClaim();
              }
              return result;
            };
          }

          const value = Reflect.get(target, property);
          return typeof value === 'function' ? value.bind(target) : value;
        },
      });
      const transactionProxy = new Proxy(tx, {
        get(target, property) {
          if (property === 'rental') {
            return rentalDelegate;
          }
          const value = Reflect.get(target, property);
          return typeof value === 'function' ? value.bind(target) : value;
        },
      });
      return operation(transactionProxy);
    }, options);
  });

  return {
    transactionSpy,
    getState: () => ({ transactionIndex, initialReadCount, winnerClaimCount }),
  };
}

beforeAll(async () => {
  await initDatabase(env);
  await prisma.user.deleteMany({
    where: {
      OR: [
        { username: { startsWith: 'vitest-' } },
        { username: { startsWith: 'owner-team-' } },
        { username: { startsWith: 'rental-admin-' } },
        { username: { startsWith: 'global-admin-team-' } },
      ],
      memberships: { none: {} },
      branchAccesses: { none: {} },
      deletedRentals: { none: {} },
      auditLogs: { none: {} },
    },
  });
}, 60_000);

afterAll(async () => {
  await prisma.$disconnect();
});

describe('critical API workflow integration', () => {
  it('onboards a tenant, survives three sequential rentals, and deletes all tenant data', async () => {
    const suffix = `${Date.now()}-${Math.floor(Math.random() * 10_000)}`;
    const adminUsername = env.adminUsername;
    const adminPassword = env.adminPassword;
    const storeName = `Vitest Store ${suffix}`;
    const ownerUsername = `vitest-owner-${suffix}`;
    const ownerPassword = `Owner!${suffix}`;
    let tenantId = '';
    let ownerUserId = '';
    let orphanUserId = '';
    const policyUserIds = [];

    try {
      const removedRegister = await callApi('POST', '/api/auth/register', {
        body: { username: 'blocked', password: 'blocked-password' },
      });
      expect(removedRegister).toMatchObject({ handled: true, status: 404 });

      const adminLogin = await callApi('POST', '/api/auth/login', {
        body: { username: adminUsername, password: adminPassword },
      });
      expect(adminLogin.status).toBe(200);
      const adminToken = adminLogin.body.data.token;

      const orphanUser = await prisma.user.create({
        data: {
          username: `vitest-orphan-${suffix}`,
          passwordHash: 'not-used',
          role: 'kasir',
        },
      });
      orphanUserId = orphanUser.id;
      const orphanToken = createAccessToken({
        sub: orphanUser.id,
        username: orphanUser.username,
        role: orphanUser.role,
      }, env);
      const orphanInventory = await callApi('GET', '/api/items', { token: orphanToken });
      expect(orphanInventory.status).toBe(403);
      expect(orphanInventory.body.message).toBe('Tenant membership is required');

      const plans = await callApi('GET', '/api/plans', { token: adminToken });
      expect(plans.status).toBe(200);
      const plan = plans.body.data.find((entry) => entry.code === 'growth');
      expect(plan?.id).toBeTruthy();

      const onboarding = await callApi('POST', '/api/admin/tenants/onboard', {
        token: adminToken,
        body: {
          storeName,
          storeSlug: `vitest-store-${suffix}`,
          tenantStatus: 'active',
          ownerUsername,
          ownerPassword,
          initialBranchCode: 'pusat',
          initialBranchName: 'Toko Pusat',
          planId: plan.id,
          subscriptionStatus: 'active',
          billingNotes: 'Vitest API integration',
        },
      });
      expect(onboarding.status).toBe(201);
      tenantId = onboarding.body.data.tenant.id;
      ownerUserId = onboarding.body.data.owner.id;
      const branchId = onboarding.body.data.initialBranch.id;

      const ownerLogin = await callApi('POST', '/api/auth/login', {
        body: { username: ownerUsername, password: ownerPassword },
      });
      expect(ownerLogin.status).toBe(200);
      const ownerToken = ownerLogin.body.data.token;

      const parallelOwnerLogins = await Promise.all(
        Array.from({ length: 4 }, () => callApi('POST', '/api/auth/login', {
          body: { username: ownerUsername, password: ownerPassword },
        })),
      );
      expect(parallelOwnerLogins.filter((response) => response.status === 200)).toHaveLength(1);
      expect(parallelOwnerLogins.filter((response) => response.status === 429)).toHaveLength(3);
      expect((await callApi('POST', '/api/auth/login', {
        body: { username: ownerUsername, password: ownerPassword },
      })).status).toBe(200);

      const legacyPassword = `Legacy!${suffix}`;
      const originalLegacyHash = createHash('sha256')
        .update(`${legacyPassword}:${env.passwordPepper}`)
        .digest('hex');
      const rehashRaceUser = await prisma.user.create({
        data: {
          username: `vitest-rehash-race-${suffix}`,
          passwordHash: originalLegacyHash,
          role: 'kasir',
        },
      });
      policyUserIds.push(rehashRaceUser.id);
      const newerPasswordHash = await hashPassword(`Newer!${suffix}`, env.passwordPepper);
      const pendingRehash = rehashUserPassword(
        rehashRaceUser.id,
        legacyPassword,
        env.passwordPepper,
        originalLegacyHash,
      );
      await prisma.user.update({
        where: { id: rehashRaceUser.id },
        data: { passwordHash: newerPasswordHash },
      });
      await pendingRehash;
      expect((await prisma.user.findUnique({
        where: { id: rehashRaceUser.id },
      })).passwordHash).toBe(newerPasswordHash);

      const cashierUser = await prisma.user.create({
        data: {
          username: `vitest-cashier-${suffix}`,
          passwordHash: 'not-used',
          role: 'kasir',
          memberships: {
            create: {
              tenantId,
              role: 'kasir',
              status: 'active',
            },
          },
          branchAccesses: {
            create: {
              branchId,
              role: 'kasir',
            },
          },
        },
      });
      policyUserIds.push(cashierUser.id);
      const cashierToken = createAccessToken({
        sub: cashierUser.id,
        username: cashierUser.username,
        role: cashierUser.role,
      }, env);
      const globalAdminUser = await prisma.user.create({
        data: {
          username: `vitest-global-admin-${suffix}`,
          passwordHash: 'not-used',
          role: 'admin',
          memberships: {
            create: {
              tenantId,
              role: 'kasir',
              status: 'active',
            },
          },
        },
      });
      policyUserIds.push(globalAdminUser.id);
      const globalAdminToken = createAccessToken({
        sub: globalAdminUser.id,
        username: globalAdminUser.username,
        role: globalAdminUser.role,
      }, env);
      const legacySuperuser = await prisma.user.create({
        data: {
          username: `vitest-legacy-superuser-${suffix}`,
          passwordHash: 'not-used',
          role: 'superuser',
          memberships: {
            create: {
              tenantId,
              role: 'kasir',
              status: 'active',
            },
          },
          branchAccesses: {
            create: {
              branchId,
              role: 'kasir',
            },
          },
        },
      });
      policyUserIds.push(legacySuperuser.id);
      const legacySuperuserToken = createAccessToken({
        sub: legacySuperuser.id,
        username: legacySuperuser.username,
        role: legacySuperuser.role,
      }, env);

      const originalMembershipFindUnique = prisma.userMembership.findUnique.bind(
        prisma.userMembership,
      );
      let cashierMembershipReads = 0;
      const membershipRevocationSpy = vi.spyOn(prisma.userMembership, 'findUnique')
        .mockImplementation(async (args) => {
          const result = await originalMembershipFindUnique(args);
          const key = args?.where?.userId_tenantId;
          if (key?.userId === cashierUser.id && key?.tenantId === tenantId) {
            cashierMembershipReads += 1;
            if (cashierMembershipReads === 1) {
              await prisma.userMembership.update({
                where: { id: result.id },
                data: { status: 'inactive' },
              });
            }
          }
          return result;
        });
      try {
        const revokedContext = await callApi('GET', '/api/items', {
          token: cashierToken,
          tenantId,
          branchId,
        });
        expect(revokedContext.status).toBe(403);
      } finally {
        membershipRevocationSpy.mockRestore();
        await prisma.userMembership.update({
          where: { userId_tenantId: { userId: cashierUser.id, tenantId } },
          data: { status: 'active' },
        });
      }

      const tenantAdminUser = await prisma.user.create({
        data: {
          username: `vitest-tenant-admin-${suffix}`,
          passwordHash: 'not-used',
          role: 'kasir',
          memberships: {
            create: {
              tenantId,
              role: 'admin',
              status: 'active',
            },
          },
        },
      });
      policyUserIds.push(tenantAdminUser.id);
      const tenantAdminToken = createAccessToken({
        sub: tenantAdminUser.id,
        username: tenantAdminUser.username,
        role: tenantAdminUser.role,
      }, env);
      const ownerMembership = await prisma.userMembership.findUnique({
        where: { userId_tenantId: { userId: ownerUserId, tenantId } },
      });
      expect(ownerMembership).toBeTruthy();

      const adminOwnerMutation = await callApi('POST', '/api/tenant-memberships', {
        token: tenantAdminToken,
        body: {
          tenantId,
          userId: ownerUserId,
          role: 'kasir',
          status: 'active',
        },
      });
      expect(adminOwnerMutation.status).toBe(403);
      expect(await prisma.userMembership.findUnique({
        where: { id: ownerMembership.id },
      })).toMatchObject({ role: 'owner', status: 'active' });

      const lastOwnerUpsert = await callApi('POST', '/api/tenant-memberships', {
        token: ownerToken,
        body: {
          tenantId,
          userId: ownerUserId,
          role: 'kasir',
          status: 'active',
        },
      });
      expect(lastOwnerUpsert.status).toBe(409);
      const lastOwnerPatch = await callApi(
        'PATCH',
        `/api/tenant-memberships/${ownerMembership.id}`,
        {
          token: ownerToken,
          tenantId,
          branchId,
          body: { status: 'inactive' },
        },
      );
      expect(lastOwnerPatch.status).toBe(409);

      const membershipTarget = await prisma.user.create({
        data: {
          username: `vitest-membership-target-${suffix}`,
          passwordHash: 'not-used',
          role: 'kasir',
        },
      });
      const branchTarget = await prisma.user.create({
        data: {
          username: `vitest-branch-target-${suffix}`,
          passwordHash: 'not-used',
          role: 'kasir',
        },
      });
      policyUserIds.push(membershipTarget.id, branchTarget.id);
      const canManageStaffFeature = await prisma.planFeature.findUnique({
        where: { planId_key: { planId: plan.id, key: 'canManageStaff' } },
      });
      expect(canManageStaffFeature).toBeTruthy();
      await prisma.planFeature.update({
        where: { id: canManageStaffFeature.id },
        data: { valueJson: false },
      });
      try {
        const disabledMembershipUpsert = await callApi('POST', '/api/tenant-memberships', {
          token: ownerToken,
          body: {
            tenantId,
            userId: membershipTarget.id,
            role: 'kasir',
            status: 'active',
          },
        });
        expect(disabledMembershipUpsert.status).toBe(403);
        const disabledBranchAccess = await callApi('POST', '/api/branch-access', {
          token: ownerToken,
          body: {
            tenantId,
            userId: branchTarget.id,
            branchId,
            role: 'kasir',
          },
        });
        expect(disabledBranchAccess.status).toBe(403);
      } finally {
        await prisma.planFeature.update({
          where: { id: canManageStaffFeature.id },
          data: { valueJson: true },
        });
      }
      expect(await prisma.userMembership.count({
        where: { userId: { in: [membershipTarget.id, branchTarget.id] }, tenantId },
      })).toBe(0);

      const maxTenantUsersFeature = await prisma.planFeature.findUnique({
        where: { planId_key: { planId: plan.id, key: 'maxTenantUsers' } },
      });
      expect(maxTenantUsersFeature).toBeTruthy();
      const activeMembershipCount = await prisma.userMembership.count({
        where: { tenantId, status: 'active' },
      });
      await prisma.planFeature.update({
        where: { id: maxTenantUsersFeature.id },
        data: { valueJson: activeMembershipCount },
      });
      try {
        const limitedMembershipUpsert = await callApi('POST', '/api/tenant-memberships', {
          token: ownerToken,
          body: {
            tenantId,
            userId: membershipTarget.id,
            role: 'kasir',
            status: 'active',
          },
        });
        expect(limitedMembershipUpsert.status).toBe(409);
        const limitedBranchAccess = await callApi('POST', '/api/branch-access', {
          token: ownerToken,
          body: {
            tenantId,
            userId: branchTarget.id,
            branchId,
            role: 'kasir',
          },
        });
        expect(limitedBranchAccess.status).toBe(409);
      } finally {
        await prisma.planFeature.update({
          where: { id: maxTenantUsersFeature.id },
          data: { valueJson: maxTenantUsersFeature.valueJson },
        });
      }

      const concurrentStaffUsers = await Promise.all([
        prisma.user.create({
          data: {
            username: `vitest-concurrent-staff-a-${suffix}`,
            passwordHash: 'not-used',
            role: 'kasir',
          },
        }),
        prisma.user.create({
          data: {
            username: `vitest-concurrent-staff-b-${suffix}`,
            passwordHash: 'not-used',
            role: 'kasir',
          },
        }),
      ]);
      policyUserIds.push(...concurrentStaffUsers.map((user) => user.id));
      const concurrentLimit = (await prisma.userMembership.count({
        where: { tenantId, status: 'active' },
      })) + 1;
      await prisma.planFeature.update({
        where: { id: maxTenantUsersFeature.id },
        data: { valueJson: concurrentLimit },
      });
      const originalMembershipCount = prisma.userMembership.count.bind(prisma.userMembership);
      const originalTransaction = prisma.$transaction.bind(prisma);
      let tenantLockCount = 0;
      const transactionSpy = vi.spyOn(prisma, '$transaction').mockImplementation((operation, options) => {
        if (typeof operation !== 'function') {
          return originalTransaction(operation, options);
        }
        return originalTransaction(async (tx) => operation(new Proxy(tx, {
          get(target, property) {
            if (property === '$queryRaw') {
              return (...args) => {
                tenantLockCount += 1;
                return target.$queryRaw(...args);
              };
            }
            const value = Reflect.get(target, property);
            return typeof value === 'function' ? value.bind(target) : value;
          },
        })), options);
      });
      let matchingCountCalls = 0;
      let releaseSecondCount;
      const secondCountReached = new Promise((resolve) => {
        releaseSecondCount = resolve;
      });
      const membershipCountSpy = vi.spyOn(prisma.userMembership, 'count')
        .mockImplementation(async (args) => {
          const result = await originalMembershipCount(args);
          if (
            args?.where?.tenantId === tenantId
            && args?.where?.status === 'active'
            && !args?.where?.userId
          ) {
            matchingCountCalls += 1;
            if (matchingCountCalls === 1) {
              await Promise.race([
                secondCountReached,
                new Promise((resolve) => setTimeout(resolve, 250)),
              ]);
            } else if (matchingCountCalls === 2) {
              releaseSecondCount();
            }
          }
          return result;
        });
      try {
        const concurrentMembershipResults = await Promise.all(
          concurrentStaffUsers.map((user) => callApi('POST', '/api/tenant-memberships', {
            token: ownerToken,
            body: {
              tenantId,
              userId: user.id,
              role: 'kasir',
              status: 'active',
            },
          })),
        );
        const concurrentMembershipStatuses = concurrentMembershipResults
          .map((result) => result.status)
          .sort();
        const concurrentMembershipDiagnostics = concurrentMembershipResults.map((result) => ({
          status: result.status,
          message: result.body?.message,
        }));
        expect(
          concurrentMembershipStatuses,
          JSON.stringify(concurrentMembershipDiagnostics),
        ).toEqual([201, 409]);
        expect(tenantLockCount).toBe(2);
        membershipCountSpy.mockRestore();
        transactionSpy.mockRestore();
        expect(await prisma.userMembership.count({
          where: {
            tenantId,
            userId: { in: concurrentStaffUsers.map((user) => user.id) },
            status: 'active',
          },
        })).toBe(1);
      } finally {
        membershipCountSpy.mockRestore();
        transactionSpy.mockRestore();
        await prisma.planFeature.update({
          where: { id: maxTenantUsersFeature.id },
          data: { valueJson: maxTenantUsersFeature.valueJson },
        });
      }

      const inactiveOwnerUser = await prisma.user.create({
        data: {
          username: `vitest-inactive-owner-${suffix}`,
          passwordHash: 'not-used',
          role: 'kasir',
          memberships: {
            create: { tenantId, role: 'owner', status: 'inactive' },
          },
        },
      });
      policyUserIds.push(inactiveOwnerUser.id);
      const ownerBranchReactivation = await callApi('POST', '/api/branch-access', {
        token: ownerToken,
        body: {
          tenantId,
          userId: inactiveOwnerUser.id,
          branchId,
          role: 'kasir',
        },
      });
      expect(ownerBranchReactivation.status).toBe(403);
      expect(await prisma.userMembership.findUnique({
        where: { userId_tenantId: { userId: inactiveOwnerUser.id, tenantId } },
      })).toMatchObject({ role: 'owner', status: 'inactive' });

      const financialFeature = await prisma.planFeature.findUnique({
        where: {
          planId_key: {
            planId: plan.id,
            key: 'canUseFinancialRecap',
          },
        },
      });
      expect(financialFeature).toBeTruthy();
      await prisma.planFeature.update({
        where: { id: financialFeature.id },
        data: { valueJson: false },
      });
      try {
        const disabledFinancial = await callApi('GET', '/api/financial/recap', {
          token: ownerToken,
          tenantId,
          branchId,
        });
        expect(disabledFinancial.status).toBe(403);
      } finally {
        await prisma.planFeature.update({
          where: { id: financialFeature.id },
          data: { valueJson: true },
        });
      }

      expect((await callApi('PATCH', `/api/tenants/${tenantId}`, {
        token: adminToken,
        body: { status: 'suspended' },
      })).status).toBe(200);
      try {
        const suspendedOperationalAccess = await callApi('GET', '/api/items', {
          token: adminToken,
          tenantId,
          branchId,
        });
        expect(suspendedOperationalAccess.status).toBe(403);
        const suspendedManagementAccess = await callApi('GET', '/api/tenants', {
          token: adminToken,
        });
        expect(suspendedManagementAccess.status).toBe(200);
        expect(suspendedManagementAccess.body.data).toEqual(expect.arrayContaining([
          expect.objectContaining({ id: tenantId, status: 'suspended' }),
        ]));
      } finally {
        await callApi('PATCH', `/api/tenants/${tenantId}`, {
          token: adminToken,
          body: { status: 'active' },
        });
      }

      const ownerTenants = await callApi('GET', '/api/tenants', { token: ownerToken });
      expect(ownerTenants.status).toBe(200);
      expect(ownerTenants.body.data.map((tenant) => tenant.id)).toEqual([tenantId]);
      expect(ownerTenants.body.data[0]).toMatchObject({
        membershipRole: 'owner',
        membershipStatus: 'active',
      });

      const itemResponse = await callApi('POST', '/api/items', {
        token: ownerToken,
        tenantId,
        branchId,
        body: { name: 'Tenda Vitest', category: 'Tenda', stock: 10, price: 50_000, image: '' },
      });
      expect(itemResponse.status).toBe(201);
      const itemId = itemResponse.body.data.id;
      expect(itemResponse.body.data.updatedAt).toEqual(expect.any(String));

      const noScopeInventory = await callApi('GET', '/api/items', { token: ownerToken });
      expect(noScopeInventory.status).toBe(200);
      const noScopeItemDelete = await callApi('DELETE', `/api/items/${itemId}`, {
        token: ownerToken,
      });
      expect(noScopeItemDelete.status).toBe(400);
      expect((await prisma.item.findUnique({ where: { id: itemId } })).archivedAt).toBeNull();
      const noScopeTenantSettings = await callApi('PATCH', '/api/tenants/current/settings', {
        token: ownerToken,
        body: { phone: '080000000001' },
      });
      expect(noScopeTenantSettings.status).toBe(400);
      expect((await callApi('GET', '/api/tenants/current/settings', {
        token: ownerToken,
      })).status).toBe(400);
      expect((await callApi('GET', '/api/branches/current/settings', {
        token: ownerToken,
        tenantId,
      })).status).toBe(400);
      const noBranchSettings = await callApi('PATCH', '/api/branches/current/settings', {
        token: ownerToken,
        tenantId,
        body: { phone: '080000000002' },
      });
      expect(noBranchSettings.status).toBe(400);
      expect((await callApi('PATCH', `/api/tenants/${tenantId}/settings`, {
        token: ownerToken,
        body: { phone: '080000000003' },
      })).status).toBe(200);
      expect((await callApi('PATCH', `/api/branches/${branchId}/settings`, {
        token: ownerToken,
        body: { phone: '080000000004' },
      })).status).toBe(200);

      const cashierItemDelete = await callApi('DELETE', `/api/items/${itemId}`, {
        token: cashierToken, tenantId, branchId,
      });
      expect(cashierItemDelete.status).toBe(403);

      const categoryName = `Category ${suffix}`;
      const categoryResponse = await callApi('POST', '/api/categories', {
        token: ownerToken,
        tenantId,
        branchId,
        body: { name: categoryName },
      });
      expect(categoryResponse.status).toBe(201);
      const cashierCategoryDelete = await callApi(
        'DELETE',
        `/api/categories/${encodeURIComponent(categoryName)}`,
        { token: cashierToken, tenantId, branchId },
      );
      expect(cashierCategoryDelete.status).toBe(403);
      const ownerCategoryDelete = await callApi(
        'DELETE',
        `/api/categories/${encodeURIComponent(categoryName)}`,
        { token: ownerToken, tenantId, branchId },
      );
      expect(ownerCategoryDelete.status).toBe(200);

      const platformCategoryName = `Platform Category ${suffix}`;
      expect((await callApi('POST', '/api/categories', {
        token: ownerToken,
        tenantId,
        branchId,
        body: { name: platformCategoryName },
      })).status).toBe(201);
      const platformCategoryDelete = await callApi(
        'DELETE',
        `/api/categories/${encodeURIComponent(platformCategoryName)}`,
        { token: adminToken, tenantId, branchId },
      );
      expect(platformCategoryDelete.status).toBe(200);

      const globalAdminCategoryName = `Global Admin Category ${suffix}`;
      expect((await callApi('POST', '/api/categories', {
        token: ownerToken,
        tenantId,
        branchId,
        body: { name: globalAdminCategoryName },
      })).status).toBe(201);
      const globalAdminCategoryDelete = await callApi(
        'DELETE',
        `/api/categories/${encodeURIComponent(globalAdminCategoryName)}`,
        { token: globalAdminToken, tenantId, branchId },
      );
      expect(globalAdminCategoryDelete.status).toBe(200);

      const legacySuperuserCategoryName = `Legacy Superuser Category ${suffix}`;
      expect((await callApi('POST', '/api/categories', {
        token: ownerToken,
        tenantId,
        branchId,
        body: { name: legacySuperuserCategoryName },
      })).status).toBe(201);
      const legacySuperuserCategoryDelete = await callApi(
        'DELETE',
        `/api/categories/${encodeURIComponent(legacySuperuserCategoryName)}`,
        { token: legacySuperuserToken, tenantId, branchId },
      );
      expect(legacySuperuserCategoryDelete.status).toBe(403);
      expect((await callApi(
        'DELETE',
        `/api/categories/${encodeURIComponent(legacySuperuserCategoryName)}`,
        { token: ownerToken, tenantId, branchId },
      )).status).toBe(200);

      const customerResponse = await callApi('POST', '/api/customers', {
        token: ownerToken,
        tenantId,
        branchId,
        body: {
          name: `Customer Delete ${suffix}`,
          phone: `0813${String(Date.now()).slice(-8)}`,
          guarantee: 'KTP',
        },
      });
      expect(customerResponse.status).toBe(201);
      const customerId = customerResponse.body.data.id;
      const cashierCustomerDelete = await callApi('DELETE', `/api/customers/${customerId}`, {
        token: cashierToken, tenantId, branchId,
      });
      expect(cashierCustomerDelete.status).toBe(403);
      const ownerCustomerDelete = await callApi('DELETE', `/api/customers/${customerId}`, {
        token: ownerToken, tenantId, branchId,
      });
      expect(ownerCustomerDelete.status).toBe(200);

      const cashierSettingsUpdate = await callApi('PATCH', '/api/tenants/current/settings', {
        token: cashierToken,
        tenantId,
        branchId,
        body: { phone: '081234567890', dashboardName: 'AVO#2026' },
      });
      expect(cashierSettingsUpdate.status).toBe(403);
      const ownerSettingsUpdate = await callApi('PATCH', '/api/tenants/current/settings', {
        token: ownerToken,
        tenantId,
        branchId,
        body: { phone: '081234567890', dashboardName: 'AVO#2026' },
      });
      expect(ownerSettingsUpdate.status).toBe(200);
      expect(ownerSettingsUpdate.body.data.dashboardName).toBe('AVO#2026');
      expect((await callApi('GET', '/api/tenants/current/settings', {
        token: ownerToken,
        tenantId,
        branchId,
      })).body.data.dashboardName).toBe('AVO#2026');

      const cashierBranchSettingsUpdate = await callApi('PATCH', '/api/branches/current/settings', {
        token: cashierToken,
        tenantId,
        branchId,
        body: { phone: '089999999999' },
      });
      expect(cashierBranchSettingsUpdate.status).toBe(403);
      const ownerBranchSettingsUpdate = await callApi('PATCH', '/api/branches/current/settings', {
        token: ownerToken,
        tenantId,
        branchId,
        body: { phone: '089999999999' },
      });
      expect(ownerBranchSettingsUpdate.status).toBe(200);

      const cashierTeamUpdate = await callApi('POST', '/api/users/tenant', {
        token: cashierToken,
        tenantId,
        branchId,
        body: {
          username: `blocked-team-${suffix}`,
          password: `Blocked!${suffix}`,
          tenantRole: 'kasir',
        },
      });
      expect(cashierTeamUpdate.status).toBe(403);
      const ownerTeamUpdate = await callApi('POST', '/api/users/tenant', {
        token: ownerToken,
        tenantId,
        branchId,
        body: {
          username: `owner-team-${suffix}`,
          password: `Created!${suffix}`,
          tenantRole: 'kasir',
        },
      });
      expect(ownerTeamUpdate.status).toBe(201);
      policyUserIds.push(ownerTeamUpdate.body.data.id);

      const rentalAdminUsername = `rental-admin-${suffix}`;
      const rentalAdminPassword = `RentalAdmin!${suffix}`;
      const rentalAdminCreate = await callApi('POST', '/api/users/tenant', {
        token: ownerToken,
        body: {
          tenantId,
          username: rentalAdminUsername,
          password: rentalAdminPassword,
          tenantRole: 'admin',
        },
      });
      expect(rentalAdminCreate.status).toBe(201);
      policyUserIds.push(rentalAdminCreate.body.data.id);
      const rentalAdminLogin = await callApi('POST', '/api/auth/login', {
        body: { username: rentalAdminUsername, password: rentalAdminPassword },
      });
      expect(rentalAdminLogin.status).toBe(200);
      const rentalAdminToken = rentalAdminLogin.body.data.token;

      const globalAdminTeamUpdate = await callApi('POST', '/api/users/tenant', {
        token: globalAdminToken,
        body: {
          tenantId,
          username: `global-admin-team-${suffix}`,
          password: `GlobalAdmin!${suffix}`,
          tenantRole: 'kasir',
        },
      });
      expect(globalAdminTeamUpdate.status).toBe(201);
      policyUserIds.push(globalAdminTeamUpdate.body.data.id);

      await prisma.item.update({
        where: { id: itemId },
        data: {
          updatedAt: new Date(new Date(itemResponse.body.data.updatedAt).getTime() + 1_000),
        },
      });
      const staleItemUpdate = await callApi('PATCH', `/api/items/${itemId}`, {
        token: ownerToken,
        tenantId,
        branchId,
        body: {
          name: 'Tenda Vitest Lama',
          category: 'Tenda',
          stock: 99,
          price: 50_000,
          image: '',
          expectedUpdatedAt: itemResponse.body.data.updatedAt,
        },
      });
      expect(staleItemUpdate.status, JSON.stringify(staleItemUpdate.body)).toBe(409);
      expect(staleItemUpdate.body.message).toContain('changed');
      expect((await prisma.item.findUnique({ where: { id: itemId } })).stock).toBe(10);

      const secondItemResponse = await callApi('POST', '/api/items', {
        token: ownerToken,
        tenantId,
        branchId,
        body: { name: 'Tenda Cadangan', category: 'Tenda', stock: 2, price: 40_000, image: '' },
      });
      expect(secondItemResponse.status).toBe(201);
      const secondItemId = secondItemResponse.body.data.id;

      const archivedAt = new Date('2026-07-22T00:00:00.000Z');
      const archivedItem = await prisma.item.update({
        where: { id: secondItemId },
        data: { archivedAt },
      });
      expect(archivedItem.archivedAt).toEqual(archivedAt);
      const restoredItem = await prisma.item.update({
        where: { id: secondItemId },
        data: { archivedAt: null },
      });
      expect(restoredItem.archivedAt).toBeNull();
      const persistedItem = await prisma.item.findUnique({
        where: { id: secondItemId },
      });
      expect(persistedItem.archivedAt).toBeNull();

      const inventoryFirstPage = await callApi('GET', '/api/items/page?limit=1&query=Tenda', {
        token: ownerToken, tenantId, branchId,
      });
      expect(inventoryFirstPage.status).toBe(200);
      expect(inventoryFirstPage.body.data.items).toHaveLength(1);
      expect(inventoryFirstPage.body.data.nextCursor).toBeTruthy();
      const inventorySecondPage = await callApi(
        'GET',
        `/api/items/page?limit=1&query=Tenda&cursor=${encodeURIComponent(inventoryFirstPage.body.data.nextCursor)}`,
        { token: ownerToken, tenantId, branchId },
      );
      expect(inventorySecondPage.status).toBe(200);
      expect(inventorySecondPage.body.data.items).toHaveLength(1);
      expect(inventorySecondPage.body.data.nextCursor).toBeNull();
      expect([
        ...inventoryFirstPage.body.data.items,
        ...inventorySecondPage.body.data.items,
      ].map((item) => item.id).sort()).toEqual([itemId, secondItemId].sort());

      for (let index = 1; index <= 3; index += 1) {
        const identityCardHeld = index !== 1;
        const rental = await callApi('POST', '/api/rentals', {
          token: ownerToken,
          tenantId,
          branchId,
          body: {
            customer: {
              name: `Customer ${index}`,
              phone: `0812000000${index}`,
              address: 'Alamat Vitest',
              guarantee: 'KTP',
            },
            identityCardHeld,
            items: [{ id: itemId, qty: 1 }],
            duration: 1,
            rentalStartAt: `2026-07-${String(10 + index).padStart(2, '0')}T02:00:00.000Z`,
            payment: { status: 'LUNAS', method: 'TUNAI', paidAmount: 50_000 },
          },
        });
        expect(rental.status, `rental ke-${index} gagal: ${rental.body?.message || ''}`).toBe(201);
        expect(rental.body.data.customer.identityCardHeld).toBe(identityCardHeld);
      }

      const ownerDeleteRental = await callApi('POST', '/api/rentals', {
        token: ownerToken,
        tenantId,
        branchId,
        body: {
          customer: { name: 'Owner Delete', phone: '081277777761', guarantee: 'KTP' },
          items: [{ id: secondItemId, qty: 1 }],
          duration: 1,
          payment: { status: 'LUNAS', method: 'TUNAI', paidAmount: 40_000 },
        },
      });
      expect(ownerDeleteRental.status).toBe(201);
      const ownerDeleteRentalId = ownerDeleteRental.body.data.id;
      const cashierDeleteVerify = await callApi(
        'POST',
        `/api/rentals/${ownerDeleteRentalId}/delete-verify`,
        {
          token: cashierToken,
          tenantId,
          branchId,
          body: { password: 'not-used' },
        },
      );
      expect(cashierDeleteVerify.status).toBe(403);
      const ownerDeleteVerifyWithoutScope = await callApi(
        'POST',
        `/api/rentals/${ownerDeleteRentalId}/delete-verify`,
        {
          token: ownerToken,
          body: { password: ownerPassword },
        },
      );
      expect(ownerDeleteVerifyWithoutScope.status).toBe(400);
      const ownerDeleteVerify = await callApi(
        'POST',
        `/api/rentals/${ownerDeleteRentalId}/delete-verify`,
        {
          token: ownerToken,
          tenantId,
          branchId,
          body: { password: ownerPassword },
        },
      );
      expect(ownerDeleteVerify.status).toBe(200);
      const ownerRentalDeleteWithoutBranch = await callApi(
        'DELETE',
        `/api/rentals/${ownerDeleteRentalId}`,
        {
          token: ownerToken,
          tenantId,
          body: {
            reason: 'Missing scope test',
            confirmationText: `HAPUS ${ownerDeleteRentalId}`,
          },
        },
      );
      expect(ownerRentalDeleteWithoutBranch.status).toBe(400);
      const ownerRentalDelete = await callApi('DELETE', `/api/rentals/${ownerDeleteRentalId}`, {
        token: ownerToken,
        tenantId,
        branchId,
        body: {
          reason: 'Owner authorization test',
          confirmationText: `HAPUS ${ownerDeleteRentalId}`,
        },
      });
      expect(ownerRentalDelete.status).toBe(200);

      const adminDeleteRental = await callApi('POST', '/api/rentals', {
        token: ownerToken,
        tenantId,
        branchId,
        body: {
          customer: { name: 'Admin Delete', phone: '081277777762', guarantee: 'KTP' },
          items: [{ id: secondItemId, qty: 1 }],
          duration: 1,
          payment: { status: 'LUNAS', method: 'TUNAI', paidAmount: 40_000 },
        },
      });
      expect(adminDeleteRental.status).toBe(201);
      const adminDeleteRentalId = adminDeleteRental.body.data.id;
      expect((await callApi(
        'POST',
        `/api/rentals/${adminDeleteRentalId}/delete-verify`,
        {
          token: rentalAdminToken,
          tenantId,
          branchId,
          body: { password: rentalAdminPassword },
        },
      )).status).toBe(200);
      expect((await callApi('DELETE', `/api/rentals/${adminDeleteRentalId}`, {
        token: rentalAdminToken,
        tenantId,
        branchId,
        body: {
          reason: 'Admin authorization test',
          confirmationText: `HAPUS ${adminDeleteRentalId}`,
        },
      })).status).toBe(200);

      await prisma.item.update({
        where: { id: secondItemId },
        data: { branchId: null },
      });
      const tenantWideCheckout = await callApi('POST', '/api/rentals', {
        token: ownerToken,
        tenantId,
        branchId,
        body: {
          customer: {
            name: 'Customer Tenant Wide',
            phone: '081288888888',
            address: 'Alamat Tenant',
            guarantee: 'KTP',
          },
          items: [{ id: secondItemId, qty: 1 }],
          duration: 1,
          payment: { status: 'LUNAS', method: 'TUNAI', paidAmount: 40_000 },
        },
      });
      expect(tenantWideCheckout.status).toBe(201);
      await prisma.$transaction([
        prisma.item.update({
          where: { id: secondItemId },
          data: { stock: { increment: 1 } },
        }),
        prisma.rental.delete({
          where: { id: tenantWideCheckout.body.data.id },
        }),
      ]);

      const rentalItemCountBeforeArchive = await prisma.rentalItem.count({
        where: { itemId },
      });
      const archived = await callApi('DELETE', `/api/items/${itemId}`, {
        token: ownerToken, tenantId, branchId,
      });
      expect(archived.status).toBe(200);
      expect(archived.body.data.archivedAt).toBeTruthy();
      expect(await prisma.rentalItem.count({ where: { itemId } })).toBe(rentalItemCountBeforeArchive);
      expect(await prisma.auditLog.count({
        where: { action: 'item.archive', targetId: itemId },
      })).toBe(1);

      const activeItems = await callApi('GET', '/api/items', {
        token: ownerToken, tenantId, branchId,
      });
      expect(activeItems.status).toBe(200);
      expect(activeItems.body.data.some((item) => item.id === itemId)).toBe(false);

      const dashboardWithArchivedItem = await callApi('GET', '/api/dashboard/summary', {
        token: ownerToken, tenantId, branchId,
      });
      expect(dashboardWithArchivedItem.status).toBe(200);
      expect(dashboardWithArchivedItem.body.data.stats.availableStock).toBe(2);

      const archivedItems = await callApi('GET', '/api/items/page?status=archived', {
        token: ownerToken, tenantId, branchId,
      });
      expect(archivedItems.status).toBe(200);
      expect(archivedItems.body.data.items).toEqual([
        expect.objectContaining({ id: itemId, archivedAt: expect.any(String) }),
      ]);

      const archivedCheckout = await callApi('POST', '/api/rentals', {
        token: ownerToken,
        tenantId,
        branchId,
        body: {
          customer: {
            name: 'Customer Archived',
            phone: '081299999999',
            address: 'Alamat Arsip',
            guarantee: 'KTP',
          },
          items: [{ id: itemId, qty: 1 }],
          duration: 1,
          payment: { status: 'LUNAS', method: 'TUNAI', paidAmount: 50_000 },
        },
      });
      expect(archivedCheckout.status).toBe(409);
      expect(archivedCheckout.body.message).toContain('archived');
      expect(await prisma.rental.count({ where: { tenantId, branchId, deletedAt: null } })).toBe(3);

      const restored = await callApi('POST', `/api/items/${itemId}/restore`, {
        token: ownerToken, tenantId, branchId,
      });
      expect(restored.status).toBe(200);
      expect(restored.body.data.archivedAt).toBeNull();
      expect(await prisma.auditLog.count({
        where: { action: 'item.restore', targetId: itemId },
      })).toBe(1);

      const rentals = await callApi('GET', '/api/rentals', {
        token: ownerToken, tenantId, branchId,
      });
      expect(rentals.status).toBe(200);
      expect(rentals.body.data).toHaveLength(3);

      const rentalHistory = await callApi('GET', '/api/rentals/history?limit=2', {
        token: ownerToken, tenantId, branchId,
      });
      expect(rentalHistory.status).toBe(200);
      expect(rentalHistory.body.data.items).toHaveLength(2);
      expect(rentalHistory.body.data.nextCursor).toBeTruthy();
      expect(rentalHistory.body.data.summary).toMatchObject({
        totalTransactions: 3,
        activeTransactions: 3,
        returnedTransactions: 0,
        totalRevenue: 150_000,
      });

      const nextRentalHistory = await callApi(
        'GET',
        `/api/rentals/history?limit=2&cursor=${encodeURIComponent(rentalHistory.body.data.nextCursor)}`,
        { token: ownerToken, tenantId, branchId },
      );
      expect(nextRentalHistory.status).toBe(200);
      expect(nextRentalHistory.body.data.items).toHaveLength(1);
      expect(nextRentalHistory.body.data.nextCursor).toBeNull();

      const dashboardSummary = await callApi('GET', '/api/dashboard/summary', {
        token: ownerToken, tenantId, branchId,
      });
      expect(dashboardSummary.status).toBe(200);
      const dashboardPeriod = dashboardSummary.body.data.period;
      const dashboardRevenue = ['2026-07-11', '2026-07-12', '2026-07-13']
        .filter((dateKey) => dateKey >= dashboardPeriod.startDate && dateKey <= dashboardPeriod.endDate)
        .length * 50_000;
      expect(dashboardSummary.body.data).toMatchObject({
        stats: {
          availableStock: 9,
          activeRentals: 3,
          itemsOut: 3,
          revenue: dashboardRevenue,
        },
      });
      expect(dashboardSummary.body.data.recentRentals).toHaveLength(3);

      const financialRecap = await callApi('GET', '/api/financial/recap?limit=2', {
        token: ownerToken, tenantId, branchId,
      });
      expect(financialRecap.status).toBe(200);
      expect(financialRecap.body.data.items).toHaveLength(2);
      expect(financialRecap.body.data.nextCursor).toBeTruthy();
      expect(financialRecap.body.data.summary).toMatchObject({
        totalRevenue: 150_000,
        invoiceRevenue: 150_000,
        cashReceived: 150_000,
        receivables: 0,
        totalExpenses: 0,
        netProfit: 150_000,
        totalTransactions: 3,
        averageTransaction: 50_000,
      });
      expect(financialRecap.body.data.summary.methods).toEqual([
        expect.objectContaining({ method: 'TUNAI', count: 3, revenue: 150_000 }),
      ]);

      const cashierExpenseCreate = await callApi('POST', '/api/expenses', {
        token: cashierToken,
        tenantId,
        branchId,
        body: {
          date: '2026-07-30',
          category: 'Operasional',
          description: 'Tes kasir',
          amount: 10_000,
          paymentMethod: 'TUNAI',
        },
      });
      expect(cashierExpenseCreate.status).toBe(403);

      const createdExpense = await callApi('POST', '/api/expenses', {
        token: ownerToken,
        tenantId,
        branchId,
        body: {
          date: '2026-07-30',
          category: 'Laundry',
          description: 'Cuci tenda',
          amount: 25_000,
          paymentMethod: 'TUNAI',
          notes: 'Setelah sewa weekend',
        },
      });
      expect(createdExpense.status).toBe(201);
      expect(createdExpense.body.data).toMatchObject({
        category: 'Laundry',
        description: 'Cuci tenda',
        amount: 25_000,
        paymentMethod: 'TUNAI',
      });

      const otherExpense = await callApi('POST', '/api/expenses', {
        token: ownerToken,
        tenantId,
        branchId,
        body: {
          date: '2026-07-29',
          category: 'Operasional',
          description: 'Beli gas',
          amount: 15_000,
          paymentMethod: 'BANK',
          notes: 'Dapur',
        },
      });
      expect(otherExpense.status).toBe(201);

      const listedExpenses = await callApi('GET', '/api/expenses?startDate=2026-07-01&endDate=2026-07-31&q=tenda', {
        token: ownerToken,
        tenantId,
        branchId,
      });
      expect(listedExpenses.status).toBe(200);
      expect(listedExpenses.body.data.items.map((expense) => expense.id)).toContain(createdExpense.body.data.id);
      expect(listedExpenses.body.data.items.map((expense) => expense.id)).not.toContain(otherExpense.body.data.id);
      expect(listedExpenses.body.data.summary).toMatchObject({
        totalExpenses: 40_000,
        categories: [
          { category: 'Laundry', amount: 25_000, count: 1 },
          { category: 'Operasional', amount: 15_000, count: 1 },
        ],
      });

      const emptySearchExpenses = await callApi('GET', '/api/expenses?startDate=2026-07-01&endDate=2026-07-31&q=tidak-ada', {
        token: ownerToken,
        tenantId,
        branchId,
      });
      expect(emptySearchExpenses.status).toBe(200);
      expect(emptySearchExpenses.body.data.items).toEqual([]);
      expect(emptySearchExpenses.body.data.summary).toMatchObject({
        totalExpenses: 40_000,
        categories: [
          { category: 'Laundry', amount: 25_000, count: 1 },
          { category: 'Operasional', amount: 15_000, count: 1 },
        ],
      });

      const updatedExpense = await callApi('PATCH', `/api/expenses/${createdExpense.body.data.id}`, {
        token: ownerToken,
        tenantId,
        branchId,
        body: {
          date: '2026-07-31',
          category: 'Repair',
          description: 'Ganti frame tenda',
          amount: 60_000,
          paymentMethod: 'QRIS',
          notes: 'Naik karena sparepart',
        },
      });
      expect(updatedExpense.status).toBe(200);
      expect(updatedExpense.body.data).toMatchObject({
        id: createdExpense.body.data.id,
        category: 'Repair',
        amount: 60_000,
        paymentMethod: 'QRIS',
      });

      const expenseSearchWithoutRows = await callApi('GET', '/api/expenses?startDate=2026-07-01&endDate=2026-07-31&q=tidak-ada', {
        token: ownerToken,
        tenantId,
        branchId,
      });
      expect(expenseSearchWithoutRows.status).toBe(200);
      expect(expenseSearchWithoutRows.body.data.items).toHaveLength(0);
      expect(expenseSearchWithoutRows.body.data.summary).toMatchObject({
        totalExpenses: 75_000,
        categories: [
          { category: 'Repair', amount: 60_000, count: 1 },
          { category: 'Operasional', amount: 15_000, count: 1 },
        ],
      });

      const financialRecapWithExpense = await callApi('GET', '/api/financial/recap?startDate=2026-07-01&endDate=2026-07-31', {
        token: ownerToken,
        tenantId,
        branchId,
      });
      expect(financialRecapWithExpense.status).toBe(200);
      expect(financialRecapWithExpense.body.data.summary).toMatchObject({
        totalRevenue: 150_000,
        invoiceRevenue: 150_000,
        cashReceived: 150_000,
        receivables: 0,
        totalExpenses: 75_000,
        netProfit: 75_000,
        expenseCategories: [
          { category: 'Repair', amount: 60_000, count: 1 },
          { category: 'Operasional', amount: 15_000, count: 1 },
        ],
      });

      const deletedExpense = await callApi('DELETE', `/api/expenses/${createdExpense.body.data.id}`, {
        token: ownerToken,
        tenantId,
        branchId,
      });
      expect(deletedExpense.status).toBe(200);

      const afterExpenseDelete = await callApi('GET', '/api/expenses?startDate=2026-07-01&endDate=2026-07-31&q=frame', {
        token: ownerToken,
        tenantId,
        branchId,
      });
      expect(afterExpenseDelete.status).toBe(200);
      expect(afterExpenseDelete.body.data.items.map((expense) => expense.id)).not.toContain(createdExpense.body.data.id);

      const nextFinancialRecap = await callApi(
        'GET',
        `/api/financial/recap?limit=2&cursor=${encodeURIComponent(financialRecap.body.data.nextCursor)}`,
        { token: ownerToken, tenantId, branchId },
      );
      expect(nextFinancialRecap.status).toBe(200);
      expect(nextFinancialRecap.body.data.items).toHaveLength(1);
      expect(nextFinancialRecap.body.data.nextCursor).toBeNull();
      expect(nextFinancialRecap.body.data.summary).toBeNull();

      const inventory = await callApi('GET', '/api/items', {
        token: ownerToken, tenantId, branchId,
      });
      expect(inventory.status).toBe(200);
      expect(inventory.body.data.find((item) => item.id === itemId)?.stock).toBe(7);

      const dpRental = await callApi('POST', '/api/rentals', {
        token: ownerToken,
        tenantId,
        branchId,
        body: {
          customer: { name: 'DP Customer', phone: '081277777770', guarantee: 'KTP' },
          items: [{ id: itemId, qty: 1 }],
          duration: 1,
          rentalStartAt: '2026-07-20T02:00:00.000Z',
          payment: { status: 'DP', method: 'BANK', paidAmount: 20_000 },
        },
      });
      expect(dpRental.status).toBe(201);

      const financialRecapWithDp = await callApi('GET', '/api/financial/recap?startDate=2026-07-01&endDate=2026-07-31', {
        token: ownerToken,
        tenantId,
        branchId,
      });
      expect(financialRecapWithDp.status).toBe(200);
      expect(financialRecapWithDp.body.data.summary).toMatchObject({
        invoiceRevenue: 200_000,
        cashReceived: 170_000,
        receivables: 30_000,
        totalExpenses: 15_000,
        netProfit: 155_000,
        totalTransactions: 4,
      });

      const editPrimaryItem = await callApi('POST', '/api/items', {
        token: ownerToken,
        tenantId,
        branchId,
        body: { name: 'Edit Tenda Vitest', category: 'Tenda', stock: 5, price: 12_000, image: '' },
      });
      expect(editPrimaryItem.status).toBe(201);
      const editExtraItem = await callApi('POST', '/api/items', {
        token: ownerToken,
        tenantId,
        branchId,
        body: { name: 'Edit Lampu Vitest', category: 'Tenda', stock: 4, price: 8_000, image: '' },
      });
      expect(editExtraItem.status).toBe(201);
      const editPrimaryItemId = editPrimaryItem.body.data.id;
      const editExtraItemId = editExtraItem.body.data.id;

      const editableRental = await callApi('POST', '/api/rentals', {
        token: cashierToken,
        tenantId,
        branchId,
        body: {
          customer: {
            name: 'Edit Customer Awal',
            phone: '081277777780',
            address: 'Alamat awal',
            guarantee: 'KTP',
            idNumber: '12345',
          },
          identityCardHeld: true,
          items: [{ id: editPrimaryItemId, qty: 2 }],
          duration: 1,
          rentalStartAt: '2026-07-24T02:00:00.000Z',
          payment: { status: 'LUNAS', method: 'TUNAI', paidAmount: 24_000 },
        },
      });
      expect(editableRental.status).toBe(201);
      expect((await prisma.item.findUnique({ where: { id: editPrimaryItemId } })).stock).toBe(3);
      expect((await prisma.item.findUnique({ where: { id: editExtraItemId } })).stock).toBe(4);

      const editedRental = await callApi('PATCH', `/api/rentals/${editableRental.body.data.id}`, {
        token: cashierToken,
        tenantId,
        branchId,
        body: {
          editReason: 'Tambah item yang lupa diinput',
          customer: {
            name: 'Edit Customer Final',
            phone: '081277777780',
            address: 'Alamat final',
            guarantee: 'SIM',
            idNumber: 'SIM-67890',
          },
          identityCardHeld: false,
          items: [
            { id: editPrimaryItemId, qty: 1, notes: 'Dikurangi satu' },
            { id: editExtraItemId, qty: 3, notes: 'Tambahan lampu' },
          ],
          rentalStartAt: '2026-07-24T02:00:00.000Z',
          rentalEndAt: '2026-07-26T02:00:00.000Z',
          payment: { status: 'DP', method: 'BANK', paidAmount: 30_000 },
        },
      });
      expect(editedRental.status, JSON.stringify(editedRental.body)).toBe(200);
      expect(editedRental.body.data).toMatchObject({
        id: editableRental.body.data.id,
        customer: {
          name: 'Edit Customer Final',
          phone: '081277777780',
          guarantee: 'SIM',
          idNumber: 'SIM-67890',
          identityCardHeld: false,
        },
        duration: 2,
        total: 72_000,
        payment: {
          status: 'DP',
          method: 'BANK',
          paidAmount: 30_000,
          remainingAmount: 42_000,
        },
      });
      expect(editedRental.body.data.items).toEqual([
        expect.objectContaining({ id: editPrimaryItemId, qty: 1, price: 12_000, notes: 'Dikurangi satu' }),
        expect.objectContaining({ id: editExtraItemId, qty: 3, price: 8_000, notes: 'Tambahan lampu' }),
      ]);
      expect((await prisma.item.findUnique({ where: { id: editPrimaryItemId } })).stock).toBe(4);
      expect((await prisma.item.findUnique({ where: { id: editExtraItemId } })).stock).toBe(1);
      const editAudit = await prisma.auditLog.findFirst({
        where: { action: 'rental.edit', targetId: editableRental.body.data.id },
      });
      expect(editAudit?.actorUserId).toBeTruthy();
      expect(editAudit?.snapshotBefore).toMatchObject({
        reason: 'Tambah item yang lupa diinput',
        before: {
          customerName: 'Edit Customer Awal',
          total: 24_000,
          items: [expect.objectContaining({ itemId: editPrimaryItemId, qty: 2 })],
        },
        after: {
          customerName: 'Edit Customer Final',
          total: 72_000,
          items: [
            expect.objectContaining({ itemId: editPrimaryItemId, qty: 1 }),
            expect.objectContaining({ itemId: editExtraItemId, qty: 3 }),
          ],
        },
      });

      const returnedEditedRental = await callApi('POST', '/api/returns', {
        token: cashierToken,
        tenantId,
        branchId,
        body: {
          rentalId: editableRental.body.data.id,
          settleRemainingPayment: true,
        },
      });
      expect(returnedEditedRental.status).toBe(200);
      expect((await prisma.item.findUnique({ where: { id: editPrimaryItemId } })).stock).toBe(5);
      expect((await prisma.item.findUnique({ where: { id: editExtraItemId } })).stock).toBe(4);
      const editReturnedRental = await callApi('PATCH', `/api/rentals/${editableRental.body.data.id}`, {
        token: cashierToken,
        tenantId,
        branchId,
        body: {
          editReason: 'Tidak boleh edit setelah kembali',
          customer: {
            name: 'Edit Customer Final',
            phone: '081277777780',
            guarantee: 'SIM',
            idNumber: 'SIM-67890',
          },
          identityCardHeld: false,
          items: [{ id: editPrimaryItemId, qty: 1 }],
          duration: 1,
          payment: { status: 'LUNAS', method: 'TUNAI' },
        },
      });
      expect(editReturnedRental.status).toBe(400);
      expect(editReturnedRental.body.message).toBe('Rental already returned');

      const deleteRaceRental = await callApi('POST', '/api/rentals', {
        token: ownerToken,
        tenantId,
        branchId,
        body: {
          customer: { name: 'Delete Race', phone: '081277777771', guarantee: 'KTP' },
          items: [{ id: secondItemId, qty: 1 }],
          duration: 1,
          payment: { status: 'LUNAS', method: 'TUNAI', paidAmount: 40_000 },
        },
      });
      expect(deleteRaceRental.status).toBe(201);
      const deleteRaceId = deleteRaceRental.body.data.id;
      const deleteRaceResults = await Promise.allSettled([
        deleteRentalByAdmin({
          actorUserId: ownerUserId,
          rentalId: deleteRaceId,
          reason: 'Concurrency test',
          context: { tenantId, branchId },
        }),
        deleteRentalByAdmin({
          actorUserId: ownerUserId,
          rentalId: deleteRaceId,
          reason: 'Concurrency test',
          context: { tenantId, branchId },
        }),
      ]);
      expect(deleteRaceResults.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
      expect((await prisma.item.findUnique({ where: { id: secondItemId } })).stock).toBe(2);
      expect(await prisma.auditLog.count({
        where: { action: 'rental.delete', targetId: deleteRaceId },
      })).toBe(1);

      const returnRaceRental = await callApi('POST', '/api/rentals', {
        token: ownerToken,
        tenantId,
        branchId,
        body: {
          customer: { name: 'Return Race', phone: '081277777772', guarantee: 'KTP' },
          items: [{ id: secondItemId, qty: 1 }],
          duration: 1,
          payment: { status: 'LUNAS', method: 'TUNAI', paidAmount: 40_000 },
        },
      });
      expect(returnRaceRental.status).toBe(201);
      const returnRaceId = returnRaceRental.body.data.id;
      const returnRaceResults = await Promise.allSettled([
        processReturn({ rentalId: returnRaceId }, { tenantId, branchId }),
        processReturn({ rentalId: returnRaceId }, { tenantId, branchId }),
      ]);
      expect(returnRaceResults.some((result) => result.status === 'fulfilled')).toBe(true);
      expect((await prisma.item.findUnique({ where: { id: secondItemId } })).stock).toBe(2);
      expect(await prisma.returnRecord.count({ where: { rentalId: returnRaceId } })).toBe(1);

      const deleteReturnRaceRental = await callApi('POST', '/api/rentals', {
        token: ownerToken,
        tenantId,
        branchId,
        body: {
          customer: { name: 'Delete Return Race', phone: '081277777773', guarantee: 'KTP' },
          items: [{ id: secondItemId, qty: 1 }],
          duration: 1,
          payment: { status: 'LUNAS', method: 'TUNAI', paidAmount: 40_000 },
        },
      });
      expect(deleteReturnRaceRental.status).toBe(201);
      const deleteReturnRaceId = deleteReturnRaceRental.body.data.id;
      await expect(deleteRentalByAdmin({
        actorUserId: ownerUserId,
        rentalId: deleteReturnRaceId,
        reason: 'Wrong tenant test',
        context: { tenantId: 'tenant-lain', branchId },
      })).rejects.toThrow('Forbidden');
      await expect(deleteRentalByAdmin({
        actorUserId: ownerUserId,
        rentalId: deleteReturnRaceId,
        reason: 'Wrong branch test',
        context: { tenantId, branchId: 'branch-lain' },
      })).rejects.toThrow('Forbidden');
      expect((await prisma.rental.findUnique({ where: { id: deleteReturnRaceId } })).deletedAt).toBeNull();
      expect((await prisma.item.findUnique({ where: { id: secondItemId } })).stock).toBe(1);

      const returnFirstBarrier = installRentalRaceBarrier(deleteReturnRaceId);
      let deleteReturnRaceResults;
      try {
        deleteReturnRaceResults = await Promise.allSettled([
          deleteRentalByAdmin({
            actorUserId: ownerUserId,
            rentalId: deleteReturnRaceId,
            reason: 'Cross-operation concurrency test',
            context: { tenantId, branchId },
          }),
          processReturn({ rentalId: deleteReturnRaceId }, { tenantId, branchId }),
        ]);
      } finally {
        returnFirstBarrier.transactionSpy.mockRestore();
      }
      expect(returnFirstBarrier.getState()).toEqual({
        transactionIndex: 2,
        initialReadCount: 2,
        winnerClaimCount: 1,
      });
      expect(deleteReturnRaceResults.map((result) => result.status)).toEqual(['fulfilled', 'fulfilled']);
      expect((await prisma.item.findUnique({ where: { id: secondItemId } })).stock).toBe(2);
      const deleteReturnAudit = await prisma.auditLog.findFirst({
        where: { action: 'rental.delete', targetId: deleteReturnRaceId },
      });
      expect(deleteReturnAudit?.snapshotBefore).toMatchObject({
        status: 'Returned',
        returnDate: expect.any(String),
        finalTotal: 40_000,
        items: [expect.objectContaining({ itemId: secondItemId, qty: 1 })],
      });
      expect(await prisma.returnRecord.count({
        where: { rentalId: deleteReturnRaceId },
      })).toBe(1);
      expect(await prisma.auditLog.count({
        where: { action: 'rental.delete', targetId: deleteReturnRaceId },
      })).toBe(1);
      expect(await prisma.rental.findUnique({
        where: { id: deleteReturnRaceId },
      })).toMatchObject({ status: 'Returned', deletedAt: expect.any(Date) });

      const deleteFirstRaceRental = await callApi('POST', '/api/rentals', {
        token: ownerToken,
        tenantId,
        branchId,
        body: {
          customer: { name: 'Delete First Race', phone: '081277777774', guarantee: 'KTP' },
          items: [{ id: secondItemId, qty: 1 }],
          duration: 1,
          payment: { status: 'LUNAS', method: 'TUNAI', paidAmount: 40_000 },
        },
      });
      expect(deleteFirstRaceRental.status).toBe(201);
      const deleteFirstRaceId = deleteFirstRaceRental.body.data.id;
      const deleteFirstBarrier = installRentalRaceBarrier(deleteFirstRaceId);
      let deleteFirstRaceResults;
      try {
        deleteFirstRaceResults = await Promise.allSettled([
          processReturn({ rentalId: deleteFirstRaceId }, { tenantId, branchId }),
          deleteRentalByAdmin({
            actorUserId: ownerUserId,
            rentalId: deleteFirstRaceId,
            reason: 'Delete-first concurrency test',
            context: { tenantId, branchId },
          }),
        ]);
      } finally {
        deleteFirstBarrier.transactionSpy.mockRestore();
      }
      expect(deleteFirstBarrier.getState()).toEqual({
        transactionIndex: 2,
        initialReadCount: 2,
        winnerClaimCount: 1,
      });
      expect(deleteFirstRaceResults.map((result) => result.status)).toEqual(['rejected', 'fulfilled']);
      expect(deleteFirstRaceResults[0]).toMatchObject({
        status: 'rejected',
        reason: expect.objectContaining({ message: 'Rental already returned' }),
      });
      expect((await prisma.item.findUnique({ where: { id: secondItemId } })).stock).toBe(2);
      expect(await prisma.returnRecord.count({ where: { rentalId: deleteFirstRaceId } })).toBe(0);
      expect(await prisma.auditLog.count({
        where: { action: 'rental.delete', targetId: deleteFirstRaceId },
      })).toBe(1);
      expect(await prisma.rental.findUnique({ where: { id: deleteFirstRaceId } })).toMatchObject({
        status: 'Active',
        deletedAt: expect.any(Date),
      });

      const deletion = await callApi('DELETE', `/api/tenants/${tenantId}`, {
        token: adminToken,
        body: { password: adminPassword, confirmationText: storeName },
      });
      expect(deletion.status).toBe(200);
      expect(deletion.body.data.id).toBe(tenantId);
      tenantId = '';

      expect(await prisma.user.findUnique({ where: { id: ownerUserId } })).toBeNull();
      ownerUserId = '';
    } finally {
      if (tenantId) {
        const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
        if (tenant) {
          await deleteTenantForPlatformAdmin(tenant.id, tenant.name);
        }
      }
      if (ownerUserId) {
        await prisma.user.deleteMany({ where: { id: ownerUserId } });
      }
      if (orphanUserId) {
        await prisma.user.deleteMany({ where: { id: orphanUserId } });
      }
      if (policyUserIds.length > 0) {
        await prisma.user.deleteMany({
          where: { id: { in: policyUserIds } },
        });
      }
      expect(await prisma.user.count({
        where: { id: { in: policyUserIds } },
      })).toBe(0);
    }
  }, 90_000);
});

describe('customer pagination', () => {
  it('returns all scoped customers in stable, bounded pages', async () => {
    const suffix = `${Date.now()}-${Math.floor(Math.random() * 10_000)}`;
    const tenantName = `Customer Pagination ${suffix}`;
    const oldCustomerName = `Customer Pagination Oldest ${suffix}`;
    let tenantId = '';
    let userId = '';

    try {
      const plan = await prisma.plan.findUnique({ where: { code: 'growth' } });
      expect(plan).toBeTruthy();

      const tenant = await prisma.tenant.create({
        data: {
          name: tenantName,
          slug: `customer-pagination-${suffix}`,
          subscription: { create: { planId: plan.id, status: 'active' } },
          branches: {
            create: [
              { code: 'primary', name: 'Primary' },
              { code: 'other', name: 'Other' },
            ],
          },
        },
        include: { branches: true },
      });
      tenantId = tenant.id;
      const [branch, otherBranch] = tenant.branches;

      const user = await prisma.user.create({
        data: {
          username: `customer-pagination-${suffix}`,
          passwordHash: 'not-used',
          role: 'kasir',
          memberships: { create: { tenantId, role: 'owner', status: 'active' } },
        },
      });
      userId = user.id;
      const token = createAccessToken({ sub: user.id, username: user.username, role: user.role }, env);

      const oldestUpdatedAt = new Date('2020-01-01T00:00:00.000Z');
      await prisma.customer.createMany({
        data: Array.from({ length: 121 }, (_, index) => ({
          name: index === 0 ? oldCustomerName : `Customer Pagination ${suffix} ${index}`,
          phone: `081${String(index).padStart(9, '0')}`,
          tenantId,
          branchId: branch.id,
          ...(index === 0 ? { createdAt: oldestUpdatedAt, updatedAt: oldestUpdatedAt } : {}),
        })),
      });
      await prisma.customer.create({
        data: { name: oldCustomerName, phone: '08999999999', tenantId, branchId: otherBranch.id },
      });

      const first = await callApi('GET', '/api/customers?page=1&limit=50', {
        token, tenantId, branchId: branch.id,
      });
      const second = await callApi('GET', '/api/customers?page=2&limit=50', {
        token, tenantId, branchId: branch.id,
      });
      const third = await callApi('GET', '/api/customers?page=3&limit=50', {
        token, tenantId, branchId: branch.id,
      });
      const repeatedFirst = await callApi('GET', '/api/customers?page=1&limit=50', {
        token, tenantId, branchId: branch.id,
      });
      const clampedLimit = await callApi('GET', '/api/customers?page=1&limit=500', {
        token, tenantId, branchId: branch.id,
      });
      const search = await callApi('GET', `/api/customers?q=${encodeURIComponent(oldCustomerName)}`, {
        token, tenantId, branchId: branch.id,
      });

      expect(first.status).toBe(200);
      expect(first.body.data.items).toHaveLength(50);
      expect(second.body.data.items).toHaveLength(50);
      expect(third.body.data.items).toHaveLength(21);
      expect(third.body.data.pagination).toEqual({
        page: 3,
        pageSize: 50,
        totalItems: 121,
        totalPages: 3,
      });
      expect(repeatedFirst.body.data.items.map((customer) => customer.id))
        .toEqual(first.body.data.items.map((customer) => customer.id));
      expect(new Set([...first.body.data.items, ...second.body.data.items].map((customer) => customer.id)).size)
        .toBe(100);
      expect(clampedLimit.body.data.items).toHaveLength(50);
      expect(clampedLimit.body.data.pagination.pageSize).toBe(50);
      expect(search.body.data.items.map((customer) => customer.name)).toEqual([oldCustomerName]);
    } finally {
      if (tenantId) {
        const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
        if (tenant) {
          await deleteTenantForPlatformAdmin(tenant.id, tenant.name);
        }
      }
      if (userId) {
        await prisma.user.deleteMany({ where: { id: userId } });
      }
    }
  }, 60_000);
});

describe('rental payment API', () => {
  it('records bounded payments idempotently and rejects invalid or unavailable rentals', async () => {
    const suffix = `${Date.now()}-${Math.floor(Math.random() * 10_000)}`;
    let tenantId = '';
    let otherTenantId = '';
    let userId = '';
    try {
      const plan = await prisma.plan.findUnique({ where: { code: 'growth' } });
      const tenant = await prisma.tenant.create({
        data: { name: `Rental Payment ${suffix}`, slug: `rental-payment-${suffix}`, subscription: { create: { planId: plan.id, status: 'active' } }, branches: { create: { code: 'primary', name: 'Primary' } } },
        include: { branches: true },
      });
      tenantId = tenant.id;
      const branchId = tenant.branches[0].id;
      const otherTenant = await prisma.tenant.create({
        data: { name: `Rental Payment Other ${suffix}`, slug: `rental-payment-other-${suffix}`, subscription: { create: { planId: plan.id, status: 'active' } }, branches: { create: { code: 'other', name: 'Other' } } },
        include: { branches: true },
      });
      otherTenantId = otherTenant.id;
      const otherBranchId = otherTenant.branches[0].id;
      const user = await prisma.user.create({
        data: { username: `rental-payment-${suffix}`, passwordHash: 'not-used', role: 'kasir', memberships: { create: [{ tenantId, role: 'owner', status: 'active' }, { tenantId: otherTenantId, role: 'owner', status: 'active' }] } },
      });
      userId = user.id;
      const token = createAccessToken({ sub: user.id, username: user.username, role: user.role }, env);
      const category = await prisma.category.create({ data: { tenantId, name: `Rental Payment ${suffix}` } });
      const item = await prisma.item.create({ data: { tenantId, branchId, categoryId: category.id, name: `Rental Payment Item ${suffix}`, stock: 10, price: 100_000 } });
      const createUnpaidRental = async (phone) => {
        const result = await callApi('POST', '/api/rentals', { token, tenantId, branchId, body: { customer: { name: `Payment ${phone}`, phone, guarantee: 'KTP' }, items: [{ id: item.id, qty: 1 }], duration: 1 } });
        expect(result.status).toBe(201);
        return result.body.data.id;
      };
      const rentalId = await createUnpaidRental('081200000001');
      const paymentBody = { amount: 40_000, method: 'QRIS', idempotencyKey: `payment:${suffix}:1` };
      const partial = await callApi('POST', `/api/rentals/${rentalId}/payments`, { token, tenantId, branchId, body: paymentBody });
      expect(partial.status).toBe(201);
      expect(partial.body.data.rental.payment).toMatchObject({ status: 'SEBAGIAN', paidAmount: 40_000, remainingAmount: 60_000, totalDue: 100_000, records: [expect.objectContaining({ amount: 40_000, method: 'QRIS' })] });
      expect(partial.body.data.rental.charges).toEqual([]);
      const repeated = await callApi('POST', `/api/rentals/${rentalId}/payments`, { token, tenantId, branchId, body: paymentBody });
      expect(repeated.status).toBe(200);
      expect(await prisma.rentalPayment.count({ where: { rentalId } })).toBe(1);
      for (const [amount, method] of [[0, 'QRIS'], [-1, 'QRIS'], [10_000, 'KARTU']]) {
        const invalid = await callApi('POST', `/api/rentals/${rentalId}/payments`, { token, tenantId, branchId, body: { amount, method, idempotencyKey: `payment:${suffix}:${amount}:${method}` } });
        expect(invalid.status).toBe(400);
      }
      const crossTenant = await callApi('POST', `/api/rentals/${rentalId}/payments`, { token, tenantId: otherTenantId, branchId: otherBranchId, body: { amount: 10_000, method: 'BANK', idempotencyKey: `payment:${suffix}:cross` } });
      expect(crossTenant.status).toBe(404);
      const deletedRentalId = await createUnpaidRental('081200000002');
      await prisma.rental.update({ where: { id: deletedRentalId }, data: { deletedAt: new Date() } });
      expect((await callApi('POST', `/api/rentals/${deletedRentalId}/payments`, { token, tenantId, branchId, body: { amount: 10_000, method: 'TUNAI', idempotencyKey: `payment:${suffix}:deleted` } })).status).toBe(404);
      const returnedRentalId = await createUnpaidRental('081200000003');
      await prisma.rental.update({ where: { id: returnedRentalId }, data: { status: 'Returned', returnDate: new Date() } });
      expect((await callApi('POST', `/api/rentals/${returnedRentalId}/payments`, { token, tenantId, branchId, body: { amount: 10_000, method: 'TUNAI', idempotencyKey: `payment:${suffix}:returned` } })).status).toBe(400);
      const raceRentalId = await createUnpaidRental('081200000004');
      const race = await Promise.all(['a', 'b'].map((key) => callApi('POST', `/api/rentals/${raceRentalId}/payments`, { token, tenantId, branchId, body: { amount: 70_000, method: 'BANK', idempotencyKey: `payment:${suffix}:race-${key}` } })));
      expect(race.map((result) => result.status).sort()).toEqual([201, 409]);
      const racePayments = await prisma.rentalPayment.findMany({ where: { rentalId: raceRentalId } });
      expect(racePayments.reduce((sum, payment) => sum + payment.amount, 0)).toBeLessThanOrEqual(100_000);
    } finally {
      for (const id of [tenantId, otherTenantId]) {
        if (!id) continue;
        const tenant = await prisma.tenant.findUnique({ where: { id } });
        if (tenant) await deleteTenantForPlatformAdmin(tenant.id, tenant.name);
      }
      if (userId) await prisma.user.deleteMany({ where: { id: userId } });
    }
  }, 90_000);
});

describe('rental payment regressions', () => {
  it('does not replay another rental or branch payment and preserves legacy paid balances', async () => {
    const suffix = `${Date.now()}-${Math.floor(Math.random() * 10_000)}`;
    let tenantId = '';
    let otherTenantId = '';
    let userId = '';
    try {
      const plan = await prisma.plan.findUnique({ where: { code: 'growth' } });
      const tenant = await prisma.tenant.create({
        data: {
          name: `Payment Regression ${suffix}`,
          slug: `payment-regression-${suffix}`,
          subscription: { create: { planId: plan.id, status: 'active' } },
          branches: { create: [{ code: 'primary', name: 'Primary' }, { code: 'secondary', name: 'Secondary' }] },
        },
        include: { branches: true },
      });
      tenantId = tenant.id;
      const [branch, otherBranch] = tenant.branches;
      const otherTenant = await prisma.tenant.create({
        data: {
          name: `Payment Regression Other ${suffix}`,
          slug: `payment-regression-other-${suffix}`,
          subscription: { create: { planId: plan.id, status: 'active' } },
          branches: { create: { code: 'primary', name: 'Primary' } },
        },
        include: { branches: true },
      });
      otherTenantId = otherTenant.id;
      const user = await prisma.user.create({
        data: {
          username: `payment-regression-${suffix}`,
          passwordHash: 'not-used',
          role: 'kasir',
          memberships: { create: [{ tenantId, role: 'owner', status: 'active' }, { tenantId: otherTenantId, role: 'owner', status: 'active' }] },
        },
      });
      userId = user.id;
      const token = createAccessToken({ sub: user.id, username: user.username, role: user.role }, env);
      const category = await prisma.category.create({ data: { tenantId, name: `Regression ${suffix}` } });
      const item = await prisma.item.create({ data: { tenantId, branchId: branch.id, categoryId: category.id, name: `Regression Item ${suffix}`, stock: 10, price: 100_000 } });
      const cheaperItem = await prisma.item.create({ data: { tenantId, branchId: branch.id, categoryId: category.id, name: `Regression Cheaper Item ${suffix}`, stock: 10, price: 50_000 } });

      const createRental = async (branchId, phone, paid = false) => prisma.rental.create({
        data: {
          id: `REG-${suffix}-${phone}`,
          tenantId,
          branchId,
          customerName: `Regression ${phone}`,
          customerPhone: phone,
          guarantee: 'KTP',
          identityCardHeld: true,
          duration: 1,
          total: 100_000,
          paymentStatus: paid ? 'LUNAS' : 'BELUM_BAYAR',
          paymentMethod: 'TUNAI',
          paidAmount: paid ? 100_000 : 0,
          status: 'Active',
          date: new Date(),
          items: { create: [{ itemId: item.id, itemName: item.name, categoryName: category.name, price: item.price, qty: 1 }] },
        },
      });
      const payment = (rentalId, branchId, body) => callApi('POST', `/api/rentals/${rentalId}/payments`, { token, tenantId, branchId, body });
      const firstRental = await createRental(branch.id, '081211111111');
      const sharedKey = `regression-key-${suffix}`;
      expect((await payment(firstRental.id, branch.id, { amount: 40_000, method: 'QRIS', idempotencyKey: sharedKey })).status).toBe(201);
      const paymentAudit = await prisma.auditLog.findFirst({ where: { action: 'RENTAL_PAYMENT_CREATED', targetId: firstRental.id } });
      expect(paymentAudit?.snapshotBefore).toMatchObject({
        before: { payment: { paidAmount: 0, remainingAmount: 100_000 } },
        after: { payment: { paidAmount: 40_000, remainingAmount: 60_000 }, createdPayment: { amount: 40_000, method: 'QRIS' } },
      });
      const secondRental = await createRental(branch.id, '081211111112');
      const sameBranchReuse = await payment(secondRental.id, branch.id, { amount: 10_000, method: 'BANK', idempotencyKey: sharedKey });
      expect(sameBranchReuse.status).toBe(409);
      expect(JSON.stringify(sameBranchReuse.body)).not.toContain(firstRental.id);
      const otherBranchRental = await createRental(otherBranch.id, '081211111113');
      const crossBranchReuse = await payment(otherBranchRental.id, otherBranch.id, { amount: 10_000, method: 'BANK', idempotencyKey: sharedKey });
      expect(crossBranchReuse.status).toBe(409);
      expect(JSON.stringify(crossBranchReuse.body)).not.toContain(firstRental.id);
      const deletedRental = await createRental(branch.id, '081211111114');
      await prisma.rental.update({ where: { id: deletedRental.id }, data: { deletedAt: new Date() } });
      expect((await payment(deletedRental.id, branch.id, { amount: 10_000, method: 'BANK', idempotencyKey: sharedKey })).status).toBe(404);
      const returnedRental = await createRental(branch.id, '081211111115');
      await prisma.rental.update({ where: { id: returnedRental.id }, data: { status: 'Returned', returnDate: new Date() } });
      expect((await payment(returnedRental.id, branch.id, { amount: 10_000, method: 'BANK', idempotencyKey: sharedKey })).status).toBe(400);
      const legacyPaidRental = await createRental(branch.id, '081211111116', true);
      const legacyPayment = await payment(legacyPaidRental.id, branch.id, { amount: 1, method: 'BANK', idempotencyKey: `legacy-${suffix}` });
      expect(legacyPayment.status).toBe(409);
      expect(legacyPayment.body.message).toContain('melebihi');
      const editable = await createRental(branch.id, '081211111117');
      await prisma.rentalPayment.create({ data: { rentalId: editable.id, tenantId, branchId: branch.id, amount: 80_000, method: 'TUNAI', paidAt: new Date(), note: '', idempotencyKey: `edit-paid-${suffix}`, createdByUserId: userId } });
      const edit = await callApi('PATCH', `/api/rentals/${editable.id}`, { token, tenantId, branchId: branch.id, body: { editReason: 'Reduce invoice below paid amount', customer: { name: 'Reduced Invoice', phone: '081211111117', guarantee: 'KTP' }, items: [{ id: cheaperItem.id, qty: 1 }], duration: 1 } });
      expect(edit.status).toBe(409);
    } finally {
      for (const id of [tenantId, otherTenantId]) {
        if (!id) continue;
        const tenant = await prisma.tenant.findUnique({ where: { id } });
        if (tenant) await deleteTenantForPlatformAdmin(tenant.id, tenant.name);
      }
      if (userId) await prisma.user.deleteMany({ where: { id: userId } });
    }
  }, 90_000);
});
