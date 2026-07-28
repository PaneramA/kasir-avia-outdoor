import { pathToFileURL } from 'node:url';
import { getEnv } from '../src/config/env.js';
import { prisma } from '../src/data/prisma.js';
import { backfillItemImages } from '../src/images/itemImageBackfill.js';

function readOptionValue(argv, index) {
  return argv[index + 1] && !String(argv[index + 1]).startsWith('-')
    ? String(argv[index + 1])
    : '';
}

export function parseBackfillItemImageArgs(argv = process.argv.slice(2)) {
  const options = {
    apply: false,
    limit: 50,
    tenantId: '',
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = String(argv[index] || '').trim();
    if (arg === '--apply') {
      options.apply = true;
    } else if (arg === '--limit') {
      options.limit = Number(readOptionValue(argv, index)) || options.limit;
      index += 1;
    } else if (arg.startsWith('--limit=')) {
      options.limit = Number(arg.slice('--limit='.length)) || options.limit;
    } else if (arg === '--tenant-id') {
      options.tenantId = readOptionValue(argv, index);
      index += 1;
    } else if (arg.startsWith('--tenant-id=')) {
      options.tenantId = arg.slice('--tenant-id='.length);
    }
  }

  return options;
}

export async function runItemImageBackfillCli({
  argv = process.argv.slice(2),
  database = prisma,
  writeLine = console.log,
  storageDir,
  publicBaseUrl,
} = {}) {
  const env = getEnv();
  const options = parseBackfillItemImageArgs(argv);

  try {
    const result = await backfillItemImages({
      database,
      apply: options.apply,
      tenantId: options.tenantId,
      limit: options.limit,
      storageDir: storageDir || env.itemImageStorageDir,
      publicBaseUrl: publicBaseUrl || env.publicUploadsBaseUrl,
    });
    writeLine(JSON.stringify(result));
    return result.ok ? 0 : 1;
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
  process.exitCode = await runItemImageBackfillCli();
  await prisma.$disconnect();
}
