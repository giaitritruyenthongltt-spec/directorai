import { WebSocketServer, type WebSocket } from 'ws';
import {
  type Logger,
  isRequest,
  isResponse,
  RpcErrorCode,
  type JsonRpcRequest,
  type JsonRpcSuccess,
  type JsonRpcErrorResponse,
  PROGRESS_NOTIFICATION_METHOD,
  PROGRESS_CANCEL_METHOD,
  type ProgressCancelParams,
} from '@directorai/shared';
import type { IPremiereAdapter } from '@directorai/premiere-adapter';
import { dispatchRpc } from './rpc-dispatcher.js';
import { ProgressBus } from './progress-bus.js';

export type NlQueryHandler = (input: { prompt: string; maxTurns?: number }) => Promise<unknown>;
export type ContextHandler = (method: string, params: unknown) => Promise<unknown>;
export type StyleHandler = (method: string, params: unknown) => Promise<unknown>;
export type CheckpointHandler = (method: string, params: unknown) => Promise<unknown>;
export type TelemetryHandler = (method: string, params: unknown) => Promise<unknown>;

export interface WsServerOptions {
  host: string;
  port: number;
  logger: Logger;
  /** Local fallback adapter used when no panel is connected (mock). */
  fallbackAdapter: IPremiereAdapter;
  /** Optional handler for the `nl.query` RPC method (LLM-driven). */
  onNlQuery?: NlQueryHandler;
  /** Optional handler for `context.*` RPC methods (Python service). */
  onContext?: ContextHandler;
  /** Optional handler for `style.*` RPC methods (plan + execute). */
  onStyle?: StyleHandler;
  /** Optional handler for `checkpoint.*` RPC methods (snapshot store, P4.06). */
  onCheckpoint?: CheckpointHandler;
  /** Optional handler for `telemetry.*` RPC methods (consent + GDPR, P4.13). */
  onTelemetry?: TelemetryHandler;
}

export interface RunningWsServer {
  close(): Promise<void>;
  isPanelConnected(): boolean;
  /** Send a JSON-RPC request to the connected panel and await its response. */
  panelCall<T = unknown>(method: string, params?: unknown, timeoutMs?: number): Promise<T>;
  /** Server-wide progress bus (P4.02). Read-only access for tests + observability. */
  readonly progress: ProgressBus;
}

