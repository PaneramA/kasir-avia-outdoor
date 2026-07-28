import { describe, expect, it, vi } from 'vitest';
import { runItemImageAuditCli } from './audit-item-images.mjs';

describe('item image audit CLI', () => {
  it('reads item image fields and writes one JSON summary line', async () => {
    const pngBytes = Buffer.alloc(6, 1).toString('base64');
    const database = {
      item: {
        findMany: vi.fn().mockResolvedValue([{
          id: 'item-1',
          name: 'Tenda',
          tenantId: 'tenant-1',
          branchId: 'branch-1',
          image: `data:image/png;base64,${pngBytes}`,
        }]),
      },
    };
    const writeLine = vi.fn();

    const exitCode = await runItemImageAuditCli({ database, writeLine });

    expect(exitCode).toBe(0);
    expect(database.item.findMany).toHaveBeenCalledWith({
      select: {
        id: true,
        name: true,
        tenantId: true,
        branchId: true,
        image: true,
      },
      orderBy: { createdAt: 'asc' },
    });
    expect(writeLine).toHaveBeenCalledOnce();
    expect(JSON.parse(writeLine.mock.calls[0][0])).toMatchObject({
      ok: true,
      summary: {
        totalItems: 1,
        inlineImageBytes: 6,
        counts: { 'base64-image': 1 },
      },
    });
  });

  it('returns nonzero and writes an error object when audit fails', async () => {
    const database = {
      item: {
        findMany: vi.fn().mockRejectedValue(new Error('database unavailable')),
      },
    };
    const writeLine = vi.fn();

    const exitCode = await runItemImageAuditCli({ database, writeLine });

    expect(exitCode).toBe(1);
    expect(JSON.parse(writeLine.mock.calls[0][0])).toEqual({
      ok: false,
      error: 'database unavailable',
    });
  });
});
