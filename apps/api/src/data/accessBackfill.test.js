import { describe, expect, it } from 'vitest';
import { vi } from 'vitest';
import * as accessBackfill from './accessBackfill.js';

const { planAccessBackfill } = accessBackfill;

describe('planAccessBackfill', () => {
  it('assigns a user to the only active tenant and its only active branch', () => {
    expect(planAccessBackfill({
      users: [{ id: 'user-1', role: 'KASIR', memberships: [], branchAccesses: [] }],
      tenants: [{ id: 'tenant-1', status: 'active' }],
      branches: [
        { id: 'branch-1', tenantId: 'tenant-1', status: 'active' },
        { id: 'branch-2', tenantId: 'tenant-1', status: 'inactive' },
      ],
    })).toEqual({
      assignments: [{ userId: 'user-1', tenantId: 'tenant-1', branchId: 'branch-1' }],
      unresolved: [],
    });
  });

  it('marks users unresolved when more than one tenant is active', () => {
    expect(planAccessBackfill({
      users: [{ id: 'user-1', role: 'kasir', memberships: [], branchAccesses: [] }],
      tenants: [
        { id: 'tenant-1', status: 'active' },
        { id: 'tenant-2', status: 'active' },
      ],
      branches: [],
    })).toEqual({
      assignments: [],
      unresolved: [{ userId: 'user-1', reason: 'ambiguous-tenant' }],
    });
  });

  it('marks users unresolved when more than one branch is active for the tenant', () => {
    expect(planAccessBackfill({
      users: [{ id: 'user-1', role: 'kasir', memberships: [], branchAccesses: [] }],
      tenants: [{ id: 'tenant-1', status: 'active' }],
      branches: [
        { id: 'branch-1', tenantId: 'tenant-1', status: 'active' },
        { id: 'branch-2', tenantId: 'tenant-1', status: 'active' },
      ],
    })).toEqual({
      assignments: [],
      unresolved: [{ userId: 'user-1', reason: 'ambiguous-branch' }],
    });
  });

  it('skips only the configured platform superuser', () => {
    expect(planAccessBackfill({
      platformAdminUsername: 'admin@gmail.com',
      users: [
        {
          id: 'platform-1', username: 'admin@gmail.com', role: 'superuser',
          memberships: [], branchAccesses: [],
        },
        {
          id: 'legacy-1', username: 'legacy-super', role: 'superuser',
          memberships: [], branchAccesses: [],
        },
      ],
      tenants: [{ id: 'tenant-1', status: 'active' }],
      branches: [{ id: 'branch-1', tenantId: 'tenant-1', status: 'active' }],
    })).toEqual({
      assignments: [{ userId: 'legacy-1', tenantId: 'tenant-1', branchId: 'branch-1' }],
      unresolved: [],
    });
  });

  it('reports partially assigned users instead of silently skipping them', () => {
    expect(planAccessBackfill({
      users: [
        {
          id: 'user-1', role: 'kasir',
          memberships: [{ id: 'membership-1', tenantId: 'tenant-1', role: 'kasir', status: 'active' }],
          branchAccesses: [{ id: 'access-1', branchId: 'branch-2' }],
        },
        {
          id: 'user-2', role: 'kasir', memberships: [],
          branchAccesses: [{ id: 'access-2', branchId: 'branch-1' }],
        },
      ],
      tenants: [
        { id: 'tenant-1', status: 'active' },
        { id: 'tenant-2', status: 'active' },
      ],
      branches: [
        { id: 'branch-1', tenantId: 'tenant-1', status: 'active' },
        { id: 'branch-2', tenantId: 'tenant-2', status: 'active' },
      ],
    })).toEqual({
      assignments: [],
      unresolved: [
        { userId: 'user-1', tenantId: 'tenant-1', reason: 'missing-active-branch-access' },
        { userId: 'user-1', tenantId: 'tenant-2', reason: 'branch-access-without-membership' },
        { userId: 'user-2', tenantId: 'tenant-1', reason: 'branch-access-without-membership' },
      ],
    });
  });

  it('treats missing input arrays as empty', () => {
    expect(planAccessBackfill({})).toEqual({ assignments: [], unresolved: [] });
    expect(planAccessBackfill()).toEqual({ assignments: [], unresolved: [] });
  });

  it('does not require branch assignments for active tenant owners or admins', () => {
    expect(planAccessBackfill({
      users: [
        {
          id: 'owner-1',
          role: 'kasir',
          memberships: [{ id: 'membership-1', tenantId: 'tenant-1', role: 'owner', status: 'active' }],
          branchAccesses: [],
        },
        {
          id: 'admin-1',
          role: 'kasir',
          memberships: [{ id: 'membership-2', tenantId: 'tenant-1', role: 'admin', status: 'active' }],
          branchAccesses: [],
        },
      ],
      tenants: [{ id: 'tenant-1', status: 'active' }],
      branches: [{ id: 'branch-1', tenantId: 'tenant-1', status: 'active' }],
    })).toEqual({ assignments: [], unresolved: [] });
  });

  it('reports inactive and non-runtime status records as unresolved', () => {
    expect(planAccessBackfill({
      users: [{
        id: 'user-1', role: 'kasir',
        memberships: [{ id: 'membership-1', tenantId: 'tenant-1', role: 'kasir', status: 'ACTIVE' }],
        branchAccesses: [{ id: 'access-1', branchId: 'branch-1' }],
      }],
      tenants: [{ id: 'tenant-1', status: 'ACTIVE' }],
      branches: [{ id: 'branch-1', tenantId: 'tenant-1', status: 'ACTIVE' }],
    })).toEqual({
      assignments: [],
      unresolved: [{ userId: 'user-1', tenantId: 'tenant-1', reason: 'inactive-membership' }],
    });
  });

  it('checks every tenant membership independently', () => {
    expect(planAccessBackfill({
      users: [{
        id: 'user-1', role: 'kasir',
        memberships: [
          { id: 'owner-a', tenantId: 'tenant-1', role: 'owner', status: 'active' },
          { id: 'cashier-b', tenantId: 'tenant-2', role: 'kasir', status: 'active' },
        ],
        branchAccesses: [],
      }],
      tenants: [
        { id: 'tenant-1', status: 'active' },
        { id: 'tenant-2', status: 'active' },
      ],
      branches: [
        { id: 'branch-1', tenantId: 'tenant-1', status: 'active' },
        { id: 'branch-2', tenantId: 'tenant-2', status: 'active' },
      ],
    })).toEqual({
      assignments: [],
      unresolved: [{
        userId: 'user-1', tenantId: 'tenant-2', reason: 'missing-active-branch-access',
      }],
    });
  });
});

