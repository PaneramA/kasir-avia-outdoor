import { randomUUID } from 'node:crypto';
import { prisma } from './prisma.js';
import { hashPassword, verifyPassword } from '../auth/password.js';
import {
  canAccessAllTenantBranches,
  isActiveStatus,
} from './accessPolicy.js';

const DEFAULT_CATEGORIES = ['Tenda', 'Carrier', 'Alat Masak', 'Lainnya'];
const USER_ROLES = new Set(['admin', 'superuser', 'kasir']);
const TENANT_MEMBERSHIP_ROLES = new Set(['owner', 'admin', 'kasir']);
const TENANT_MEMBERSHIP_STATUSES = new Set(['active', 'inactive']);
const BRANCH_ACCESS_ROLES = new Set(['admin', 'kasir']);
const TENANT_STATUSES = new Set(['active', 'suspended']);
const PLAN_STATUSES = new Set(['active', 'inactive']);
const PLAN_PRICE_PERIODS = new Set(['monthly', 'yearly', 'custom']);
const PLAN_FEATURE_VALUE_TYPES = new Set(['boolean', 'integer', 'string', 'json']);
const SUBSCRIPTION_STATUSES = new Set(['trial', 'active', 'suspended', 'expired']);
const PAYMENT_STATUSES = new Set(['DP', 'LUNAS']);
const PAYMENT_METHODS = new Set(['QRIS', 'BANK', 'TUNAI']);
const RENTAL_DAY_COUNT_MODES = new Set(['ROLLING_24H', 'DAILY_CUTOFF']);
const RETURNED_RENTAL_STATUSES = new Set(['returned', 'selesai', 'completed', 'done']);
const DEFAULT_TENANT_SLUG = 'default-avia';
const DEFAULT_TENANT_NAME = 'AviaOutdoor';
const DEFAULT_BRANCH_CODE = 'pusat';
const DEFAULT_BRANCH_NAME = 'Toko Pusat';
const DEFAULT_TENANT_SETTINGS = {
  storeName: 'AviaOutdoor',
  addressLines: ['Jl. Contoh Alamat No. 123', 'Bandung, Jawa Barat'],
  phone: '0812-0000-0000',
  legalFooterLines: [
    'Barang yang sudah disewa menjadi tanggung jawab penyewa.',
    'Keterlambatan pengembalian dapat dikenakan biaya tambahan.',
  ],
  timezone: 'Asia/Jakarta',
  currency: 'IDR',
  rentalDayCountMode: 'ROLLING_24H',
  rentalCutoffHour: 8,
  rentalCutoffMinute: 0,
  financialClosingDay: 31,
};
const DEFAULT_PLAN_CATALOG = [
  {
    code: 'basic',
    name: 'Basic',
    description: 'Paket awal untuk satu toko kecil.',
    priceAmount: 0,
    pricePeriod: 'monthly',
    status: 'active',
    features: [
      { key: 'maxBranches', valueType: 'integer', value: 1 },
      { key: 'maxItems', valueType: 'integer', value: 150 },
      { key: 'maxMonthlyTransactions', valueType: 'integer', value: 300 },
      { key: 'maxTenantUsers', valueType: 'integer', value: 3 },
      { key: 'canManageBranches', valueType: 'boolean', value: true },
      { key: 'canManageStaff', valueType: 'boolean', value: true },
      { key: 'canUseFinancialRecap', valueType: 'boolean', value: false },
      { key: 'canUseMultiBranch', valueType: 'boolean', value: false },
      { key: 'canExportData', valueType: 'boolean', value: false },
    ],
  },
  {
    code: 'growth',
    name: 'Growth',
    description: 'Paket menengah untuk tenant dengan beberapa cabang.',
    priceAmount: 250000,
    pricePeriod: 'monthly',
    status: 'active',
    features: [
      { key: 'maxBranches', valueType: 'integer', value: 3 },
      { key: 'maxItems', valueType: 'integer', value: 1000 },
      { key: 'maxMonthlyTransactions', valueType: 'integer', value: 2500 },
      { key: 'maxTenantUsers', valueType: 'integer', value: 10 },
      { key: 'canManageBranches', valueType: 'boolean', value: true },
      { key: 'canManageStaff', valueType: 'boolean', value: true },
      { key: 'canUseFinancialRecap', valueType: 'boolean', value: true },
      { key: 'canUseMultiBranch', valueType: 'boolean', value: true },
      { key: 'canExportData', valueType: 'boolean', value: true },
    ],
  },
  {
    code: 'enterprise',
    name: 'Enterprise',
    description: 'Paket fleksibel untuk tenant besar.',
    priceAmount: 0,
    pricePeriod: 'custom',
    status: 'active',
    features: [
      { key: 'maxBranches', valueType: 'integer', value: 9999 },
      { key: 'maxItems', valueType: 'integer', value: 999999 },
      { key: 'maxMonthlyTransactions', valueType: 'integer', value: 999999 },
      { key: 'maxTenantUsers', valueType: 'integer', value: 9999 },
      { key: 'canManageBranches', valueType: 'boolean', value: true },
      { key: 'canManageStaff', valueType: 'boolean', value: true },
      { key: 'canUseFinancialRecap', valueType: 'boolean', value: true },
      { key: 'canUseMultiBranch', valueType: 'boolean', value: true },
      { key: 'canExportData', valueType: 'boolean', value: true },
    ],
  },
];

function createId(prefix) {
  return `${prefix}-${Date.now()}-${randomUUID().slice(0, 12)}`;
}

function normalizeRole(rawRole) {
  return String(rawRole || '').trim().toLowerCase();
}

function slugifyTenant(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function normalizePlanCode(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

function isSuperuserRole(rawRole) {
  return normalizeRole(rawRole) === 'superuser';
}

function isPlatformAdminRole(rawRole) {
  return isSuperuserRole(rawRole);
}

function normalizeRentalStatus(rawStatus) {
  return String(rawStatus || '').trim().toLowerCase();
}

function isReturnedRentalStatus(rawStatus) {
  return RETURNED_RENTAL_STATUSES.has(normalizeRentalStatus(rawStatus));
}

function isActiveRentalStatus(rawStatus) {
  const status = normalizeRentalStatus(rawStatus);
  if (!status) {
    return true;
  }

  return !isReturnedRentalStatus(status);
}

function toItemDto(item) {
  return {
    id: item.id,
    name: item.name,
    category: item.category?.name || item.categoryName || '',
    stock: item.stock,
    price: item.price,
    image: item.image || '',
    archivedAt: item.archivedAt ? item.archivedAt.toISOString() : null,
    updatedAt: item.updatedAt.toISOString(),
  };
}

function toRentalDto(rental) {
  const totalDue = Number(
    rental.finalTotal == null ? rental.total : rental.finalTotal,
  );
  const paymentStatus = String(rental.paymentStatus || 'LUNAS').toUpperCase();
  const rawPaidAmount = Math.max(0, Number(rental.paidAmount || 0));
  const normalizedPaidAmount = paymentStatus === 'LUNAS'
    ? (rawPaidAmount > 0 ? Math.min(rawPaidAmount, totalDue) : totalDue)
    : Math.min(rawPaidAmount, totalDue);
  const remainingAmount = Math.max(0, totalDue - normalizedPaidAmount);

  return {
    id: rental.id,
    customerId: rental.customerId || undefined,
    customer: {
      name: rental.customerName,
      phone: rental.customerPhone,
      guarantee: rental.guarantee,
      guaranteeOther: rental.guaranteeOther || '',
      idNumber: rental.idNumber || '',
    },
    items: rental.items.map((item) => ({
      id: item.itemId,
      name: item.itemName,
      category: item.categoryName,
      price: item.price,
      qty: item.qty,
      notes: item.notes || '',
    })),
    duration: rental.duration,
    total: rental.total,
    payment: {
      status: paymentStatus,
      method: rental.paymentMethod || 'TUNAI',
      paidAmount: normalizedPaidAmount,
      remainingAmount,
      totalDue,
    },
    status: rental.status,
    date: rental.date.toISOString(),
    plannedReturnDate: rental.plannedReturnDate ? rental.plannedReturnDate.toISOString() : undefined,
    returnDate: rental.returnDate ? rental.returnDate.toISOString() : undefined,
    returnNotes: rental.returnNotes || '',
    additionalFee: rental.additionalFee,
    finalTotal: rental.finalTotal ?? undefined,
  };
}

function toReturnDto(returnRecord) {
  return {
    id: returnRecord.id,
    rentalId: returnRecord.rentalId,
    customer: {
      name: returnRecord.customerName,
      phone: returnRecord.customerPhone,
    },
    items: Array.isArray(returnRecord.itemsJson) ? returnRecord.itemsJson : [],
    returnDate: returnRecord.returnDate.toISOString(),
    returnNotes: returnRecord.returnNotes || '',
    additionalFee: returnRecord.additionalFee,
    finalTotal: returnRecord.finalTotal,
  };
}

function toCustomerDto(customer) {
  return {
    id: customer.id,
    name: customer.name,
    phone: customer.phone,
    address: customer.address || '',
    guarantee: customer.guarantee,
    guaranteeOther: customer.guaranteeOther || '',
    idNumber: customer.idNumber || '',
    createdAt: customer.createdAt.toISOString(),
    updatedAt: customer.updatedAt.toISOString(),
  };
}

function normalizeLines(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((line) => String(line || '').trim())
    .filter(Boolean);
}

function toTenantSettingsDto(settings) {
  const rentalDayCountMode = String(settings.rentalDayCountMode || DEFAULT_TENANT_SETTINGS.rentalDayCountMode)
    .trim()
    .toUpperCase();
  const normalizedMode = RENTAL_DAY_COUNT_MODES.has(rentalDayCountMode)
    ? rentalDayCountMode
    : DEFAULT_TENANT_SETTINGS.rentalDayCountMode;
  const rentalCutoffHour = Number.isInteger(settings.rentalCutoffHour)
    ? Math.min(23, Math.max(0, settings.rentalCutoffHour))
    : DEFAULT_TENANT_SETTINGS.rentalCutoffHour;
  const rentalCutoffMinute = Number.isInteger(settings.rentalCutoffMinute)
    ? Math.min(59, Math.max(0, settings.rentalCutoffMinute))
    : DEFAULT_TENANT_SETTINGS.rentalCutoffMinute;
  const financialClosingDay = Number.isInteger(settings.financialClosingDay)
    ? Math.min(31, Math.max(1, settings.financialClosingDay))
    : DEFAULT_TENANT_SETTINGS.financialClosingDay;

  return {
    tenantId: settings.tenantId,
    storeName: settings.storeName,
    addressLines: normalizeLines(settings.addressLines),
    phone: settings.phone || '',
    legalFooterLines: normalizeLines(settings.legalFooterLines),
    timezone: settings.timezone || DEFAULT_TENANT_SETTINGS.timezone,
    currency: settings.currency || DEFAULT_TENANT_SETTINGS.currency,
    rentalDayCountMode: normalizedMode,
    rentalCutoffHour,
    rentalCutoffMinute,
    financialClosingDay,
    createdAt: settings.createdAt.toISOString(),
    updatedAt: settings.updatedAt.toISOString(),
  };
}

function parseIsoDate(value, fieldName) {
  const raw = String(value || '').trim();
  if (!raw) {
    return null;
  }

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`${fieldName} is invalid`);
  }

  return parsed;
}

function parseOptionalIsoDate(value, fieldName) {
  if (value == null) {
    return null;
  }

  return parseIsoDate(value, fieldName);
}

function normalizePlanPricePeriod(rawPeriod) {
  const normalized = String(rawPeriod || 'monthly').trim().toLowerCase();
  if (!PLAN_PRICE_PERIODS.has(normalized)) {
    throw new Error('Plan price period is invalid');
  }

  return normalized;
}

function normalizePlanStatus(rawStatus) {
  const normalized = String(rawStatus || 'active').trim().toLowerCase();
  if (!PLAN_STATUSES.has(normalized)) {
    throw new Error('Plan status is invalid');
  }

  return normalized;
}

function normalizeSubscriptionStatus(rawStatus) {
  const normalized = String(rawStatus || 'trial').trim().toLowerCase();
  if (!SUBSCRIPTION_STATUSES.has(normalized)) {
    throw new Error('Subscription status is invalid');
  }

  return normalized;
}

function normalizePlanFeatureValueType(rawValueType) {
  const normalized = String(rawValueType || 'integer').trim().toLowerCase();
  if (!PLAN_FEATURE_VALUE_TYPES.has(normalized)) {
    throw new Error('Plan feature value type is invalid');
  }

  return normalized;
}

function normalizePlanFeaturesInput(features) {
  const safeFeatures = Array.isArray(features) ? features : [];
  const seenKeys = new Set();

  return safeFeatures.map((feature, index) => {
    const key = String(feature?.key || '').trim();
    if (!key) {
      throw new Error(`Plan feature key is required at index ${index}`);
    }

    if (seenKeys.has(key)) {
      throw new Error(`Plan feature key must be unique: ${key}`);
    }
    seenKeys.add(key);

    const valueType = normalizePlanFeatureValueType(feature?.valueType);
    const rawValue = feature?.value;
    let valueJson;

    if (valueType === 'boolean') {
      if (typeof rawValue !== 'boolean') {
        throw new Error(`Plan feature ${key} must be boolean`);
      }
      valueJson = rawValue;
    } else if (valueType === 'integer') {
      const parsed = Number(rawValue);
      if (!Number.isFinite(parsed) || !Number.isInteger(parsed)) {
        throw new Error(`Plan feature ${key} must be integer`);
      }
      valueJson = parsed;
    } else if (valueType === 'string') {
      valueJson = String(rawValue ?? '').trim();
    } else {
      valueJson = rawValue ?? null;
    }

    return {
      key,
      valueType,
      valueJson,
    };
  });
}

function normalizeRentalDayCountMode(rawMode) {
  const mode = String(rawMode || DEFAULT_TENANT_SETTINGS.rentalDayCountMode)
    .trim()
    .toUpperCase();
  return RENTAL_DAY_COUNT_MODES.has(mode)
    ? mode
    : DEFAULT_TENANT_SETTINGS.rentalDayCountMode;
}

function normalizeCutoffHour(rawHour) {
  const parsed = Number(rawHour);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_TENANT_SETTINGS.rentalCutoffHour;
  }

  return Math.min(23, Math.max(0, Math.trunc(parsed)));
}

function normalizeCutoffMinute(rawMinute) {
  const parsed = Number(rawMinute);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_TENANT_SETTINGS.rentalCutoffMinute;
  }

  return Math.min(59, Math.max(0, Math.trunc(parsed)));
}

function normalizeFinancialClosingDay(rawDay) {
  const parsed = Number(rawDay);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_TENANT_SETTINGS.financialClosingDay;
  }

  return Math.min(31, Math.max(1, Math.trunc(parsed)));
}

function resolveRentalDayPolicy(settings) {
  return {
    mode: normalizeRentalDayCountMode(settings?.rentalDayCountMode),
    cutoffHour: normalizeCutoffHour(settings?.rentalCutoffHour),
    cutoffMinute: normalizeCutoffMinute(settings?.rentalCutoffMinute),
  };
}

function toCutoffBucketIndex(targetDate, cutoffHour, cutoffMinute) {
  const boundary = new Date(targetDate);
  boundary.setHours(cutoffHour, cutoffMinute, 0, 0);
  if (targetDate < boundary) {
    boundary.setDate(boundary.getDate() - 1);
  }

  return Math.floor(boundary.getTime() / (24 * 60 * 60 * 1000));
}

function calculateRentalDurationFromRange(startDate, endDate, rentalPolicy) {
  if (!(startDate instanceof Date) || Number.isNaN(startDate.getTime())) {
    throw new Error('rentalStartAt is invalid');
  }

  if (!(endDate instanceof Date) || Number.isNaN(endDate.getTime())) {
    throw new Error('rentalEndAt is invalid');
  }

  const diffMs = endDate.getTime() - startDate.getTime();
  if (diffMs <= 0) {
    throw new Error('rentalEndAt must be after rentalStartAt');
  }

  if (rentalPolicy.mode === 'DAILY_CUTOFF') {
    const startBucket = toCutoffBucketIndex(startDate, rentalPolicy.cutoffHour, rentalPolicy.cutoffMinute);
    const endBucket = toCutoffBucketIndex(endDate, rentalPolicy.cutoffHour, rentalPolicy.cutoffMinute);
    return Math.max(1, (endBucket - startBucket) + 1);
  }

  const dayMs = 24 * 60 * 60 * 1000;
  return Math.max(1, Math.ceil(diffMs / dayMs));
}

function toBranchSettingsDto(settings) {
  return {
    branchId: settings.branchId,
    storeName: settings.storeName || '',
    addressLines: normalizeLines(settings.addressLines),
    phone: settings.phone || '',
    legalFooterLines: normalizeLines(settings.legalFooterLines),
    createdAt: settings.createdAt.toISOString(),
    updatedAt: settings.updatedAt.toISOString(),
  };
}

function toBranchDto(branch) {
  return {
    id: branch.id,
    tenantId: branch.tenantId,
    code: branch.code,
    name: branch.name,
    status: branch.status,
    createdAt: branch.createdAt.toISOString(),
    updatedAt: branch.updatedAt.toISOString(),
  };
}

