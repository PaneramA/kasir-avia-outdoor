const normalize = (value) => String(value || '').trim().toLowerCase();

export function planAccessBackfill({ users = [], tenants = [], branches = [] } = {}) {
  const assignments = [];
  const unresolved = [];

  for (const user of Array.isArray(users) ? users : []) {
    if (
      normalize(user?.role) === 'superuser'
      || (Array.isArray(user?.memberships) && user.memberships.length > 0)
      || (Array.isArray(user?.branchAccesses) && user.branchAccesses.length > 0)
    ) {
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
