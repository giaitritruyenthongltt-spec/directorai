import { describe, it, expect } from 'vitest';
import { AppConfigSchema } from '../schema.js';

describe('AppConfigSchema', () => {
  it('parses with empty input using defaults', () => {
    const result = AppConfigSchema.parse({});
    expect(result.env).toBe('development');
    expect(result.server.port).toBe(7777);
    expect(result.llm.model).toBe('claude-opus-4-7');
  });

  it('rejects invalid port', () => {
    const result = AppConfigSchema.safeParse({ server: { port: 999999 } });
    expect(result.success).toBe(false);
  });

  it('accepts overrides', () => {
    const result = AppConfigSchema.parse({
      env: 'production',
      logLevel: 'warn',
      server: { port: 9000 },
    });
    expect(result.env).toBe('production');
    expect(result.logLevel).toBe('warn');
    expect(result.server.port).toBe(9000);
  });
});