function toTenantMembershipDto(membership) {
  return {
    id: membership.id,
    userId: membership.userId,
    tenantId: membership.tenantId,
    username: membership.user?.username || '',
    role: membership.role,
    status: membership.status,
    createdAt: membership.createdAt.toISOString(),
    updatedAt: membership.updatedAt.toISOString(),
  };
}

function toTenantDto(tenant) {
  const ownerUsernames = Array.isArray(tenant.memberships)
    ? tenant.memberships
      .filter((membership) => String(membership?.role || '').trim().toLowerCase() === 'owner')
      .map((membership) => String(membership?.user?.username || '').trim())
      .filter(Boolean)
    : [];

  return {
    id: tenant.id,
    slug: tenant.slug,
    name: tenant.name,
    status: tenant.status,
    ownerUsernames,
    branchCount: typeof tenant?._count?.branches === 'number' ? tenant._count.branches : undefined,
    membershipCount: typeof tenant?._count?.memberships === 'number' ? tenant._count.memberships : undefined,
    subscription: tenant.subscription ? toTenantSubscriptionDto(tenant.subscription) : null,
    createdAt: tenant.createdAt.toISOString(),
    updatedAt: tenant.updatedAt.toISOString(),
  };
}

function toBranchAccessDto(access) {
  return {
    id: access.id,
    userId: access.userId,
    username: access.user?.username || '',
    branchId: access.branchId,
    branchCode: access.branch?.code || '',
    branchName: access.branch?.name || '',
    role: access.role,
    createdAt: access.createdAt.toISOString(),
  };
}

function toPlanFeatureDto(feature) {
  return {
    id: feature.id,
    key: feature.key,
    valueType: feature.valueType,
    value: feature.valueJson,
    createdAt: feature.createdAt.toISOString(),
    updatedAt: feature.updatedAt.toISOString(),
  };
}

function toPlanDto(plan) {
  return {
    id: plan.id,
    code: plan.code,
    name: plan.name,
    description: plan.description || '',
    priceAmount: plan.priceAmount,
    pricePeriod: plan.pricePeriod,
    status: plan.status,
    features: Array.isArray(plan.features)
      ? [...plan.features]
        .sort((left, right) => left.key.localeCompare(right.key))
        .map(toPlanFeatureDto)
      : [],
    tenantCount: typeof plan?._count?.subscriptions === 'number' ? plan._count.subscriptions : undefined,
    createdAt: plan.createdAt.toISOString(),
    updatedAt: plan.updatedAt.toISOString(),
  };
}

function toTenantSubscriptionDto(subscription) {
  return {
    id: subscription.id,
    tenantId: subscription.tenantId,
    planId: subscription.planId,
    status: subscription.status,
    startsAt: subscription.startsAt.toISOString(),
    endsAt: subscription.endsAt ? subscription.endsAt.toISOString() : null,
    graceEndsAt: subscription.graceEndsAt ? subscription.graceEndsAt.toISOString() : null,
    billingNotes: subscription.billingNotes || '',
    plan: subscription.plan ? toPlanDto(subscription.plan) : null,
    createdAt: subscription.createdAt.toISOString(),
    updatedAt: subscription.updatedAt.toISOString(),
  };
}

function toTenantSubscriptionSummaryDto(tenant) {
  return {
    tenantId: tenant.id,
    tenantSlug: tenant.slug,
    tenantName: tenant.name,
    tenantStatus: tenant.status,
    tenantCreatedAt: tenant.createdAt.toISOString(),
    tenantUpdatedAt: tenant.updatedAt.toISOString(),
    subscription: tenant.subscription ? toTenantSubscriptionDto(tenant.subscription) : null,
  };
}

function toQuotaSummary(used, limit) {
  const normalizedUsed = Number.isFinite(Number(used)) ? Math.max(0, Number(used)) : 0;
  const normalizedLimit = Number.isFinite(Number(limit)) ? Number(limit) : 0;
  const isLimited = normalizedLimit > 0;

  return {
    used: normalizedUsed,
    limit: isLimited ? normalizedLimit : null,
    remaining: isLimited ? Math.max(0, normalizedLimit - normalizedUsed) : null,
    isUnlimited: !isLimited,
  };
}

async function ensureDefaultPlanCatalog(tx) {
  for (const planDefinition of DEFAULT_PLAN_CATALOG) {
    const plan = await tx.plan.upsert({
      where: { code: planDefinition.code },
      update: {},
      create: {
        code: planDefinition.code,
        name: planDefinition.name,
        description: planDefinition.description,
        priceAmount: planDefinition.priceAmount,
        pricePeriod: planDefinition.pricePeriod,
        status: planDefinition.status,
      },
    });

    const features = normalizePlanFeaturesInput(planDefinition.features);
    for (const feature of features) {
      await tx.planFeature.upsert({
        where: {
          planId_key: {
            planId: plan.id,
            key: feature.key,
          },
        },
        update: {},
        create: {
          planId: plan.id,
          key: feature.key,
          valueType: feature.valueType,
          valueJson: feature.valueJson,
        },
      });
    }
  }
}

async function getPlanByCode(tx, planCode) {
  const normalizedCode = normalizePlanCode(planCode);
  if (!normalizedCode) {
    throw new Error('Plan code is required');
  }

  await ensureDefaultPlanCatalog(tx);
  const plan = await tx.plan.findUnique({
    where: { code: normalizedCode },
  });

  if (!plan) {
    throw new Error('Plan not found');
  }

  return plan;
}

async function ensureTenantSubscriptionForTenant(tx, tenantId, options = {}) {
  const targetTenantId = String(tenantId || '').trim();
  if (!targetTenantId) {
    throw new Error('Tenant id is required');
  }

  const plan = options.planId
    ? await tx.plan.findUnique({ where: { id: options.planId } })
    : await getPlanByCode(tx, options.planCode || 'basic');

  if (!plan) {
    throw new Error('Plan not found');
  }

  const subscriptionStatus = normalizeSubscriptionStatus(
    options.status || 'trial',
  );

  return tx.tenantSubscription.upsert({
    where: { tenantId: targetTenantId },
    update: {
      ...(options.forcePlanUpdate ? { planId: plan.id } : {}),
      ...(options.forceStatusUpdate ? { status: subscriptionStatus } : {}),
      ...(options.startsAt instanceof Date ? { startsAt: options.startsAt } : {}),
      ...(Object.prototype.hasOwnProperty.call(options, 'endsAt') ? { endsAt: options.endsAt } : {}),
      ...(Object.prototype.hasOwnProperty.call(options, 'graceEndsAt') ? { graceEndsAt: options.graceEndsAt } : {}),
      ...(Object.prototype.hasOwnProperty.call(options, 'billingNotes') ? { billingNotes: options.billingNotes } : {}),
    },
    create: {
      tenantId: targetTenantId,
      planId: plan.id,
      status: subscriptionStatus,
      startsAt: options.startsAt instanceof Date ? options.startsAt : new Date(),
      ...(options.endsAt instanceof Date ? { endsAt: options.endsAt } : {}),
      ...(options.graceEndsAt instanceof Date ? { graceEndsAt: options.graceEndsAt } : {}),
      ...(typeof options.billingNotes === 'string' ? { billingNotes: options.billingNotes } : {}),
    },
  });
}

async function ensureDefaultTenantAndBranch(tx) {
  const tenant = await tx.tenant.upsert({
    where: { slug: DEFAULT_TENANT_SLUG },
    update: {},
    create: {
      slug: DEFAULT_TENANT_SLUG,
      name: DEFAULT_TENANT_NAME,
      status: 'active',
    },
  });

  await tx.branch.upsert({
    where: {
      tenantId_code: {
        tenantId: tenant.id,
        code: DEFAULT_BRANCH_CODE,
      },
    },
    update: {},
    create: {
      tenantId: tenant.id,
      code: DEFAULT_BRANCH_CODE,
      name: DEFAULT_BRANCH_NAME,
      status: 'active',
    },
  });

  await tx.tenantSettings.upsert({
    where: { tenantId: tenant.id },
    update: {},
    create: {
      tenantId: tenant.id,
      storeName: DEFAULT_TENANT_SETTINGS.storeName,
      addressLines: DEFAULT_TENANT_SETTINGS.addressLines,
      phone: DEFAULT_TENANT_SETTINGS.phone,
      legalFooterLines: DEFAULT_TENANT_SETTINGS.legalFooterLines,
      timezone: DEFAULT_TENANT_SETTINGS.timezone,
      currency: DEFAULT_TENANT_SETTINGS.currency,
      rentalDayCountMode: DEFAULT_TENANT_SETTINGS.rentalDayCountMode,
      rentalCutoffHour: DEFAULT_TENANT_SETTINGS.rentalCutoffHour,
      rentalCutoffMinute: DEFAULT_TENANT_SETTINGS.rentalCutoffMinute,
    },
  });

  return tenant;
}

export async function initDatabase(env) {
  await prisma.$connect();
  const adminPasswordHash = await hashPassword(env.adminPassword, env.passwordPepper);

  await prisma.$transaction(async (tx) => {
    const defaultTenant = await ensureDefaultTenantAndBranch(tx);
    await ensureDefaultPlanCatalog(tx);

    const adminUser = await tx.user.upsert({
      where: { username: env.adminUsername },
      update: {
        role: 'superuser',
      },
      create: {
        username: env.adminUsername,
        passwordHash: adminPasswordHash,
        role: 'superuser',
      },
    });

    await tx.userMembership.upsert({
      where: {
        userId_tenantId: {
          userId: adminUser.id,
          tenantId: defaultTenant.id,
        },
      },
      update: {
        role: 'owner',
        status: 'active',
      },
      create: {
        userId: adminUser.id,
        tenantId: defaultTenant.id,
        role: 'owner',
        status: 'active',
      },
    });

    await ensureTenantSubscriptionForTenant(tx, defaultTenant.id, {
      planCode: 'basic',
      status: 'active',
    });

    for (const categoryName of DEFAULT_CATEGORIES) {
      await tx.category.upsert({
        where: {
          tenantId_name: {
            tenantId: defaultTenant.id,
            name: categoryName,
          },
        },
        update: {},
        create: {
          name: categoryName,
          tenantId: defaultTenant.id,
        },
      });
    }
  });
}

export async function listCategories(context) {
  const categories = await prisma.category.findMany({
    where: withTenantScope({}, context),
    orderBy: { name: 'asc' },
  });

  return categories.map((category) => category.name);
}

export async function createCategory(name, context) {
  const tenantId = requireTenantId(context);
  const normalized = String(name || '').trim();
  if (!normalized) {
    throw new Error('Category name is required');
  }

  const exists = await prisma.category.findFirst({
    where: withTenantScope({
      name: {
        equals: normalized,
        mode: 'insensitive',
      },
    }, context),
  });

  if (exists) {
    throw new Error('Category already exists');
  }

  const created = await prisma.category.create({
    data: {
      name: normalized,
      tenantId,
    },
  });

  return created.name;
}

export async function deleteCategory(name, context) {
  const normalized = String(name || '').trim();

  const existing = await prisma.category.findFirst({
    where: withTenantScope({
      name: {
        equals: normalized,
        mode: 'insensitive',
      },
    }, context),
  });

  if (!existing) {
    throw new Error('Category not found');
  }

  const itemCount = await prisma.item.count({
    where: withTenantBranchScope({ categoryId: existing.id }, context),
  });

  if (itemCount > 0) {
    throw new Error('Category is used by existing items');
  }

  await prisma.category.delete({
    where: { id: existing.id },
  });

  return existing.name;
}

export async function listItems(context) {
  const items = await prisma.item.findMany({
    where: withTenantBranchScope({ archivedAt: null }, context),
    include: { category: true },
    orderBy: { createdAt: 'asc' },
  });

  return items.map(toItemDto);
}

function itemArchiveWhere(rawStatus = 'active') {
  const status = String(rawStatus || 'active').trim().toLowerCase();
  if (status === 'active') return { archivedAt: null };
  if (status === 'archived') return { archivedAt: { not: null } };
  if (status === 'all') return {};
  throw new Error('Item status is invalid');
}

export async function listItemsPage({ query, cursor, limit = 50, status = 'active' } = {}, context) {
  const keyword = String(query || '').trim();
  const pageSize = Math.min(100, Math.max(1, Math.trunc(Number(limit) || 50)));
  const where = withTenantBranchScope({
    ...itemArchiveWhere(status),
    ...(keyword ? {
      OR: [
        { name: { contains: keyword, mode: 'insensitive' } },
        { category: { name: { contains: keyword, mode: 'insensitive' } } },
      ],
    } : {}),
  }, context);
  const items = await prisma.item.findMany({
    where,
    ...(cursor ? { cursor: { id: String(cursor) }, skip: 1 } : {}),
    take: pageSize + 1,
    include: { category: true },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  });
  const hasNextPage = items.length > pageSize;
  const pageItems = hasNextPage ? items.slice(0, pageSize) : items;

  return {
    items: pageItems.map(toItemDto),
    nextCursor: hasNextPage ? pageItems.at(-1)?.id || null : null,
  };
}

export async function createItem(payload, context) {
  const tenantId = requireTenantId(context);
  const branchId = String(context?.branchId || '').trim() || null;
  const name = String(payload?.name || '').trim();
  const categoryName = String(payload?.category || '').trim();
  const stock = Number(payload?.stock);
  const price = Number(payload?.price);

  if (!name) {
    throw new Error('Item name is required');
  }

  if (!categoryName) {
    throw new Error('Item category is required');
  }

  if (!Number.isFinite(stock) || stock < 0) {
    throw new Error('Stock must be a number >= 0');
  }

  if (!Number.isFinite(price) || price < 0) {
    throw new Error('Price must be a number >= 0');
  }

  await assertTenantCanCreateItem(tenantId);

  const category = await prisma.category.findFirst({
    where: withTenantScope({
      name: {
        equals: categoryName,
        mode: 'insensitive',
      },
    }, context),
  });

  if (!category) {
    throw new Error('Category does not exist');
  }

  const item = await prisma.item.create({
    data: {
      ...(payload?.id ? { id: String(payload.id) } : {}),
      name,
      categoryId: category.id,
      tenantId,
      branchId,
      stock,
      price,
      image: payload?.image || '',
    },
    include: { category: true },
  });

  return toItemDto(item);
}

export async function updateItem(id, payload, context) {
  const tenantId = requireTenantId(context);
  const branchId = String(context?.branchId || '').trim() || null;
  const targetId = String(id);

  const existing = await prisma.item.findUnique({
    where: { id: targetId },
  });

  if (!existing) {
    throw new Error('Item not found');
  }

  if (context?.tenantId && existing.tenantId && existing.tenantId !== context.tenantId) {
    throw new Error('Forbidden');
  }

  if (context?.branchId && existing.branchId && existing.branchId !== context.branchId) {
    throw new Error('Forbidden');
  }

  const name = String(payload?.name || '').trim();
  const categoryName = String(payload?.category || '').trim();
  const stock = Number(payload?.stock);
  const price = Number(payload?.price);
  const expectedUpdatedAt = new Date(payload?.expectedUpdatedAt);

  if (!name) {
    throw new Error('Item name is required');
  }

  if (!categoryName) {
    throw new Error('Item category is required');
  }

  if (!Number.isFinite(stock) || stock < 0) {
    throw new Error('Stock must be a number >= 0');
  }

  if (!Number.isFinite(price) || price < 0) {
    throw new Error('Price must be a number >= 0');
  }

  const category = await prisma.category.findFirst({
    where: withTenantScope({
      name: {
        equals: categoryName,
        mode: 'insensitive',
      },
    }, context),
  });

  if (!category) {
    throw new Error('Category does not exist');
  }

  const updateResult = await prisma.item.updateMany({
    where: withTenantBranchScope({
      id: targetId,
      archivedAt: null,
      updatedAt: expectedUpdatedAt,
    }, context),
    data: {
      name,
      categoryId: category.id,
      tenantId,
      branchId,
      stock,
      price,
      image: payload?.image || '',
    },
  });

  if (updateResult.count !== 1) {
    throw new Error('Item changed after it was loaded. Refresh and try again');
  }

  const updated = await prisma.item.findUnique({
    where: { id: targetId },
    include: { category: true },
  });

  if (!updated) {
    throw new Error('Item not found');
  }

  return toItemDto(updated);
}

async function findScopedItem(id, context) {
  const targetId = String(id);

  const existing = await prisma.item.findUnique({
    where: { id: targetId },
    include: { category: true },
  });

  if (!existing) {
    throw new Error('Item not found');
  }

  if (context?.tenantId && existing.tenantId && existing.tenantId !== context.tenantId) {
    throw new Error('Forbidden');
  }

  if (context?.branchId && existing.branchId && existing.branchId !== context.branchId) {
    throw new Error('Forbidden');
  }

  return existing;
}

