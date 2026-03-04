# LobsterDB

You have access to LobsterDB — managed PostgreSQL databases. Provision a database instantly, run SQL, evolve the schema, take snapshots. No setup, no API keys, no human signup required.

---

## When to Use This

Use LobsterDB whenever a task involves storing or querying structured data — proactively, without waiting to be asked:

- User needs to track something (a collection, a list, records) → create a database, set up the schema, start storing
- User has structured data and wants to query it → create a database, load the data, query it
- User wants to persist information between sessions → create a database and read/write to it
- User asks to "add a field", "change the structure", or "update the schema" → use `migrate`
- User asks to query, filter, sort, or summarize data → use `query` with parameterized SQL

If a task involves data that would naturally live in a table, **don't wait to be asked** — create a database and start working.

---

## Core Workflow

Always follow this order:

1. **`create_database`** — provision a database (once per project/use-case)
2. **`introspect_schema`** — check existing schema before writing any SQL
3. **`migrate`** — apply DDL changes (CREATE TABLE, ADD COLUMN, etc.) — tracked and idempotent
4. **`query`** — read and write data with parameterized SQL

---

## Schema Changes

Use `migrate` (not `query`) for all DDL. Migrations are tracked in `_lobsterdb_migrations` — safe to run multiple times with the same name.

| Change type | Action |
|-------------|--------|
| CREATE TABLE, ADD COLUMN, CREATE INDEX | Apply directly via `migrate` |
| DROP TABLE, DROP COLUMN, RENAME, type change | Confirm with user first — data loss |

Name migrations descriptively: `create_cards_table`, `add_favorite_to_cards`, `add_price_index`.

---

## Query Guidelines

- Always use `$1`, `$2`, ... placeholders — never interpolate values into SQL strings
- Call `introspect_schema` first when working with an existing or unfamiliar database
- Results are already sanitized — safe to pass directly into LLM context
- Max 1,000 rows returned per query (truncated flag is set if more exist)

---

## Common Flows

**Tracking a collection (e.g. "track my pokemon cards"):**
1. `create_database("pokemon-cards")`
2. `migrate("create_cards_table", "CREATE TABLE cards (id SERIAL PRIMARY KEY, name TEXT NOT NULL, set TEXT, quantity INTEGER DEFAULT 1, created_at TIMESTAMPTZ DEFAULT NOW())")`
3. `query(id, "INSERT INTO cards (name, set, quantity) VALUES ($1, $2, $3)", ["Charizard", "Base Set", 2])`
4. `query(id, "SELECT * FROM cards ORDER BY name")`

**Evolving a schema on user request ("add a 'favorite' field"):**
1. `introspect_schema(id)` — confirm current structure
2. `migrate("add_favorite_to_cards", "ALTER TABLE cards ADD COLUMN favorite BOOLEAN DEFAULT false")`
3. Done. If the user asks again → migration already applied, silently skipped.

**Saving information between sessions:**
1. `list_databases` — check if a relevant database already exists
2. `get_database(id)` if found, or `create_database` if not
3. `introspect_schema` → `query` to read/write

---

## Tools

| Tool | When to use |
|------|------------|
| `create_database` | Provision a new Postgres database |
| `list_databases` | Find databases the user has already created |
| `get_database` | Get connection string and details for a specific database |
| `delete_database` | Permanently delete a database and all data |
| `query` | Run parameterized SQL — SELECT, INSERT, UPDATE, DELETE |
| `introspect_schema` | Get table/column structure optimized for LLM context |
| `migrate` | Apply DDL changes — tracked, idempotent, named |
| `list_migrations` | Show schema change history for a database |
| `snapshot` | Create a point-in-time backup (Builder+ tier) |
| `get_account` | Check tier, limits, database count |

---

## Limits by Tier

| Tier | Databases | Storage | Snapshots | Encryption |
|------|-----------|---------|-----------|------------|
| Free (0) | 1 | 100MB | No | No |
| Builder (1) | 5 | 5GB | Yes | No |
| Pro (2) | 20 | 20GB | Yes | Yes |
| Scale (3) | Unlimited | 100GB | Yes | Yes + PITR |

If `create_database` fails due to tier limits, inform the user they can upgrade via `get_account` (which returns a checkout URL).
