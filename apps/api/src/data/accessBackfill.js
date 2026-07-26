const normalize = (value) => String(value || '').trim().toLowerCase();
const isRuntimeActive = (value) => String(value || '') === 'active';

export function planAccessBackfill({
  users = [],
  tenants = [],
  branches = [],
  platformAdminUsername = '',
} = {}) {
  const assignments = [];
  const unresolved = [];
  const tenantById = new Map(
    (Array.isArray(tenants) ? tenants : []).map((tenant) => [tenant.id, tenant]),
  );
  const branchById = new Map(
    (Array.isArray(branches) ? branches : []).map((branch) => [branch.id, branch]),
  );
  const configuredAdmin = normalize(platformAdminUsername);
  const addUnresolved = (entry) => {
    if (!unresolved.some((candidate) => (
      candidate.userId === entry.userId
      && candidate.tenantId === entry.tenantId
      && candidate.reason === entry.reason
    ))) {
      unresolved.push(entry);
    }
  };

  for (const user of Array.isArray(users) ? users : []) {
    const globalRole = normalize(user?.role);
    if (
      globalRole === 'superuser'
      && configuredAdmin
      && normalize(user?.username) === configuredAdmin
    ) {
      continue;
    }

    const memberships = Array.isArray(user?.memberships) ? user.memberships : [];
    const branchAccesses = Array.isArray(user?.branchAccesses) ? user.branchAccesses : [];

    if (memberships.length > 0 || branchAccesses.length > 0) {
      const membershipTenantIds = new Set(memberships.map((membership) => membership.tenantId));

      for (const membership of memberships) {
        const tenantId = membership?.tenantId;
        const tenant = tenantById.get(tenantId);
        if (!isRuntimeActive(membership?.status)) {
          addUnresolved({ userId: user.id, tenantId, reason: 'inactive-membership' });
          continue;
        }
        if (!tenant || !isRuntimeActive(tenant.status)) {
          addUnresolved({ userId: user.id, tenantId, reason: 'inactive-tenant-membership' });
          continue;
        }

        const membershipRole = normalize(membership?.role);
        if (
          globalRole === 'admin'
          || membershipRole === 'owner'
          || membershipRole === 'admin'
        ) {
          continue;
        }

        const hasActiveBranchAccess = branchAccesses.some((access) => {
          const branch = branchById.get(access?.branchId);
          return branch?.tenantId === tenantId && isRuntimeActive(branch?.status);
        });
        if (!hasActiveBranchAccess) {
          addUnresolved({
            userId: user.id,
            tenantId,
            reason: 'missing-active-branch-access',
          });
        }
      }

      for (const access of branchAccesses) {
        const branch = branchById.get(access?.branchId);
        const tenantId = branch?.tenantId;
        if (tenantId && !membershipTenantIds.has(tenantId)) {
          addUnresolved({
            userId: user.id,
            tenantId,
            reason: 'branch-access-without-membership',
          });
        }
      }
      continue;
    }

    const activeTenants = (Array.isArray(tenants) ? tenants : [])
      .filter((tenant) => isRuntimeActive(tenant?.status));

    if (activeTenants.length !== 1) {
      unresolved.push({ userId: user.id, reason: 'ambiguous-tenant' });
      continue;
    }

    const tenant = activeTenants[0];
    const activeBranches = (Array.isArray(branches) ? branches : [])
      .filter((branch) => (
        branch?.tenantId === tenant.id
        && isRuntimeActive(branch?.status)
      ));

    if (activeBranches.length !== 1) {
      unresolved.push({ userId: user.id, reason: 'ambiguous-branch' });
      continue;
    }

    assignments.push({
      userId: user.id,
      tenantId: tenant.id,
      branchId: activeBranches[0].id,
    });
  }

  return { assignments, unresolved };
}

export async function executeAccessBackfill({
  database,
  apply = false,
  platformAdminUsername = '',
} = {}) {
  if (!database) {
    throw new Error('Database client is required');
  }

  const [users, tenants, branches] = await Promise.all([
    database.user.findMany({
      select: {
        id: true,
        username: true,
        role: true,
        memberships: {
          select: { id: true, tenantId: true, role: true, status: true },
        },
        branchAccesses: {
          select: { id: true, branchId: true },
        },
      },
    }),
    database.tenant.findMany({
      select: { id: true, status: true },
    }),
    database.branch.findMany({
      select: { id: true, tenantId: true, status: true },
    }),
  ]);
  const plan = planAccessBackfill({
    users,
    tenants,
    branches,
    platformAdminUsername,
  });

  if (apply && plan.assignments.length > 0) {
    await database.$transaction(async (tx) => {
      for (const assignment of plan.assignments) {
        await tx.userMembership.upsert({
          where: {
            userId_tenantId: {
              userId: assignment.userId,
              tenantId: assignment.tenantId,
            },
          },
          update: {},
          create: {
            userId: assignment.userId,
            tenantId: assignment.tenantId,
            role: 'kasir',
            status: 'active',
          },
        });
        await tx.userBranchAccess.upsert({
          where: {
            userId_branchId: {
              userId: assignment.userId,
              branchId: assignment.branchId,
            },
          },
          update: {},
          create: {
            userId: assignment.userId,
            branchId: assignment.branchId,
            role: 'kasir',
          },
        });
      }
    });
  }

  return {
    mode: apply ? 'apply' : 'dry-run',
    ...plan,
  };
}
