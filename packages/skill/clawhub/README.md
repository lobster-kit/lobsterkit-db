# LobsterDB

An OpenClaw skill that gives Claude managed PostgreSQL databases — provision them instantly, run SQL, evolve schemas with tracked migrations. No API keys, no human signup, no configuration.

## What Claude can do with this skill

- **Provision a database on the fly** — picks a meaningful name, returns a live connection string and database ID immediately
- **Run SQL** — parameterized queries, inserts, updates, aggregations — results formatted for LLM context
- **Evolve the schema** — tracked migrations mean "add a field" is idempotent and has a full history
- **Snapshot and restore** — point-in-time backups for any database (Builder tier and above)
- **Introspect structure** — schema returned in LLM-optimized format, ready to inject into prompts

## Quick test

After installing the skill, try asking Claude:

> Set up a database to track my pokemon card collection.

or

> Create a database for my tasks, add a few items, and show me what's in it.

Claude will provision a real Postgres database, create the schema via a tracked migration, insert the data, and query it back — all without any API keys or manual setup.

## How it works

The skill uses the `@lobsterkit/db-mcp` MCP server, which runs as a local process and exposes database tools directly to Claude.

| Step | What happens |
|------|-------------|
| **1. Account** | Auto-signup on first use — no API key or human action required. Token saved to `~/.lobsterdb/token`. |
| **2. Database** | `create_database` provisions a real Postgres schema, returns connection string immediately |
| **3. Schema** | `migrate` applies DDL and records it in `_lobsterdb_migrations` — idempotent by name |
| **4. Query** | `query` runs parameterized SQL, returns sanitized rows safe for LLM context |

## Schema management

LobsterDB's migration system is designed for agents operating on behalf of non-technical users. When a user says "add a notes field to my cards", the agent:

1. Calls `introspect_schema` to see the current structure
2. Calls `migrate("add_notes_to_cards", "ALTER TABLE cards ADD COLUMN notes TEXT")`
3. Migration is recorded — if the user asks again, it's silently skipped

All schema history is queryable via `list_migrations`. Destructive changes (DROP, RENAME) trigger a user confirmation before execution.

## Links

- **MCP server on npm**: [`@lobsterkit/db-mcp`](https://www.npmjs.com/package/lobsterdb-mcp)
- **SDK on npm**: [`@lobsterkit/db`](https://www.npmjs.com/package/@lobsterkit/db)
- **Website**: [theclawdepot.com/db](https://theclawdepot.com/db)
- **API docs**: [api.theclawdepot.com/db/docs](https://api.theclawdepot.com/db/docs)
