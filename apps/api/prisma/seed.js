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

  for (const categoryName of categories) {
    await prisma.category.upsert({
      where: { name: categoryName },
      update: {},
      create: { name: categoryName },
    });
  }

  await prisma.user.upsert({
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

  console.log(`[seed] admin user ready: ${adminUsername}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
