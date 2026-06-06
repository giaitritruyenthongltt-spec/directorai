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
import { type IPremiereAdapter, isMutatingMethod } from '@directorai/premiere-adapter';
import { dispatchRpc } from './rpc-dispatcher.js';
import { ProgressBus } from './progress-bus.js';
import { opsLog } from './ops-log.js';

export type NlQueryHandler = (input: { prompt: string; maxTurns?: number }) => Promise<unknown>;
export type ContextHandler = (method: string, params: unknown) => Promise<unknown>;
export type StyleHandler = (method: string, params: unknown) => Promise<unknown>;
export type CheckpointHandler = (method: string, params: unknown) => Promise<unknown>;
export type TelemetryHandler = (method: string, params: unknown) => Promise<unknown>;
export type FirstRunHandler = (method: string, params: unknown) => Promise<unknown>;

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
  /** Optional handler for `firstRun.*` RPC methods (wizard state, P4.31). */
  onFirstRun?: FirstRunHandler;
  /** Optional handler for `director.*` RPC methods (Sprint H.2 AI Director). */
  onDirector?: (method: string, params: unknown) => Promise<unknown>;
  /**
   * Optional composite-tool probe (CompositeTools.maybeHandle). Tried for
   * tool calls BEFORE forwarding to the panel: returns the result on a hit,
   * or `null` on a miss (then falls through to panel/primitive dispatch).
   * Lets `safe.*` + composite `context.*`/`timeline.*` be called directly
   * over WS, not just inside the Director plan executor.
   */
  onComposite?: (method: string, params: unknown) => Promise<unknown | null>;
  /**
   * P1 — Khi true, TỪ CHỐI method mutating nếu không có panel (chống "thành
   * công giả" trên mock). Mặc định false. Đặt qua env REQUIRE_PANEL_FOR_MUTATION.
   */
  requirePanelForMutation?: boolean;
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
// D2 — bumped 30s → 120s. Premiere 26 Lumetri Component.create on
// first call after panel boot is consistently 30-60s on large projects;
// 120s gives headroom while still failing fast on a real deadlock.
const DEFAULT_PANEL_CALL_TIMEOUT = 120_000;

