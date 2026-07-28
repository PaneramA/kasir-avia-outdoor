import { pathToFileURL } from 'node:url';
import { prisma } from '../src/data/prisma.js';
import { summarizeItemImages } from '../src/images/itemImageAudit.js';

export async function runItemImageAuditCli({
  database = prisma,
  writeLine = console.log,
} = {}) {
  try {
    const items = await database.item.findMany({
      select: {
        id: true,
        name: true,
        tenantId: true,
        branchId: true,
        image: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    writeLine(JSON.stringify({
      ok: true,
      summary: summarizeItemImages(items),
    }));
    return 0;
  } catch (error) {
    writeLine(JSON.stringify({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }));
    return 1;
  }
}

const isDirectExecution = process.argv[1]
  && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectExecution) {
  process.exitCode = await runItemImageAuditCli();
  await prisma.$disconnect();
}
