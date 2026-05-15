import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const DEFAULT_TENANT = {
  slug: 'default-avia',
  name: 'AviaOutdoor',
};

const DEFAULT_BRANCH = {
  code: 'pusat',
  name: 'Toko Pusat',
};

const DEFAULT_SETTINGS = {
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

async function ensureDefaultTenantScope() {
  const tenant = await prisma.tenant.upsert({
    where: { slug: DEFAULT_TENANT.slug },
    update: {},
    create: {
      slug: DEFAULT_TENANT.slug,
      name: DEFAULT_TENANT.name,
      status: 'active',
    },
  });

  const branch = await prisma.branch.upsert({
    where: {
      tenantId_code: {
        tenantId: tenant.id,
        code: DEFAULT_BRANCH.code,
      },
    },
    update: {},
    create: {
      tenantId: tenant.id,
      code: DEFAULT_BRANCH.code,
      name: DEFAULT_BRANCH.name,
      status: 'active',
    },
  });

  await prisma.tenantSettings.upsert({
    where: { tenantId: tenant.id },
    update: {},
    create: {
      tenantId: tenant.id,
      ...DEFAULT_SETTINGS,
    },
  });

  return { tenant, branch };
}

async function ensureAdminMembership(tenantId) {
  const adminUser = await prisma.user.findFirst({
    where: {
      role: {
        in: ['admin', 'superuser'],
      },
    },
    orderBy: { createdAt: 'asc' },
  });

  if (!adminUser) {
    return;
  }

  await prisma.userMembership.upsert({
    where: {
      userId_tenantId: {
        userId: adminUser.id,
        tenantId,
      },
    },
    update: {
      role: 'owner',
      status: 'active',
    },
    create: {
      userId: adminUser.id,
      tenantId,
      role: 'owner',
      status: 'active',
    },
  });
}

async function main() {
  const { tenant, branch } = await ensureDefaultTenantScope();
  await ensureAdminMembership(tenant.id);

  const results = await prisma.$transaction([
    prisma.category.updateMany({
      where: { tenantId: null },
      data: { tenantId: tenant.id },
    }),
    prisma.item.updateMany({
      where: { tenantId: null },
      data: { tenantId: tenant.id },
    }),
    prisma.rental.updateMany({
      where: { tenantId: null },
      data: { tenantId: tenant.id },
    }),
    prisma.rental.updateMany({
      where: { branchId: null },
      data: { branchId: branch.id },
    }),
    prisma.returnRecord.updateMany({
      where: { tenantId: null },
      data: { tenantId: tenant.id },
    }),
    prisma.returnRecord.updateMany({
      where: { branchId: null },
      data: { branchId: branch.id },
    }),
    prisma.customer.updateMany({
      where: { tenantId: null },
      data: { tenantId: tenant.id },
    }),
    prisma.auditLog.updateMany({
      where: { tenantId: null },
      data: { tenantId: tenant.id },
    }),
    prisma.auditLog.updateMany({
      where: { branchId: null },
      data: { branchId: branch.id },
    }),
  ]);

  console.log('[backfill-tenant-scope] done');
  console.log({
    defaultTenantId: tenant.id,
    defaultBranchId: branch.id,
    categoryUpdated: results[0].count,
    itemUpdated: results[1].count,
    rentalTenantUpdated: results[2].count,
    rentalBranchUpdated: results[3].count,
    returnTenantUpdated: results[4].count,
    returnBranchUpdated: results[5].count,
    customerUpdated: results[6].count,
    auditTenantUpdated: results[7].count,
    auditBranchUpdated: results[8].count,
  });
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
