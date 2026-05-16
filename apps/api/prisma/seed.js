import { PrismaClient } from '@prisma/client';
import { createHash } from 'node:crypto';
import { getSeedUsers } from './seed.users.js';

const prisma = new PrismaClient();

function hashPassword(password, pepper) {
  return createHash('sha256').update(`${password}:${pepper}`).digest('hex');
}

async function main() {
  const adminUsername = process.env.ADMIN_USERNAME || 'admin';
  const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';
  const pepper = process.env.PASSWORD_PEPPER || 'change-me-pepper';
  const seedUsers = getSeedUsers({ adminUsername, adminPassword });
  const duplicateUsernames = seedUsers.reduce((accumulator, user) => {
    const next = accumulator;
    if (next.seen.has(user.username)) {
      next.duplicates.add(user.username);
    }
    next.seen.add(user.username);
    return next;
  }, { seen: new Set(), duplicates: new Set() });

  if (duplicateUsernames.duplicates.size > 0) {
    const duplicateList = [...duplicateUsernames.duplicates].join(', ');
    throw new Error(`Duplikat username pada seed.users.js: ${duplicateList}`);
  }

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

  for (const seedUser of seedUsers) {
    const user = await prisma.user.upsert({
      where: { username: seedUser.username },
      update: {
        passwordHash: hashPassword(seedUser.password, pepper),
        role: seedUser.role,
      },
      create: {
        username: seedUser.username,
        passwordHash: hashPassword(seedUser.password, pepper),
        role: seedUser.role,
      },
    });

    await prisma.userMembership.upsert({
      where: {
        userId_tenantId: {
          userId: user.id,
          tenantId: tenant.id,
        },
      },
      update: {
        role: seedUser.membershipRole,
        status: 'active',
      },
      create: {
        userId: user.id,
        tenantId: tenant.id,
        role: seedUser.membershipRole,
        status: 'active',
      },
    });
  }

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

  console.log(`[seed] users ready: ${seedUsers.map((user) => user.username).join(', ')}`);
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
