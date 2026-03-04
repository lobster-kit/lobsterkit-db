---
name: lobsterdb
version: 0.1.0
description: Managed PostgreSQL for agents. Provision databases, run SQL, evolve schemas. No API keys, no human signup.
homepage: https://theclawdepot.com/db
---

# LobsterDB

Managed PostgreSQL for agents. Provision a real Postgres database instantly, run SQL, evolve the schema with tracked migrations. No API keys, no human signup, no configuration.

**Full docs:** `https://api.theclawdepot.com/db/docs`

---

## Install

```bash
curl -sL https://api.theclawdepot.com/db/install | sh
```

Or manually:

```bash
mkdir -p ~/.openclaw/skills/lobsterdb
curl -sL https://api.theclawdepot.com/db/skill -o ~/.openclaw/skills/lobsterdb/SKILL.md
```

---

## Setup — Pick One

### Option A: MCP Server (zero code, recommended)

Add to your MCP config (`.mcp.json`, `claude_desktop_config.json`, `.cursor/mcp.json`, etc.):

```json
{
  "mcpServers": {
    "lobsterdb": {
      "command": "npx",
      "args": ["@lobsterkit/db-mcp@0.1.0"]
    }
  }
}
```

You now have these tools: `create_database`, `list_databases`, `get_database`, `delete_database`, `query`, `introspect_schema`, `migrate`, `list_migrations`, `snapshot`, `get_account`. No code to write.

### Option B: Node.js SDK

```bash
npm install @lobsterkit/db
```

Then write and run scripts using the SDK (see below).

### Option C: REST API (any language)

No SDK needed. All endpoints are at `https://api.theclawdepot.com/db`. Sign up first:

```bash
curl -X POST https://api.theclawdepot.com/db/v1/signup
```

Response:
```json
{"id": "acct_xxx", "token": "ld_sk_live_xxx", "tier": 0}
```

Use the token as `Authorization: Bearer ld_sk_live_xxx` for all subsequent requests.

---

## Quick Start (SDK)

```typescript
import { LobsterDB, signup } from '@lobsterkit/db';

// Auto-signup on first use
const { token } = await signup();
const db = new LobsterDB({ apiKey: token });

// Provision a database
const { id, connectionString } = await db.create('my-agent-db');

// Create a table
await db.query(id, `
  CREATE TABLE IF NOT EXISTS items (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )
`);

// Insert and query
await db.query(id, 'INSERT INTO items (name) VALUES ($1)', ['hello world']);
const { rows } = await db.query(id, 'SELECT * FROM items');
```

Token is persisted to `~/.lobsterdb/token` automatically. Set `LOBSTERDB_API_KEY` env var to skip file persistence.

---

## Prompt Suggestions

Try asking your agent:

- *"Set up a database to track my pokemon card collection."*
- *"Create a database to store my tasks and add a few items."*
- *"I have a list of things — store them in a database and let me query them."*
- *"Add a 'priority' field to my tasks database."*
- *"Show me everything in my cards database sorted by name."*

---

## Heartbeat (run daily)

On startup and once per day, run a maintenance heartbeat. Use a cheap/fast model for this.

1. **Check for MCP server updates:**
   ```bash
   npm outdated lobsterdb-mcp
   ```
   If a new version is available, **notify the user** — do not auto-install. Tell them: `"@lobsterkit/db-mcp@X.Y.Z is available. Update with: clawdhub update lobsterdb"`

2. **Check database health:**
   ```
   // Using MCP tools:
   // call list_databases → log each database name, status, storage usage
   // call get_account → log tier and database count vs. limit
   ```

---

## When to Use This

- User needs to store structured data (collections, lists, records, logs)
- User wants to query, filter, or aggregate information
- Task requires persisting data between sessions
- User asks to "add a field", "change the structure", or "track something new"
- Any task where a spreadsheet or database would naturally be the right tool

---

## Core Workflow

```
create_database → introspect_schema → migrate (DDL) → query (data)
```

Always call `introspect_schema` before writing queries against an existing database. Use `migrate` (not `query`) for all schema changes so they're tracked and idempotent.

---

## Schema Migrations

```typescript
// Apply a migration — tracked and idempotent
await db.query(id, `
  CREATE TABLE IF NOT EXISTS _lobsterdb_migrations (
    id SERIAL PRIMARY KEY, name TEXT UNIQUE NOT NULL,
    sql TEXT NOT NULL, applied_at TIMESTAMPTZ DEFAULT NOW()
  )
