import { prisma } from '../src/data/prisma.js';
import {
  listTenantsForUser,
  resolveTenantBranchContextForUser,
  updateTenantMembershipForUser,
} from '../src/data/db.js';

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function main() {
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
        role: 'admin',
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
      role: 'admin',
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
        role: 'admin',
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

    let ownerProtectionError = '';
    try {
      await updateTenantMembershipForUser({
        actorUserId: tenantAdmin.id,
        actorRole: 'admin',
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

main().catch((error) => {
  const message = error instanceof Error ? error.stack || error.message : String(error);
  console.error('[tenant-access-smoke] Failed:', message);
  process.exitCode = 1;
});
