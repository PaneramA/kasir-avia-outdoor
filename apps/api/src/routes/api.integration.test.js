import { Readable } from 'node:stream';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { getEnv } from '../config/env.js';
import {
  deleteRentalByAdmin,
  deleteTenantForPlatformAdmin,
  initDatabase,
  processReturn,
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

      const plans = await callApi('GET', '/api/plans', { token: adminToken });
      expect(plans.status).toBe(200);
      const plan = plans.body.data.find((entry) => entry.status === 'active');
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

      const ownerTenants = await callApi('GET', '/api/tenants', { token: ownerToken });
      expect(ownerTenants.status).toBe(200);
      expect(ownerTenants.body.data.map((tenant) => tenant.id)).toEqual([tenantId]);

      const itemResponse = await callApi('POST', '/api/items', {
        token: ownerToken,
        tenantId,
        branchId,
        body: { name: 'Tenda Vitest', category: 'Tenda', stock: 10, price: 50_000, image: '' },
      });
      expect(itemResponse.status).toBe(201);
      const itemId = itemResponse.body.data.id;
      expect(itemResponse.body.data.updatedAt).toEqual(expect.any(String));

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
            items: [{ id: itemId, qty: 1 }],
            duration: 1,
            payment: { status: 'LUNAS', method: 'TUNAI', paidAmount: 50_000 },
          },
        });
        expect(rental.status, `rental ke-${index} gagal: ${rental.body?.message || ''}`).toBe(201);
      }

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
      expect(dashboardSummary.body.data).toMatchObject({
        stats: {
          availableStock: 9,
          activeRentals: 3,
          itemsOut: 3,
          revenue: 150_000,
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
        totalTransactions: 3,
        averageTransaction: 50_000,
      });
      expect(financialRecap.body.data.summary.methods).toEqual([
        expect.objectContaining({ method: 'TUNAI', count: 3, revenue: 150_000 }),
      ]);

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
    }
  }, 90_000);
});
