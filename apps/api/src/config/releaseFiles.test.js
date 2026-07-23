import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const brokenMigrationPath = fileURLToPath(
  new URL('../../prisma/migrations/0003_rental_soft_delete_audit/migration.sql', import.meta.url),
);
const deployWorkflowPath = fileURLToPath(
  new URL('../../../../.github/workflows/deploy.yml', import.meta.url),
);

describe('release-critical files', () => {
  it('keeps rental soft-delete migration as raw SQL without wrapped quotes', () => {
    const migration = readFileSync(brokenMigrationPath, 'utf8').replace(/\r\n/g, '\n');

    expect(migration.startsWith('-- AlterTable')).toBe(true);
    expect(migration.startsWith('"')).toBe(false);
    expect(migration.includes('\nALTER TABLE "public"."Rental"\n')).toBe(true);
  });

  it('deploy workflow verifies and ships the exact tested commit over trusted SSH', () => {
    const workflow = readFileSync(deployWorkflowPath, 'utf8');

    expect(workflow).toContain('VPS_SSH_HOST_FINGERPRINT');
    expect(workflow).toContain("StrictHostKeyChecking=yes");
    expect(workflow).toContain("ref: ${{ github.sha }}");
    expect(workflow).toContain("/usr/local/bin/deploy-kasir.sh '$DEPLOY_SHA'");
    expect(workflow).not.toContain('StrictHostKeyChecking=no');
    expect(workflow).not.toContain('VPS_SSH_PASSPHRASE');
    expect(workflow).not.toContain('git pull --ff-only origin main');
  });
});
