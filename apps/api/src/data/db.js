import { prisma } from './prisma.js';
import { hashPassword, verifyPassword } from '../auth/password.js';

const DEFAULT_CATEGORIES = ['Tenda', 'Carrier', 'Alat Masak', 'Lainnya'];
const USER_ROLES = new Set(['admin', 'superuser', 'kasir']);
const TENANT_MEMBERSHIP_ROLES = new Set(['owner', 'admin', 'kasir']);
const TENANT_MEMBERSHIP_STATUSES = new Set(['active', 'inactive']);
const BRANCH_ACCESS_ROLES = new Set(['admin', 'kasir']);
const TENANT_STATUSES = new Set(['active', 'suspended']);
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
};

function createId(prefix) {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
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

function isSuperuserRole(rawRole) {
  return normalizeRole(rawRole) === 'superuser';
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
  };
}

function toRentalDto(rental) {
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
    status: rental.status,
    date: rental.date.toISOString(),
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
  return {
    tenantId: settings.tenantId,
    storeName: settings.storeName,
    addressLines: normalizeLines(settings.addressLines),
    phone: settings.phone || '',
    legalFooterLines: normalizeLines(settings.legalFooterLines),
    timezone: settings.timezone || DEFAULT_TENANT_SETTINGS.timezone,
    currency: settings.currency || DEFAULT_TENANT_SETTINGS.currency,
    createdAt: settings.createdAt.toISOString(),
    updatedAt: settings.updatedAt.toISOString(),
  };
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
  return {
    id: tenant.id,
    slug: tenant.slug,
    name: tenant.name,
    status: tenant.status,
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
    },
  });

  return tenant;
}