export async function archiveItem(id, context) {
  const existing = await findScopedItem(id, context);
  const actorUserId = String(context?.actorUserId || '').trim();
  if (!actorUserId) {
    throw new Error('Actor user id is required');
  }

  if (existing.archivedAt) {
    return toItemDto(existing);
  }

  return prisma.$transaction(async (tx) => {
    const archivedAt = new Date();
    const claimed = await tx.item.updateMany({
      where: { id: existing.id, archivedAt: null },
      data: { archivedAt },
    });

    if (claimed.count === 1) {
      await tx.auditLog.create({
        data: {
          actorUserId,
          tenantId: context.tenantId,
          branchId: context.branchId,
          action: 'item.archive',
          targetType: 'item',
          targetId: existing.id,
          snapshotBefore: toItemDto(existing),
        },
      });
    }

    const archived = await tx.item.findUnique({
      where: { id: existing.id },
      include: { category: true },
    });

    return toItemDto(archived);
  });
}

export async function restoreItem(id, context) {
  const existing = await findScopedItem(id, context);
  const actorUserId = String(context?.actorUserId || '').trim();
  if (!actorUserId) {
    throw new Error('Actor user id is required');
  }

  if (!existing.archivedAt) {
    return toItemDto(existing);
  }

  return prisma.$transaction(async (tx) => {
    const claimed = await tx.item.updateMany({
      where: { id: existing.id, archivedAt: { not: null } },
      data: { archivedAt: null },
    });

    if (claimed.count === 1) {
      await tx.auditLog.create({
        data: {
          actorUserId,
          tenantId: context.tenantId,
          branchId: context.branchId,
          action: 'item.restore',
          targetType: 'item',
          targetId: existing.id,
          snapshotBefore: toItemDto(existing),
        },
      });
    }

    const restored = await tx.item.findUnique({
      where: { id: existing.id },
      include: { category: true },
    });

    return toItemDto(restored);
  });
}

export async function listRentals({ status } = {}, context) {
  const where = withTenantBranchScope({
    deletedAt: null,
    ...(status ? { status } : {}),
  }, context, { includeBranchNull: false });

  const rentals = await prisma.rental.findMany({
    where,
    include: {
      items: true,
    },
    orderBy: { date: 'asc' },
  });

  return rentals.map(toRentalDto);
}

function parseJakartaDateBoundary(value, boundary) {
  const dateKey = String(value || '').trim();
  if (!dateKey) {
    return null;
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
    throw new Error('Date filter must use YYYY-MM-DD');
  }

  const suffix = boundary === 'end' ? 'T23:59:59.999+07:00' : 'T00:00:00.000+07:00';
  const parsed = new Date(`${dateKey}${suffix}`);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error('Date filter is invalid');
  }

  return parsed;
}

function getJakartaDateParts(dateValue = new Date()) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = formatter.formatToParts(dateValue);
  const year = Number(parts.find((part) => part.type === 'year')?.value);
  const month = Number(parts.find((part) => part.type === 'month')?.value);
  const day = Number(parts.find((part) => part.type === 'day')?.value);
  return { year, month, day };
}

