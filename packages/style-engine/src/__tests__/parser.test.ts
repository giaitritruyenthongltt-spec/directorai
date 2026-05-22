import { describe, it, expect } from 'vitest';
import { parseStyle, serializeStyle, mergeStyles } from '../parser.js';
import { BUILTIN_STYLES, getBuiltinStyle, listBuiltinStyles } from '../builtins.js';

describe('parseStyle', () => {
  it('parses minimal valid style', () => {
    const yaml = 'name: My Style\n';
    const s = parseStyle(yaml);
    expect(s.name).toBe('My Style');
    expect(s.pacing.body.cutsPerSec).toBe(0.8);
  });

  it('rejects invalid YAML', () => {
    expect(() => parseStyle(':::: not valid')).toThrow();
  });

  it('rejects missing name', () => {
    expect(() => parseStyle('description: foo\n')).toThrow();
  });

  it('round-trips through serialize', () => {
    const orig = getBuiltinStyle('vlog');
    const yaml = serializeStyle(orig);
    const parsed = parseStyle(yaml);
    expect(parsed.name).toBe(orig.name);
    expect(parsed.pacing.body.cutsPerSec).toBe(orig.pacing.body.cutsPerSec);
  });

  it('mergeStyles applies overrides', () => {
    const merged = mergeStyles(getBuiltinStyle('vlog'), { name: 'Custom Vlog' });
    expect(merged.name).toBe('Custom Vlog');
  });
});

describe('builtins', () => {
  it('exposes 5 styles', () => {
    expect(listBuiltinStyles().length).toBe(5);
  });

  it('all builtins are valid (pass schema)', () => {
    for (const [name, style] of Object.entries(BUILTIN_STYLES)) {
      const yaml = serializeStyle(style);
      expect(() => parseStyle(yaml), `style ${name}`).not.toThrow();
    }
  });

  it('throws on unknown style name', () => {
    expect(() => getBuiltinStyle('nope')).toThrow();
  });
});
