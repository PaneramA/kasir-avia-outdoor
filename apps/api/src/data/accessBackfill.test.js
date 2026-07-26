import { describe, expect, it } from 'vitest';
import { planAccessBackfill } from './accessBackfill.js';

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

  it('skips users who already have memberships or branch accesses', () => {
    expect(planAccessBackfill({
      users: [
        { id: 'user-1', role: 'kasir', memberships: [{ id: 'membership-1' }], branchAccesses: [] },
        { id: 'user-2', role: 'kasir', memberships: [], branchAccesses: [{ id: 'access-1' }] },
      ],
      tenants: [{ id: 'tenant-1', status: 'active' }],
      branches: [{ id: 'branch-1', tenantId: 'tenant-1', status: 'active' }],
    })).toEqual({ assignments: [], unresolved: [] });
  });

  it('treats missing input arrays as empty', () => {
    expect(planAccessBackfill({})).toEqual({ assignments: [], unresolved: [] });
    expect(planAccessBackfill()).toEqual({ assignments: [], unresolved: [] });
  });
});
