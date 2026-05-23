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
import { createNlRouter } from './nl-router.js';
import { createContextRouter } from './context-router.js';
import { createStyleRouter } from './style-router.js';

async function main(): Promise<void> {
  const config = loadConfig();
  const logger = createLogger({ name: 'directorai-server', level: config.logLevel });

  logger.info({ env: config.env, server: config.server }, 'DirectorAI server starting');

  // Local mock — used as fallback when no UXP panel is connected
  const mockAdapter = new MockPremiereAdapter();

  // Build the routed adapter eagerly so we can pass it to the WS server
  // (which needs it to handle `nl.query` calls).
  const routedAdapterRef: { current: IPremiereAdapter | null } = { current: null };

  const contextRouter = createContextRouter({
    baseUrl: config.context.url,
    logger,
  });
  logger.info(
    { baseUrl: config.context.url, methods: contextRouter.listMethods().length },
    'Context router wired'
  );

  const styleRouter = createStyleRouter({
    logger,
    adapter: () => {
      if (!routedAdapterRef.current) throw new Error('Adapter not ready');
      return routedAdapterRef.current;
    },
  });
  logger.info({ methods: styleRouter.listMethods().length }, 'Style router wired');

  const nlRouter = config.llm.apiKey
    ? createNlRouter({
        apiKey: config.llm.apiKey,
        model: config.llm.model,
        logger,
        contextDispatch: (method, params) => contextRouter.dispatch(method, params),
      })
    : null;
  if (!nlRouter) {
    logger.warn('ANTHROPIC_API_KEY not set — nl.query disabled');
  }

  const wsServer = await startWebSocketServer({
    host: config.server.host,
    port: config.server.wsPort,
    logger,
    fallbackAdapter: mockAdapter,
    onNlQuery: nlRouter
      ? async (input) => {
          if (!routedAdapterRef.current) throw new Error('Adapter not ready');
          return nlRouter(input, routedAdapterRef.current);
        }
      : undefined,
    onContext: (method, params) => contextRouter.dispatch(method, params),
    onStyle: (method, params) => styleRouter.dispatch(method, params),
  });
  logger.info({ port: config.server.wsPort }, 'WebSocket server listening');

  routedAdapterRef.current = new RemotePremiereAdapter(
    async <T>(method: string, params?: unknown): Promise<T> => {
      if (wsServer.isPanelConnected()) {
        return wsServer.panelCall<T>(method, params);
      }
      const { dispatchRpc } = await import('./rpc-dispatcher.js');
      return (await dispatchRpc(method, params, mockAdapter)) as T;
    }
  );

  const mcpServer = await startMcpServer({
    logger,
    adapter: routedAdapterRef.current,
    contextDispatch: (method, params) => contextRouter.dispatch(method, params),
  });
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
