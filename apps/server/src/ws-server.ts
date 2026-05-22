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
  adapter: IPremiereAdapter;
}

export interface RunningWsServer {
  close(): Promise<void>;
}

export async function startWebSocketServer(opts: WsServerOptions): Promise<RunningWsServer> {
  const wss = new WebSocketServer({ host: opts.host, port: opts.port });
  const sockets = new Set<WebSocket>();

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
        void handleRequest(ws, msg, opts);
      } else if (isResponse(msg)) {
        // panel-originated response — not yet routed (P1.08)
        opts.logger.debug({ msg }, 'Received response (ignored)');
      }
    });

    ws.on('close', () => {
      sockets.delete(ws);
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
  };
}

async function handleRequest(
  ws: WebSocket,
  req: JsonRpcRequest,
  opts: WsServerOptions
): Promise<void> {
  try {
    const result = await dispatchRpc(req.method, req.params, opts.adapter);
    send(ws, {
      jsonrpc: '2.0',
      id: req.id,
      result,
    } satisfies JsonRpcSuccess);
  } catch (err) {
    opts.logger.warn({ method: req.method, err }, 'RPC error');
    send(ws, {
      jsonrpc: '2.0',
      id: req.id,
      error: {
        code: RpcErrorCode.INTERNAL_ERROR,
        message: err instanceof Error ? err.message : 'Internal error',
      },
    } satisfies JsonRpcErrorResponse);
  }
}

function send(ws: WebSocket, msg: unknown): void {
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}
