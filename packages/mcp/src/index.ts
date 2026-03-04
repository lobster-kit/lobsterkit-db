import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { getClient } from './state.js';

const server = new McpServer(
  { name: 'lobsterdb', version: '0.1.0' },
  {
    capabilities: { tools: {} },
    instructions: `LobsterDB — managed PostgreSQL for agents.

## Typical workflow
1. create_database — provision a new Postgres database (only needed once)
2. introspect_schema — always check current schema before writing queries or migrations
3. migrate — apply schema changes (CREATE TABLE, ADD COLUMN, etc.) — tracked and idempotent
4. query — read and write data with parameterized SQL

## Schema changes
Use migrate (not query) for all DDL. Migrations are tracked in _lobsterdb_migrations so they're idempotent — safe to call multiple times with the same name.
- Additive changes (ADD COLUMN, CREATE TABLE, CREATE INDEX): apply directly.
- Destructive changes (DROP, RENAME, ALTER COLUMN type): confirm with the user first.

## Finding existing databases
Use list_databases to find databases the user has already created, then get_database for full details including the connection string.

All query results are sanitized for safe LLM context inclusion.`,
  },
);

// ── create_database ───────────────────────────────────────────────────────────

server.registerTool(
  'create_database',
  {
    title: 'Create Database',
    description:
      'Provision a new PostgreSQL database. Returns a connection string ready to use immediately.',
    inputSchema: {
      name: z.string().describe('A short, descriptive name for the database (e.g. "pokemon-tracker", "my-agent-db")'),
    },
  },
  async ({ name }) => {
    const db = await getClient();
    const database = await db.create(name);

    const lines = [
      `✅ Database created: ${database.name}`,
      `ID: ${database.id}`,
      `Status: ${database.status}`,
      `Connection string: ${database.connectionString}`,
      `Schema: ${database.pgSchema}`,
      `Tier: ${database.tier} (${['Free', 'Builder', 'Pro', 'Scale'][database.tier] ?? database.tier})`,
      `Storage limit: ${database.limits.maxStorageGb}GB`,
      `Max connections: ${database.limits.maxConnections}`,
    ];

    if (database.hint) {
      lines.push(`\nHint: ${database.hint}`);
    }

    return { content: [{ type: 'text' as const, text: lines.join('\n') }] };
  },
);

// ── list_databases ────────────────────────────────────────────────────────────

server.registerTool(
  'list_databases',
  {
    title: 'List Databases',
    description: 'List all databases on your account.',
    inputSchema: {},
  },
  async () => {
    const db = await getClient();
    const databases = await db.list();

    if (databases.length === 0) {
      return { content: [{ type: 'text' as const, text: 'No databases found. Use create_database to provision one.' }] };
    }

    const rows = databases.map((d) =>
      `- ${d.name} (${d.id})\n  Status: ${d.status} | Storage: ${d.storageMb}MB | Tier: ${d.tier} | Created: ${d.createdAt}`,
    );

    return {
      content: [
        {
          type: 'text' as const,
          text: `${databases.length} database(s):\n\n${rows.join('\n\n')}`,
        },
      ],
    };
  },
);

// ── get_database ──────────────────────────────────────────────────────────────

server.registerTool(
  'get_database',
  {
    title: 'Get Database',
    description: 'Get details for a specific database including its connection string.',
    inputSchema: {
      databaseId: z.string().describe('The database ID (e.g. db_...)'),
    },
  },
  async ({ databaseId }) => {
    const db = await getClient();
    const database = await db.get(databaseId);

    const lines = [
      `Database: ${database.name} (${database.id})`,
      `Status: ${database.status}`,
      `Connection string: ${database.connectionString}`,
      `Schema: ${database.pgSchema}`,
      `Tier: ${database.tier}`,
      `Encryption: ${database.encryptionEnabled ? 'enabled' : 'disabled'}`,
      `Storage limit: ${database.limits.maxStorageGb}GB`,
      `Max connections: ${database.limits.maxConnections}`,
      `Backup retention: ${database.limits.backupRetentionDays} days`,
      `PITR: ${database.limits.pitrDays} days`,
      `Created: ${database.createdAt}`,
    ];

    return { content: [{ type: 'text' as const, text: lines.join('\n') }] };
  },
);

