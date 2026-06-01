/**
 * P5.06b — Workspace + style-sync store (in-memory; Postgres later).
 *
 * Style sync is "push the latest version, last-write-wins, keep
 * history". A style is identified by workspace + name; each push
 * appends to the history array. Conflict resolution: the newer
 * timestamp wins (server clock), with the loser preserved in
 * history.
 */
import type { Member, Workspace } from './schema.js';

export interface SyncedStyle {
  workspaceId: string;
  name: string;
  /** Raw YAML content. */
  yaml: string;
  /** Last writer's email. */
  authorEmail: string;
  /** Server clock — used as the LWW timestamp. */
  serverTs: number;
  /** Optional client-provided revision for optimistic UI. */
  clientRev?: number;
}

export interface ITeamsStore {
  saveWorkspace(ws: Workspace): Promise<void>;
  getWorkspace(id: string): Promise<Workspace | null>;
  listWorkspaces(): Promise<readonly Workspace[]>;
  listForEmail(email: string): Promise<readonly Workspace[]>;

  saveMember(m: Member): Promise<void>;
  listMembers(workspaceId: string): Promise<readonly Member[]>;
  removeMember(workspaceId: string, email: string): Promise<void>;

  pushStyle(s: SyncedStyle): Promise<{ accepted: boolean; current: SyncedStyle }>;
  getStyle(workspaceId: string, name: string): Promise<SyncedStyle | null>;
  listStyles(workspaceId: string): Promise<readonly SyncedStyle[]>;
  styleHistory(workspaceId: string, name: string): Promise<readonly SyncedStyle[]>;
}

export class InMemoryTeamsStore implements ITeamsStore {
  private workspaces = new Map<string, Workspace>();
  private members = new Map<string, Member[]>();
  private styles = new Map<string, SyncedStyle>();
  private history = new Map<string, SyncedStyle[]>();

  private styleKey(workspaceId: string, name: string): string {
    return `${workspaceId}::${name}`;
  }

  async saveWorkspace(ws: Workspace): Promise<void> {
    this.workspaces.set(ws.id, ws);
  }
  async getWorkspace(id: string): Promise<Workspace | null> {
    return this.workspaces.get(id) ?? null;
  }
  async listWorkspaces(): Promise<readonly Workspace[]> {
    return [...this.workspaces.values()];
  }
  async listForEmail(email: string): Promise<readonly Workspace[]> {
    const e = email.toLowerCase();
    const out: Workspace[] = [];
    for (const ws of this.workspaces.values()) {
      if (ws.ownerEmail.toLowerCase() === e) {
        out.push(ws);
        continue;
      }
      const mems = this.members.get(ws.id) ?? [];
      if (mems.some((m) => m.email.toLowerCase() === e)) out.push(ws);
    }
    return out;
  }

  async saveMember(m: Member): Promise<void> {
    const list = this.members.get(m.workspaceId) ?? [];
    const next = [...list.filter((x) => x.email.toLowerCase() !== m.email.toLowerCase()), m];
    this.members.set(m.workspaceId, next);
  }
  async listMembers(workspaceId: string): Promise<readonly Member[]> {
    return this.members.get(workspaceId) ?? [];
  }
  async removeMember(workspaceId: string, email: string): Promise<void> {
    const list = this.members.get(workspaceId) ?? [];
    this.members.set(
      workspaceId,
      list.filter((m) => m.email.toLowerCase() !== email.toLowerCase())
    );
  }

  async pushStyle(s: SyncedStyle): Promise<{ accepted: boolean; current: SyncedStyle }> {
    const key = this.styleKey(s.workspaceId, s.name);
    const existing = this.styles.get(key);
    // last-write-wins by serverTs
    if (existing && existing.serverTs > s.serverTs) {
      const hist = this.history.get(key) ?? [];
      this.history.set(key, [...hist, s]);
      return { accepted: false, current: existing };
    }
    if (existing) {
      const hist = this.history.get(key) ?? [];
      this.history.set(key, [...hist, existing]);
    }
    this.styles.set(key, s);
    return { accepted: true, current: s };
  }
  async getStyle(workspaceId: string, name: string): Promise<SyncedStyle | null> {
    return this.styles.get(this.styleKey(workspaceId, name)) ?? null;
  }
  async listStyles(workspaceId: string): Promise<readonly SyncedStyle[]> {
    return Array.from(this.styles.values()).filter((s) => s.workspaceId === workspaceId);
  }
  async styleHistory(workspaceId: string, name: string): Promise<readonly SyncedStyle[]> {
    return this.history.get(this.styleKey(workspaceId, name)) ?? [];
  }
}
