/**
 * P5.03c — DaVinci Resolve bridge protocol.
 *
 * DaVinci exposes a Python scripting API at
 * `DaVinciResolveScript`. From Node we talk to it via a small
 * subprocess that runs a long-lived REPL-ish Python script and
 * exchanges JSON over stdio.
 *
 * The actual subprocess is NOT spawned in unit tests — we test
 * against a `MockDaVinciBridge` that records calls. The real
 * `DaVinciBridge` ships in P5.03c-extension once a Resolve install
 * is available for live verification (owner-completed).
 *
 *   ┌──────────────────────┐  JSON over stdio  ┌────────────────────────┐
 *   │ DaVinciAdapter (TS)  │ ────────────────► │ scripts/da-bridge.py   │
 *   │                      │ ◄──────────────── │ inside the user's      │
 *   │                      │                   │ DaVinci Python env     │
 *   └──────────────────────┘                   └────────────────────────┘
 *
 * Each bridge call is a `BridgeRequest`; responses are `BridgeResponse`.
 * Errors come back as `{ ok: false, error }` and translate into
 * normal Promise rejections at the adapter boundary.
 */

export interface BridgeRequest {
  /** Correlation id; mirrored back in the response. */
  readonly id: number;
  /** Dotted method, e.g. `"timeline.cutClip"`. Mirrors our RPC names. */
  readonly method: string;
  /** JSON-serialisable params. */
  readonly params?: unknown;
}

export type BridgeResponse =
  | { id: number; ok: true; result: unknown }
  | { id: number; ok: false; error: string };

/** Bridge transport — `call(req) → response`. */
export interface IDaVinciBridge {
  call(req: BridgeRequest): Promise<BridgeResponse>;
  close(): Promise<void>;
}

/**
 * In-memory bridge used by unit tests. Records every call to
 * `received[]` and returns whatever `responder` produces. Default
 * responder echoes `{ ok: true, result: null }`.
 */
export class MockDaVinciBridge implements IDaVinciBridge {
  readonly received: BridgeRequest[] = [];
  private closed = false;

  constructor(
    public responder: (req: BridgeRequest) => BridgeResponse = (req) => ({
      id: req.id,
      ok: true,
      result: null,
    })
  ) {}

  async call(req: BridgeRequest): Promise<BridgeResponse> {
    if (this.closed) {
      return { id: req.id, ok: false, error: 'bridge closed' };
    }
    this.received.push(req);
    return this.responder(req);
  }

  async close(): Promise<void> {
    this.closed = true;
  }
}
