const normalize = (value) => String(value || '').trim().toLowerCase();

export function planAccessBackfill({ users = [], tenants = [], branches = [] } = {}) {
  const assignments = [];
  const unresolved = [];

  for (const user of Array.isArray(users) ? users : []) {
    if (normalize(user?.role) === 'superuser') {
      continue;
    }

    const memberships = Array.isArray(user?.memberships) ? user.memberships : [];
    const branchAccesses = Array.isArray(user?.branchAccesses) ? user.branchAccesses : [];
    const hasPrivilegedMembership = memberships.some((membership) => (
      normalize(membership?.status) === 'active'
      && ['owner', 'admin'].includes(normalize(membership?.role))
    ));
    if (hasPrivilegedMembership || (memberships.length > 0 && branchAccesses.length > 0)) {
      continue;
    }

    if (memberships.length > 0 || branchAccesses.length > 0) {
      unresolved.push({ userId: user.id, reason: 'partial-assignment' });
      continue;
    }

    const activeTenants = (Array.isArray(tenants) ? tenants : [])
      .filter((tenant) => normalize(tenant?.status) === 'active');

    if (activeTenants.length !== 1) {
      unresolved.push({ userId: user.id, reason: 'ambiguous-tenant' });
      continue;
    }

    const tenant = activeTenants[0];
    const activeBranches = (Array.isArray(branches) ? branches : [])
      .filter((branch) => (
        branch?.tenantId === tenant.id
        && normalize(branch?.status) === 'active'
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

export async function executeAccessBackfill({ database, apply = false } = {}) {
  if (!database) {
    throw new Error('Database client is required');
  }

  const [users, tenants, branches] = await Promise.all([
    database.user.findMany({
      select: {
        id: true,
        role: true,
        memberships: {
          select: { id: true, role: true, status: true },
        },
        branchAccesses: {
          select: { id: true },
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
  const plan = planAccessBackfill({ users, tenants, branches });

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
