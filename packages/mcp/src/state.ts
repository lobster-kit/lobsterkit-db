import { LobsterDB, signup } from '@lobsterkit/db';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const TOKEN_DIR = join(homedir(), '.lobsterdb');
const TOKEN_FILE = join(TOKEN_DIR, 'token');

function readPersistedToken(): string | null {
  try {
    return readFileSync(TOKEN_FILE, 'utf-8').trim() || null;
  } catch {
    return null;
  }
}

function persistToken(token: string): void {
  try {
    mkdirSync(TOKEN_DIR, { recursive: true });
    writeFileSync(TOKEN_FILE, token, { mode: 0o600 });
  } catch {
    // non-fatal — token will just need to be set via env var next time
  }
}

let client: LobsterDB | null = null;

export async function getClient(): Promise<LobsterDB> {
  if (client) return client;

  const baseUrl = process.env.LOBSTERDB_API_URL ?? 'https://api.theclawdepot.com/db';

  // 1. Env var takes priority
  let token = process.env.LOBSTERDB_API_KEY ?? null;

  // 2. Fall back to persisted token
  if (!token) {
    token = readPersistedToken();
  }

  // 3. Auto-signup if no token found
  if (!token) {
    const { token: newToken } = await signup({ baseUrl });
    persistToken(newToken);
    token = newToken;
  }

  client = new LobsterDB({ apiKey: token, baseUrl });
  return client;
}
