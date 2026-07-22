export function normalizeTenantRole(value) {
  return String(value || '').trim().toLowerCase();
}

export function isActiveStatus(value) {
  return String(value || '').trim().toLowerCase() === 'active';
}

export function canAccessAllTenantBranches(globalRole, membershipRole) {
  const normalizedGlobalRole = normalizeTenantRole(globalRole);
  const normalizedMembershipRole = normalizeTenantRole(membershipRole);

  return (
    normalizedGlobalRole === 'superuser'
    || normalizedGlobalRole === 'admin'
    || normalizedMembershipRole === 'owner'
    || normalizedMembershipRole === 'admin'
  );
}