export async function initDatabase(env) {
  await prisma.$connect();

  await prisma.$transaction(async (tx) => {
    const defaultTenant = await ensureDefaultTenantAndBranch(tx);

    const adminUser = await tx.user.upsert({
      where: { username: env.adminUsername },
      update: {
        role: 'admin',
      },
      create: {
        username: env.adminUsername,
        passwordHash: hashPassword(env.adminPassword, env.passwordPepper),
        role: 'admin',
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
    where: withTenantBranchScope({}, context),
    include: { category: true },
    orderBy: { createdAt: 'asc' },
  });

  return items.map(toItemDto);
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

  const updated = await prisma.item.update({
    where: { id: targetId },
    data: {
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

  return toItemDto(updated);
}

export async function deleteItem(id, context) {
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

  const usages = await prisma.rentalItem.findMany({
    where: {
      itemId: targetId,
      rental: withTenantBranchScope({}, context, { includeBranchNull: false }),
    },
    select: {
      id: true,
      rental: {
        select: {
          status: true,
          deletedAt: true,
        },
      },
    },
  });

  const activeUsageCount = usages.reduce((count, usage) => (
    usage.rental?.deletedAt === null && isActiveRentalStatus(usage.rental?.status) ? count + 1 : count
  ), 0);

  if (activeUsageCount > 0) {
    throw new Error('Item is used by active rentals');
  }

  if (usages.length > 0) {
    await prisma.rentalItem.deleteMany({
      where: {
        id: {
          in: usages.map((usage) => usage.id),
        },
      },
    });
  }

  await prisma.item.delete({
    where: { id: targetId },
  });

  return toItemDto(existing);
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
  const duration = Number(payload?.duration);

  if (!customerName) {
    throw new Error('Customer name is required');
  }

  if (!customerPhone) {
    throw new Error('Customer phone is required');
  }

  if (!Number.isFinite(duration) || duration < 1) {
    throw new Error('Duration must be a number >= 1');
  }

  if (items.length === 0) {
    throw new Error('Rental items are required');
  }

  const rental = await prisma.$transaction(async (tx) => {
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

    for (const [itemId, request] of itemRequests.entries()) {
      const item = await tx.item.findUnique({
        where: { id: itemId },
        include: { category: true },
      });

      if (!item) {
        throw new Error(`Item ${itemId} not found`);
      }

      if (context?.tenantId && item.tenantId && item.tenantId !== context.tenantId) {
        throw new Error(`Item ${itemId} not available in current tenant`);
      }

      if (context?.branchId && item.branchId && item.branchId !== context.branchId) {
        throw new Error(`Item ${itemId} not available in current branch`);
      }

      const decrementResult = await tx.item.updateMany({
        where: {
          id: item.id,
          stock: { gte: request.qty },
        },
        data: {
          stock: {
            decrement: request.qty,
          },
        },
      });

      if (decrementResult.count === 0) {
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
        status: 'Active',
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

    if (!membership || membership.status !== 'active') {
      throw new Error('Forbidden');
    }

    return tenant;
  }

  const membership = await prisma.userMembership.findFirst({
    where: {
      userId,
      status: 'active',
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

  // Backward compatibility: existing kasir accounts without membership
  // still need to access default tenant while migration is in progress.
  return ensureDefaultTenant();
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
  const isSuperuser = isSuperuserRole(role);

  if (isSuperuser) {
    const tenants = await prisma.tenant.findMany({
      orderBy: { createdAt: 'asc' },
    });

    return tenants.map((tenant) => toTenantDto(tenant));
  }

  const memberships = await prisma.userMembership.findMany({
    where: {
      userId,
      status: 'active',
    },
    include: {
      tenant: true,
    },
    orderBy: { createdAt: 'asc' },
  });

  if (memberships.length === 0) {
    const fallbackTenant = await ensureDefaultTenant();
    return [toTenantDto(fallbackTenant)];
  }

  return memberships.map(({ tenant }) => toTenantDto(tenant));
}

export async function createTenantForSuperuser(payload) {
  const tenantName = String(payload?.name || '').trim();
  const tenantStatus = String(payload?.status || 'active').trim().toLowerCase();
  const slugFromPayload = String(payload?.slug || '').trim().toLowerCase();
  const ownerUserId = String(payload?.ownerUserId || '').trim();
  const initialBranchCode = String(payload?.initialBranchCode || DEFAULT_BRANCH_CODE).trim().toLowerCase();
  const initialBranchName = String(payload?.initialBranchName || DEFAULT_BRANCH_NAME).trim();

  if (!tenantName) {
    throw new Error('Tenant name is required');
  }

  if (!TENANT_STATUSES.has(tenantStatus)) {
    throw new Error('Tenant status is invalid');
  }

  const tenantSlug = slugifyTenant(slugFromPayload || tenantName);
  if (!tenantSlug) {
    throw new Error('Tenant slug is invalid');
  }

  if (!initialBranchCode) {
    throw new Error('Initial branch code is required');
  }

  if (!initialBranchName) {
    throw new Error('Initial branch name is required');
  }

  if (ownerUserId) {
    const owner = await prisma.user.findUnique({
      where: { id: ownerUserId },
    });

    if (!owner) {
      throw new Error('Owner user not found');
    }
  }

  const duplicate = await prisma.tenant.findUnique({
    where: { slug: tenantSlug },
  });

  if (duplicate) {
    throw new Error('Tenant slug already exists');
  }

  const result = await prisma.$transaction(async (tx) => {
    const createdTenant = await tx.tenant.create({
      data: {
        slug: tenantSlug,
        name: tenantName,
        status: tenantStatus,
      },
    });

    const createdBranch = await tx.branch.create({
      data: {
        tenantId: createdTenant.id,
        code: initialBranchCode,
        name: initialBranchName,
        status: 'active',
      },
    });

    await tx.tenantSettings.create({
      data: {
        tenantId: createdTenant.id,
        storeName: tenantName,
        addressLines: DEFAULT_TENANT_SETTINGS.addressLines,
        phone: DEFAULT_TENANT_SETTINGS.phone,
        legalFooterLines: DEFAULT_TENANT_SETTINGS.legalFooterLines,
        timezone: DEFAULT_TENANT_SETTINGS.timezone,
        currency: DEFAULT_TENANT_SETTINGS.currency,
      },
    });

    if (ownerUserId) {
      await tx.userMembership.upsert({
        where: {
          userId_tenantId: {
            userId: ownerUserId,
            tenantId: createdTenant.id,
          },
        },
        update: {
          role: 'owner',
          status: 'active',
        },
        create: {
          userId: ownerUserId,
          tenantId: createdTenant.id,
          role: 'owner',
          status: 'active',
        },
      });
    }

    return {
      tenant: createdTenant,
      initialBranch: createdBranch,
    };
  });

  return {
    ...toTenantDto(result.tenant),
    initialBranch: toBranchDto(result.initialBranch),
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

export async function listBranchesForUser({ userId, role, tenantId }) {
  const tenant = await resolveTenantForUser({
    userId,
    role,
    requestedTenantId: tenantId || 'current',
  });

  const normalizedRole = normalizeRole(role);
  const isAdminLike = normalizedRole === 'admin' || normalizedRole === 'superuser';
  const hasAccessRules = await prisma.userBranchAccess.count({
    where: { userId },
  });

  if (!isAdminLike && hasAccessRules > 0) {
    const accessRows = await prisma.userBranchAccess.findMany({
      where: {
        userId,
        branch: {
          tenantId: tenant.id,
        },
      },
      include: {
        branch: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    return accessRows.map(({ branch }) => toBranchDto(branch));
  }

  const branches = await prisma.branch.findMany({
    where: {
      tenantId: tenant.id,
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
  const branchId = String(requestedBranchId || '').trim();
  const hasAccessRules = await prisma.userBranchAccess.count({
    where: { userId },
  });

  const baseBranchWhere = {
    tenantId: tenant.id,
    ...(branchId ? { id: branchId } : {}),
  };

  if (!isAdminLike && hasAccessRules > 0) {
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
      throw new Error('Forbidden');
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

  const updated = await prisma.tenantSettings.upsert({
    where: { tenantId: tenant.id },
    update: {
      ...(typeof nextStoreName === 'string' ? { storeName: nextStoreName || tenant.name } : {}),
      ...(typeof nextAddressLines !== 'undefined' ? { addressLines: nextAddressLines } : {}),
      ...(typeof nextLegalFooterLines !== 'undefined' ? { legalFooterLines: nextLegalFooterLines } : {}),
      ...(typeof nextPhone === 'string' ? { phone: nextPhone || null } : {}),
      ...(typeof nextTimezone === 'string' ? { timezone: nextTimezone || DEFAULT_TENANT_SETTINGS.timezone } : {}),
      ...(typeof nextCurrency === 'string' ? { currency: nextCurrency || DEFAULT_TENANT_SETTINGS.currency } : {}),
    },
    create: {
      tenantId: tenant.id,
      storeName: nextStoreName || tenant.name || DEFAULT_TENANT_SETTINGS.storeName,
      addressLines: nextAddressLines || DEFAULT_TENANT_SETTINGS.addressLines,
      phone: typeof nextPhone === 'string' ? (nextPhone || null) : DEFAULT_TENANT_SETTINGS.phone,
      legalFooterLines: nextLegalFooterLines || DEFAULT_TENANT_SETTINGS.legalFooterLines,
      timezone: nextTimezone || DEFAULT_TENANT_SETTINGS.timezone,
      currency: nextCurrency || DEFAULT_TENANT_SETTINGS.currency,
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

  if (!rentalId) {
    throw new Error('rentalId is required');
  }

  if (!Number.isFinite(additionalFee) || additionalFee < 0) {
    throw new Error('additionalFee must be a number >= 0');
  }

  const result = await prisma.$transaction(async (tx) => {
    const rental = await tx.rental.findUnique({
      where: { id: rentalId },
      include: { items: true },
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

    if (isReturnedRentalStatus(rental.status)) {
      throw new Error('Rental already returned');
    }

    const returnDate = new Date();
    const returnNotes = payload?.returnNotes || '';
    const finalTotal = rental.total + additionalFee;

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
    status: rental.status,
    date: rental.date.toISOString(),
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

    if (isActiveRentalStatus(rental.status) && !rental.returnRecord) {
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

    const updated = await tx.rental.update({
      where: { id: rental.id },
      data: {
        deletedAt: new Date(),
        deletedByUserId: actorId,
        deleteReason,
      },
      include: {
        items: true,
      },
    });

    await tx.auditLog.create({
      data: {
        actorUserId: actorId,
        tenantId,
        branchId,
        action: 'rental.delete',
        targetType: 'rental',
        targetId: rental.id,
        snapshotBefore: toAuditRentalSnapshot(rental),
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

  await prisma.user.update({
    where: { id: targetId },
    data: {
      passwordHash: hashPassword(plainPassword, passwordPepper),
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

  const created = await prisma.user.create({
    data: {
      username: normalizedUsername,
      passwordHash: hashPassword(password, passwordPepper),
      role,
    },
  });

  return toUserDto(created);
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

  await prisma.user.update({
    where: { id: targetId },
    data: {
      passwordHash: hashPassword(newPassword, passwordPepper),
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

  const validCurrentPassword = verifyPassword(currentPassword, existing.passwordHash, passwordPepper);
  if (!validCurrentPassword) {
    throw new Error('Current password is incorrect');
  }

  await prisma.user.update({
    where: { id: targetId },
    data: {
      passwordHash: hashPassword(newPassword, passwordPepper),
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
