import { WebSocketServer, type WebSocket } from 'ws';
import {
  type Logger,
  isRequest,
  isResponse,
  RpcErrorCode,
  type JsonRpcRequest,
  type JsonRpcSuccess,
  type JsonRpcErrorResponse,
} from '@directorai/shared';
import type { IPremiereAdapter } from '@directorai/premiere-adapter';
import { dispatchRpc } from './rpc-dispatcher.js';

export interface WsServerOptions {
  host: string;
  port: number;
  logger: Logger;
  /** Local fallback adapter used when no panel is connected (mock). */
  fallbackAdapter: IPremiereAdapter;
}

export interface RunningWsServer {
  close(): Promise<void>;
  isPanelConnected(): boolean;
  /** Send a JSON-RPC request to the connected panel and await its response. */
  panelCall<T = unknown>(method: string, params?: unknown, timeoutMs?: number): Promise<T>;
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

    // No panel: dispatch locally on the mock fallback
    try {
      const result = await dispatchRpc(req.method, req.params, opts.fallbackAdapter);
      send(ws, { jsonrpc: '2.0', id: req.id, result } satisfies JsonRpcSuccess);
    } catch (err) {
      opts.logger.warn({ method: req.method, err }, 'Local RPC error');
      send(ws, {
        jsonrpc: '2.0',
        id: req.id,
        error: {
          code: RpcErrorCode.INTERNAL_ERROR,
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
  };
}

export { PANEL_REGISTER_METHOD };
