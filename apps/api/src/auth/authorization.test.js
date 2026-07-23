import { describe, expect, it } from 'vitest';
import * as authorization from './authorization.js';

describe('tenant authorization', () => {
  it.each(['owner', 'admin', ' ADMIN '])('allows tenant manager role %j', (role) => {
    expect(() => authorization.assertTenantManager(role)).not.toThrow();
  });

  it.each(['kasir', '', null, undefined])('rejects non-manager role %j', (role) => {
    expect(() => authorization.assertTenantManager(role)).toThrow(expect.objectContaining({
      message: 'Tenant manager access is required',
      statusCode: 403,
    }));
  });

  it('allows an explicitly enabled subscription feature', () => {
    expect(() => authorization.assertFeatureEnabled({
      features: { canUseFinancialRecap: true },
    }, 'canUseFinancialRecap')).not.toThrow();
  });

  it.each([
    undefined,
    null,
    {},
    { features: {} },
    { features: { canUseFinancialRecap: false } },
  ])('rejects a missing or disabled subscription feature', (subscription) => {
    expect(() => authorization.assertFeatureEnabled(
      subscription,
      'canUseFinancialRecap',
    )).toThrow(expect.objectContaining({
      message: 'Feature is not available for this subscription',
      statusCode: 403,
    }));
  });
});
