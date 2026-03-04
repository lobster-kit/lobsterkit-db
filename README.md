# LobsterKit DB

Open-source SDK, MCP server, and skills for [LobsterDB](https://theclawdepot.com/db) — instant PostgreSQL databases for AI agents.

## Packages

| Package | npm | Description |
|---------|-----|-------------|
| [@lobsterkit/db](./packages/sdk) | [![npm](https://img.shields.io/npm/v/@lobsterkit/db)](https://www.npmjs.com/package/@lobsterkit/db) | TypeScript SDK |
| [@lobsterkit/db-mcp](./packages/mcp) | [![npm](https://img.shields.io/npm/v/@lobsterkit/db-mcp)](https://www.npmjs.com/package/@lobsterkit/db-mcp) | MCP Server |

## Quick Start

### SDK
```bash
npm install @lobsterkit/db
```

```typescript
import { LobsterDB } from '@lobsterkit/db';

const db = new LobsterDB({ apiKey: 'ld_sk_live_...' });
const database = await db.create('my-app-db');
const result = await db.query(database.id, 'SELECT NOW()');
```

### MCP Server
```bash
npx @lobsterkit/db-mcp@latest
```

## License

MIT
