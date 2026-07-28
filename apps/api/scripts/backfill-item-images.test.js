import { describe, expect, it, vi } from 'vitest';
import { parseBackfillItemImageArgs, runItemImageBackfillCli } from './backfill-item-images.mjs';

describe('item image backfill CLI', () => {
  it('parses apply, limit, and tenant filters', () => {
    expect(parseBackfillItemImageArgs([
      '--apply',
      '--limit=25',
      '--tenant-id',
      'tenant-1',
    ])).toEqual({
      apply: true,
      limit: 25,
      tenantId: 'tenant-1',
    });
  });

  it('defaults to dry-run mode', async () => {
    const writeLine = vi.fn();
    const database = {
      item: {
        findMany: vi.fn().mockResolvedValue([]),
        update: vi.fn(),
      },
    };

    const exitCode = await runItemImageBackfillCli({
      argv: [],
      database,
      writeLine,
      storageDir: 'uploads/item-images',
      publicBaseUrl: '/uploads/item-images',
    });

    expect(exitCode).toBe(0);
    expect(JSON.parse(writeLine.mock.calls[0][0])).toMatchObject({
      ok: true,
      mode: 'dry-run',
    });
  });
});
