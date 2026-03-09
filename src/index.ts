/**
 * @lobsterkit/db — LobsterDB SDK
 *
 * Managed PostgreSQL for agents. Provision, query, snapshot, restore.
 *
 * @example
 * ```ts
 * import { LobsterDB } from '@lobsterkit/db';
 *
 * const db = new LobsterDB({ apiKey: process.env.LOBSTERDB_API_KEY });
 *
 * // Provision a database — returns a Postgres connection string
 * const { id, connectionString } = await db.create('my-app-db');
 *
 * // Query it directly
 * const rows = await db.query(connectionString, 'SELECT * FROM users WHERE id = $1', [42]);
 *
 * // Snapshot + restore
 * const snap = await db.snapshot(id);
 * await db.restore(id, snap.id);
 * ```
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface LobsterDBConfig {
  /** Your LobsterDB API key (ld_sk_live_... or ld_sk_test_...) */
  apiKey: string;
  /** Override the API base URL (default: https://api.theclawdepot.com/db) */
  baseUrl?: string;
}

export interface Database {
  id: string;
  name: string;
  status: 'provisioning' | 'ready' | 'deleting' | 'error';
  connectionString: string;
  pgSchema: string;
  tier: number;
  encryptionEnabled: boolean;
  limits: {
    maxStorageGb: number;
    maxConnections: number;
    backupRetentionDays: number;
    pitrDays: number;
  };
  createdAt: string;
  hint?: string;
}

export interface DatabaseSummary {
  id: string;
  name: string;
  status: string;
  pgSchema: string;
  storageMb: number;
  tier: number;
  encryptionEnabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Snapshot {
  id: string;
  databaseId: string;
  status: 'creating' | 'ready' | 'failed';
  sizeBytes: number | null;
  createdAt: string;
}

export interface Account {
  id: string;
  tier: number;
  tierName: string;
  limits: {
    maxDatabases: number | null;
    maxStorageGb: number;
    maxConnections: number;
    backupRetentionDays: number;
    pitrDays: number;
    encryption: boolean;
  };
  usage: { dbCount: number };
  createdAt: string;
}

export interface CheckoutSession {
  checkoutUrl: string;
  sessionId: string;
}

// ─── Error ───────────────────────────────────────────────────────────────────

export class DBError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string,
  ) {
    super(message);
    this.name = 'DBError';
  }
}

// ─── Client ──────────────────────────────────────────────────────────────────

export class LobsterDB {
  private readonly baseUrl: string;
  private readonly apiKey: string;

  constructor(config: LobsterDBConfig) {
    this.apiKey = config.apiKey;
    this.baseUrl = (config.baseUrl ?? 'https://api.theclawdepot.com/db').replace(/\/$/, '');
  }

  // ── Internal fetch helper ─────────────────────────────────────────────────

