import { prisma } from '../src/data/prisma.js';
import { pathToFileURL } from 'node:url';
import {
  deleteTenantForPlatformAdmin,
  listBranchesForUser,
  listTenantsForUser,
  resolveTenantBranchContextForUser,
  updateTenantMembershipForUser,
} from '../src/data/db.js';

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function captureError(operation) {
  try {
    await operation();
    return '';
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

export async function runTenantAccessSmoke() {
  const suffix = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
  const ids = {
    users: [],
    memberships: [],
    branches: [],
    tenants: [],
  };

  try {
    await prisma.$connect();

    const tenantA = await prisma.tenant.create({
      data: {
        slug: `smoke-tenant-a-${suffix}`,
        name: `Smoke Tenant A ${suffix}`,
        status: 'active',
      },
    });
    ids.tenants.push(tenantA.id);

    const tenantB = await prisma.tenant.create({
      data: {
        slug: `smoke-tenant-b-${suffix}`,
        name: `Smoke Tenant B ${suffix}`,
        status: 'active',
      },
    });
    ids.tenants.push(tenantB.id);

    const branchA = await prisma.branch.create({
      data: {
        tenantId: tenantA.id,
        code: `a-${suffix}`,
        name: `Branch A ${suffix}`,
        status: 'active',
      },
    });
    ids.branches.push(branchA.id);

    const branchASecond = await prisma.branch.create({
      data: {
        tenantId: tenantA.id,
        code: `a-second-${suffix}`,
        name: `Branch A Second ${suffix}`,
        status: 'active',
      },
    });
    ids.branches.push(branchASecond.id);

    const branchAInactive = await prisma.branch.create({
      data: {
        tenantId: tenantA.id,
        code: `a-inactive-${suffix}`,
        name: `Branch A Inactive ${suffix}`,
        status: 'inactive',
      },
    });
    ids.branches.push(branchAInactive.id);

    const branchB = await prisma.branch.create({
      data: {
        tenantId: tenantB.id,
        code: `b-${suffix}`,
        name: `Branch B ${suffix}`,
        status: 'active',
      },
    });
    ids.branches.push(branchB.id);

    const tenantAdmin = await prisma.user.create({
      data: {
        username: `smoke-admin-${suffix}`,
        passwordHash: 'smoke',
        role: 'kasir',
      },
    });
    ids.users.push(tenantAdmin.id);

    const ownerUser = await prisma.user.create({
      data: {
        username: `smoke-owner-${suffix}`,
        passwordHash: 'smoke',
        role: 'kasir',
      },
    });
    ids.users.push(ownerUser.id);

    const noMembershipUser = await prisma.user.create({
      data: {
        username: `smoke-no-membership-${suffix}`,
        passwordHash: 'smoke',
        role: 'kasir',
      },
    });
    ids.users.push(noMembershipUser.id);

    const cashierUser = await prisma.user.create({
      data: {
        username: `smoke-cashier-${suffix}`,
        passwordHash: 'smoke',
        role: 'kasir',
      },
    });
    ids.users.push(cashierUser.id);

    const inactiveMembershipUser = await prisma.user.create({
      data: {
        username: `smoke-inactive-member-${suffix}`,
        passwordHash: 'smoke',
        role: 'kasir',
      },
    });
    ids.users.push(inactiveMembershipUser.id);

    const superuser = await prisma.user.create({
      data: {
        username: `smoke-super-${suffix}`,
        passwordHash: 'smoke',
        role: 'superuser',
      },
    });
    ids.users.push(superuser.id);

    const tenantAdminMembership = await prisma.userMembership.create({
      data: {
        userId: tenantAdmin.id,
        tenantId: tenantA.id,
        role: 'admin',
        status: 'active',
      },
    });
    ids.memberships.push(tenantAdminMembership.id);

    const ownerMembership = await prisma.userMembership.create({
      data: {
        userId: ownerUser.id,
        tenantId: tenantA.id,
        role: 'owner',
        status: 'active',
      },
    });
    ids.memberships.push(ownerMembership.id);

    const cashierMembership = await prisma.userMembership.create({
      data: {
        userId: cashierUser.id,
        tenantId: tenantA.id,
        role: 'kasir',
        status: 'active',
      },
    });
    ids.memberships.push(cashierMembership.id);

    const inactiveMembership = await prisma.userMembership.create({
      data: {
        userId: inactiveMembershipUser.id,
        tenantId: tenantA.id,
        role: 'kasir',
        status: 'inactive',
      },
    });
    ids.memberships.push(inactiveMembership.id);

    const noMembershipError = await captureError(() => listTenantsForUser({
      userId: noMembershipUser.id,
      role: 'kasir',
    }));
    assert(
      noMembershipError === 'Tenant membership is required',
      'Cashier without membership must not inherit the default tenant',
    );

    const noBranchListError = await captureError(() => listBranchesForUser({
      userId: cashierUser.id,
      role: 'kasir',
      tenantId: tenantA.id,
    }));
    assert(
      noBranchListError === 'Branch access is required',
      'Cashier without branch assignment must not list tenant branches',
    );

    const noBranchContextError = await captureError(() => resolveTenantBranchContextForUser({
      userId: cashierUser.id,
      role: 'kasir',
      requestedTenantId: tenantA.id,
      requestedBranchId: branchA.id,
    }));
    assert(
      noBranchContextError === 'Branch access is required',
      'Cashier without branch assignment must not resolve a branch context',
    );

    await prisma.userBranchAccess.create({
      data: {
        userId: cashierUser.id,
        branchId: branchA.id,
        role: 'kasir',
      },
    });
    const cashierBranches = await listBranchesForUser({
      userId: cashierUser.id,
      role: 'kasir',
      tenantId: tenantA.id,
    });
    assert(
      cashierBranches.length === 1 && cashierBranches[0].id === branchA.id,
      'Cashier must see exactly the assigned active branch',
    );

    await prisma.userBranchAccess.update({
      where: {
        userId_branchId: {
          userId: cashierUser.id,
          branchId: branchA.id,
        },
      },
      data: { branchId: branchAInactive.id },
    });
    const inactiveBranchError = await captureError(() => listBranchesForUser({
      userId: cashierUser.id,
      role: 'kasir',
      tenantId: tenantA.id,
    }));
    assert(
      inactiveBranchError === 'Branch access is required',
      'Inactive branch assignments must not grant cashier access',
    );

    const ownerBranches = await listBranchesForUser({
      userId: ownerUser.id,
      role: 'kasir',
      tenantId: tenantA.id,
    });
    assert(
      ownerBranches.length === 2
      && ownerBranches.every((branch) => branch.status === 'active'),
      'Tenant owner must see all and only active tenant branches',
    );

    const inactiveMembershipError = await captureError(() => resolveTenantBranchContextForUser({
      userId: inactiveMembershipUser.id,
      role: 'kasir',
      requestedTenantId: tenantA.id,
      requestedBranchId: branchA.id,
    }));
    assert(
      inactiveMembershipError === 'Tenant membership is inactive',
      'Inactive tenant membership must not resolve request context',
    );

    const tenantsForTenantAdmin = await listTenantsForUser({
      userId: tenantAdmin.id,
      role: 'kasir',
    });

    assert(
      tenantsForTenantAdmin.some((tenant) => tenant.id === tenantA.id),
      'Tenant admin should see tenant A',
    );

    assert(
      !tenantsForTenantAdmin.some((tenant) => tenant.id === tenantB.id),
      'Tenant admin must not see tenant B',
    );

    let forbiddenError = '';
    try {
      await resolveTenantBranchContextForUser({
        userId: tenantAdmin.id,
        role: 'kasir',
        requestedTenantId: tenantB.id,
        requestedBranchId: branchB.id,
      });
    } catch (error) {
      forbiddenError = error instanceof Error ? error.message : String(error);
    }

    assert(
      forbiddenError === 'Tenant membership is required',
      'Tenant admin must be forbidden to resolve tenant B context',
    );

    await resolveTenantBranchContextForUser({
      userId: tenantAdmin.id,
      role: 'kasir',
      requestedTenantId: tenantA.id,
      requestedBranchId: branchA.id,
    });

    const inactiveBranchContextError = await captureError(() => resolveTenantBranchContextForUser({
      userId: ownerUser.id,
      role: 'kasir',
      requestedTenantId: tenantA.id,
      requestedBranchId: branchAInactive.id,
    }));
    assert(
      inactiveBranchContextError === 'Branch not found',
      'Tenant owner must not resolve an inactive branch context',
    );

    await prisma.tenant.update({
      where: { id: tenantA.id },
      data: { status: 'suspended' },
    });
    const suspendedTenantError = await captureError(() => resolveTenantBranchContextForUser({
      userId: ownerUser.id,
      role: 'kasir',
      requestedTenantId: tenantA.id,
      requestedBranchId: branchA.id,
    }));
    assert(
      suspendedTenantError === 'Tenant is not active',
      'Suspended tenant must not resolve request context',
    );
    await prisma.tenant.update({
      where: { id: tenantA.id },
      data: { status: 'active' },
    });

    await prisma.tenantSubscription.update({
      where: { tenantId: tenantA.id },
      data: { status: 'suspended' },
    });

    let subscriptionError = '';
    try {
      await resolveTenantBranchContextForUser({
        userId: tenantAdmin.id,
        role: 'kasir',
        requestedTenantId: tenantA.id,
        requestedBranchId: branchA.id,
      });
    } catch (error) {
      subscriptionError = error instanceof Error ? error.message : String(error);
    }

    assert(
      subscriptionError.toLowerCase().includes('subscription'),
      'Tenant user must be blocked when subscription is suspended',
    );

    await prisma.tenantSubscription.update({
      where: { tenantId: tenantA.id },
      data: { status: 'active' },
    });

    let ownerProtectionError = '';
    try {
      await updateTenantMembershipForUser({
        actorUserId: tenantAdmin.id,
        actorRole: 'kasir',
        membershipId: ownerMembership.id,
        payload: {
          role: 'kasir',
        },
      });
    } catch (error) {
      ownerProtectionError = error instanceof Error ? error.message : String(error);
    }

    assert(
      ownerProtectionError.toLowerCase().includes('owner') || ownerProtectionError.toLowerCase().includes('forbidden'),
      'Tenant admin must not be able to downgrade owner membership',
    );

    const updatedBySuperuser = await updateTenantMembershipForUser({
      actorUserId: superuser.id,
      actorRole: 'superuser',
      membershipId: ownerMembership.id,
      payload: {
        role: 'admin',
      },
    });

    assert(updatedBySuperuser.role === 'admin', 'Superuser should be able to update owner membership');

    const deletedTenant = await deleteTenantForPlatformAdmin(tenantB.id, tenantB.name);
    assert(deletedTenant.id === tenantB.id, 'Platform admin deletion should return deleted tenant');

    const tenantBAfterDelete = await prisma.tenant.findUnique({
      where: { id: tenantB.id },
    });
    assert(tenantBAfterDelete === null, 'Deleted tenant must no longer exist');

    const branchBAfterDelete = await prisma.branch.findUnique({
      where: { id: branchB.id },
    });
    assert(branchBAfterDelete === null, 'Deleting a tenant must cascade its branches');

    console.log('[tenant-access-smoke] All checks passed');
  } finally {
    await prisma.userBranchAccess.deleteMany({
      where: {
        OR: [
          { userId: { in: ids.users } },
          { branchId: { in: ids.branches } },
        ],
      },
    });

    await prisma.userMembership.deleteMany({
      where: {
        id: { in: ids.memberships },
      },
    });

    await prisma.branchSettings.deleteMany({
      where: {
        branchId: { in: ids.branches },
      },
    });

    await prisma.branch.deleteMany({
      where: {
        id: { in: ids.branches },
      },
    });

    await prisma.tenantSettings.deleteMany({
      where: {
        tenantId: { in: ids.tenants },
      },
    });

    await prisma.tenant.deleteMany({
      where: {
        id: { in: ids.tenants },
      },
    });

    await prisma.user.deleteMany({
      where: {
        id: { in: ids.users },
      },
    });

    await prisma.$disconnect();
  }
}

const isDirectExecution = process.argv[1]
  && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectExecution) {
  runTenantAccessSmoke().catch((error) => {
    const message = error instanceof Error ? error.stack || error.message : String(error);
    console.error('[tenant-access-smoke] Failed:', message);
    process.exitCode = 1;
  });
}
