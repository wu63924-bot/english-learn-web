import { writeFileSync } from 'node:fs';

// The compiled server lives in api-dist/server; type-only imports from src are erased.
// The API uses only Node built-ins, so no external runtime dependencies are required.
writeFileSync(new URL('../api-dist/server/package.json', import.meta.url), `${JSON.stringify({
  name: 'english-learn-ai',
  version: '0.1.0',
  private: true,
  type: 'module',
  engines: { node: '>=22.18.0' },
  scripts: { 'start:api': 'node index.js' },
  dependencies: {}
}, null, 2)}\n`);