// ── delete_database ───────────────────────────────────────────────────────────

server.registerTool(
  'delete_database',
  {
    title: 'Delete Database',
    description: 'Permanently delete a database and all its data.',
    inputSchema: {
      databaseId: z.string().describe('The database ID to delete'),
    },
  },
  async ({ databaseId }) => {
    const db = await getClient();
    const result = await db.delete(databaseId);

    return {
      content: [
        {
          type: 'text' as const,
          text: result.deleted
            ? `✅ Database ${result.id} deleted successfully.`
            : `⚠️ Delete request received for ${result.id} but deletion may still be in progress.`,
        },
      ],
    };
  },
);

// ── query ─────────────────────────────────────────────────────────────────────

server.registerTool(
  'query',
  {
    title: 'Query Database',
    description:
      'Execute a SQL query against a database. Use $1, $2, ... for parameters. Results are sanitized for safe LLM context.',
    inputSchema: {
      databaseId: z.string().describe('The database ID to query'),
      sql: z.string().describe('SQL statement to execute. Use $1, $2, ... for parameters.'),
      params: z
        .array(z.union([z.string(), z.number(), z.boolean(), z.null()]))
        .optional()
        .describe('Query parameters corresponding to $1, $2, ... placeholders'),
    },
  },
  async ({ databaseId, sql, params }) => {
    const db = await getClient();
    const result = await db.query(databaseId, sql, params ?? []);

    const lines: string[] = [];

    if (result.truncated) {
      lines.push('⚠️ Results truncated to 1000 rows.\n');
    }

    lines.push(`Rows returned: ${result.rowCount ?? result.rows.length}`);

    if (result.rows.length > 0) {
      const headers = result.fields.map((f) => f.name);
      lines.push('');
      lines.push(headers.join('\t'));
      lines.push(headers.map(() => '---').join('\t'));
      for (const row of result.rows) {
        lines.push(headers.map((h) => String(row[h] ?? '')).join('\t'));
      }
    }

    return { content: [{ type: 'text' as const, text: lines.join('\n') }] };
  },
);

// ── introspect_schema ─────────────────────────────────────────────────────────

server.registerTool(
  'introspect_schema',
  {
    title: 'Introspect Schema',
    description:
      'Get the database schema — tables and columns — in a format optimized for LLM context. Use this before writing queries against an existing database.',
    inputSchema: {
      databaseId: z.string().describe('The database ID to introspect'),
    },
  },
  async ({ databaseId }) => {
    const db = await getClient();
    const schema = await db.introspect(databaseId);

    const lines = [
      `Database schema (${schema.tableCount} table${schema.tableCount !== 1 ? 's' : ''}):`,
      '',
      schema.schemaText || '(no tables yet)',
    ];

    return { content: [{ type: 'text' as const, text: lines.join('\n') }] };
  },
);

// ── snapshot ──────────────────────────────────────────────────────────────────

server.registerTool(
  'snapshot',
  {
    title: 'Create Snapshot',
    description: 'Create a point-in-time snapshot of a database. Requires Builder tier or higher.',
    inputSchema: {
      databaseId: z.string().describe('The database ID to snapshot'),
    },
  },
  async ({ databaseId }) => {
    const db = await getClient();
    const snap = await db.snapshot(databaseId);

    const lines = [
      `Snapshot created: ${snap.id}`,
      `Status: ${snap.status}`,
      `Database: ${snap.databaseId}`,
      `Size: ${snap.sizeBytes !== null ? `${Math.round(snap.sizeBytes / 1024)}KB` : 'calculating...'}`,
      `Created: ${snap.createdAt}`,
      '',
      snap.status === 'creating'
        ? 'The snapshot is still being created. It will be available for restore once status=ready.'
        : '',
    ];

    return { content: [{ type: 'text' as const, text: lines.filter(Boolean).join('\n') }] };
  },
);

// ── get_account ───────────────────────────────────────────────────────────────