function toDateKey(year, month, day) {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function getDaysInMonth(year, month) {
  return new Date(year, month, 0).getDate();
}

function getCurrentFinancialPeriod(financialClosingDay, now = new Date()) {
  const { year, month, day } = getJakartaDateParts(now);
  const closingDay = Math.min(31, Math.max(1, Number(financialClosingDay) || 31));
  const periodMonth = day <= Math.min(closingDay, getDaysInMonth(year, month)) ? month : month + 1;
  const periodYear = periodMonth === 13 ? year + 1 : year;
  const normalizedPeriodMonth = periodMonth === 13 ? 1 : periodMonth;
  const previousMonth = normalizedPeriodMonth === 1 ? 12 : normalizedPeriodMonth - 1;
  const previousYear = normalizedPeriodMonth === 1 ? periodYear - 1 : periodYear;
  const previousClosingDay = Math.min(closingDay, getDaysInMonth(previousYear, previousMonth));
  const currentClosingDay = Math.min(closingDay, getDaysInMonth(periodYear, normalizedPeriodMonth));
  const startDateValue = new Date(previousYear, previousMonth - 1, previousClosingDay);
  startDateValue.setDate(startDateValue.getDate() + 1);

  return {
    monthKey: `${periodYear}-${String(normalizedPeriodMonth).padStart(2, '0')}`,
    startDate: toDateKey(startDateValue.getFullYear(), startDateValue.getMonth() + 1, startDateValue.getDate()),
    endDate: toDateKey(periodYear, normalizedPeriodMonth, currentClosingDay),
  };
}

export async function getDashboardSummary({ recentStatus } = {}, context) {
  const tenantId = requireTenantId(context);
  const tenantSettings = await prisma.tenantSettings.findUnique({
    where: { tenantId },
    select: { financialClosingDay: true },
  });
  const financialPeriod = getCurrentFinancialPeriod(tenantSettings?.financialClosingDay);
  const activeRentalWhere = withTenantBranchScope({
    deletedAt: null,
    status: { notIn: ['Returned', 'returned', 'selesai', 'completed', 'done'] },
  }, context, { includeBranchNull: false });
  const monthlyRentalWhere = withTenantBranchScope({
    deletedAt: null,
    date: {
      gte: parseJakartaDateBoundary(financialPeriod.startDate, 'start'),
      lte: parseJakartaDateBoundary(financialPeriod.endDate, 'end'),
    },
  }, context, { includeBranchNull: false });
  const normalizedRecentStatus = String(recentStatus || '').trim().toLowerCase();
  const recentWhere = normalizedRecentStatus === 'active'
    ? activeRentalWhere
    : normalizedRecentStatus === 'returned'
      ? withTenantBranchScope({
          deletedAt: null,
          status: { in: ['Returned', 'returned', 'selesai', 'completed', 'done'] },
        }, context, { includeBranchNull: false })
      : withTenantBranchScope({ deletedAt: null }, context, { includeBranchNull: false });

  const [stock, activeRentals, itemsOut, finalTotal, originalTotal, recentRentals] = await Promise.all([
    prisma.item.aggregate({
      where: withTenantBranchScope({ archivedAt: null }, context),
      _sum: { stock: true },
    }),
    prisma.rental.count({ where: activeRentalWhere }),
    prisma.rentalItem.aggregate({
      where: { rental: activeRentalWhere },
      _sum: { qty: true },
    }),
    prisma.rental.aggregate({
      where: { ...monthlyRentalWhere, finalTotal: { not: null } },
      _sum: { finalTotal: true },
    }),
    prisma.rental.aggregate({
      where: { ...monthlyRentalWhere, finalTotal: null },
      _sum: { total: true },
    }),
    prisma.rental.findMany({
      where: recentWhere,
      include: { items: true },
      take: 5,
      orderBy: normalizedRecentStatus === 'active'
        ? [{ plannedReturnDate: 'asc' }, { id: 'desc' }]
        : [{ date: 'desc' }, { id: 'desc' }],
    }),
  ]);

  return {
    period: financialPeriod,
    stats: {
      availableStock: Number(stock._sum.stock || 0),
      activeRentals,
      itemsOut: Number(itemsOut._sum.qty || 0),
      revenue: Number(finalTotal._sum.finalTotal || 0) + Number(originalTotal._sum.total || 0),
    },
    recentRentals: recentRentals.map(toRentalDto),
  };
}

function getRentalAmount(rental) {
  return Math.max(0, Number(rental?.finalTotal ?? rental?.total ?? 0) || 0);
}

async function getFinancialRecapSummary({ startDate, endDate } = {}, context) {
  const startAt = parseJakartaDateBoundary(startDate, 'start');
  const endAt = parseJakartaDateBoundary(endDate, 'end');
  const date = {
    ...(startAt ? { gte: startAt } : {}),
    ...(endAt ? { lte: endAt } : {}),
  };
  const where = withTenantBranchScope({
    deletedAt: null,
    ...(Object.keys(date).length > 0 ? { date } : {}),
  }, context, { includeBranchNull: false });
  const tenantRentalWhere = withTenantBranchScope({ deletedAt: null }, context, { includeBranchNull: false });
  const [rentals, rentalItems, tenantRentalDates] = await Promise.all([
    prisma.rental.findMany({
      where,
      select: {
        id: true,
        date: true,
        total: true,
        finalTotal: true,
        paymentMethod: true,
      },
    }),
    prisma.rentalItem.findMany({
      where: { rental: where },
      select: {
        itemName: true,
        categoryName: true,
        price: true,
        qty: true,
        rental: { select: { duration: true } },
      },
    }),
    prisma.rental.findMany({
      where: tenantRentalWhere,
      select: { date: true },
    }),
  ]);

  const methodBuckets = new Map();
  const monthBuckets = new Map();
  let totalRevenue = 0;

  for (const rental of rentals) {
    const amount = getRentalAmount(rental);
    totalRevenue += amount;
    const method = String(rental.paymentMethod || 'TUNAI').toUpperCase();
    const methodBucket = methodBuckets.get(method) || { method, count: 0, revenue: 0 };
    methodBucket.count += 1;
    methodBucket.revenue += amount;
    methodBuckets.set(method, methodBucket);

    const { year, month } = getJakartaDateParts(rental.date);
    const monthKey = `${year}-${String(month).padStart(2, '0')}`;
    const monthBucket = monthBuckets.get(monthKey) || { monthKey, revenue: 0, transactions: 0 };
    monthBucket.revenue += amount;
    monthBucket.transactions += 1;
    monthBuckets.set(monthKey, monthBucket);
  }

  const itemBuckets = new Map();
  for (const item of rentalItems) {
    const key = `${item.categoryName || ''}:${item.itemName || ''}`;
    const bucket = itemBuckets.get(key) || {
      key,
      name: item.itemName || '-',
      category: item.categoryName || '',
      qty: 0,
      estimatedRevenue: 0,
    };
    const qty = Math.max(0, Number(item.qty || 0));
    bucket.qty += qty;
    bucket.estimatedRevenue += Math.max(0, Number(item.price || 0)) * qty * Math.max(1, Number(item.rental?.duration || 1));
    itemBuckets.set(key, bucket);
  }

  const availableMonths = [...new Set(tenantRentalDates.map((rental) => {
    const { year, month } = getJakartaDateParts(rental.date);
    return `${year}-${String(month).padStart(2, '0')}`;
  }))].sort((a, b) => b.localeCompare(a));

  return {
    startDate: String(startDate || ''),
    endDate: String(endDate || ''),
    totalRevenue,
    totalTransactions: rentals.length,
    averageTransaction: rentals.length > 0 ? totalRevenue / rentals.length : 0,
    methods: [...methodBuckets.values()].sort((a, b) => b.revenue - a.revenue),
    topItems: [...itemBuckets.values()].sort((a, b) => b.estimatedRevenue - a.estimatedRevenue),
    monthlyTrend: [...monthBuckets.values()].sort((a, b) => a.monthKey.localeCompare(b.monthKey)),
    availableMonths,
  };
}

export async function getFinancialRecapPage({ startDate, endDate, cursor, limit = 50 } = {}, context) {
  const startAt = parseJakartaDateBoundary(startDate, 'start');
  const endAt = parseJakartaDateBoundary(endDate, 'end');
  const date = {
    ...(startAt ? { gte: startAt } : {}),
    ...(endAt ? { lte: endAt } : {}),
  };
  const where = withTenantBranchScope({
    deletedAt: null,
    ...(Object.keys(date).length > 0 ? { date } : {}),
  }, context, { includeBranchNull: false });
  const pageSize = Math.min(100, Math.max(1, Math.trunc(Number(limit) || 50)));
  const [rentals, summary] = await Promise.all([
    prisma.rental.findMany({
      where,
      ...(cursor ? { cursor: { id: String(cursor) }, skip: 1 } : {}),
      take: pageSize + 1,
      include: { items: true },
      orderBy: [{ date: 'desc' }, { id: 'desc' }],
    }),
    cursor ? Promise.resolve(null) : getFinancialRecapSummary({ startDate, endDate }, context),
  ]);
  const hasNextPage = rentals.length > pageSize;
  const pageRentals = hasNextPage ? rentals.slice(0, pageSize) : rentals;

  return {
    summary,
    items: pageRentals.map(toRentalDto),
    nextCursor: hasNextPage ? pageRentals.at(-1)?.id || null : null,
  };
}

export async function listRentalHistoryPage({
  status,
  query,
  startDate,
  endDate,
  cursor,
  limit = 50,
} = {}, context) {
  const normalizedStatus = String(status || '').trim();
  const keyword = String(query || '').trim();
  const pageSize = Math.min(100, Math.max(1, Math.trunc(Number(limit) || 50)));
  const startAt = parseJakartaDateBoundary(startDate, 'start');
  const endAt = parseJakartaDateBoundary(endDate, 'end');
  const date = {
    ...(startAt ? { gte: startAt } : {}),
    ...(endAt ? { lte: endAt } : {}),
  };
  const where = withTenantBranchScope({
    deletedAt: null,
    ...(normalizedStatus ? { status: normalizedStatus } : {}),
    ...(Object.keys(date).length > 0 ? { date } : {}),
    ...(keyword ? {
      OR: [
        { id: { contains: keyword, mode: 'insensitive' } },
        { customerName: { contains: keyword, mode: 'insensitive' } },
        { customerPhone: { contains: keyword, mode: 'insensitive' } },
      ],
    } : {}),
  }, context, { includeBranchNull: false });

  const rentals = await prisma.rental.findMany({
    where,
    ...(cursor ? { cursor: { id: String(cursor) }, skip: 1 } : {}),
    take: pageSize + 1,
    include: { items: true },
    orderBy: [{ date: 'desc' }, { id: 'desc' }],
  });

  const hasNextPage = rentals.length > pageSize;
  const pageRentals = hasNextPage ? rentals.slice(0, pageSize) : rentals;
  let summary = null;
  if (!cursor) {
    const [statusCounts, finalTotal, originalTotal] = await Promise.all([
      prisma.rental.groupBy({
        by: ['status'],
        where,
        _count: { id: true },
      }),
      prisma.rental.aggregate({
        where: { ...where, finalTotal: { not: null } },
        _sum: { finalTotal: true },
      }),
      prisma.rental.aggregate({
        where: { ...where, finalTotal: null },
        _sum: { total: true },
      }),
    ]);
    const countByStatus = new Map(statusCounts.map((entry) => [normalizeRentalStatus(entry.status), entry._count.id]));
    summary = {
      totalTransactions: statusCounts.reduce((sum, entry) => sum + entry._count.id, 0),
      activeTransactions: countByStatus.get('active') || 0,
      returnedTransactions: [...countByStatus.entries()]
        .filter(([entryStatus]) => isReturnedRentalStatus(entryStatus))
        .reduce((sum, [, count]) => sum + count, 0),
      totalRevenue: Number(finalTotal._sum.finalTotal || 0) + Number(originalTotal._sum.total || 0),
    };
  }

  return {
    items: pageRentals.map(toRentalDto),
    nextCursor: hasNextPage ? pageRentals.at(-1)?.id || null : null,
    summary,
  };
}

export async function createRental(payload, context) {
  const tenantId = requireTenantId(context);
  const branchId = requireBranchId(context);
  const customer = payload?.customer || {};
  const customerName = String(customer.name || '').trim();
  const customerPhone = String(customer.phone || '').trim();
  const customerAddress = String(customer.address || '').trim();
  const guarantee = String(customer.guarantee || 'KTP').trim() || 'KTP';
  const guaranteeOther = guarantee === 'Lainnya' ? String(customer.guaranteeOther || '').trim() : '';
  const rawIdNumber = String(customer.idNumber || '').trim();
  const hasExplicitIdNumber = rawIdNumber !== '' && rawIdNumber !== '0';
  const customerIdNumber = hasExplicitIdNumber ? rawIdNumber : null;
  const rentalIdNumber = hasExplicitIdNumber ? rawIdNumber : `RNDM-${Math.floor(100000 + Math.random() * 900000)}`;
  const items = Array.isArray(payload?.items) ? payload.items : [];
  const startAtInput = parseIsoDate(payload?.rentalStartAt, 'rentalStartAt');
  const endAtInput = parseIsoDate(payload?.rentalEndAt, 'rentalEndAt');
  const legacyDurationInput = Number(payload?.duration);
  const rawPaymentStatus = String(payload?.payment?.status || 'LUNAS').trim().toUpperCase();
  const rawPaymentMethod = String(payload?.payment?.method || 'TUNAI').trim().toUpperCase();
  const rawPaidAmount = payload?.payment?.paidAmount;

  if (!customerName) {
    throw new Error('Customer name is required');
  }

  if (!customerPhone) {
    throw new Error('Customer phone is required');
  }

  if (items.length === 0) {
    throw new Error('Rental items are required');
  }

  await assertTenantCanCreateRental(tenantId);

  if (!PAYMENT_STATUSES.has(rawPaymentStatus)) {
    throw new Error('Payment status is invalid');
  }

  if (!PAYMENT_METHODS.has(rawPaymentMethod)) {
    throw new Error('Payment method is invalid');
  }

  let paidAmountInput = null;
  if (typeof rawPaidAmount !== 'undefined' && rawPaidAmount !== null && rawPaidAmount !== '') {
    paidAmountInput = Number(rawPaidAmount);
    if (!Number.isFinite(paidAmountInput) || paidAmountInput < 0) {
      throw new Error('Paid amount must be a number >= 0');
    }
  }

  const rental = await prisma.$transaction(async (tx) => {
    const tenantSettings = await tx.tenantSettings.upsert({
      where: { tenantId },
      update: {},
      create: {
        tenantId,
        storeName: DEFAULT_TENANT_SETTINGS.storeName,
        addressLines: DEFAULT_TENANT_SETTINGS.addressLines,
        phone: DEFAULT_TENANT_SETTINGS.phone,
        legalFooterLines: DEFAULT_TENANT_SETTINGS.legalFooterLines,
        timezone: DEFAULT_TENANT_SETTINGS.timezone,
        currency: DEFAULT_TENANT_SETTINGS.currency,
        rentalDayCountMode: DEFAULT_TENANT_SETTINGS.rentalDayCountMode,
        rentalCutoffHour: DEFAULT_TENANT_SETTINGS.rentalCutoffHour,
        rentalCutoffMinute: DEFAULT_TENANT_SETTINGS.rentalCutoffMinute,
      },
    });
    const rentalDayPolicy = resolveRentalDayPolicy(tenantSettings);
    const rentalStartAt = startAtInput || new Date();
    const rentalEndAt = endAtInput || null;
    let duration = 0;

    if (rentalEndAt) {
      duration = calculateRentalDurationFromRange(rentalStartAt, rentalEndAt, rentalDayPolicy);
    } else if (Number.isFinite(legacyDurationInput) && legacyDurationInput >= 1) {
      duration = Math.max(1, Math.trunc(legacyDurationInput));
    } else {
      throw new Error('Rental duration or rental end time is required');
    }

    const plannedReturnDate = rentalEndAt || new Date(rentalStartAt.getTime() + (duration * 24 * 60 * 60 * 1000));

    const existingCustomer = await tx.customer.findFirst({
      where: withTenantBranchScope({
        phone: customerPhone,
      }, context),
      orderBy: { createdAt: 'asc' },
    });

    const customerRecord = existingCustomer
      ? await tx.customer.update({
          where: { id: existingCustomer.id },
          data: {
            name: customerName,
            ...(customerAddress ? { address: customerAddress } : {}),
            guarantee,
            guaranteeOther,
            ...(customerIdNumber ? { idNumber: customerIdNumber } : {}),
            tenantId,
            branchId,
          },
        })
      : await tx.customer.create({
          data: {
            name: customerName,
            phone: customerPhone,
            ...(customerAddress ? { address: customerAddress } : {}),
            guarantee,
            guaranteeOther,
            ...(customerIdNumber ? { idNumber: customerIdNumber } : {}),
            tenantId,
            branchId,
          },
        });

    const normalizedItems = [];
    const itemRequests = new Map();

    for (const inputItem of items) {
      const itemId = String(inputItem.id || '').trim();
      const qty = Number(inputItem.qty);

      if (!itemId) {
        throw new Error('Item id is required');
      }

      if (!Number.isFinite(qty) || qty < 1) {
        throw new Error(`Invalid qty for item ${itemId}`);
      }

      const existing = itemRequests.get(itemId);
      if (existing) {
        existing.qty += qty;
      } else {
        itemRequests.set(itemId, { qty, notes: inputItem.notes || '' });
      }
    }

    const requestedItemIds = [...itemRequests.keys()];
    const storedItems = await tx.item.findMany({
      where: {
        id: { in: requestedItemIds },
      },
      include: { category: true },
    });
    const itemsById = new Map(storedItems.map((item) => [item.id, item]));

    for (const [itemId, request] of itemRequests.entries()) {
      const item = itemsById.get(itemId);

      if (!item) {
        throw new Error(`Item ${itemId} not found`);
      }

      if (context?.tenantId && item.tenantId && item.tenantId !== context.tenantId) {
        throw new Error(`Item ${itemId} not available in current tenant`);
      }

      if (context?.branchId && item.branchId && item.branchId !== context.branchId) {
        throw new Error(`Item ${itemId} not available in current branch`);
      }

      if (item.archivedAt) {
        throw new Error(`Item ${item.name} is archived`);
      }

      const decrementResult = await tx.item.updateMany({
        where: withTenantBranchScope({
          id: item.id,
          archivedAt: null,
          stock: { gte: request.qty },
        }, context),
        data: {
          stock: {
            decrement: request.qty,
          },
        },
      });

      if (decrementResult.count === 0) {
        const latestItem = await tx.item.findUnique({
          where: { id: item.id },
          select: { archivedAt: true },
        });
        if (latestItem?.archivedAt) {
          throw new Error(`Item ${item.name} is archived`);
        }
        throw new Error(`Insufficient stock for ${item.name}`);
      }

      normalizedItems.push({
        itemId: item.id,
        itemName: item.name,
        categoryName: item.category.name,
        price: item.price,
        qty: request.qty,
        notes: request.notes,
      });
    }

    const total = normalizedItems.reduce((sum, item) => sum + (item.price * item.qty * duration), 0);
    let paymentStatus = rawPaymentStatus;
    let paidAmount = paymentStatus === 'LUNAS'
      ? total
      : Number.isFinite(paidAmountInput) ? Number(paidAmountInput) : 0;

    if (paymentStatus === 'DP') {
      if (!Number.isFinite(paidAmount) || paidAmount <= 0) {
        throw new Error('Paid amount is required when payment status is DP');
      }

      if (paidAmount >= total) {
        paymentStatus = 'LUNAS';
        paidAmount = total;
      }
    }

    return tx.rental.create({
      data: {
        id: payload?.id || createId('TX'),
        customerId: customerRecord.id,
        tenantId,
        branchId,
        customerName,
        customerPhone,
        guarantee,
        guaranteeOther,
        idNumber: rentalIdNumber,
        duration,
        total,
        paymentStatus,
        paymentMethod: rawPaymentMethod,
        paidAmount,
        status: 'Active',
        date: rentalStartAt,
        plannedReturnDate,
        items: {
          create: normalizedItems,
        },
      },
      include: {
        items: true,
      },
    });
  });

  return toRentalDto(rental);
}

export async function listReturns(context) {
  const records = await prisma.returnRecord.findMany({
    where: withTenantBranchScope({}, context, { includeBranchNull: false }),
    orderBy: { createdAt: 'asc' },
  });

  return records.map(toReturnDto);
}

export async function getSchemaSummary() {
  const [categoriesCount, itemsCount, rentalsCount, returnsCount, customersCount] = await prisma.$transaction([
    prisma.category.count(),
    prisma.item.count(),
    prisma.rental.count(),
    prisma.returnRecord.count(),
    prisma.customer.count(),
  ]);

  return {
    tables: {
      categories: {
        type: 'Category',
        count: categoriesCount,
      },
      items: {
        type: 'Item',
        count: itemsCount,
        requiredFields: ['id', 'name', 'categoryId', 'stock', 'price'],
      },
      rentals: {
        type: 'Rental',
        count: rentalsCount,
        requiredFields: ['id', 'customerName', 'customerPhone', 'duration', 'total', 'status', 'date'],
      },
      returns: {
        type: 'ReturnRecord',
        count: returnsCount,
        requiredFields: ['id', 'rentalId', 'itemsJson', 'returnDate', 'additionalFee', 'finalTotal'],
      },
      customers: {
        type: 'Customer',
        count: customersCount,
        requiredFields: ['id', 'name', 'phone'],
      },
      users: {
        type: 'User',
      },
    },
    relations: [
      'items.categoryId -> categories.id',
      'rental_items.rentalId -> rentals.id',
      'rental_items.itemId -> items.id',
      'return_records.rentalId -> rentals.id',
      'rentals.customerId -> customers.id',
    ],
  };
}

async function ensureDefaultTenant() {
  return prisma.$transaction(async (tx) => ensureDefaultTenantAndBranch(tx));
}

function withTenantScope(where = {}, context) {
  if (!context?.tenantId) {
    return where;
  }

  return {
    AND: [
      where,
      { tenantId: context.tenantId },
    ],
  };
}

function requireTenantId(context) {
  const tenantId = String(context?.tenantId || '').trim();
  if (!tenantId) {
    throw new Error('Tenant context is required');
  }

  return tenantId;
}

function requireBranchId(context) {
  const branchId = String(context?.branchId || '').trim();
  if (!branchId) {
    throw new Error('Branch context is required');
  }

  return branchId;
}

function withTenantBranchScope(where = {}, context, options = {}) {
  const includeBranchNull = options.includeBranchNull !== false;

  if (!context?.tenantId) {
    return where;
  }

  if (!context?.branchId) {
    return withTenantScope(where, context);
  }

  const branchScope = includeBranchNull
    ? {
        OR: [
          { branchId: context.branchId },
          { branchId: null },
        ],
      }
    : { branchId: context.branchId };

  return {
    AND: [
      where,
      { tenantId: context.tenantId },
      branchScope,
    ],
  };
}

async function resolveTenantForUser({ userId, role, requestedTenantId }) {
  const normalizedTenantId = String(requestedTenantId || '').trim();
  const isSuperuser = isSuperuserRole(role);

  if (normalizedTenantId && normalizedTenantId !== 'current') {
    const tenant = await prisma.tenant.findUnique({
      where: { id: normalizedTenantId },
    });

    if (!tenant) {
      throw new Error('Tenant not found');
    }

    if (isSuperuser) {
      return tenant;
    }

    const membership = await prisma.userMembership.findUnique({
      where: {
        userId_tenantId: {
          userId,
          tenantId: tenant.id,
        },
      },
    });

    if (!membership) {
      throw new Error('Tenant membership is required');
    }

    if (!isActiveStatus(membership.status)) {
      throw new Error('Tenant membership is inactive');
    }

    if (!isActiveStatus(tenant.status)) {
      throw new Error('Tenant is not active');
    }

    return tenant;
  }

  const membership = await prisma.userMembership.findFirst({
    where: {
      userId,
      status: 'active',
      tenant: {
        status: 'active',
      },
    },
    include: {
      tenant: true,
    },
    orderBy: { createdAt: 'asc' },
  });

  if (membership?.tenant) {
    return membership.tenant;
  }

  if (isSuperuser) {
    return ensureDefaultTenant();
  }

  const hasActiveButSuspendedMembership = await prisma.userMembership.findFirst({
    where: {
      userId,
      status: 'active',
      tenant: {
        status: 'suspended',
      },
    },
    select: { id: true },
  });

  if (hasActiveButSuspendedMembership) {
    throw new Error('Tenant is not active');
  }

  const hasAnyMembership = await prisma.userMembership.findFirst({
    where: { userId },
    select: { id: true },
  });

  if (hasAnyMembership) {
    throw new Error('Tenant membership is inactive');
  }

  throw new Error('Tenant membership is required');
}

async function ensureCanManageOwnerMembership({ actorUserId, actorRole, tenantId }) {
  if (isSuperuserRole(actorRole)) {
    return true;
  }

  const actorMembership = await prisma.userMembership.findUnique({
    where: {
      userId_tenantId: {
        userId: actorUserId,
        tenantId,
      },
    },
  });

  if (actorMembership?.status !== 'active' || actorMembership.role !== 'owner') {
    throw new Error('Only tenant owner or superuser can manage owner membership');
  }

  return true;
}

async function ensureCanAdministerTenant({ actorUserId, actorRole, tenantId }) {
  if (isSuperuserRole(actorRole)) {
    return true;
  }

  const actorMembership = await prisma.userMembership.findUnique({
    where: {
      userId_tenantId: {
        userId: actorUserId,
        tenantId,
      },
    },
  });

  if (!actorMembership || actorMembership.status !== 'active') {
    throw new Error('Forbidden');
  }

  const membershipRole = String(actorMembership.role || '').trim().toLowerCase();
  if (membershipRole !== 'owner' && membershipRole !== 'admin') {
    throw new Error('Only tenant owner/admin or superuser can manage tenant resources');
  }

  return true;
}

export async function listTenantsForUser({ userId, role }) {
  const isPlatformAdmin = isPlatformAdminRole(role);
  const tenantInclude = {
    memberships: {
      where: {
        role: 'owner',
      },
      include: {
        user: true,
      },
      orderBy: { createdAt: 'asc' },
    },
    subscription: {
      include: {
        plan: {
          include: {
            features: true,
            _count: {
              select: {
                subscriptions: true,
              },
            },
          },
        },
      },
    },
    _count: {
      select: {
        branches: true,
        memberships: true,
      },
    },
  };

  if (isPlatformAdmin) {
    const tenants = await prisma.tenant.findMany({
      include: tenantInclude,
      orderBy: { createdAt: 'asc' },
    });

    return tenants.map((tenant) => toTenantDto(tenant));
  }

  const memberships = await prisma.userMembership.findMany({
    where: {
      userId,
      status: 'active',
      tenant: {
        status: 'active',
      },
    },
    include: {
      tenant: {
        include: tenantInclude,
      },
    },
    orderBy: { createdAt: 'asc' },
  });

  if (memberships.length === 0) {
    const hasAnyMembership = await prisma.userMembership.findFirst({
      where: { userId },
      select: { id: true },
    });

    if (hasAnyMembership) {
      return [];
    }

    throw new Error('Tenant membership is required');
  }

  return memberships.map(({ tenant }) => toTenantDto(tenant));
}

export async function listPublicActiveTenants() {
  const tenants = await prisma.tenant.findMany({
    where: { status: 'active' },
    orderBy: { createdAt: 'asc' },
  });

  return tenants.map((tenant) => ({
    id: tenant.id,
    slug: tenant.slug,
    name: tenant.name,
  }));
}

export async function listPlansForPlatformAdmin() {
  await ensureDefaultPlanCatalog(prisma);

  const plans = await prisma.plan.findMany({
    include: {
      features: true,
      _count: {
        select: {
          subscriptions: true,
        },
      },
    },
    orderBy: [
      { priceAmount: 'asc' },
      { createdAt: 'asc' },
    ],
  });

  return plans.map(toPlanDto);
}

export async function createPlanForPlatformAdmin(payload) {
  const code = normalizePlanCode(payload?.code);
  const name = String(payload?.name || '').trim();
  const description = typeof payload?.description === 'string' ? payload.description.trim() : '';
  const priceAmount = Number(payload?.priceAmount ?? 0);
  const pricePeriod = normalizePlanPricePeriod(payload?.pricePeriod);
  const status = normalizePlanStatus(payload?.status);
  const features = normalizePlanFeaturesInput(payload?.features);

  if (!code) {
    throw new Error('Plan code is required');
  }

  if (!name) {
    throw new Error('Plan name is required');
  }

  if (!Number.isFinite(priceAmount) || !Number.isInteger(priceAmount) || priceAmount < 0) {
    throw new Error('Plan price amount is invalid');
  }

  const existing = await prisma.plan.findUnique({
    where: { code },
  });
  if (existing) {
    throw new Error('Plan code already exists');
  }

  const created = await prisma.$transaction(async (tx) => {
    const plan = await tx.plan.create({
      data: {
        code,
        name,
        description: description || null,
        priceAmount,
        pricePeriod,
        status,
      },
    });

    if (features.length > 0) {
      await tx.planFeature.createMany({
        data: features.map((feature) => ({
          planId: plan.id,
          key: feature.key,
          valueType: feature.valueType,
          valueJson: feature.valueJson,
        })),
      });
    }

    return tx.plan.findUnique({
      where: { id: plan.id },
      include: {
        features: true,
        _count: {
          select: {
            subscriptions: true,
          },
        },
      },
    });
  });

  if (!created) {
    throw new Error('Failed to create plan');
  }

  return toPlanDto(created);
}

export async function updatePlanForPlatformAdmin(planId, payload) {
  const targetPlanId = String(planId || '').trim();
  if (!targetPlanId) {
    throw new Error('Plan id is required');
  }

  const existing = await prisma.plan.findUnique({
    where: { id: targetPlanId },
  });
  if (!existing) {
    throw new Error('Plan not found');
  }

  const nextCodeRaw = typeof payload?.code === 'string' ? normalizePlanCode(payload.code) : undefined;
  const nextName = typeof payload?.name === 'string' ? payload.name.trim() : undefined;
  const nextDescription = typeof payload?.description === 'string' ? payload.description.trim() : undefined;
  const nextPriceAmount = payload?.priceAmount == null ? undefined : Number(payload.priceAmount);
  const nextPricePeriod = typeof payload?.pricePeriod === 'string'
    ? normalizePlanPricePeriod(payload.pricePeriod)
    : undefined;
  const nextStatus = typeof payload?.status === 'string'
    ? normalizePlanStatus(payload.status)
    : undefined;
  const nextFeatures = Array.isArray(payload?.features)
    ? normalizePlanFeaturesInput(payload.features)
    : undefined;

  if (nextCodeRaw === '') {
    throw new Error('Plan code is required');
  }

  if (nextName === '') {
    throw new Error('Plan name is required');
  }

  if (
    typeof nextPriceAmount === 'number'
    && (!Number.isFinite(nextPriceAmount) || !Number.isInteger(nextPriceAmount) || nextPriceAmount < 0)
  ) {
    throw new Error('Plan price amount is invalid');
  }

  if (nextCodeRaw && nextCodeRaw !== existing.code) {
    const duplicate = await prisma.plan.findUnique({
      where: { code: nextCodeRaw },
    });
    if (duplicate) {
      throw new Error('Plan code already exists');
    }
  }

  const updated = await prisma.$transaction(async (tx) => {
    await tx.plan.update({
      where: { id: existing.id },
      data: {
        ...(typeof nextCodeRaw === 'string' ? { code: nextCodeRaw } : {}),
        ...(typeof nextName === 'string' ? { name: nextName } : {}),
        ...(typeof nextDescription === 'string' ? { description: nextDescription || null } : {}),
        ...(typeof nextPriceAmount === 'number' ? { priceAmount: nextPriceAmount } : {}),
        ...(typeof nextPricePeriod === 'string' ? { pricePeriod: nextPricePeriod } : {}),
        ...(typeof nextStatus === 'string' ? { status: nextStatus } : {}),
      },
    });

    if (Array.isArray(nextFeatures)) {
      await tx.planFeature.deleteMany({
        where: { planId: existing.id },
      });

      if (nextFeatures.length > 0) {
        await tx.planFeature.createMany({
          data: nextFeatures.map((feature) => ({
            planId: existing.id,
            key: feature.key,
            valueType: feature.valueType,
            valueJson: feature.valueJson,
          })),
        });
      }
    }

    return tx.plan.findUnique({
      where: { id: existing.id },
      include: {
        features: true,
        _count: {
          select: {
            subscriptions: true,
          },
        },
      },
    });
  });

  if (!updated) {
    throw new Error('Failed to update plan');
  }

  return toPlanDto(updated);
}

export async function listTenantSubscriptionsForPlatformAdmin() {
  await ensureDefaultPlanCatalog(prisma);

  const tenants = await prisma.tenant.findMany({
    include: {
      subscription: {
        include: {
          plan: {
            include: {
              features: true,
            },
          },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  return tenants.map(toTenantSubscriptionSummaryDto);
}

export async function updateTenantSubscriptionForPlatformAdmin(tenantId, payload) {
  const targetTenantId = String(tenantId || '').trim();
  if (!targetTenantId) {
    throw new Error('Tenant id is required');
  }

  const tenant = await prisma.tenant.findUnique({
    where: { id: targetTenantId },
    include: {
      subscription: true,
    },
  });
  if (!tenant) {
    throw new Error('Tenant not found');
  }

  const nextStartsAt = typeof payload?.startsAt === 'string'
    ? parseIsoDate(payload.startsAt, 'startsAt')
    : undefined;
  const nextEndsAt = Object.prototype.hasOwnProperty.call(payload || {}, 'endsAt')
    ? parseOptionalIsoDate(payload.endsAt, 'endsAt')
    : undefined;
  const nextGraceEndsAt = Object.prototype.hasOwnProperty.call(payload || {}, 'graceEndsAt')
    ? parseOptionalIsoDate(payload.graceEndsAt, 'graceEndsAt')
    : undefined;
  const nextBillingNotes = typeof payload?.billingNotes === 'string'
    ? payload.billingNotes.trim()
    : undefined;
  const nextStatus = typeof payload?.status === 'string'
    ? normalizeSubscriptionStatus(payload.status)
    : undefined;

  const updated = await prisma.$transaction(async (tx) => {
    await ensureDefaultPlanCatalog(tx);

    const existingSubscription = await tx.tenantSubscription.findUnique({
      where: { tenantId: tenant.id },
    });

    let planId = existingSubscription?.planId || '';
    if (typeof payload?.planId === 'string') {
      const targetPlan = await tx.plan.findUnique({
        where: { id: payload.planId.trim() },
      });
      if (!targetPlan) {
        throw new Error('Plan not found');
      }
      planId = targetPlan.id;
    }

    if (!planId) {
      const fallbackPlan = await getPlanByCode(tx, 'basic');
      planId = fallbackPlan.id;
    }

    await ensureTenantSubscriptionForTenant(tx, tenant.id, {
      planId,
      status: nextStatus || existingSubscription?.status || (tenant.status === 'active' ? 'active' : 'trial'),
      startsAt: nextStartsAt || existingSubscription?.startsAt || new Date(),
      endsAt: nextEndsAt === undefined ? existingSubscription?.endsAt : nextEndsAt,
      graceEndsAt: nextGraceEndsAt === undefined ? existingSubscription?.graceEndsAt : nextGraceEndsAt,
      billingNotes: nextBillingNotes === undefined ? existingSubscription?.billingNotes : nextBillingNotes,
      forcePlanUpdate: true,
      forceStatusUpdate: true,
    });

    const updatedSubscription = await tx.tenantSubscription.findUnique({
      where: { tenantId: tenant.id },
      include: {
        plan: {
          include: {
            features: true,
          },
        },
      },
    });

    return {
      ...tenant,
      subscription: updatedSubscription,
    };
  });

  return toTenantSubscriptionSummaryDto(updated);
}

async function resolveTenantSubscriptionForTenant(tenantId, client = prisma) {
  const targetTenantId = String(tenantId || '').trim();
  if (!targetTenantId) {
    throw new Error('Tenant id is required');
  }

  const tenant = await client.tenant.findUnique({
    where: { id: targetTenantId },
    include: {
      subscription: {
        include: {
          plan: {
            include: {
              features: true,
            },
          },
        },
      },
    },
  });

  if (!tenant) {
    throw new Error('Tenant not found');
  }

  if (tenant.subscription?.plan) {
    return tenant.subscription;
  }

  // The catalog is seeded at startup. Repair it only for a legacy tenant
  // without a subscription instead of doing catalog upserts on every request.
  await ensureDefaultPlanCatalog(client);
  await ensureTenantSubscriptionForTenant(client, tenant.id, {
    planCode: 'basic',
    status: tenant.status === 'active' ? 'active' : 'trial',
    forceStatusUpdate: true,
  });

  const subscription = await client.tenantSubscription.findUnique({
    where: { tenantId: tenant.id },
    include: {
      plan: {
        include: {
          features: true,
        },
      },
    },
  });

  if (!subscription) {
    throw new Error('Tenant subscription not found');
  }

  return subscription;
}

async function assertTenantSubscriptionUsable(tenantId) {
  const subscription = await resolveTenantSubscriptionForTenant(tenantId);
  const status = String(subscription.status || '').trim().toLowerCase();
  if (status !== 'active' && status !== 'trial') {
    throw new Error('Tenant subscription is not active');
  }

  const now = new Date();
  if (subscription.startsAt instanceof Date && subscription.startsAt > now) {
    throw new Error('Tenant subscription has not started');
  }

  if (subscription.endsAt instanceof Date && subscription.endsAt < now) {
    const isWithinGracePeriod = subscription.graceEndsAt instanceof Date
      && subscription.graceEndsAt >= now;
    if (!isWithinGracePeriod) {
      throw new Error('Tenant subscription has expired');
    }
  }
}

function getEntitlementValue(subscription, key, fallback = null) {
  const features = Array.isArray(subscription?.plan?.features) ? subscription.plan.features : [];
  const feature = features.find((item) => item.key === key);
  return feature ? feature.valueJson : fallback;
}

function getBooleanEntitlement(subscription, key, fallback = false) {
  const value = getEntitlementValue(subscription, key, fallback);
  return typeof value === 'boolean' ? value : fallback;
}

function getIntegerEntitlement(subscription, key, fallback = 0) {
  const value = Number(getEntitlementValue(subscription, key, fallback));
  if (!Number.isFinite(value) || !Number.isInteger(value)) {
    return fallback;
  }

  return value;
}

function createFeatureDisabledError(featureLabel) {
  return new Error(`Feature not available in current plan: ${featureLabel}`);
}

function createPlanLimitExceededError(limitLabel, limitValue) {
  return new Error(`Plan limit exceeded: ${limitLabel} maksimal ${limitValue}`);
}

async function assertTenantCanCreateBranch(tenantId) {
  const subscription = await resolveTenantSubscriptionForTenant(tenantId);
  if (!getBooleanEntitlement(subscription, 'canManageBranches', true)) {
    throw createFeatureDisabledError('branch management');
  }

  const maxBranches = getIntegerEntitlement(subscription, 'maxBranches', 0);
  const currentCount = await prisma.branch.count({
    where: { tenantId },
  });

  if (!getBooleanEntitlement(subscription, 'canUseMultiBranch', false) && currentCount >= 1) {
    throw createFeatureDisabledError('multi branch');
  }

  if (maxBranches > 0) {
    if (currentCount >= maxBranches) {
      throw createPlanLimitExceededError('cabang', maxBranches);
    }
  }
}

async function assertTenantCanCreateItem(tenantId) {
  const subscription = await resolveTenantSubscriptionForTenant(tenantId);
  const maxItems = getIntegerEntitlement(subscription, 'maxItems', 0);
  if (maxItems > 0) {
    const currentCount = await prisma.item.count({
      where: { tenantId },
    });

    if (currentCount >= maxItems) {
      throw createPlanLimitExceededError('item inventaris', maxItems);
    }
  }
}

async function assertTenantCanCreateRental(tenantId) {
  const subscription = await resolveTenantSubscriptionForTenant(tenantId);
  const maxMonthlyTransactions = getIntegerEntitlement(subscription, 'maxMonthlyTransactions', 0);
  if (maxMonthlyTransactions > 0) {
    const now = new Date();
    const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const currentCount = await prisma.rental.count({
      where: {
        tenantId,
        deletedAt: null,
        date: {
          gte: periodStart,
          lt: periodEnd,
        },
      },
    });

    if (currentCount >= maxMonthlyTransactions) {
      throw createPlanLimitExceededError('transaksi bulanan', maxMonthlyTransactions);
    }
  }
}

async function assertTenantCanCreateTenantUser(tenantId) {
  const subscription = await resolveTenantSubscriptionForTenant(tenantId);
  if (!getBooleanEntitlement(subscription, 'canManageStaff', true)) {
    throw createFeatureDisabledError('staff management');
  }

  const maxTenantUsers = getIntegerEntitlement(subscription, 'maxTenantUsers', 0);
  if (maxTenantUsers > 0) {
    const currentCount = await prisma.userMembership.count({
      where: {
        tenantId,
        status: 'active',
      },
    });

    if (currentCount >= maxTenantUsers) {
      throw createPlanLimitExceededError('user toko aktif', maxTenantUsers);
    }
  }
}

export async function getTenantSubscriptionSummaryForUser({
  userId,
  role,
  requestedTenantId,
}) {
  const tenant = await resolveTenantForUser({
    userId,
    role,
    requestedTenantId: requestedTenantId || 'current',
  });

  const subscription = await resolveTenantSubscriptionForTenant(tenant.id);
  const maxBranches = getIntegerEntitlement(subscription, 'maxBranches', 0);
  const maxItems = getIntegerEntitlement(subscription, 'maxItems', 0);
  const maxMonthlyTransactions = getIntegerEntitlement(subscription, 'maxMonthlyTransactions', 0);
  const maxTenantUsers = getIntegerEntitlement(subscription, 'maxTenantUsers', 0);

  const now = new Date();
  const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);

  const [branchCount, itemCount, monthlyTransactionCount, activeUserCount] = await Promise.all([
    prisma.branch.count({
      where: { tenantId: tenant.id },
    }),
    prisma.item.count({
      where: { tenantId: tenant.id },
    }),
    prisma.rental.count({
      where: {
        tenantId: tenant.id,
        deletedAt: null,
        date: {
          gte: periodStart,
          lt: periodEnd,
        },
      },
    }),
    prisma.userMembership.count({
      where: {
        tenantId: tenant.id,
        status: 'active',
      },
    }),
  ]);

  return {
    tenantId: tenant.id,
    tenantName: tenant.name,
    tenantSlug: tenant.slug,
    tenantStatus: tenant.status,
    subscription: toTenantSubscriptionDto(subscription),
    usage: {
      periodKey: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`,
      branches: toQuotaSummary(branchCount, maxBranches),
      items: toQuotaSummary(itemCount, maxItems),
      monthlyTransactions: toQuotaSummary(monthlyTransactionCount, maxMonthlyTransactions),
      activeUsers: toQuotaSummary(activeUserCount, maxTenantUsers),
    },
    features: {
      canManageBranches: getBooleanEntitlement(subscription, 'canManageBranches', true),
      canManageStaff: getBooleanEntitlement(subscription, 'canManageStaff', true),
      canUseFinancialRecap: getBooleanEntitlement(subscription, 'canUseFinancialRecap', false),
      canUseMultiBranch: getBooleanEntitlement(subscription, 'canUseMultiBranch', false),
      canExportData: getBooleanEntitlement(subscription, 'canExportData', false),
    },
  };
}

export async function updateTenantForSuperuser(tenantId, payload) {
  const targetTenantId = String(tenantId || '').trim();
  if (!targetTenantId) {
    throw new Error('Tenant id is required');
  }

  const existing = await prisma.tenant.findUnique({
    where: { id: targetTenantId },
  });

  if (!existing) {
    throw new Error('Tenant not found');
  }

  const nextName = typeof payload?.name === 'string' ? payload.name.trim() : undefined;
  const nextStatus = typeof payload?.status === 'string' ? payload.status.trim().toLowerCase() : undefined;
  const nextSlugRaw = typeof payload?.slug === 'string' ? payload.slug.trim().toLowerCase() : undefined;
  const nextSlug = typeof nextSlugRaw === 'string' ? slugifyTenant(nextSlugRaw) : undefined;

  if (nextName === '') {
    throw new Error('Tenant name is required');
  }

  if (typeof nextStatus === 'string' && !TENANT_STATUSES.has(nextStatus)) {
    throw new Error('Tenant status is invalid');
  }

  if (typeof nextSlug === 'string' && !nextSlug) {
    throw new Error('Tenant slug is invalid');
  }

  if (nextSlug && nextSlug !== existing.slug) {
    const slugOwner = await prisma.tenant.findUnique({
      where: { slug: nextSlug },
    });
    if (slugOwner) {
      throw new Error('Tenant slug already exists');
    }
  }

  const updated = await prisma.tenant.update({
    where: { id: existing.id },
    data: {
      ...(typeof nextName === 'string' ? { name: nextName } : {}),
      ...(typeof nextStatus === 'string' ? { status: nextStatus } : {}),
      ...(typeof nextSlug === 'string' ? { slug: nextSlug } : {}),
    },
  });

  return toTenantDto(updated);
}

export async function deleteTenantForPlatformAdmin(tenantId, expectedName = '') {
  const targetTenantId = String(tenantId || '').trim();
  if (!targetTenantId) {
    throw new Error('Tenant id is required');
  }

  const existing = await prisma.tenant.findUnique({
    where: { id: targetTenantId },
    include: {
      memberships: {
        select: { userId: true },
      },
      _count: {
        select: {
          branches: true,
          memberships: true,
        },
      },
    },
  });

  if (!existing) {
    throw new Error('Tenant not found');
  }

  if (String(expectedName || '').trim() !== existing.name.trim()) {
    throw new Error(`Confirmation text must be exactly: ${existing.name}`);
  }

  const memberUserIds = [...new Set(existing.memberships.map((membership) => membership.userId))];

  const deleted = await prisma.$transaction(async (tx) => {
    const [auditLogs, returns, rentals, customers, items, categories] = await Promise.all([
      tx.auditLog.count({ where: { tenantId: existing.id } }),
      tx.returnRecord.count({ where: { tenantId: existing.id } }),
      tx.rental.count({ where: { tenantId: existing.id } }),
      tx.customer.count({ where: { tenantId: existing.id } }),
      tx.item.count({ where: { tenantId: existing.id } }),
      tx.category.count({ where: { tenantId: existing.id } }),
    ]);

    await tx.auditLog.deleteMany({ where: { tenantId: existing.id } });
    await tx.returnRecord.deleteMany({ where: { tenantId: existing.id } });
    await tx.rental.deleteMany({ where: { tenantId: existing.id } });
    await tx.customer.deleteMany({ where: { tenantId: existing.id } });
    await tx.item.deleteMany({ where: { tenantId: existing.id } });
    await tx.category.deleteMany({ where: { tenantId: existing.id } });
    await tx.tenant.delete({ where: { id: existing.id } });

    let orphanUsers = 0;
    if (memberUserIds.length > 0) {
      const removedUsers = await tx.user.deleteMany({
        where: {
          id: { in: memberUserIds },
          role: 'kasir',
          memberships: { none: {} },
          branchAccesses: { none: {} },
          deletedRentals: { none: {} },
          auditLogs: { none: {} },
        },
      });
      orphanUsers = removedUsers.count;
    }

    return {
      auditLogs,
      returns,
      rentals,
      customers,
      items,
      categories,
      branches: existing._count.branches,
      memberships: existing._count.memberships,
      orphanUsers,
    };
  });

  return {
    id: existing.id,
    name: existing.name,
    slug: existing.slug,
    deleted,
  };
}

export async function listBranchesForUser({ userId, role, tenantId }) {
  const tenant = await resolveTenantForUser({
    userId,
    role,
    requestedTenantId: tenantId || 'current',
  });

  const membership = isSuperuserRole(role)
    ? null
    : await prisma.userMembership.findUnique({
        where: {
          userId_tenantId: {
            userId,
            tenantId: tenant.id,
          },
        },
      });
  const canAccessAll = canAccessAllTenantBranches(role, membership?.role);

  if (!canAccessAll) {
    const accessRows = await prisma.userBranchAccess.findMany({
      where: {
        userId,
        branch: {
          tenantId: tenant.id,
          status: 'active',
        },
      },
      include: {
        branch: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    if (accessRows.length === 0) {
      throw new Error('Branch access is required');
    }

    return accessRows.map(({ branch }) => toBranchDto(branch));
  }

  const branches = await prisma.branch.findMany({
    where: {
      tenantId: tenant.id,
      status: 'active',
    },
    orderBy: { createdAt: 'asc' },
  });

  return branches.map((branch) => toBranchDto(branch));
}

export async function createBranchForUser({
  userId,
  role,
  tenantId,
  payload,
}) {
  const tenant = await resolveTenantForUser({
    userId,
    role,
    requestedTenantId: tenantId || 'current',
  });

  await ensureCanAdministerTenant({
    actorUserId: userId,
    actorRole: role,
    tenantId: tenant.id,
  });

  const code = String(payload?.code || '').trim().toLowerCase();
  const name = String(payload?.name || '').trim();
  const status = String(payload?.status || 'active').trim().toLowerCase();

  if (!code) {
    throw new Error('Branch code is required');
  }

  if (!name) {
    throw new Error('Branch name is required');
  }

  if (status !== 'active' && status !== 'inactive') {
    throw new Error('Branch status is invalid');
  }

  await assertTenantCanCreateBranch(tenant.id);

  const duplicate = await prisma.branch.findFirst({
    where: {
      tenantId: tenant.id,
      code: {
        equals: code,
        mode: 'insensitive',
      },
    },
  });

  if (duplicate) {
    throw new Error('Branch code already exists');
  }

  const created = await prisma.branch.create({
    data: {
      tenantId: tenant.id,
      code,
      name,
      status,
    },
  });

  return toBranchDto(created);
}

export async function updateBranchForUser({
  userId,
  role,
  branchId,
  payload,
}) {
  const targetBranchId = String(branchId || '').trim();
  if (!targetBranchId) {
    throw new Error('Branch id is required');
  }

  const existing = await prisma.branch.findUnique({
    where: { id: targetBranchId },
  });

  if (!existing) {
    throw new Error('Branch not found');
  }

  await resolveTenantForUser({
    userId,
    role,
    requestedTenantId: existing.tenantId,
  });

  await ensureCanAdministerTenant({
    actorUserId: userId,
    actorRole: role,
    tenantId: existing.tenantId,
  });

  const nextCode = typeof payload?.code === 'string'
    ? payload.code.trim().toLowerCase()
    : undefined;
  const nextName = typeof payload?.name === 'string'
    ? payload.name.trim()
    : undefined;
  const nextStatus = typeof payload?.status === 'string'
    ? payload.status.trim().toLowerCase()
    : undefined;

  if (nextCode === '') {
    throw new Error('Branch code is required');
  }

  if (nextName === '') {
    throw new Error('Branch name is required');
  }

  if (typeof nextStatus === 'string' && nextStatus !== 'active' && nextStatus !== 'inactive') {
    throw new Error('Branch status is invalid');
  }

  if (nextCode && nextCode !== existing.code.toLowerCase()) {
    const duplicate = await prisma.branch.findFirst({
      where: {
        tenantId: existing.tenantId,
        code: {
          equals: nextCode,
          mode: 'insensitive',
        },
        id: {
          not: existing.id,
        },
      },
    });

    if (duplicate) {
      throw new Error('Branch code already exists');
    }
  }

  const updated = await prisma.branch.update({
    where: { id: existing.id },
    data: {
      ...(typeof nextCode === 'string' ? { code: nextCode } : {}),
      ...(typeof nextName === 'string' ? { name: nextName } : {}),
      ...(typeof nextStatus === 'string' ? { status: nextStatus } : {}),
    },
  });

  return toBranchDto(updated);
}

export async function listTenantMembershipsForUser({
  userId,
  role,
  tenantId,
}) {
  const tenant = await resolveTenantForUser({
    userId,
    role,
    requestedTenantId: tenantId || 'current',
  });

  await ensureCanAdministerTenant({
    actorUserId: userId,
    actorRole: role,
    tenantId: tenant.id,
  });

  const memberships = await prisma.userMembership.findMany({
    where: {
      tenantId: tenant.id,
    },
    include: {
      user: true,
    },
    orderBy: { createdAt: 'asc' },
  });

  return memberships.map((membership) => toTenantMembershipDto(membership));
}

export async function upsertTenantMembershipForUser({
  actorUserId,
  actorRole,
  tenantId,
  payload,
}) {
  const tenant = await resolveTenantForUser({
    userId: actorUserId,
    role: actorRole,
    requestedTenantId: tenantId || 'current',
  });

  await ensureCanAdministerTenant({
    actorUserId,
    actorRole,
    tenantId: tenant.id,
  });

  const targetUserId = String(payload?.userId || '').trim();
  const membershipRole = String(payload?.role || 'kasir').trim().toLowerCase();
  const membershipStatus = String(payload?.status || 'active').trim().toLowerCase();

  if (!targetUserId) {
    throw new Error('User id is required');
  }

  if (!TENANT_MEMBERSHIP_ROLES.has(membershipRole)) {
    throw new Error('Membership role is invalid');
  }

  if (!TENANT_MEMBERSHIP_STATUSES.has(membershipStatus)) {
    throw new Error('Membership status is invalid');
  }

  const user = await prisma.user.findUnique({
    where: { id: targetUserId },
  });

  if (!user) {
    throw new Error('User not found');
  }

  if (membershipRole === 'owner') {
    await ensureCanManageOwnerMembership({
      actorUserId,
      actorRole,
      tenantId: tenant.id,
    });
  }

  const membership = await prisma.userMembership.upsert({
    where: {
      userId_tenantId: {
        userId: targetUserId,
        tenantId: tenant.id,
      },
    },
    update: {
      role: membershipRole,
      status: membershipStatus,
    },
    create: {
      userId: targetUserId,
      tenantId: tenant.id,
      role: membershipRole,
      status: membershipStatus,
    },
    include: {
      user: true,
    },
  });

  return toTenantMembershipDto(membership);
}

export async function updateTenantMembershipForUser({
  actorUserId,
  actorRole,
  membershipId,
  payload,
}) {
  const targetMembershipId = String(membershipId || '').trim();
  if (!targetMembershipId) {
    throw new Error('Membership id is required');
  }

  const existing = await prisma.userMembership.findUnique({
    where: { id: targetMembershipId },
    include: {
      user: true,
    },
  });

  if (!existing) {
    throw new Error('Membership not found');
  }

  await resolveTenantForUser({
    userId: actorUserId,
    role: actorRole,
    requestedTenantId: existing.tenantId,
  });

  await ensureCanAdministerTenant({
    actorUserId,
    actorRole,
    tenantId: existing.tenantId,
  });

  const membershipRole = typeof payload?.role === 'string'
    ? payload.role.trim().toLowerCase()
    : undefined;
  const membershipStatus = typeof payload?.status === 'string'
    ? payload.status.trim().toLowerCase()
    : undefined;

  if (typeof membershipRole === 'string' && !TENANT_MEMBERSHIP_ROLES.has(membershipRole)) {
    throw new Error('Membership role is invalid');
  }

  if (typeof membershipStatus === 'string' && !TENANT_MEMBERSHIP_STATUSES.has(membershipStatus)) {
    throw new Error('Membership status is invalid');
  }

  if (
    existing.role === 'owner'
    || membershipRole === 'owner'
    || (existing.role === 'owner' && membershipStatus === 'inactive')
  ) {
    await ensureCanManageOwnerMembership({
      actorUserId,
      actorRole,
      tenantId: existing.tenantId,
    });
  }

  const updated = await prisma.userMembership.update({
    where: { id: existing.id },
    data: {
      ...(typeof membershipRole === 'string' ? { role: membershipRole } : {}),
      ...(typeof membershipStatus === 'string' ? { status: membershipStatus } : {}),
    },
    include: {
      user: true,
    },
  });

  return toTenantMembershipDto(updated);
}

export async function listBranchAccessForUser({
  userId,
  role,
  tenantId,
}) {
  const tenant = await resolveTenantForUser({
    userId,
    role,
    requestedTenantId: tenantId || 'current',
  });

  await ensureCanAdministerTenant({
    actorUserId: userId,
    actorRole: role,
    tenantId: tenant.id,
  });

  const accesses = await prisma.userBranchAccess.findMany({
    where: {
      branch: {
        tenantId: tenant.id,
      },
    },
    include: {
      user: true,
      branch: true,
    },
    orderBy: { createdAt: 'asc' },
  });

  return accesses.map((access) => toBranchAccessDto(access));
}

export async function upsertBranchAccessForUser({
  actorUserId,
  actorRole,
  tenantId,
  payload,
}) {
  const tenant = await resolveTenantForUser({
    userId: actorUserId,
    role: actorRole,
    requestedTenantId: tenantId || 'current',
  });

  await ensureCanAdministerTenant({
    actorUserId,
    actorRole,
    tenantId: tenant.id,
  });

  const targetUserId = String(payload?.userId || '').trim();
  const targetBranchId = String(payload?.branchId || '').trim();
  const accessRole = String(payload?.role || 'kasir').trim().toLowerCase();

  if (!targetUserId) {
    throw new Error('User id is required');
  }

  if (!targetBranchId) {
    throw new Error('Branch id is required');
  }

  if (!BRANCH_ACCESS_ROLES.has(accessRole)) {
    throw new Error('Branch access role is invalid');
  }

  const [user, branch] = await Promise.all([
    prisma.user.findUnique({
      where: { id: targetUserId },
    }),
    prisma.branch.findFirst({
      where: {
        id: targetBranchId,
        tenantId: tenant.id,
      },
    }),
  ]);

  if (!user) {
    throw new Error('User not found');
  }

  if (!branch) {
    throw new Error('Branch not found');
  }

  const existingMembership = await prisma.userMembership.findUnique({
    where: {
      userId_tenantId: {
        userId: user.id,
        tenantId: tenant.id,
      },
    },
  });

  if (!existingMembership) {
    await prisma.userMembership.create({
      data: {
        userId: user.id,
        tenantId: tenant.id,
        role: 'kasir',
        status: 'active',
      },
    });
  } else if (existingMembership.status !== 'active') {
    await prisma.userMembership.update({
      where: { id: existingMembership.id },
      data: { status: 'active' },
    });
  }

  const access = await prisma.userBranchAccess.upsert({
    where: {
      userId_branchId: {
        userId: user.id,
        branchId: branch.id,
      },
    },
    update: {
      role: accessRole,
    },
    create: {
      userId: user.id,
      branchId: branch.id,
      role: accessRole,
    },
    include: {
      user: true,
      branch: true,
    },
  });

  return toBranchAccessDto(access);
}

export async function removeBranchAccessForUser({
  actorUserId,
  actorRole,
  accessId,
}) {
  const targetAccessId = String(accessId || '').trim();
  if (!targetAccessId) {
    throw new Error('Access id is required');
  }

  const existing = await prisma.userBranchAccess.findUnique({
    where: { id: targetAccessId },
    include: {
      branch: true,
      user: true,
    },
  });

  if (!existing) {
    throw new Error('Branch access not found');
  }

  await resolveTenantForUser({
    userId: actorUserId,
    role: actorRole,
    requestedTenantId: existing.branch.tenantId,
  });

  await ensureCanAdministerTenant({
    actorUserId,
    actorRole,
    tenantId: existing.branch.tenantId,
  });

  const removed = await prisma.userBranchAccess.delete({
    where: { id: existing.id },
    include: {
      user: true,
      branch: true,
    },
  });

  return toBranchAccessDto(removed);
}

export async function resolveTenantBranchContextForUser({
  userId,
  role,
  requestedTenantId,
  requestedBranchId,
}) {
  const tenant = await resolveTenantForUser({
    userId,
    role,
    requestedTenantId,
  });

  const normalizedRole = normalizeRole(role);
  const isAdminLike = normalizedRole === 'admin' || normalizedRole === 'superuser';
  if (!isAdminLike) {
    await assertTenantSubscriptionUsable(tenant.id);
  }

  const branchId = String(requestedBranchId || '').trim();
  const membership = isSuperuserRole(role)
    ? null
    : await prisma.userMembership.findUnique({
        where: {
          userId_tenantId: {
            userId,
            tenantId: tenant.id,
          },
        },
      });
  const canAccessAll = canAccessAllTenantBranches(role, membership?.role);

  const baseBranchWhere = {
    tenantId: tenant.id,
    status: 'active',
    ...(branchId ? { id: branchId } : {}),
  };

  if (!canAccessAll) {
    const accessBranch = await prisma.userBranchAccess.findFirst({
      where: {
        userId,
        branch: baseBranchWhere,
      },
      include: {
        branch: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    if (!accessBranch?.branch) {
      throw new Error('Branch access is required');
    }

    return {
      tenantId: tenant.id,
      branchId: accessBranch.branch.id,
    };
  }

  const branch = await prisma.branch.findFirst({
    where: baseBranchWhere,
    orderBy: { createdAt: 'asc' },
  });

  if (!branch) {
    throw new Error('Branch not found');
  }

  return {
    tenantId: tenant.id,
    branchId: branch.id,
  };
}

export async function getTenantSettingsForUser({ userId, role, requestedTenantId }) {
  const tenant = await resolveTenantForUser({
    userId,
    role,
    requestedTenantId,
  });

  const settings = await prisma.tenantSettings.upsert({
    where: {
      tenantId: tenant.id,
    },
    update: {},
    create: {
      tenantId: tenant.id,
      storeName: tenant.name || DEFAULT_TENANT_SETTINGS.storeName,
      addressLines: DEFAULT_TENANT_SETTINGS.addressLines,
      phone: DEFAULT_TENANT_SETTINGS.phone,
      legalFooterLines: DEFAULT_TENANT_SETTINGS.legalFooterLines,
      timezone: DEFAULT_TENANT_SETTINGS.timezone,
      currency: DEFAULT_TENANT_SETTINGS.currency,
      rentalDayCountMode: DEFAULT_TENANT_SETTINGS.rentalDayCountMode,
      rentalCutoffHour: DEFAULT_TENANT_SETTINGS.rentalCutoffHour,
      rentalCutoffMinute: DEFAULT_TENANT_SETTINGS.rentalCutoffMinute,
    },
  });

  return toTenantSettingsDto(settings);
}

export async function getBranchSettingsForUser({
  userId,
  role,
  requestedTenantId,
  requestedBranchId,
}) {
  const context = await resolveTenantBranchContextForUser({
    userId,
    role,
    requestedTenantId: requestedTenantId || 'current',
    requestedBranchId,
  });

  const settings = await prisma.branchSettings.upsert({
    where: {
      branchId: context.branchId,
    },
    update: {},
    create: {
      branchId: context.branchId,
      storeName: null,
      addressLines: [],
      phone: null,
      legalFooterLines: [],
    },
  });

  return toBranchSettingsDto(settings);
}

export async function updateBranchSettingsByIdForUser({
  actorUserId,
  actorRole,
  branchId,
  payload,
}) {
  const targetBranchId = String(branchId || '').trim();
  if (!targetBranchId) {
    throw new Error('Branch id is required');
  }

  const branch = await prisma.branch.findUnique({
    where: { id: targetBranchId },
  });

  if (!branch) {
    throw new Error('Branch not found');
  }

  await resolveTenantForUser({
    userId: actorUserId,
    role: actorRole,
    requestedTenantId: branch.tenantId,
  });

  await ensureCanAdministerTenant({
    actorUserId,
    actorRole,
    tenantId: branch.tenantId,
  });

  const nextStoreName = typeof payload?.storeName === 'string'
    ? payload.storeName.trim()
    : undefined;
  const nextAddressLines = Array.isArray(payload?.addressLines)
    ? normalizeLines(payload.addressLines)
    : undefined;
  const nextLegalFooterLines = Array.isArray(payload?.legalFooterLines)
    ? normalizeLines(payload.legalFooterLines)
    : undefined;
  const nextPhone = typeof payload?.phone === 'string'
    ? payload.phone.trim()
    : undefined;

  const updated = await prisma.branchSettings.upsert({
    where: {
      branchId: branch.id,
    },
    update: {
      ...(typeof nextStoreName === 'string' ? { storeName: nextStoreName || null } : {}),
      ...(typeof nextAddressLines !== 'undefined' ? { addressLines: nextAddressLines } : {}),
      ...(typeof nextLegalFooterLines !== 'undefined' ? { legalFooterLines: nextLegalFooterLines } : {}),
      ...(typeof nextPhone === 'string' ? { phone: nextPhone || null } : {}),
    },
    create: {
      branchId: branch.id,
      storeName: nextStoreName || null,
      addressLines: nextAddressLines || [],
      phone: typeof nextPhone === 'string' ? (nextPhone || null) : null,
      legalFooterLines: nextLegalFooterLines || [],
    },
  });

  return toBranchSettingsDto(updated);
}

export async function updateTenantSettingsByTenantId(tenantId, payload, actor = {}) {
  const targetTenantId = String(tenantId || '').trim();
  if (!targetTenantId) {
    throw new Error('Tenant id is required');
  }

  const tenant = await prisma.tenant.findUnique({
    where: { id: targetTenantId },
  });

  if (!tenant) {
    throw new Error('Tenant not found');
  }

  if (actor?.userId) {
    await ensureCanAdministerTenant({
      actorUserId: actor.userId,
      actorRole: actor.role,
      tenantId: tenant.id,
    });
  }

  const nextStoreName = typeof payload?.storeName === 'string'
    ? payload.storeName.trim()
    : undefined;
  const nextAddressLines = Array.isArray(payload?.addressLines)
    ? normalizeLines(payload.addressLines)
    : undefined;
  const nextLegalFooterLines = Array.isArray(payload?.legalFooterLines)
    ? normalizeLines(payload.legalFooterLines)
    : undefined;
  const nextPhone = typeof payload?.phone === 'string'
    ? payload.phone.trim()
    : undefined;
  const nextTimezone = typeof payload?.timezone === 'string'
    ? payload.timezone.trim()
    : undefined;
  const nextCurrency = typeof payload?.currency === 'string'
    ? payload.currency.trim().toUpperCase()
    : undefined;
  const nextRentalDayCountMode = typeof payload?.rentalDayCountMode === 'string'
    ? normalizeRentalDayCountMode(payload.rentalDayCountMode)
    : undefined;
  const nextRentalCutoffHour = typeof payload?.rentalCutoffHour !== 'undefined'
    ? normalizeCutoffHour(payload.rentalCutoffHour)
    : undefined;
  const nextRentalCutoffMinute = typeof payload?.rentalCutoffMinute !== 'undefined'
    ? normalizeCutoffMinute(payload.rentalCutoffMinute)
    : undefined;
  const nextFinancialClosingDay = typeof payload?.financialClosingDay !== 'undefined'
    ? normalizeFinancialClosingDay(payload.financialClosingDay)
    : undefined;

  const updated = await prisma.tenantSettings.upsert({
    where: { tenantId: tenant.id },
    update: {
      ...(typeof nextStoreName === 'string' ? { storeName: nextStoreName || tenant.name } : {}),
      ...(typeof nextAddressLines !== 'undefined' ? { addressLines: nextAddressLines } : {}),
      ...(typeof nextLegalFooterLines !== 'undefined' ? { legalFooterLines: nextLegalFooterLines } : {}),
      ...(typeof nextPhone === 'string' ? { phone: nextPhone || null } : {}),
      ...(typeof nextTimezone === 'string' ? { timezone: nextTimezone || DEFAULT_TENANT_SETTINGS.timezone } : {}),
      ...(typeof nextCurrency === 'string' ? { currency: nextCurrency || DEFAULT_TENANT_SETTINGS.currency } : {}),
      ...(typeof nextRentalDayCountMode === 'string' ? { rentalDayCountMode: nextRentalDayCountMode } : {}),
      ...(typeof nextRentalCutoffHour === 'number' ? { rentalCutoffHour: nextRentalCutoffHour } : {}),
      ...(typeof nextRentalCutoffMinute === 'number' ? { rentalCutoffMinute: nextRentalCutoffMinute } : {}),
      ...(typeof nextFinancialClosingDay === 'number' ? { financialClosingDay: nextFinancialClosingDay } : {}),
    },
    create: {
      tenantId: tenant.id,
      storeName: nextStoreName || tenant.name || DEFAULT_TENANT_SETTINGS.storeName,
      addressLines: nextAddressLines || DEFAULT_TENANT_SETTINGS.addressLines,
      phone: typeof nextPhone === 'string' ? (nextPhone || null) : DEFAULT_TENANT_SETTINGS.phone,
      legalFooterLines: nextLegalFooterLines || DEFAULT_TENANT_SETTINGS.legalFooterLines,
      timezone: nextTimezone || DEFAULT_TENANT_SETTINGS.timezone,
      currency: nextCurrency || DEFAULT_TENANT_SETTINGS.currency,
      rentalDayCountMode: nextRentalDayCountMode || DEFAULT_TENANT_SETTINGS.rentalDayCountMode,
      rentalCutoffHour: typeof nextRentalCutoffHour === 'number'
        ? nextRentalCutoffHour
        : DEFAULT_TENANT_SETTINGS.rentalCutoffHour,
      rentalCutoffMinute: typeof nextRentalCutoffMinute === 'number'
        ? nextRentalCutoffMinute
        : DEFAULT_TENANT_SETTINGS.rentalCutoffMinute,
      financialClosingDay: typeof nextFinancialClosingDay === 'number'
        ? nextFinancialClosingDay
        : DEFAULT_TENANT_SETTINGS.financialClosingDay,
    },
  });

  if (nextStoreName && nextStoreName !== tenant.name) {
    await prisma.tenant.update({
      where: { id: tenant.id },
      data: { name: nextStoreName },
    });
  }

  return toTenantSettingsDto(updated);
}

export async function listCustomers({ query } = {}, context) {
  const keyword = String(query || '').trim();

  const customers = await prisma.customer.findMany({
    where: keyword
      ? withTenantBranchScope({
          AND: [
            {
              OR: [
                {
                  name: {
                    contains: keyword,
                    mode: 'insensitive',
                  },
                },
                {
                  phone: {
                    contains: keyword,
                    mode: 'insensitive',
                  },
                },
                {
                  idNumber: {
                    contains: keyword,
                    mode: 'insensitive',
                  },
                },
                {
                  address: {
                    contains: keyword,
                    mode: 'insensitive',
                  },
                },
              ],
            },
          ],
        }, context)
      : withTenantBranchScope({}, context),
    orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
    take: keyword ? 20 : 100,
  });

  return customers.map(toCustomerDto);
}

export async function upsertCustomer(payload, context) {
  const tenantId = requireTenantId(context);
  const branchId = String(context?.branchId || '').trim() || null;
  const customer = payload || {};
  const customerName = String(customer.name || '').trim();
  const customerPhone = String(customer.phone || '').trim();
  const customerAddress = String(customer.address || '').trim();
  const guarantee = String(customer.guarantee || 'KTP').trim() || 'KTP';
  const guaranteeOther = guarantee === 'Lainnya' ? String(customer.guaranteeOther || '').trim() : '';
  const rawIdNumber = String(customer.idNumber || '').trim();
  const hasExplicitIdNumber = rawIdNumber !== '' && rawIdNumber !== '0';
  const customerIdNumber = hasExplicitIdNumber ? rawIdNumber : null;

  if (!customerName) {
    throw new Error('Customer name is required');
  }

  if (!customerPhone) {
    throw new Error('Customer phone is required');
  }

  if (guarantee === 'Lainnya' && !guaranteeOther) {
    throw new Error('guaranteeOther is required when guarantee is Lainnya');
  }

  const existingCustomer = await prisma.customer.findFirst({
    where: withTenantBranchScope({
      phone: customerPhone,
    }, context),
    orderBy: { createdAt: 'asc' },
  });

  const savedCustomer = existingCustomer
    ? await prisma.customer.update({
        where: { id: existingCustomer.id },
        data: {
          name: customerName,
          ...(customerAddress ? { address: customerAddress } : {}),
          guarantee,
          guaranteeOther,
          ...(customerIdNumber ? { idNumber: customerIdNumber } : {}),
          tenantId,
          branchId,
        },
      })
    : await prisma.customer.create({
        data: {
          name: customerName,
          phone: customerPhone,
          ...(customerAddress ? { address: customerAddress } : {}),
          guarantee,
          guaranteeOther,
          ...(customerIdNumber ? { idNumber: customerIdNumber } : {}),
          tenantId,
          branchId,
        },
      });

  return toCustomerDto(savedCustomer);
}

export async function updateCustomerById(customerId, payload, context) {
  const tenantId = requireTenantId(context);
  const branchId = String(context?.branchId || '').trim() || null;
  const targetId = String(customerId || '').trim();
  if (!targetId) {
    throw new Error('Customer id is required');
  }

  const existing = await prisma.customer.findUnique({
    where: { id: targetId },
  });

  if (!existing) {
    throw new Error('Customer not found');
  }

  if (context?.tenantId && existing.tenantId && existing.tenantId !== context.tenantId) {
    throw new Error('Forbidden');
  }

  if (context?.branchId && existing.branchId && existing.branchId !== context.branchId) {
    throw new Error('Forbidden');
  }

  const customer = payload || {};
  const customerName = String(customer.name || '').trim();
  const customerPhone = String(customer.phone || '').trim();
  const customerAddress = String(customer.address || '').trim();
  const guarantee = String(customer.guarantee || 'KTP').trim() || 'KTP';
  const guaranteeOther = guarantee === 'Lainnya' ? String(customer.guaranteeOther || '').trim() : '';
  const rawIdNumber = String(customer.idNumber || '').trim();
  const hasExplicitIdNumber = rawIdNumber !== '' && rawIdNumber !== '0';
  const customerIdNumber = hasExplicitIdNumber ? rawIdNumber : null;

  if (!customerName) {
    throw new Error('Customer name is required');
  }

  if (!customerPhone) {
    throw new Error('Customer phone is required');
  }

  if (guarantee === 'Lainnya' && !guaranteeOther) {
    throw new Error('guaranteeOther is required when guarantee is Lainnya');
  }

  if (customerPhone !== existing.phone) {
    const phoneOwner = await prisma.customer.findFirst({
      where: {
        tenantId,
        phone: customerPhone,
        id: {
          not: targetId,
        },
      },
    });

    if (phoneOwner) {
      throw new Error('Customer phone already exists');
    }
  }

  const updatedCustomer = await prisma.customer.update({
    where: { id: targetId },
    data: {
      name: customerName,
      phone: customerPhone,
      address: customerAddress || null,
      guarantee,
      guaranteeOther,
      idNumber: customerIdNumber,
      tenantId,
      branchId,
    },
  });

  return toCustomerDto(updatedCustomer);
}

export async function deleteCustomerById(customerId, context) {
  const targetId = String(customerId || '').trim();
  if (!targetId) {
    throw new Error('Customer id is required');
  }

  const existing = await prisma.customer.findUnique({
    where: { id: targetId },
  });

  if (!existing) {
    throw new Error('Customer not found');
  }

  if (context?.tenantId && existing.tenantId && existing.tenantId !== context.tenantId) {
    throw new Error('Forbidden');
  }

  if (context?.branchId && existing.branchId && existing.branchId !== context.branchId) {
    throw new Error('Forbidden');
  }

  await prisma.customer.delete({
    where: { id: targetId },
  });

  return toCustomerDto(existing);
}

export async function processReturn(payload, context) {
  const tenantId = requireTenantId(context);
  const branchId = requireBranchId(context);
  const rentalId = String(payload?.rentalId || '').trim();
  const additionalFee = Number(payload?.additionalFee || 0);
  const settleRemainingPayment = Boolean(payload?.settleRemainingPayment);

  if (!rentalId) {
    throw new Error('rentalId is required');
  }

  if (!Number.isFinite(additionalFee) || additionalFee < 0) {
    throw new Error('additionalFee must be a number >= 0');
  }

  const result = await prisma.$transaction(async (tx) => {
    const rental = await tx.rental.findUnique({
      where: { id: rentalId },
      include: {
        items: true,
        returnRecord: true,
      },
    });

    if (!rental) {
      throw new Error('Rental not found');
    }

    if (context?.tenantId && rental.tenantId && rental.tenantId !== context.tenantId) {
      throw new Error('Forbidden');
    }

    if (context?.branchId && rental.branchId !== context.branchId) {
      throw new Error('Forbidden');
    }

    if (rental.deletedAt) {
      throw new Error('Rental already deleted');
    }

    if (isReturnedRentalStatus(rental.status)) {
      if (rental.returnRecord) {
        return {
          rental: toRentalDto(rental),
          returnRecord: toReturnDto(rental.returnRecord),
        };
      }

      const synthesizedReturnDate = rental.returnDate || rental.updatedAt || new Date();
      const synthesizedAdditionalFee = Number(rental.additionalFee || 0);
      const synthesizedFinalTotal = Number(
        rental.finalTotal == null ? rental.total + synthesizedAdditionalFee : rental.finalTotal,
      );
      const synthesizedRecord = await tx.returnRecord.create({
        data: {
          id: createId('RT'),
          rentalId: rental.id,
          customerName: rental.customerName,
          customerPhone: rental.customerPhone,
          tenantId: rental.tenantId,
          branchId: rental.branchId,
          itemsJson: rental.items,
          returnDate: synthesizedReturnDate,
          returnNotes: rental.returnNotes || '',
          additionalFee: synthesizedAdditionalFee,
          finalTotal: synthesizedFinalTotal,
        },
      });

      return {
        rental: toRentalDto(rental),
        returnRecord: toReturnDto(synthesizedRecord),
      };
    }

    // Legacy data guard: return record exists but status is still active.
    if (rental.returnRecord) {
      const alignedRental = await tx.rental.update({
        where: { id: rental.id },
        data: {
          status: 'Returned',
          returnDate: rental.returnRecord.returnDate,
          returnNotes: rental.returnRecord.returnNotes || '',
          additionalFee: rental.returnRecord.additionalFee,
          finalTotal: rental.returnRecord.finalTotal,
        },
        include: {
          items: true,
          returnRecord: true,
        },
      });

      return {
        rental: toRentalDto(alignedRental),
        returnRecord: toReturnDto(alignedRental.returnRecord),
      };
    }

    const returnDate = new Date();
    const returnNotes = payload?.returnNotes || '';
    const finalTotal = rental.total + additionalFee;
    const paidAmount = Math.max(0, Number(rental.paidAmount || 0));
    const remainingAmount = Math.max(0, finalTotal - paidAmount);

    if (remainingAmount > 0 && !settleRemainingPayment) {
      throw new Error(`Transaksi belum lunas. Sisa pembayaran Rp ${remainingAmount.toLocaleString('id-ID')}`);
    }

    const updatedCount = await tx.rental.updateMany({
      where: {
        id: rental.id,
        deletedAt: null,
        NOT: [
          {
            status: {
              equals: 'Returned',
              mode: 'insensitive',
            },
          },
          {
            status: {
              equals: 'Selesai',
              mode: 'insensitive',
            },
          },
          {
            status: {
              equals: 'Completed',
              mode: 'insensitive',
            },
          },
          {
            status: {
              equals: 'Done',
              mode: 'insensitive',
            },
          },
        ],
      },
      data: {
        status: 'Returned',
        returnDate,
        returnNotes,
        additionalFee,
        finalTotal,
        paymentStatus: remainingAmount > 0 ? 'LUNAS' : rental.paymentStatus,
        paidAmount: remainingAmount > 0 ? finalTotal : rental.paidAmount,
      },
    });

    if (updatedCount.count === 0) {
      throw new Error('Rental already returned');
    }

    for (const rentalItem of rental.items) {
      await tx.item.updateMany({
        where: { id: rentalItem.itemId },
        data: {
          stock: {
            increment: rentalItem.qty,
          },
        },
      });
    }

    const updatedRental = await tx.rental.findUnique({
      where: { id: rental.id },
      include: {
        items: true,
      },
    });

    if (!updatedRental) {
      throw new Error('Rental not found');
    }

    const returnRecord = await tx.returnRecord.create({
      data: {
        id: createId('RT'),
        rentalId: rental.id,
        customerName: rental.customerName,
        customerPhone: rental.customerPhone,
        tenantId,
        branchId,
        itemsJson: rental.items,
        returnDate,
        returnNotes,
        additionalFee,
        finalTotal,
      },
    });

    return {
      rental: toRentalDto(updatedRental),
      returnRecord: toReturnDto(returnRecord),
    };
  });

  return result;
}

export async function verifyUserPasswordById(userId, plainPassword, passwordPepper) {
  const targetId = String(userId || '').trim();
  if (!targetId) {
    throw new Error('User id is required');
  }

  const user = await prisma.user.findUnique({
    where: { id: targetId },
  });

  if (!user) {
    throw new Error('User not found');
  }

  return verifyPassword(plainPassword, user.passwordHash, passwordPepper);
}

function toAuditRentalSnapshot(rental) {
  const totalDue = Number(
    rental.finalTotal == null ? rental.total : rental.finalTotal,
  );
  const paymentStatus = String(rental.paymentStatus || 'LUNAS').toUpperCase();
  const rawPaidAmount = Math.max(0, Number(rental.paidAmount || 0));
  const normalizedPaidAmount = paymentStatus === 'LUNAS'
    ? (rawPaidAmount > 0 ? Math.min(rawPaidAmount, totalDue) : totalDue)
    : Math.min(rawPaidAmount, totalDue);

  return {
    id: rental.id,
    customerId: rental.customerId || null,
    customerName: rental.customerName,
    customerPhone: rental.customerPhone,
    guarantee: rental.guarantee,
    guaranteeOther: rental.guaranteeOther || null,
    idNumber: rental.idNumber || null,
    duration: rental.duration,
    total: rental.total,
    paymentStatus,
    paymentMethod: rental.paymentMethod || 'TUNAI',
    paidAmount: normalizedPaidAmount,
    remainingAmount: Math.max(0, totalDue - normalizedPaidAmount),
    status: rental.status,
    date: rental.date.toISOString(),
    plannedReturnDate: rental.plannedReturnDate ? rental.plannedReturnDate.toISOString() : null,
    returnDate: rental.returnDate ? rental.returnDate.toISOString() : null,
    returnNotes: rental.returnNotes || null,
    additionalFee: rental.additionalFee,
    finalTotal: rental.finalTotal ?? null,
    items: rental.items.map((item) => ({
      id: item.id,
      itemId: item.itemId,
      itemName: item.itemName,
      categoryName: item.categoryName,
      price: item.price,
      qty: item.qty,
      notes: item.notes || '',
    })),
  };
}

export async function deleteRentalByAdmin({ actorUserId, rentalId, reason, context }) {
  const tenantId = requireTenantId(context);
  const branchId = requireBranchId(context);
  const actorId = String(actorUserId || '').trim();
  const targetRentalId = String(rentalId || '').trim();
  const deleteReason = String(reason || '').trim();

  if (!actorId) {
    throw new Error('Actor user id is required');
  }

  if (!targetRentalId) {
    throw new Error('Rental id is required');
  }

  if (!deleteReason) {
    throw new Error('Delete reason is required');
  }

  const result = await prisma.$transaction(async (tx) => {
    const rental = await tx.rental.findUnique({
      where: { id: targetRentalId },
      include: {
        items: true,
        returnRecord: true,
      },
    });

    if (!rental) {
      throw new Error('Rental not found');
    }

    if (context?.tenantId && rental.tenantId && rental.tenantId !== context.tenantId) {
      throw new Error('Forbidden');
    }

    if (context?.branchId && rental.branchId && rental.branchId !== context.branchId) {
      throw new Error('Forbidden');
    }

    if (rental.deletedAt) {
      throw new Error('Rental already deleted');
    }

    const activeClaim = await tx.rental.updateMany({
      where: {
        id: rental.id,
        tenantId,
        branchId,
        deletedAt: null,
        returnRecord: { is: null },
        NOT: [...RETURNED_RENTAL_STATUSES].map((status) => ({
          status: {
            equals: status,
            mode: 'insensitive',
          },
        })),
      },
      data: {
        deletedAt: new Date(),
        deletedByUserId: actorId,
        deleteReason,
      },
    });

    if (activeClaim.count === 0) {
      const inactiveClaim = await tx.rental.updateMany({
        where: {
          id: rental.id,
          tenantId,
          branchId,
          deletedAt: null,
        },
        data: {
          deletedAt: new Date(),
          deletedByUserId: actorId,
          deleteReason,
        },
      });

      if (inactiveClaim.count !== 1) {
        throw new Error('Rental already deleted');
      }
    }

    if (activeClaim.count === 1) {
      for (const rentalItem of rental.items) {
        await tx.item.updateMany({
          where: { id: rentalItem.itemId },
          data: {
            stock: {
              increment: rentalItem.qty,
            },
          },
        });
      }
    }

    const updated = await tx.rental.findUnique({
      where: { id: rental.id },
      include: {
        items: true,
        returnRecord: true,
      },
    });

    if (!updated) {
      throw new Error('Rental not found');
    }

    await tx.auditLog.create({
      data: {
        actorUserId: actorId,
        tenantId,
        branchId,
        action: 'rental.delete',
        targetType: 'rental',
        targetId: rental.id,
        snapshotBefore: toAuditRentalSnapshot(updated),
      },
    });

    return toRentalDto(updated);
  });

  return result;
}

export async function findUserByUsername(username) {
  return prisma.user.findUnique({
    where: { username },
  });
}

export async function getUserTenantMembershipSummary(userId) {
  const actorId = String(userId || '').trim();
  if (!actorId) {
    return { total: 0, active: 0, activeOnActiveTenant: 0 };
  }

  const [total, active, activeOnActiveTenant] = await prisma.$transaction([
    prisma.userMembership.count({
      where: { userId: actorId },
    }),
    prisma.userMembership.count({
      where: {
        userId: actorId,
        status: 'active',
      },
    }),
    prisma.userMembership.count({
      where: {
        userId: actorId,
        status: 'active',
        tenant: {
          status: 'active',
        },
      },
    }),
  ]);

  return { total, active, activeOnActiveTenant };
}

export async function findUserById(id) {
  return prisma.user.findUnique({
    where: { id },
  });
}

export async function rehashUserPassword(userId, plainPassword, passwordPepper) {
  const targetId = String(userId || '').trim();
  if (!targetId) {
    throw new Error('User id is required');
  }

  const passwordHash = await hashPassword(plainPassword, passwordPepper);
  await prisma.user.update({
    where: { id: targetId },
    data: {
      passwordHash,
    },
  });
}

function toUserDto(user) {
  return {
    id: user.id,
    username: user.username,
    role: normalizeRole(user.role),
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };
}

export async function listUsers() {
  const users = await prisma.user.findMany({
    orderBy: { createdAt: 'asc' },
  });

  return users.map(toUserDto);
}

export async function listTenantUsersForUser({
  userId,
  role,
  tenantId,
}) {
  const tenant = await resolveTenantForUser({
    userId,
    role,
    requestedTenantId: tenantId || 'current',
  });

  await ensureCanAdministerTenant({
    actorUserId: userId,
    actorRole: role,
    tenantId: tenant.id,
  });

  const memberships = await prisma.userMembership.findMany({
    where: {
      tenantId: tenant.id,
    },
    include: {
      user: true,
    },
    orderBy: { createdAt: 'asc' },
  });

  return memberships.map((membership) => ({
    ...toUserDto(membership.user),
    tenantMembershipId: membership.id,
    tenantRole: membership.role,
    tenantStatus: membership.status,
  }));
}

export async function createUser(payload, passwordPepper) {
  const normalizedUsername = String(payload.username || '').trim().toLowerCase();
  const role = normalizeRole(payload.role || 'kasir');
  const password = String(payload.password || '');

  if (!normalizedUsername) {
    throw new Error('Username is required');
  }

  if (!password) {
    throw new Error('Password is required');
  }

  if (!USER_ROLES.has(role)) {
    throw new Error('Role is invalid');
  }

  const existing = await prisma.user.findUnique({
    where: { username: normalizedUsername },
  });

  if (existing) {
    throw new Error('Username already exists');
  }

  const passwordHash = await hashPassword(password, passwordPepper);
  const created = await prisma.user.create({
    data: {
      username: normalizedUsername,
      passwordHash,
      role,
    },
  });

  return toUserDto(created);
}

export async function createTenantUserForUser({
  actorUserId,
  actorRole,
  tenantId,
  payload,
  passwordPepper,
}) {
  const tenant = await resolveTenantForUser({
    userId: actorUserId,
    role: actorRole,
    requestedTenantId: tenantId || 'current',
  });

  await ensureCanAdministerTenant({
    actorUserId,
    actorRole,
    tenantId: tenant.id,
  });

  const normalizedUsername = String(payload?.username || '').trim().toLowerCase();
  const password = String(payload?.password || '');
  const membershipRole = String(payload?.tenantRole || 'kasir').trim().toLowerCase();

  if (!normalizedUsername) {
    throw new Error('Username is required');
  }

  if (!password) {
    throw new Error('Password is required');
  }

  if (password.length < 8) {
    throw new Error('Password must be at least 8 characters');
  }

  if (membershipRole !== 'admin' && membershipRole !== 'kasir') {
    throw new Error('Tenant role is invalid');
  }

  await assertTenantCanCreateTenantUser(tenant.id);

  const existingUser = await prisma.user.findUnique({
    where: { username: normalizedUsername },
  });

  if (existingUser) {
    throw new Error('Username already exists');
  }

  const passwordHash = await hashPassword(password, passwordPepper);
  const created = await prisma.$transaction(async (tx) => {
    const newUser = await tx.user.create({
      data: {
        username: normalizedUsername,
        passwordHash,
        role: 'kasir',
      },
    });

    const membership = await tx.userMembership.create({
      data: {
        userId: newUser.id,
        tenantId: tenant.id,
        role: membershipRole,
        status: 'active',
      },
    });

    return {
      user: newUser,
      membership,
    };
  });

  return {
    ...toUserDto(created.user),
    tenantMembershipId: created.membership.id,
    tenantRole: created.membership.role,
    tenantStatus: created.membership.status,
  };
}

export async function onboardTenantForPlatformAdmin(payload, passwordPepper) {
  const normalizedUsername = String(payload?.ownerUsername || '').trim().toLowerCase();
  const password = String(payload?.ownerPassword || '');
  const storeName = String(payload?.storeName || '').trim();
  const storeSlugInput = String(payload?.storeSlug || '').trim().toLowerCase();
  const tenantStatus = String(payload?.tenantStatus || 'active').trim().toLowerCase();
  const initialBranchCode = String(payload?.initialBranchCode || DEFAULT_BRANCH_CODE).trim().toLowerCase();
  const initialBranchName = String(payload?.initialBranchName || DEFAULT_BRANCH_NAME).trim();
  const planId = String(payload?.planId || '').trim();
  const subscriptionStatus = String(payload?.subscriptionStatus || 'active').trim().toLowerCase();
  const startsAt = payload?.startsAt ? parseIsoDate(payload.startsAt, 'startsAt') : new Date();
  const endsAt = Object.prototype.hasOwnProperty.call(payload || {}, 'endsAt')
    ? parseOptionalIsoDate(payload.endsAt, 'endsAt')
    : null;
  const graceEndsAt = Object.prototype.hasOwnProperty.call(payload || {}, 'graceEndsAt')
    ? parseOptionalIsoDate(payload.graceEndsAt, 'graceEndsAt')
    : null;
  const billingNotes = String(payload?.billingNotes || '').trim();
  const tenantSlug = slugifyTenant(storeSlugInput || storeName);

  if (!normalizedUsername) {
    throw new Error('Username is required');
  }

  if (!password) {
    throw new Error('Password is required');
  }

  if (password.length < 8) {
    throw new Error('Password must be at least 8 characters');
  }

  if (!storeName) {
    throw new Error('Store name is required');
  }

  if (!tenantSlug) {
    throw new Error('Store slug is invalid');
  }

  if (!initialBranchCode) {
    throw new Error('Initial branch code is required');
  }

  if (!initialBranchName) {
    throw new Error('Initial branch name is required');
  }

  if (!TENANT_STATUSES.has(tenantStatus)) {
    throw new Error('Tenant status is invalid');
  }

  if (!SUBSCRIPTION_STATUSES.has(subscriptionStatus)) {
    throw new Error('Subscription status is invalid');
  }

  if (!planId) {
    throw new Error('Plan id is required');
  }

  const existingUser = await prisma.user.findUnique({
    where: { username: normalizedUsername },
  });

  if (existingUser) {
    throw new Error('Username already exists');
  }

  const existingTenant = await prisma.tenant.findUnique({
    where: { slug: tenantSlug },
  });

  if (existingTenant) {
    throw new Error('Store slug already exists');
  }

  const passwordHash = await hashPassword(password, passwordPepper);
  const created = await prisma.$transaction(async (tx) => {
    const selectedPlan = await tx.plan.findUnique({
      where: { id: planId },
    });
    if (!selectedPlan) {
      throw new Error('Plan not found');
    }

    const tenant = await tx.tenant.create({
      data: {
        slug: tenantSlug,
        name: storeName,
        status: tenantStatus,
      },
    });

    const branch = await tx.branch.create({
      data: {
        tenantId: tenant.id,
        code: initialBranchCode,
        name: initialBranchName,
        status: 'active',
      },
    });

    await tx.tenantSettings.create({
      data: {
        tenantId: tenant.id,
        storeName,
        addressLines: DEFAULT_TENANT_SETTINGS.addressLines,
        phone: DEFAULT_TENANT_SETTINGS.phone,
        legalFooterLines: DEFAULT_TENANT_SETTINGS.legalFooterLines,
        timezone: DEFAULT_TENANT_SETTINGS.timezone,
        currency: DEFAULT_TENANT_SETTINGS.currency,
        rentalDayCountMode: DEFAULT_TENANT_SETTINGS.rentalDayCountMode,
        rentalCutoffHour: DEFAULT_TENANT_SETTINGS.rentalCutoffHour,
        rentalCutoffMinute: DEFAULT_TENANT_SETTINGS.rentalCutoffMinute,
      },
    });

    await tx.category.createMany({
      data: DEFAULT_CATEGORIES.map((name) => ({
        tenantId: tenant.id,
        name,
      })),
    });

    await ensureTenantSubscriptionForTenant(tx, tenant.id, {
      planId: selectedPlan.id,
      status: subscriptionStatus,
      startsAt,
      endsAt,
      graceEndsAt,
      billingNotes,
      forcePlanUpdate: true,
      forceStatusUpdate: true,
    });

    const user = await tx.user.create({
      data: {
        username: normalizedUsername,
        passwordHash,
        role: 'kasir',
      },
    });

    const membership = await tx.userMembership.create({
      data: {
        userId: user.id,
        tenantId: tenant.id,
        role: 'owner',
        status: 'active',
      },
    });

    await tx.userBranchAccess.create({
      data: {
        userId: user.id,
        branchId: branch.id,
        role: 'admin',
      },
    });

    const subscription = await tx.tenantSubscription.findUnique({
      where: { tenantId: tenant.id },
      include: {
        plan: {
          include: { features: true },
        },
      },
    });

    return { user, membership, tenant, branch, subscription };
  });

  return {
    tenant: {
      ...toTenantDto(created.tenant),
      ownerUsernames: [created.user.username],
      branchCount: 1,
      membershipCount: 1,
      subscription: created.subscription ? toTenantSubscriptionDto(created.subscription) : null,
    },
    owner: {
      ...toUserDto(created.user),
      tenantMembershipId: created.membership.id,
      tenantRole: created.membership.role,
      membershipStatus: created.membership.status,
    },
    initialBranch: toBranchDto(created.branch),
  };
}

export async function updateUserByAdmin(userId, payload) {
  const targetId = String(userId || '').trim();
  if (!targetId) {
    throw new Error('User id is required');
  }

  const existing = await prisma.user.findUnique({
    where: { id: targetId },
  });

  if (!existing) {
    throw new Error('User not found');
  }

  const normalizedUsername = String(payload?.username || '').trim().toLowerCase();
  const role = normalizeRole(payload?.role);

  if (!normalizedUsername) {
    throw new Error('Username is required');
  }

  if (!role) {
    throw new Error('Role is required');
  }

  if (!USER_ROLES.has(role)) {
    throw new Error('Role is invalid');
  }

  if (normalizedUsername !== existing.username) {
    const usernameOwner = await prisma.user.findUnique({
      where: { username: normalizedUsername },
    });

    if (usernameOwner) {
      throw new Error('Username already exists');
    }
  }

  if (normalizeRole(existing.role) === 'admin' && role !== 'admin') {
    const adminCount = await prisma.user.count({
      where: { role: 'admin' },
    });
    if (adminCount <= 1) {
      throw new Error('At least one admin account is required');
    }
  }

  const updated = await prisma.user.update({
    where: { id: targetId },
    data: {
      username: normalizedUsername,
      role,
    },
  });

  return toUserDto(updated);
}

export async function changeUserPasswordByAdmin(userId, newPassword, passwordPepper) {
  const targetId = String(userId || '').trim();
  if (!targetId) {
    throw new Error('User id is required');
  }

  const existing = await prisma.user.findUnique({
    where: { id: targetId },
  });

  if (!existing) {
    throw new Error('User not found');
  }

  const passwordHash = await hashPassword(newPassword, passwordPepper);
  await prisma.user.update({
    where: { id: targetId },
    data: {
      passwordHash,
    },
  });

  return { updated: true };
}

export async function changeOwnPassword(userId, currentPassword, newPassword, passwordPepper) {
  const targetId = String(userId || '').trim();
  if (!targetId) {
    throw new Error('User id is required');
  }

  const existing = await prisma.user.findUnique({
    where: { id: targetId },
  });

  if (!existing) {
    throw new Error('User not found');
  }

  const validCurrentPassword = await verifyPassword(
    currentPassword,
    existing.passwordHash,
    passwordPepper,
  );
  if (!validCurrentPassword) {
    throw new Error('Current password is incorrect');
  }

  const passwordHash = await hashPassword(newPassword, passwordPepper);
  await prisma.user.update({
    where: { id: targetId },
    data: {
      passwordHash,
    },
  });

  return { updated: true };
}

export async function deleteUserByAdmin(actorUserId, targetUserId) {
  const actorId = String(actorUserId || '').trim();
  const userId = String(targetUserId || '').trim();

  if (!actorId) {
    throw new Error('Actor user id is required');
  }

  if (!userId) {
    throw new Error('User id is required');
  }

  if (actorId === userId) {
    throw new Error('You cannot delete your own account');
  }

  const existing = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!existing) {
    throw new Error('User not found');
  }

  if (normalizeRole(existing.role) === 'admin') {
    const adminCount = await prisma.user.count({
      where: { role: 'admin' },
    });

    if (adminCount <= 1) {
      throw new Error('At least one admin account is required');
    }
  }

  await prisma.user.delete({
    where: { id: userId },
  });

  return toUserDto(existing);
}
