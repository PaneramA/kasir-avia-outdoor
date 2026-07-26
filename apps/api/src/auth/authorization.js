export function assertTenantManager(role) {
  if (!['owner', 'admin'].includes(String(role || '').trim().toLowerCase())) {
    const error = new Error('Tenant manager access is required');
    error.statusCode = 403;
    throw error;
  }
}

export function assertFeatureEnabled(subscription, featureKey) {
  if (subscription?.features?.[featureKey] !== true) {
    const error = new Error('Feature is not available for this subscription');
    error.statusCode = 403;
    throw error;
  }
}
