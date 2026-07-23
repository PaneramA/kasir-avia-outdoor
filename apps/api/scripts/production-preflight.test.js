import { describe, expect, it, vi } from 'vitest';

const loadPreflight = () => import('./production-preflight.mjs');
const ARCHIVAL_INDEX_NAME = 'Item_tenantId_branchId_archivedAt_createdAt_idx';

function createDatabase({
  schemaRows,
  indexRows = [],
  users = [],
  tenants = [],
  branches = [],
}) {
  return {
    $queryRaw: vi.fn()
      .mockResolvedValueOnce(schemaRows)
      .mockResolvedValueOnce(indexRows),
    $transaction: vi.fn(() => {
      throw new Error('Preflight attempted to mutate data');
    }),
    user: {
      findMany: vi.fn().mockResolvedValue(users),
    },
    tenant: {
      findMany: vi.fn().mockResolvedValue(tenants),
    },
    branch: {
      findMany: vi.fn().mockResolvedValue(branches),
    },
  };
}

function completeSchemaRows(requiredTables) {
  return [
    ...requiredTables.map((tableName) => ({ tableName, columnName: 'id' })),
    { tableName: 'Item', columnName: 'archivedAt' },
  ];
}

function completeIndexRows() {
  return [{ tableName: 'Item', indexName: ARCHIVAL_INDEX_NAME }];
}

describe('production preflight', () => {
  it('checks the required schema and plans access assignments without writing', async () => {
    const {
      REQUIRED_TABLES,
      runProductionPreflight,
    } = await loadPreflight();
    const database = createDatabase({
      schemaRows: completeSchemaRows(REQUIRED_TABLES),
      indexRows: completeIndexRows(),
      users: [{
        id: 'user-1',
        username: 'cashier@example.com',
        role: 'kasir',
        memberships: [],
        branchAccesses: [],
      }],
      tenants: [{ id: 'tenant-1', status: 'active' }],
      branches: [{ id: 'branch-1', tenantId: 'tenant-1', status: 'active' }],
    });

    await expect(runProductionPreflight({ database })).resolves.toEqual({
      ok: true,
      schema: {
        inspectionOk: true,
        requiredTables: REQUIRED_TABLES,
        requiredColumns: ['Item.archivedAt'],
        missing: [],
      },
      access: {
        assignmentCount: 1,
        unresolved: [],
      },
    });

    expect(database.$queryRaw).toHaveBeenCalledTimes(2);
    expect(database.$transaction).not.toHaveBeenCalled();
  });

  it('blocks when the 0007 archival index is missing', async () => {
    const {
      REQUIRED_TABLES,
      runProductionPreflight,
    } = await loadPreflight();
    const database = createDatabase({
      schemaRows: completeSchemaRows(REQUIRED_TABLES),
    });

    const result = await runProductionPreflight({ database });

    expect(result.ok).toBe(false);
    expect(result.schema.missing).toEqual([
      `index:${ARCHIVAL_INDEX_NAME}`,
    ]);
    expect(database.$transaction).not.toHaveBeenCalled();
  });

  it('reports missing schema and unresolved access as blockers', async () => {
    const {
      REQUIRED_TABLES,
      runProductionPreflight,
    } = await loadPreflight();
    const database = createDatabase({
      schemaRows: completeSchemaRows(REQUIRED_TABLES)
        .filter(({ tableName, columnName }) => (
          tableName !== 'AuditLog' && columnName !== 'archivedAt'
        )),
      indexRows: completeIndexRows(),
      users: [{
        id: 'user-2',
        username: 'inactive@example.com',
        role: 'kasir',
        memberships: [{
          id: 'membership-1',
          tenantId: 'tenant-1',
          role: 'kasir',
          status: 'inactive',
        }],
        branchAccesses: [],
      }],
      tenants: [{ id: 'tenant-1', status: 'active' }],
      branches: [],
    });

    const result = await runProductionPreflight({ database });

    expect(result.ok).toBe(false);
    expect(result.schema.missing).toEqual([
      'table:AuditLog',
      'column:Item.archivedAt',
    ]);
    expect(result.access).toEqual({
      assignmentCount: 0,
      unresolved: [{
        userId: 'user-2',
        tenantId: 'tenant-1',
        reason: 'inactive-membership',
      }],
    });
    expect(database.$transaction).not.toHaveBeenCalled();
  });

  it('writes one JSON result and returns a nonzero exit code for blockers', async () => {
    const {
      REQUIRED_TABLES,
      runProductionPreflightCli,
    } = await loadPreflight();
    const database = createDatabase({
      schemaRows: completeSchemaRows(REQUIRED_TABLES)
        .filter(({ columnName }) => columnName !== 'archivedAt'),
      indexRows: completeIndexRows(),
    });
    const writeLine = vi.fn();

    const exitCode = await runProductionPreflightCli({ database, writeLine });

    expect(exitCode).toBe(1);
    expect(writeLine).toHaveBeenCalledTimes(1);
    expect(JSON.parse(writeLine.mock.calls[0][0])).toMatchObject({
      ok: false,
      schema: { inspectionOk: true, missing: ['column:Item.archivedAt'] },
      access: { assignmentCount: 0, unresolved: [] },
    });
  });

  it('marks schema inspection errors as an explicit migration blocker', async () => {
    const {
      runProductionPreflightCli,
      schemaReadyForMigrationResolution,
    } = await loadPreflight();
    const database = createDatabase({ schemaRows: [] });
    database.$queryRaw = vi.fn().mockRejectedValue(new Error('permission denied'));
    const writeLine = vi.fn();

    const exitCode = await runProductionPreflightCli({ database, writeLine });
    const result = JSON.parse(writeLine.mock.calls[0][0]);

    expect(exitCode).toBe(1);
    expect(result.schema).toMatchObject({
      inspectionOk: false,
      missing: null,
      error: 'permission denied',
    });
    expect(schemaReadyForMigrationResolution(result)).toBe(false);
  });

  it('allows migration resolution only after a successful complete schema inspection', async () => {
    const { schemaReadyForMigrationResolution } = await loadPreflight();

    expect(schemaReadyForMigrationResolution({
      schema: { inspectionOk: true, missing: [] },
    })).toBe(true);
    expect(schemaReadyForMigrationResolution({
      schema: { inspectionOk: true, missing: ['column:Item.archivedAt'] },
    })).toBe(false);
    expect(schemaReadyForMigrationResolution({
      schema: { inspectionOk: false, missing: [] },
    })).toBe(false);
  });
});
