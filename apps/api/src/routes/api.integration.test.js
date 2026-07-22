import { Readable } from 'node:stream';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getEnv } from '../config/env.js';
import { deleteTenantForPlatformAdmin, initDatabase } from '../data/db.js';
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
