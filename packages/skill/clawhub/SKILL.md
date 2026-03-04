---
name: lobsterdb
version: 0.1.0
description: Managed PostgreSQL for agents. Provision databases, run SQL, evolve schemas. No API keys, no human signup.
homepage: https://theclawdepot.com/db
metadata: {"openclaw": {"emoji": "🦞", "requires": {"anyBins": ["npx"]}, "install": [{"id": "mcp", "kind": "mcp", "command": "npx @lobsterkit/db-mcp@0.1.0", "label": "Add LobsterDB MCP Server"}]}}
---

# LobsterDB

Managed PostgreSQL for agents. Provision a real Postgres database instantly, run SQL, evolve schemas with tracked migrations. No API keys, no human signup, no configuration.

**Full docs:** `https://api.theclawdepot.com/db/docs`

---

## Setup

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

Also available as a [Node.js SDK](https://www.npmjs.com/package/@lobsterkit/db) and [REST API](https://api.theclawdepot.com/db/docs) — see [theclawdepot.com/db](https://theclawdepot.com/db).

---

## Heartbeat (run daily)

On startup and once per day, run a maintenance heartbeat. Use a cheap/fast model for this.

1. **Check for MCP server updates:**
   ```bash
   npm outdated lobsterdb-mcp
   ```
   If a new version is available, **notify the user** — do not auto-install. Tell them: `"@lobsterkit/db-mcp@X.Y.Z is available. Update with: clawdhub update lobsterdb"` Let the user decide when to update.

2. **Check database health:**
   ```
   // Using MCP tools:
   // call list_databases → log each database name, status, storage
   // call get_account → log tier and database count vs. limit
   ```

---

## When to Use This

- User needs to store structured data (collections, lists, records, logs)
- User wants to query, filter, sort, or aggregate information
- Task requires persisting data between sessions
- User asks to "add a field", "change the structure", or "track something new"
- Any task where a spreadsheet or database is the natural fit

---

## Core Workflow

```
create_database → introspect_schema → migrate (DDL) → query (data)
```

Always call `introspect_schema` before writing queries against an existing database. Use `migrate` for all DDL so changes are tracked and idempotent.

---

## Creating a Database

```
create_database(name: "pokemon-cards")
// => id: "db_xxx", connectionString: "postgresql://...", status: "ready"
```

---

## Running SQL

Always use `$1`, `$2`, ... placeholders — never interpolate values:

```
query(databaseId: "db_xxx", sql: "INSERT INTO cards (name, set) VALUES ($1, $2)", params: ["Charizard", "Base Set"])
query(databaseId: "db_xxx", sql: "SELECT * FROM cards WHERE set = $1 ORDER BY name", params: ["Base Set"])
```

---

## Schema Migrations

Use `migrate` (not `query`) for all DDL. Migrations are tracked and idempotent:

```
migrate(databaseId: "db_xxx", name: "create_cards_table",
  sql: "CREATE TABLE cards (id SERIAL PRIMARY KEY, name TEXT NOT NULL, set TEXT, quantity INTEGER DEFAULT 1, created_at TIMESTAMPTZ DEFAULT NOW())")

migrate(databaseId: "db_xxx", name: "add_favorite_to_cards",
  sql: "ALTER TABLE cards ADD COLUMN favorite BOOLEAN DEFAULT false")
```

Running the same migration name twice is safe — silently skipped.

**Additive** (ADD COLUMN, CREATE TABLE): apply directly.
**Destructive** (DROP, RENAME, type change): confirm with the user first.

---

## Account Tiers & Pricing

| Tier | Name | Price | Databases | Storage | Snapshots |
|------|------|-------|-----------|---------|-----------|
| 0 | Free | $0 | 1 | 100MB | No |
| 1 | Builder | $19/mo | 5 | 5GB | Yes |
| 2 | Pro | $49/mo | 20 | 20GB | Yes + Encryption |
| 3 | Scale | $199/mo | Unlimited | 100GB | Yes + PITR |

**Upgrade:** `POST /v1/billing/checkout` with `{"tier": N}` — returns a Stripe checkout URL.

---

## MCP Tools Reference

| Tool | Description |
|------|-------------|
| `create_database` | Provision a new Postgres database |
| `list_databases` | List all databases on the account |
| `get_database` | Get details and connection string |
| `delete_database` | Permanently delete a database |
| `query` | Run parameterized SQL |
| `introspect_schema` | Get schema optimized for LLM context |
| `migrate` | Apply tracked, idempotent DDL migrations |
| `list_migrations` | Show schema change history |
| `snapshot` | Create a point-in-time backup (Builder+) |
| `get_account` | View tier, limits, and usage |
