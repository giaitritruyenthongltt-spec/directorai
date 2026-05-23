#!/usr/bin/env node
import { createLogger } from '@directorai/shared';
import { loadConfig } from '@directorai/config';
import {
  MockPremiereAdapter,
  RemotePremiereAdapter,
  type IPremiereAdapter,
} from '@directorai/premiere-adapter';
import { startWebSocketServer } from './ws-server.js';
import { startMcpServer } from './mcp-server.js';

async function main(): Promise<void> {
  const config = loadConfig();
  const logger = createLogger({ name: 'directorai-server', level: config.logLevel });

  logger.info({ env: config.env, server: config.server }, 'DirectorAI server starting');

  // Local mock — used as fallback when no UXP panel is connected
  const mockAdapter = new MockPremiereAdapter();

  const wsServer = await startWebSocketServer({
    host: config.server.host,
    port: config.server.wsPort,
    logger,
    fallbackAdapter: mockAdapter,
  });
  logger.info({ port: config.server.wsPort }, 'WebSocket server listening');

  // Adapter exposed to MCP clients (Claude Desktop). Routes to the panel
  // when one is connected, else falls back to the local mock so dev/CI keeps
  // working without Premiere open.
  const routedAdapter: IPremiereAdapter = new RemotePremiereAdapter(
    async <T>(method: string, params?: unknown): Promise<T> => {
      if (wsServer.isPanelConnected()) {
        return wsServer.panelCall<T>(method, params);
      }
      const { dispatchRpc } = await import('./rpc-dispatcher.js');
      return (await dispatchRpc(method, params, mockAdapter)) as T;
    }
  );

  const mcpServer = await startMcpServer({ logger, adapter: routedAdapter });
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