interface PendingResponse {
  resolve: (v: unknown) => void;
  reject: (e: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

const PANEL_REGISTER_METHOD = '_panel.register';
const DEFAULT_PANEL_CALL_TIMEOUT = 30_000;

export async function startWebSocketServer(opts: WsServerOptions): Promise<RunningWsServer> {
  const wss = new WebSocketServer({ host: opts.host, port: opts.port });
  const sockets = new Set<WebSocket>();
  let activePanel: WebSocket | null = null;
  const pending = new Map<number, PendingResponse>();
  let outboundIdSeq = 1_000_000; // separate from inbound id space

  // P4.02 — progress bus + per-op originating-socket map. We need the
  // map so an event tied to an opId is forwarded only to the socket that
  // initiated the work, not broadcast.
  const progress = new ProgressBus();
  const opOrigin = new Map<string, WebSocket>();
  progress.onEvent((evt) => {
    const origin = opOrigin.get(evt.opId);
    if (!origin) return;
    if (origin.readyState !== origin.OPEN) return;
    origin.send(
      JSON.stringify({
        jsonrpc: '2.0',
        method: PROGRESS_NOTIFICATION_METHOD,
        params: evt,
      })
    );
    if (evt.kind === 'end') opOrigin.delete(evt.opId);
  });

  const send = (ws: WebSocket, msg: unknown): void => {
    if (ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  };

  const handleInboundRequest = async (ws: WebSocket, req: JsonRpcRequest): Promise<void> => {
    // Special: panel registration handshake
    if (req.method === PANEL_REGISTER_METHOD) {
      activePanel = ws;
      opts.logger.info({ id: req.id }, 'UXP panel registered');
      send(ws, { jsonrpc: '2.0', id: req.id, result: { ok: true } } satisfies JsonRpcSuccess);
      return;
    }

    // Special: progress.cancel — flip the abort signal for the op
    if (req.method === PROGRESS_CANCEL_METHOD) {
      const { opId } = (req.params ?? {}) as ProgressCancelParams;
      const ok = opId ? progress.cancel(opId) : false;
      send(ws, { jsonrpc: '2.0', id: req.id, result: { ok } } satisfies JsonRpcSuccess);
      return;
    }

    // Special: LLM-driven natural-language query (handled server-side)
    if (req.method === 'nl.query') {
      if (!opts.onNlQuery) {
        send(ws, {
          jsonrpc: '2.0',
          id: req.id,
          error: {
            code: RpcErrorCode.METHOD_NOT_FOUND,
            message: 'nl.query disabled — set ANTHROPIC_API_KEY to enable',
          },
        } satisfies JsonRpcErrorResponse);
        return;
      }
      try {
        const result = await opts.onNlQuery(req.params as { prompt: string; maxTurns?: number });
        send(ws, { jsonrpc: '2.0', id: req.id, result } satisfies JsonRpcSuccess);
      } catch (err) {
        send(ws, {
          jsonrpc: '2.0',
          id: req.id,
          error: {
            code: RpcErrorCode.INTERNAL_ERROR,
            message: err instanceof Error ? err.message : 'nl.query failed',
          },
        } satisfies JsonRpcErrorResponse);
      }
      return;
    }

    // Special: style.* methods → server-side planner+executor
    if (req.method.startsWith('style.')) {
      if (!opts.onStyle) {
        send(ws, {
          jsonrpc: '2.0',
          id: req.id,
          error: { code: RpcErrorCode.METHOD_NOT_FOUND, message: 'style.* router unavailable' },
        } satisfies JsonRpcErrorResponse);
        return;
      }
      try {
        const result = await opts.onStyle(req.method, req.params);
        send(ws, { jsonrpc: '2.0', id: req.id, result } satisfies JsonRpcSuccess);
      } catch (err) {
        opts.logger.warn({ method: req.method, err }, 'style RPC error');
        send(ws, {
          jsonrpc: '2.0',
          id: req.id,
          error: {
            code: RpcErrorCode.ADAPTER_ERROR,
            message: err instanceof Error ? err.message : 'style call failed',
          },
        } satisfies JsonRpcErrorResponse);
      }
      return;
    }

    // Special: telemetry.* methods → consent + GDPR (P4.13)
    if (req.method.startsWith('telemetry.')) {
      if (!opts.onTelemetry) {
        send(ws, {
          jsonrpc: '2.0',
          id: req.id,
          error: { code: RpcErrorCode.METHOD_NOT_FOUND, message: 'telemetry router unavailable' },
        } satisfies JsonRpcErrorResponse);
        return;
      }
      try {
        const result = await opts.onTelemetry(req.method, req.params);
        send(ws, { jsonrpc: '2.0', id: req.id, result } satisfies JsonRpcSuccess);
      } catch (err) {
        send(ws, {
          jsonrpc: '2.0',
          id: req.id,
          error: {
            code: RpcErrorCode.ADAPTER_ERROR,
            message: err instanceof Error ? err.message : 'telemetry call failed',
          },
        } satisfies JsonRpcErrorResponse);
      }
      return;
    }

    // Special: checkpoint.* methods → on-disk snapshot store (P4.06)
    if (req.method.startsWith('checkpoint.')) {
      if (!opts.onCheckpoint) {
        send(ws, {
          jsonrpc: '2.0',
          id: req.id,
          error: { code: RpcErrorCode.METHOD_NOT_FOUND, message: 'checkpoint router unavailable' },
        } satisfies JsonRpcErrorResponse);
        return;
      }
      try {
        const result = await opts.onCheckpoint(req.method, req.params);
        send(ws, { jsonrpc: '2.0', id: req.id, result } satisfies JsonRpcSuccess);
      } catch (err) {
        opts.logger.warn({ method: req.method, err }, 'checkpoint RPC error');
        send(ws, {
          jsonrpc: '2.0',
          id: req.id,
          error: {
            code: RpcErrorCode.ADAPTER_ERROR,
            message: err instanceof Error ? err.message : 'checkpoint call failed',
          },
        } satisfies JsonRpcErrorResponse);
      }
      return;
    }

    // Special: context.* methods → Python context-engine
    if (req.method.startsWith('context.')) {
      if (!opts.onContext) {
        send(ws, {
          jsonrpc: '2.0',
          id: req.id,
          error: {
            code: RpcErrorCode.METHOD_NOT_FOUND,
            message: `${req.method} requires context-engine — start it via tools/start-context.ps1`,
          },
        } satisfies JsonRpcErrorResponse);
        return;
      }
      try {
        const result = await opts.onContext(req.method, req.params);
        send(ws, { jsonrpc: '2.0', id: req.id, result } satisfies JsonRpcSuccess);
      } catch (err) {
        opts.logger.warn({ method: req.method, err }, 'context RPC error');
        send(ws, {
          jsonrpc: '2.0',
          id: req.id,
          error: {
            code: RpcErrorCode.ADAPTER_ERROR,
            message: err instanceof Error ? err.message : 'context call failed',
          },
        } satisfies JsonRpcErrorResponse);
      }
      return;
    }

    // If a panel is connected and this is a tool call, forward to panel.
    if (activePanel && activePanel !== ws && activePanel.readyState === activePanel.OPEN) {
      try {
        const result = await callPanel(req.method, req.params);
        send(ws, { jsonrpc: '2.0', id: req.id, result } satisfies JsonRpcSuccess);
      } catch (err) {
        opts.logger.warn({ method: req.method, err }, 'Panel RPC error');
        send(ws, {
          jsonrpc: '2.0',
          id: req.id,
          error: {
            code: RpcErrorCode.ADAPTER_ERROR,
            message: err instanceof Error ? err.message : 'Panel call failed',
          },
        } satisfies JsonRpcErrorResponse);
      }
      return;
    }

    // No panel: dispatch locally on the mock fallback, with progress tracking.
    const { opId, signal } = progress.start(req.method);
    opOrigin.set(opId, ws);
    try {
      const result = await dispatchRpc(req.method, req.params, opts.fallbackAdapter, {
        signal,
      });
      progress.end(opId, 'completed');
      send(ws, { jsonrpc: '2.0', id: req.id, result } satisfies JsonRpcSuccess);
    } catch (err) {
      const cancelled =
        signal.aborted ||
        (typeof err === 'object' &&
          err !== null &&
          (err as { name?: string }).name === 'AbortError');
      progress.end(
        opId,
        cancelled ? 'cancelled' : 'error',
        err instanceof Error ? err.message : String(err)
      );
      opts.logger.warn({ method: req.method, err }, 'Local RPC error');
      send(ws, {
        jsonrpc: '2.0',
        id: req.id,
        error: {
          code: cancelled ? RpcErrorCode.CANCELLED : RpcErrorCode.INTERNAL_ERROR,
          message: err instanceof Error ? err.message : 'Internal error',
        },
      } satisfies JsonRpcErrorResponse);
    }
  };

  const handleInboundResponse = (msg: JsonRpcSuccess | JsonRpcErrorResponse): void => {
    if (msg.id === null || typeof msg.id !== 'number') return;
    const handler = pending.get(msg.id);
    if (!handler) return;
    pending.delete(msg.id);
    clearTimeout(handler.timer);
    if ('result' in msg) handler.resolve(msg.result);
    else handler.reject(new Error(msg.error.message));
  };

  const callPanel = <T = unknown>(
    method: string,
    params?: unknown,
    timeoutMs = DEFAULT_PANEL_CALL_TIMEOUT
  ): Promise<T> => {
    return new Promise<T>((resolve, reject) => {
      if (!activePanel || activePanel.readyState !== activePanel.OPEN) {
        reject(new Error('No panel connected'));
        return;
      }
      const id = outboundIdSeq++;
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`Panel call "${method}" timed out after ${timeoutMs}ms`));
      }, timeoutMs);
      pending.set(id, {
        resolve: (v) => resolve(v as T),
        reject,
        timer,
      });
      const req: JsonRpcRequest = { jsonrpc: '2.0', id, method, params };
      send(activePanel, req);
    });
  };

  wss.on('connection', (ws) => {
    sockets.add(ws);
    opts.logger.info({ clients: sockets.size }, 'WS client connected');

    ws.on('message', (raw) => {
      let msg: unknown;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        send(ws, {
          jsonrpc: '2.0',
          id: null,
          error: { code: RpcErrorCode.PARSE_ERROR, message: 'Invalid JSON' },
        } satisfies JsonRpcErrorResponse);
        return;
      }
      if (isRequest(msg)) {
        void handleInboundRequest(ws, msg);
      } else if (isResponse(msg)) {
        handleInboundResponse(msg);
      }
    });

    ws.on('close', () => {
      sockets.delete(ws);
      if (activePanel === ws) {
        activePanel = null;
        opts.logger.info('UXP panel disconnected — falling back to mock');
      }
      opts.logger.info({ clients: sockets.size }, 'WS client disconnected');
    });

    ws.on('error', (err) => {
      opts.logger.error({ err }, 'WS error');
    });
  });

  return {
    close: () =>
      new Promise<void>((resolve) => {
        for (const s of sockets) s.close();
        wss.close(() => resolve());
      }),
    isPanelConnected: () => activePanel !== null && activePanel.readyState === activePanel.OPEN,
    panelCall: callPanel,
    progress,
  };
}

export { PANEL_REGISTER_METHOD };
