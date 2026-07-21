import { prisma } from '../src/data/prisma.js';
import { pathToFileURL } from 'node:url';
import {
  deleteTenantForPlatformAdmin,
  listTenantsForUser,
  resolveTenantBranchContextForUser,
  updateTenantMembershipForUser,
} from '../src/data/db.js';

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
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
      forbiddenError.toLowerCase().includes('forbidden'),
      'Tenant admin must be forbidden to resolve tenant B context',
    );

    await resolveTenantBranchContextForUser({
      userId: tenantAdmin.id,
      role: 'kasir',
      requestedTenantId: tenantA.id,
      requestedBranchId: branchA.id,
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
