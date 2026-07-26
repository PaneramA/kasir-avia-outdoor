import { executeAccessBackfill } from '../src/data/accessBackfill.js';
import { getEnv } from '../src/config/env.js';
import { prisma } from '../src/data/prisma.js';

const apply = process.argv.includes('--apply');
const env = getEnv();

try {
  const result = await executeAccessBackfill({
    database: prisma,
    apply,
    platformAdminUsername: env.adminUsername,
  });
  console.log(JSON.stringify(result, null, 2));

  if (result.unresolved.length > 0) {
    console.error('[backfill-user-access] Resolve every unresolved account before restarting the API.');
    process.exitCode = 2;
  }
} catch (error) {
  const message = error instanceof Error ? error.stack || error.message : String(error);
  console.error('[backfill-user-access] Failed:', message);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