describe('executeAccessBackfill', () => {
  it('stays read-only by default and returns the deterministic plan', async () => {
    expect(typeof accessBackfill.executeAccessBackfill).toBe('function');
    const database = {
      user: { findMany: vi.fn().mockResolvedValue([]) },
      tenant: { findMany: vi.fn().mockResolvedValue([]) },
      branch: { findMany: vi.fn().mockResolvedValue([]) },
      $transaction: vi.fn(),
    };

    await expect(accessBackfill.executeAccessBackfill({ database })).resolves.toEqual({
      mode: 'dry-run',
      assignments: [],
      unresolved: [],
    });
    expect(database.$transaction).not.toHaveBeenCalled();
  });

  it('upserts membership and branch access when apply mode is explicit', async () => {
    expect(typeof accessBackfill.executeAccessBackfill).toBe('function');
    const membershipUpsert = vi.fn().mockResolvedValue({});
    const branchAccessUpsert = vi.fn().mockResolvedValue({});
    const database = {
      user: {
        findMany: vi.fn().mockResolvedValue([
          { id: 'user-1', role: 'kasir', memberships: [], branchAccesses: [] },
        ]),
      },
      tenant: { findMany: vi.fn().mockResolvedValue([{ id: 'tenant-1', status: 'active' }]) },
      branch: {
        findMany: vi.fn().mockResolvedValue([
          { id: 'branch-1', tenantId: 'tenant-1', status: 'active' },
        ]),
      },
      $transaction: vi.fn(async (operation) => operation({
        userMembership: { upsert: membershipUpsert },
        userBranchAccess: { upsert: branchAccessUpsert },
      })),
    };

    await expect(accessBackfill.executeAccessBackfill({ database, apply: true })).resolves.toEqual({
      mode: 'apply',
      assignments: [{ userId: 'user-1', tenantId: 'tenant-1', branchId: 'branch-1' }],
      unresolved: [],
    });
    expect(membershipUpsert).toHaveBeenCalledOnce();
    expect(branchAccessUpsert).toHaveBeenCalledOnce();
  });
});