export async function startWebSocketServer(opts: WsServerOptions): Promise<RunningWsServer> {
  const wss = new WebSocketServer({ host: opts.host, port: opts.port });
  const sockets = new Set<WebSocket>();
  let activePanel: WebSocket | null = null;
  const pending = new Map<number, PendingResponse>();
  let outboundIdSeq = 1_000_000; // separate from inbound id space
  let ridSeq = 0; // P1/P4 — correlation id mỗi RPC để lần 1 job xuyên log

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

    // Special: heartbeat ping from panel. Reply with a notification so the
    // panel's pong watchdog stays armed. Otherwise the panel closes the
    // socket every ~35s and reconnects, churning the active-panel reference.
    if (req.method === '_panel.ping') {
      // Notifications have no id — reply with a notification too.
      send(ws, { jsonrpc: '2.0', method: '_panel.pong' });
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

    // Composite tools (safe.*, module.*, composite context.*/timeline.*) —
    // probed BEFORE all namespace routers + panel-forward. maybeHandle
    // returns null on miss → fall through (real context.*/timeline.* still
    // reach their routers / the panel). Composites run in-server and may
    // issue primitive calls back through the panel adapter.
    if (opts.onComposite) {
      try {
        const handled = await opts.onComposite(req.method, req.params);
        if (handled !== null) {
          send(ws, { jsonrpc: '2.0', id: req.id, result: handled } satisfies JsonRpcSuccess);
          return;
        }
      } catch (err) {
        opts.logger.warn({ method: req.method, err }, 'composite RPC error');
        send(ws, {
          jsonrpc: '2.0',
          id: req.id,
          error: {
            code: RpcErrorCode.ADAPTER_ERROR,
            message: err instanceof Error ? err.message : 'composite call failed',
          },
        } satisfies JsonRpcErrorResponse);
        return;
      }
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

    // Special: director.* methods → AI Director (Sprint H.2)
    if (req.method.startsWith('director.')) {
      if (!opts.onDirector) {
        send(ws, {
          jsonrpc: '2.0',
          id: req.id,
          error: {
            code: RpcErrorCode.METHOD_NOT_FOUND,
            message: 'director router unavailable — set GEMINI_API_KEY or ANTHROPIC_API_KEY',
          },
        } satisfies JsonRpcErrorResponse);
        return;
      }
      try {
        const result = await opts.onDirector(req.method, req.params);
        send(ws, { jsonrpc: '2.0', id: req.id, result } satisfies JsonRpcSuccess);
      } catch (err) {
        opts.logger.warn({ method: req.method, err }, 'director RPC error');
        send(ws, {
          jsonrpc: '2.0',
          id: req.id,
          error: {
            code: RpcErrorCode.ADAPTER_ERROR,
            message: err instanceof Error ? err.message : 'director call failed',
          },
        } satisfies JsonRpcErrorResponse);
      }
      return;
    }

    // Special: firstRun.* methods → wizard state (P4.31)
    if (req.method.startsWith('firstRun.')) {
      if (!opts.onFirstRun) {
        send(ws, {
          jsonrpc: '2.0',
          id: req.id,
          error: { code: RpcErrorCode.METHOD_NOT_FOUND, message: 'firstRun router unavailable' },
        } satisfies JsonRpcErrorResponse);
        return;
      }
      try {
        const result = await opts.onFirstRun(req.method, req.params);
        send(ws, { jsonrpc: '2.0', id: req.id, result } satisfies JsonRpcSuccess);
      } catch (err) {
        send(ws, {
          jsonrpc: '2.0',
          id: req.id,
          error: {
            code: RpcErrorCode.ADAPTER_ERROR,
            message: err instanceof Error ? err.message : 'firstRun call failed',
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
    // (Mutation logging xảy ra TRONG callPanel — chokepoint DUY NHẤT, bắt cả
    // mutation phát từ composite/plan, không chỉ forward trực tiếp.)
    if (activePanel && activePanel !== ws && activePanel.readyState === activePanel.OPEN) {
      try {
        const result = await callPanel(req.method, req.params);
        send(ws, { jsonrpc: '2.0', id: req.id, result } satisfies JsonRpcSuccess);
      } catch (err) {
        // P2 — ngữ cảnh lỗi đầy đủ: message + data(method/stack/params) từ panel.
        const data = (err as { data?: unknown })?.data;
        opts.logger.warn(
          { method: req.method, params: req.params, err: String(err), data },
          'Panel RPC error'
        );
        send(ws, {
          jsonrpc: '2.0',
          id: req.id,
          error: {
            code: RpcErrorCode.ADAPTER_ERROR,
            message: err instanceof Error ? err.message : 'Panel call failed',
            ...(data !== undefined ? { data } : {}),
          },
        } satisfies JsonRpcErrorResponse);
      }
      return;
    }

    // No panel: dispatch locally on the mock fallback, with progress tracking.
    const ridMock = `r${++ridSeq}`;
    const mutatingMock = isMutatingMethod(req.method);
    const t0Mock = Date.now();
    if (mutatingMock) {
      // P1 — GUARD: nếu yêu cầu panel cho mutation → TỪ CHỐI (không "thành công giả").
      if (opts.requirePanelForMutation) {
        opsLog.recordMutation({
          rid: ridMock,
          method: req.method,
          adapter: 'mock',
          ok: false,
          durationMs: 0,
          params: req.params,
          error: 'REQUIRE_PANEL_FOR_MUTATION: không có panel Premiere kết nối',
        });
        opts.logger.warn(
          { rid: ridMock, method: req.method },
          '⛔ TỪ CHỐI mutation: không có panel (REQUIRE_PANEL_FOR_MUTATION bật)'
        );
        send(ws, {
          jsonrpc: '2.0',
          id: req.id,
          error: {
            code: RpcErrorCode.ADAPTER_ERROR,
            message:
              'Không có panel Premiere kết nối — mutation bị từ chối (REQUIRE_PANEL_FOR_MUTATION). Mở panel DirectorAI trong Premiere rồi thử lại.',
          },
        } satisfies JsonRpcErrorResponse);
        return;
      }
      // CẢNH BÁO: mutation lúc không có panel = chạy MOCK, KHÔNG đụng timeline thật.
      opts.logger.warn(
        { rid: ridMock, method: req.method },
        '⚠️ MUTATION trên MOCK (không có panel) — KHÔNG đụng timeline thật'
      );
    }
    const { opId, signal } = progress.start(req.method);
    opOrigin.set(opId, ws);
    try {
      const result = await dispatchRpc(req.method, req.params, opts.fallbackAdapter, {
        signal,
      });
      if (mutatingMock) {
        opsLog.recordMutation({
          rid: ridMock,
          method: req.method,
          adapter: 'mock',
          ok: true,
          durationMs: Date.now() - t0Mock,
          params: req.params,
          result,
        });
      }
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

  const rawCallPanel = <T = unknown>(
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

  /**
   * P1 — `callPanel` là CHOKEPOINT mọi lệnh gửi tới panel (forward trực tiếp
   * LẪN lệnh primitive phát từ composite/plan). Log mutation TẠI ĐÂY ⇒ bắt
   * TOÀN BỘ cắt/ghép, kể cả trong safe.applyPlan. Read (non-mutating) bỏ qua.
   */
  const callPanel = <T = unknown>(
    method: string,
    params?: unknown,
    timeoutMs = DEFAULT_PANEL_CALL_TIMEOUT
  ): Promise<T> => {
    if (!isMutatingMethod(method)) return rawCallPanel<T>(method, params, timeoutMs);
    const rid = `r${++ridSeq}`;
    const t0 = Date.now();
    return rawCallPanel<T>(method, params, timeoutMs).then(
      (result) => {
        opsLog.recordMutation({
          rid,
          method,
          adapter: 'real',
          ok: true,
          durationMs: Date.now() - t0,
          params,
          result,
        });
        return result;
      },
      (err: unknown) => {
        opsLog.recordMutation({
          rid,
          method,
          adapter: 'real',
          ok: false,
          durationMs: Date.now() - t0,
          params,
          error: err instanceof Error ? err.message : String(err),
        });
        throw err;
      }
    );
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
      } else if (typeof msg === 'object' && msg !== null && 'method' in msg && !('id' in msg)) {
        // JSON-RPC notification (no id).
        const m = (msg as { method?: string }).method;
        const params = (msg as { params?: unknown }).params;
        if (m === '_panel.ping') {
          send(ws, { jsonrpc: '2.0', method: '_panel.pong' });
        } else if (m === '_panel.lifecycle') {
          // L1 — panel mount heartbeat. Log so we can verify panel
          // actually rendered (not just registered WS).
          opts.logger.info({ params }, 'panel lifecycle');
        } else if (m === '_panel.error') {
          // L1 — panel-side window error or unhandled rejection.
          opts.logger.error({ params }, 'panel error reported');
          opsLog.record({ event: 'panel.error', ...(params as Record<string, unknown>) });
        } else if (m === '_panel.console') {
          // A4 — forward panel console.* to server log for live debug.
          const p = params as { level?: string; text?: string };
          opts.logger.info({ panelConsole: p.text }, `panel console [${p.level}]`);
        } else if (m === '_panel.log') {
          // P3 — log panel BỀN: error/warn từ LogDrawer đẩy về ops.log để
          // còn dấu vết sau khi panel reload/crash.
          const p = (params ?? {}) as { level?: string; src?: string; msg?: string };
          opsLog.record({
            event: 'panel.log',
            level: p.level ?? 'info',
            src: p.src ?? 'panel',
            msg: typeof p.msg === 'string' ? p.msg.slice(0, 1000) : String(p.msg),
          });
        }
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
