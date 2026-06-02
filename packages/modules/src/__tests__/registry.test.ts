import { describe, it, expect } from 'vitest';
import {
  MODULE_REGISTRY,
  getModule,
  listModuleInfos,
  buildGoalFromModules,
  moduleInfo,
  runModules,
  NERF_TEMPLATES,
  getTemplate,
  type EditModuleDef,
} from '../index.js';

describe('module registry', () => {
  it('có đủ module Tầng 1 verified', () => {
    const ids = MODULE_REGISTRY.map((m) => m.id);
    for (const id of ['filter_bad', 'trim', 'reorder', 'rename']) {
      expect(ids).toContain(id);
      expect(getModule(id)?.feasibility).toBe('verified');
      expect(getModule(id)?.enabled).toBe(true);
    }
  });

  it('transition + color là beta, enabled=false', () => {
    expect(getModule('transition')?.feasibility).toBe('beta');
    expect(getModule('transition')?.enabled).toBe(false);
    expect(getModule('color_grade')?.enabled).toBe(false);
  });

  it('moduleInfo bỏ hàm, giữ metadata', () => {
    const info = moduleInfo(getModule('filter_bad')!);
    expect(info.id).toBe('filter_bad');
    expect((info as unknown as { signals?: unknown }).signals).toBeUndefined();
    expect(info.help.lines.length).toBeGreaterThan(0);
  });

  it('listModuleInfos trả info cho mọi module', () => {
    expect(listModuleInfos().length).toBe(MODULE_REGISTRY.length);
  });

  it('buildGoalFromModules ghép hint module enabled + extra', () => {
    const goal = buildGoalFromModules(['filter_bad', 'rename'], 'làm 45s');
    expect(goal).toContain('Ẩn');
    expect(goal).toContain('Đổi tên');
    expect(goal).toContain('làm 45s');
  });

  it('buildGoalFromModules bỏ qua module disabled (transition)', () => {
    const goal = buildGoalFromModules(['transition']);
    expect(goal).toBe('');
  });

  it('runModules: module metadata-only → steps rỗng, không lỗi', async () => {
    const { steps, results } = await runModules([getModule('filter_bad')!], {
      clipPaths: ['a.mp4'],
    });
    expect(steps).toEqual([]);
    expect(results[0]!.ran.signals).toBe(false);
  });

  it('runModules: module có hành vi → gộp + đánh số order', async () => {
    const fake: EditModuleDef = {
      id: 'fake',
      category: 'cleanup',
      name: 'fake',
      icon: 'x',
      feasibility: 'verified',
      enabled: true,
      goalHint: '',
      help: { title: 't', lines: ['l'] },
      signals: async () => ({ candidates: [{ clipPath: 'a.mp4', suspectScore: 1, reason: 'r' }] }),
      judge: async () => ({
        steps: [
          {
            order: 1,
            action: 'disable',
            target_path: 'a.mp4',
            params: {},
            reason: 'r',
            reversible: true,
          },
        ],
      }),
      execute: (_c, d) => [...d.steps],
    };
    const { steps } = await runModules([fake, fake], { clipPaths: ['a.mp4'] });
    expect(steps.length).toBe(2);
    expect(steps[0]!.order).toBe(1);
    expect(steps[1]!.order).toBe(2);
  });
});

describe('templates (MOD-7)', () => {
  it('có template Nerf built-in', () => {
    expect(NERF_TEMPLATES.length).toBeGreaterThanOrEqual(3);
    expect(getTemplate('action_fast')?.builtin).toBe(true);
  });

  it('moduleIds của template đều tồn tại trong registry', () => {
    const ids = new Set(MODULE_REGISTRY.map((m) => m.id));
    for (const t of NERF_TEMPLATES) {
      for (const mid of t.moduleIds) expect(ids.has(mid)).toBe(true);
      expect(t.goal.length).toBeGreaterThan(0);
    }
  });
});
