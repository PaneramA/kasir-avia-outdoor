import { PrismaClient } from '@prisma/client';
import { createHash } from 'node:crypto';

const prisma = new PrismaClient();

function hashPassword(password, pepper) {
  return createHash('sha256').update(`${password}:${pepper}`).digest('hex');
}

async function main() {
  const adminUsername = process.env.ADMIN_USERNAME || 'admin';
  const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';
  const pepper = process.env.PASSWORD_PEPPER || 'change-me-pepper';

  const categories = ['Tenda', 'Carrier', 'Alat Masak', 'Lainnya'];

  const tenant = await prisma.tenant.upsert({
    where: { slug: 'default-avia' },
    update: {},
    create: {
      slug: 'default-avia',
      name: 'AviaOutdoor',
      status: 'active',
    },
  });

  const branch = await prisma.branch.upsert({
    where: {
      tenantId_code: {
        tenantId: tenant.id,
        code: 'pusat',
      },
    },
    update: {},
    create: {
      tenantId: tenant.id,
      code: 'pusat',
      name: 'Toko Pusat',
      status: 'active',
    },
  });

  for (const categoryName of categories) {
    await prisma.category.upsert({
      where: {
        tenantId_name: {
          tenantId: tenant.id,
          name: categoryName,
        },
      },
      update: {},
      create: {
        tenantId: tenant.id,
        name: categoryName,
      },
    });
  }

  const adminUser = await prisma.user.upsert({
    where: { username: adminUsername },
    update: {
      passwordHash: hashPassword(adminPassword, pepper),
      role: 'admin',
    },
    create: {
      username: adminUsername,
      passwordHash: hashPassword(adminPassword, pepper),
      role: 'admin',
    },
  });

  await prisma.userMembership.upsert({
    where: {
      userId_tenantId: {
        userId: adminUser.id,
        tenantId: tenant.id,
      },
    },
    update: {
      role: 'owner',
      status: 'active',
    },
    create: {
      userId: adminUser.id,
      tenantId: tenant.id,
      role: 'owner',
      status: 'active',
    },
  });

  await prisma.tenantSettings.upsert({
    where: { tenantId: tenant.id },
    update: {},
    create: {
      tenantId: tenant.id,
      storeName: 'AviaOutdoor',
      addressLines: ['Jl. Contoh Alamat No. 123', 'Bandung, Jawa Barat'],
      phone: '0812-0000-0000',
      legalFooterLines: [
        'Barang yang sudah disewa menjadi tanggung jawab penyewa.',
        'Keterlambatan pengembalian dapat dikenakan biaya tambahan.',
      ],
      timezone: 'Asia/Jakarta',
      currency: 'IDR',
    },
  });

  console.log(`[seed] admin user ready: ${adminUsername}`);
  console.log(`[seed] tenant ready: ${tenant.name} (${tenant.id})`);
  console.log(`[seed] branch ready: ${branch.name} (${branch.id})`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
