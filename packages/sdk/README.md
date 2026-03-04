# @lobsterkit/db

Managed PostgreSQL for agents. Provision a database in one line. Get a connection string back. Query it immediately.

## Install

```bash
npm install @lobsterkit/db
```

## Quick Start

```ts
import { LobsterDB, signup } from '@lobsterkit/db';

// 1. Create an account (once)
const { token } = await signup();
// Store token in LobsterVault or your env: LOBSTERDB_API_KEY=ld_sk_live_...

// 2. Initialize client
const db = new LobsterDB({ apiKey: process.env.LOBSTERDB_API_KEY });

// 3. Provision a database
const { id, connectionString } = await db.create('my-agent-db');
// connectionString: postgresql://lr_abc123:password@pgb.lobsterdb.com:5432/lobsterdb

// 4. Use the connection string with any Postgres client
import postgres from 'postgres';
const sql = postgres(connectionString);
const rows = await sql`SELECT now()`;
```

## API

### `new LobsterDB(config)`

```ts
const db = new LobsterDB({
  apiKey: 'ld_sk_live_...',
  baseUrl: 'https://api.lobsterdb.com', // optional override
});
```

### `db.create(name)` → `Database`

Provision a new PostgreSQL database. Returns immediately with a ready connection string.

```ts
const { id, connectionString, status, limits } = await db.create('my-db');
```

### `db.list()` → `DatabaseSummary[]`

List all databases on your account (no connection strings).

### `db.get(id)` → `Database`

Get a database by ID, including its connection string.

### `db.delete(id)`

Delete a database and all its data permanently.

### `db.snapshot(databaseId)` → `Snapshot` _(Builder+)_

Create a snapshot. Returns with `status: 'creating'`. Poll `listSnapshots` until `status: 'ready'`.

```ts
const snap = await db.snapshot(dbId);
// Wait for completion
let ready = snap;
while (ready.status === 'creating') {
  await new Promise(r => setTimeout(r, 2000));
  const snaps = await db.listSnapshots(dbId);
  ready = snaps.find(s => s.id === snap.id)!;
}
```

### `db.listSnapshots(databaseId)` → `Snapshot[]` _(Builder+)_

### `db.restore(databaseId, snapshotId)` _(Builder+)_

Restore from a snapshot. **Overwrites all current data.**

### `db.checkout(tier)` → `{ checkoutUrl }`

Get a Stripe Checkout URL to upgrade.

```ts
const { checkoutUrl } = await db.checkout(1); // 1=Builder, 2=Pro, 3=Scale
```

### `db.account()` → `Account`

Get account info and usage.

## Tiers

| Tier | Price | Databases | Storage | Connections | Backups |
|------|-------|-----------|---------|-------------|---------|
| Free | $0 | 1 | 500 MB | 5 | None |
| Builder | $19/mo | 3 | 5 GB | 20 | Daily (3d) |
| Pro | $49/mo | 10 | 25 GB | 100 | Daily (7d) + PITR |
| Scale | $199/mo | Unlimited | 200 GB | 500 | Continuous PITR 30d |

## LobsterVault Integration

Store your database connection string automatically:

```ts
import { LobsterDB } from '@lobsterkit/db';
import { LobsterVault } from '@lobsterkit/vault';

const db = new LobsterDB({ apiKey: process.env.LOBSTERDB_API_KEY });
const vault = new LobsterVault({ apiKey: process.env.LOBSTERVAULT_API_KEY });

const database = await db.create('my-agent-db');
// Auto-store connection string in Vault
await vault.set('DB_URL', database.connectionString);

// Later, retrieve it anywhere
const url = await vault.get('DB_URL');
```
