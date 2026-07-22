import { pathToFileURL } from 'node:url';
import { hashPassword } from '../src/auth/password.js';
import { getEnv } from '../src/config/env.js';
import { prisma } from '../src/data/prisma.js';

export async function rotateAdminCredentials({
  database,
  username,
  password,
  pepper,
  hash = hashPassword,
} = {}) {
  if (!database?.user?.upsert) {
    throw new Error('Database client is required');
  }

  const normalizedUsername = String(username || '').trim().toLowerCase();
  if (!normalizedUsername) {
    throw new Error('ADMIN_USERNAME is required');
  }
  if (String(password || '').length < 16) {
    throw new Error('ADMIN_PASSWORD must be at least 16 characters');
  }
  if (String(pepper || '').length < 16) {
    throw new Error('PASSWORD_PEPPER must be at least 16 characters');
  }

  const passwordHash = await hash(password, pepper);
  return database.user.upsert({
    where: { username: normalizedUsername },
    update: { passwordHash, role: 'superuser' },
    create: {
      username: normalizedUsername,
      passwordHash,
      role: 'superuser',
    },
    select: { id: true, username: true, role: true },
  });
}

export async function runAdminCredentialRotationCli({
  database = prisma,
  env = getEnv(),
  writeLine = console.log,
} = {}) {
  const admin = await rotateAdminCredentials({
    database,
    username: env.adminUsername,
    password: env.adminPassword,
    pepper: env.passwordPepper,
  });
  writeLine(JSON.stringify({ ok: true, admin }));
  return 0;
}

const isDirectExecution = process.argv[1]
  && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectExecution) {
  try {
    process.exitCode = await runAdminCredentialRotationCli();
  } catch (error) {
    console.error(JSON.stringify({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }));
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}
