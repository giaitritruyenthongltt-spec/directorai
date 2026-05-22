/**
 * WebSocket client for the UXP panel.
 * Connects to the DirectorAI server (ws://127.0.0.1:7778).
 * Uses JSON-RPC 2.0 for request/response.
 */

import type { JsonRpcRequest, JsonRpcSuccess, JsonRpcErrorResponse } from '@directorai/shared';

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
  type: 'tool_call' | 'tool_result' | 'error' | 'info';
  method?: string;
  result?: unknown;
  error?: string;
}

let _idSeq = 1;

class WsClient {
  private ws: WebSocket | null = null;
  private pending = new Map<number, RpcHandler>();
  private stateListeners: StateListener[] = [];
  private logListeners: LogListener[] = [];
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
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
      this.emit({
        id: String(_idSeq++),
        ts: Date.now(),
        type: 'info',
        result: 'Connected to DirectorAI server',
      });
    };

    this.ws.onclose = () => {
      this.setState('disconnected');
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
      const m = msg as JsonRpcSuccess | JsonRpcErrorResponse;
      if (m.id !== undefined && m.id !== null) {
        const h = this.pending.get(m.id as number);
        if (!h) return;
        this.pending.delete(m.id as number);
        if ('result' in m) {
          h.resolve(m.result);
          this.emit({
            id: String(_idSeq++),
            ts: Date.now(),
            type: 'tool_result',
            result: m.result,
          });
        } else {
          h.reject(new Error((m as JsonRpcErrorResponse).error.message));
          this.emit({
            id: String(_idSeq++),
            ts: Date.now(),
            type: 'error',
            error: (m as JsonRpcErrorResponse).error.message,
          });
        }
      }
    };
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, 3000);
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
      this.ws.send(JSON.stringify(req));
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
