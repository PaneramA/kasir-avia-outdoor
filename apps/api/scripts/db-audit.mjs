import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const RETURNED_STATUSES = new Set(['returned', 'selesai', 'completed', 'done']);

function normalizeStatus(rawStatus) {
  return String(rawStatus || '').trim().toLowerCase();
}

function isReturnedStatus(rawStatus) {
  return RETURNED_STATUSES.has(normalizeStatus(rawStatus));
}

async function main() {
  const [usersCount, itemsCount, customersCount, rentalsCount, returnsCount] = await prisma.$transaction([
    prisma.user.count(),
    prisma.item.count(),
    prisma.customer.count(),
    prisma.rental.count(),
    prisma.returnRecord.count(),
  ]);

  const rentals = await prisma.rental.findMany({
    select: {
      id: true,
      status: true,
      customerName: true,
      customerPhone: true,
      date: true,
      returnRecord: {
        select: {
          id: true,
          returnDate: true,
        },
      },
    },
    orderBy: { date: 'desc' },
  });

  const users = await prisma.user.findMany({
    select: {
      id: true,
      username: true,
      role: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'desc' },
  });

  const statusBuckets = new Map();
  for (const rental of rentals) {
    const key = String(rental.status || '').trim() || '(empty)';
    statusBuckets.set(key, (statusBuckets.get(key) || 0) + 1);
  }

  const rentalsReturnedButNoReturnRecord = rentals.filter((rental) => (
    isReturnedStatus(rental.status) && !rental.returnRecord
  ));

  const rentalsActiveButHasReturnRecord = rentals.filter((rental) => (
    !isReturnedStatus(rental.status) && Boolean(rental.returnRecord)
  ));

  const usersWithUnexpectedRole = users.filter((user) => {
    const role = String(user.role || '').trim().toLowerCase();
    return role !== 'admin' && role !== 'kasir';
  });

  const result = {
    generatedAt: new Date().toISOString(),
    counts: {
      users: usersCount,
      items: itemsCount,
      customers: customersCount,
      rentals: rentalsCount,
      returnRecords: returnsCount,
    },
    rentalStatusDistribution: [...statusBuckets.entries()]
      .map(([status, count]) => ({ status, count }))
      .sort((a, b) => b.count - a.count),
    checks: {
      usersWithUnexpectedRole: {
        count: usersWithUnexpectedRole.length,
        sample: usersWithUnexpectedRole.slice(0, 20),
      },
      rentalsReturnedButNoReturnRecord: {
        count: rentalsReturnedButNoReturnRecord.length,
        sample: rentalsReturnedButNoReturnRecord.slice(0, 20),
      },
      rentalsActiveButHasReturnRecord: {
        count: rentalsActiveButHasReturnRecord.length,
        sample: rentalsActiveButHasReturnRecord.slice(0, 20),
      },
    },
    latestUsers: users.slice(0, 20),
    latestRentals: rentals.slice(0, 20),
  };

  console.log(JSON.stringify(result, null, 2));
}

main()
  .catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[db-audit] failed: ${message}`);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

