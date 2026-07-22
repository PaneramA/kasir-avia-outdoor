import { describe, expect, it } from 'vitest';
import { vi } from 'vitest';
import * as accessBackfill from './accessBackfill.js';

const { planAccessBackfill } = accessBackfill;

describe('planAccessBackfill', () => {
  it('assigns a user to the only active tenant and its only active branch', () => {
    expect(planAccessBackfill({
      users: [{ id: 'user-1', role: 'KASIR', memberships: [], branchAccesses: [] }],
      tenants: [{ id: 'tenant-1', status: 'ACTIVE' }],
      branches: [
        { id: 'branch-1', tenantId: 'tenant-1', status: 'Active' },
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
        { id: 'tenant-2', status: 'ACTIVE' },
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
        { id: 'branch-2', tenantId: 'tenant-1', status: 'ACTIVE' },
      ],
    })).toEqual({
      assignments: [],
      unresolved: [{ userId: 'user-1', reason: 'ambiguous-branch' }],
    });
  });

  it('skips superusers', () => {
    expect(planAccessBackfill({
      users: [{ id: 'user-1', role: ' SuperUser ', memberships: [], branchAccesses: [] }],
      tenants: [{ id: 'tenant-1', status: 'active' }],
      branches: [{ id: 'branch-1', tenantId: 'tenant-1', status: 'active' }],
    })).toEqual({ assignments: [], unresolved: [] });
  });

  it('reports partially assigned users instead of silently skipping them', () => {
    expect(planAccessBackfill({
      users: [
        { id: 'user-1', role: 'kasir', memberships: [{ id: 'membership-1' }], branchAccesses: [] },
        { id: 'user-2', role: 'kasir', memberships: [], branchAccesses: [{ id: 'access-1' }] },
      ],
      tenants: [{ id: 'tenant-1', status: 'active' }],
      branches: [{ id: 'branch-1', tenantId: 'tenant-1', status: 'active' }],
    })).toEqual({
      assignments: [],
      unresolved: [
        { userId: 'user-1', reason: 'partial-assignment' },
        { userId: 'user-2', reason: 'partial-assignment' },
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
          memberships: [{ id: 'membership-1', role: 'owner', status: 'active' }],
          branchAccesses: [],
        },
        {
          id: 'admin-1',
          role: 'kasir',
          memberships: [{ id: 'membership-2', role: 'admin', status: 'ACTIVE' }],
          branchAccesses: [],
        },
      ],
      tenants: [{ id: 'tenant-1', status: 'active' }],
      branches: [{ id: 'branch-1', tenantId: 'tenant-1', status: 'active' }],
    })).toEqual({ assignments: [], unresolved: [] });
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
