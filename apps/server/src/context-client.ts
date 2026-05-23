/**
 * HTTP client for the Python context-engine service.
 * Used by the context.* MCP tools to dispatch ingest / search work.
 */

export interface ContextClientOptions {
  baseUrl: string;
  timeoutMs?: number;
}

export interface IngestRequest {
  media_path: string;
  enable_transcribe?: boolean;
  enable_scene?: boolean;
  enable_beat?: boolean;
  enable_vision?: boolean;
}

export interface SearchRequest {
  query: string;
  top_k?: number;
  media_path?: string;
  kind?: 'transcript' | 'vision' | 'scene';
}

const DEFAULT_TIMEOUT_MS = 120_000;

export class ContextClient {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor(opts: ContextClientOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/$/, '');
    this.timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), this.timeoutMs);
    try {
      const r = await fetch(`${this.baseUrl}${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });
      if (!r.ok) {
        const text = await r.text().catch(() => '');
        throw new Error(`context-engine ${path} ${r.status}: ${text || r.statusText}`);
      }
      return (await r.json()) as T;
    } finally {
      clearTimeout(timer);
    }
  }

  private async get<T>(path: string): Promise<T> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), this.timeoutMs);
    try {
      const r = await fetch(`${this.baseUrl}${path}`, { signal: ctrl.signal });
      if (!r.ok) throw new Error(`context-engine ${path} ${r.status}: ${r.statusText}`);
      return (await r.json()) as T;
    } finally {
      clearTimeout(timer);
    }
  }

  ingest(input: IngestRequest): Promise<unknown> {
    return this.post('/ingest', input);
  }

  transcribe(media_path: string, language?: string): Promise<unknown> {
    return this.post('/transcribe', { media_path, language });
  }

  findScenes(media_path: string, threshold?: number): Promise<unknown> {
    return this.post('/scenes', { media_path, threshold });
  }

  findBeats(media_path: string): Promise<unknown> {
    return this.post('/beats', { media_path });
  }

  analyzeVisual(media_path: string, sample_interval_sec?: number): Promise<unknown> {
    return this.post('/vision', { media_path, sample_interval_sec });
  }

  search(req: SearchRequest): Promise<unknown> {
    return this.post('/embeddings/search', req);
  }

  health(): Promise<{ status: string; version: string }> {
    return this.get<{ status: string; version: string }>('/health');
  }
}