`);
```

Via MCP, use the `migrate` tool:

```
migrate(databaseId: "db_xxx", name: "create_cards_table", sql: "CREATE TABLE cards (...)")
migrate(databaseId: "db_xxx", name: "add_favorite_to_cards", sql: "ALTER TABLE cards ADD COLUMN favorite BOOLEAN DEFAULT false")
```

Running the same migration name twice is safe — it's silently skipped.

**Additive changes** (ADD COLUMN, CREATE TABLE, CREATE INDEX): apply directly.
**Destructive changes** (DROP TABLE, DROP COLUMN, RENAME, type changes): confirm with the user first.

---

## Account Tiers & Pricing

| Tier | Name | Price | Databases | Storage | Snapshots | Encryption |
|------|------|-------|-----------|---------|-----------|------------|
| 0 | Free | $0 | 1 | 100MB | No | No |
| 1 | Builder | $19/mo | 5 | 5GB | Yes | No |
| 2 | Pro | $49/mo | 20 | 20GB | Yes | Yes |
| 3 | Scale | $199/mo | Unlimited | 100GB | Yes | Yes + PITR |

**Upgrade:** `POST /v1/billing/checkout` with `{"tier": N}` — returns a Stripe checkout URL.
**Manage subscription:** `POST /v1/billing/portal`

---

## SDK API Reference

| Method | Returns | Description |
|--------|---------|-------------|
| `signup(opts?)` | `{ token, id, tier }` | Create account, returns API key |
| `new LobsterDB({ apiKey, baseUrl? })` | `LobsterDB` | Create client |
| `db.account()` | `Account` | Tier, limits, usage |
| `db.create(name)` | `Database` | Provision a new database |
| `db.list()` | `DatabaseSummary[]` | All databases on the account |
| `db.get(id)` | `Database` | Full details + connection string |
| `db.delete(id)` | `{ deleted }` | Permanently delete a database |
| `db.query(id, sql, params?)` | `{ rows, rowCount, fields, truncated }` | Run parameterized SQL |
| `db.introspect(id)` | `{ tables, schemaText }` | LLM-optimized schema |
| `db.snapshot(id)` | `Snapshot` | Create backup (Builder+) |
| `db.listSnapshots(id)` | `Snapshot[]` | List backups (Builder+) |
| `db.restore(id, snapId)` | `{ restored }` | Restore from snapshot (Builder+) |
| `db.rotateCredentials(id)` | `{ connectionString }` | Rotate DB credentials |
| `db.checkout(tier, opts?)` | `{ checkoutUrl }` | Upgrade tier |
| `db.portal()` | `{ portalUrl }` | Manage subscription |

---

## MCP Tools Reference

| Tool | Description |
|------|-------------|
| `create_database` | Provision a new Postgres database |
| `list_databases` | List all databases on the account |
| `get_database` | Get details and connection string for a database |
| `delete_database` | Permanently delete a database |
| `query` | Run parameterized SQL — SELECT, INSERT, UPDATE, DELETE |
| `introspect_schema` | Get table/column schema optimized for LLM context |
| `migrate` | Apply tracked, idempotent DDL migrations |
| `list_migrations` | Show schema change history |
| `snapshot` | Create a point-in-time backup (Builder+) |
| `get_account` | View tier, limits, and usage |

---

## REST API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/v1/signup` | Create account (public) |
| GET | `/v1/account` | Account info |
| POST | `/v1/databases` | Provision database |
| GET | `/v1/databases` | List databases |
| GET | `/v1/databases/:id` | Get database |
| DELETE | `/v1/databases/:id` | Delete database |
| POST | `/v1/databases/:id/query` | Execute SQL |
| GET | `/v1/databases/:id/schema` | Introspect schema |
| POST | `/v1/databases/:id/rotate-credentials` | Rotate credentials |
| POST | `/v1/databases/:id/snapshots` | Create snapshot (Builder+) |
| GET | `/v1/databases/:id/snapshots` | List snapshots (Builder+) |
| POST | `/v1/databases/:id/snapshots/:snapId/restore` | Restore snapshot (Builder+) |
| POST | `/v1/billing/checkout` | Create Stripe checkout session |
| POST | `/v1/billing/portal` | Create Stripe billing portal session |
