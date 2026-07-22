import { pathToFileURL } from 'node:url';
import { executeAccessBackfill } from '../src/data/accessBackfill.js';
import { getEnv } from '../src/config/env.js';
import { prisma } from '../src/data/prisma.js';

export const REQUIRED_TABLES = [
  'Category',
  'Tenant',
  'Plan',
  'PlanFeature',
  'TenantSubscription',
  'TenantUsageSnapshot',
  'Branch',
  'TenantSettings',
  'BranchSettings',
  'UserMembership',
  'UserBranchAccess',
  'Item',
  'Rental',
  'RentalItem',
  'ReturnRecord',
  'User',
  'Customer',
  'AuditLog',
];

const REQUIRED_COLUMNS = [{ tableName: 'Item', columnName: 'archivedAt' }];
const REQUIRED_INDEXES = [{
  tableName: 'Item',
  indexName: 'Item_tenantId_branchId_archivedAt_createdAt_idx',
}];

export async function inspectProductionSchema(database) {
  const [rows, indexRows] = await Promise.all([
    database.$queryRaw`
      SELECT
        tables.table_name AS "tableName",
        columns.column_name AS "columnName"
      FROM information_schema.tables AS tables
      LEFT JOIN information_schema.columns AS columns
        ON columns.table_schema = tables.table_schema
        AND columns.table_name = tables.table_name
      WHERE tables.table_schema = current_schema()
        AND tables.table_type = 'BASE TABLE'
    `,
    database.$queryRaw`
      SELECT
        tablename AS "tableName",
        indexname AS "indexName"
      FROM pg_indexes
      WHERE schemaname = current_schema()
    `,
  ]);
  const tableNames = new Set(rows.map((row) => row.tableName));
  const columnNames = new Set(
    rows.map((row) => `${row.tableName}.${row.columnName}`),
  );
  const indexNames = new Set(
    indexRows.map((row) => `${row.tableName}.${row.indexName}`),
  );
  const missing = REQUIRED_TABLES
    .filter((tableName) => !tableNames.has(tableName))
    .map((tableName) => `table:${tableName}`);

  for (const { tableName, columnName } of REQUIRED_COLUMNS) {
    const qualifiedName = `${tableName}.${columnName}`;
    if (!columnNames.has(qualifiedName)) {
      missing.push(`column:${qualifiedName}`);
    }
  }

  for (const { tableName, indexName } of REQUIRED_INDEXES) {
    if (!indexNames.has(`${tableName}.${indexName}`)) {
      missing.push(`index:${indexName}`);
    }
  }

  return {
    requiredTables: REQUIRED_TABLES,
    requiredColumns: REQUIRED_COLUMNS.map(
      ({ tableName, columnName }) => `${tableName}.${columnName}`,
    ),
    missing,
  };
}

export async function runProductionPreflight({
  database,
  platformAdminUsername = '',
} = {}) {
  if (!database) {
    throw new Error('Database client is required');
  }

  const schema = await inspectProductionSchema(database);
  const accessPlan = await executeAccessBackfill({
    database,
    apply: false,
    platformAdminUsername,
  });
  const access = {
    assignmentCount: accessPlan.assignments.length,
    unresolved: accessPlan.unresolved,
  };

  return {
    ok: schema.missing.length === 0 && access.unresolved.length === 0,
    schema,
    access,
  };
}

export async function runProductionPreflightCli({
  database = prisma,
  platformAdminUsername = getEnv().adminUsername,
  writeLine = console.log,
} = {}) {
  let result;

  try {
    result = await runProductionPreflight({ database, platformAdminUsername });
  } catch (error) {
    result = {
      ok: false,
      schema: {
        requiredTables: REQUIRED_TABLES,
        requiredColumns: REQUIRED_COLUMNS.map(
          ({ tableName, columnName }) => `${tableName}.${columnName}`,
        ),
        missing: [],
        error: error instanceof Error ? error.message : String(error),
      },
      access: {
        assignmentCount: 0,
        unresolved: [],
        error: 'not-run',
      },
    };
  }

  writeLine(JSON.stringify(result));
  return result.ok ? 0 : 1;
}

const isDirectExecution = process.argv[1]
  && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectExecution) {
  process.exitCode = await runProductionPreflightCli();
  await prisma.$disconnect();
}
