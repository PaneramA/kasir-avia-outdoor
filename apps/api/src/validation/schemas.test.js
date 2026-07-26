import { describe, expect, it } from 'vitest';
import {
  createPlanSchema,
  createRentalSchema,
  onboardTenantSchema,
  updateItemSchema,
  updatePlanSchema,
  updateTenantSubscriptionSchema,
} from './schemas.js';

const validOnboarding = {
  storeName: 'Toko Uji',
  ownerUsername: 'owneruji',
  ownerPassword: 'password-kuat',
  planId: 'plan-1',
};

describe('API validation schemas', () => {
  it('applies safe onboarding defaults', () => {
    const parsed = onboardTenantSchema.parse(validOnboarding);
    expect(parsed).toMatchObject({
      tenantStatus: 'active',
      subscriptionStatus: 'active',
      initialBranchCode: 'pusat',
      initialBranchName: 'Toko Pusat',
    });
  });

  it('rejects an active tenant with an unusable subscription', () => {
    const result = onboardTenantSchema.safeParse({
      ...validOnboarding,
      subscriptionStatus: 'suspended',
    });
    expect(result.success).toBe(false);
    expect(result.error.issues[0].path).toEqual(['subscriptionStatus']);
  });

  it('rejects invalid subscription date ordering', () => {
    const result = onboardTenantSchema.safeParse({
      ...validOnboarding,
      startsAt: '2026-08-10T00:00:00.000Z',
      endsAt: '2026-08-01T00:00:00.000Z',
      graceEndsAt: '2026-07-31T00:00:00.000Z',
    });
    expect(result.success).toBe(false);
    expect(result.error.issues.map((issue) => issue.path[0])).toEqual(['endsAt', 'graceEndsAt']);
  });

  it('coerces rental numbers and supplies payment defaults', () => {
    const parsed = createRentalSchema.parse({
      customer: { name: 'Fuad', phone: '0812' },
      items: [{ id: 'item-1', qty: '2' }],
      duration: '3',
      payment: {},
    });
    expect(parsed.items[0]).toMatchObject({ qty: 2, notes: '' });
    expect(parsed.duration).toBe(3);
    expect(parsed.payment).toMatchObject({ status: 'LUNAS', method: 'TUNAI' });
  });

  it('rejects empty partial updates', () => {
    expect(updatePlanSchema.safeParse({}).success).toBe(false);
    expect(updateTenantSubscriptionSchema.safeParse({}).success).toBe(false);
  });

  it('requires the last observed item version when updating inventory', () => {
    const item = {
      name: 'Tenda Dome',
      category: 'Tenda',
      stock: 4,
      price: 50_000,
      image: '',
    };

    expect(updateItemSchema.safeParse(item).success).toBe(false);
    expect(updateItemSchema.parse({
      ...item,
      expectedUpdatedAt: '2026-07-22T04:30:00.000Z',
    }).expectedUpdatedAt).toBe('2026-07-22T04:30:00.000Z');
  });

  it('accepts feature values without losing their JSON type', () => {
    const parsed = createPlanSchema.parse({
      code: 'growth',
      name: 'Growth',
      features: [
        { key: 'canExportData', valueType: 'boolean', value: true },
        { key: 'limits', valueType: 'json', value: { branches: 3 } },
      ],
    });
    expect(parsed.features[0].value).toBe(true);
    expect(parsed.features[1].value).toEqual({ branches: 3 });
  });
});
