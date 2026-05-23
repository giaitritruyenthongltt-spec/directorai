/**
 * WebSocket client for the UXP panel.
 *
 * - Connects to the DirectorAI server (ws://127.0.0.1:7778)
 * - Sends `_panel.register` handshake on open so the server routes
 *   tool calls here instead of the mock fallback
 * - Handles INBOUND RPC requests by dispatching to the local
 *   UXPPremiereAdapter (real Premiere) and replying with a JSON-RPC response
 * - Exposes outbound `.call(method, params)` for the UI
 * - Reconnects with exponential backoff + heartbeat ping
 */

import {
  type JsonRpcRequest,
  type JsonRpcSuccess,
  type JsonRpcErrorResponse,
  isRequest,
  isResponse,
  RpcErrorCode,
} from '@directorai/shared';
import { dispatchRpc } from '@directorai/premiere-adapter';
import { getPanelAdapter, adapterKind } from './panel-adapter.js';

interface RpcHandler {
  resolve: (result: unknown) => void;
  reject: (err: Error) => void;
}

export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error';

type StateListener = (state: ConnectionState) => void;
type LogListener = (entry: LogEntry) => void;

export interface LogEntry {
  id: string;
  ts: number;
  type: 'tool_call' | 'tool_result' | 'error' | 'info' | 'inbound';
  method?: string;
  result?: unknown;
  error?: string;
}

let _idSeq = 1;

const INITIAL_BACKOFF_MS = 1_000;
const MAX_BACKOFF_MS = 30_000;
const HEARTBEAT_INTERVAL_MS = 25_000;

class WsClient {
  private ws: WebSocket | null = null;
  private pending = new Map<number, RpcHandler>();
  private stateListeners: StateListener[] = [];
  private logListeners: LogListener[] = [];
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private backoff = INITIAL_BACKOFF_MS;
  private _state: ConnectionState = 'disconnected';
  private url: string;

  constructor(url: string) {
    this.url = url;
  }

  private setState(s: ConnectionState): void {
    this._state = s;
    this.stateListeners.forEach((l) => l(s));
  }

  private emit(entry: LogEntry): void {
    this.logListeners.forEach((l) => l(entry));
  }

  connect(): void {
    if (this._state === 'connected' || this._state === 'connecting') return;
    this.setState('connecting');
    try {
      this.ws = new WebSocket(this.url);
    } catch {
      this.setState('error');
      this.scheduleReconnect();
      return;
    }

    this.ws.onopen = () => {
      this.setState('connected');
      this.backoff = INITIAL_BACKOFF_MS;
      this.emit({
        id: String(_idSeq++),
        ts: Date.now(),
        type: 'info',
        result: `Connected to DirectorAI server (adapter: ${adapterKind()})`,
      });
      this.sendRegistration();
      this.startHeartbeat();
    };

    this.ws.onclose = () => {
      this.setState('disconnected');
      this.stopHeartbeat();
      this.failAllPending('WebSocket closed');
      this.scheduleReconnect();
    };

    this.ws.onerror = () => {
      this.setState('error');
    };

    this.ws.onmessage = (ev) => {
      let msg: unknown;
      try {
        msg = JSON.parse(ev.data as string);
      } catch {
        return;
      }
      if (isRequest(msg)) {
        void this.handleInbound(msg);
      } else if (isResponse(msg)) {
        this.handleResponse(msg);
      }
    };
  }

  private async handleInbound(req: JsonRpcRequest): Promise<void> {
    this.emit({
      id: String(req.id),
      ts: Date.now(),
      type: 'inbound',
      method: req.method,
      result: req.params,
    });
    try {
      const result = await dispatchRpc(req.method, req.params, getPanelAdapter());
      this.sendRaw({
        jsonrpc: '2.0',
        id: req.id,
        result,
      } satisfies JsonRpcSuccess);
    } catch (err) {
      this.sendRaw({
        jsonrpc: '2.0',
        id: req.id,
        error: {
          code: RpcErrorCode.ADAPTER_ERROR,
          message: err instanceof Error ? err.message : String(err),
        },
      } satisfies JsonRpcErrorResponse);
      this.emit({
        id: String(req.id),
        ts: Date.now(),
        type: 'error',
        method: req.method,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  private handleResponse(msg: JsonRpcSuccess | JsonRpcErrorResponse): void {
    if (msg.id === null || msg.id === undefined) return;
    const id = typeof msg.id === 'number' ? msg.id : Number(msg.id);
    const h = this.pending.get(id);
    if (!h) return;
    this.pending.delete(id);
    if ('result' in msg) {
      h.resolve(msg.result);
      this.emit({
        id: String(id),
        ts: Date.now(),
        type: 'tool_result',
        result: msg.result,
      });
    } else {
      h.reject(new Error(msg.error.message));
      this.emit({
        id: String(id),
        ts: Date.now(),
        type: 'error',
        error: msg.error.message,
      });
    }
  }

  private sendRegistration(): void {
    const id = _idSeq++;
    const req: JsonRpcRequest = {
      jsonrpc: '2.0',
      id,
      method: '_panel.register',
      params: { kind: adapterKind() },
    };
    this.pending.set(id, {
      resolve: () => {
        this.emit({
          id: String(id),
          ts: Date.now(),
          type: 'info',
          result: 'Registered with server as active panel',
        });
      },
      reject: (e) =>
        this.emit({
          id: String(id),
          ts: Date.now(),
          type: 'error',
          error: `Registration failed: ${e.message}`,
        }),
    });
    this.sendRaw(req);
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        // No-op JSON-RPC notification; some WS implementations strip
        // protocol pings, so we send a tiny message.
        this.sendRaw({ jsonrpc: '2.0', method: '_panel.ping' });
      }
    }, HEARTBEAT_INTERVAL_MS);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private failAllPending(reason: string): void {
    for (const [, h] of this.pending) h.reject(new Error(reason));
    this.pending.clear();
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    const delay = this.backoff;
    this.backoff = Math.min(this.backoff * 2, MAX_BACKOFF_MS);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  private sendRaw(msg: unknown): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify(msg));
  }

  call<T = unknown>(method: string, params?: unknown): Promise<T> {
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        reject(new Error('Not connected'));
        return;
      }
      const id = _idSeq++;
      const req: JsonRpcRequest = { jsonrpc: '2.0', id, method, params };
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
      this.sendRaw(req);
      this.emit({ id: String(id), ts: Date.now(), type: 'tool_call', method, result: params });
    });
  }

  get state(): ConnectionState {
    return this._state;
  }

  onStateChange(l: StateListener): () => void {
    this.stateListeners.push(l);
    return () => {
      this.stateListeners = this.stateListeners.filter((x) => x !== l);
    };
  }

  onLog(l: LogListener): () => void {
    this.logListeners.push(l);
    return () => {
      this.logListeners = this.logListeners.filter((x) => x !== l);
    };
  }
}

export const wsClient = new WsClient('ws://127.0.0.1:7778');
