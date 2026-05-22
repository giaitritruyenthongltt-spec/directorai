#!/usr/bin/env node
import { createLogger } from '@directorai/shared';
import { loadConfig } from '@directorai/config';
import { createPremiereAdapter } from '@directorai/premiere-adapter';
import { startWebSocketServer } from './ws-server.js';
import { startMcpServer } from './mcp-server.js';

async function main(): Promise<void> {
  const config = loadConfig();
  const logger = createLogger({ name: 'directorai-server', level: config.logLevel });

  logger.info({ env: config.env, server: config.server }, 'DirectorAI server starting');

  const adapter = createPremiereAdapter({ kind: 'mock' });
  logger.info({ adapter: adapter.kind }, 'Premiere adapter ready');

  const wsServer = await startWebSocketServer({
    host: config.server.host,
    port: config.server.wsPort,
    logger,
    adapter,
  });
  logger.info({ port: config.server.wsPort }, 'WebSocket server listening');

  const mcpServer = await startMcpServer({ logger, adapter });
  logger.info({ tools: mcpServer.toolCount }, 'MCP server ready');

  const shutdown = (signal: string): void => {
    logger.info({ signal }, 'Shutting down');
    void wsServer.close().then(() => process.exit(0));
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((err: unknown) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
