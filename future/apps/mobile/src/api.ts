/**
 * P5.08a–c — Mobile companion API layer.
 *
 * The mobile app is platform-neutral logic that runs inside the RN
 * shell (owner-completed scaffolding via `npx create-expo-app`).
 * This module is everything React Native screens import to talk to
 * a DirectorAI server:
 *
 *   - login(serverUrl, token) → SessionContext
 *   - getProjectSnapshot(ctx) → P5.08b read-only view payload
 *   - editStyle(ctx, name, yaml) → P5.08c YAML edit
 *   - previewStyle(ctx, name, yaml) → P5.08c dry-run round-trip
 *
 * All transport via `fetch`, no SDK pull. The shell (iOS/Android)
 * just imports + renders.
 */

export interface SessionContext {
  readonly serverUrl: string;
  readonly token: string;
  readonly fetcher?: typeof fetch;
}

export interface ProjectSnapshot {
  projectName: string;
  activeSequenceName: string | null;
  styleCount: number;
  lastSyncedAt: number;
}

async function callRpc<T>(ctx: SessionContext, method: string, params?: unknown): Promise<T> {
  const f = ctx.fetcher ?? fetch;
  const res = await f(`${ctx.serverUrl}/rpc`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${ctx.token}`,
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: Date.now(), method, params }),
  });
  if (!res.ok) {
    throw new Error(`mobile RPC ${method} failed: ${res.status}`);
  }
  const body = (await res.json()) as { result?: T; error?: { message: string } };
  if (body.error) throw new Error(body.error.message);
  return body.result as T;
}

export async function login(
  serverUrl: string,
  token: string,
  fetcher?: typeof fetch
): Promise<SessionContext> {
  const ctx: SessionContext = { serverUrl, token, fetcher };
  // Sanity ping
  await callRpc<{ ok: boolean }>(ctx, 'project.get');
  return ctx;
}

export async function getProjectSnapshot(ctx: SessionContext): Promise<ProjectSnapshot> {
  const proj = await callRpc<{ metadata: { name?: string } }>(ctx, 'project.get');
  const seq = await callRpc<{ name?: string } | null>(ctx, 'project.getActiveSequence');
  const styles = await callRpc<{ styles: string[] }>(ctx, 'style.list');
  return {
    projectName: proj.metadata.name ?? 'Untitled',
    activeSequenceName: seq?.name ?? null,
    styleCount: styles.styles.length,
    lastSyncedAt: Date.now(),
  };
}

export interface PreviewResult {
  steps: number;
  estimatedDurationSec: number;
  report: string;
}

export function editStyle(
  ctx: SessionContext,
  name: string,
  yaml: string
): Promise<{ ok: boolean }> {
  return callRpc(ctx, 'style.save', { name, yaml });
}

export function previewStyle(
  ctx: SessionContext,
  yaml: string,
  contextJson: unknown
): Promise<PreviewResult> {
  return callRpc(ctx, 'style.dryRun', { style: { yaml }, context: contextJson });
}
