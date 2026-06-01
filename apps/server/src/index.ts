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
import { createCheckpointRouter } from './checkpoint-router.js';
import { CheckpointStore } from './checkpoint-store.js';
import { initSentry } from './sentry.js';
import { createTelemetryRouter } from './telemetry-router.js';
import { createFirstRunRouter } from './first-run-router.js';
import { DirectorRouter } from './director-router.js';
import { CompositeTools } from './director-tools.js';
import { loadAllPlugins, deactivateAll } from './plugin-loader.js';
import path from 'node:path';
import { ConsentStore, InMemorySink, TelemetryClient } from '@directorai/telemetry';

async function main(): Promise<void> {
  const config = loadConfig();
  const logger = createLogger({ name: 'directorai-server', level: config.logLevel });

  logger.info({ env: config.env, server: config.server }, 'DirectorAI server starting');

  const sentry = await initSentry(config.sentry, logger);
  process.on('uncaughtException', (err) => {
    sentry.captureException(err, { scope: 'uncaughtException' });
    logger.fatal({ err }, 'uncaughtException');
  });
  process.on('unhandledRejection', (reason) => {
    sentry.captureException(reason, { scope: 'unhandledRejection' });
    logger.fatal({ reason }, 'unhandledRejection');
  });

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

  const checkpointStore = new CheckpointStore();

  const telemetrySink = new InMemorySink();
  const consentStore = new ConsentStore();
  const initialConsent = await consentStore.read();
  const telemetryClient = new TelemetryClient({
    sink: telemetrySink,
    isEnabled: () => initialConsent.consented === true,
  });
  const telemetryRouter = createTelemetryRouter({
    logger,
    client: telemetryClient,
    sink: telemetrySink,
    consent: consentStore,
  });
  logger.info(
    { methods: telemetryRouter.listMethods().length, consented: initialConsent.consented },
    'Telemetry router wired'
  );

  const firstRunRouter = createFirstRunRouter({ logger });
  logger.info({ methods: firstRunRouter.listMethods().length }, 'First-run router wired');

  const styleRouter = createStyleRouter({
    logger,
    adapter: () => {
      if (!routedAdapterRef.current) throw new Error('Adapter not ready');
      return routedAdapterRef.current;
    },
    checkpoints: checkpointStore,
  });
  logger.info({ methods: styleRouter.listMethods().length }, 'Style router wired');

  const checkpointRouter = createCheckpointRouter({
    logger,
    adapter: () => {
      if (!routedAdapterRef.current) throw new Error('Adapter not ready');
      return routedAdapterRef.current;
    },
    store: checkpointStore,
  });
  logger.info({ methods: checkpointRouter.listMethods().length }, 'Checkpoint router wired');

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

  // Sprint H.2 — Director router (LLM-driven plan generation + execution).
  // Loaded from env (GEMINI_API_KEY / ANTHROPIC_API_KEY) — returns null if
  // no key is set, in which case the WS server replies with a friendly
  // METHOD_NOT_FOUND for director.* calls.
  // P1-1/P1-3 — Composite tool layer. Handles `context.scanClips`,
  // `context.scoreQuality`, `context.detectBeats`, `context.detectSilences`,
  // `timeline.cutOnBeats` — high-level operations that compose adapter
  // primitives + Python sidecar HTTP. The director's PlanExecutor probes
  // composites first, then falls through to the primitive RPC dispatcher.
  const compositeTools: { current: CompositeTools | null } = { current: null };

  const directorRouter = DirectorRouter.fromEnv({
    logger,
    toolDispatch: async (step) => {
      if (!routedAdapterRef.current) throw new Error('Adapter not ready');
      // Try composite layer first (returns null on miss → fall through).
      if (compositeTools.current) {
        const composite = await compositeTools.current.maybeHandle(step.tool, step.params);
        if (composite !== null) return composite;
      }
      // Primitive RPC — routed through panel or mock adapter.
      const { dispatchRpc } = await import('./rpc-dispatcher.js');
      return dispatchRpc(step.tool, step.params, routedAdapterRef.current);
    },
  });
  if (directorRouter) {
    logger.info({ methods: directorRouter.listMethods().length }, 'Director router wired');
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
    onCheckpoint: (method, params) => checkpointRouter.dispatch(method, params),
    onTelemetry: (method, params) => telemetryRouter.dispatch(method, params),
    onFirstRun: (method, params) => firstRunRouter.dispatch(method, params),
    onDirector: directorRouter
      ? (method, params) => directorRouter.dispatch(method, params)
      : undefined,
    // SAFE-1d — cho phép gọi composite (safe.*, context.* composite, …)
    // trực tiếp qua WS. compositeTools.current set sau startWebSocketServer
    // nên đọc lazily trong closure.
    onComposite: (method, params) =>
      compositeTools.current
        ? compositeTools.current.maybeHandle(method, params)
        : Promise.resolve(null),
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

  // Now that routedAdapterRef is live, instantiate the composite tools so
  // the director's toolDispatch closure (defined above) can reach them.
  compositeTools.current = new CompositeTools({
    adapter: routedAdapterRef.current,
    logger,
  });
  logger.info({ methods: compositeTools.current.listMethods().length }, 'Composite tools wired');

  const mcpServer = await startMcpServer({
    logger,
    adapter: routedAdapterRef.current,
    contextDispatch: (method, params) => contextRouter.dispatch(method, params),
  });
  logger.info({ tools: mcpServer.toolCount }, 'MCP server ready');

  // P5.01d — discover + activate plugins under plugins/<id>/
  const pluginsDir = process.env.DIRECTORAI_PLUGINS_DIR ?? path.resolve(process.cwd(), 'plugins');
  const loadedPlugins = await loadAllPlugins({
    pluginsDir,
    adapter: routedAdapterRef.current,
    logger,
    hooks: {
      onStyleRegistered: (id) => logger.info({ plugin: id }, 'plugin registered a style'),
      onEffectRegistered: (id) => logger.info({ plugin: id }, 'plugin registered an effect'),
      onToolRegistered: (id, def) =>
        logger.info({ plugin: id, tool: def.name }, 'plugin registered a tool'),
      onTelemetryEmit: (id, event) => {
        try {
          telemetryClient.emit(event);
        } catch {
          logger.warn({ plugin: id }, 'plugin telemetry event dropped');
        }
      },
    },
  });
  logger.info({ count: loadedPlugins.length }, 'plugins ready');

  const shutdown = (signal: string): void => {
    logger.info({ signal }, 'Shutting down');
    void deactivateAll(loadedPlugins)
      .then(() => wsServer.close())
      .then(() => process.exit(0));
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((err: unknown) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