server.registerTool(
  'get_account',
  {
    title: 'Get Account',
    description: 'Get your account tier, usage, and limits.',
    inputSchema: {},
  },
  async () => {
    const db = await getClient();
    const account = await db.account();

    const lines = [
      `Account: ${account.id}`,
      `Tier: ${account.tier} — ${account.tierName}`,
      '',
      'Limits:',
      `  Max databases: ${account.limits.maxDatabases ?? 'unlimited'}`,
      `  Max storage: ${account.limits.maxStorageGb}GB`,
      `  Max connections: ${account.limits.maxConnections}`,
      `  Backup retention: ${account.limits.backupRetentionDays} days`,
      `  PITR: ${account.limits.pitrDays} days`,
      `  Encryption: ${account.limits.encryption ? 'available' : 'not available'}`,
      '',
      'Usage:',
      `  Databases: ${account.usage.dbCount}`,
      '',
      `Member since: ${account.createdAt}`,
    ];

    return { content: [{ type: 'text' as const, text: lines.join('\n') }] };
  },
);

// ── migrate ───────────────────────────────────────────────────────────────────

const ENSURE_MIGRATIONS_TABLE = `
  CREATE TABLE IF NOT EXISTS _lobsterdb_migrations (
    id        SERIAL PRIMARY KEY,
    name      TEXT UNIQUE NOT NULL,
    sql       TEXT NOT NULL,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )
`.trim();

server.registerTool(
  'migrate',
  {
    title: 'Run Schema Migration',
    description: `Apply a schema change (DDL) to a database. Migrations are tracked in _lobsterdb_migrations and are idempotent — safe to call multiple times with the same name.

Guidelines:
- Use for all DDL: CREATE TABLE, ALTER TABLE ADD COLUMN, CREATE INDEX, etc.
- Name migrations descriptively: "create_cards_table", "add_favorite_to_cards", "add_price_index"
- ADDITIVE changes (add columns, create tables): apply without asking the user.
- DESTRUCTIVE changes (DROP TABLE, DROP COLUMN, RENAME, changing column types): always confirm with the user before running.
- Never use query for DDL — always use migrate so changes are tracked.`,
    inputSchema: {
      databaseId: z.string().describe('The database ID to migrate'),
      name: z.string().describe('Short snake_case migration name, e.g. "create_cards_table" or "add_favorite_column"'),
      sql: z.string().describe('DDL SQL to apply. Can include multiple statements separated by semicolons.'),
    },
  },
  async ({ databaseId, name, sql }) => {
    const db = await getClient();

    // Ensure migrations table exists
    await db.query(databaseId, ENSURE_MIGRATIONS_TABLE);

    // Check if already applied
    const existing = await db.query(
      databaseId,
      'SELECT name, applied_at FROM _lobsterdb_migrations WHERE name = $1',
      [name],
    );

    if (existing.rows.length > 0) {
      const row = existing.rows[0];
      return {
        content: [
          {
            type: 'text' as const,
            text: `Migration "${name}" was already applied at ${row.applied_at}. Skipped — no changes made.`,
          },
        ],
      };
    }

    // Apply the migration
    await db.query(databaseId, sql);

    // Record it
    await db.query(
      databaseId,
      'INSERT INTO _lobsterdb_migrations (name, sql) VALUES ($1, $2)',
      [name, sql],
    );

    return {
      content: [
        {
          type: 'text' as const,
          text: `✅ Migration "${name}" applied successfully.`,
        },
      ],
    };
  },
);

// ── list_migrations ───────────────────────────────────────────────────────────

server.registerTool(
  'list_migrations',
  {
    title: 'List Migrations',
    description: 'List all schema migrations that have been applied to a database, in order.',
    inputSchema: {
      databaseId: z.string().describe('The database ID'),
    },
  },
  async ({ databaseId }) => {
    const db = await getClient();

    // Ensure migrations table exists first
    await db.query(databaseId, ENSURE_MIGRATIONS_TABLE);

    const result = await db.query(
      databaseId,
      'SELECT name, applied_at FROM _lobsterdb_migrations ORDER BY id ASC',
    );

    if (result.rows.length === 0) {
      return {
        content: [{ type: 'text' as const, text: 'No migrations applied yet.' }],
      };
    }

    const rows = result.rows.map(
      (r) => `- ${r.name}  (applied ${r.applied_at})`,
    );

    return {
      content: [
        {
          type: 'text' as const,
          text: `${result.rows.length} migration(s) applied:\n\n${rows.join('\n')}`,
        },
      ],
    };
  },
);

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
