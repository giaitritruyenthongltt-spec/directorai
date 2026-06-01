import { describe, it, expect } from 'vitest';
import { hasPermission, InMemoryTeamsStore, type Member, type Workspace } from '../index.js';

const ws: Workspace = {
  id: '00000000-0000-4000-8000-000000000001',
  slug: 'studio-a',
  name: 'Studio A',
  ownerEmail: 'owner@x.com',
  createdAt: '2026-06-01T00:00:00.000Z',
};

const mem = (email: string, role: 'viewer' | 'editor' | 'admin'): Member => ({
  id: '00000000-0000-4000-8000-000000000002',
  workspaceId: ws.id,
  email,
  role,
  joinedAt: '2026-06-01T00:00:00.000Z',
});

describe('permissions (P5.06c)', () => {
  it('viewer only reads', () => {
    expect(hasPermission('viewer', 'read')).toBe(true);
    expect(hasPermission('viewer', 'apply')).toBe(false);
    expect(hasPermission('viewer', 'invite')).toBe(false);
  });
  it('editor can apply + edit', () => {
    expect(hasPermission('editor', 'apply')).toBe(true);
    expect(hasPermission('editor', 'edit')).toBe(true);
    expect(hasPermission('editor', 'remove')).toBe(false);
  });
  it('admin gets the lot', () => {
    expect(hasPermission('admin', 'invite')).toBe(true);
    expect(hasPermission('admin', 'remove')).toBe(true);
    expect(hasPermission('admin', 'delete-workspace')).toBe(true);
  });
});

describe('InMemoryTeamsStore (P5.06a + P5.06b)', () => {
  it('save + list workspaces', async () => {
    const s = new InMemoryTeamsStore();
    await s.saveWorkspace(ws);
    expect((await s.listWorkspaces()).length).toBe(1);
    expect(await s.getWorkspace(ws.id)).toEqual(ws);
  });

  it('listForEmail includes owner + members', async () => {
    const s = new InMemoryTeamsStore();
    await s.saveWorkspace(ws);
    await s.saveMember(mem('member@x.com', 'editor'));
    expect((await s.listForEmail('owner@x.com')).length).toBe(1);
    expect((await s.listForEmail('member@x.com')).length).toBe(1);
    expect((await s.listForEmail('rando@x.com')).length).toBe(0);
  });

  it('removeMember works case-insensitively', async () => {
    const s = new InMemoryTeamsStore();
    await s.saveWorkspace(ws);
    await s.saveMember(mem('Hi@X.com', 'viewer'));
    await s.removeMember(ws.id, 'HI@x.com');
    expect((await s.listMembers(ws.id)).length).toBe(0);
  });

  it('pushStyle accepts the first write', async () => {
    const s = new InMemoryTeamsStore();
    const res = await s.pushStyle({
      workspaceId: ws.id,
      name: 'vlog',
      yaml: 'name: vlog\n',
      authorEmail: 'owner@x.com',
      serverTs: 100,
    });
    expect(res.accepted).toBe(true);
  });

  it('pushStyle last-write-wins by serverTs', async () => {
    const s = new InMemoryTeamsStore();
    await s.pushStyle({
      workspaceId: ws.id,
      name: 'vlog',
      yaml: 'v: 1',
      authorEmail: 'a@x.com',
      serverTs: 100,
    });
    const stale = await s.pushStyle({
      workspaceId: ws.id,
      name: 'vlog',
      yaml: 'v: 0',
      authorEmail: 'b@x.com',
      serverTs: 50, // older
    });
    expect(stale.accepted).toBe(false);
    expect((await s.getStyle(ws.id, 'vlog'))?.yaml).toBe('v: 1');
    expect((await s.styleHistory(ws.id, 'vlog')).length).toBe(1); // loser kept
  });

  it('listStyles scopes by workspace', async () => {
    const s = new InMemoryTeamsStore();
    await s.pushStyle({
      workspaceId: ws.id,
      name: 'a',
      yaml: 'x',
      authorEmail: 'o@x.com',
      serverTs: 1,
    });
    await s.pushStyle({
      workspaceId: 'other',
      name: 'b',
      yaml: 'y',
      authorEmail: 'o@x.com',
      serverTs: 1,
    });
    expect((await s.listStyles(ws.id)).length).toBe(1);
  });
});