  private async fetch<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    const res = await globalThis.fetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      const msg = (data as any).error ?? (data as any).message ?? `HTTP ${res.status}`;
      throw new DBError(msg, res.status, (data as any).code);
    }

    return data as T;
  }

  // ── Account ───────────────────────────────────────────────────────────────

  /** Get account information and usage. */
  async account(): Promise<Account> {
    return this.fetch<Account>('GET', '/v1/account');
  }

  // ── Databases ─────────────────────────────────────────────────────────────

  /**
   * Provision a new PostgreSQL database.
   * Returns a connection string ready to use immediately.
   *
   * @example
   * const { connectionString } = await db.create('my-agent-db');
   * // postgresql://lr_abc123@pgb.lobsterdb.com:5432/lobsterdb
   */
  async create(name: string): Promise<Database> {
    return this.fetch<Database>('POST', '/v1/databases', { name });
  }

  /**
   * List all databases on your account.
   * Connection strings are not included in list results — call `get(id)` for those.
   */
  async list(): Promise<DatabaseSummary[]> {
    const res = await this.fetch<{ databases: DatabaseSummary[] }>('GET', '/v1/databases');
    return res.databases;
  }

  /**
   * Get a database by ID, including its connection string.
   */
  async get(id: string): Promise<Database> {
    return this.fetch<Database>('GET', `/v1/databases/${id}`);
  }

  /**
   * Delete a database. All data is permanently destroyed.
   */
  async delete(id: string): Promise<{ id: string; deleted: boolean }> {
    return this.fetch<{ id: string; deleted: boolean }>('DELETE', `/v1/databases/${id}`);
  }

  // ── Snapshots ─────────────────────────────────────────────────────────────

  /**
   * Create a snapshot of a database. Returns immediately with status=creating.
   * Poll `listSnapshots(dbId)` until status=ready.
   * Requires Builder tier or higher.
   */
  async snapshot(databaseId: string): Promise<Snapshot> {
    return this.fetch<Snapshot>('POST', `/v1/databases/${databaseId}/snapshots`);
  }

  /**
   * List all snapshots for a database.
   * Requires Builder tier or higher.
   */
  async listSnapshots(databaseId: string): Promise<Snapshot[]> {
    const res = await this.fetch<{ snapshots: Snapshot[] }>(
      'GET',
      `/v1/databases/${databaseId}/snapshots`,
    );
    return res.snapshots;
  }

  /**
   * Restore a database from a snapshot.
   * Warning: overwrites all current data in the database.
   * Requires Builder tier or higher.
   */
  async restore(
    databaseId: string,
    snapshotId: string,
  ): Promise<{ id: string; restored: boolean; databaseId: string }> {
    return this.fetch<{ id: string; restored: boolean; databaseId: string }>(
      'POST',
      `/v1/databases/${databaseId}/snapshots/${snapshotId}/restore`,
    );
  }

  // ── Query ─────────────────────────────────────────────────────────────────

  /**
   * Execute a SQL query against a database via the HTTP API.
   * No pg client required — results come back as JSON.
   * Results are sanitized before return to prevent prompt injection.
   *
   * @example
   * const { rows } = await db.query(id, 'SELECT * FROM users WHERE active = $1', [true]);
   */
  async query(
    databaseId: string,
    sql: string,
    params: unknown[] = [],
  ): Promise<{ rows: Record<string, unknown>[]; rowCount: number | null; fields: Array<{ name: string; dataTypeID: number }>; truncated: boolean }> {
    return this.fetch('POST', `/v1/databases/${databaseId}/query`, { sql, params });
  }

  // ── Schema ────────────────────────────────────────────────────────────────

  /**
   * Introspect the database schema. Returns tables + columns in a structured
   * format optimized for LLM context injection.
   *
   * @example
   * const { schemaText } = await db.introspect(id);
   * // schemaText: "users(id:integer PK NOT NULL, email:varchar(255) NOT NULL, ...)\ntasks(...)"
   * // Pass schemaText directly into your agent's system prompt.
   */
  async introspect(databaseId: string): Promise<{
    databaseId: string;
    tables: Array<{ name: string; columns: Array<{ name: string; type: string; nullable: boolean; primaryKey: boolean }> }>;
    tableCount: number;
    schemaText: string;
  }> {
    return this.fetch('GET', `/v1/databases/${databaseId}/schema`);
  }

  /**
   * Rotate database credentials. Returns a new connection string.
   * Use this if credentials are compromised or as a periodic security rotation.
   */
  async rotateCredentials(databaseId: string): Promise<{ id: string; connectionString: string; rotatedAt: string }> {
    return this.fetch('POST', `/v1/databases/${databaseId}/rotate-credentials`);
  }

  // ── Billing ───────────────────────────────────────────────────────────────

  /**
   * Create a Stripe Checkout URL to upgrade the account.
   * @param tier  1=Builder ($19), 2=Pro ($49), 3=Scale ($199)
   */
  async checkout(
    tier: 1 | 2 | 3,
    opts?: { successUrl?: string; cancelUrl?: string },
  ): Promise<CheckoutSession> {
    return this.fetch<CheckoutSession>('POST', '/v1/billing/checkout', {
      tier,
      ...opts,
    });
  }

  /**
   * Create a Stripe Customer Portal URL to manage subscription / cancel.
   */
  async portal(): Promise<{ portalUrl: string }> {
    return this.fetch<{ portalUrl: string }>('POST', '/v1/billing/portal');
  }
}

// ─── Standalone signup helper ─────────────────────────────────────────────────

/**
 * Create a new LobsterDB account. Returns your API key — store it securely.
 *
 * @example
 * const { token } = await signup();
 * // Store token in LobsterVault or your env
 * const db = new LobsterDB({ apiKey: token });
 */
export async function signup(
  opts: { baseUrl?: string } = {},
): Promise<{ token: string; id: string; tier: number; limits: Account['limits'] }> {
  const baseUrl = (opts.baseUrl ?? 'https://api.theclawdepot.com/db').replace(/\/$/, '');
  const res = await globalThis.fetch(`${baseUrl}/v1/signup`, { method: 'POST' });
  if (!res.ok) throw new DBError('Signup failed', res.status);
  return res.json();
}
