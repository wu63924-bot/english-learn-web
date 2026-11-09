import { readConfig } from './config.ts';
import { createApiServer } from './app.ts';
import { MockProvider } from './mockProvider.ts';
import { OpenAiProvider } from './openaiProvider.ts';

const config = readConfig();
const provider = config.provider === 'openai' ? new OpenAiProvider(config) : new MockProvider(config);
const server = createApiServer(config, { provider });

server.listen(config.port, config.host, () => {
  console.info(JSON.stringify({ event: 'listening', host: config.host, port: config.port, provider: config.provider, model: config.provider === 'openai' ? config.model : undefined }));
});

function shutdown(signal: string): void {
  console.info(JSON.stringify({ event: 'shutdown', signal }));
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 3_000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
