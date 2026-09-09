import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('rental ledger migration', () => {
  it('uses additive tables and conflict-safe deterministic backfill IDs', async () => {
    const sql = await readFile(
      new URL('../../prisma/migrations/0012_rental_payments_charges/migration.sql', import.meta.url),
      'utf8',
    );

    expect(sql).toContain('CREATE TABLE "RentalPayment"');
    expect(sql).toContain('CREATE TABLE "RentalCharge"');
    expect(sql).toContain("'legacy-payment-' || r.\"id\"");
    expect(sql).toContain("'legacy-charge-' || r.\"id\"");
    expect(sql.match(/ON CONFLICT/g)).toHaveLength(2);
  });
});
